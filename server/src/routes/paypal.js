import express from "express";
import { authenticateToken } from "../middleware/auth.js";
import { getBalances, paypalConfigured } from "../services/paypal.js";

const router = express.Router();
router.use(authenticateToken);
router.get("/status", (req, res) => res.json({ configured: paypalConfigured(), environment: process.env.PAYPAL_ENV === "production" ? "production" : "sandbox", connected: false, note: "Server-to-server reporting credentials are configured; this is not an OAuth merchant consent connection." }));
router.get("/balances", async (req, res, next) => {
  try { res.json(await getBalances(req.query.as_of_time)); } catch (error) { next(error); }
});

export default router;
