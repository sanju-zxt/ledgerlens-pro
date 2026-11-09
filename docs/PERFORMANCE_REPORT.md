# LedgerLens Pro engineering and model performance report

Generated from the checked-in evidence and the local test run on 2026-11-09. The current, per-metric machine-readable report is generated at `client/public/quality-scorecard.json`; tests record `client/public/quality-test-results.json`. CI attaches the scorecard, test results, and dependency-audit result to each workflow run.

## Baseline and current results

| Metric | Original score / method | Current measured value | Target | Improvement | Status |
| --- | --- | --- | --- | --- | --- |
| Test pass rate | 41/41 in the pre-mission run | 47/47 (100%) | 98–100% | Six test cases added; Node and Python suites now emit case counts | PASS |
| Code coverage | Not measured | NOT EVALUABLE | 90% | Coverage instrumentation is still absent | NOT EVALUABLE |
| Critical/high dependency vulnerabilities | Not measured | 0 known findings in both local `npm audit --audit-level=high` and `pip-audit -r ml-engine/requirements.txt` | 0 | Both dependency audits now run locally and in CI; this is not an application security certification | PASS for scanned dependencies |
| Tenant isolation | Not implemented | NOT EVALUABLE | 100% | No tenant ownership boundary or isolation suite exists | NOT EVALUABLE |
| Financial calculation correctness | Not independently reported | 3/3 ledger fixture invariants pass | 100% of validated cases | Automated Decimal reconciliation, sequence, and duplicate-ID checks | PASS for one fixture only |
| Evidence integrity | Not previously reported | 4/4 manifest files match SHA-256 and byte size | 100% | Added build-time integrity reporting | PASS for manifest integrity only |
| Forecast WAPE / bias / 70% and 90% interval coverage | No paired outcomes; prior model used generic assumptions | NOT EVALUABLE | WAPE <15%; bias ±5%; coverage 65–75% / 85–95% | Forecast now resamples account-specific daily debit totals when adequately supported; no accuracy claim without outcomes | NOT EVALUABLE |
| Calibration ECE | 0.200869 descriptive; 646 labels, 0 positive | 0.200869 descriptive on the same nonrepresentative single-class file | <0.05 on independent representative data | No model improvement can be claimed; real positive labels and independent validation are missing | NOT EVALUABLE |
| Brier skill | Undefined on all-negative data | Undefined; descriptive Brier 0.054832 | >0 vs meaningful baseline | No positive examples or meaningful baseline are available | NOT EVALUABLE |
| Anomaly precision / recall / F1 | Not evaluated | NOT EVALUABLE | Precision ≥85%, recall ≥80%, F1 ≥85% | Added robust amount deviation, prior-only peer frequency, recent velocity, and time features; no independent labels for threshold selection | NOT EVALUABLE |
| API p95 / availability | Not measured | NOT EVALUABLE | <500 ms / ≥99.5% | No representative load test or continuous monitoring window | NOT EVALUABLE |

## Model work and selection

- **Calibration:** no model was trained or calibrated. The 646 supplied labels contain zero positives, so logistic regression, boosting, Platt scaling, isotonic regression, cross-validation, and positive-event performance cannot be selected or validated without inventing labels. Calibration remains a measurement utility, not a fitted production detector.
- **Cash flow:** the prior `Normal(78, 15)` daily spend and 5% emergency defaults were unsupported. The baseline now samples daily totals from the prior 30 UTC days of completed debits, including zero-spend days. It excludes nonselected currencies, refunds, reversals, pending, denied, and unknown states. It requires at least 10 completed debits across 5 distinct spend days; otherwise it returns an insufficient-history state and no personalized forecast values. Future income and emergencies default to zero. A scenario can use clearly user-entered hypothetical spending when historical evidence is insufficient.
- **Forecast model comparison:** no best-accuracy model can be declared. The repository has no raw paired predictions and actual future balances. The empirical bootstrap is selected as a transparent distributional simulation method, not as a proven winner over naive, seasonal, ARIMA, or tree models.
- **Anomalies:** Isolation Forest still ranks batch outliers. Its features now include robust amount deviation, prior-only peer/category frequency, preceding 24-hour and 7-day transaction counts, time-of-week, and currency-separated batches. No classifier threshold was tuned because there is no independent anomaly-label dataset. Alerts remain review signals, not fraud claims.
- **Hyperparameters, training and artifacts:** no supervised training, tuning, or model artifacts were produced. Existing deterministic seeds and model version metadata remain. Training on the single-class calibration file would be invalid.

## Reproduce

From the repository root:

```powershell
npm test
npm run quality:report
npm run build
npm run lint --workspace=server
npm run lint --workspace=client
python verify_evidence.py
```

CI additionally runs `npm audit --audit-level=high` and `pip-audit -r ml-engine/requirements.txt`; a successful pair is required before the combined dependency metric is marked PASS. `npm test` writes the exact case counts and evaluation timestamp. `npm run build` regenerates the scorecard JSON and includes it in the static app build.

## Remaining data and infrastructure needs

1. Timestamped, independently reviewed positive and negative anomaly/calibration labels, with a documented sampling frame and untouched chronological or group holdout.
2. Forecast snapshots stored before outcomes occur, paired to later authoritative closing balances by currency and timezone; retain naive baselines and multiple walk-forward windows.
3. At least 30 days of recent completed debit history with sufficient active spending days for the in-app empirical scenario gate. Longer history is needed for seasonality and recurring receipts.
4. Tenant identity, persistence, ownership-scoped queries, and cross-tenant negative tests before measuring isolation.
5. Coverage instrumentation spanning server, client, and Python; representative HTTP load testing; and continuous uptime measurements over a declared window.
6. A completed independent security review. Dependency scanning does not establish application security.

## Files changed for this remediation

`.github/workflows/ci.yml`; `.gitignore`; `README.md`; `client/.eslintrc.cjs`; `client/src/App.jsx`; `client/src/components/DecisionSupport.jsx`; `client/src/components/Layout.jsx`; `client/src/components/ScenarioSimulator.jsx`; `client/src/index.css`; `client/src/pages/Anomalies.jsx`; `client/src/pages/Dashboard.jsx`; `client/src/pages/EngineeringScorecard.jsx`; `client/src/pages/Forecast.jsx`; `client/src/pages/Insights.jsx`; `client/src/pages/ModelQuality.jsx`; `client/public/quality-scorecard.json`; `client/public/quality-test-results.json`; `client/public/quality-security-results.json`; `docs/DEMO_SCRIPT.md`; `docs/PERFORMANCE_REPORT.md`; `ml-engine/main.py`; `ml-engine/test_main.py`; `package.json`; `scripts/generate-quality-scorecard.mjs`; `scripts/record-security-audit.mjs`; `scripts/run-tests-and-report.mjs`; `server/src/routes.test.js`; `server/src/routes/forecast.js`; `server/src/services/forecast-history.js`; `server/src/services/forecast-history.test.js`; `server/src/services/forecast.js`; `server/src/services/forecast.test.js`; `server/src/services/ledger.js`; `server/src/services/ledger.test.js`.
