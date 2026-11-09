"""Human-reviewed anomaly labels, auditable datasets, experiments, and forecast backtests.

Set MODEL_DATA_PATH to a durable SQLite file path in production. The default is
intended only for local development; ephemeral hosts must not claim durability.
"""
from __future__ import annotations

import csv
import hashlib
import json
import os
import sqlite3
import tempfile
from contextlib import contextmanager
from datetime import datetime, timedelta, timezone
from pathlib import Path
from typing import Any

import numpy as np
from sklearn.ensemble import HistGradientBoostingClassifier
from sklearn.impute import SimpleImputer
from sklearn.linear_model import LogisticRegression
from sklearn.metrics import brier_score_loss, log_loss, precision_recall_fscore_support, roc_auc_score, average_precision_score
from sklearn.pipeline import make_pipeline
from sklearn.isotonic import IsotonicRegression
from sklearn.preprocessing import StandardScaler
import joblib


def utcnow() -> str:
    return datetime.now(timezone.utc).isoformat()


def db_path() -> Path:
    path = Path(os.getenv("MODEL_DATA_PATH", "data/model-quality.sqlite3"))
    path.parent.mkdir(parents=True, exist_ok=True)
    return path


def connect(path: str | Path | None = None) -> sqlite3.Connection:
    db = sqlite3.connect(str(path or db_path()), timeout=20)
    db.row_factory = sqlite3.Row
    db.execute("PRAGMA journal_mode=WAL")
    db.execute("PRAGMA foreign_keys=ON")
    db.executescript("""
      CREATE TABLE IF NOT EXISTS schema_migrations (
        version INTEGER PRIMARY KEY, applied_at TEXT NOT NULL
      );
      CREATE TABLE IF NOT EXISTS labels (
        id TEXT PRIMARY KEY, tenant_id TEXT NOT NULL, transaction_id TEXT NOT NULL,
        transaction_hash TEXT NOT NULL, event_time TEXT NOT NULL, amount REAL,
        currency TEXT NOT NULL, category TEXT, description TEXT,
        label INTEGER NOT NULL CHECK(label IN (0,1)), rationale TEXT NOT NULL,
        evidence_ref TEXT NOT NULL, reviewer TEXT NOT NULL, reviewed_at TEXT NOT NULL,
        UNIQUE(tenant_id, transaction_id)
      );
      CREATE TABLE IF NOT EXISTS forecast_snapshots (
        id TEXT PRIMARY KEY, tenant_id TEXT NOT NULL, as_of TEXT NOT NULL,
        currency TEXT NOT NULL, current_balance REAL NOT NULL, model_version TEXT NOT NULL,
        predictions TEXT NOT NULL
      );
      CREATE TABLE IF NOT EXISTS balance_observations (
        tenant_id TEXT NOT NULL, observed_at TEXT NOT NULL, currency TEXT NOT NULL,
        balance REAL NOT NULL, source TEXT NOT NULL, PRIMARY KEY(tenant_id, observed_at, currency)
      );
      CREATE TABLE IF NOT EXISTS forecast_matches (
        snapshot_id TEXT NOT NULL, horizon_days INTEGER NOT NULL, actual_at TEXT NOT NULL,
        actual_balance REAL NOT NULL, PRIMARY KEY(snapshot_id, horizon_days),
        FOREIGN KEY(snapshot_id) REFERENCES forecast_snapshots(id)
      );
      CREATE TABLE IF NOT EXISTS label_history (
        event_id TEXT PRIMARY KEY, tenant_id TEXT NOT NULL, transaction_id TEXT NOT NULL,
        transaction_hash TEXT NOT NULL, event_time TEXT NOT NULL, label INTEGER NOT NULL,
        rationale TEXT NOT NULL, evidence_ref TEXT NOT NULL, reviewer TEXT NOT NULL,
        reviewed_at TEXT NOT NULL, revision INTEGER NOT NULL, previous_event_id TEXT
      );
      CREATE TABLE IF NOT EXISTS review_triage (
        tenant_id TEXT NOT NULL, transaction_id TEXT NOT NULL, transaction_hash TEXT NOT NULL,
        transaction_json TEXT NOT NULL, status TEXT NOT NULL CHECK(status='needs_investigation'),
        rationale TEXT NOT NULL, reviewer TEXT NOT NULL, reviewed_at TEXT NOT NULL,
        revision INTEGER NOT NULL, PRIMARY KEY(tenant_id, transaction_id)
      );
      CREATE TABLE IF NOT EXISTS review_triage_history (
        event_id TEXT PRIMARY KEY, tenant_id TEXT NOT NULL, transaction_id TEXT NOT NULL,
        transaction_hash TEXT NOT NULL, status TEXT NOT NULL CHECK(status='needs_investigation'),
        rationale TEXT NOT NULL, reviewer TEXT NOT NULL, reviewed_at TEXT NOT NULL,
        revision INTEGER NOT NULL, previous_event_id TEXT
      );
      CREATE TABLE IF NOT EXISTS experiments (
        id TEXT PRIMARY KEY, tenant_id TEXT NOT NULL, created_at TEXT NOT NULL, dataset_version TEXT NOT NULL,
        model_version TEXT NOT NULL, report TEXT NOT NULL
      );
    """)
    experiment_columns = {row["name"] for row in db.execute("PRAGMA table_info(experiments)")}
    if "tenant_id" not in experiment_columns:
        db.execute("ALTER TABLE experiments ADD COLUMN tenant_id TEXT NOT NULL DEFAULT ''")
    db.execute("INSERT OR IGNORE INTO schema_migrations(version, applied_at) VALUES(1, ?)", (utcnow(),))
    db.execute("INSERT OR IGNORE INTO schema_migrations(version, applied_at) VALUES(2, ?)", (utcnow(),))
    return db


