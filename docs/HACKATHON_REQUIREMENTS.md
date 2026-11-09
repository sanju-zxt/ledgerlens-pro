# PayPal AI Hackathon submission checklist

This checklist follows the participant email and the [official rules](https://paypalaihackathon.devpost.com/rules). Keep statuses current before submitting.

## What the project does

LedgerLens Pro is a cash-flow planning workspace for PayPal merchants. It combines PayPal Reporting data (when Sandbox permissions are active) with a separately labeled evidence demo, reproducible cash-flow simulations, transaction review, recurring-payment rules, and statistical anomaly review. It is read-only: it does not initiate, authorize, capture, refund, or move payments.

## Requirements and status

| Requirement | Current state | Submission action |
| --- | --- | --- |
| PayPal developer platform, Sandbox | Local server-side OAuth 2.0 Client Credentials integration has successfully fetched Reporting balances and one completed transaction. A sanitized, hashed verification report is in `evidence/paypal_sandbox_verification.json`. Hosted credentials remain unverified. | Configure and verify the Render API secrets before recording. Describe this as app-account access, not third-party merchant consent. Never describe fixture data as live PayPal data. |
| AI tool/model | Seeded Monte Carlo forecast, recurring detector, Isolation Forest anomaly service, and a separate controlled synthetic benchmark with chronological splits, calibration comparison, and baseline. Synthetic results are clearly labeled and never count as PayPal/customer performance. | Show assumptions and uncertainty; state that anomaly flags are not fraud findings. |
| Functional demo | Hosted client: [ledgerlens-pro.vercel.app](https://ledgerlens-pro.vercel.app). This remediation is local and has not been pushed or deployed; hosted behavior must be rechecked after deployment. | Publish the reviewed code, redeploy, then verify the PayPal Sandbox path on Render separately; local Sandbox success is not proof of hosted connectivity. |
| Public repository | Public repository: [sanju-zxt/ledgerlens-pro](https://github.com/sanju-zxt/ledgerlens-pro). Earlier implementation was pushed on `codex/ledgerlens-pro-submission`; changes from this remediation remain local. | Publish the reviewed branch on the default branch before submission. Confirm `.env` and credentials are not tracked. |
| Open-source license | MIT license added at the repository root. | Confirm ownership and license suitability before publication. |
| Project description | Product summary is in the README. | Copy/refine a short feature description for Devpost. |
| Tools explanation | [TOOLS_AND_MODELS.md](TOOLS_AND_MODELS.md) documents software and models. | Include the tools disclosure in the Devpost submission. |
| Demo video under 3 minutes | [DEMO_SCRIPT.md](DEMO_SCRIPT.md) is ready. No video has been recorded or posted. | Record the working app, upload publicly to YouTube or Vimeo, and add its URL to Devpost. |
| Evidence integrity | CSV evidence and sanitized PayPal Sandbox check are labeled, reconciled, and hash-manifested. Local validation currently passes; referenced raw historical backtest outcomes are still absent. | Run `npm run validate` before publication; disclose unavailable raw backtest source files. |

## Claims the submission can support

- Fixture closing balance is $6,982.56 as of 2026-10-15 and reconciles from the checked-in movement rows.
- The separate PayPal balance fixture is not merged into that movement ledger.
- Forecast outputs are modeled results and depend on stated assumptions.
- The demo uses only labeled fixture data unless PayPal Reporting calls succeed.

Do not claim current live Sandbox connectivity until a fresh API request succeeds. The implementation uses server-to-server Reporting credentials; it is not a merchant OAuth consent flow and does not provide access to unrelated merchants' accounts.
