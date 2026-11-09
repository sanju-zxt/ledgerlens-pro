"""Read-only checks for checked-in LedgerLens evidence. Never changes source files."""
import csv
import hashlib
import json
import subprocess
from datetime import date, datetime, timedelta
from decimal import Decimal
from pathlib import Path

ROOT = Path(__file__).resolve().parent
BACKTEST_OUTCOME_COLUMNS = {
    "forecast_origin", "target_date", "actual_closing_balance", "predicted_p15",
    "predicted_median", "predicted_p85", "baseline_prediction", "currency"
}


def read_csv(path, required_columns):
    with path.open(newline="", encoding="utf-8-sig") as stream:
        reader = csv.DictReader(stream)
        if not reader.fieldnames or len(set(reader.fieldnames)) != len(reader.fieldnames):
            raise AssertionError(f"{path.name}: missing or duplicate CSV header fields")
        missing = required_columns - set(reader.fieldnames)
        if missing:
            raise AssertionError(f"{path.name}: missing required columns: {', '.join(sorted(missing))}")
        rows = list(reader)
    for index, row in enumerate(rows, start=2):
        if None in row or any(value is None or not value.strip() for value in row.values()):
            raise AssertionError(f"{path.name}: missing value or extra field on row {index}")
    return rows


def validate_backtest_outcomes(rows):
    seen = set()
    for index, row in enumerate(rows, start=2):
        origin = date.fromisoformat(row["forecast_origin"])
        target = date.fromisoformat(row["target_date"])
        if target <= origin:
            raise AssertionError(f"outcome row {index}: target_date must follow forecast_origin")
        key = (origin, target, row["currency"])
        if key in seen:
            raise AssertionError(f"outcome row {index}: duplicate forecast target")
        seen.add(key)
        if len(row["currency"]) != 3 or not row["currency"].isalpha() or row["currency"] != row["currency"].upper():
            raise AssertionError(f"outcome row {index}: currency must be an uppercase three-letter code")
        values = [Decimal(row[field]) for field in ("actual_closing_balance", "predicted_p15", "predicted_median", "predicted_p85", "baseline_prediction")]
        if any(not value.is_finite() for value in values):
            raise AssertionError(f"outcome row {index}: balances must be finite decimals")
        actual, lower, median, upper, _baseline = values
        if lower > median or median > upper:
            raise AssertionError(f"outcome row {index}: prediction interval must satisfy P15 <= median <= P85")


def score_backtest_outcomes(rows):
    if not rows:
        raise AssertionError("backtest outcome file must contain at least one row")
    validate_backtest_outcomes(rows)
    by_currency = {}
    for row in rows:
        by_currency.setdefault(row["currency"], []).append(row)
    result = {}
    for currency, currency_rows in by_currency.items():
        actuals = [Decimal(row["actual_closing_balance"]) for row in currency_rows]
        predictions = [Decimal(row["predicted_median"]) for row in currency_rows]
        baselines = [Decimal(row["baseline_prediction"]) for row in currency_rows]
        errors = [prediction - actual for prediction, actual in zip(predictions, actuals)]
        baseline_errors = [prediction - actual for prediction, actual in zip(baselines, actuals)]

        def metrics(values):
            absolute = [abs(value) for value in values]
            mae = sum(absolute, Decimal(0)) / len(values)
            rmse = (sum((value * value for value in values), Decimal(0)) / len(values)).sqrt()
            denominator = sum((abs(value) for value in actuals), Decimal(0))
            wape = sum(absolute, Decimal(0)) / denominator if denominator else None
            bias = sum(values, Decimal(0)) / len(values)
            return {"mae": float(mae), "rmse": float(rmse), "wape": float(wape) if wape is not None else None, "bias": float(bias)}

        coverage_count = sum(Decimal(row["predicted_p15"]) <= actual <= Decimal(row["predicted_p85"]) for row, actual in zip(currency_rows, actuals))
        forecast_metrics = metrics(errors)
        baseline_metrics = metrics(baseline_errors)
        forecast_metrics["prediction_interval_coverage_p15_p85"] = coverage_count / len(currency_rows)
        forecast_metrics["mae_skill_vs_persistence"] = 1 - forecast_metrics["mae"] / baseline_metrics["mae"] if baseline_metrics["mae"] > 0 else None
        result[currency] = {"n_observations": len(currency_rows), "forecast": forecast_metrics, "persistence_baseline": baseline_metrics}
    return {"by_currency": result, "validation": "chronological outcome rows; each target follows its forecast origin"}


