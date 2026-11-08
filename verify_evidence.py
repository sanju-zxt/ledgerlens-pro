"""Read-only checks for checked-in LedgerLens evidence. Never changes source files."""
import csv
import json
from datetime import date, datetime, timedelta
from decimal import Decimal
from pathlib import Path

ROOT = Path(__file__).resolve().parent


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
    with (ROOT / "evidence/backtest.csv").open(newline="", encoding="utf-8-sig") as stream:
        rows = list(csv.DictReader(stream))
    assert len(rows) == 12, f"expected 12 windows; found {len(rows)}"
    missing = []
    previous_end = None
    for row in rows:
        origin = date.fromisoformat(row["origin"])
        end = date.fromisoformat(row["end"])
        cutoff = date.fromisoformat(row["cutoff"])
        extracted = datetime.fromisoformat(row["extracted_at"].replace("Z", "+00:00"))
        outcome = datetime.fromisoformat(row["outcome_at"].replace("Z", "+00:00"))
        assert (end - origin).days == 29, f"window is not 30 inclusive days: {origin} to {end}"
        assert previous_end is None or origin == previous_end + timedelta(days=1), "windows must be consecutive and non-overlapping"
        assert outcome.date() <= cutoff, f"outcome {outcome} is later than cutoff {cutoff}"
        assert extracted >= datetime.combine(end + timedelta(days=1), datetime.min.time(), tzinfo=extracted.tzinfo), "outcome extraction precedes window completion"
        previous_end = end
        if not (ROOT / "evidence" / row["source"]).is_file():
            missing.append(row["source"])
    print("PASS: 12 backtest metadata windows are consecutive, non-overlapping, and within cutoff")
    if missing:
        print(f"WARNING: raw outcome files are absent ({len(set(missing))} unique references); backtest metrics and leakage cannot be independently verified")


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


def check_paypal_fixture():
    payload = json.loads((ROOT / "evidence/paypal_api_responses/balance_response.json").read_text(encoding="utf-8-sig"))
    assert payload.get("balances"), "PayPal balance fixture must include at least one currency balance"
    for balance in payload["balances"]:
        assert balance["total_balance"]["currency_code"] == balance["currency"]
        assert balance["available_balance"]["currency_code"] == balance["currency"]
        assert balance["withheld_balance"]["currency_code"] == balance["currency"]
    print("PASS: PayPal balance response fixture has consistent currency fields")


if __name__ == "__main__":
    check_balance_ledger()
    check_backtest_metadata()
    check_calibration()
    check_paypal_fixture()
