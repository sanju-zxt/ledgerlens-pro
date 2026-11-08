const INTERVALS = [7, 14, 30, 90, 365];

export function normalizeMerchant(description = "") {
  return description
    .toLowerCase()
    .replace(/\b\d{4,}\b/g, " ")
    .replace(/\b(19|20)\d{2}[-/.]\d{1,2}[-/.]\d{1,2}\b/g, " ")
    .replace(/[^a-z]+/g, " ")
    .trim()
    .replace(/\s+/g, " ");
}

export function detectRecurringObligations(transactions, { amountTolerance = 0.1, intervalToleranceDays = 3 } = {}) {
  const groups = new Map();
  for (const transaction of transactions) {
    const status = String(transaction.status || "COMPLETED").toUpperCase();
    if (["REFUNDED", "REVERSED", "PENDING", "DENIED", "CANCELLED"].includes(status)) continue;
    const merchant = normalizeMerchant(transaction.description || transaction.merchant);
    const amount = Number(transaction.amount);
    const date = Date.parse(transaction.date);
    if (!merchant || !Number.isFinite(amount) || amount === 0 || !Number.isFinite(date)) continue;
    const declaredType = String(transaction.type || "").toUpperCase();
    const sign = declaredType === "DEBIT" ? -1 : declaredType === "CREDIT" ? 1 : Math.sign(amount);
    const key = `${merchant}:${sign}`;
    if (!groups.has(key)) groups.set(key, { merchant, sign, rows: [] });
    groups.get(key).rows.push({ amount: Math.abs(amount), date, currency: transaction.currency || "USD" });
  }
  const candidates = [];
  for (const group of groups.values()) {
    const rows = group.rows.sort((a, b) => a.date - b.date);
    if (rows.length < 3 || new Set(rows.map(row => row.currency)).size > 1) continue;
    const amounts = rows.map(row => row.amount).sort((a, b) => a - b);
    const medianAmount = amounts[Math.floor(amounts.length / 2)];
    if (medianAmount === 0 || (amounts.at(-1) - amounts[0]) / medianAmount > amountTolerance) continue;
    const intervals = rows.slice(1).map((row, index) => (row.date - rows[index].date) / 86400000);
    const medianInterval = [...intervals].sort((a, b) => a - b)[Math.floor(intervals.length / 2)];
    const expected = INTERVALS.find(interval => Math.abs(interval - medianInterval) <= intervalToleranceDays);
    if (!expected || intervals.some(interval => Math.abs(interval - expected) > intervalToleranceDays)) continue;
    const amountConsistency = Math.max(0, 1 - (amounts.at(-1) - amounts[0]) / medianAmount / amountTolerance);
    const intervalConsistency = Math.max(0, 1 - Math.max(...intervals.map(interval => Math.abs(interval - expected))) / intervalToleranceDays);
    const support = Math.min(1, (rows.length - 2) / 4);
    candidates.push({
      merchant: group.merchant,
      direction: group.sign < 0 ? "DEBIT" : "CREDIT",
      currency: rows[0].currency,
      typical_amount: medianAmount,
      interval_days: expected,
      observed_events: rows.length,
      last_seen: new Date(rows.at(-1).date).toISOString(),
      heuristic_confidence: Number((0.4 * amountConsistency + 0.4 * intervalConsistency + 0.2 * support).toFixed(3)),
      confidence_note: "Rule-based score; not probability-calibrated. Refunds, reversals, and pending events are excluded."
    });
  }
  return candidates.sort((a, b) => b.heuristic_confidence - a.heuristic_confidence);
}
