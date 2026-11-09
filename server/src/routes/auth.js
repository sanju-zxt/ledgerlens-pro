import express from "express";
import jwt from "jsonwebtoken";
import bcrypt from "bcryptjs";
import { createHash, randomBytes, randomUUID } from "node:crypto";
import { databaseConfigured, query, withTransaction } from "../services/database.js";
import { authenticateToken } from "../middleware/auth.js";

const router = express.Router();
const attempts = new Map();
const sessionCookie = "ledgerlens_session";
const sessionLifetimeSeconds = 30 * 60;

function setSessionCookie(res, token) {
  const secure = process.env.NODE_ENV === "production" ? "; Secure; SameSite=Lax" : "; SameSite=Lax";
  res.setHeader("Set-Cookie", `${sessionCookie}=${encodeURIComponent(token)}; HttpOnly; Path=/; Max-Age=${sessionLifetimeSeconds}${secure}`);
}
function clearSessionCookie(res) {
  const secure = process.env.NODE_ENV === "production" ? "; Secure; SameSite=Lax" : "; SameSite=Lax";
  res.setHeader("Set-Cookie", `${sessionCookie}=; HttpOnly; Path=/; Max-Age=0${secure}`);
}
function hashToken(token) { return createHash("sha256").update(token).digest("hex"); }
function limitLoginAttempts(req, res, next) {
  const key = req.ip || "unknown";
  const now = Date.now();
  const state = attempts.get(key);
  if (!state || now - state.start >= 60000) attempts.set(key, { start: now, count: 1 });
  else if (state.count >= 10) return res.status(429).json({ message: "Too many authentication requests. Try again in one minute." });
  else state.count++;
  if (attempts.size > 10000) for (const [ip, item] of attempts) if (now - item.start >= 60000) attempts.delete(ip);
  next();
}

async function sendVerification(email, token) {
  const base = (process.env.APP_BASE_URL || process.env.CLIENT_ORIGIN || "http://localhost:3000").split(",")[0].replace(/\/$/, "");
  const link = `${base}/verify-email?token=${encodeURIComponent(token)}`;
  if (!process.env.RESEND_API_KEY || !process.env.RESEND_FROM_EMAIL) {
    if (process.env.NODE_ENV === "production") throw Object.assign(new Error("Email verification is not configured. Set RESEND_API_KEY and RESEND_FROM_EMAIL."), { status: 503 });
    return link;
  }
  const response = await fetch("https://api.resend.com/emails", {
    method: "POST",
    headers: { Authorization: `Bearer ${process.env.RESEND_API_KEY}`, "Content-Type": "application/json" },
    body: JSON.stringify({ from: process.env.RESEND_FROM_EMAIL, to: [email], subject: "Verify your LedgerLens workspace", html: `<p>Verify your email to finish creating your LedgerLens workspace.</p><p><a href="${link}">Verify email</a></p><p>This link expires in 24 hours. If you did not request this, ignore this email.</p>` }),
    signal: AbortSignal.timeout(10000)
  });
  if (!response.ok) throw Object.assign(new Error("Verification email could not be sent."), { status: 503 });
  return null;
}

async function saveVerificationToken(userId) {
  const token = randomBytes(32).toString("base64url");
  await query("DELETE FROM email_verification_tokens WHERE user_id = $1", [userId]);
  await query("INSERT INTO email_verification_tokens(token_hash, user_id, expires_at) VALUES ($1, $2, now() + interval '24 hours')", [hashToken(token), userId]);
  return token;
}

async function createSession(user, tenant) {
  const jti = randomUUID();
  const expiresAt = new Date(Date.now() + sessionLifetimeSeconds * 1000);
  await query("INSERT INTO app_sessions(id, user_id, tenant_id, expires_at) VALUES ($1, $2, $3, $4)", [jti, user.id, tenant.id, expiresAt]);
  const token = jwt.sign({ userId: user.id, email: user.email, tenantId: tenant.id, role: tenant.role, jti }, process.env.JWT_SECRET, { expiresIn: sessionLifetimeSeconds, issuer: "ledgerlens-pro", audience: "ledgerlens-client" });
  return { token, user: { id: user.id, email: user.email, tenantId: tenant.id, tenantName: tenant.name, role: tenant.role } };
}

