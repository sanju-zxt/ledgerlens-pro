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
let paypalVerification = null
try { paypalVerification = JSON.parse(await readFile(path.join(root, "evidence/paypal_sandbox_verification.json"), "utf8")) } catch { /* no successful live Sandbox check */ }
const syntheticBenchmark = await readOptional("synthetic-benchmark.json")

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

let calibration = { n: 0, positives: 0, negatives: 0, ece: null, brier: null, brierSkill: null, logLoss: null, rocAuc: null, prAuc: null, precision: null, recall: null, f1: null, source: "evidence/calibration_data.csv", datasetVersion: null }
try {
  const csv = await readFile(path.join(root, "evidence/calibration_data.csv"), "utf8")
  calibration.datasetVersion = createHash("sha256").update(csv).digest("hex")
  const rows = csv.trim().split(/\r?\n/).slice(1).map(line => line.split(",").map(Number)).filter(row => row.length === 2 && row.every(Number.isFinite))
  if (rows.length) {
    const positives = rows.reduce((sum, [, label]) => sum + (label === 1 ? 1 : 0), 0)
    const negatives = rows.length - positives
    const brier = rows.reduce((sum, [prediction, label]) => sum + (prediction - label) ** 2, 0) / rows.length
    const epsilon = Number.EPSILON
    const logLoss = -rows.reduce((sum, [prediction, label]) => { const p = Math.max(epsilon, Math.min(1 - epsilon, prediction)); return sum + label * Math.log(p) + (1 - label) * Math.log(1 - p) }, 0) / rows.length
    const bins = Array.from({ length: 10 }, () => [])
    for (const [prediction, label] of rows) bins[Math.min(9, Math.floor(prediction * 10))].push([prediction, label])
    const ece = bins.reduce((sum, bin) => bin.length ? sum + bin.length / rows.length * Math.abs(bin.reduce((acc, [p]) => acc + p, 0) / bin.length - bin.reduce((acc, [, y]) => acc + y, 0) / bin.length) : sum, 0)
    const prevalence = positives / rows.length
    const baseline = rows.reduce((sum, [, label]) => sum + (prevalence - label) ** 2, 0) / rows.length
    const thresholdPredictions = rows.map(([prediction, label]) => ({ predicted: prediction >= 0.5, label }))
    const tp = thresholdPredictions.filter(x => x.predicted && x.label === 1).length
    const fp = thresholdPredictions.filter(x => x.predicted && x.label === 0).length
    const precision = tp + fp ? tp / (tp + fp) : null
    const recall = positives ? tp / positives : null
    calibration = { ...calibration, n: rows.length, positives, negatives, ece, brier, logLoss, rocAuc: null, prAuc: null, precision, recall, f1: recall == null ? null : (precision + recall) ? 2 * precision * recall / (precision + recall) : 0, brierSkill: baseline > 0 ? 1 - brier / baseline : null }
  }
} catch { /* unavailable evidence remains unevaluable */ }