@contextmanager
def db_session(path: str | Path | None = None):
    db = connect(path)
    try:
        yield db
        db.commit()
    except Exception:
        db.rollback()
        raise
    finally:
        db.close()


def clean_tx(tx: dict[str, Any]) -> tuple[str, str, float | None, str, str, str, str]:
    source_id = str(tx.get("id") or "").strip()
    date = str(tx.get("date") or "").strip()
    currency = str(tx.get("currency") or "").upper()
    if not source_id or len(source_id) > 200 or not date or len(date) > 64 or len(currency) != 3:
        raise ValueError("Transaction requires a source ID, timestamp, and ISO currency")
    try:
        timestamp = datetime.fromisoformat(date.replace("Z", "+00:00"))
        if timestamp.tzinfo is None: timestamp = timestamp.replace(tzinfo=timezone.utc)
        date = timestamp.astimezone(timezone.utc).isoformat()
    except ValueError as exc:
        raise ValueError("Transaction timestamp must be ISO 8601") from exc
    event_code = str(tx.get("transaction_event_code") or "")
    txid = f"{source_id}|{int(timestamp.timestamp() * 1000)}|{event_code}"
    amount = tx.get("amount")
    amount = float(amount) if amount is not None else None
    if amount is not None and not np.isfinite(amount):
        raise ValueError("Transaction amount must be finite")
    category = str(tx.get("category") or "")[:100]
    description = str(tx.get("description") or "")[:500]
    evidence = {k: tx.get(k) for k in ("id", "date", "amount", "currency", "type", "status", "category", "description", "transaction_event_code")}
    digest = hashlib.sha256(json.dumps(evidence, sort_keys=True, separators=(",", ":")).encode()).hexdigest()
    return txid, date, amount, currency, category, description, digest


def add_label(payload: dict[str, Any], *, tenant: str, reviewer: str, path: str | Path | None = None) -> dict:
    txid, date, amount, currency, category, description, digest = clean_tx(payload["transaction"])
    label = payload.get("label")
    rationale = str(payload.get("rationale") or "").strip()
    if label not in (0, 1) or len(rationale) < 12 or len(rationale) > 2000:
        raise ValueError("Choose expected (0) or anomalous (1) and provide at least 12 characters of rationale")
    reviewed = utcnow()
    evidence_ref = f"sha256:{digest}"
    row_id = hashlib.sha256(f"{tenant}:{txid}".encode()).hexdigest()
    with db_session(path) as db:
        prior = db.execute("SELECT event_id FROM label_history WHERE tenant_id=? AND transaction_id=? ORDER BY reviewed_at DESC LIMIT 1", (tenant, txid)).fetchone()
        revision = db.execute("SELECT COALESCE(MAX(revision),0)+1 FROM label_history WHERE tenant_id=? AND transaction_id=?", (tenant, txid)).fetchone()[0]
        event_id = hashlib.sha256(f"{tenant}:{txid}:{reviewed}:{revision}".encode()).hexdigest()
        db.execute("INSERT INTO label_history VALUES(?,?,?,?,?,?,?,?,?,?,?,?)", (event_id, tenant, txid, digest, date, int(label), rationale, evidence_ref, reviewer[:200], reviewed, revision, prior["event_id"] if prior else None))
        db.execute("""INSERT INTO labels VALUES(?,?,?,?,?,?,?,?,?,?,?,?,?,?)
          ON CONFLICT(tenant_id, transaction_id) DO UPDATE SET
          transaction_hash=excluded.transaction_hash,event_time=excluded.event_time,amount=excluded.amount,
          currency=excluded.currency,category=excluded.category,description=excluded.description,
          label=excluded.label,rationale=excluded.rationale,evidence_ref=excluded.evidence_ref,
          reviewer=excluded.reviewer,reviewed_at=excluded.reviewed_at""",
          (row_id, tenant, txid, digest, date, amount, currency, category, description, int(label), rationale, evidence_ref, reviewer[:200], reviewed))
        # A human-confirmed expected/unusual outcome resolves the current triage
        # item. The immutable triage event remains in review_triage_history.
        db.execute("DELETE FROM review_triage WHERE tenant_id=? AND transaction_id=?", (tenant, txid))
    return {"transaction_id": txid, "label": int(label), "reviewer": reviewer, "reviewed_at": reviewed, "evidence_ref": evidence_ref, "revision": revision, "history_event_id": event_id}


