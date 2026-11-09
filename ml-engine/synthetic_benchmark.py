"""Reproducible controlled benchmark; generated labels are never customer evidence.

Run from the repository root with `npm run quality:benchmark`. This measures
whether feature models recover explicitly injected event patterns. It is not
evidence of PayPal customer anomaly performance and is never merged with the
reviewed-label scorecard.
"""
from __future__ import annotations

import json
from datetime import datetime, timezone
from pathlib import Path

import numpy as np
from sklearn.ensemble import HistGradientBoostingClassifier
from sklearn.isotonic import IsotonicRegression
from sklearn.linear_model import LogisticRegression
from sklearn.metrics import (average_precision_score, brier_score_loss,
                             confusion_matrix, f1_score, log_loss,
                             precision_score, recall_score, roc_auc_score)
from sklearn.pipeline import make_pipeline
from sklearn.preprocessing import StandardScaler

SEED = 20261109
N = 4000
FEATURES = ["robust_amount_deviation", "prior_24h_velocity", "merchant_rarity", "unusual_hour"]


def generate(seed: int = SEED, n: int = N) -> tuple[np.ndarray, np.ndarray]:
    """Inject labeled amount, velocity, rarity, or timing patterns with noise."""
    rng = np.random.default_rng(seed)
    x = np.column_stack((rng.normal(0, 1, n), rng.poisson(2, n), rng.beta(2, 5, n), rng.binomial(1, .12, n))).astype(float)
    y = np.zeros(n, dtype=np.int8)
    injected = rng.random(n) < .12
    for index in np.flatnonzero(injected):
        kind = rng.integers(0, 4)
        if kind == 0:
            x[index, 0] = rng.choice([-1, 1]) * rng.uniform(3.5, 7)
        elif kind == 1:
            x[index, 1] = rng.integers(9, 20)
        elif kind == 2:
            x[index, 2] = rng.uniform(.88, 1)
        else:
            x[index, 3] = 1
            x[index, 0] = rng.choice([-1, 1]) * rng.uniform(2.5, 5)
        y[index] = 1
    # Explicit measurement noise prevents a perfect oracle-style feature label.
    flip = rng.random(n) < .025
    y[flip] = 1 - y[flip]
    return x, y


def metrics(y: np.ndarray, p: np.ndarray) -> dict:
    pred = (p >= .5).astype(int)
    tn, fp, fn, tp = confusion_matrix(y, pred, labels=[0, 1]).ravel()
    return {
        "sample_size": int(len(y)), "positives": int(y.sum()), "negatives": int(len(y) - y.sum()),
        "roc_auc": float(roc_auc_score(y, p)), "pr_auc": float(average_precision_score(y, p)),
        "precision_at_0_5": float(precision_score(y, pred, zero_division=0)),
        "recall_at_0_5": float(recall_score(y, pred, zero_division=0)),
        "f1_at_0_5": float(f1_score(y, pred, zero_division=0)),
        "brier": float(brier_score_loss(y, p)), "log_loss": float(log_loss(y, p, labels=[0, 1])),
        "confusion_matrix_at_0_5": {"tn": int(tn), "fp": int(fp), "fn": int(fn), "tp": int(tp)},
    }


