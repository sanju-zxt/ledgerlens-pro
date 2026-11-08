# PayPal AI Hackathon submission checklist

This checklist follows the participant email and the [official rules](https://paypalaihackathon.devpost.com/rules). Keep statuses current before submitting.

## What the project does

LedgerLens Pro is a cash-flow planning workspace for PayPal merchants. It combines PayPal Reporting data (when Sandbox permissions are active) with a separately labeled evidence demo, reproducible cash-flow simulations, transaction review, recurring-payment rules, and statistical anomaly review. It is read-only: it does not initiate, authorize, capture, refund, or move payments.

## Requirements and status

| Requirement | Current state | Submission action |
| --- | --- | --- |
| PayPal developer platform, Sandbox | Server-side OAuth 2.0 Client Credentials integration is implemented for Reporting balances and Transaction Search. A prior local check succeeded for the account associated with the configured Sandbox app; live access can expire or permissions can change. | Recheck both APIs immediately before recording. Describe this as app-account access, not third-party merchant consent. Never describe fixture data as live PayPal data. |
| AI tool/model | Seeded Monte Carlo cash-flow forecast, rule-based recurring detector, and scikit-learn Isolation Forest anomaly service. Details and limits are in [TOOLS_AND_MODELS.md](TOOLS_AND_MODELS.md). | Show assumptions and uncertainty; state that anomaly flags are not fraud findings. |
| Functional demo | Local evidence demo works at `http://localhost:3000` after `npm install`, installing Python requirements, and `npm run dev:all`. A fresh local check returned Sandbox balances and Transaction Search data for the account associated with the configured app credentials. | Hosted Vercel + Render configuration is committed, but no hosted deployment exists yet. Recheck local startup and Sandbox credentials before recording. |
| Public repository | Public repository: [sanju-zxt/ledgerlens-pro](https://github.com/sanju-zxt/ledgerlens-pro). The completed implementation is pushed on `codex/ledgerlens-pro-submission`; default `main` has not been updated. | Merge or publish the reviewed branch on the default branch before submission. Confirm `.env` and credentials are not tracked. |
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
