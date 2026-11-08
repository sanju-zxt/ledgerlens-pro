$ErrorActionPreference = "Stop"
$manifest = Get-Content "manifest.json" -Raw | ConvertFrom-Json

$git = (git rev-parse HEAD).Trim()
if ($git -notmatch "^[0-9a-f]{40}$") { throw "Invalid Git commit format" }
if ($manifest.git -notmatch "^[0-9a-f]{40}$") { throw "Invalid manifest commit format" }
git cat-file -e "$($manifest.git)^{commit}"
if ($LASTEXITCODE -ne 0) { throw "Manifest commit is not present in this repository" }
git merge-base --is-ancestor $manifest.git $git
if ($LASTEXITCODE -ne 0) { throw "Manifest evidence is not anchored to this repository history" }

$requiredEvidence = @(
    "evidence/balance_logs.csv",
    "evidence/backtest.csv",
    "evidence/calibration_data.csv",
    "evidence/paypal_api_responses/balance_response.json"
)
foreach ($name in $requiredEvidence) {
    if (!$manifest.files.PSObject.Properties[$name]) { throw "Required evidence missing from manifest: $name" }
}

foreach ($prop in $manifest.files.PSObject.Properties) {
    $name = $prop.Name
    $expected = $prop.Value.sha256.ToLower()
    $expectedSize = [long]$prop.Value.size

    if ($expected -notmatch "^[0-9a-f]{64}$") { throw "Invalid SHA-256 format: $name" }
    if (!(Test-Path $name -PathType Leaf)) { throw "Missing file: $name" }

    $sha = [System.Security.Cryptography.SHA256]::Create()
    try {
        $digest = $sha.ComputeHash([System.IO.File]::ReadAllBytes((Resolve-Path $name)))
        $actual = ([System.BitConverter]::ToString($digest) -replace "-", "").ToLower()
    } finally { $sha.Dispose() }
    $actualSize = (Get-Item $name).Length

    if ($actual -ne $expected) { throw "Hash mismatch: $name" }
    if ($actualSize -ne $expectedSize) { throw "Size mismatch: $name" }

    Write-Host "PASS: $name"
}

Write-Host "`nALL MANIFEST CHECKS PASSED"
python verify_evidence.py
if ($LASTEXITCODE -ne 0) { throw "Evidence semantic checks failed" }
