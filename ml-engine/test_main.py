import asyncio
import os
import unittest
from unittest.mock import patch
from fastapi import HTTPException
from main import AnomalyRequest, CalibrationRequest, ForecastRequest, Transaction, calibration, detect_anomaly, forecast, require_internal_api_key


class ServiceAuthTests(unittest.TestCase):
    def test_production_requires_a_configured_shared_key(self):
        with patch.dict(os.environ, {"NODE_ENV": "production"}, clear=True):
            with self.assertRaises(HTTPException) as error:
                require_internal_api_key(None)
        self.assertEqual(error.exception.status_code, 503)

    def test_shared_key_is_required_and_compared(self):
        with patch.dict(os.environ, {"ML_ENGINE_API_KEY": "test-only-key"}, clear=True):
            require_internal_api_key("Bearer test-only-key")
            with self.assertRaises(HTTPException) as error:
                require_internal_api_key("Bearer wrong-key")
        self.assertEqual(error.exception.status_code, 401)


class ForecastTests(unittest.TestCase):
    def test_forecast_does_not_assume_unverified_future_income(self):
        self.assertEqual(ForecastRequest(current_balance=1000).payment_amount, 0.0)

    def test_reproducible_seeded_forecast(self):
        request = ForecastRequest(current_balance=3500, payment_amount=1000, daily_expense_mean=80, daily_expense_std=15, simulations=1000, seed=42)
        self.assertEqual(asyncio.run(forecast(request)), asyncio.run(forecast(request)))

    def test_separate_breach_metrics_and_interval(self):
        result = asyncio.run(forecast(ForecastRequest(current_balance=1100, payment_amount=0, daily_expense_mean=0, daily_expense_std=0, simulations=100, emergency_probability=0)))
        self.assertEqual(result["reserve_breach_probability"], 0.0)
        self.assertEqual(result["ending_below_reserve_probability"], 0.0)
        self.assertEqual(result["ending_balance"]["p15"], result["ending_balance"]["p85"])

    def test_negative_opening_balance_is_supported_and_counts_as_day_zero_breach(self):
        request = ForecastRequest(current_balance=-25, payment_amount=0, daily_expense_mean=0, daily_expense_std=0, simulations=100, emergency_probability=0)
        result = asyncio.run(forecast(request))
        self.assertEqual(result["reserve_runway_days_p50"], 0)
        self.assertEqual(result["reserve_breach_probability"], 1.0)

    def test_runway_is_not_reported_when_fewer_than_half_the_paths_breach(self):
        request = ForecastRequest(current_balance=5000, payment_amount=0, daily_expense_mean=0, daily_expense_std=0, simulations=100, emergency_probability=0)
        self.assertIsNone(asyncio.run(forecast(request))["reserve_runway_days_p50"])


class CalibrationTests(unittest.TestCase):
    def test_calibration_metrics_and_reliability_bins(self):
        result = asyncio.run(calibration(CalibrationRequest(predictions=[0.1, 0.9], labels=[0, 1], bins=10)))
        self.assertAlmostEqual(result["brier_score"], 0.01)
        self.assertAlmostEqual(result["ece"], 0.1)
        self.assertEqual(sum(item["count"] for item in result["reliability_bins"]), 2)
        self.assertEqual(result["baseline_brier_score"], 0.25)
        self.assertAlmostEqual(result["brier_skill_score"], 0.96)
        self.assertEqual(len(result["reliability_bins"]), 10)

    def test_single_class_metrics_are_explicitly_unavailable(self):
        result = asyncio.run(calibration(CalibrationRequest(predictions=[0.9, 0.1], labels=[0, 0])))
        self.assertFalse(result["class_distribution_valid"])
        self.assertIsNone(result["roc_auc"])
        self.assertIsNone(result["pr_auc"])
        self.assertIsNone(result["recall"])
        self.assertEqual(result["holdout_validation"]["status"], "unavailable")
        self.assertGreater(result["brier_score"], result["baseline_brier_score"])

    def test_synthetic_unit_sample_exercises_binary_event_metrics(self):
        # Synthetic inputs exercise metric math only; they are not training or product evidence.
        result = asyncio.run(calibration(CalibrationRequest(predictions=[0.9, 0.8, 0.2, 0.1], labels=[1, 0, 1, 0])))
        self.assertEqual(result["confusion_matrix"], {"true_positive": 1, "false_positive": 1, "true_negative": 1, "false_negative": 1})
        self.assertEqual(result["precision"], 0.5)
        self.assertEqual(result["recall"], 0.5)
        self.assertEqual(result["f1_score"], 0.5)
        self.assertEqual(result["roc_auc"], 0.75)
        self.assertAlmostEqual(result["pr_auc"], 5 / 6)


class AnomalyTests(unittest.TestCase):
    def test_detector_returns_review_signals_not_fraud_labels(self):
        transactions = [Transaction(amount=value, description="fixture", date="2026-01-01") for value in [10, 11, 9, 10, 5000]]
        result = asyncio.run(detect_anomaly(AnomalyRequest(transactions=transactions, sensitivity=0.2)))
        self.assertEqual(result["total_checked"], 5)
        self.assertTrue(result["anomalies"])
        self.assertIn("not confirmed fraud", result["interpretation"])

    def test_completed_activity_is_analyzed_per_currency_and_refunds_are_excluded(self):
        transactions = [
            Transaction(amount=value, description=f"merchant-{index}", date="2026-01-01T10:00:00Z", currency="EUR")
            for index, value in enumerate([10, 11, 1000])
        ]
        transactions.extend([
            Transaction(amount=20, description="small-usd-a", date="2026-01-01", currency="USD"),
            Transaction(amount=30, description="small-usd-b", date="2026-01-01", currency="USD"),
            Transaction(amount=5000, description="refund", date="2026-01-01", currency="USD", status="REFUNDED")
        ])
        result = asyncio.run(detect_anomaly(AnomalyRequest(transactions=transactions)))
        self.assertEqual(result["total_checked"], 5)
        self.assertEqual(result["skipped_currency_groups"], {"USD": 2})
        self.assertIn("time of week", result["feature_set"])
        self.assertTrue(all(item["transaction"]["currency"] == "EUR" for item in result["anomalies"]))


if __name__ == "__main__":
    unittest.main()
