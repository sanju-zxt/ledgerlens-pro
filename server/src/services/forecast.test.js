import test from "node:test";
import assert from "node:assert/strict";
import { forecastCashflow, medianBreachDay } from "./forecast.js";

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
  assert.throws(() => forecastCashflow({ currentBalance: 100, simulations: 1 }));
  assert.throws(() => forecastCashflow({ currentBalance: 100, paymentAmount: -1 }));
  assert.throws(() => forecastCashflow({ currentBalance: 100, emergencyProbability: 1.2 }));
  assert.throws(() => forecastCashflow({ currentBalance: 100, seed: -1 }));
  assert.throws(() => forecastCashflow({ currentBalance: 100, paymentDays: [7, 91] }));
});

test("reserve runway measures the first dip and right-censors safe paths", () => {
  const dipping = forecastCashflow({ currentBalance: 1001, dailyExpenseMean: 1, dailyExpenseStd: 0, paymentAmount: 0, emergencyProbability: 0, simulations: 100 });
  assert.equal(dipping.reserve_runway_days_p50, 2);
  const safe = forecastCashflow({ currentBalance: 2000, dailyExpenseMean: 0, dailyExpenseStd: 0, paymentAmount: 0, emergencyProbability: 0, simulations: 100 });
  assert.equal(safe.reserve_runway_days_p50, null);
});

test("median runway returns the day 50 percent of paths cross and handles right-censoring", () => {
  assert.equal(medianBreachDay([4, 2, 1, 31, 31, 31], 30), 4);
  assert.equal(medianBreachDay([1, 2, 31, 31, 31, 31], 30), null);
});

test("finite-simulation probability intervals are valid at zero and one extremes", () => {
  const none = forecastCashflow({ currentBalance: 5000, paymentAmount: 0, dailyExpenseMean: 0, dailyExpenseStd: 0, emergencyProbability: 0, simulations: 100 });
  const all = forecastCashflow({ currentBalance: 0, paymentAmount: 0, dailyExpenseMean: 0, dailyExpenseStd: 0, emergencyProbability: 0, simulations: 100 });
  assert.deepEqual(none.reserve_breach_probability_95ci.level, 0.95);
  assert.ok(none.reserve_breach_probability_95ci.lower === 0 && none.reserve_breach_probability_95ci.upper > 0);
  assert.ok(all.reserve_breach_probability_95ci.lower < 1 && all.reserve_breach_probability_95ci.upper === 1);
});