def label_history(tenant: str, path: str | Path | None = None) -> list[dict]:
    with db_session(path) as db:
        return [dict(row) for row in db.execute("SELECT * FROM label_history WHERE tenant_id=? ORDER BY reviewed_at DESC", (tenant,))]


def triage_history(tenant: str, path: str | Path | None = None) -> list[dict]:
    with db_session(path) as db:
        return [dict(row) for row in db.execute("SELECT * FROM review_triage_history WHERE tenant_id=? ORDER BY reviewed_at DESC", (tenant,))]


def mark_needs_investigation(payload: dict[str, Any], *, tenant: str, reviewer: str, path: str | Path | None = None) -> dict:
    """Persist an uncertainty decision separately; it never enters model labels."""
    txid, date, amount, currency, category, description, digest = clean_tx(payload["transaction"])
    rationale = str(payload.get("rationale") or "").strip()
    if payload.get("status") != "needs_investigation" or len(rationale) < 12 or len(rationale) > 2000:
        raise ValueError("Needs-investigation status requires a rationale of 12 to 2000 characters")
    transaction = payload["transaction"]
    reviewed = utcnow()
    transaction_json = json.dumps({"id": transaction.get("id"), "date": date, "amount": amount, "currency": currency, "category": category, "description": description, "status": transaction.get("status"), "source": transaction.get("source")}, sort_keys=True)
    with db_session(path) as db:
        previous = db.execute("SELECT event_id FROM review_triage_history WHERE tenant_id=? AND transaction_id=? ORDER BY revision DESC LIMIT 1", (tenant, txid)).fetchone()
        revision = db.execute("SELECT COALESCE(MAX(revision),0)+1 FROM review_triage_history WHERE tenant_id=? AND transaction_id=?", (tenant, txid)).fetchone()[0]
        event_id = hashlib.sha256(f"{tenant}:{txid}:{reviewed}:{revision}".encode()).hexdigest()
        db.execute("INSERT INTO review_triage_history VALUES(?,?,?,?,?,?,?,?,?,?)", (event_id, tenant, txid, digest, "needs_investigation", rationale, reviewer[:200], reviewed, revision, previous["event_id"] if previous else None))
        db.execute("""INSERT INTO review_triage VALUES(?,?,?,?,?,?,?,?,?)
          ON CONFLICT(tenant_id, transaction_id) DO UPDATE SET transaction_hash=excluded.transaction_hash,
          transaction_json=excluded.transaction_json,status=excluded.status,rationale=excluded.rationale,
          reviewer=excluded.reviewer,reviewed_at=excluded.reviewed_at,revision=excluded.revision""",
          (tenant, txid, digest, transaction_json, "needs_investigation", rationale, reviewer[:200], reviewed, revision))
    return {"transaction_id": txid, "status": "needs_investigation", "reviewer": reviewer, "reviewed_at": reviewed, "evidence_ref": f"sha256:{digest}", "revision": revision, "history_event_id": event_id, "included_in_training": False}


def _rows(db: sqlite3.Connection, tenant: str) -> list[dict]:
    return [dict(r) for r in db.execute("SELECT * FROM labels WHERE tenant_id=? ORDER BY event_time, transaction_id", (tenant,))]


def dataset_report(tenant: str, path: str | Path | None = None) -> dict:
    with db_session(path) as db:
        rows = _rows(db, tenant)
    signatures = [r["transaction_hash"] for r in rows]
    times = sorted(r["event_time"] for r in rows)
    counts = {"negative": sum(r["label"] == 0 for r in rows), "positive": sum(r["label"] == 1 for r in rows)}
    fields = ("event_time", "amount", "currency", "category", "description", "rationale", "evidence_ref", "reviewer", "reviewed_at")
    missing = {f: sum(r.get(f) in (None, "") or (f == "category" and r.get(f) == "unknown") or (f == "description" and r.get(f) == "PayPal transaction") for r in rows) for f in fields}
    duplicate_hashes = len(signatures) - len(set(signatures))
    return {"dataset_version": hashlib.sha256("".join(r["transaction_hash"] + str(r["label"]) for r in rows).encode()).hexdigest()[:16],
            "sample_size": len(rows), "class_distribution": counts, "missing_values": missing,
            "duplicate_transaction_hashes": duplicate_hashes,
            "time_coverage": {"start": times[0] if times else None, "end": times[-1] if times else None},
            "status": "READY_FOR_EXPERIMENT" if min(counts.values()) >= 10 and len(rows) >= 100 and duplicate_hashes == 0 else "NOT EVALUABLE",
            "minimum_evidence": "100 reviewed transactions and at least 10 examples from each class; independent chronological holdout required"}


