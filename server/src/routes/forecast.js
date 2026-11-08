import express from "express";
import { forecastCashflow } from "../services/forecast.js";
import { authenticateToken } from "../middleware/auth.js";
import { readLedgerEvidence } from "../services/ledger.js";
import { getBalances, selectAvailablePayPalBalance } from "../services/paypal.js";

const router = express.Router();
router.use(authenticateToken);

router.get("/", async (req, res, next) => {
  try {
    const sourceBalance = req.user.demo
      ? (() => { const ledger = readLedgerEvidence(); return { amount: ledger.closingBalance.toNumber(), currency: ledger.currency, source: "SANDBOX_EVIDENCE", as_of: ledger.asOf }; })()
      : selectAvailablePayPalBalance(await getBalances(), req.query.currency_code);
    const result = forecastCashflow({ currentBalance: sourceBalance.amount, paymentAmount: 0 });
    res.json({ ...result, trend: null, source_balance: sourceBalance });
  } catch (error) { next(error); }
});

router.post("/simulate", async (req, res, next) => {
  try {
    const { delay_days = 0, expected_income = 0, emergency_amount = 0, cost_reduction = 0, currency_code } = req.body || {};
    for (const [key, value, max] of [["delay_days", delay_days, 77], ["expected_income", expected_income, 100000], ["emergency_amount", emergency_amount, 100000], ["cost_reduction", cost_reduction, 100000]]) {
      if (!Number.isFinite(value) || value < 0 || value > max) return res.status(400).json({ message: `${key} must be between 0 and ${max}` });
    }
    if (!Number.isInteger(delay_days) || !Number.isInteger(expected_income) || !Number.isInteger(emergency_amount) || !Number.isInteger(cost_reduction)) return res.status(400).json({ message: "Scenario inputs must be whole-dollar/day values" });
    const sourceBalance = req.user.demo
      ? (() => { const ledger = readLedgerEvidence(); return { amount: ledger.closingBalance.toNumber(), currency: ledger.currency, source: "SANDBOX_EVIDENCE", as_of: ledger.asOf }; })()
      : selectAvailablePayPalBalance(await getBalances(), currency_code);
    const result = forecastCashflow({ currentBalance: sourceBalance.amount, paymentAmount: expected_income, paymentDays: [7 + delay_days, 13 + delay_days], emergencyProbability: emergency_amount > 0 ? 1 : 0.05, dailyExpenseMean: Math.max(0, 78 - cost_reduction / 30), emergencyAmount: emergency_amount > 0 ? [emergency_amount, emergency_amount] : [200, 500] });
    res.json({ ...result, scenario_applied: { delay_days, expected_income, emergency_amount, cost_reduction }, source_balance: sourceBalance });
  } catch (error) { next(error); }
});

export default router;
