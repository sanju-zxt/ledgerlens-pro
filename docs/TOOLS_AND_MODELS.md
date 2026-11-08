# Tools and model disclosure

## PayPal integration

- PayPal REST OAuth 2.0 Client Credentials flow runs on the Express server.
- Reporting balances: `GET /v1/reporting/balances`.
- Transaction Search: `GET /v1/reporting/transactions`, bounded to 31 days and paginated with result deduplication.
- Credentials remain server-side. The app does not implement PayPal merchant OAuth consent and does not process payments.
- Sandbox credentials are configured locally. At the time of this document, PayPal responds `403 NOT_AUTHORIZED` to both Reporting endpoints while the app's Transaction Search feature is being authorized. See [requirements status](HACKATHON_REQUIREMENTS.md).

## AI and analytics

- **Cash-flow forecast:** seeded Monte Carlo simulation. The client dashboard currently uses the Express JavaScript implementation; FastAPI also exposes a NumPy PCG64 implementation. Assumptions include payment timing/amount, operating expenses, emergency-event probability/amount, horizon, reserve threshold, and random seed. Reproducibility and uncertainty bands are exposed. No output is represented as a guaranteed future balance.
- **Anomaly review:** scikit-learn Isolation Forest over eligible transaction amounts, with a fixed random state and configurable contamination/sensitivity. This is a statistical outlier detector; it does not identify intent, establish fraud, or execute actions.
- **Recurring payments:** deterministic rules require repeated completed matching events. Confidence is heuristic and is not calibrated probability.
- **Evidence calibration:** Brier score and equal-width expected calibration error are computed by the ML service for supplied labeled observations. The checked-in raw backtest source windows are incomplete, so those unavailable inputs cannot be independently replayed.
- **Generative AI:** no LLM or generative model is used. Explanations shown in the UI are fixed descriptions of the model's actual assumptions and outputs.

## Software and developer tools

- React 18, Vite, React Router, TanStack Query, Recharts, Tailwind CSS.
- Node.js, Express, JWT, bcryptjs, Axios, Decimal.js.
- Python, FastAPI, NumPy, scikit-learn.
- CSV/JSON evidence fixtures, SHA-256 manifest, Node/Python test tooling.

## Data handling

The local demo uses checked-in, labeled sample evidence. PayPal Reporting data is requested only when credentials and app permissions work. Client secrets and OAuth bearer tokens must never enter browser code or source control. See [README.md](../README.md) for local setup and [ARCHITECTURE.md](ARCHITECTURE.md) for the data flow.