def _features(rows: list[dict]) -> np.ndarray:
    dates = [datetime.fromisoformat(r["event_time"].replace("Z", "+00:00")) for r in rows]
    prior_amounts: dict[str, list[tuple[datetime, float]]] = {}
    matrix = []
    for r, dt in zip(rows, dates):
        amount = abs(float(r["amount"] or 0))
        category = str(r["category"] or "unknown").lower()
        history = [item for item in prior_amounts.setdefault(category, []) if timedelta(0) < dt - item[0] <= timedelta(days=30)]
        prior_amounts[category] = history
        history_amounts = [value for _, value in history]
        med = float(np.median(history_amounts)) if history else amount
        mad = float(np.median(np.abs(np.asarray(history_amounts) - med))) if history else 0.0
        scale = max(1.4826 * mad, float(np.std(history_amounts)) if len(history) > 1 else 0.0, 1.0)
        category_bucket = int(hashlib.sha256(category.encode()).hexdigest()[:4], 16) % 16
        currency_bucket = int(hashlib.sha256(str(r["currency"]).encode()).hexdigest()[:4], 16) % 8
        row = [np.log1p(amount), (amount - med) / scale, np.log1p(len(history)), np.sin(dt.hour * 2 * np.pi / 24), np.cos(dt.hour * 2 * np.pi / 24), np.sin(dt.weekday() * 2 * np.pi / 7), np.cos(dt.weekday() * 2 * np.pi / 7), dt.day / 31, dt.month / 12]
        row += [1.0 if category_bucket == index else 0.0 for index in range(16)]
        row += [1.0 if currency_bucket == index else 0.0 for index in range(8)]
        matrix.append(row)
        history.append((dt, amount))
    return np.asarray(matrix, dtype=float)


