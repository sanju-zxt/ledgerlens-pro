# Reviewed model data and evaluation pipeline

## Data path

The Model Quality page loads the authenticated user's source transactions. The API re-fetches the selected source row before accepting a review, then stores the binary outcome (expected/unusual), reviewer identity, UTC review time, source-row SHA-256, and reviewer rationale. Corrections create an immutable review-history event; only the latest reviewed outcome enters training. Positive means unusual and is not a fraud finding.

The dataset report is tenant-scoped and includes class counts, required-field missing counts, duplicate source hashes, event-time coverage, and a content-derived dataset version. No CSV upload or user-supplied transaction snapshot is used as verified source evidence.

## Classification experiments

`POST /api/analysis/experiment` compares logistic regression and histogram gradient boosting. Feature preprocessing is fitted on the earliest 55% chronological train partition. Platt calibration is fitted on the next 15%; isotonic is added only with at least 100 calibration observations and 20 observations per class. Candidates are ranked by Brier and log loss on the next 15% validation period. The final 15% is scored once after selection is frozen. A training-prevalence probability baseline is included. The selected fitted pipeline and calibration object are saved as a versioned joblib artifact. It is activated for anomaly review only when the dataset version still matches and its untouched-test Brier skill is positive.

Experiments require at least 100 reviewed examples overall and ten of each class. Training, calibration, validation, and test partitions each require at least five examples of both classes. Otherwise the result remains `NOT EVALUABLE`. These gates are safeguards, not claims that 100 examples are sufficient for generalization.

## Forecast snapshots

Successful live PayPal forecast requests save one issue-time snapshot per tenant/currency/UTC day and one actual balance observation for that day. The static demo ledger is deliberately excluded. Observations are matched to 7-, 14-, and 30-day forecast horizons only within a one-day tolerance. Reports compare MAE, RMSE, WAPE, bias, 70% and 90% interval coverage, and a last-balance naive forecast baseline. Each horizon remains `NOT EVALUABLE` until it has at least 30 chronologically matched snapshots. Predictions can overlap and therefore are not independent; reported sample sizes are raw matched forecasts, not independent-merchant counts. The report explicitly cautions that this is within-tenant monitoring and does not establish cross-merchant generalization.

## Durable production storage

The ML service uses SQLite through `MODEL_DATA_PATH`. In local development it defaults to `ml-engine/data/model-quality.sqlite3`. The production app refuses label, experiment, and backtest operations unless `MODEL_DATA_PATH` points to a durable mounted volume. The current Render blueprint does not provision a persistent disk, so production collection is gated until the owner attaches durable storage and sets that environment variable. Do not point it at the default container filesystem: deployments/restarts can erase labels and fitted artifacts.

The deployment service also requires `ML_ENGINE_API_KEY` between API and ML services. Tenant identifiers are taken from the authenticated API session, not browser form values. Reports and artifacts are tenant-scoped.

## Reproduction

From the repository root:

```powershell
npm test
npm run build
npm run lint --workspace=server
npm run lint --workspace=client
```

The temporary rows in `ml-engine/test_quality_pipeline.py` are isolated fixtures only. The separate `ml-engine/synthetic_benchmark.py` is a reproducible controlled benchmark with injected patterns; its report is clearly marked synthetic and is never used as PayPal/customer performance evidence. Neither enters the deployed reviewed-label database. `python -m unittest discover -p test_*.py -v` from `ml-engine` exercises data provenance, tenant-key scoping, chronological model fitting/artifact persistence, insufficiency gates, forecast outcome matching, and synthetic benchmark separation.
