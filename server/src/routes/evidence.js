import express from "express";
import path from "node:path";
import { fileURLToPath } from "node:url";
import { authenticateToken } from "../middleware/auth.js";

const router = express.Router();
const root = path.resolve(path.dirname(fileURLToPath(import.meta.url)), "../../../");
const allowed = new Set(["balance_logs.csv", "backtest.csv", "calibration_data.csv"]);
router.use(authenticateToken);
router.get("/manifest", (req, res) => res.sendFile(path.join(root, "manifest.json")));
router.get("/paypal-balance", (req, res) => res.sendFile(path.join(root, "evidence", "paypal_api_responses", "balance_response.json"), error => { if (error) res.status(500).json({ message: "Evidence file could not be read" }); }));
router.get("/:name", (req, res, next) => {
  if (!allowed.has(req.params.name)) return res.status(404).json({ message: "Evidence file not found" });
  res.sendFile(path.join(root, "evidence", req.params.name), error => { if (error) next(error); });
});

export default router;
