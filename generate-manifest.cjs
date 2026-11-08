const fs = require("node:fs");
const crypto = require("node:crypto");
const { execFileSync } = require("node:child_process");

const files = [
  "evidence/balance_logs.csv",
  "evidence/backtest.csv",
  "evidence/calibration_data.csv",
  "evidence/paypal_api_responses/balance_response.json"
];
const manifest = {
  git: execFileSync("git", ["rev-parse", "HEAD"], { encoding: "utf8" }).trim(),
  generated_at: new Date().toISOString(),
  files: {}
};

for (const file of files) {
  const content = fs.readFileSync(file);
  manifest.files[file] = {
    sha256: crypto.createHash("sha256").update(content).digest("hex"),
    size: fs.statSync(file).size
  };
}

fs.writeFileSync("manifest.json", `${JSON.stringify(manifest, null, 2)}\n`);
console.log(`Manifest generated for ${files.length} evidence files at ${manifest.git}`);
