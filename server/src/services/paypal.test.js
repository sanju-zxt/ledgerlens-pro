import test from "node:test";
import assert from "node:assert/strict";
import { listTransactions, withPayPalRetry } from "./paypal.js";

test("Transaction Search rejects invalid and over-31-day windows before network access", async () => {
  await assert.rejects(listTransactions({ startDate: "not-a-date", endDate: "2026-01-10T00:00:00Z" }), error => error.status === 400);
  await assert.rejects(listTransactions({ startDate: "2026-01-01T00:00:00Z", endDate: "2026-02-05T00:00:00Z" }), error => error.status === 400);
});

test("PayPal retry helper retries a rate limit and respects retry-after", async () => {
  let attempts = 0;
  const delays = [];
  const result = await withPayPalRetry(async () => {
    attempts++;
    if (attempts === 1) throw { response: { status: 429, headers: { "retry-after": "0.5" } } };
    return "success";
  }, { delay: async ms => delays.push(ms) });
  assert.equal(result, "success");
  assert.equal(attempts, 2);
  assert.deepEqual(delays, [500]);
});

test("PayPal retry helper does not retry permission failures", async () => {
  let attempts = 0;
  await assert.rejects(withPayPalRetry(async () => {
    attempts++;
    throw { response: { status: 403 } };
  }, { delay: async () => assert.fail("403 must not be retried") }));
  assert.equal(attempts, 1);
});
