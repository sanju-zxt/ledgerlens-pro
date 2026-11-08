# LedgerLens Pro

**Navigate your future with transparent financial intelligence.** LedgerLens is a merchant cash-flow planning prototype built around PayPal reporting data, reproducible forecasts, and auditable evidence.

## Current scope and data labels

- The included balance ledger is a small **sandbox evidence fixture**, dated October 15, 2026. It is not a connected merchant account.
- The example sequence reconciles independently: $3,500.00 opening + $3,500.00 credit − $17.44 debit = $6,982.56. The evidence calls the debit a movement; it does not prove that it is a PayPal fee.
- The captured PayPal balance response is a distinct snapshot showing $3,500.00 total, $3,482.56 available, and $17.44 withheld. It is not added to the ledger movements.
- Forecasts are simulations. The dashboard’s illustrative $3,500 future inflow is based on a prior sandbox credit and is **not** a scheduled or verified payment.
- Backtest metadata contains 12 consecutive windows. Its referenced raw outcome files are absent, so results cannot be independently reproduced or used to substantiate performance claims.
- Calibration data has 646 rows. `python verify_evidence.py` calculates the checked-in set’s metrics; do not substitute the unverified metrics quoted in prior notes.

## Architecture

| Component | Stack | Local port |
| --- | --- | ---: |
| Web client | React 18, Vite, TanStack Query, Recharts, Tailwind | 3000 |
| API | Express 4, JWT, Decimal.js, PayPal Reporting API | 4000 |
| ML service | FastAPI, NumPy PCG64, scikit-learn Isolation Forest | 8001 |
| Evidence | Read-only CSV/JSON fixtures and SHA-256 manifest | — |

The current API forecast uses a seeded JavaScript Monte Carlo engine so the dashboard works without Python. The separate FastAPI service exposes the independently configurable Monte Carlo, anomaly, and calibration endpoints. PostgreSQL persistence, merchant OAuth consent, verified webhooks, and persistent idempotency storage are not implemented.

## Setup

Requirements: Node.js 20.19+ (or 22.12+), Python 3.10+, and npm. PowerShell is needed only for the optional manifest validator on Windows.

```powershell
npm install
python -m pip install -r ml-engine/requirements.txt
npm run dev:all
```

Open <http://localhost:3000/login> and choose **Explore the sandbox demo**. This creates a short-lived local session and uses only the checked-in, labeled evidence fixture. It does not access a PayPal account. The API and ML service run on ports 4000 and 8001.

### Optional PayPal Sandbox connection

To query your own Sandbox app, open PayPal Developer Dashboard → Apps & Credentials → Sandbox. Select a REST API app and enable **Transaction Search**. Add that app's Sandbox Client ID and Secret to the server's local `.env` file:

```env
PAYPAL_ENV=sandbox
PAYPAL_CLIENT_ID=your_sandbox_client_id
PAYPAL_CLIENT_SECRET=your_sandbox_client_secret
```

Restart LedgerLens after editing `.env`. Permission changes can take time to propagate through PayPal OAuth tokens. The evidence demo remains usable while waiting. Use Settings → PayPal Reporting API to check status and request balances. Transaction Search returns data only after Sandbox transactions exist and PayPal makes reporting data available.

### Optional email/password workspace login

The one-click local demo is the recommended evaluation path. To enable configured email/password login, copy `.env.example` to `.env`, set a strong random `JWT_SECRET` of at least 32 characters, and set `DEMO_EMAIL`. Generate a bcrypt password hash with:

```powershell
node -e "console.log(require('bcryptjs').hashSync('your-local-demo-password', 12))"
```

Put the resulting hash in `DEMO_PASSWORD_HASH`. `.env` is ignored by Git. Do not use production PayPal credentials for the hackathon demo.

## API outline

Protected API routes require `Authorization: Bearer <token>`:

| Method | Route | Purpose |
| --- | --- | --- |
| POST | `/api/auth/login` | Configured email/password login |
| GET | `/api/auth/me` | Validate current session |
| GET | `/api/transactions?limit=50&page=1` | Sandbox evidence; `source=paypal` requests live Transaction Search |
| GET | `/api/transactions/reconciliation` | Decimal-based fixture reconciliation |
| GET | `/api/forecast` | Deterministic 30-day Monte Carlo forecast |
| POST | `/api/forecast/simulate` | Run an illustrative income-delay/emergency/savings scenario |
| GET | `/api/paypal/status` | Credential configuration status |
| GET | `/api/paypal/balances` | PayPal Reporting balance snapshot, with retrieval provenance |
| GET | `/api/analysis/recurring?source=paypal` | Rule-based recurring pattern candidates |
| POST | `/api/analysis/anomalies` | Forward transaction batch to the Python Isolation Forest service |
| GET | `/api/evidence/:name` | Read-only access to allowlisted evidence files |
| GET | `/api/evidence/manifest` | Read current SHA-256 manifest |
| GET | `/api/dashboard/summary` | Fixture balance used by the dashboard |

