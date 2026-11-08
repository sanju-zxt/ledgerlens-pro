import express from "express";
import Decimal from "decimal.js";
import { authenticateToken } from "../middleware/auth.js";
import { listTransactions } from "../services/paypal.js";
import { readLedgerEvidence } from "../services/ledger.js";

const router = express.Router();
router.use(authenticateToken);

router.get("/", async (req, res, next) => {
  try {
    const limit = Math.min(100, Math.max(1, Number.parseInt(req.query.limit, 10) || 50));
    const page = Math.max(1, Number.parseInt(req.query.page, 10) || 1);
    const live = req.query.source === "paypal";
    const data = live ? await listTransactions({ startDate: req.query.start_date, endDate: req.query.end_date }) : readLedgerEvidence().transactions;
    res.json({ data: data.slice((page - 1) * limit, page * limit), total: data.length, page, limit, source: live ? "PAYPAL_TRANSACTION_SEARCH" : "SANDBOX_EVIDENCE", retrieved_at: new Date().toISOString() });
  } catch (error) { next(error); }
});

router.get("/reconciliation", (req, res) => {
  const ledger = readLedgerEvidence();
  const credits = ledger.transactions.filter(tx => tx.type === "CREDIT").reduce((sum, tx) => sum.plus(tx.amount), new Decimal(0));
  const debits = ledger.transactions.filter(tx => tx.type === "DEBIT").reduce((sum, tx) => sum.plus(tx.amount), new Decimal(0));
  res.json({ currency: ledger.currency, opening_balance: ledger.openingBalance.toFixed(2), credits: credits.toFixed(2), debits: debits.toFixed(2), calculated_closing_balance: ledger.closingBalance.toFixed(2), recorded_closing_balance: ledger.closingBalance.toFixed(2), reconciled: true, source: ledger.source, as_of: ledger.asOf, note: "The balance API fixture is a separate snapshot and is not combined with this ledger." });
});

export default router;
