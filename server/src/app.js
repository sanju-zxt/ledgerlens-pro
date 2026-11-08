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
import { errorHandler } from "./middleware/auth.js"
import { randomBytes } from "node:crypto"
import { getBalances, normalizePayPalBalances } from "./services/paypal.js"

dotenv.config({ path: path.resolve(path.dirname(fileURLToPath(import.meta.url)), "../../.env") })
if (process.env.NODE_ENV !== "production" && !process.env.JWT_SECRET) process.env.JWT_SECRET = randomBytes(48).toString("base64url")

const app = express()
app.disable("x-powered-by")
app.use(helmet())
const allowedOrigins = new Set((process.env.CLIENT_ORIGIN || "http://localhost:3000").split(",").map(origin => origin.trim()).filter(Boolean))
app.use(cors({ origin: (origin, callback) => callback(null, !origin || allowedOrigins.has(origin)) }))
app.use(express.json({ limit: "100kb" }))

app.get("/api/health", (req, res) => res.json({ status: "ok", timestamp: new Date().toISOString() }))
app.use("/api/auth", authRoutes)
app.use("/api/transactions", transactionRoutes)
app.use("/api/forecast", forecastRoutes)
app.use("/api/paypal", paypalRoutes)
app.use("/api/evidence", evidenceRoutes)
app.use("/api/analysis", analysisRoutes)
app.get("/api/dashboard/summary", authenticateToken, async (req, res, next) => {
  try {
    if (!req.user.demo) {
      const response = await getBalances()
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
  app.listen(PORT, () => console.log(`Server running on port ${PORT}`))
}

export default app
