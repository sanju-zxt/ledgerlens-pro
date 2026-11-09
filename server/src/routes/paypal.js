import express from "express";
import { authenticateToken } from "../middleware/auth.js";
import { getBalances, listTransactions, paypalConfigured } from "../services/paypal.js";

const router = express.Router();
router.use(authenticateToken);
router.get("/status", (req, res) => {
  if (req.user.demo) return res.json({ configured: false, environment: "sandbox", connected: false, demoMode: true, note: "This demo uses labeled sandbox evidence. Add PayPal Sandbox credentials to the server environment to query PayPal." });
  res.json({ configured: paypalConfigured(), environment: process.env.PAYPAL_ENV === "production" ? "production" : "sandbox", connected: false, note: "Server-to-server reporting credentials are configured; this is not an OAuth merchant consent connection." });
});
router.get("/balances", async (req, res, next) => {
  if (req.user.demo) return res.status(403).json({ message: "Demo sessions can access only labeled sandbox evidence." });
  try { res.json(await getBalances(req.query.as_of_time)); } catch (error) { next(error); }
});
router.get("/verification", async (req, res) => {
  if (req.user.demo) return res.status(403).json({ message: "Sandbox evidence demo sessions cannot access the configured PayPal account." });
  const [balances, transactions] = await Promise.allSettled([getBalances(), listTransactions({})]);
  const checks = {
    reporting_balances: balances.status === "fulfilled"
      ? { status: "PASS", endpoint: "/v1/reporting/balances", currencies: [...new Set((balances.value.balances || []).map(item => item.currency || item.total_balance?.currency_code).filter(Boolean))], refreshed_at: balances.value.last_refresh_time || balances.value.as_of_time || null }
      : { status: "FAIL", endpoint: "/v1/reporting/balances", error: balances.reason?.message || "PayPal request failed" },
    transaction_search: transactions.status === "fulfilled"
      ? { status: "PASS", endpoint: "/v1/reporting/transactions", window_days: 30, returned_count: transactions.value.length, completed_count: transactions.value.filter(item => item.status === "COMPLETED").length, currencies: [...new Set(transactions.value.map(item => item.currency).filter(Boolean))] }
      : { status: "FAIL", endpoint: "/v1/reporting/transactions", error: transactions.reason?.message || "PayPal request failed" }
  };
  const status = Object.values(checks).every(item => item.status === "PASS") ? "PASS" : Object.values(checks).some(item => item.status === "PASS") ? "PARTIAL" : "FAIL";
  res.json({ status, environment: process.env.PAYPAL_ENV === "production" ? "production" : "sandbox", account_scope: "PayPal account associated with these server app credentials; not arbitrary merchants", credential_values_recorded: false, captured_at: new Date().toISOString(), checks });
});

export default router;
