import jwt from "jsonwebtoken"

export function authenticateToken(req, res, next) {
  const authHeader = req.headers["authorization"]
  const token = authHeader && authHeader.split(" ")[1]

  if (!token) return res.status(401).json({ message: "Access token required" })

  jwt.verify(token, process.env.JWT_SECRET || "dev-secret", (err, user) => {
    if (err) return res.status(403).json({ message: "Invalid token" })
    req.user = user
    next()
  }
}

export function errorHandler(err, req, res, next) {
  console.error(err.stack)
  res.status(500).json({ message: "Internal server error" })
}