def check_manifest_hashes():
    manifest = json.loads((ROOT / "manifest.json").read_text(encoding="utf-8"))
    manifest_commit = manifest.get("git", "")
    if len(manifest_commit) != 40 or any(char not in "0123456789abcdef" for char in manifest_commit.lower()):
        raise AssertionError("manifest git anchor must be a full commit hash")
    if subprocess.run(["git", "merge-base", "--is-ancestor", manifest_commit, "HEAD"], cwd=ROOT, check=False).returncode != 0:
        raise AssertionError("manifest evidence anchor is not an ancestor of the current checkout")
    required = {
        "evidence/balance_logs.csv", "evidence/backtest.csv", "evidence/calibration_data.csv",
        "evidence/paypal_api_responses/balance_response.json", "evidence/paypal_sandbox_verification.json"
    }
    files = manifest.get("files", {})
    if not required.issubset(files):
        raise AssertionError("manifest is missing required evidence entries")
    for relative, metadata in files.items():
        path = (ROOT / relative).resolve()
        if ROOT not in path.parents:
            raise AssertionError(f"manifest path escapes repository root: {relative}")
        if not path.is_file():
            raise AssertionError(f"manifest file is missing: {relative}")
        data = path.read_bytes()
        if hashlib.sha256(data).hexdigest() != metadata.get("sha256") or len(data) != metadata.get("size"):
            raise AssertionError(f"manifest hash or size mismatch: {relative}")
    print(f"PASS: {len(files)} evidence manifest hashes and byte sizes match")
    print("PASS: manifest evidence anchor commit is an ancestor of HEAD")


def check_balance_ledger():
    with (ROOT / "evidence/balance_logs.csv").open(newline="", encoding="utf-8-sig") as stream:
        rows = list(csv.DictReader(stream))
    assert len(rows) >= 2, "balance ledger needs at least two events"
    assert [int(row["seq"]) for row in rows] == list(range(1, len(rows) + 1)), "sequence numbers must be contiguous"
    times = [datetime.fromisoformat(row["timestamp_utc"].replace("Z", "+00:00")) for row in rows]
    assert times == sorted(times), "ledger timestamps must be chronological"
    first, last = rows[0], rows[-1]
    assert first["event_type"] == "SNAPSHOT" and first["direction"] == "OPENING", "first row must establish opening snapshot"
    assert last["event_type"] == "SNAPSHOT" and last["direction"] == "RECONCILE", "last row must be reconciliation snapshot"
    balance = Decimal(first["balance"])
    for row in rows[1:]:
        if row["event_type"] == "MOVEMENT":
            assert row["direction"] in {"CREDIT", "DEBIT"} and row["txn_id"], "movement must have direction and transaction id"
            amount = Decimal(row["amount"])
            balance += amount if row["direction"] == "CREDIT" else -amount
            assert balance == Decimal(row["balance"]), f"running balance mismatch at sequence {row['seq']}"
        elif row["event_type"] == "SNAPSHOT":
            assert balance == Decimal(row["balance"]), f"snapshot mismatch at sequence {row['seq']}"
        else:
            raise AssertionError(f"unknown event type {row['event_type']}")
    print(f"PASS: directional ledger reconciles to {balance:.2f} USD")