const metrics = [
  testMetric,
  metric("coverage", "Code coverage", "≥90%", null, "Not measured", "Coverage instrumentation is not configured"),
  securityMetric,
  metric("tenant-isolation", "Tenant isolation checks passing", "100%", null, "No tenant isolation suite", "No multi-tenant identity/data boundary exists to validate"),
  ledgerMetric,
  metric("evidence-integrity", "Evidence manifest integrity", "100%", `${integrity.verified}/${integrity.total} files verified`, `${integrity.total} manifest files`, "SHA-256 and byte-size checks against manifest.json", evidenceStatus, integrity.failures.join("; ") || "Integrity checks only; this does not establish that source data is representative or externally authentic"),
  metric("paypal-sandbox", "PayPal Sandbox Reporting integration", "Balances and Transaction Search succeed", paypalVerification ? `${paypalVerification.checks.reporting_balances.status}; ${paypalVerification.checks.transaction_search.status}; ${paypalVerification.checks.transaction_search.returned_count} transactions` : null, paypalVerification ? `${paypalVerification.checks.transaction_search.returned_count} returned in captured 30-day window` : "No successful live Sandbox API check", paypalVerification ? "PayPal Sandbox Reporting API; sanitized evidence/paypal_sandbox_verification.json" : "Run npm run paypal:verify:sandbox with Sandbox credentials", paypalVerification ? "PASS" : "NOT EVALUABLE", paypalVerification?.account_scope || "A successful call verifies only the account associated with these app credentials, not arbitrary merchants.", paypalVerification?.captured_at || evaluatedAt),
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

const classifierTargets = [
  ["ROC-AUC", "rocAuc", "higher", [0.80, 0.90, 0.95]], ["PR-AUC", "prAuc", "higher", [0.50, 0.75, 0.90]],
  ["Precision", "precision", "higher", [0.80, 0.90, 0.95]], ["Recall", "recall", "higher", [0.80, 0.90, 0.95]],
  ["F1-score", "f1", "higher", [0.80, 0.90, 0.95]], ["Brier score", "brier", "lower", [0.15, 0.10, 0.05]],
  ["Log loss", "logLoss", "lower", [0.50, 0.30, 0.20]], ["ECE", "ece", "lower", [0.05, 0.03, 0.01]]
]
const forecastTargets = [
  ["WAPE", "wape", "lower", [0.15, 0.10, 0.05]], ["Normalized MAE", "normalized_mae", "lower", [0.10, 0.05, 0.02]],
  ["Normalized RMSE", "normalized_rmse", "lower", [0.20, 0.10, 0.05]], ["Absolute bias", "absolute_bias", "lower", [0.05, 0.02, 0.01]],
  ["70% interval coverage", "coverage_70", "band", [[0.65, 0.75], [0.68, 0.72], [0.69, 0.71]]],
  ["90% interval coverage", "coverage_90", "band", [[0.85, 0.95], [0.88, 0.92], [0.89, 0.91]]]
]
const tierLabels = ["Good", "Excellent", "Stretch target"]
function targetRow([name, key, direction, thresholds], value, metadata) {
  const evaluable = typeof value === "number" && Number.isFinite(value) && metadata.sample_size > 0 && metadata.status !== "NOT EVALUABLE"
  const tierResults = thresholds.map((threshold, index) => {
    const met = evaluable && (direction === "higher" ? value >= threshold : direction === "lower" ? value <= threshold : value >= threshold[0] && value <= threshold[1])
    const decimalMetric = ["Brier score", "Log loss"].includes(name)
    return { tier: tierLabels[index], target: Array.isArray(threshold) ? `${(threshold[0] * 100).toFixed(0)}–${(threshold[1] * 100).toFixed(0)}%` : `${direction === "higher" ? "≥" : "≤"}${decimalMetric ? threshold.toFixed(2) : `${(threshold * 100).toFixed(Number.isInteger(threshold * 100) ? 0 : 1)}%`}`, status: !evaluable ? "NOT EVALUABLE" : met ? "MEETS" : "BELOW" }
  })
  return { name, key, current_value: evaluable ? value : null, display_value: evaluable ? (["Brier score", "Log loss"].includes(name) ? value.toFixed(6) : `${(value * 100).toFixed(3)}%`) : "NOT EVALUABLE", ...metadata, tiers: tierResults }
}
const calibrationMetadata = { sample_size: calibration.n, measurement_source: calibration.source, dataset_version: calibration.datasetVersion, model_version: "not supplied with evidence file", evaluation_period: { start: null, end: null }, last_evaluated_at: evaluatedAt, status: "MEASURED", reason: calibration.positives === 0 ? "Measured on the supplied sample only; all labels are negative, so this descriptive value is not evidence of representative model performance." : "Measured on the supplied sample only; no independent chronological calibration split is available." }
const evaluatedForecasts = []
function qualityRow(name, value, target, sampleSize, measurementSource, status, reason) {
  const n = sampleSize || 0
  return { name, current_value: value, display_value: value == null ? "NOT EVALUABLE" : String(value), sample_size: n, measurement_source: measurementSource, dataset_version: null, model_version: null, evaluation_period: { start: null, end: null }, last_evaluated_at: evaluatedAt, status: status || "NOT EVALUABLE", reason, tiers: [{ tier: "Target", target, status: status === "PASS" ? "MEETS" : status === "FAIL" ? "BELOW" : "NOT EVALUABLE" }, { tier: "Evidence", target: "Measured only", status: status === "NOT EVALUABLE" ? "NOT EVALUABLE" : "MEASURED" }, { tier: "Scope", target: "See evidence note", status: "NOT EVALUABLE" }] }
}
const targetScorecard = {
  synthetic_benchmark: syntheticBenchmark?.not_customer_evidence ? syntheticBenchmark : null,
  classification: classifierTargets.map(item => targetRow(item, calibration[item[1]], calibrationMetadata)),
  forecasting: forecastTargets.map(item => targetRow(item, null, { sample_size: 0, measurement_source: "Live PayPal forecast snapshots matched to later observed balances (walk-forward)", dataset_version: null, model_version: null, evaluation_period: { start: null, end: null }, last_evaluated_at: evaluatedAt, status: "NOT EVALUABLE", reason: "No paired historical forecast and actual-outcome rows are present in checked-in evidence." })),
  improvement_over_baseline: ["Brier skill", "Log-loss skill", "Forecast MAE improvement", "Forecast RMSE improvement"].map(name => ({ name, current_value: null, display_value: "NOT EVALUABLE", sample_size: 0, measurement_source: "Independent chronological held-out model and baseline comparison", dataset_version: null, model_version: null, evaluation_period: { start: null, end: null }, last_evaluated_at: evaluatedAt, tiers: [{ tier: "Next target", target: ">0.10", status: "NOT EVALUABLE" }, { tier: "Excellent target", target: ">0.20", status: "NOT EVALUABLE" }], reason: "No paired model and meaningful baseline scores from an independent held-out sample." })),
  data_requirements: [
    ["Total reviewed transactions", "100", "2,000+"], ["Reviewed unusual transactions", "10", "200–500+"],
    ["Reviewed expected transactions", "10", "1,000+"], ["Calibration observations", "10 per class", "200+ per class"],
    ["Forecast matched snapshots", "30 per horizon", "100–300 per horizon"]
  ].map(([name, minimum, recommended]) => ({ name, minimum, recommended, current: name === "Calibration observations" ? `${calibration.n} total; ${calibration.positives} positive; ${calibration.negatives} negative` : "NOT EVALUABLE", sample_size: name === "Calibration observations" ? calibration.n : 0, measurement_source: name === "Calibration observations" ? calibration.source : "Source-verified human-reviewed label store or live walk-forward forecast store", dataset_version: name === "Calibration observations" ? calibration.datasetVersion : null, model_version: null, evaluation_period: { start: null, end: null }, last_evaluated_at: evaluatedAt, reason: "Planning gates only; sample count alone does not establish representative labels, independence, or sufficient power." })),
  overall_quality: [
    ["Data provenance", null, "100% traceability"], ["Tenant isolation", null, "100% passing verified boundary tests"],
    ["Evaluation reproducibility", null, "100% repeated-run agreement"], ["Required-field completeness", null, "≥99%"],
    ["Duplicate verified records", null, "0"], ["Artifact version integrity", null, "100% checksum verification"],
    ["Critical-path test coverage", null, "100%"], ["Unit/integration/API test pass rate", testReport?.passRate ?? null, "98–100%"]
  ].map(([name, value, target]) => ({ name, current_value: value, display_value: value == null ? "NOT EVALUABLE" : `${(value * 100).toFixed(1)}%`, target, sample_size: name.includes("test") ? testReport?.totalCases ?? 0 : 0, measurement_source: name.includes("test") ? testReport?.source ?? "Automated test report" : "Requires independent operational or dataset evidence", dataset_version: null, model_version: null, evaluation_period: { start: null, end: null }, last_evaluated_at: evaluatedAt, status: value == null ? "NOT EVALUABLE" : "MEASURED", reason: value == null ? "Evidence source does not currently provide this measurement." : "Suite pass rate only; not a model or financial accuracy score." })),
  engineering_evidence: [
    qualityRow("Financial calculation correctness", `${ledgerChecks.filter(Boolean).length}/${ledgerChecks.length} fixture invariants`, "100% of validated cases", ledger.transactions.length, "Decimal ledger reconciliation, event sequence, duplicate transaction-ID assertions", ledgerChecks.every(Boolean) ? "PASS" : "FAIL", "One checked-in sandbox ledger fixture only; not production or multicurrency certification."),
    qualityRow("Evidence file verification", `${integrity.verified}/${integrity.total} files`, "100% SHA-256 and size match", integrity.total, "manifest.json SHA-256 and byte-size verification", evidenceStatus, "Verifies file integrity against the repository manifest, not independent source authenticity."),
    qualityRow("PayPal Sandbox Reporting integration", paypalVerification ? `Balances ${paypalVerification.checks.reporting_balances.status}; Transaction Search ${paypalVerification.checks.transaction_search.status} (${paypalVerification.checks.transaction_search.returned_count} rows)` : null, "Both Reporting endpoints succeed", paypalVerification?.checks.transaction_search.returned_count ?? 0, "PayPal Sandbox Reporting API; sanitized local verification", paypalVerification ? "PASS" : "NOT EVALUABLE", paypalVerification?.account_scope || "Hosted Render credentials and third-party merchant OAuth onboarding are not verified."),
    qualityRow("Unit/integration/API tests", `${testReport?.passedCases ?? "?"}/${testReport?.totalCases ?? "?"} passed`, "98–100%", testReport?.totalCases, testReport?.source || "Automated test runners", testReport?.status || "NOT EVALUABLE", "Test pass rate is distinct from coverage and model accuracy."),
    qualityRow("Critical/high dependency vulnerabilities", securityReport ? String(securityReport.knownCriticalOrHighVulnerabilities) : null, "0", securityReport?.scans?.length, securityReport?.source || "npm audit and pip-audit", securityReport?.status || "NOT EVALUABLE", securityReport?.note || "No successful dependency audit report is available."),
    qualityRow("Tenant isolation", null, "100%", 0, "One tenant-scoping API test exists; no comprehensive isolation audit report", "NOT EVALUABLE", "A passing code test is not complete multi-tenant security verification."),
    qualityRow("Code coverage", null, "90% overall; 100% critical paths", 0, "Coverage instrumentation not configured", "NOT EVALUABLE", "Pass rate is not code coverage."),
    qualityRow("Data provenance completeness", null, "100% traceability", 0, "Supplied calibration file contains prediction and label only; no reviewer, evidence reference, or timestamp", "NOT EVALUABLE", "The source rows cannot independently establish provenance."),
    qualityRow("Required-field completeness", null, "≥99%", 0, "No representative reviewed-label dataset available in the checked-in evidence", "NOT EVALUABLE", "Awaiting source-verified human-review records."),
    qualityRow("Duplicate verified records", null, "0", 0, "No verified reviewed-label dataset available", "NOT EVALUABLE", "Duplicate checks require source-verified records."),
    qualityRow("Evaluation reproducibility", null, "100% repeated-run agreement", 0, "Deterministic seed tests cover individual forecast logic, not full independent pipeline replay", "NOT EVALUABLE", "A repeat evaluation against a versioned representative dataset has not been recorded."),
    qualityRow("Model artifact version integrity", null, "100% checksum verification", 0, "No production tenant model artifact available", "NOT EVALUABLE", "Requires a trained artifact tied to dataset and model versions."),
    qualityRow("Forecast WAPE / interval coverage", null, "WAPE <15%; interval targets as specified", 0, "Paired live forecast snapshots and actual outcomes", "NOT EVALUABLE", "The supplied backtest CSV has no paired numeric actual/predicted outcomes."),
    qualityRow("API p95 latency / availability", null, "<500 ms / ≥99.5%", 0, "No representative load test or monitoring window", "NOT EVALUABLE", "Requires production telemetry."),
  ]
}

const report = {
  schemaVersion: 1,
  generatedAt: evaluatedAt,
  generator: "scripts/generate-quality-scorecard.mjs",
  policy: "No aggregate score is calculated. Metrics without sufficient, relevant evidence are NOT EVALUABLE.",
  integrity,
  calibration: { source: calibration.source, sampleSize: calibration.n, positiveLabels: calibration.positives, negativeLabels: calibration.negatives, datasetVersion: calibration.datasetVersion, brier: calibration.brier, logLoss: calibration.logLoss, descriptiveEce: calibration.ece, descriptiveBrierSkill: calibration.brierSkill },
  targetScorecard,
  metrics: scoredMetrics
}

await mkdir(publicDirectory, { recursive: true })
await writeFile(path.join(publicDirectory, "quality-scorecard.json"), `${JSON.stringify(report, null, 2)}\n`)
console.log(`Generated scorecard: ${scoredMetrics.length} metrics; evidence integrity ${integrity.verified}/${integrity.total}; financial fixture invariants ${ledgerChecks.filter(Boolean).length}/${ledgerChecks.length}; no composite score.`)
