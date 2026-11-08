import test from "node:test";
import assert from "node:assert/strict";
import { forecastCashflow } from "./forecast.js";

test("Monte Carlo output is deterministic for a fixed seed", () => {
  const options = { currentBalance: 3500, paymentAmount: 500, simulations: 1000, seed: 42 };
  assert.deepEqual(forecastCashflow(options), forecastCashflow(options));
});

test("path breach probability and ending-below-reserve probability are distinct", () => {
  const result = forecastCashflow({ currentBalance: 1001, dailyExpenseMean: 1, dailyExpenseStd: 0, paymentAmount: 5000, emergencyProbability: 0, simulations: 100 });
  assert.equal(result.reserve_breach_probability, 1);
  assert.equal(result.ending_below_reserve_probability, 0);
});

test("invalid inputs fail explicitly", () => {
  assert.throws(() => forecastCashflow({ currentBalance: -1 }));
  assert.throws(() => forecastCashflow({ currentBalance: 100, simulations: 1 }));
});

test("reserve runway measures the first dip and right-censors safe paths", () => {
  const dipping = forecastCashflow({ currentBalance: 1001, dailyExpenseMean: 1, dailyExpenseStd: 0, paymentAmount: 0, emergencyProbability: 0, simulations: 100 });
  assert.equal(dipping.reserve_runway_days_p50, 2);
  const safe = forecastCashflow({ currentBalance: 2000, dailyExpenseMean: 0, dailyExpenseStd: 0, paymentAmount: 0, emergencyProbability: 0, simulations: 100 });
  assert.equal(safe.reserve_runway_days_p50, null);
});
