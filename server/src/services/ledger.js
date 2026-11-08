import fs from "node:fs";
import path from "node:path";
import { fileURLToPath } from "node:url";
import Decimal from "decimal.js";

const evidencePath = path.resolve(path.dirname(fileURLToPath(import.meta.url)), "../../../evidence/balance_logs.csv");

export function readLedgerEvidence() {
  const [header, ...lines] = fs.readFileSync(evidencePath, "utf8").replace(/^\uFEFF/, "").trim().split(/\r?\n/);
  const columns = header.split(",");
  const events = lines.map(line => {
    const values = line.split(",");
    return Object.fromEntries(columns.map((column, index) => [column, values[index] ?? ""]));
  });
  if (events.length < 2 || events[0].event_type !== "SNAPSHOT" || events[0].direction !== "OPENING") throw new Error("Sandbox ledger is missing its opening snapshot");
  let balance = new Decimal(events[0].balance);
  const transactions = [];
  for (const event of events.slice(1)) {
    if (event.event_type === "MOVEMENT") {
      const amount = new Decimal(event.amount);
      if (!event.txn_id || !["CREDIT", "DEBIT"].includes(event.direction)) throw new Error(`Invalid ledger movement at sequence ${event.seq}`);
      balance = event.direction === "CREDIT" ? balance.plus(amount) : balance.minus(amount);
      if (!balance.equals(event.balance)) throw new Error(`Ledger balance mismatch at sequence ${event.seq}`);
      transactions.push({ id: event.txn_id, date: event.timestamp_utc, description: event.direction === "CREDIT" ? "Evidence ledger credit" : "Evidence ledger debit", amount: amount.toFixed(2), currency: "USD", type: event.direction, status: "COMPLETED", source: "SANDBOX_EVIDENCE", provenance: `evidence/balance_logs.csv row ${event.seq}` });
    } else if (event.event_type === "SNAPSHOT" && !balance.equals(event.balance)) {
      throw new Error(`Ledger reconciliation mismatch at sequence ${event.seq}`);
    }
  }
  const closing = events.at(-1);
  if (closing.event_type !== "SNAPSHOT" || closing.direction !== "RECONCILE") throw new Error("Sandbox ledger is missing its closing reconciliation snapshot");
  return { events, transactions, openingBalance: new Decimal(events[0].balance), closingBalance: balance, currency: "USD", source: "evidence/balance_logs.csv", asOf: closing.timestamp_utc };
}
