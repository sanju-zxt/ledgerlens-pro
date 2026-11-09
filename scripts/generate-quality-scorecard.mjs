import { createHash } from "node:crypto"
import { mkdir, readFile, writeFile } from "node:fs/promises"
import path from "node:path"
import { fileURLToPath } from "node:url"
import Decimal from "decimal.js"
import { readLedgerEvidence } from "../server/src/services/ledger.js"

const root = path.resolve(path.dirname(fileURLToPath(import.meta.url)), "..")
const manifest = JSON.parse(await readFile(path.join(root, "manifest.json"), "utf8"))
const evaluatedAt = new Date().toISOString()
const publicDirectory = path.join(root, "client/public")
async function readOptional(name) {
  try { return JSON.parse(await readFile(path.join(publicDirectory, name), "utf8")) } catch { return null }
}
const testReport = await readOptional("quality-test-results.json")
const securityReport = await readOptional("quality-security-results.json")

function metric(id, name, target, currentValue, sampleSize, measurementSource, status = "NOT EVALUABLE", note = "", lastEvaluatedAt = evaluatedAt) {
  return { id, name, currentValue: currentValue ?? "NOT EVALUABLE", target, measurementSource, sampleSize, lastEvaluatedAt, status, note }
}

let integrity = { verified: 0, total: Object.keys(manifest.files || {}).length, failures: [] }
for (const [relative, metadata] of Object.entries(manifest.files || {})) {
  const absolute = path.resolve(root, relative)
  if (!absolute.startsWith(`${root}${path.sep}`)) {
    integrity.failures.push(`${relative}: path escapes repository`)
    continue
  }
  try {
    const contents = await readFile(absolute)
    const hash = createHash("sha256").update(contents).digest("hex")
    if (hash === metadata.sha256 && contents.length === metadata.size) integrity.verified += 1
    else integrity.failures.push(`${relative}: hash or size mismatch`)
  } catch {
    integrity.failures.push(`${relative}: file missing or unreadable`)
  }
}
const evidenceStatus = integrity.total > 0 && integrity.verified === integrity.total && integrity.failures.length === 0 ? "PASS" : "FAIL"
const ledger = readLedgerEvidence()
const credits = ledger.transactions.filter(tx => tx.type === "CREDIT").reduce((sum, tx) => sum.plus(tx.amount), new Decimal(0))
const debits = ledger.transactions.filter(tx => tx.type === "DEBIT").reduce((sum, tx) => sum.plus(tx.amount), new Decimal(0))
const calculatedClosing = ledger.openingBalance.plus(credits).minus(debits)
const ledgerChecks = [
  calculatedClosing.equals(ledger.closingBalance),
  ledger.events.every((event, index) => Number(event.seq) === index + 1),
  new Set(ledger.transactions.map(tx => tx.id)).size === ledger.transactions.length
]
const ledgerMetric = metric("financial-correctness", "Financial calculation correctness", "100% of validated cases", `${ledgerChecks.filter(Boolean).length}/${ledgerChecks.length} fixture invariants passed`, `1 checked-in ledger fixture; ${ledger.transactions.length} movements`, "Decimal ledger reconciliation: opening + credits − debits; sequence and transaction-ID checks", ledgerChecks.every(Boolean) ? "PASS" : "FAIL", "This verifies one checked-in sandbox ledger only. It is not multicurrency or production financial correctness certification.")

const testMetric = testReport?.passRate != null
  ? metric("tests", "Unit, integration & API test pass rate", "98–100%", `${(testReport.passRate * 100).toFixed(1)}% (${testReport.passedCases}/${testReport.totalCases})`, `${testReport.totalCases} executed cases across ${testReport.suites.length} test commands`, testReport.source, testReport.status, "Counts are from the automated Node and Python test runners; they measure this test suite, not financial/model accuracy.", testReport.generatedAt)
  : metric("tests", "Unit, integration & API test pass rate", "98–100%", null, "Not measured", "Run npm test to capture the case-level test report")
const securityMetric = securityReport?.status === "PASS"
  ? metric("vulnerabilities", "Critical/high dependency vulnerabilities", "0", String(securityReport.knownCriticalOrHighVulnerabilities), securityReport.scans.join("; "), securityReport.source, "PASS", securityReport.note, securityReport.generatedAt)
  : metric("vulnerabilities", "Critical/high dependency vulnerabilities", "0", null, "Not measured", "A successful npm audit and pip-audit result is required")

let calibration = { n: 0, positives: 0, ece: null, brier: null, brierSkill: null, source: "evidence/calibration_data.csv" }
try {
  const csv = await readFile(path.join(root, "evidence/calibration_data.csv"), "utf8")
  const rows = csv.trim().split(/\r?\n/).slice(1).map(line => line.split(",").map(Number)).filter(row => row.length === 2 && row.every(Number.isFinite))
  if (rows.length) {
    const positives = rows.reduce((sum, [, label]) => sum + (label === 1 ? 1 : 0), 0)
    const brier = rows.reduce((sum, [prediction, label]) => sum + (prediction - label) ** 2, 0) / rows.length
    const bins = Array.from({ length: 10 }, () => [])
    for (const [prediction, label] of rows) bins[Math.min(9, Math.floor(prediction * 10))].push([prediction, label])
    const ece = bins.reduce((sum, bin) => bin.length ? sum + bin.length / rows.length * Math.abs(bin.reduce((acc, [p]) => acc + p, 0) / bin.length - bin.reduce((acc, [, y]) => acc + y, 0) / bin.length) : sum, 0)
    const prevalence = positives / rows.length
    const baseline = rows.reduce((sum, [, label]) => sum + (prevalence - label) ** 2, 0) / rows.length
    calibration = { ...calibration, n: rows.length, positives, ece, brier, brierSkill: baseline > 0 ? 1 - brier / baseline : null }
  }
} catch { /* unavailable evidence remains unevaluable */ }

