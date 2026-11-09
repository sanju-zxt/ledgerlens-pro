import express from "express"
import cors from "cors"
import helmet from "helmet"
import dotenv from "dotenv"
import authRoutes from "./routes/auth.js"
import transactionRoutes from "./routes/transactions.js"
import forecastRoutes from "./routes/forecast.js"
import paypalRoutes from "./routes/paypal.js"
import evidenceRoutes from "./routes/evidence.js"
import analysisRoutes from "./routes/analysis.js"
import { authenticateToken } from "./middleware/auth.js"
import path from "node:path"
import { fileURLToPath } from "node:url"
import { readLedgerEvidence } from "./services/ledger.js"
import { enforceBrowserOrigin, errorHandler } from "./middleware/auth.js"
import { randomBytes } from "node:crypto"
import { getBalances, normalizePayPalBalances } from "./services/paypal.js"
import webhookRoutes from "./routes/webhooks.js"
import { migrate, databaseConfigured } from "./services/database.js"

dotenv.config({ path: path.resolve(path.dirname(fileURLToPath(import.meta.url)), "../../.env") })
if (process.env.NODE_ENV !== "production" && !process.env.JWT_SECRET) process.env.JWT_SECRET = randomBytes(48).toString("base64url")
if (process.env.NODE_ENV === "production" && (!process.env.JWT_SECRET || process.env.JWT_SECRET.length < 32)) {
  throw new Error("Production requires a JWT_SECRET of at least 32 characters")
}

const app = express()
app.disable("x-powered-by")
if (process.env.NODE_ENV === "production") app.set("trust proxy", 1)
app.use(helmet())
const allowedOrigins = new Set((process.env.CLIENT_ORIGIN || "http://localhost:3000").split(",").map(origin => origin.trim()).filter(Boolean))
app.use(cors({ origin: (origin, callback) => callback(null, !origin || allowedOrigins.has(origin)), credentials: true }))
app.use(enforceBrowserOrigin(allowedOrigins))
app.use("/api/webhooks", webhookRoutes)
app.use(express.json({ limit: "100kb" }))

app.get("/api/health", (req, res) => res.json({ status: "ok", durable_storage_configured: databaseConfigured(), timestamp: new Date().toISOString() }))
app.use("/api/auth", authRoutes)
app.use("/api/transactions", transactionRoutes)
app.use("/api/forecast", forecastRoutes)
app.use("/api/paypal", paypalRoutes)
app.use("/api/evidence", evidenceRoutes)
app.use("/api/analysis", analysisRoutes)
app.get("/api/dashboard/summary", authenticateToken, async (req, res, next) => {
  try {
    if (!req.user.demo) {
      if (!req.user.tenantId) return res.status(409).json({ message: "This account is not attached to a workspace. Sign in to a registered workspace and connect its PayPal merchant account." })
      const response = await getBalances(undefined, req.user.tenantId || null)
      const balances = normalizePayPalBalances(response)
      res.json({ balances, currency: balances.length === 1 ? balances[0].currency : null, closing_balance: balances.length === 1 && Number.isFinite(Number(balances[0].available_balance)) ? Number(balances[0].available_balance) : null, balance_source: "PAYPAL_REPORTING_AVAILABLE_BALANCE", as_of: response.last_refresh_time || response.as_of_time || null, retrieved_at: response.provenance.retrieved_at })
      return
    }
    const ledger = readLedgerEvidence()
    res.json({ closing_balance: ledger.closingBalance.toNumber(), currency: ledger.currency, balance_source: "SANDBOX_EVIDENCE", as_of: ledger.asOf, balance_trend: null })
  } catch (error) { next(error); }
})
app.use(errorHandler)

const PORT = process.env.PORT || 4000
if (process.argv[1] && path.resolve(process.argv[1]) === fileURLToPath(import.meta.url)) {
  migrate().then(() => app.listen(PORT, () => console.log(`Server running on port ${PORT}`))).catch(error => { console.error("Database migration failed:", error.message); process.exitCode = 1; })
}

export default app