def experiment(tenant: str, path: str | Path | None = None) -> dict:
    with db_session(path) as db:
        rows = _rows(db, tenant)
    quality = dataset_report(tenant, path)
    def not_evaluable(reason: str) -> dict:
        return {"status": "NOT EVALUABLE", "created_at": utcnow(), "dataset": quality,
                "sample_size": quality["sample_size"], "dataset_version": quality["dataset_version"],
                "evaluation_period": {"start": quality["time_coverage"]["start"], "end": quality["time_coverage"]["end"]},
                "model_version": None, "reason": reason}
    if quality["duplicate_transaction_hashes"]:
        return not_evaluable("Resolve duplicate source evidence rows before model training; duplicates can bias held-out evaluation.")
    if quality["status"] != "READY_FOR_EXPERIMENT":
        return not_evaluable(quality["minimum_evidence"])
    y = np.asarray([r["label"] for r in rows], dtype=int)
    X = _features(rows)
    # Strict issue-time chronology: training, calibration fit, validation selection, untouched test.
    n = len(rows); a = int(n * .55); b = int(n * .70); c = int(n * .85)
    splits = {"train": y[:a], "calibration": y[a:b], "validation": y[b:c], "test": y[c:]}
    if a < 20 or min(len(part) for part in splits.values()) < 10 or any(np.bincount(part, minlength=2).min() < 5 for part in splits.values()):
        return not_evaluable("Each chronological train, calibration, validation, and untouched test period needs at least five examples of both classes.")
    candidates = {
        "logistic-regression": make_pipeline(SimpleImputer(strategy="median"), StandardScaler(), LogisticRegression(class_weight="balanced", max_iter=1000, random_state=42)),
        "hist-gradient-boosting": make_pipeline(SimpleImputer(strategy="median"), HistGradientBoostingClassifier(max_iter=100, learning_rate=0.08, l2_regularization=1.0, random_state=42))
    }
    validation_results = []
    fitted = {}

    def ece_score(labels, probabilities):
        ece = 0.0
        for bin_index in range(10):
            mask = (probabilities >= bin_index / 10) & (probabilities < (bin_index + 1) / 10 if bin_index < 9 else probabilities <= 1)
            if np.any(mask):
                ece += float(mask.mean()) * abs(float(probabilities[mask].mean()) - float(labels[mask].mean()))
        return float(ece)

    def brier(values, probabilities): return float(brier_score_loss(values, probabilities))
    def calibrate_fit(cal_method, cal_raw, y_cal):
        if cal_method == "uncalibrated": return None
        if cal_method == "platt":
            logits = np.log(np.clip(cal_raw, 1e-6, 1 - 1e-6) / np.clip(1 - cal_raw, 1e-6, 1))
            return LogisticRegression(C=1e6, max_iter=1000, random_state=42).fit(logits.reshape(-1, 1), y_cal)
        return IsotonicRegression(out_of_bounds="clip").fit(cal_raw, y_cal)

    def calibrate_apply(cal_method, calibration, raw):
        if cal_method == "uncalibrated": return raw
        if cal_method == "platt":
            logits = np.log(np.clip(raw, 1e-6, 1 - 1e-6) / np.clip(1 - raw, 1e-6, 1))
            return calibration.predict_proba(logits.reshape(-1, 1))[:, 1]
        return calibration.predict(raw)

    methods = ["uncalibrated", "platt"]
    if len(y[a:b]) >= 100 and np.bincount(y[a:b], minlength=2).min() >= 20:
        methods.append("isotonic")
    for name, model in candidates.items():
        model.fit(X[:a], y[:a])
        raw_cal = model.predict_proba(X[a:b])[:, 1]
        raw_val = model.predict_proba(X[b:c])[:, 1]
        for method in methods:
            calibration = calibrate_fit(method, raw_cal, y[a:b])
            probabilities = calibrate_apply(method, calibration, raw_val)
            validation_results.append({"model": name, "calibration": method, "validation_samples": len(probabilities), "brier": brier(y[b:c], probabilities), "log_loss": float(log_loss(y[b:c], np.c_[1 - probabilities, probabilities], labels=[0, 1])), "ece_equal_width_10": ece_score(y[b:c], probabilities)})
            fitted[(name, method)] = (model, calibration)
    # Selection uses only the independent validation period. Test labels are
    # not examined until the selected candidate is frozen.
    best = min(validation_results, key=lambda r: (r["brier"], r["log_loss"]))
    selected_model, selected_calibration = fitted[(best["model"], best["calibration"])]
    test_raw = selected_model.predict_proba(X[c:])[:, 1]
    test_prob = calibrate_apply(best["calibration"], selected_calibration, test_raw)
    test_predictions = (test_prob >= .5).astype(int)
    precision, recall, f1, _ = precision_recall_fscore_support(y[c:], test_predictions, average="binary", zero_division=0)
    baseline_probability = float(np.mean(y[:a]))
    baseline_probs = np.full(n - c, baseline_probability)
    best_version = hashlib.sha256(f"{quality['dataset_version']}:{best['model']}:{best['calibration']}:v1".encode()).hexdigest()[:16]
    artifact_dir = Path(path or db_path()).resolve().parent / "models"
    artifact_dir.mkdir(parents=True, exist_ok=True)
    artifact_name = hashlib.sha256(tenant.encode()).hexdigest()[:16] + "-" + best_version + ".joblib"
    artifact_path = artifact_dir / artifact_name
    with tempfile.NamedTemporaryFile(dir=artifact_dir, suffix=".tmp", delete=False) as temp:
        temporary_path = Path(temp.name)
    joblib.dump({"pipeline": selected_model, "calibration": selected_calibration, "calibration_method": best["calibration"], "model_name": best["model"], "model_version": best_version, "dataset_version": quality["dataset_version"], "feature_schema": "prior-only category amount baseline; hashed category/currency; cyclical timestamp v1"}, temporary_path)
    temporary_path.replace(artifact_path)
    evaluated_at = utcnow()
    model_brier = brier(y[c:], test_prob); baseline_brier = brier(y[c:], baseline_probs)
    model_log_loss = float(log_loss(y[c:], np.c_[1 - test_prob, test_prob], labels=[0, 1])); baseline_log_loss = float(log_loss(y[c:], np.c_[1 - baseline_probs, baseline_probs], labels=[0, 1]))
    test_metrics = {"sample_size": int(n - c), "evaluation_period": {"start": rows[c]["event_time"], "end": rows[-1]["event_time"]}, "last_evaluated_at": evaluated_at, "model_version": best_version, "dataset_version": quality["dataset_version"], "precision": float(precision), "recall": float(recall), "f1": float(f1), "roc_auc": float(roc_auc_score(y[c:], test_prob)) if len(np.unique(y[c:])) == 2 else None, "pr_auc": float(average_precision_score(y[c:], test_prob)) if len(np.unique(y[c:])) == 2 else None, "brier": model_brier, "brier_skill_vs_training_prevalence": float(1 - model_brier / baseline_brier) if baseline_brier > 0 else None, "baseline_brier": baseline_brier, "log_loss": model_log_loss, "baseline_log_loss": baseline_log_loss, "log_loss_skill_vs_training_prevalence": float(1 - model_log_loss / baseline_log_loss) if baseline_log_loss > 0 else None, "ece_equal_width_10": ece_score(y[c:], test_prob)}
    report = {"status": "EVALUATED", "created_at": evaluated_at, "evaluation_period": {"train_start": rows[0]["event_time"], "train_end": rows[a-1]["event_time"], "calibration_start": rows[a]["event_time"], "calibration_end": rows[b-1]["event_time"], "validation_start": rows[b]["event_time"], "validation_end": rows[c-1]["event_time"], "test_start": rows[c]["event_time"], "test_end": rows[-1]["event_time"]},
              "dataset": quality, "model_version": best_version, "model_artifact": artifact_name, "selected_on": "validation Brier, then validation log loss; test set untouched during selection", "split": {"method": "chronological 55/15/15/15: train/calibration/validation/test", "train_n": a, "calibration_n": b-a, "validation_n": c-b, "test_n": n-c}, "training_parameters": {"logistic-regression": {"class_weight": "balanced", "max_iter": 1000, "random_state": 42, "preprocessing": "training-fit median imputation and standard scaling"}, "hist-gradient-boosting": {"max_iter": 100, "learning_rate": 0.08, "l2_regularization": 1.0, "random_state": 42, "preprocessing": "training-fit median imputation"}, "feature_schema": "prior-only 30-day category amount baseline; log amount; prior count; hashed category/currency; cyclical timestamp"}, "validation_candidates": validation_results, "best_model": best, "test_metrics": test_metrics, "baseline": {"name": "training-period prevalence probability", "probability": baseline_probability, "test_brier": test_metrics["baseline_brier"]}, "calibration_methods": {"platt": "LogisticRegression C=1e6 fitted only on the chronological calibration period", "isotonic": "fit only when calibration split has at least 100 samples and 20 examples per class"}, "limitation": "Metrics describe this tenant's reviewed labels and do not establish generalization to other tenants or populations."}
    experiment_id = hashlib.sha256(f"{tenant}:{report['model_version']}".encode()).hexdigest()
    with db_session(path) as db:
        db.execute("INSERT OR REPLACE INTO experiments(id,tenant_id,created_at,dataset_version,model_version,report) VALUES(?,?,?,?,?,?)", (experiment_id, tenant, utcnow(), quality["dataset_version"], report["model_version"], json.dumps(report)))
    return report


