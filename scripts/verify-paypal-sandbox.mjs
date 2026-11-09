import "dotenv/config"
import { mkdir, writeFile } from "node:fs/promises"
import { getBalances, listTransactions } from "../server/src/services/paypal.js"

if ((process.env.PAYPAL_ENV || "sandbox") !== "sandbox") {
  throw new Error("This verification is restricted to PAYPAL_ENV=sandbox; refusing to call production PayPal.")
}
if (!process.env.PAYPAL_CLIENT_ID || !process.env.PAYPAL_CLIENT_SECRET) {
  throw new Error("Set PAYPAL_CLIENT_ID and PAYPAL_CLIENT_SECRET in the local server environment first.")
}

const report = {
  schema_version: 1,
  captured_at: new Date().toISOString(),
  environment: "sandbox",
  credential_values_recorded: false,
  account_scope: "PayPal account associated with these Sandbox app credentials; not arbitrary merchants",
  checks: {}
}

const balance = await getBalances()
report.checks.reporting_balances = {
  status: "PASS",
  endpoint: "/v1/reporting/balances",
  currencies: [...new Set((balance.balances || []).map(item => item.currency || item.total_balance?.currency_code).filter(Boolean))],
  refreshed_at: balance.last_refresh_time || balance.as_of_time || null
}

const startDate = new Date(Date.now() - 30 * 86400000).toISOString()
const endDate = new Date().toISOString()
const transactions = await listTransactions({ startDate, endDate })
report.checks.transaction_search = {
  status: "PASS",
  endpoint: "/v1/reporting/transactions",
  period: { start: startDate, end: endDate },
  returned_count: transactions.length,
  completed_count: transactions.filter(item => item.status === "COMPLETED").length,
  currencies: [...new Set(transactions.map(item => item.currency).filter(Boolean))]
}

const output = new URL("../evidence/paypal_sandbox_verification.json", import.meta.url)
await mkdir(new URL("../evidence/", import.meta.url), { recursive: true })
await writeFile(output, `${JSON.stringify(report, null, 2)}\n`)
console.log(JSON.stringify(report, null, 2))
console.log("Sanitized verification saved to evidence/paypal_sandbox_verification.json; no transaction IDs, descriptions, or amounts are retained.")
