import express from "express";
import axios from "axios";
import { authenticateToken } from "../middleware/auth.js";
import { listTransactions } from "../services/paypal.js";
import { detectRecurringObligations } from "../services/recurring.js";
import { readLedgerEvidence } from "../services/ledger.js";
import { readCalibrationEvidence } from "../services/calibration.js";
import { randomUUID } from "node:crypto";

const router = express.Router();
router.use(authenticateToken);

function pipelineUrl(path) { return `${(process.env.ML_ENGINE_URL || "http://127.0.0.1:8001").replace(/\/$/, "")}/pipeline/${path}`; }
function pipelineHeaders() { return process.env.ML_ENGINE_API_KEY ? { Authorization: `Bearer ${process.env.ML_ENGINE_API_KEY}` } : {}; }
function tenantId(req) { return String(req.user.userId || req.user.email || "").slice(0, 200); }
function transactionKey(tx) { return `${tx.id}|${Date.parse(tx.date)}|${tx.transaction_event_code || ""}`; }
async function callPipeline(req, path, method = "get", data) {
  try { return await axios({ method, url: pipelineUrl(path), data, params: { tenant: tenantId(req) }, headers: pipelineHeaders(), timeout: 30000 }); }
  catch (error) {
    if (error.response) throw Object.assign(new Error(error.response.data?.detail || "Model-quality service rejected the request"), { status: error.response.status });
    throw Object.assign(new Error("Model-quality service is unavailable"), { status: 503 });
  }
}

router.get("/calibration", (req, res, next) => {
  try { res.json(readCalibrationEvidence()); } catch (error) { next(error); }
});

router.get("/pipeline", async (req, res, next) => {
  try {
    const [store, txs] = await Promise.all([
      callPipeline(req, "labels"),
      req.user.demo ? Promise.resolve(readLedgerEvidence().transactions) : listTransactions({})
    ]);
    const reviewed = new Set(store.data.labels.map(label => label.transaction_id));
    const triaged = new Set((store.data.triage_queue || []).map(item => item.transaction_id));
    const eligible = txs.filter(transaction => ["COMPLETED", "S"].includes(String(transaction.status || "").toUpperCase()));
    res.json({ ...store.data, source: req.user.demo ? "SANDBOX_EVIDENCE" : "PAYPAL_TRANSACTION_SEARCH", retrieved_at: new Date().toISOString(), candidates: eligible.map(transaction => ({ ...transaction, review_key: transactionKey(transaction), already_reviewed: reviewed.has(transactionKey(transaction)), needs_investigation: triaged.has(transactionKey(transaction)) })) });
  } catch (error) { next(error); }
});

router.post("/labels", async (req, res, next) => {
  try {
    const { transaction_key, label, rationale, source } = req.body || {};
    if (typeof transaction_key !== "string" || transaction_key.length > 500 || ![0, 1].includes(label) || typeof rationale !== "string" || rationale.trim().length < 12) return res.status(400).json({ message: "Select a transaction, an outcome, and provide a specific review rationale (at least 12 characters)." });
    if (source === "PAYPAL_TRANSACTION_SEARCH" && req.user.demo) return res.status(403).json({ message: "Demo accounts can label only checked-in sandbox evidence." });
    const transactions = source === "SANDBOX_EVIDENCE" && req.user.demo ? readLedgerEvidence().transactions : source === "PAYPAL_TRANSACTION_SEARCH" && !req.user.demo ? await listTransactions({}) : null;
    if (!transactions) return res.status(400).json({ message: "The submitted source is not available for this account." });
    const transaction = transactions.find(item => transactionKey(item) === transaction_key);
    if (!transaction) return res.status(404).json({ message: "That transaction was not returned by the selected verified source." });
    if (!["COMPLETED", "S"].includes(String(transaction.status || "").toUpperCase())) return res.status(422).json({ message: "Only completed transactions can be included in this anomaly-label dataset." });
    if (!transaction.id || !transaction.date || !transaction.currency || !Number.isFinite(Number(transaction.amount))) return res.status(422).json({ message: "Source transaction lacks required evidence fields and cannot be labeled." });
    const result = await callPipeline(req, "labels", "post", { tenant: tenantId(req), reviewer: String(req.user.email || req.user.userId), transaction, label, rationale: rationale.trim() });
    res.status(201).json(result.data);
  } catch (error) { next(error); }
});