router.post("/register", limitLoginAttempts, async (req, res, next) => {
  const email = typeof req.body?.email === "string" ? req.body.email.trim().toLowerCase() : "";
  const password = req.body?.password;
  const tenantName = typeof req.body?.workspace_name === "string" ? req.body.workspace_name.trim() : "";
  if (!databaseConfigured()) return res.status(503).json({ message: "Workspace registration requires durable PostgreSQL storage." });
  if (!/^[^\s@]+@[^\s@]+\.[^\s@]+$/.test(email) || email.length > 254) return res.status(400).json({ message: "Enter a valid email address." });
  if (typeof password !== "string" || password.length < 12 || password.length > 256) return res.status(400).json({ message: "Use a password between 12 and 256 characters." });
  if (!tenantName || tenantName.length > 120) return res.status(400).json({ message: "Workspace name must be 1–120 characters." });
  try {
    const passwordHash = await bcrypt.hash(password, 12);
    const { rows } = await withTransaction(async client => {
      const user = await client.query("INSERT INTO app_users(email, password_hash) VALUES ($1, $2) RETURNING id, email", [email, passwordHash]);
      const tenant = await client.query("INSERT INTO tenants(name) VALUES ($1) RETURNING id, name", [tenantName]);
      await client.query("INSERT INTO tenant_memberships(tenant_id, user_id, role) VALUES ($1, $2, 'owner')", [tenant.rows[0].id, user.rows[0].id]);
      return { rows: [{ userId: user.rows[0].id, email: user.rows[0].email, tenantId: tenant.rows[0].id }] };
    });
    const rawToken = await saveVerificationToken(rows[0].userId);
    const verificationUrl = await sendVerification(rows[0].email, rawToken);
    res.status(201).json({ message: "Workspace created. Verify your email before signing in.", ...(verificationUrl ? { verification_url: verificationUrl } : {}) });
  } catch (error) {
    if (error.code === "23505") return res.status(409).json({ message: "An account with this email already exists." });
    next(error);
  }
});

router.get("/verify-email", async (req, res, next) => {
  const token = typeof req.query.token === "string" ? req.query.token : "";
  if (!token || token.length > 128) return res.status(400).json({ message: "Verification link is invalid or expired." });
  try {
    const result = await withTransaction(async client => {
      const found = await client.query("DELETE FROM email_verification_tokens WHERE token_hash = $1 AND expires_at > now() RETURNING user_id", [hashToken(token)]);
      if (!found.rowCount) return false;
      await client.query("UPDATE app_users SET email_verified_at = now() WHERE id = $1", [found.rows[0].user_id]);
      return true;
    });
    if (!result) return res.status(400).json({ message: "Verification link is invalid or expired." });
    res.json({ verified: true, message: "Email verified. You can now sign in." });
  } catch (error) { next(error); }
});

router.post("/verification/resend", limitLoginAttempts, async (req, res, next) => {
  const email = typeof req.body?.email === "string" ? req.body.email.trim().toLowerCase() : "";
  if (!databaseConfigured()) return res.status(503).json({ message: "Email verification requires durable PostgreSQL storage." });
  try {
    const { rows } = await query("SELECT id, email FROM app_users WHERE email = $1 AND email_verified_at IS NULL", [email]);
    if (!rows.length) return res.json({ message: "If that unverified account exists, a new link has been sent." });
    const token = await saveVerificationToken(rows[0].id);
    await sendVerification(rows[0].email, token);
    res.json({ message: "If that unverified account exists, a new link has been sent." });
  } catch (error) { next(error); }
});

