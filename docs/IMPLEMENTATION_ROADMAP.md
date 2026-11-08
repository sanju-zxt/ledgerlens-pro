# Implementation roadmap

## Before public submission

1. **Confirm PayPal Sandbox Reporting access.** Transaction Search is enabled for the selected Sandbox app, but fresh Reporting calls still return `403 NOT_AUTHORIZED` and the OAuth response currently has no reporting scope. Recheck after PayPal's permission propagation window; if it persists, verify app/credential pairing and ask PayPal support with the returned debug ID. Do not rotate or publish the secret casually.
2. **Exercise the live path.** Once authorized, create a test transaction between Sandbox buyer and seller accounts, verify the transaction appears through Reporting Search, and record the source label and retrieval time. Verify balances separately; PayPal reporting data can lag.
3. **Publish the repository.** Review the staged file list and secret scan, then publish publicly with the root MIT license and README. The local repository currently has no remote.
4. **Record and publish the demo.** Follow [DEMO_SCRIPT.md](DEMO_SCRIPT.md), keep it under 3 minutes, show the app working, upload publicly to YouTube or Vimeo, and add that URL to the entry.
5. **Complete the Devpost entry.** Add the project description, features, tools/models, public repository URL, runnable setup instructions, hosted demo URL if available, and public video URL.

## Remaining engineering opportunities

- Add a first-party PayPal checkout or payment event flow if the submission needs to demonstrate mock money moving rather than Reporting reads alone.
- Replace the single configured workspace account with a persistent user model and user-scoped data isolation.
- Add a supported merchant authorization flow if the product must connect to third-party PayPal merchants. Current client-credentials reporting is app-account access, not merchant consent.
- Persist an append-only transaction ledger and verify signed PayPal webhooks before using it for ongoing reconciliation.
- Supply raw backtest inputs and independently reproduce the reported metrics before making performance claims.
- Improve recurring and anomaly demo depth with sufficient genuine Sandbox transactions; do not fabricate records.

## Completion gates

- **Integration:** Sandbox balances and transaction search both return successfully using the intended app, with errors and source labels visible in the UI.
- **Reproducibility:** `npm run dev:all` starts all local services; README setup works from a clean checkout.
- **Integrity:** `npm run validate` passes and `.env` is not tracked.
- **Submission:** public repo/license, accurate Devpost text/tools disclosure, and a public video shorter than three minutes are present.
