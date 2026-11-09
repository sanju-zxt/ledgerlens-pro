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

test("forecast, ledger, PayPal, and dashboard routes require a valid session", async () => {
  for (const path of ["/api/forecast", "/api/transactions", "/api/paypal/status", "/api/dashboard/summary", "/api/evidence/manifest"]) {
    const response = await request(app).get(path);
    assert.equal(response.status, 401, `${path} should require a valid session`);
  }
});

test("configured login and explicit sandbox demo session expose only their supported data", async () => {
  const old = { JWT_SECRET: process.env.JWT_SECRET, DEMO_EMAIL: process.env.DEMO_EMAIL, DEMO_PASSWORD_HASH: process.env.DEMO_PASSWORD_HASH, DEMO_MODE_ENABLED: process.env.DEMO_MODE_ENABLED, PAYPAL_ENV: process.env.PAYPAL_ENV };
  process.env.JWT_SECRET = "test-only-secret-long-enough-for-authentication";
  process.env.DEMO_EMAIL = "merchant@example.test";
  process.env.DEMO_PASSWORD_HASH = bcrypt.hashSync("test-password", 4);
    process.env.DEMO_MODE_ENABLED = "true";
    process.env.PAYPAL_ENV = "sandbox";
  try {
    const agent = request.agent(app);
    const login = await agent.post("/api/auth/login").send({ email: "merchant@example.test", password: "test-password" });
    assert.equal(login.status, 200);
    assert.equal(login.body.token, undefined);
    assert.match(login.headers["set-cookie"][0], /HttpOnly/);
    const ledger = await agent.get("/api/transactions?limit=1");
    assert.equal(ledger.status, 200);
    assert.equal(ledger.body.total, 2);
    assert.equal(ledger.body.data.length, 1);
    assert.equal(ledger.body.source, "SANDBOX_EVIDENCE");
    await agent.post("/api/auth/logout").expect(204);
    const demoAgent = request.agent(app);
    const demoLogin = await demoAgent.post("/api/auth/demo").send({});
    assert.equal(demoLogin.status, 200);
    const forecast = await demoAgent.get("/api/forecast");
    assert.equal(forecast.status, 200);
    assert.equal(forecast.body.forecast_status, "insufficient_history");
    assert.equal(forecast.body.ending_balance, undefined);
    assert.match(forecast.body.history_profile.reason, /Need at least 10 completed debit transactions/);
    const scenario = await demoAgent.post("/api/forecast/simulate").send({});
    assert.equal(scenario.status, 400);
    assert.match(scenario.body.message, /enter an explicit daily operating-expense assumption/i);
    const hypothetical = await demoAgent.post("/api/forecast/simulate").send({ daily_expense_mean: 50, daily_expense_std: 0 });
    assert.equal(hypothetical.status, 200);
    assert.equal(hypothetical.body.forecast_status, "scenario");
    assert.equal(hypothetical.body.scenario_applied.expense_assumption_source, "USER_ENTERED_HYPOTHETICAL");
    const reconciliation = await demoAgent.get("/api/transactions/reconciliation");
    assert.equal(reconciliation.body.calculated_closing_balance, "6982.56");
    assert.equal(reconciliation.body.reconciled, true);
    await demoAgent.post("/api/auth/logout").send({}).expect(204);
    await demoAgent.get("/api/transactions").expect(401);
  } finally {
    for (const [key, value] of Object.entries(old)) value === undefined ? delete process.env[key] : process.env[key] = value;
  }
});

test("browser state-changing requests reject unapproved origins", async () => {
  const response = await request(app).post("/api/auth/demo").set("Origin", "https://not-the-client.example").send({});
  assert.equal(response.status, 403);
});