const metrics = [
  testMetric,
  metric("coverage", "Code coverage", "≥90%", null, "Not measured", "Coverage instrumentation is not configured"),
  securityMetric,
  metric("tenant-isolation", "Tenant isolation checks passing", "100%", null, "No tenant isolation suite", "No multi-tenant identity/data boundary exists to validate"),
  ledgerMetric,
  metric("evidence-integrity", "Evidence manifest integrity", "100%", `${integrity.verified}/${integrity.total} files verified`, `${integrity.total} manifest files`, "SHA-256 and byte-size checks against manifest.json", evidenceStatus, integrity.failures.join("; ") || "Integrity checks only; this does not establish that source data is representative or externally authentic"),
  metric("forecast-wape", "Forecast WAPE", "<15%", null, "No paired forecast/outcome rows", "Independent chronological forecast backtest required"),
  metric("forecast-bias", "Forecast bias", "within ±5%", null, "No paired forecast/outcome rows", "Independent chronological forecast backtest required"),
  metric("coverage-70", "70% prediction interval coverage", "65–75%", null, "No paired forecast/outcome rows", "Independent chronological forecast backtest required"),
  metric("coverage-90", "90% prediction interval coverage", "85–95%", null, "No paired forecast/outcome rows", "Independent chronological forecast backtest required"),
  metric("ece", "Expected calibration error (ECE)", "<0.05 on representative independent data", calibration.ece == null ? null : `${calibration.ece.toFixed(6)} (descriptive only)`, `${calibration.n} labels; ${calibration.positives} positive`, calibration.source, "NOT EVALUABLE", "The supplied labels are not an independent representative calibration set; descriptive ECE is not target evidence"),
  metric("brier-skill", "Brier skill vs meaningful baseline", ">0", calibration.brierSkill == null ? "Undefined" : `${calibration.brierSkill.toFixed(6)} (descriptive only)`, `${calibration.n} labels; ${calibration.positives} positive`, `${calibration.source}; observed-prevalence baseline`, "NOT EVALUABLE", "No positive labels are present, so the baseline is not meaningful for event prediction and skill is undefined"),
  metric("anomaly-f1", "Anomaly detection F1", "≥0.85", null, "No independently labeled representative anomaly set", "Independent labeled anomaly evaluation required"),
  metric("api-p95", "Ordinary API endpoint p95 latency", "<500 ms", null, "No load-test sample", "Representative external load test required"),
  metric("availability", "API availability", "≥99.5%", null, "No monitoring window", "Continuous uptime monitoring required")
]

const historical = {
  tests: ["41/41 tests (measured before this mission)", "+6 added test cases; current suite remeasured"],
  coverage: ["Not measured", "No coverage instrumentation yet"],
  vulnerabilities: ["Not measured", "Awaiting successful automated dependency scans"],
  "tenant-isolation": ["Not available", "No tenant boundary or isolation suite exists"],
  "financial-correctness": ["Not measured", "First automated ledger-invariant report; one sandbox fixture"],
  "evidence-integrity": ["Not recorded", "First automated manifest hash/size report"],
  "forecast-wape": ["Not evaluable; generic Normal(78, 15) spend and 5% emergency assumptions", "Removed unsupported baseline assumptions; empirical history required"],
  "forecast-bias": ["Not evaluable", "Now gated on sufficient actual completed-debit history"],
  "coverage-70": ["Not evaluable", "No paired independent forecast/outcome records"],
  "coverage-90": ["Not evaluable", "No paired independent forecast/outcome records"],
  ece: ["0.200869 descriptive; 646 labels, 0 positive", "No improvement can be claimed; representative independent labels are still required"],
  "brier-skill": ["Undefined; all-negative labels", "Still not evaluable; no positive labels or meaningful baseline"],
  "anomaly-f1": ["Not evaluated", "Added robust amount, prior frequency and transaction-velocity features; labels still required"],
  "api-p95": ["Not measured", "No representative API load test"],
  availability: ["Not measured", "No continuous uptime monitoring window"]
}
const scoredMetrics = metrics.map(item => ({ ...item, originalValue: historical[item.id]?.[0] || "No prior measurement recorded", improvement: historical[item.id]?.[1] || "No evidence-backed change recorded" }))

const report = {
  schemaVersion: 1,
  generatedAt: evaluatedAt,
  generator: "scripts/generate-quality-scorecard.mjs",
  policy: "No aggregate score is calculated. Metrics without sufficient, relevant evidence are NOT EVALUABLE.",
  integrity,
  calibration: { source: calibration.source, sampleSize: calibration.n, positiveLabels: calibration.positives, brier: calibration.brier, descriptiveEce: calibration.ece, descriptiveBrierSkill: calibration.brierSkill },
  metrics: scoredMetrics
}

await mkdir(publicDirectory, { recursive: true })
await writeFile(path.join(publicDirectory, "quality-scorecard.json"), `${JSON.stringify(report, null, 2)}\n`)
console.log(`Generated scorecard: ${scoredMetrics.length} metrics; evidence integrity ${integrity.verified}/${integrity.total}; financial fixture invariants ${ledgerChecks.filter(Boolean).length}/${ledgerChecks.length}; no composite score.`)
