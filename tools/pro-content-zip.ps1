# Calisan Pro servisin lisans ayarlarini degistirmeden yalniz icerigi gunceller.
# Once: node tools/build-pro-cdn.js <Suflo Pro Pack> <icerik-surumu>

$ErrorActionPreference = "Stop"
$root = Split-Path -Parent $PSScriptRoot
$private = Join-Path $root "dist\pro-cdn\upload\private\pro-v1"
$content = Join-Path $private "content"
$manifestPath = Join-Path $private "manifest.json"
$configPath = Join-Path $private "config.php"

if (-not (Test-Path -LiteralPath $content -PathType Container) -or -not (Test-Path -LiteralPath $manifestPath -PathType Leaf)) {
    throw "Pro icerik agaci eksik. Once build-pro-cdn.js calistir."
}
if (-not (Test-Path -LiteralPath $configPath -PathType Leaf)) {
    throw "Uretim agaci eksik; yanlis cikti klasoru kullaniliyor olabilir."
}

$manifest = Get-Content -Raw -LiteralPath $manifestPath | ConvertFrom-Json
$version = [string]$manifest.content_version
if ($version -notmatch '^[a-zA-Z0-9][a-zA-Z0-9._-]{0,63}$') { throw "Manifest surumu gecersiz." }
if ([int]$manifest.counts.sfx -lt 1 -or [int]$manifest.counts.mogrt -lt 1) { throw "Manifest icerik sayilari gecersiz." }

$zip = Join-Path $root ("dist\Suflo-Pro-Content-" + $version + ".zip")
if (Test-Path -LiteralPath $zip) { Remove-Item -LiteralPath $zip -Force }
Compress-Archive -LiteralPath @($content, $manifestPath) -DestinationPath $zip -CompressionLevel Optimal
& node (Join-Path $PSScriptRoot "zip-izin.js") $zip
if ($LASTEXITCODE -ne 0) { throw "ZIP yol ayiraclari Hostinger icin duzeltilemedi." }

$mb = [math]::Round((Get-Item -LiteralPath $zip).Length / 1MB, 2)
Write-Host "Guvenli Pro icerik arsivi hazir: $zip ($mb MB)" -ForegroundColor Green
Write-Host "Hostinger'da private/pro-v1 icine yukle ve cikart; config.php dosyasina dokunma." -ForegroundColor Yellow
