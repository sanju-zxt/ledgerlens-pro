import express from "express";
import axios from "axios";
import { forecastCashflow } from "../services/forecast.js";
import { authenticateToken } from "../middleware/auth.js";
import { readLedgerEvidence } from "../services/ledger.js";
import { getBalances, listTransactions, selectAvailablePayPalBalance } from "../services/paypal.js";
import { deriveExpenseHistory } from "../services/forecast-history.js";

const router = express.Router();
router.use(authenticateToken);

router.get("/", async (req, res, next) => {
  try {
    const now = new Date();
    const startDate = new Date(now.getTime() - 30 * 86400000).toISOString();
    const endDate = now.toISOString();
    let sourceBalance, transactions;
    if (req.user.demo) {
      const ledger = readLedgerEvidence();
      sourceBalance = { amount: ledger.closingBalance.toNumber(), currency: ledger.currency, source: "SANDBOX_EVIDENCE", as_of: ledger.asOf };
      transactions = ledger.transactions;
    } else {
      const [balances, history] = await Promise.all([getBalances(), listTransactions({ startDate, endDate })]);
      sourceBalance = selectAvailablePayPalBalance(balances, req.query.currency_code);
      transactions = history;
    }
    const history = deriveExpenseHistory(transactions, { currency: sourceBalance.currency, asOf: now, windowDays: 30 });
    const metadata = { model: "ledgerlens-empirical-daily-spend-monte-carlo", version: "1.1.0", authoritative_for_dashboard: true, generated_at: new Date().toISOString() };
    if (!history.adequate) {
      res.json({ forecast_status: "insufficient_history", model_metadata: metadata, source_balance: sourceBalance, history_profile: history, message: "No merchant-specific forecast is shown because this account does not have enough recent completed debit history. No generic spending or emergency assumptions are substituted." });
      return;
    }
    const result = forecastCashflow({ currentBalance: sourceBalance.amount, paymentAmount: 0, dailyExpenseSamples: history.dailySpendSamples, dailyExpenseMean: history.dailyMean, dailyExpenseStd: history.dailyStd, emergencyProbability: 0, emergencyAmount: [0, 0] });
    const response = { ...result, forecast_status: "available", model_metadata: metadata, history_profile: { ...history, dailySpendSamples: undefined }, source_balance: { ...sourceBalance, observed_at: now.toISOString() } };
    // Persist only real PayPal observations as backtest evidence. The checked-in
    // demo ledger is a static fixture and must never be mistaken for a time series.
    if (!req.user.demo) axios.post(`${(process.env.ML_ENGINE_URL || "http://127.0.0.1:8001").replace(/\/$/, "")}/pipeline/forecast-snapshots`, { tenant: String(req.user.userId || req.user.email), forecast: response }, { headers: process.env.ML_ENGINE_API_KEY ? { Authorization: `Bearer ${process.env.ML_ENGINE_API_KEY}` } : {}, timeout: 8000 }).catch(error => console.error(`Forecast snapshot was not persisted: ${error.message}`));
    res.json(response);
  } catch (error) { next(error); }
});

router.post("/simulate", async (req, res, next) => {
  try {
    const { delay_days = 0, expected_income = 0, emergency_amount = 0, cost_reduction = 0, daily_expense_mean, daily_expense_std = 0, currency_code } = req.body || {};
    for (const [key, value, max] of [["delay_days", delay_days, 77], ["expected_income", expected_income, 100000], ["emergency_amount", emergency_amount, 100000], ["cost_reduction", cost_reduction, 100000], ["daily_expense_mean", daily_expense_mean, 100000], ["daily_expense_std", daily_expense_std, 100000]]) {
      if (value === undefined && key.startsWith("daily_expense")) continue;
      if (!Number.isFinite(value) || value < 0 || value > max) return res.status(400).json({ message: `${key} must be between 0 and ${max}` });
    }
    if (![delay_days, expected_income, emergency_amount, cost_reduction, daily_expense_std].every(Number.isInteger) || (daily_expense_mean !== undefined && !Number.isInteger(daily_expense_mean))) return res.status(400).json({ message: "Scenario inputs must be whole-dollar/day values" });
    const now = new Date();
    const startDate = new Date(now.getTime() - 30 * 86400000).toISOString();
    const endDate = now.toISOString();
    let sourceBalance, transactions;
    if (req.user.demo) {
      const ledger = readLedgerEvidence();
      sourceBalance = { amount: ledger.closingBalance.toNumber(), currency: ledger.currency, source: "SANDBOX_EVIDENCE", as_of: ledger.asOf };
      transactions = ledger.transactions;
    } else {
      const [balances, history] = await Promise.all([getBalances(), listTransactions({ startDate, endDate })]);
      sourceBalance = selectAvailablePayPalBalance(balances, currency_code);
      transactions = history;
    }
    const history = deriveExpenseHistory(transactions, { currency: sourceBalance.currency, asOf: now, windowDays: 30 });
    const hasUserExpenseAssumption = daily_expense_mean !== undefined;
    if (!history.adequate && !hasUserExpenseAssumption) return res.status(400).json({ message: "Insufficient spending history. Enter an explicit daily operating-expense assumption to run this hypothetical scenario." });
    const expenseSamples = history.adequate && !hasUserExpenseAssumption
      ? history.dailySpendSamples.map(value => Math.max(0, value - cost_reduction / 30))
      : undefined;
    const mean = hasUserExpenseAssumption ? daily_expense_mean : history.dailyMean;
    const deviation = hasUserExpenseAssumption ? daily_expense_std : history.dailyStd;
    const result = forecastCashflow({ currentBalance: sourceBalance.amount, paymentAmount: expected_income, paymentDays: [7 + delay_days, 13 + delay_days], dailyExpenseSamples: expenseSamples ?? null, dailyExpenseMean: Math.max(0, mean - cost_reduction / 30), dailyExpenseStd: deviation, emergencyProbability: emergency_amount > 0 ? 1 : 0, emergencyAmount: emergency_amount > 0 ? [emergency_amount, emergency_amount] : [0, 0] });
    res.json({ ...result, forecast_status: "scenario", model_metadata: { model: "ledgerlens-empirical-daily-spend-monte-carlo", version: "1.1.0", authoritative_for_dashboard: true, generated_at: new Date().toISOString() }, history_profile: { ...history, dailySpendSamples: undefined }, scenario_applied: { delay_days, expected_income, emergency_amount, cost_reduction, daily_expense_mean: mean, daily_expense_std: deviation, expense_assumption_source: hasUserExpenseAssumption ? "USER_ENTERED_HYPOTHETICAL" : "RECENT_PAYPAL_TRANSACTION_HISTORY" }, source_balance: sourceBalance });
  } catch (error) { next(error); }
});

export default router;
