import express from "express";
import { authenticateToken } from "../middleware/auth.js";
import { getBalances, paypalConfigured } from "../services/paypal.js";

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

export default router;