ML service endpoints: `GET /health`, `POST /forecast`, `POST /anomaly`, and `POST /calibration` on port 8001. Forecast and anomaly results are estimates and statistical signals, not observations or confirmed fraud.

PayPal reporting balances can lag; PayPal documents that balances may take up to three hours to appear. Transaction Search uses OAuth 2.0 client credentials and requests are limited to a 31-day window. Pagination is bounded and results are deduplicated by PayPal transaction ID. See [Transaction Search API](https://developer.paypal.com/docs/api/transaction-search/v1/) and [PayPal Reporting balances](https://developer.paypal.com/api/transaction-search/v1/balances-get/).

## Testing and evidence

```powershell
npm run build
npm test
python verify_evidence.py
npm run manifest
npm run validate
```

`verify_evidence.py` checks sequence and balance reconciliation, backtest window metadata, calibration value ranges, and balance fixture currency consistency. It reports missing raw backtest files as a warning; metadata validation is not independent validation of forecast outcomes.

`npm run manifest` calculates SHA-256 and byte sizes directly from the four checked-in evidence files and records the current Git commit as its provenance anchor. It does not alter evidence. `npm run validate` verifies that anchor is in the current history, checks the manifest hashes/sizes, and runs semantic checks. Regenerate the manifest after changing evidence files.

## Hackathon materials

- [Requirements and completion status](docs/HACKATHON_REQUIREMENTS.md)
- [Implementation roadmap](docs/IMPLEMENTATION_ROADMAP.md)
- [Architecture and trust boundaries](docs/ARCHITECTURE.md)
- [Timed demo script](docs/DEMO_SCRIPT.md)
- [Tools and model disclosure](docs/TOOLS_AND_MODELS.md)

## Deployment outline

For a static client plus API and ML services (for example, separate Render services):

1. **Client static site:** repository root as the build context; build with `npm ci && npm run build`; publish `client/dist`. Set `VITE_API_URL` at build time to the API origin plus `/api` (for example `https://ledgerlens-api.example.com/api`). Configure an SPA rewrite to `/index.html`.
2. **Express API:** repository root as the build context; start with `npm run start --workspace=server`. Set `PORT`, `CLIENT_ORIGIN`, `JWT_SECRET`, `DEMO_EMAIL`, `DEMO_PASSWORD_HASH`, `PAYPAL_ENV`, and the PayPal client credentials. Set `ML_ENGINE_URL` to the reachable ML service URL.
3. **FastAPI ML service:** use `ml-engine` as the service root; install `-r requirements.txt`; start with `python -m uvicorn main:app --host 0.0.0.0 --port $PORT`.
4. **Verify:** use the provider health checks, confirm login, and test PayPal Sandbox credentials and required Reporting scopes. The evidence fixture is not a substitute for live Sandbox validation.

Use HTTPS for every public service. Store secrets in the hosting provider’s environment manager. Do not deploy with the example JWT secret or demo hash placeholders. Webhooks and durable ledger storage must be added before relying on this deployment for balance updates.

## Security and production readiness

- Configure a strong JWT secret and bcrypt password hash. Auth is intentionally unavailable until configured.
- Store PayPal secrets only in the server environment; never commit `.env` or expose tokens to the client.
- The PayPal integration uses server-to-server reporting credentials, not merchant OAuth consent. It cannot grant universal access to third-party merchant accounts.
- No webhook endpoint is enabled: reliable webhook signature verification, event deduplication, and append-only durable storage require a configured webhook ID and persistent database, which are not present in this repository.
- No automated dependency vulnerability scan or live PayPal Sandbox call was possible without credentials.

## Three-minute demo script

1. **0:00–0:30 — Ground the data.** Show the Dashboard badge and explain that the visible balance comes from dated sandbox evidence, not a live merchant account.
2. **0:30–1:00 — Reconcile.** Open Transactions and trace the $3,500 opening, $3,500 credit, $17.44 debit, and $6,982.56 closing in the evidence file. Mention the separate balance API snapshot.
3. **1:00–1:40 — Explore uncertainty.** Open Forecast and explain the 10,000 seeded paths, 15th–85th percentile range, reserve-breach probability, and illustrative future-inflow assumption.
4. **1:40–2:15 — Simulate a decision.** Change delay, emergency expense, or cost reduction on the Dashboard and run the scenario; explain that outputs are modeled outcomes, not guarantees.
5. **2:15–2:40 — Review signals.** Show the recurring-obligation rules and explain that anomaly alerts are statistical review prompts, not fraud labels.
6. **2:40–3:00 — Verify integrity.** Open Settings and run `npm run validate`. State that live Sandbox access requires merchant credentials and that raw backtest source CSVs are not included.

## Submission assessment

The local prototype has a working UI, configurable server authentication, deterministic forecasting, a server-side PayPal Reporting client, ML endpoints, and integrity checks for supplied files. It is **not production-ready**: persistence, a supported OAuth merchant connection flow, webhook verification, raw backtest outcome data, end-to-end coverage, and live Sandbox validation remain open.