def check_backtest_metadata():
    required = {"origin", "end", "cutoff", "extracted_at", "outcome_at", "source"}
    rows = read_csv(ROOT / "evidence/backtest.csv", required)
    assert len(rows) == 12, f"expected 12 windows; found {len(rows)}"
    missing = []
    previous_end = None
    seen_windows = set()
    seen_sources = set()
    for row in rows:
        origin = date.fromisoformat(row["origin"])
        end = date.fromisoformat(row["end"])
        date.fromisoformat(row["cutoff"])
        extracted = datetime.fromisoformat(row["extracted_at"].replace("Z", "+00:00"))
        outcome = datetime.fromisoformat(row["outcome_at"].replace("Z", "+00:00"))
        assert extracted.tzinfo is not None and outcome.tzinfo is not None, "backtest timestamps must include a timezone"
        assert (end - origin).days == 29, f"window is not 30 inclusive days: {origin} to {end}"
        assert previous_end is None or origin == previous_end + timedelta(days=1), "windows must be consecutive and non-overlapping"
        assert origin <= end, "window origin must not be after its end"
        window_key = (origin, end)
        assert window_key not in seen_windows, f"duplicate backtest window {window_key}"
        assert row["source"] not in seen_sources, f"duplicate backtest source {row['source']}"
        seen_windows.add(window_key)
        seen_sources.add(row["source"])
        previous_end = end
        if Path(row["source"]).name != row["source"] or not row["source"].endswith(".csv"):
            raise AssertionError(f"backtest source must be a CSV filename, found {row['source']}")
        source_path = ROOT / "evidence" / row["source"]
        if not source_path.is_file():
            missing.append(row["source"])
        else:
            metrics = score_backtest_outcomes(read_csv(source_path, BACKTEST_OUTCOME_COLUMNS))
            for currency, score in metrics["by_currency"].items():
                forecast = score["forecast"]
                print(f"PASS: {row['source']} {currency} reproduced: MAE={forecast['mae']:.4f}, RMSE={forecast['rmse']:.4f}, WAPE={forecast['wape']}, bias={forecast['bias']:.4f}, P15–P85 coverage={forecast['prediction_interval_coverage_p15_p85']:.1%}")
    print("PASS: 12 backtest metadata windows have valid dates and are consecutive/non-overlapping")
    if missing:
        print(f"WARNING: raw outcome files are absent ({len(set(missing))} unique references); backtest metrics and leakage cannot be independently verified")
    print("WARNING: repository history and documentation do not define cutoff, extracted_at, and outcome_at semantics; parsed timestamps alone do not establish leakage-free chronology")


def check_calibration():
    with (ROOT / "evidence/calibration_data.csv").open(newline="", encoding="utf-8-sig") as stream:
        rows = list(csv.DictReader(stream))
    assert len(rows) == 646, f"expected 646 rows; found {len(rows)}"
    pairs = [(float(row["pred"]), int(row["label"])) for row in rows]
    assert all(0 <= p <= 1 and label in (0, 1) for p, label in pairs), "invalid prediction or label"
    brier = sum((p - label) ** 2 for p, label in pairs) / len(pairs)
    ece = 0.0
    for index in range(10):
        group = [(p, label) for p, label in pairs if index / 10 <= p < (index + 1) / 10 or (index == 9 and p == 1)]
        if group:
            ece += len(group) / len(pairs) * abs(sum(p for p, _ in group) / len(group) - sum(label for _, label in group) / len(group))
    print(f"PASS: 646 calibration rows validated; equal-width Brier={brier:.6f}, ECE={ece:.6f}")
    positive = sum(label for _, label in pairs)
    if positive == 0 or positive == len(pairs):
        print(f"WARNING: single-class calibration sample ({positive} positives, {len(pairs) - positive} negatives); class discrimination cannot be validated")


def check_paypal_fixture():
    payload = json.loads((ROOT / "evidence/paypal_api_responses/balance_response.json").read_text(encoding="utf-8-sig"))
    assert payload.get("balances"), "PayPal balance fixture must include at least one currency balance"
    for balance in payload["balances"]:
        assert balance["total_balance"]["currency_code"] == balance["currency"]
        assert balance["available_balance"]["currency_code"] == balance["currency"]
        assert balance["withheld_balance"]["currency_code"] == balance["currency"]
    print("PASS: PayPal balance response fixture has consistent currency fields")


def check_paypal_sandbox_verification():
    path = ROOT / "evidence/paypal_sandbox_verification.json"
    report = json.loads(path.read_text(encoding="utf-8"))
    if report.get("schema_version") != 1 or report.get("environment") != "sandbox":
        raise AssertionError("PayPal verification must identify the supported Sandbox check format")
    if report.get("credential_values_recorded") is not False:
        raise AssertionError("PayPal verification must not contain credential values")
    if not report.get("captured_at") or not report.get("account_scope"):
        raise AssertionError("PayPal verification needs capture time and account-scope disclosure")
    checks = report.get("checks", {})
    if checks.get("reporting_balances", {}).get("status") != "PASS" or checks.get("transaction_search", {}).get("status") != "PASS":
        raise AssertionError("Both Sandbox Reporting API checks must succeed before recording this evidence")
    forbidden = {"access_token", "client_secret", "client_id", "transaction_id", "description", "amount"}
    if forbidden.intersection(key.lower() for key in checks):
        raise AssertionError("PayPal verification must not contain private credentials or transaction details")
    print("PASS: sanitized PayPal Sandbox Reporting verification is valid")


if __name__ == "__main__":
    check_manifest_hashes()
    check_balance_ledger()
    check_backtest_metadata()
    check_calibration()
    check_paypal_fixture()
    check_paypal_sandbox_verification()
