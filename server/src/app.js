import express from "express"
import cors from "cors"
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

dotenv.config({ path: path.resolve(path.dirname(fileURLToPath(import.meta.url)), "../../.env") })
if (process.env.NODE_ENV !== "production" && !process.env.JWT_SECRET) process.env.JWT_SECRET = randomBytes(48).toString("base64url")

const app = express()
app.use(cors({ origin: process.env.CLIENT_ORIGIN || "http://localhost:3000" }))
app.use(express.json({ limit: "100kb" }))

app.get("/api/health", (req, res) => res.json({ status: "ok", timestamp: new Date().toISOString() }))
app.use("/api/auth", authRoutes)
app.use("/api/transactions", transactionRoutes)
app.use("/api/forecast", forecastRoutes)
app.use("/api/paypal", paypalRoutes)
app.use("/api/evidence", evidenceRoutes)
app.use("/api/analysis", analysisRoutes)
app.get("/api/dashboard/summary", authenticateToken, (req, res) => {
  const ledger = readLedgerEvidence()
  res.json({ closing_balance: ledger.closingBalance.toNumber(), currency: ledger.currency, balance_source: "SANDBOX_EVIDENCE", as_of: ledger.asOf, balance_trend: null })
})
app.use(errorHandler)

const PORT = process.env.PORT || 4000
if (process.argv[1] && path.resolve(process.argv[1]) === fileURLToPath(import.meta.url)) {
  app.listen(PORT, () => console.log(`Server running on port ${PORT}`))
}

export default app