def run(output: Path | None = None) -> dict:
    x, y = generate()
    # Chronological blocks: train 60%, calibration 15%, model selection 10%, final test 15%.
    n_train, n_cal, n_val = int(N * .60), int(N * .15), int(N * .10)
    train = slice(0, n_train)
    calibration = slice(n_train, n_train + n_cal)
    validation = slice(n_train + n_cal, n_train + n_cal + n_val)
    test = slice(n_train + n_cal + n_val, N)
    candidates = {
        "logistic_regression": make_pipeline(StandardScaler(), LogisticRegression(max_iter=1000, class_weight="balanced", random_state=SEED)),
        "hist_gradient_boosting": HistGradientBoostingClassifier(max_iter=100, max_leaf_nodes=15, l2_regularization=1, random_state=SEED),
    }
    fitted = {}
    for name, model in candidates.items():
        model.fit(x[train], y[train])
        raw_cal = np.clip(model.predict_proba(x[calibration])[:, 1], 1e-6, 1 - 1e-6)
        raw_val = np.clip(model.predict_proba(x[validation])[:, 1], 1e-6, 1 - 1e-6)
        # Compare identity, Platt scaling, and isotonic using calibration block;
        # choose solely on the chronological validation block.
        platt = LogisticRegression(max_iter=1000, random_state=SEED).fit(np.log(raw_cal / (1 - raw_cal)).reshape(-1, 1), y[calibration])
        iso = IsotonicRegression(out_of_bounds="clip").fit(raw_cal, y[calibration])
        calibrators = {
            "uncalibrated": lambda p: p,
            "platt": lambda p, m=platt: m.predict_proba(np.log(np.clip(p, 1e-6, 1 - 1e-6) / (1 - np.clip(p, 1e-6, 1 - 1e-6))).reshape(-1, 1))[:, 1],
            "isotonic": lambda p, m=iso: m.predict(p),
        }
        for calibration_name, calibrate in calibrators.items():
            p_val = np.clip(calibrate(raw_val), 1e-6, 1 - 1e-6)
            fitted[f"{name}+{calibration_name}"] = (float(brier_score_loss(y[validation], p_val)), model, calibrate)
    selected_name, (_, selected_model, selected_calibrator) = min(fitted.items(), key=lambda item: (item[1][0], item[0]))
    p_test = np.clip(selected_calibrator(selected_model.predict_proba(x[test])[:, 1]), 1e-6, 1 - 1e-6)
    prevalence = float(y[train].mean())
    baseline = np.full(int(N - (n_train + n_cal + n_val)), prevalence)
    report = {
        "title": "Controlled synthetic anomaly benchmark",
        "status": "SYNTHETIC BENCHMARK ONLY",
        "not_customer_evidence": True,
        "generated_at": datetime.now(timezone.utc).isoformat(),
        "dataset": {"version": f"controlled-patterns-v1-seed-{SEED}", "generator": "ml-engine/synthetic_benchmark.py", "seed": SEED, "total": N, "positive_definition": "Known injected amount, velocity, merchant-rarity, or unusual-hour pattern; 2.5% labels flipped as controlled noise.", "features": FEATURES},
        "split": {"method": "chronological contiguous blocks", "train": n_train, "calibration": n_cal, "validation": n_val, "test": int(len(y[test])), "selection": "validation Brier only; test used once after selection"},
        "model_version": "synthetic-benchmark-v1",
        "selected_candidate": selected_name,
        "validation_brier": min(value[0] for value in fitted.values()),
        "test": metrics(y[test], p_test),
        "baseline": {"name": "training-prevalence constant probability", **metrics(y[test], baseline)},
        "brier_skill_vs_baseline": float(1 - brier_score_loss(y[test], p_test) / brier_score_loss(y[test], baseline)),
        "limitations": ["Controlled generated distribution; not representative PayPal/customer data.", "Does not establish real-world detection, calibration, or fraud performance.", "Do not combine these values with reviewed-label or production scorecards."],
    }
    if output:
        output.parent.mkdir(parents=True, exist_ok=True)
        # Write bytes so Windows newline translation cannot add CR characters
        # that make generated, checked-in JSON fail git diff --check.
        output.write_bytes((json.dumps(report, indent=2) + "\n").encode("utf-8"))
    return report


if __name__ == "__main__":
    root = Path(__file__).resolve().parents[1]
    result = run(root / "client/public/synthetic-benchmark.json")
    print(json.dumps({"status": result["status"], "candidate": result["selected_candidate"], "test": result["test"], "baseline": result["baseline"], "report": "client/public/synthetic-benchmark.json"}, indent=2))
