import express from "express"
const router = express.Router()

router.get("/", (req, res) => {
  res.json({
    day_30_balance: 2650.00,
    runway_days: 34,
    risk_score: 23,
    trend: { value: 2.1, direction: "up", period: "vs last week" },
    chart_data: Array.from({ length: 30 }, (_, i) => ({
      date: new Date(Date.now() + i * 86400000).toISOString().split("T")[0],
      balance: 7000 - i * 200 + Math.random() * 200 - 100,
      lower_bound: 6000 - i * 200,
      upper_bound: 8000 - i * 200
    })
  })
})

router.post("/simulate", (req, res) => {
  const { delay_days = 0, emergency_amount = 0, cost_reduction = 0 } = req.body
  const base = 2650 - delay_days * 150 - emergency_amount + cost_reduction
  res.json({
    day_30_balance: Math.max(0, base),
    runway_days: Math.max(0, 34 - delay_days),
    scenario_applied: { delay_days, emergency_amount, cost_reduction }
  })
})

export default router
