import test from "node:test";
import assert from "node:assert/strict";
import { parseCsvRecords, readLedgerEvidence } from "./ledger.js";

test("CSV reader preserves quoted commas and escaped quotes", () => {
  assert.deepEqual(parseCsvRecords('name,note\nMerchant,"Consulting, design"\nQuoted,"said ""hello"""\n'), [
    ["name", "note"], ["Merchant", "Consulting, design"], ["Quoted", 'said "hello"']
  ]);
});

test("CSV reader rejects an unterminated quoted field", () => {
  assert.throws(() => parseCsvRecords('name,note\nitem,"unfinished'), /unterminated quoted field/);
});

test("CSV reader rejects characters after a closing quoted field", () => {
  assert.throws(() => parseCsvRecords('name,note\nitem,"quoted"tail\n'), /unexpected data after a closing quote/);
});

test("CSV reader rejects a quote inside an unquoted field", () => {
  assert.throws(() => parseCsvRecords('name,note\nitem,bad"quote\n'), /quote must start a field/);
});

test("checked-in evidence ledger parses and reconciles", () => {
  const ledger = readLedgerEvidence();
  assert.equal(ledger.transactions.length, 2);
  assert.equal(ledger.closingBalance.toFixed(2), "6982.56");
});
