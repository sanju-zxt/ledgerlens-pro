import Decimal from "decimal.js";

const DAY_MS = 86_400_000;
const EXCLUDED = new Set(["REFUNDED", "REVERSED", "PENDING", "DENIED", "CANCELLED", "UNKNOWN"]);

function isOutflow(transaction) {
  const type = String(transaction.type || "").toUpperCase();
  if (type === "DEBIT") return true;
  if (type === "CREDIT") return false;
  try { return new Decimal(String(transaction.amount)).isNegative(); } catch { return false; }
}

/**
 * Builds a bounded UTC daily spend sample. The sample is useful only when there
 * are enough actual completed debit events across multiple days; otherwise the
 * caller must not present a merchant-specific forecast.
 */
export function deriveExpenseHistory(transactions, { currency, asOf = new Date(), windowDays = 30, minTransactions = 10, minActiveDays = 5 } = {}) {
  if (!Array.isArray(transactions) || !Number.isInteger(windowDays) || windowDays < 1 || windowDays > 90) throw new Error("transactions and a window of 1–90 days are required");
  const end = new Date(asOf);
  if (!Number.isFinite(end.getTime())) throw new Error("asOf must be a valid date");
  const start = new Date(end.getTime() - windowDays * DAY_MS);
  const daily = new Map();
  let debitTransactions = 0;
  for (const transaction of transactions) {
    if (currency && String(transaction.currency || "").toUpperCase() !== currency.toUpperCase()) continue;
    if (EXCLUDED.has(String(transaction.status || "COMPLETED").toUpperCase()) || !isOutflow(transaction)) continue;
    const timestamp = Date.parse(transaction.date);
    if (!Number.isFinite(timestamp) || timestamp < start.getTime() || timestamp >= end.getTime()) continue;
    let amount;
    try { amount = new Decimal(String(transaction.amount)).abs(); } catch { continue; }
    if (!amount.isFinite() || amount.isZero()) continue;
    const day = new Date(timestamp).toISOString().slice(0, 10);
    daily.set(day, (daily.get(day) || new Decimal(0)).plus(amount));
    debitTransactions += 1;
  }
  const dailySpendSamples = Array.from({ length: windowDays }, (_, offset) => {
    const day = new Date(start.getTime() + offset * DAY_MS).toISOString().slice(0, 10);
    return (daily.get(day) || new Decimal(0)).toNumber();
  });
  const activeSpendDays = daily.size;
  const mean = dailySpendSamples.reduce((sum, value) => sum + value, 0) / dailySpendSamples.length;
  const variance = dailySpendSamples.reduce((sum, value) => sum + (value - mean) ** 2, 0) / dailySpendSamples.length;
  const adequate = debitTransactions >= minTransactions && activeSpendDays >= minActiveDays;
  return {
    adequate,
    dailySpendSamples: adequate ? dailySpendSamples : [],
    dailyMean: mean,
    dailyStd: Math.sqrt(variance),
    currency: currency || null,
    windowDays,
    windowStart: start.toISOString(),
    windowEnd: end.toISOString(),
    completedDebitTransactions: debitTransactions,
    activeSpendDays,
    minimumTransactions: minTransactions,
    minimumActiveDays: minActiveDays,
    method: "Empirical bootstrap of UTC daily completed debit totals, including zero-spend days",
    reason: adequate ? null : `Need at least ${minTransactions} completed debit transactions across ${minActiveDays} spending days in the ${windowDays}-day window; observed ${debitTransactions} transactions across ${activeSpendDays} days.`
  };
}
