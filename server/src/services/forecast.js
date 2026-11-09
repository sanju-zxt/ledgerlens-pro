const DEFAULTS = Object.freeze({ simulations: 10000, horizon: 30, seed: 42, paymentAmount: 0, paymentDays: [7, 13], dailyExpenseMean: 0, dailyExpenseStd: 0, dailyExpenseSamples: null, emergencyProbability: 0, emergencyAmount: [0, 0], reserveThreshold: 1000 });
const WILSON_Z = 1.959963984540054;

function random(seed) {
  let state = seed >>> 0;
  return () => {
    state = (state + 0x6D2B79F5) >>> 0;
    let value = state;
    value = Math.imul(value ^ (value >>> 15), value | 1);
    value ^= value + Math.imul(value ^ (value >>> 7), value | 61);
    return ((value ^ (value >>> 14)) >>> 0) / 4294967296;
  };
}

function percentile(sorted, p) {
  const index = (sorted.length - 1) * p;
  const lower = Math.floor(index);
  const fraction = index - lower;
  return sorted[lower] + (sorted[Math.ceil(index)] - sorted[lower]) * fraction;
}

export function medianBreachDay(firstBreachDays, horizon) {
  const requiredEvents = Math.ceil(firstBreachDays.length * 0.5);
  const observed = firstBreachDays.filter(day => day <= horizon).sort((a, b) => a - b);
  return observed.length >= requiredEvents ? observed[requiredEvents - 1] : null;
}

function wilsonInterval(successes, trials) {
  const p = successes / trials;
  const z2 = WILSON_Z ** 2;
  const denominator = 1 + z2 / trials;
  const center = (p + z2 / (2 * trials)) / denominator;
  const margin = WILSON_Z * Math.sqrt((p * (1 - p) / trials) + z2 / (4 * trials ** 2)) / denominator;
  return { lower: successes === 0 ? 0 : Math.max(0, center - margin), upper: successes === trials ? 1 : Math.min(1, center + margin), level: 0.95, method: "Wilson score" };
}

function validateAssumptions(input, assumptions) {
  if (!input || typeof input !== "object") throw new Error("forecast input must be an object");
  const { simulations, horizon, seed, paymentAmount, paymentDays, dailyExpenseMean, dailyExpenseStd, dailyExpenseSamples, emergencyProbability, emergencyAmount, reserveThreshold } = assumptions;
  if (!Number.isFinite(input.currentBalance)) throw new Error("currentBalance must be a finite number");
  if (!Number.isInteger(simulations) || simulations < 100 || simulations > 50000) throw new Error("simulations must be between 100 and 50000");
  if (!Number.isInteger(horizon) || horizon < 1 || horizon > 90) throw new Error("horizon must be between 1 and 90 days");
  if (!Number.isInteger(seed) || seed < 0 || seed > 0xffffffff) throw new Error("seed must be an integer from 0 to 4294967295");
  if (!Number.isFinite(paymentAmount) || paymentAmount < 0) throw new Error("paymentAmount must be a non-negative finite number");
  if (!Array.isArray(paymentDays) || paymentDays.length !== 2 || !paymentDays.every(Number.isSafeInteger) || paymentDays[0] < 1 || paymentDays[1] > 90 || paymentDays[0] > paymentDays[1]) throw new Error("paymentDays must be an ordered pair of integer days from 1 to 90");
  if (![dailyExpenseMean, dailyExpenseStd, reserveThreshold].every(Number.isFinite) || dailyExpenseMean < 0 || dailyExpenseStd < 0 || reserveThreshold < 0) throw new Error("expense parameters and reserveThreshold must be non-negative finite numbers");
  if (dailyExpenseSamples !== null && (!Array.isArray(dailyExpenseSamples) || dailyExpenseSamples.length === 0 || dailyExpenseSamples.some(value => !Number.isFinite(value) || value < 0))) throw new Error("dailyExpenseSamples must be a non-empty array of non-negative finite amounts");
  if (!Number.isFinite(emergencyProbability) || emergencyProbability < 0 || emergencyProbability > 1) throw new Error("emergencyProbability must be between 0 and 1");
  if (!Array.isArray(emergencyAmount) || emergencyAmount.length !== 2 || !emergencyAmount.every(Number.isFinite) || emergencyAmount[0] < 0 || emergencyAmount[0] > emergencyAmount[1]) throw new Error("emergencyAmount must be an ordered pair of non-negative finite amounts");
}