router.post("/login", limitLoginAttempts, async (req, res, next) => {
  const { email, password } = req.body || {};
  if (typeof email !== "string" || typeof password !== "string" || email.length > 254 || password.length > 256) return res.status(400).json({ message: "Valid email and password are required" });
  try {
    if (databaseConfigured()) {
      const { rows } = await query("SELECT u.id, u.email, u.password_hash, u.email_verified_at, t.id AS tenant_id, t.name AS tenant_name, m.role FROM app_users u JOIN tenant_memberships m ON m.user_id = u.id JOIN tenants t ON t.id = m.tenant_id WHERE u.email = $1 ORDER BY m.created_at LIMIT 1", [email.trim().toLowerCase()]);
      if (rows.length) {
        const row = rows[0];
        if (!row.email_verified_at) return res.status(403).json({ message: "Verify your email before signing in." });
        if (!await bcrypt.compare(password, row.password_hash)) return res.status(401).json({ message: "Invalid credentials" });
        const session = await createSession({ id: row.id, email: row.email }, { id: row.tenant_id, name: row.tenant_name, role: row.role });
        setSessionCookie(res, session.token);
        return res.json({ user: session.user });
      }
    }
    if (typeof process.env.DEMO_EMAIL !== "string" || typeof process.env.DEMO_PASSWORD_HASH !== "string" || !process.env.JWT_SECRET || process.env.JWT_SECRET.length < 32) return res.status(401).json({ message: "Invalid credentials" });
    const matches = email.toLowerCase() === process.env.DEMO_EMAIL.toLowerCase() && await bcrypt.compare(password, process.env.DEMO_PASSWORD_HASH);
    if (!matches) return res.status(401).json({ message: "Invalid credentials" });
    const user = { userId: "configured-demo-user", email: process.env.DEMO_EMAIL, demo: true, tenantId: "sandbox-demo", role: "viewer" };
    const token = jwt.sign(user, process.env.JWT_SECRET, { expiresIn: "2h", issuer: "ledgerlens-pro", audience: "ledgerlens-client" });
    setSessionCookie(res, token);
    res.json({ user: { id: user.userId, email: user.email, demo: true } });
  } catch (error) { next(error); }
});

router.post("/demo", limitLoginAttempts, (req, res) => {
  const demoEnabled = process.env.DEMO_MODE_ENABLED === "true" || process.env.NODE_ENV !== "production";
  if (!demoEnabled || process.env.PAYPAL_ENV === "production") return res.status(404).json({ message: "Demo access is disabled" });
  if (!process.env.JWT_SECRET || process.env.JWT_SECRET.length < 32) return res.status(503).json({ message: "Authentication is not configured" });
  const user = { userId: "sandbox-demo", email: "demo@ledgerlens.local", demo: true, tenantId: "sandbox-demo", role: "viewer" };
  const token = jwt.sign(user, process.env.JWT_SECRET, { expiresIn: "2h", issuer: "ledgerlens-pro", audience: "ledgerlens-client" });
  setSessionCookie(res, token);
  res.json({ user: { id: user.userId, email: user.email, demo: true } });
});

router.get("/tenants", authenticateToken, async (req, res, next) => {
  if (!databaseConfigured() || req.user.demo) return res.json({ tenants: [] });
  try {
    const { rows } = await query("SELECT t.id, t.name, m.role FROM tenant_memberships m JOIN tenants t ON t.id = m.tenant_id WHERE m.user_id = $1 ORDER BY t.created_at", [req.user.userId]);
    res.json({ tenants: rows });
  } catch (error) { next(error); }
});

router.post("/switch-tenant", authenticateToken, async (req, res, next) => {
  const tenantId = typeof req.body?.tenant_id === "string" ? req.body.tenant_id : "";
  if (!databaseConfigured() || req.user.demo) return res.status(403).json({ message: "Workspace switching is unavailable for this account." });
  try {
    const { rows } = await query("SELECT t.id, t.name, m.role FROM tenant_memberships m JOIN tenants t ON t.id = m.tenant_id WHERE m.user_id = $1 AND t.id = $2", [req.user.userId, tenantId]);
    if (!rows.length) return res.status(403).json({ message: "This account is not a member of that workspace." });
    const session = await createSession({ id: req.user.userId, email: req.user.email }, { ...rows[0], id: rows[0].id });
    setSessionCookie(res, session.token);
    res.json({ user: session.user });
  } catch (error) { next(error); }
});

router.post("/logout", async (req, res) => {
  const cookieHeader = req.headers.cookie || "";
  const sessionCookie = cookieHeader.split(";").map(part => part.trim()).find(part => part.startsWith(`${sessionCookie}=`));
  const rawToken = sessionCookie ? decodeURIComponent(sessionCookie.slice(sessionCookie.indexOf("=") + 1)) : null;
  const claims = rawToken && process.env.JWT_SECRET ? jwt.decode(rawToken) : null;
  if (claims?.jti && databaseConfigured()) await query("DELETE FROM app_sessions WHERE id = $1", [claims.jti]).catch(() => {});
  clearSessionCookie(res);
  res.status(204).end();
});

router.get("/me", authenticateToken, async (req, res) => res.json({ id: req.user.userId, email: req.user.email, demo: Boolean(req.user.demo), tenantId: req.user.tenantId || null, role: req.user.role || null }));

export default router;
