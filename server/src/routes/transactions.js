import express from "express"
import { authenticateToken } from "../middleware/auth.js"

const router = express.Router()
router.use(authenticateToken)

// Mock data
const mockTransactions = [
  { id: "1", date: "2026-10-15", description: "Client Payment - Acme Corp", amount: 3500, type: "CREDIT", source: "API_CONFIRMED" },
  { id: "2", date: "2026-10-10", description: "Stripe Payment Processing", amount: 17.44, type: "DEBIT", source: "API_CONFIRMED" },
  { id: "3", date: "2026-10-05", description: "AWS Hosting", amount: 120, type: "DEBIT", source: "API_CONFIRMED" },
  { id: "3", "AWS Hosting", "DEBIT", 120 },
]

const router = express.Router()
router.use((req, res, next) => {
  req.user = { id: "1" } // Mock auth
  next()
})

router.get("/", (req, res) => {
  const limit = parseInt(req.query.limit) || 50
  res.json({ data: mockTransactions.slice(0, limit), total: mockTransactions.length })
})

export default router
