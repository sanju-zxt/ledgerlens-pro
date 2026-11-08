$ErrorActionPreference = "Stop"
$manifest = Get-Content "manifest.json" -Raw | ConvertFrom-Json

$git = (git rev-parse HEAD).Trim()
if ($git -notmatch "^[0-9a-f]{40}$") { throw "Invalid Git commit format" }
if ($git -ne $manifest.git) { throw "Git commit mismatch" }

foreach ($prop in $manifest.files.PSObject.Properties) {
    $name = $prop.Name
    $expected = $prop.Value.sha256.ToLower()
    $expectedSize = [long]$prop.Value.size

    if ($expected -notmatch "^[0-9a-f]{64}$") { throw "Invalid SHA-256 format: $name" }
    if (!(Test-Path $name -PathType Leaf)) { throw "Missing file: $name" }

    $actual = (Get-FileHash $name -Algorithm SHA256).Hash.ToLower()
    $actualSize = (Get-Item $name).Length

    if ($actual -ne $expected) { throw "Hash mismatch: $name" }
    if ($actualSize -ne $expectedSize) { throw "Size mismatch: $name" }

    Write-Host "PASS: $name"
}

Write-Host "`nALL MANIFEST CHECKS PASSED"
