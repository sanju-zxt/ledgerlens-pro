const DEFAULTS = Object.freeze({ simulations: 10000, horizon: 30, seed: 42, paymentDays: [7, 13], dailyExpenseMean: 78, dailyExpenseStd: 15, emergencyProbability: 0.05, emergencyAmount: [200, 500], reserveThreshold: 1000 });

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

export function forecastCashflow(input) {
  const assumptions = { ...DEFAULTS, ...input };
  const { simulations, horizon, seed, reserveThreshold } = assumptions;
  if (!Number.isInteger(simulations) || simulations < 100 || simulations > 50000) throw new Error("simulations must be between 100 and 50000");
  if (!Number.isInteger(horizon) || horizon < 1 || horizon > 90) throw new Error("horizon must be between 1 and 90 days");
  if (!Number.isFinite(input.currentBalance) || input.currentBalance < 0) throw new Error("currentBalance must be a non-negative number");
  const rand = random(seed);
  const paths = Array.from({ length: horizon + 1 }, () => []);
  const endings = [];
  const firstBreachDays = [];
  let pathBreachCount = 0;
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
      let u1 = Math.max(rand(), Number.EPSILON);
      const u2 = rand();
      const normal = Math.sqrt(-2 * Math.log(u1)) * Math.cos(2 * Math.PI * u2);
      balance -= Math.max(0, assumptions.dailyExpenseMean + assumptions.dailyExpenseStd * normal);
      if (day === emergencyDay) balance -= emergencyAmount;
      if (balance < reserveThreshold) {
        breached = true;
        if (firstBreachDay === null) firstBreachDay = day;
      }
      paths[day].push(balance);
    }
    if (breached) pathBreachCount++;
    firstBreachDays.push(firstBreachDay === null ? horizon + 1 : firstBreachDay);
    endings.push(balance);
  }
  endings.sort((a, b) => a - b);
  firstBreachDays.sort((a, b) => a - b);
  const series = paths.map((values, day) => {
    values.sort((a, b) => a - b);
    return { day, median: percentile(values, 0.5), lower_bound: percentile(values, 0.15), upper_bound: percentile(values, 0.85) };
  });
  return {
    horizon_days: horizon,
    simulations,
    ending_balance: { median: percentile(endings, 0.5), p15: percentile(endings, 0.15), p85: percentile(endings, 0.85) },
    day_30_mean: endings.reduce((sum, value) => sum + value, 0) / simulations,
    reserve_runway_days_p50: percentile(firstBreachDays, 0.5) <= horizon ? percentile(firstBreachDays, 0.5) : null,
    reserve_threshold: reserveThreshold,
    reserve_breach_probability: pathBreachCount / simulations,
    ending_below_reserve_probability: endings.filter(value => value < reserveThreshold).length / simulations,
    chart_data: series,
    provenance: { kind: "simulation", method: "Monte Carlo", seed, assumptions: { ...assumptions, dailyExpenseDistribution: "Normal clipped at zero", event_order: ["payment", "operating expense", "emergency expense"] } }
  };
}
