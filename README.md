# LedgerLens Pro

**Navigate your future with transparent financial intelligence.** LedgerLens is a merchant cash-flow planning prototype built around PayPal reporting data, reproducible forecasts, and auditable evidence.

**Open-source license:** MIT. The root [LICENSE](LICENSE) file contains the full text. MIT is an OSI-approved open-source license.

## Current scope and data labels

- The included balance ledger is a small **sandbox evidence fixture**, dated October 15, 2026. It is not a connected merchant account.
- The example sequence reconciles independently: $3,500.00 opening + $3,500.00 credit − $17.44 debit = $6,982.56. The evidence calls the debit a movement; it does not prove that it is a PayPal fee.
- The captured PayPal balance response is a distinct snapshot showing $3,500.00 total, $3,482.56 available, and $17.44 withheld. It is not added to the ledger movements.
- Forecasts are simulations. Baseline future income and emergencies are zero; recent completed debits are bootstrapped empirically only when the 30-day history has at least 10 debits across 5 spend days. Sparse history suppresses the personal forecast instead of substituting generic spend assumptions. Scenario receipts and manually entered costs are explicitly hypothetical.
- Backtest metadata contains 12 consecutive windows. Its referenced raw outcome files are absent, so results cannot be independently reproduced or used to substantiate performance claims.
- Calibration data has 646 rows. `python verify_evidence.py` calculates the checked-in set’s metrics; do not substitute the unverified metrics quoted in prior notes.
- The calibration labels in the checked-in file are all negative. The UI computes Brier, prevalence baseline, equal-width ECE, reliability bins, and class metrics where defined; the zero-prevalence baseline Brier is zero, so Brier skill and positive-event performance cannot be validated on this file.
- The workspace includes a collapsible navigation menu, model-quality and engineering-scorecard pages, and a build-update page. The scorecard records targets, measured values, evidence sources, sample sizes, evaluation times, and status; unavailable metrics stay NOT EVALUABLE.
- The local PayPal Sandbox Reporting connection was verified on 2026-11-09: the balance and Transaction Search endpoints succeeded for the account associated with the configured app credentials. A sanitized report is stored in `evidence/paypal_sandbox_verification.json`; it contains no transaction IDs, descriptions, or amounts. This does not verify the deployed Render secrets or third-party merchant OAuth.

## Technologies and implementation

| Component | Stack | Local port |
| --- | --- | ---: |
| Web client | React 18, Vite, TanStack Query, Recharts, Tailwind | 3000 |
| API | Express 4, JWT, Decimal.js, PayPal Reporting API | 4000 |
| ML service | FastAPI, NumPy PCG64, scikit-learn Isolation Forest | 8001 |
| Evidence | Read-only CSV/JSON fixtures and SHA-256 manifest | — |

### PayPal integration

The Express API uses PayPal OAuth 2.0 client-credentials authentication on the server to call the PayPal Reporting API. It can request balance snapshots and Transaction Search results for the PayPal account associated with the configured app credentials. The browser calls LedgerLens endpoints; PayPal secrets and access tokens stay on the server. Reporting credentials are read-only and do not initiate payments.

The transaction view and anomaly review can use either clearly identified checked-in Sandbox evidence or PayPal Transaction Search results. Sandbox API access was verified locally on 2026-11-09; this does not verify the hosted Render credentials. App credentials do not let another merchant connect their PayPal account. Merchant OAuth consent, webhooks, and multi-merchant account isolation are not implemented.

### AI and financial calculations

- **Unusual-activity review:** the Python ML service applies scikit-learn Isolation Forest to transaction features such as robust amount deviation, prior-only description/category frequency, transaction velocity, time, and currency-specific peer groups. It returns statistical review prompts, not fraud determinations. Requests with fewer than three completed transactions in a currency group are skipped.
- **Supervised review model:** reviewed labels can be collected with provenance and evaluated chronologically. It is activated only when the tenant-scoped model passes the configured validation gate; current evidence is insufficient to establish real-world precision, recall, F1, or calibration quality.
- **Cash-flow forecast:** the dashboard uses an explicitly seeded JavaScript Monte Carlo simulation that resamples eligible historical daily debits. It is a statistical simulation, not a trained AI forecast model. Future receipts and scenario costs are assumptions, and forecast accuracy has not been validated against matched real outcomes.
- **Evidence and arithmetic:** the API uses Decimal.js for ledger reconciliation. The read-only evidence manifest uses SHA-256 hashes to make fixture integrity checks reproducible.

