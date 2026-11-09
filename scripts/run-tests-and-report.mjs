import { spawnSync } from "node:child_process"
import { mkdir, writeFile } from "node:fs/promises"
import path from "node:path"
import { fileURLToPath } from "node:url"

const root = path.resolve(path.dirname(fileURLToPath(import.meta.url)), "..")
const suites = ["test:server", "test:ml", "test:evidence"]
let passed = 0
let failed = 0
let observed = 0
const results = []

for (const suite of suites) {
  const npmCli = process.env.npm_execpath
  const command = npmCli ? process.execPath : process.platform === "win32" ? "npm.cmd" : "npm"
  const args = npmCli ? [npmCli, "run", suite] : ["run", suite]
  const run = spawnSync(command, args, { cwd: root, encoding: "utf8", maxBuffer: 20 * 1024 * 1024 })
  const output = `${run.stdout || ""}${run.stderr || ""}`
  process.stdout.write(output)
  // Node's default reporter is TAP under CI, while local runs may use spec output.
  const nodeTests = output.match(/(?:ℹ\s+tests|#\s*tests)\s+(\d+)/)
  const nodePass = output.match(/(?:ℹ\s+pass|#\s*pass)\s+(\d+)/)
  const nodeFail = output.match(/(?:ℹ\s+fail|#\s*fail)\s+(\d+)/)
  const pythonTests = [...output.matchAll(/Ran\s+(\d+)\s+tests?/g)].reduce((sum, match) => sum + Number(match[1]), 0)
  const count = Number(nodeTests?.[1] || 0) + pythonTests
  const failures = nodeFail ? Number(nodeFail[1]) : run.status === 0 ? 0 : null
  const knownPassed = nodeTests ? Number(nodePass?.[1] || 0) : pythonTests && run.status === 0 ? pythonTests : 0
  observed += count
  passed += knownPassed
  if (failures == null) failed = null
  else if (failed != null) failed += failures
  results.push({ suite, commandPassed: run.status === 0, observedCases: count || null, parsedCaseCount: Boolean(count), failures })
}

const allCommandsPassed = results.every(result => result.commandPassed)
const report = {
  generatedAt: new Date().toISOString(),
  source: "npm test:server, npm test:ml, npm test:evidence",
  suites: results,
  totalCases: observed || null,
  passedCases: observed ? passed : null,
  failedCases: observed && failed != null ? failed : null,
  passRate: observed && failed != null ? passed / observed : null,
  status: !observed || failed == null ? "NOT EVALUABLE" : passed / observed >= 0.98 && allCommandsPassed ? "PASS" : "FAIL"
}
const outputDirectory = path.join(root, "client/public")
await mkdir(outputDirectory, { recursive: true })
await writeFile(path.join(outputDirectory, "quality-test-results.json"), `${JSON.stringify(report, null, 2)}\n`)
console.log(`Test quality: ${report.passedCases ?? "?"}/${report.totalCases ?? "?"} cases passed (${report.status})`)
if (!allCommandsPassed) process.exitCode = 1
