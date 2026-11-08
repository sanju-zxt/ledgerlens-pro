import express from "express";
import axios from "axios";
import { authenticateToken } from "../middleware/auth.js";
import { listTransactions } from "../services/paypal.js";
import { detectRecurringObligations } from "../services/recurring.js";
import { readLedgerEvidence } from "../services/ledger.js";

const router = express.Router();
router.use(authenticateToken);

router.get("/recurring", async (req, res, next) => {
  try {
    const live = req.query.source === "paypal";
    if (live && req.user.demo) return res.status(403).json({ message: "Demo sessions can access only labeled sandbox evidence." });
    const evidence = req.query.source === "evidence";
    const transactions = live ? await listTransactions({ startDate: req.query.start_date, endDate: req.query.end_date }) : evidence ? readLedgerEvidence().transactions : [];
    const candidates = detectRecurringObligations(transactions);
    res.json({ candidates, source: live ? "PAYPAL_TRANSACTION_SEARCH" : evidence ? "SANDBOX_EVIDENCE" : "NO_DATA", retrieved_at: live || evidence ? new Date().toISOString() : null, message: live || evidence ? (candidates.length ? undefined : evidence ? "No recurring pattern met the minimum evidence rules. This evidence fixture has too few matching events to infer a cadence." : "No recurring pattern met the minimum evidence rules.") : "Choose a transaction source to analyze history." });
  } catch (error) { next(error); }
});

router.post("/anomalies", async (req, res, next) => {
  try {
    if (!Array.isArray(req.body?.transactions) || req.body.transactions.length > 1000) return res.status(400).json({ message: "transactions must be an array of at most 1000 items" });
    if (req.user.demo && req.body.source === "PAYPAL_TRANSACTION_SEARCH") return res.status(403).json({ message: "Demo sessions can access only labeled sandbox evidence." });
    const base = process.env.ML_ENGINE_URL || "http://127.0.0.1:8001";
    const result = await axios.post(`${base.replace(/\/$/, "")}/anomaly`, { transactions: req.body.transactions, sensitivity: req.body.sensitivity ?? 0.1 }, { timeout: 15000 });
    res.json({ ...result.data, source: req.body.source || "USER_PROVIDED", retrieved_at: new Date().toISOString() });
  } catch (error) {
    if (error.code === "ECONNREFUSED" || error.code === "ETIMEDOUT" || error.code === "ECONNABORTED") return res.status(503).json({ message: "ML service is unavailable. Start the Python service on port 8001." });
    if (error.response) return res.status(error.response.status).json({ message: error.response.data?.detail || "ML service rejected the analysis request" });
    next(error);
  }
});

export default router;
