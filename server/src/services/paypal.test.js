import test from "node:test";
import assert from "node:assert/strict";
import { listTransactions } from "./paypal.js";

test("Transaction Search rejects invalid and over-31-day windows before network access", async () => {
  await assert.rejects(listTransactions({ startDate: "not-a-date", endDate: "2026-01-10T00:00:00Z" }), error => error.status === 400);
  await assert.rejects(listTransactions({ startDate: "2026-01-01T00:00:00Z", endDate: "2026-02-05T00:00:00Z" }), error => error.status === 400);
});
