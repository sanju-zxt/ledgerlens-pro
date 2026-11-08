import express from "express";
import jwt from "jsonwebtoken";
import bcrypt from "bcryptjs";
import { authenticateToken } from "../middleware/auth.js";

const router = express.Router();

const DEMO_USER = {
  id: "1",
  email: "demo@ledgerlens.com",
  passwordHash: "$2a$10$xVqZ5Y7K9L1M2N3O4P5Q6R7S8T9U0V1W2X3Y4Z5A6B7C8D9E0F1G2H3I4J5K"
};

router.post("/login", async (req, res) => {
  try {
    const { email, password } = req.body;
    if (email !== "demo@ledgerlens.com" || !(await bcrypt.compare(password, DEMO_USER.passwordHash))) {
      return res.status(401).json({ message: "Invalid credentials" });
    }
    const token = jwt.sign({ userId: DEMO_USER.id, email: DEMO_USER.email }, process.env.JWT_SECRET || "dev-secret", { expiresIn: "7d" });
    res.json({ token, user: { id: DEMO_USER.id, email: DEMO_USER.email } });
  } catch (err) {
    res.status(500).json({ message: "Login failed" });
  }
});

router.get("/me", authenticateToken, (req, res) => {
  res.json({ id: req.user.userId, email: req.user.email });
});

export default router;
