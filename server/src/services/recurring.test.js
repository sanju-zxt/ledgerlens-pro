import test from "node:test";
import assert from "node:assert/strict";
import { detectRecurringObligations, normalizeMerchant } from "./recurring.js";

test("merchant normalization removes transaction-specific identifiers", () => {
  assert.equal(normalizeMerchant("ACME CLOUD INV 992255 2026-01-02"), "acme cloud inv");
});

test("monthly recurring obligations require three consistent, non-refunded events", () => {
  const transactions = [
    { description: "CloudHost subscription 10001", amount: "-120.00", currency: "USD", date: "2026-01-01T00:00:00Z" },
    { description: "CloudHost subscription 10002", amount: "-121.00", currency: "USD", date: "2026-01-31T00:00:00Z" },
    { description: "CloudHost subscription 10003", amount: "-119.00", currency: "USD", date: "2026-03-02T00:00:00Z" },
    { description: "CloudHost subscription", amount: "-120.00", currency: "USD", date: "2026-03-03T00:00:00Z", status: "REFUNDED" }
  ];
  const result = detectRecurringObligations(transactions);
  assert.equal(result.length, 1);
  assert.equal(result[0].interval_days, 30);
  assert.equal(result[0].direction, "DEBIT");
  assert.match(result[0].confidence_note, /not probability-calibrated/);
});
