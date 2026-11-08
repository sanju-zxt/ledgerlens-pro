import express from "express"
import cors from "cors"
import dotenv from "dotenv"
import authRoutes from "./routes/auth.js"
import transactionRoutes from "./routes/transactions.js"
import forecastRoutes from "./routes/forecast.js"
import { errorHandler } from "./middleware/errorHandler.js"

dotenv.config()

const app = express()
app.use(cors())
app.use(express.json())

app.get("/api/health", (req, res) => res.json({ status: "ok", timestamp: new Date().toISOString() }))
app.use("/api/auth", authRoutes)
app.use("/api/transactions", transactionRoutes)
app.use("/api/forecast", forecastRoutes)
app.use(errorHandler)

const PORT = process.env.PORT || 4000
app.listen(PORT, () => console.log(`Server running on port ${PORT}`))

export default app
