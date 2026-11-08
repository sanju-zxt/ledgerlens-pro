# Implementation roadmap

## Before public submission

1. **Verify hosted PayPal Sandbox access.** The integration is implemented, but credentials have not been configured on the hosted API. Configure server-side secrets and verify balances plus Transaction Search immediately before recording. Never publish credentials.
2. **Exercise the live path.** Create a test transaction between Sandbox buyer and seller accounts, verify the transaction appears through Reporting Search, and record the source label and retrieval time. Verify balances separately; PayPal reporting data can lag.
3. **Publish the reviewed default branch.** The public repository is [sanju-zxt/ledgerlens-pro](https://github.com/sanju-zxt/ledgerlens-pro); the current production code is pushed on `codex/ledgerlens-pro-submission`, while `main` still needs the reviewed changes. Confirm `.env` is not tracked before merging.
4. **Record and publish the demo.** Follow [DEMO_SCRIPT.md](DEMO_SCRIPT.md), keep it under 3 minutes, show the app working, upload publicly to YouTube or Vimeo, and add that URL to the entry.
5. **Complete the Devpost entry.** Add the project description, features, tools/models, public repository URL, runnable setup instructions, hosted demo URL if available, and public video URL.

## Remaining engineering opportunities

- Add a first-party PayPal checkout or payment event flow if the submission needs to demonstrate mock money moving rather than Reporting reads alone.
- Replace the single configured workspace account with a persistent user model and user-scoped data isolation.
- Add a supported merchant authorization flow if the product must connect to third-party PayPal merchants. Current client-credentials reporting is app-account access, not merchant consent.
- Persist an append-only transaction ledger and verify signed PayPal webhooks before using it for ongoing reconciliation.
- Supply raw backtest inputs and independently reproduce the reported metrics before making performance claims.
- Add a persistent user/merchant/account model, migrations, tenant-scoped queries, and session revocation before allowing multiple merchants.
- Run merchant usability sessions and a competitor task benchmark; neither is evidenced by build/CI checks.
- Improve recurring and anomaly demo depth with sufficient genuine Sandbox transactions; do not fabricate records.

## Completion gates

- **Integration:** Sandbox balances and transaction search both return successfully using the intended app, with errors and source labels visible in the UI.
- **Reproducibility:** `npm run dev:all` starts all local services; README setup works from a clean checkout.
- **Integrity:** `npm run validate` passes and `.env` is not tracked.
- **Submission:** public repo/license, accurate Devpost text/tools disclosure, and a public video shorter than three minutes are present.