def latest_experiment(tenant: str, path: str | Path | None = None) -> dict:
    with db_session(path) as db:
        row = db.execute("SELECT report FROM experiments WHERE tenant_id=? ORDER BY created_at DESC LIMIT 1", (tenant,)).fetchone()
    if row: return json.loads(row["report"])
    quality = dataset_report(tenant, path)
    return {"status": "NOT EVALUABLE", "created_at": utcnow(), "sample_size": quality["sample_size"], "dataset_version": quality["dataset_version"], "dataset": quality, "model_version": None, "evaluation_period": {"start": quality["time_coverage"]["start"], "end": quality["time_coverage"]["end"]}, "reason": "No experiment has been run for this dataset version."}


def score_review_labels(tenant: str, transactions: list[dict], path: str | Path | None = None) -> dict:
    if os.getenv("NODE_ENV") == "production" and not os.getenv("MODEL_DATA_PATH"):
        return {"active": False, "reason": "Durable model-quality storage is not configured."}
    report = latest_experiment(tenant, path)
    current_version = dataset_report(tenant, path)["dataset_version"]
    if not report or report.get("status") != "EVALUATED": return {"active": False, "reason": "No validated supervised model is available."}
    if report.get("dataset", {}).get("dataset_version") != current_version: return {"active": False, "reason": "Reviewed dataset changed after the experiment; rerun evaluation before using the stale model."}
    if (report.get("test_metrics") or {}).get("brier_skill_vs_training_prevalence") is None or report["test_metrics"]["brier_skill_vs_training_prevalence"] <= 0:
        return {"active": False, "reason": "Selected model did not beat the training-prevalence Brier baseline on untouched test data."}
    artifact = Path(path or db_path()).resolve().parent / "models" / report["model_artifact"]
    if not artifact.is_file(): return {"active": False, "reason": "Versioned model artifact is missing."}
    model = joblib.load(artifact)
    indexed = []
    for index, tx in enumerate(transactions):
        row = {"event_time": tx["date"], "amount": tx["amount"], "currency": tx["currency"], "category": tx.get("category") or "unknown"}
        indexed.append((index, row))
    indexed.sort(key=lambda pair: (pair[1]["event_time"], pair[0]))
    features = _features([row for _, row in indexed])
    raw = model["pipeline"].predict_proba(features)[:, 1]
    calibrated = raw
    if model["calibration_method"] == "platt":
        logits = np.log(np.clip(raw, 1e-6, 1 - 1e-6) / np.clip(1 - raw, 1e-6, 1))
        calibrated = model["calibration"].predict_proba(logits.reshape(-1, 1))[:, 1]
    elif model["calibration_method"] == "isotonic": calibrated = model["calibration"].predict(raw)
    probabilities = {index: float(score) for (index, _), score in zip(indexed, calibrated)}
    return {"active": True, "model_version": report["model_version"], "dataset_version": current_version, "threshold": 0.5,
            "scores": [{"index": index, "probability_unusual": score, "threshold_met": score >= .5} for index, score in probabilities.items()]}