router.post("/review-status", async (req, res, next) => {
  try {
    const { transaction_key, rationale, source } = req.body || {};
    if (typeof transaction_key !== "string" || transaction_key.length > 500 || typeof rationale !== "string" || rationale.trim().length < 12 || rationale.length > 2000) return res.status(400).json({ message: "Select a transaction and provide an evidence-based rationale (12–2000 characters)." });
    if (source === "PAYPAL_TRANSACTION_SEARCH" && req.user.demo) return res.status(403).json({ message: "Demo accounts can review only checked-in sandbox evidence." });
    const transactions = source === "SANDBOX_EVIDENCE" && req.user.demo ? readLedgerEvidence().transactions : source === "PAYPAL_TRANSACTION_SEARCH" && !req.user.demo ? await listTransactions({}) : null;
    if (!transactions) return res.status(400).json({ message: "The submitted source is not available for this account." });
    const transaction = transactions.find(item => transactionKey(item) === transaction_key);
    if (!transaction) return res.status(404).json({ message: "That transaction was not returned by the selected verified source." });
    if (!["COMPLETED", "S"].includes(String(transaction.status || "").toUpperCase())) return res.status(422).json({ message: "Only completed transactions can be marked for investigation." });
    const result = await callPipeline(req, "review-status", "post", { tenant: tenantId(req), reviewer: String(req.user.email || req.user.userId), status: "needs_investigation", rationale: rationale.trim(), transaction });
    res.status(201).json(result.data);
  } catch (error) { next(error); }
});

router.get("/experiment", async (req, res, next) => { try { res.json((await callPipeline(req, "experiment")).data); } catch (error) { next(error); } });
router.post("/experiment", async (req, res, next) => { try { res.json((await callPipeline(req, "experiment", "post", { tenant: tenantId(req) })).data); } catch (error) { next(error); } });
router.get("/forecast-report", async (req, res, next) => { try { res.json((await callPipeline(req, "forecast-report")).data); } catch (error) { next(error); } });
router.get("/evaluation-report", async (req, res, next) => {
  try { const response = await callPipeline(req, "report"); res.setHeader("Content-Type", "application/json; charset=utf-8"); res.setHeader("Content-Disposition", "attachment; filename=ledgerlens-model-evaluation.json"); res.send(JSON.stringify(response.data, null, 2)); }
  catch (error) { next(error); }
});
router.get("/export-labels", async (req, res, next) => {
  try { const response = await callPipeline(req, "export-labels"); res.setHeader("Content-Type", "text/csv; charset=utf-8"); res.setHeader("Content-Disposition", `attachment; filename=ledgerlens-reviewed-labels-${randomUUID()}.csv`); res.send(response.data); }
  catch (error) { next(error); }
});

router.post("/forecast-snapshots", async (req, res, next) => {
  try { const result = await callPipeline(req, "forecast-snapshots", "post", { tenant: tenantId(req), forecast: req.body?.forecast || {} }); res.json(result.data); }
  catch (error) { next(error); }
});

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
    const headers = process.env.ML_ENGINE_API_KEY ? { Authorization: `Bearer ${process.env.ML_ENGINE_API_KEY}` } : {};
    const result = await axios.post(`${base.replace(/\/$/, "")}/anomaly`, { transactions: req.body.transactions, sensitivity: req.body.sensitivity ?? 0.1, tenant: tenantId(req) }, { timeout: 20000, headers });
    res.json({ ...result.data, source: req.body.source || "USER_PROVIDED", retrieved_at: new Date().toISOString() });
  } catch (error) {
    if (["ECONNREFUSED", "ETIMEDOUT", "ECONNABORTED", "ENOTFOUND", "EAI_AGAIN"].includes(error.code)) return res.status(503).json({ message: "ML service is unavailable. Check the configured ML_ENGINE_URL." });
    if (error.response) return res.status(error.response.status).json({ message: error.response.data?.detail || "ML service rejected the analysis request" });
    next(error);
  }
});

export default router;
