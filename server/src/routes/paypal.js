import express from "express";
import { authenticateToken } from "../middleware/auth.js";
import { getBalances, listTransactions, paypalConfigured } from "../services/paypal.js";
import { randomBytes } from "node:crypto";
import { databaseConfigured, query } from "../services/database.js";
import { createMerchantOnboardingReferral, getMerchantIntegration, partnerIntegrationConfigured } from "../services/paypal.js";

const router = express.Router();
router.use(authenticateToken);
router.get("/status", async (req, res, next) => {
  if (req.user.demo) return res.json({ configured: false, environment: "sandbox", connected: false, demoMode: true, note: "This demo uses labeled sandbox evidence. Add PayPal Sandbox credentials to the server environment to query PayPal." });
  try {
    const { rows } = databaseConfigured() && req.user.tenantId ? await query("SELECT status FROM paypal_connections WHERE tenant_id = $1", [req.user.tenantId]) : { rows: [] };
    res.json({ configured: paypalConfigured(), partner_onboarding_ready: partnerIntegrationConfigured(), environment: process.env.PAYPAL_ENV === "production" ? "production" : "sandbox", connected: rows[0]?.status === "connected", note: "A tenant connection is established only after seller consent and verified PayPal permissions." });
  } catch (error) { next(error); }
});
router.get("/connection", async (req, res, next) => {
  if (!databaseConfigured() || req.user.demo || !req.user.tenantId) return res.json({ connected: false, status: "not_connected" });
  try {
    const { rows } = await query("SELECT merchant_id, scopes, status, connected_at FROM paypal_connections WHERE tenant_id = $1", [req.user.tenantId]);
    res.json(rows[0] ? { connected: rows[0].status === "connected", merchant_id: rows[0].merchant_id, scopes: rows[0].scopes, connected_at: rows[0].connected_at } : { connected: false, status: "not_connected" });
  } catch (error) { next(error); }
});
router.post("/connect/start", async (req, res, next) => {
  if (req.user.demo || !req.user.tenantId || !databaseConfigured()) return res.status(503).json({ message: "A registered workspace with durable database storage is required." });
  if (!partnerIntegrationConfigured()) return res.status(503).json({ message: "PayPal partner onboarding is unavailable until partner approval and credentials are configured." });
  try {
    const trackingId = randomBytes(32).toString("base64url");
    await query("INSERT INTO paypal_onboarding_states(tracking_id, tenant_id, started_by, expires_at) VALUES ($1, $2, $3, now() + interval '30 minutes')", [trackingId, req.user.tenantId, req.user.userId]);
    const actionUrl = await createMerchantOnboardingReferral(trackingId);
    res.json({ action_url: actionUrl });
  } catch (error) { next(error); }
});
router.get("/connect/return", async (req, res, next) => {
  const trackingId = typeof req.query.merchantId === "string" ? req.query.merchantId : "";
  const sellerId = typeof req.query.merchantIdInPayPal === "string" ? req.query.merchantIdInPayPal : "";
  if (!req.user.tenantId || req.user.demo || !trackingId || !sellerId || req.query.permissionsGranted !== "true" || req.query.consentStatus !== "true") return res.status(400).json({ message: "PayPal consent was not completed or could not be associated with this workspace." });
  try {
    const { rows } = await query("SELECT tenant_id FROM paypal_onboarding_states WHERE tracking_id = $1 AND tenant_id = $2 AND started_by = $3 AND expires_at > now()", [trackingId, req.user.tenantId, req.user.userId]);
    if (!rows.length) return res.status(400).json({ message: "PayPal onboarding state is invalid, expired, or belongs to another workspace." });
    const integration = await getMerchantIntegration(sellerId);
    const grants = (integration.oauth_integrations || []).flatMap(item => item.oauth_third_party || []).flatMap(item => item.scopes || []);
    const required = ["https://uri.paypal.com/services/reporting/search/read", "https://uri.paypal.com/services/reporting/balances/read"];
    if (!required.every(scope => grants.includes(scope))) return res.status(403).json({ message: "PayPal did not grant the required Reporting permissions. Reconnect and approve all requested permissions." });
    const consumed = await query("DELETE FROM paypal_onboarding_states WHERE tracking_id = $1 AND tenant_id = $2 AND started_by = $3 AND expires_at > now() RETURNING tenant_id", [trackingId, req.user.tenantId, req.user.userId]);
    if (!consumed.rowCount) return res.status(400).json({ message: "PayPal onboarding state has already been used." });
    const payerId = integration.payer_id || integration.merchant_id || sellerId;
    await query("INSERT INTO paypal_connections(tenant_id, merchant_id, payer_id, scopes, status) VALUES ($1, $2, $3, $4, 'connected') ON CONFLICT (tenant_id) DO UPDATE SET merchant_id = EXCLUDED.merchant_id, payer_id = EXCLUDED.payer_id, scopes = EXCLUDED.scopes, status = 'connected', updated_at = now()", [req.user.tenantId, sellerId, payerId, required]);
    res.json({ connected: true, merchant_id: sellerId, scopes: required });
  } catch (error) { next(error); }
});
router.get("/balances", async (req, res, next) => {
  if (req.user.demo) return res.status(403).json({ message: "Demo sessions can access only labeled sandbox evidence." });
  if (!req.user.tenantId) return res.status(409).json({ message: "Connect a PayPal merchant account to a registered workspace first." });
  try { res.json(await getBalances(req.query.as_of_time, req.user.tenantId || null)); } catch (error) { next(error); }
});
router.get("/verification", async (req, res) => {
  if (req.user.demo) return res.status(403).json({ message: "Sandbox evidence demo sessions cannot access the configured PayPal account." });
  if (!req.user.tenantId) return res.status(409).json({ message: "Connect a PayPal merchant account to a registered workspace first." });
  const [balances, transactions] = await Promise.allSettled([getBalances(undefined, req.user.tenantId), listTransactions({ tenantId: req.user.tenantId })]);
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
