const fs = require("fs");
const crypto = require("crypto");
const { execSync } = require("child_process");
const path = require("path");

const files = [
  "evidence/balance_logs.csv",
  "evidence/backtest.csv",
  "evidence/calibration_data.csv",
  "requirements.txt"
];

const manifest = {
  git: require("child_process").execSync("git rev-parse HEAD", { encoding: "utf8" }).trim(),
  generated_at: new Date().toISOString(),
  files: {}
};

for (const file of files) {
  const content = require("fs").readFileSync(file);
  const hash = require("crypto").createHash("sha256").update(content).digest("hex");
  const size = require("fs").statSync(file).size;
  manifest.files[file] = { sha256: hash, size };
}

require("fs").writeFileSync("manifest.json", JSON.stringify(manifest, null, 2));
console.log("Manifest generated successfully");
