# Evidence and evaluation methodology

## Current calibration file

`evidence/calibration_data.csv` contains only `pred,label` and 646 observations. Every supplied label is negative. The Brier score is computed from these rows and compared with the observed-prevalence baseline. On this all-negative sample, an always-zero forecast scores 0; the supplied probabilities score approximately 0.054832. This is a sample-specific result, not a claim about a future population.

The API computes Brier score, Brier skill when the baseline score is non-zero, equal-width ECE, reliability bins, and classification metrics at a documented 0.5 threshold. ROC-AUC requires both classes. Recall and PR-AUC require positive observations. Undefined metrics are returned as null. Single-class data is flagged. The file has no group/time key or independent holdout, so no holdout result is reported. Unit tests use clearly synthetic inputs only to check metric arithmetic; those values are not product evidence.

## Backtest metadata and missing outcomes

`evidence/backtest.csv` contains 12 consecutive 30-day window metadata rows. Its `source` values refer to raw CSVs that are absent. The repository history contains only the initial evidence commit and the repository documentation does not define whether `cutoff`, `extracted_at`, and `outcome_at` represent retrieval, forecast creation, or outcome observation. In all checked-in rows, `extracted_at` is earlier than `outcome_at`; this ordering alone neither proves leakage nor establishes a valid walk-forward evaluation.

The validator therefore checks column presence, nonempty values, parseable timezone-bearing timestamps, unique source/window identifiers, and consecutive window boundaries. It intentionally does not claim timestamp semantics or leakage-free chronology. Raw outcomes and metric reproduction remain blocked until the evidence owner supplies the source files and their timestamp definitions.

## Raw outcome format for future reproducible backtests

Any newly supplied raw file referenced from metadata must contain:

| Column | Meaning |
| --- | --- |
| `forecast_origin` | Timestamp/date when the forecast was generated, before target observations were available. |
| `target_date` | Later date the forecast predicts. |
| `actual_closing_balance` | Observed source balance on the target date. |
| `predicted_p15` | Forecast's lower 15th percentile. |
| `predicted_median` | Forecast median. |
| `predicted_p85` | Forecast's upper 85th percentile. |
| `baseline_prediction` | Persistence baseline: last observed closing balance available at `forecast_origin`. |
| `currency` | Uppercase three-letter currency code; evaluate currencies separately. |

Rows must be unique by forecast origin, target date, and currency; target dates must follow forecast origins; values must be finite; and P15 ≤ median ≤ P85. When raw files exist, the validator calculates MAE, RMSE, WAPE (undefined when total absolute actuals are zero), bias, P15–P85 interval coverage, and MAE skill versus the persistence baseline separately by currency. These are reproducibility checks, not proof that observed values came from PayPal or that predictions were produced without leakage. Preserve source response provenance and manifest hashes separately.

## Evidence integrity

`manifest.json` pins byte lengths and SHA-256 hashes for the four checked-in evidence files. `verify_evidence.py` recomputes the hashes and sizes, checks the ledger arithmetic, validates metadata and calibration fields, and reports missing backtest sources. A matching hash shows file consistency with the manifest; it does not authenticate who created the file or prove PayPal provenance.
