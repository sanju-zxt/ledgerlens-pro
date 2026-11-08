# LedgerLens Pro demo script (2:45 target)

Capture the running UI, not slides. Keep the cursor deliberate and leave enough time for pages to load. Do not show secrets, `.env`, personal PayPal account details, or unverified performance claims.

## 0:00–0:20 — Product and source

Open the one-click sandbox demo and say: “LedgerLens Pro helps PayPal merchants reason about cash flow. The badge tells you exactly where the displayed data comes from. This run uses the labeled evidence fixture; it does not claim a live merchant connection.”

If Sandbox Reporting is working, use the configured workspace and show the PayPal source label with retrieval time. Only call it live Sandbox data after a successful request.

## 0:20–0:55 — Financial overview

Show the balance source and currency, median 30-day balance, reserve runway, and reserve-dip probability. Say: “The starting balance comes from the labeled evidence fixture or the PayPal balance endpoint. The forecast is a model, not guaranteed income.” Point out that baseline future income is zero and show the uncertainty band.

## 0:55–1:25 — Trace the ledger

Open Transactions. Show the source labels and the small fixture ledger. Explain that the $3,500 opening, $3,500 credit, $17.44 debit, and $6,982.56 closing reconcile; the debit is not asserted to be a PayPal fee. Open reconciliation if time permits.

## 1:25–2:00 — Simulate a decision

Open Forecast, enter an explicitly hypothetical receipt if desired, adjust delay or emergency-expense inputs, and run the scenario. Explain that this changes model assumptions only; it does not schedule, send, or move a payment.

## 2:00–2:25 — Review intelligence

Open Forecast or Insights to explain the seeded Monte Carlo range and assumptions. Open Anomaly Review only if the batch contains enough eligible records; say outliers are signals for human review, never fraud findings. Recurring detection requires repeated observed events.

## 2:25–2:45 — Close on trust

Open Settings and show evidence/source status. Close: “LedgerLens keeps source facts distinct from model outputs, and shows what is known and what is assumed.” If PayPal access is still blocked, state that the run used the evidence demo; never imply Reporting data was fetched.

## Recording checklist

- Keep the final file below 3:00 and verify audio before upload.
- Do not record `.env`, browser password prompts, client secrets, access tokens, or private account information.
- Upload publicly to YouTube or Vimeo, then add the URL to the Devpost submission.
