# Tools and model disclosure

## PayPal integration

- PayPal REST OAuth 2.0 Client Credentials flow runs on the Express server.
- Reporting balances: `GET /v1/reporting/balances`.
- Transaction Search: `GET /v1/reporting/transactions`, bounded to 31 days and paginated with result deduplication.
- Credentials remain server-side. The app does not implement PayPal merchant OAuth consent and does not process payments.
- Sandbox credentials were configured locally and a previous balance and Transaction Search check succeeded for the account associated with that app. Recheck before recording because access and permissions can change. This is app-account access, not third-party merchant OAuth consent. See [requirements status](HACKATHON_REQUIREMENTS.md).

## AI and analytics

- **Cash-flow forecast:** the Express API's seeded JavaScript Monte Carlo scenario engine is authoritative for the dashboard and scenario simulator. The separate FastAPI NumPy PCG64 endpoint is a reference implementation and is not called by the web app; cross-engine output parity is not claimed. Unverified future income defaults to zero. Assumptions include payment timing/amount, generic operating expenses, emergency-event probability/amount, horizon, reserve threshold, and random seed. The response includes model version, run time, source provenance and sampling uncertainty.
- **Anomaly review:** scikit-learn Isolation Forest over completed records, using log amount, transaction direction, time-of-week availability, and description/category frequency, evaluated separately by currency batch. It excludes refunds/reversals and does not use account balance history. Signals are batch-relative and do not identify intent, establish fraud, or execute actions.
- **Recurring payments:** deterministic rules require repeated completed matching events. Confidence is heuristic and is not calibrated probability.
- **Evidence calibration:** The session-authenticated `GET /api/analysis/calibration` endpoint calculates Brier score, prevalence-baseline Brier score, Brier skill when defined, equal-width ECE, reliability bins, confusion matrix, and thresholded precision/recall/F1. ROC-AUC and PR-AUC are returned only when their label conditions are met. All 646 checked-in labels are negative, making the prevalence baseline Brier score zero and positive-event performance unverified. No independent holdout is possible from rows without timestamps/groups. The raw backtest outcomes are absent, so forecast accuracy cannot be independently replayed.
- **Forecast risk estimates:** The forecast reports both the probability of crossing the reserve threshold on any day and the probability of ending below reserve. Wilson score intervals quantify finite-simulation sampling uncertainty around those proportions; they are not real-world confidence guarantees. Median first-breach day is omitted when fewer than half of paths breach within the horizon.
- **Generative AI:** no LLM or generative model is used. Explanations shown in the UI are fixed descriptions of the model's actual assumptions and outputs.

## Software and developer tools

- React 18, Vite, React Router, TanStack Query, Recharts, Tailwind CSS.
- Node.js, Express, JWT, bcryptjs, Axios, Decimal.js.
- Python, FastAPI, NumPy, scikit-learn.
- CSV/JSON evidence fixtures, SHA-256 manifest, Node/Python test tooling.

## Data handling

The local demo uses checked-in, labeled sample evidence. PayPal Reporting data is requested only when credentials and app permissions work. Client secrets and OAuth bearer tokens must never enter browser code or source control. Browser sessions use HttpOnly cookies; JWT revocation and multi-tenant authorization are not implemented. See [README.md](../README.md) for local setup and [ARCHITECTURE.md](ARCHITECTURE.md) for the data flow.
