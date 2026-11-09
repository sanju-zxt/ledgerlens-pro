import express from "express";
import axios from "axios";
import { X509Certificate, createVerify } from "node:crypto";
import { databaseConfigured, query } from "../services/database.js";

const router = express.Router();
const certCache = new Map();
function crc32(buffer) {
  let crc = 0xffffffff;
  for (const byte of buffer) {
    crc ^= byte;
    for (let bit = 0; bit < 8; bit++) crc = (crc >>> 1) ^ (crc & 1 ? 0xedb88320 : 0);
  }
  return (crc ^ 0xffffffff) >>> 0;
}
async function certificateFor(url) {
  const parsed = new URL(url);
  const allowedHost = process.env.PAYPAL_ENV === "production" ? "api-m.paypal.com" : "api-m.sandbox.paypal.com";
  if (parsed.protocol !== "https:" || parsed.hostname !== allowedHost || !parsed.pathname.startsWith("/v1/notifications/certs/")) throw new Error("Untrusted PayPal certificate URL");
  const cached = certCache.get(url);
  if (cached && cached.expires > Date.now()) return cached.cert;
  const { data } = await axios.get(url, { responseType: "text", timeout: 8000, maxRedirects: 0, maxContentLength: 65536 });
  const cert = new X509Certificate(data);
  if (Date.parse(cert.validTo) <= Date.now() || Date.parse(cert.validFrom) > Date.now()) throw new Error("PayPal signing certificate is outside its validity period");
  certCache.set(url, { cert, expires: Date.now() + 10 * 60 * 1000 });
  return cert;
}
async function verified(req) {
  const h = req.headers;
  const id = h["paypal-transmission-id"], time = h["paypal-transmission-time"], signature = h["paypal-transmission-sig"], certUrl = h["paypal-cert-url"], algo = h["paypal-auth-algo"];
  if (!id || !time || !signature || !certUrl || algo !== "SHA256withRSA" || Math.abs(Date.now() - Date.parse(time)) > 5 * 60 * 1000) return false;
  const cert = await certificateFor(certUrl);
  const signed = `${id}|${time}|${process.env.PAYPAL_WEBHOOK_ID}|${crc32(req.body).toString(10)}`;
  const verifier = createVerify("RSA-SHA256"); verifier.update(signed); verifier.end();
  return verifier.verify(cert.publicKey, signature, "base64");
}
router.post("/paypal", express.raw({ type: "application/json", limit: "256kb" }), async (req, res) => {
  if (!databaseConfigured() || !process.env.PAYPAL_WEBHOOK_ID) return res.status(503).json({ message: "Webhook persistence or PayPal webhook verification is not configured." });
  if (!Buffer.isBuffer(req.body)) return res.status(400).json({ message: "Expected raw JSON request body." });
  let event;
  try {
    if (!await verified(req)) return res.status(401).json({ message: "PayPal webhook signature verification failed." });
    event = JSON.parse(req.body.toString("utf8"));
  } catch (error) {
    console.warn("PayPal webhook validation failed:", error.message);
    return res.status(400).json({ message: "Invalid PayPal webhook signature or event payload." });
  }
  try {
    const resource = event.resource || {};
    const merchantId = resource.payee?.merchant_id || resource.seller_paypal_account_id || resource.merchant_id || event.merchant_id || null;
    const connection = merchantId ? await query("SELECT tenant_id FROM paypal_connections WHERE merchant_id = $1 AND status = 'connected'", [merchantId]) : { rows: [] };
    const tenantId = connection.rows[0]?.tenant_id || null;
    const eventId = String(event.id || "");
    const transmissionId = String(req.headers["paypal-transmission-id"]);
    if (!eventId || eventId.length > 200) return res.status(400).json({ message: "Invalid PayPal event identifier." });
    await query("INSERT INTO paypal_webhook_events(event_id, transmission_id, tenant_id, merchant_id, event_type, resource_id, payload) VALUES ($1,$2,$3,$4,$5,$6,$7::jsonb) ON CONFLICT DO NOTHING", [eventId, transmissionId, tenantId, merchantId, String(event.event_type || "unknown").slice(0, 200), String(resource.id || "").slice(0, 200) || null, JSON.stringify({ id: event.id, event_type: event.event_type, create_time: event.create_time, resource_type: event.resource_type, resource: { id: resource.id, status: resource.status, amount: resource.amount, payee: resource.payee } })]);
    return res.sendStatus(200);
  } catch (error) {
    console.error("PayPal webhook processing failed:", error.message);
    return res.sendStatus(503);
  }
});
export default router;
