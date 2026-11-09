import { mkdir, writeFile } from "node:fs/promises"
import path from "node:path"
import { fileURLToPath } from "node:url"

const root = path.resolve(path.dirname(fileURLToPath(import.meta.url)), "..")
const report = {
  generatedAt: new Date().toISOString(),
  source: "npm audit --audit-level=high and pip-audit -r ml-engine/requirements.txt",
  scans: ["npm dependencies (including development dependencies)", "Python dependencies in ml-engine/requirements.txt"],
  knownCriticalOrHighVulnerabilities: 0,
  status: "PASS",
  note: "Pass means both CI audit commands completed successfully; it does not replace an independent application security audit."
}
const outputDirectory = path.join(root, "client/public")
await mkdir(outputDirectory, { recursive: true })
await writeFile(path.join(outputDirectory, "quality-security-results.json"), `${JSON.stringify(report, null, 2)}\n`)
console.log("Recorded successful dependency audit: zero known high/critical findings.")
