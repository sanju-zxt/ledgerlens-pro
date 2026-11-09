# LedgerLens Pro demo script (2:45 target)

Capture the running UI, not slides. Keep the cursor deliberate and leave enough time for pages to load. Do not show secrets, `.env`, personal PayPal account details, or unverified performance claims.

## 0:00–0:20 — Product and source

Open the one-click sandbox demo and say: “LedgerLens Pro helps PayPal merchants reason about cash flow. The badge tells you exactly where the displayed data comes from. This run uses the labeled evidence fixture; it does not claim a live merchant connection.”

If Sandbox Reporting is working, use the configured workspace and show the PayPal source label with retrieval time. Only call it live Sandbox data after a successful request.

## 0:20–0:55 — Financial overview

Show the balance source and currency. In the included sparse demo, Forecast should report that recent debit history is insufficient and withhold personalized forecast values. Say: “LedgerLens does not fill missing spend history with a made-up average.” If a live account has enough history, show the source window and empirical daily-spend sample count; do not describe simulation coverage as measured forecast accuracy.

## 0:55–1:25 — Trace the ledger

Open Transactions. Show the source labels and the small fixture ledger. Explain that the $3,500 opening, $3,500 credit, $17.44 debit, and $6,982.56 closing reconcile; the debit is not asserted to be a PayPal fee. Open reconciliation if time permits.

## 1:25–2:00 — Simulate a decision

Open Forecast. When the demo history is insufficient, set an explicit daily-spend assumption before running a what-if scenario. An entered receipt or emergency amount is hypothetical only; it does not schedule, send, or move a payment.

## 2:00–2:25 — Review intelligence

Open Engineering Scorecard and distinguish passed automated tests from NOT EVALUABLE model metrics. Calibration data has no positive labels. Open Anomaly Review only if the batch contains enough eligible records; say outliers are review signals, never fraud findings. Recurring detection requires repeated observed events.

## 2:25–2:45 — Close on trust

Open Settings and show evidence/source status. Close: “LedgerLens keeps source facts distinct from model outputs, and shows what is known and what is assumed.” If PayPal access is still blocked, state that the run used the evidence demo; never imply Reporting data was fetched.

## Recording checklist

- Keep the final file below 3:00 and verify audio before upload.
- Do not record `.env`, browser password prompts, client secrets, access tokens, or private account information.
- Upload publicly to YouTube or Vimeo, then add the URL to the Devpost submission.