The FastAPI forecast endpoint is an independent reference implementation and is not consumed by the dashboard; cross-engine bit-for-bit parity is not claimed. PostgreSQL persistence, merchant OAuth consent, verified webhooks, and persistent idempotency storage are not implemented, so this is not yet a multi-merchant SaaS product.

## Setup and run locally

Requirements: Node.js 20.19+ (or 22.12+), Python 3.10+, and npm. PowerShell is needed only for the optional manifest validator on Windows.

```powershell
npm install
python -m pip install -r ml-engine/requirements.txt
npm run dev:all
```

Open <http://localhost:3000/login> and choose **Explore the sandbox demo**. This creates a short-lived local session and uses only the checked-in, labeled evidence fixture. It does not access a PayPal account. The API and ML service run on ports 4000 and 8001.

### Optional PayPal Sandbox connection

To query the PayPal account associated with your Sandbox app, open PayPal Developer Dashboard → Apps & Credentials → Sandbox. Select a REST API app and enable the needed Reporting permissions. Add that app's Sandbox Client ID and Secret to the server's local `.env` file:

```env
PAYPAL_ENV=sandbox
PAYPAL_CLIENT_ID=your_sandbox_client_id
PAYPAL_CLIENT_SECRET=your_sandbox_client_secret
```

Restart LedgerLens after editing `.env`. Use Settings → PayPal Reporting API to check status and request balances. Transaction Search returns data only after Sandbox transactions exist and PayPal makes reporting data available. Credentials grant access associated with the PayPal app owner; they do not let an arbitrary merchant connect their own account. A real third-party merchant connection requires an approved PayPal partner/onboarding flow.

Run `npm run paypal:verify:sandbox` to make a fresh read-only request to both Reporting endpoints. The command refuses `PAYPAL_ENV=production`, prints only endpoint status, currencies, counts and timestamps, and updates the sanitized evidence report. Do not upload or commit `.env` or PayPal API responses containing transaction details.

### Optional email/password workspace login

The one-click local demo is the recommended evaluation path. To enable configured email/password login, copy `.env.example` to `.env`, set a strong random `JWT_SECRET` of at least 32 characters, and set `DEMO_EMAIL`. Generate a bcrypt password hash with:

```powershell
node -e "console.log(require('bcryptjs').hashSync('your-local-demo-password', 12))"
```

Put the resulting hash in `DEMO_PASSWORD_HASH`. `.env` is ignored by Git. Do not use production PayPal credentials for the hackathon demo.

## API outline

Protected API routes use a short-lived HttpOnly session cookie in the web client:

| Method | Route | Purpose |
| --- | --- | --- |
| POST | `/api/auth/login` | Configured email/password login |
| GET | `/api/auth/me` | Validate current session |
| GET | `/api/transactions?limit=50&page=1` | Sandbox evidence; `source=paypal` requests live Transaction Search |
| GET | `/api/transactions/reconciliation` | Decimal-based fixture reconciliation |
| GET | `/api/forecast` | 30-day empirical-bootstrap simulation when recent debit history meets the stated minimum; otherwise returns insufficient-history status without forecast metrics |
| POST | `/api/forecast/simulate` | Run a clearly hypothetical receipt/cost scenario; an explicit daily-spend input is required when history is insufficient |
| GET | `/api/analysis/calibration` | Calculate calibration metrics from checked-in labeled rows |
| GET | `/api/paypal/status` | Credential configuration status |
| GET | `/api/paypal/balances` | PayPal Reporting balance snapshot, with retrieval provenance |
| GET | `/api/analysis/recurring?source=paypal` | Rule-based recurring pattern candidates |
| POST | `/api/analysis/anomalies` | Forward transaction batch to the Python Isolation Forest service |
| GET | `/api/evidence/:name` | Read-only access to allowlisted evidence files |
| GET | `/api/evidence/manifest` | Read current SHA-256 manifest |
| GET | `/api/dashboard/summary` | Evidence balance in demo mode or PayPal available balances for the credential-owning account |

ML service endpoints: `GET /health`, `POST /forecast` (reference only; zero future-income default), `POST /anomaly`, and `POST /calibration` on port 8001. Forecast and anomaly results are estimates and statistical signals, not observations or confirmed fraud. Web sessions use an HttpOnly cookie; the server also accepts legacy bearer tokens but does not return tokens to browser code.

