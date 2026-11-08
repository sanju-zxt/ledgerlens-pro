# PayPal AI Hackathon submission checklist

This checklist follows the participant email and the [official rules](https://paypalaihackathon.devpost.com/rules). Keep statuses current before submitting.

## What the project does

LedgerLens Pro is a cash-flow planning workspace for PayPal merchants. It combines PayPal Reporting data (when Sandbox permissions are active) with a separately labeled evidence demo, reproducible cash-flow simulations, transaction review, recurring-payment rules, and statistical anomaly review. It is read-only: it does not initiate, authorize, capture, refund, or move payments.

## Requirements and status

| Requirement | Current state | Submission action |
| --- | --- | --- |
| PayPal developer platform, Sandbox | Server-side OAuth 2.0 Client Credentials integration is implemented for Reporting balances and Transaction Search. Credentials are configured locally. Sandbox currently returns `403 NOT_AUTHORIZED`; the app token has no reporting scope even though Transaction Search is enabled. | Recheck after PayPal permission propagation; capture a successful Sandbox request in the demo. Never describe fixture data as a live PayPal connection. |
| AI tool/model | Seeded Monte Carlo cash-flow forecast, rule-based recurring detector, and scikit-learn Isolation Forest anomaly service. Details and limits are in [TOOLS_AND_MODELS.md](TOOLS_AND_MODELS.md). | Show assumptions and uncertainty; state that anomaly flags are not fraud findings. |
| Functional demo | Local one-click evidence demo works at `http://localhost:3000` after `npm install`, installing Python requirements, and `npm run dev:all`. | A hosted demo is not configured. A judge can run locally using the README. |
| Public repository | Source is in the local Git repository; no Git remote is configured. | Publish a public GitHub repository and verify it contains no `.env`, tokens, credentials, or private data. |
| Open-source license | MIT license added at the repository root. | Confirm ownership and license suitability before publication. |
| Project description | Product summary is in the README. | Copy/refine a short feature description for Devpost. |
| Tools explanation | [TOOLS_AND_MODELS.md](TOOLS_AND_MODELS.md) documents software and models. | Include the tools disclosure in the Devpost submission. |
| Demo video under 3 minutes | [DEMO_SCRIPT.md](DEMO_SCRIPT.md) is ready. No video has been recorded or posted. | Record the working app, upload publicly to YouTube or Vimeo, and add its URL to Devpost. |
| Evidence integrity | CSV evidence is labeled, reconciled, and hash-manifested. | Run `npm run validate` before publication; disclose unavailable raw backtest source files. |

## Claims the submission can support

- Fixture closing balance is $6,982.56 as of 2026-10-15 and reconciles from the checked-in movement rows.
- The separate PayPal balance fixture is not merged into that movement ledger.
- Forecast outputs are modeled results and depend on stated assumptions.
- The demo uses only labeled fixture data unless PayPal Reporting calls succeed.

Do not claim current live Sandbox connectivity until a fresh API request succeeds. The implementation uses server-to-server Reporting credentials; it is not a merchant OAuth consent flow and does not provide access to unrelated merchants' accounts.
