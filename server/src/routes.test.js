import test from "node:test";
import assert from "node:assert/strict";
import request from "supertest";
import bcrypt from "bcryptjs";
import app from "./app.js";

test("health endpoint is available without exposing account data", async () => {
  const response = await request(app).get("/api/health");
  assert.equal(response.status, 200);
  assert.equal(response.body.status, "ok");
});

test("forecast, ledger, PayPal, and dashboard routes require authentication", async () => {
  for (const path of ["/api/forecast", "/api/transactions", "/api/paypal/status", "/api/dashboard/summary", "/api/evidence/manifest"]) {
    const response = await request(app).get(path);
    assert.equal(response.status, 401, `${path} should require a bearer token`);
  }
});

test("configured login provides access to the evidence ledger", async () => {
  const old = { JWT_SECRET: process.env.JWT_SECRET, DEMO_EMAIL: process.env.DEMO_EMAIL, DEMO_PASSWORD_HASH: process.env.DEMO_PASSWORD_HASH };
  process.env.JWT_SECRET = "test-only-secret-long-enough-for-authentication";
  process.env.DEMO_EMAIL = "merchant@example.test";
  process.env.DEMO_PASSWORD_HASH = bcrypt.hashSync("test-password", 4);
  try {
    const login = await request(app).post("/api/auth/login").send({ email: "merchant@example.test", password: "test-password" });
    assert.equal(login.status, 200);
    const ledger = await request(app).get("/api/transactions?limit=1").set("Authorization", `Bearer ${login.body.token}`);
    assert.equal(ledger.status, 200);
    assert.equal(ledger.body.total, 2);
    assert.equal(ledger.body.data.length, 1);
    assert.equal(ledger.body.source, "SANDBOX_EVIDENCE");
    const reconciliation = await request(app).get("/api/transactions/reconciliation").set("Authorization", `Bearer ${login.body.token}`);
    assert.equal(reconciliation.body.calculated_closing_balance, "6982.56");
    assert.equal(reconciliation.body.reconciled, true);
  } finally {
    for (const [key, value] of Object.entries(old)) value === undefined ? delete process.env[key] : process.env[key] = value;
  }
});
