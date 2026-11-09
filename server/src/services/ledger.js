import fs from "node:fs";
import path from "node:path";
import { fileURLToPath } from "node:url";
import Decimal from "decimal.js";

const evidencePath = path.resolve(path.dirname(fileURLToPath(import.meta.url)), "../../../evidence/balance_logs.csv");

export function parseCsvRecords(contents) {
  const rows = [];
  let row = [];
  let field = "";
  let quoted = false;
  let afterQuote = false;
  const finishRow = () => {
    row.push(field); field = "";
    if (row.some(value => value !== "")) rows.push(row);
    row = [];
  };
  for (let index = 0; index < contents.length; index++) {
    const char = contents[index];
    if (afterQuote) {
      if (char === ",") { row.push(field); field = ""; afterQuote = false; }
      else if (char === "\n" || char === "\r") {
        if (char === "\r" && contents[index + 1] === "\n") index++;
        finishRow(); afterQuote = false;
      } else throw new Error("Invalid CSV: unexpected data after a closing quote");
    } else if (quoted) {
      if (char === '"' && contents[index + 1] === '"') { field += '"'; index++; }
      else if (char === '"') { quoted = false; afterQuote = true; }
      else field += char;
    } else if (char === '"') {
      if (field.length) throw new Error("Invalid CSV: quote must start a field");
      quoted = true;
    } else if (char === ",") { row.push(field); field = ""; }
    else if (char === "\n" || char === "\r") {
      if (char === "\r" && contents[index + 1] === "\n") index++;
      finishRow();
    } else field += char;
  }
  if (quoted) throw new Error("Invalid CSV: unterminated quoted field");
  if (field.length || row.length || !afterQuote) finishRow();
  return rows;
}

export function readLedgerEvidence() {
  const [columns, ...records] = parseCsvRecords(fs.readFileSync(evidencePath, "utf8").replace(/^\uFEFF/, ""));
  if (!columns || new Set(columns).size !== columns.length || columns.join(",") !== "seq,timestamp_utc,event_type,amount,direction,balance,source,txn_id") throw new Error("Sandbox ledger has an invalid or unexpected CSV header");
  const events = records.map((values, index) => {
    if (values.length !== columns.length) throw new Error(`Invalid ledger CSV column count at row ${index + 2}`);
    return Object.fromEntries(columns.map((column, columnIndex) => [column, values[columnIndex]]));
  });
  if (events.length < 2 || events[0].event_type !== "SNAPSHOT" || events[0].direction !== "OPENING") throw new Error("Sandbox ledger is missing its opening snapshot");
  if (events.some((event, index) => Number(event.seq) !== index + 1 || !Number.isFinite(Date.parse(event.timestamp_utc)))) throw new Error("Sandbox ledger sequence or timestamp is invalid");
  const transactionIds = events.filter(event => event.event_type === "MOVEMENT").map(event => event.txn_id);
  if (new Set(transactionIds).size !== transactionIds.length) throw new Error("Sandbox ledger contains duplicate transaction IDs");
  let balance = new Decimal(events[0].balance);
  const transactions = [];
  for (const event of events.slice(1)) {
    if (event.event_type === "MOVEMENT") {
      const amount = new Decimal(event.amount);
      if (amount.isNegative() || !event.txn_id || !["CREDIT", "DEBIT"].includes(event.direction)) throw new Error(`Invalid ledger movement at sequence ${event.seq}`);
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