export function forecastCashflow(input) {
  const assumptions = { ...DEFAULTS, ...input };
  const { simulations, horizon, seed, reserveThreshold, dailyExpenseSamples } = assumptions;
  validateAssumptions(input, assumptions);
  const rand = random(seed);
  const paths = Array.from({ length: horizon + 1 }, () => []);
  const endings = [];
  const firstBreachDays = [];
  for (let run = 0; run < simulations; run++) {
    let balance = input.currentBalance;
    let breached = balance < reserveThreshold;
    let firstBreachDay = breached ? 0 : null;
    paths[0].push(balance);
    const paymentDay = assumptions.paymentAmount > 0 ? Math.floor(rand() * (assumptions.paymentDays[1] - assumptions.paymentDays[0] + 1)) + assumptions.paymentDays[0] : -1;
    const hasEmergency = rand() < assumptions.emergencyProbability;
    const emergencyDay = hasEmergency ? Math.floor(rand() * horizon) + 1 : -1;
    const emergencyAmount = hasEmergency ? assumptions.emergencyAmount[0] + rand() * (assumptions.emergencyAmount[1] - assumptions.emergencyAmount[0]) : 0;
    for (let day = 1; day <= horizon; day++) {
      // Same-day order: incoming payment, operating expense, then emergency expense.
      if (day === paymentDay) balance += assumptions.paymentAmount;
      let dailyExpense;
      if (dailyExpenseSamples) dailyExpense = dailyExpenseSamples[Math.floor(rand() * dailyExpenseSamples.length)];
      else {
        const u1 = Math.max(rand(), Number.EPSILON);
        const u2 = rand();
        const normal = Math.sqrt(-2 * Math.log(u1)) * Math.cos(2 * Math.PI * u2);
        dailyExpense = Math.max(0, assumptions.dailyExpenseMean + assumptions.dailyExpenseStd * normal);
      }
      balance -= dailyExpense;
      if (day === emergencyDay) balance -= emergencyAmount;
      if (balance < reserveThreshold) {
        breached = true;
        if (firstBreachDay === null) firstBreachDay = day;
      }
      paths[day].push(balance);
    }
    firstBreachDays.push(firstBreachDay === null ? horizon + 1 : firstBreachDay);
    endings.push(balance);
  }
  endings.sort((a, b) => a - b);
  firstBreachDays.sort((a, b) => a - b);
  const pathBreachCount = firstBreachDays.filter(day => day <= horizon).length;
  const endingBreachCount = endings.filter(value => value < reserveThreshold).length;
  const series = paths.map((values, day) => {
    values.sort((a, b) => a - b);
    return { day, median: percentile(values, 0.5), lower_bound: percentile(values, 0.15), upper_bound: percentile(values, 0.85), lower_bound_90: percentile(values, 0.05), upper_bound_90: percentile(values, 0.95) };
  });
  return {
    horizon_days: horizon,
    simulations,
    ending_balance: { mean: endings.reduce((sum, value) => sum + value, 0) / simulations, median: percentile(endings, 0.5), p15: percentile(endings, 0.15), p85: percentile(endings, 0.85) },
    reserve_runway_days_p50: medianBreachDay(firstBreachDays, horizon),
    reserve_threshold: reserveThreshold,
    reserve_breach_probability: pathBreachCount / simulations,
    reserve_breach_probability_95ci: wilsonInterval(pathBreachCount, simulations),
    ending_below_reserve_probability: endingBreachCount / simulations,
    ending_below_reserve_probability_95ci: wilsonInterval(endingBreachCount, simulations),
    chart_data: series,
    provenance: { kind: "simulation", method: "Monte Carlo", seed, assumptions: { ...assumptions, dailyExpenseSamples: dailyExpenseSamples ? `${dailyExpenseSamples.length} observed daily samples` : null, dailyExpenseDistribution: dailyExpenseSamples ? "Empirical bootstrap with replacement" : "Normal assumption clipped at zero", event_order: ["payment", "operating expense", "emergency expense"] } }
  };
}
