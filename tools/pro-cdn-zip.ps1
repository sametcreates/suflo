# Hostinger dosya yoneticisine tek seferde yuklenecek Pro CDN arsivi.
# Once: node tools/build-pro-cdn.js <Suflo Pro Pack> <icerik-surumu>

$ErrorActionPreference = "Stop"
$root = Split-Path -Parent $PSScriptRoot
$upload = Join-Path $root "dist\pro-cdn\upload"
$manifestPath = Join-Path $upload "private\pro-v1\manifest.json"
$apiPath = Join-Path $upload "public_html\pro\v1\index.php"
$configPath = Join-Path $upload "private\pro-v1\config.php"
if (-not (Test-Path -LiteralPath $manifestPath) -or -not (Test-Path -LiteralPath $apiPath) -or -not (Test-Path -LiteralPath $configPath)) {
    throw "Pro CDN agaci eksik. Once build-pro-cdn.js calistir."
}
$manifest = Get-Content -Raw -LiteralPath $manifestPath | ConvertFrom-Json
$version = [string]$manifest.content_version
if ($version -notmatch '^[a-zA-Z0-9][a-zA-Z0-9._-]{0,63}$') { throw "Manifest surumu gecersiz." }
$zip = Join-Path $root ("dist\Suflo-Pro-CDN-" + $version + "-Hostinger.zip")
if (Test-Path -LiteralPath $zip) { Remove-Item -LiteralPath $zip -Force }
Compress-Archive -LiteralPath (Get-ChildItem -LiteralPath $upload | ForEach-Object FullName) -DestinationPath $zip -CompressionLevel Optimal
& node (Join-Path $PSScriptRoot "zip-izin.js") $zip
if ($LASTEXITCODE -ne 0) { throw "ZIP yol ayiraclari Hostinger icin duzeltilemedi." }
$mb = [math]::Round((Get-Item -LiteralPath $zip).Length / 1MB, 2)
Write-Host "Hostinger arsivi hazir: $zip ($mb MB)" -ForegroundColor Green
Write-Host "UYARI: private/pro-v1/config.php gizli token tasir; bu ZIP'i public GitHub'a yukleme." -ForegroundColor Yellow
