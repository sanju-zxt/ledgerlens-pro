import unittest

from verify_evidence import score_backtest_outcomes, validate_backtest_outcomes


def synthetic_outcome(**overrides):
    # Synthetic fixture used only to test validation rules; not financial evidence.
    row = {
        "forecast_origin": "2026-01-01",
        "target_date": "2026-01-02",
        "actual_closing_balance": "100.00",
        "predicted_p15": "90.00",
        "predicted_median": "100.00",
        "predicted_p85": "110.00",
        "baseline_prediction": "90.00",
        "currency": "USD",
    }
    return {**row, **overrides}


class BacktestOutcomeValidationTests(unittest.TestCase):
    def test_valid_outcome_row_is_accepted(self):
        validate_backtest_outcomes([synthetic_outcome()])

    def test_target_must_follow_forecast_origin(self):
        row = synthetic_outcome(target_date="2026-01-01")
        with self.assertRaisesRegex(AssertionError, "target_date must follow"):
            validate_backtest_outcomes([row])

    def test_duplicate_targets_are_rejected(self):
        row = synthetic_outcome()
        with self.assertRaisesRegex(AssertionError, "duplicate forecast target"):
            validate_backtest_outcomes([row, row])

    def test_prediction_interval_order_is_checked(self):
        row = synthetic_outcome(predicted_p15="105.00", predicted_median="100.00")
        with self.assertRaisesRegex(AssertionError, "P15 <= median <= P85"):
            validate_backtest_outcomes([row])

    def test_currency_and_finite_amounts_are_checked(self):
        with self.assertRaisesRegex(AssertionError, "currency"):
            validate_backtest_outcomes([synthetic_outcome(currency="usd")])
        with self.assertRaisesRegex(AssertionError, "balances must be finite decimals"):
            validate_backtest_outcomes([synthetic_outcome(actual_closing_balance="NaN")])

    def test_metrics_include_baseline_bias_wape_and_interval_coverage(self):
        result = score_backtest_outcomes([synthetic_outcome()])
        usd = result["by_currency"]["USD"]
        self.assertEqual(usd["forecast"]["mae"], 0)
        self.assertEqual(usd["forecast"]["wape"], 0)
        self.assertEqual(usd["forecast"]["prediction_interval_coverage_p15_p85"], 1)
        self.assertEqual(usd["forecast"]["mae_skill_vs_persistence"], 1)
        self.assertEqual(usd["persistence_baseline"]["mae"], 10)

    def test_zero_total_actuals_return_undefined_wape(self):
        row = synthetic_outcome(actual_closing_balance="0", predicted_p15="-1", predicted_median="0", predicted_p85="1", baseline_prediction="0")
        self.assertIsNone(score_backtest_outcomes([row])["by_currency"]["USD"]["forecast"]["wape"])


if __name__ == "__main__":
    unittest.main()
