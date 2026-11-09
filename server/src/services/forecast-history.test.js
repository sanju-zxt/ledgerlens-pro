import test from "node:test";
import assert from "node:assert/strict";
import { deriveExpenseHistory } from "./forecast-history.js";

const asOf = new Date("2026-06-30T00:00:00.000Z");

test("expense history uses completed currency-matched debits and retains zero-spend days", () => {
  const transactions = Array.from({ length: 10 }, (_, index) => ({
    amount: "10.00", currency: "USD", type: "DEBIT", status: "COMPLETED",
    date: `2026-06-${String(1 + Math.floor(index / 2)).padStart(2, "0")}T12:00:00.000Z`
  }));
  transactions.push(
    { amount: "999.00", currency: "USD", type: "DEBIT", status: "REFUNDED", date: "2026-06-10T12:00:00.000Z" },
    { amount: "999.00", currency: "EUR", type: "DEBIT", status: "COMPLETED", date: "2026-06-11T12:00:00.000Z" },
    { amount: "999.00", currency: "USD", type: "CREDIT", status: "COMPLETED", date: "2026-06-12T12:00:00.000Z" },
    { amount: "999.00", currency: "USD", type: "DEBIT", status: "PENDING", date: "2026-06-13T12:00:00.000Z" }
  );
  const profile = deriveExpenseHistory(transactions, { currency: "USD", asOf, windowDays: 30 });
  assert.equal(profile.adequate, true);
  assert.equal(profile.completedDebitTransactions, 10);
  assert.equal(profile.activeSpendDays, 5);
  assert.equal(profile.dailySpendSamples.length, 30);
  assert.equal(profile.dailySpendSamples.filter(value => value === 0).length, 25);
  assert.ok(Math.abs(profile.dailyMean - (100 / 30)) < 1e-12);
});

test("expense history refuses to infer a merchant model from sparse spending", () => {
  const profile = deriveExpenseHistory([{ amount: "17.44", currency: "USD", type: "DEBIT", status: "COMPLETED", date: "2026-06-15T12:00:00.000Z" }], { currency: "USD", asOf, windowDays: 30 });
  assert.equal(profile.adequate, false);
  assert.deepEqual(profile.dailySpendSamples, []);
  assert.match(profile.reason, /Need at least 10 completed debit transactions across 5 spending days/);
});
