import express from "express";
import { forecastCashflow } from "../services/forecast.js";
import { authenticateToken } from "../middleware/auth.js";
import { readLedgerEvidence } from "../services/ledger.js";

const router = express.Router();
router.use(authenticateToken);

router.get("/", (req, res, next) => {
  try {
    const ledger = readLedgerEvidence();
    const startingBalance = ledger.closingBalance.toNumber();
    const result = forecastCashflow({ currentBalance: startingBalance, paymentAmount: 3500 });
    res.json({ ...result, trend: null, source_balance: { amount: startingBalance, currency: ledger.currency, source: "SANDBOX_EVIDENCE", as_of: ledger.asOf } });
  } catch (error) { next(error); }
});

router.post("/simulate", (req, res, next) => {
  try {
    const { delay_days = 0, emergency_amount = 0, cost_reduction = 0 } = req.body || {};
    for (const [key, value, max] of [["delay_days", delay_days, 90], ["emergency_amount", emergency_amount, 100000], ["cost_reduction", cost_reduction, 100000]]) {
      if (!Number.isFinite(value) || value < 0 || value > max) return res.status(400).json({ message: `${key} must be between 0 and ${max}` });
    }
    const ledger = readLedgerEvidence();
    const startingBalance = ledger.closingBalance.toNumber();
    const result = forecastCashflow({ currentBalance: startingBalance, paymentAmount: 3500, paymentDays: [7 + delay_days, 13 + delay_days], emergencyProbability: emergency_amount > 0 ? 1 : 0.05, dailyExpenseMean: Math.max(0, 78 - cost_reduction / 30), emergencyAmount: emergency_amount > 0 ? [emergency_amount, emergency_amount] : [200, 500] });
    res.json({ ...result, scenario_applied: { delay_days, emergency_amount, cost_reduction }, source_balance: { amount: startingBalance, currency: ledger.currency, source: "SANDBOX_EVIDENCE", as_of: ledger.asOf } });
  } catch (error) { next(error); }
});

export default router;