PayPal reporting balances can lag; PayPal documents that balances may take up to three hours to appear. Transaction Search uses OAuth 2.0 client credentials and requests are limited to a 31-day window. Pagination is bounded and results are deduplicated by PayPal transaction ID. See [Transaction Search API](https://developer.paypal.com/docs/api/transaction-search/v1/) and [PayPal Reporting balances](https://developer.paypal.com/api/transaction-search/v1/balances-get/).

## Testing and evidence

```powershell
npm run build
npm test
python verify_evidence.py
npm run manifest
npm run validate
```

`verify_evidence.py` checks evidence manifest hashes/sizes, sequence and balance reconciliation, backtest metadata schema/window continuity, calibration values and class distribution, and balance fixture currency consistency. It reports missing raw backtest files and undocumented timestamp semantics; metadata validation is not independent validation of forecast outcomes. If a raw backtest file is supplied, it must match the documented forecast outcome schema and pass duplicate, date, finite-value, interval-order and currency checks.

`npm test` writes case-level results to `client/public/quality-test-results.json`. `npm run quality:report` generates `client/public/quality-scorecard.json`; the root production build runs this report automatically. CI runs dependency audits and uploads the scorecard, test summary and audit result as a build artifact. Coverage, tenant isolation, forecast accuracy, calibration quality and service-level metrics remain NOT EVALUABLE until their measurement systems and representative datasets exist.

`npm run quality:refresh` regenerates the fixed-seed controlled synthetic benchmark and then writes the scorecard. Its results are visibly labeled synthetic, shown separately on the Model Quality page, and never combined with real-data performance claims. `npm run quality:report` only writes the Node-based scorecard from checked-in evidence and benchmark output, so the Vercel client build does not require Python/ML libraries. CI runs `quality:refresh` in its Python-enabled environment. `npm run manifest` calculates SHA-256 and byte sizes directly from checked-in evidence files and records the current Git commit as its provenance anchor. It does not alter source evidence. `npm run validate` verifies that anchor in the current history, checks the manifest hashes/sizes, and runs semantic checks. Regenerate the manifest after changing evidence files.

## Hackathon materials

- [Requirements and completion status](docs/HACKATHON_REQUIREMENTS.md)
- [Implementation roadmap](docs/IMPLEMENTATION_ROADMAP.md)
- [Architecture and trust boundaries](docs/ARCHITECTURE.md)
- [Evidence methodology and backtest format](docs/EVIDENCE_METHODOLOGY.md)
- [Timed demo script](docs/DEMO_SCRIPT.md)
- [Tools and model disclosure](docs/TOOLS_AND_MODELS.md)
- [Reviewed model-data and evaluation pipeline](docs/MODEL_DATA_PIPELINE.md)
- [Operations, persistent storage, and recovery](docs/OPERATIONS.md)
- [Release readiness gates](docs/RELEASE_READINESS.md)

## Deployment

The repository includes a Vercel client configuration in `vercel.json` and a Render API/ML blueprint in `render.yaml`. This keeps the browser UI and server-side PayPal credentials on separate services. Render free services may sleep and have cold starts; select a paid plan only after reviewing the provider's current pricing and limits.

1. Push the reviewed code to the public GitHub repository. Import it into Vercel with the repository root as the project root. The Vercel config proxies same-origin `/api/*` requests to the Render API and provides SPA route fallback; the browser does not need a cross-site API URL.
2. In Render, create a Blueprint from `render.yaml`. It creates the API and ML services and protects the ML HTTPS endpoint with a shared secret generated by Render. The Blueprint allows the deployed Vercel origin for browser API calls. If you change the Vercel domain, update `CLIENT_ORIGIN` accordingly. Never add secrets to Git or `VITE_*` variables. The PayPal secret placeholders are prompted during first Blueprint creation; on an existing Blueprint, add them manually under the API service's Environment settings.
3. For server-to-server Sandbox reporting, set `PAYPAL_CLIENT_ID` and `PAYPAL_CLIENT_SECRET` in the Render API service's secret environment, and keep `PAYPAL_ENV=sandbox`. Reporting permissions must be granted for the configured app; credentials only access the associated PayPal account. The new sanitized local report does not prove that the deployed secrets work; run the verifier from the deployed environment before claiming hosted access.
4. Configure `DEMO_EMAIL` and `DEMO_PASSWORD_HASH` on the Render API service to enable the single configured workspace login. Generate the hash locally with `node -e "console.log(require('bcryptjs').hashSync('your-password', 12))"`; put only the hash in Render. On an existing Blueprint, new `sync:false` variables may need to be added manually in the service's Environment settings. Do not paste the password into chat or commit it.
5. Wait for both Render health checks and visit the Vercel deployment. Sign in to the configured workspace, verify Sandbox balances and Transaction Search, then review source transactions. A successful evidence demo is not proof of live PayPal access.
6. Before collecting hosted model labels or forecast snapshots, attach a persistent disk mounted at `/var/data` to the ML service and set `MODEL_DATA_PATH=/var/data/model-quality.sqlite3`. The service rejects a Render storage path outside that mount. Without a persistent disk and path, model-data endpoints intentionally return `503`; the container filesystem is not treated as durable. Render's free web services cannot attach persistent disks; paid storage adds cost, so choose and authorize a plan before enabling it. The current Sandbox account returned only one completed transaction and cannot meet the training sample gate. Use independently reviewed live Sandbox history to build the dataset over time.

The blueprint is configured for Render's free web-service tier to avoid silently selecting a paid plan. Review current service limits before using it for an important demo. This deployment remains a single-app/account integration, not a multi-merchant SaaS: persistent user accounts, tenant isolation, merchant OAuth onboarding, durable ledger storage, and signed webhook processing are not implemented.

## Security and production readiness

- Configure a strong JWT secret and bcrypt password hash. Auth is intentionally unavailable until configured. Web sessions use a short-lived HttpOnly, Secure, SameSite=Lax cookie in production and origin checks on state-changing requests. Logout clears the cookie, but stateless JWTs cannot be revoked before expiry. Authentication is still one configured account, rate limiting is process-local, and the app has no tenant isolation; it is not suitable for public multi-user production deployment.
- Store PayPal secrets only in the server environment; never commit `.env` or expose tokens to the client.
- The PayPal integration uses server-to-server reporting credentials, not merchant OAuth consent. It cannot grant universal access to third-party merchant accounts.
- No webhook endpoint is enabled: reliable webhook signature verification, event deduplication, and append-only durable storage require a configured webhook ID and persistent database, which are not present in this repository.
- Local PayPal Sandbox balance and Transaction Search calls succeeded with the credentials available in the developer's ignored local environment; hosted Render credentials remain unverified. No third-party merchant consent flow exists.

## Three-minute demo script

1. **0:00–0:30 — Ground the data.** Show the Dashboard source badge. The fresh local Sandbox verification succeeded; explain that the data belongs to the account associated with the configured app credentials, not an arbitrary merchant. If hosted PayPal calls are not verified, use the labeled evidence demo and state that clearly.
2. **0:30–1:00 — Reconcile.** Open Transactions and trace the $3,500 opening, $3,500 credit, $17.44 debit, and $6,982.56 closing in the evidence file. Mention the separate balance API snapshot.
3. **1:00–1:40 — Explore uncertainty.** Open Forecast and explain the 10,000 seeded paths, 15th–85th percentile range, separate reserve-risk measures, Monte Carlo sampling interval, and illustrative future-inflow assumption.
4. **1:40–2:15 — Simulate a decision.** Change inflow delay, forced emergency expense, or operating-cost reduction on Forecast and run the scenario; explain that outputs are modeled outcomes, not guarantees.
5. **2:15–2:40 — Review signals.** Show the recurring-obligation rules and explain that anomaly alerts are statistical review prompts, not fraud labels.
6. **2:40–3:00 — Verify integrity.** Open Settings and run `npm run validate`. State that the 12 historical backtest windows lack their referenced raw outcome CSVs, so no forecast accuracy claim is made.

## Submission assessment

The local prototype has a working UI, single-account configured authentication, deterministic forecasting, a server-side PayPal Reporting client verified against Sandbox, ML endpoints, and integrity checks for supplied files. It is **not production-ready**: hosted credential verification, multi-user identity and tenant isolation, partner-approved merchant consent/onboarding, paid persistent storage, webhook verification, raw backtest outcome data, video publication, and deployment/security review remain open. Successful API calls from app credentials prove access for that credential-owning account only.
