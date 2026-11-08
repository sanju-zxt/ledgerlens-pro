import asyncio
import unittest
from main import AnomalyRequest, CalibrationRequest, ForecastRequest, Transaction, calibration, detect_anomaly, forecast


class ForecastTests(unittest.TestCase):
    def test_reproducible_seeded_forecast(self):
        request = ForecastRequest(current_balance=3500, payment_amount=1000, daily_expense_mean=80, daily_expense_std=15, simulations=1000, seed=42)
        self.assertEqual(asyncio.run(forecast(request)), asyncio.run(forecast(request)))

    def test_separate_breach_metrics_and_interval(self):
        result = asyncio.run(forecast(ForecastRequest(current_balance=1100, payment_amount=0, daily_expense_mean=0, daily_expense_std=0, simulations=100, emergency_probability=0)))
        self.assertEqual(result["reserve_breach_probability"], 0.0)
        self.assertEqual(result["ending_below_reserve_probability"], 0.0)
        self.assertEqual(result["p15"], result["p85"])


class CalibrationTests(unittest.TestCase):
    def test_calibration_metrics_and_reliability_bins(self):
        result = asyncio.run(calibration(CalibrationRequest(predictions=[0.1, 0.9], labels=[0, 1], bins=10)))
        self.assertAlmostEqual(result["brier_score"], 0.01)
        self.assertAlmostEqual(result["ece"], 0.1)
        self.assertEqual(sum(item["count"] for item in result["reliability_bins"]), 2)


class AnomalyTests(unittest.TestCase):
    def test_detector_returns_review_signals_not_fraud_labels(self):
        transactions = [Transaction(amount=value, description="fixture", date="2026-01-01") for value in [10, 11, 9, 10, 5000]]
        result = asyncio.run(detect_anomaly(AnomalyRequest(transactions=transactions, sensitivity=0.2)))
        self.assertEqual(result["total_checked"], 5)
        self.assertTrue(result["anomalies"])
        self.assertIn("not confirmed fraud", result["interpretation"])


if __name__ == "__main__":
    unittest.main()
