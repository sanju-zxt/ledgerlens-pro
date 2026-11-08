import express from "express";
import jwt from "jsonwebtoken";
import bcrypt from "bcryptjs";
import { authenticateToken } from "../middleware/auth.js";

const router = express.Router();
const attempts = new Map();
const sessionCookie = "ledgerlens_session";
function setSessionCookie(res, token) {
  const secure = process.env.NODE_ENV === "production" ? "; Secure; SameSite=Lax" : "; SameSite=Lax";
  res.setHeader("Set-Cookie", `${sessionCookie}=${encodeURIComponent(token)}; HttpOnly; Path=/; Max-Age=7200${secure}`);
}
function clearSessionCookie(res) {
  const secure = process.env.NODE_ENV === "production" ? "; Secure; SameSite=Lax" : "; SameSite=Lax";
  res.setHeader("Set-Cookie", `${sessionCookie}=; HttpOnly; Path=/; Max-Age=0${secure}`);
}
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

router.post("/login", limitLoginAttempts, async (req, res) => {
  const { email, password } = req.body || {};
  if (typeof email !== "string" || typeof password !== "string" || email.length > 254 || password.length > 256) return res.status(400).json({ message: "Valid email and password are required" });
  if (!process.env.JWT_SECRET || process.env.JWT_SECRET.length < 32 || !process.env.DEMO_EMAIL || !process.env.DEMO_PASSWORD_HASH) return res.status(503).json({ message: "Authentication is not configured. Set a 32-character JWT_SECRET, DEMO_EMAIL, and DEMO_PASSWORD_HASH." });
  try {
    const matches = email.toLowerCase() === process.env.DEMO_EMAIL.toLowerCase() && await bcrypt.compare(password, process.env.DEMO_PASSWORD_HASH);
    if (!matches) return res.status(401).json({ message: "Invalid credentials" });
    const user = { userId: "configured-demo-user", email: process.env.DEMO_EMAIL };
    const token = jwt.sign(user, process.env.JWT_SECRET, { expiresIn: "2h", issuer: "ledgerlens-pro", audience: "ledgerlens-client" });
    setSessionCookie(res, token);
    res.json({ user: { id: user.userId, email: user.email } });
  } catch { res.status(500).json({ message: "Login failed" }); }
});

router.post("/demo", limitLoginAttempts, (req, res) => {
  const demoEnabled = process.env.DEMO_MODE_ENABLED === "true" || process.env.NODE_ENV !== "production";
  if (!demoEnabled || process.env.PAYPAL_ENV === "production") return res.status(404).json({ message: "Demo access is disabled" });
  if (!process.env.JWT_SECRET || process.env.JWT_SECRET.length < 32) return res.status(503).json({ message: "Authentication is not configured" });
  const user = { userId: "sandbox-demo", email: "demo@ledgerlens.local", demo: true };
  const token = jwt.sign(user, process.env.JWT_SECRET, { expiresIn: "2h", issuer: "ledgerlens-pro", audience: "ledgerlens-client" });
  setSessionCookie(res, token);
  res.json({ user: { id: user.userId, email: user.email, demo: true } });
});

router.post("/logout", (req, res) => { clearSessionCookie(res); res.status(204).end(); });
router.get("/me", authenticateToken, (req, res) => res.json({ id: req.user.userId, email: req.user.email, demo: Boolean(req.user.demo) }));

export default router;