def record_forecast_snapshot(payload: dict, *, tenant: str, path: str | Path | None = None) -> dict:
    if payload.get("forecast_status") != "available":
        return {"stored": False, "reason": "forecast is not a validated available output"}
    source = payload.get("source_balance") or {}
    predictions = payload.get("chart_data") or []
    if not source.get("currency") or source.get("amount") is None or not predictions:
        return {"stored": False, "reason": "forecast lacks an observed opening balance or horizon predictions"}
    as_of = str(payload.get("model_metadata", {}).get("generated_at") or utcnow())
    observed_at = str(source.get("observed_at") or as_of)
    snapshot_id = hashlib.sha256(f"{tenant}:{as_of[:10]}:{source['currency']}".encode()).hexdigest()
    with db_session(path) as db:
        db.execute("DELETE FROM balance_observations WHERE tenant_id=? AND currency=? AND substr(observed_at,1,10)=?", (tenant, source["currency"], observed_at[:10]))
        db.execute("INSERT OR IGNORE INTO forecast_snapshots VALUES(?,?,?,?,?,?,?)", (snapshot_id, tenant, as_of, source["currency"], float(source["amount"]), str(payload.get("model_metadata", {}).get("version", "unknown")), json.dumps(predictions)))
        db.execute("INSERT INTO balance_observations VALUES(?,?,?,?,?)", (tenant, observed_at, source["currency"], float(source["amount"]), str(source.get("source", "unknown"))))
        snapshots = db.execute("SELECT * FROM forecast_snapshots WHERE tenant_id=? AND currency=? ORDER BY as_of", (tenant, source["currency"])).fetchall()
        observations = db.execute("SELECT * FROM balance_observations WHERE tenant_id=? AND currency=? ORDER BY observed_at", (tenant, source["currency"])).fetchall()
        for snap in snapshots:
            forecast_date = datetime.fromisoformat(snap["as_of"].replace("Z", "+00:00"))
            chart = {int(p["day"]): p for p in json.loads(snap["predictions"]) if "day" in p and int(p["day"]) > 0}
            for horizon in (7, 14, 30):
                if horizon not in chart or db.execute("SELECT 1 FROM forecast_matches WHERE snapshot_id=? AND horizon_days=?", (snap["id"], horizon)).fetchone():
                    continue
                candidates = []
                for obs in observations:
                    dt = datetime.fromisoformat(obs["observed_at"].replace("Z", "+00:00"))
                    delta = abs((dt - forecast_date).total_seconds() / 86400 - horizon)
                    if delta <= 1.0: candidates.append((delta, obs))
                if candidates:
                    obs = min(candidates, key=lambda pair: pair[0])[1]
                    db.execute("INSERT OR IGNORE INTO forecast_matches VALUES(?,?,?,?)", (snap["id"], horizon, obs["observed_at"], obs["balance"]))
    return {"stored": True, "snapshot_id": snapshot_id, "model_version": str(payload.get("model_metadata", {}).get("version", "unknown"))}


