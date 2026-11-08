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


class AnomalyTests(unittest.TestCase):
    def test_detector_returns_review_signals_not_fraud_labels(self):
        transactions = [Transaction(amount=value, description="fixture", date="2026-01-01") for value in [10, 11, 9, 10, 5000]]
        result = asyncio.run(detect_anomaly(AnomalyRequest(transactions=transactions, sensitivity=0.2)))
        self.assertEqual(result["total_checked"], 5)
        self.assertTrue(result["anomalies"])
        self.assertIn("not confirmed fraud", result["interpretation"])


if __name__ == "__main__":
    unittest.main()