def forecast_report(tenant: str, path: str | Path | None = None) -> dict:
    with db_session(path) as db:
        rows = db.execute("""SELECT s.*,m.horizon_days,m.actual_at,m.actual_balance FROM forecast_snapshots s
          JOIN forecast_matches m ON m.snapshot_id=s.id WHERE s.tenant_id=? ORDER BY s.as_of""", (tenant,)).fetchall()
    results = []
    evaluated_at = utcnow()
    for horizon in (7, 14, 30):
        sample = [r for r in rows if r["horizon_days"] == horizon]
        if len(sample) < 30:
            results.append({"horizon_days": horizon, "sample_size": len(sample), "evaluation_period": {"start": sample[0]["as_of"] if sample else None, "end": sample[-1]["as_of"] if sample else None}, "dataset_version": hashlib.sha256("".join(r["id"] for r in sample).encode()).hexdigest()[:16] if sample else None, "model_versions": sorted({r["model_version"] for r in sample}), "last_evaluated_at": evaluated_at, "status": "NOT EVALUABLE", "reason": "At least 30 chronologically matched forecast snapshots are required per horizon; repeated forecasts are correlated and not independent merchant samples."})
            continue
        actual = np.asarray([r["actual_balance"] for r in sample]); pred = np.asarray([next((float(p["median"]) for p in json.loads(r["predictions"]) if int(p["day"]) == horizon), np.nan) for r in sample]); lower = np.asarray([next((float(p["lower_bound"]) for p in json.loads(r["predictions"]) if int(p["day"]) == horizon), np.nan) for r in sample]); upper = np.asarray([next((float(p["upper_bound"]) for p in json.loads(r["predictions"]) if int(p["day"]) == horizon), np.nan) for r in sample]); lower90 = np.asarray([next((float(p.get("lower_bound_90", np.nan)) for p in json.loads(r["predictions"]) if int(p["day"]) == horizon), np.nan) for r in sample]); upper90 = np.asarray([next((float(p.get("upper_bound_90", np.nan)) for p in json.loads(r["predictions"]) if int(p["day"]) == horizon), np.nan) for r in sample]); naive = np.asarray([r["current_balance"] for r in sample]); denom = np.sum(np.abs(actual)); typical_balance = float(np.median(np.abs(actual)))
        wape = float(np.sum(np.abs(pred-actual))/denom) if denom else None
        bias = float(np.sum(pred-actual)/denom) if denom else None
        coverage70 = float(np.mean((actual>=lower)&(actual<=upper)))
        coverage90 = float(np.mean((actual>=lower90)&(actual<=upper90))) if np.isfinite(lower90).all() and np.isfinite(upper90).all() else None
        mae = float(np.mean(np.abs(pred-actual))); rmse = float(np.sqrt(np.mean((pred-actual)**2))); naive_mae = float(np.mean(np.abs(naive-actual))); naive_rmse = float(np.sqrt(np.mean((naive-actual)**2)))
        results.append({"horizon_days": horizon, "sample_size": len(sample), "evaluation_period": {"start": sample[0]["as_of"], "end": sample[-1]["as_of"]}, "dataset_version": hashlib.sha256("".join(r["id"] for r in sample).encode()).hexdigest()[:16], "model_versions": sorted({r["model_version"] for r in sample}), "last_evaluated_at": evaluated_at, "typical_balance": typical_balance, "mae": mae, "normalized_mae": mae / typical_balance if typical_balance else None, "rmse": rmse, "normalized_rmse": rmse / typical_balance if typical_balance else None, "wape": wape, "bias": bias, "absolute_bias": abs(bias) if bias is not None else None, "prediction_interval_coverage": {"70_percent": coverage70, "90_percent": coverage90}, "target_status": {"wape_below_15_percent": "NOT EVALUABLE" if wape is None else "PASS" if wape < .15 else "FAIL", "normalized_mae_below_10_percent": "NOT EVALUABLE" if not typical_balance else "PASS" if mae / typical_balance <= .10 else "FAIL", "normalized_rmse_below_20_percent": "NOT EVALUABLE" if not typical_balance else "PASS" if rmse / typical_balance <= .20 else "FAIL", "absolute_bias_within_5_percent": "NOT EVALUABLE" if bias is None else "PASS" if abs(bias) <= .05 else "FAIL", "70_percent_interval_coverage_65_to_75": "PASS" if .65 <= coverage70 <= .75 else "FAIL", "90_percent_interval_coverage_85_to_95": "NOT EVALUABLE" if coverage90 is None else "PASS" if .85 <= coverage90 <= .95 else "FAIL"}, "naive_baseline_mae": naive_mae, "naive_baseline_rmse": naive_rmse, "mae_improvement_vs_baseline": 1 - mae / naive_mae if naive_mae else None, "rmse_improvement_vs_baseline": 1 - rmse / naive_rmse if naive_rmse else None, "status": "EVALUATED", "interpretation": "Within-tenant chronological monitoring only; overlapping windows are correlated and do not establish cross-merchant generalization."})
    return {"generated_at": evaluated_at, "method": "chronological forecast issue-time snapshots matched to observed balances within ±1 day of target; no future feature reuse", "results": results}


def export_labels(tenant: str, path: str | Path | None = None) -> str:
    with db_session(path) as db: rows = _rows(db, tenant)
    import io
    output = io.StringIO(); writer = csv.DictWriter(output, fieldnames=list(rows[0]) if rows else ["id","transaction_id","label","event_time","reviewer","reviewed_at","evidence_ref","rationale"])
    writer.writeheader(); writer.writerows(rows)
    return output.getvalue()
