# Kesit — dagitim icin .zxp paketi uretir
#
# Gereksinim: Adobe ZXPSignCmd
#   https://github.com/Adobe-CEP/CEP-Resources/tree/master/ZXPSignCMD
#   Indirdigin ZXPSignCmd.exe'yi tools\ altina koy ya da PATH'e ekle.
#
# Kullanim:  powershell -ExecutionPolicy Bypass -File tools\package.ps1

$ErrorActionPreference = "Stop"
$root  = Split-Path -Parent $PSScriptRoot
$dist  = Join-Path $root "dist"
$stage = Join-Path $dist "stage"
$cert  = Join-Path $dist "kesit-selfsigned.p12"
$pass  = "kesit"

# manifest'ten surumu oku
[xml]$mf = Get-Content (Join-Path $root "CSXS\manifest.xml")
$version = $mf.ExtensionManifest.ExtensionBundleVersion
$zxp = Join-Path $dist "Suflo-$version.zxp"

# ZXPSignCmd bul
$signer = $null
foreach ($c in @((Join-Path $PSScriptRoot "ZXPSignCmd.exe"), "ZXPSignCmd.exe", "ZXPSignCmd")) {
    if (Get-Command $c -ErrorAction SilentlyContinue) { $signer = $c; break }
}
if (-not $signer) {
    Write-Host "ZXPSignCmd bulunamadi." -ForegroundColor Red
    Write-Host "Indir: https://github.com/Adobe-CEP/CEP-Resources/tree/master/ZXPSignCMD"
    Write-Host "tools\ZXPSignCmd.exe olarak kaydet ve tekrar calistir."
    exit 1
}

# staging
# Model A (icerik-kapili): Pro icerik (MOGRT/SFX) eklentiyle GELMEZ — satin alan
# Lemon Squeezy'den paketi indirir, panelde "Pro paketini yukle" ile gosterir.
# Boylece hem release birkac MB kalir hem de icerik public'te bedava dusmez.
# Eski davranis (icerik gomulu) icin: $env:SUFLO_BUNDLE_CONTENT = "1"
if (Test-Path $stage) { Remove-Item $stage -Recurse -Force }
New-Item -ItemType Directory -Path $stage -Force | Out-Null
$stageItems = @("CSXS", "css", "js", "jsx", "fonts", "emoji", "assets", "index.html", "README.md", "LICENSE")
if ($env:SUFLO_BUNDLE_CONTENT) { $stageItems += "content" }
foreach ($item in $stageItems) {
    $p = Join-Path $root $item
    if (Test-Path $p) { Copy-Item $p -Destination $stage -Recurse -Force }
}

if ($env:SUFLO_BUNDLE_CONTENT) {
    $sfxSource = $env:SUFLO_SFX_SOURCE
    if (-not $sfxSource) {
        $desktop = [Environment]::GetFolderPath("Desktop")
        $sfxSource = Join-Path $desktop "SUFLO EDIT VAULT - 20+ GB\03 - SUFLO SFX & AUDIO\Sound Effects\SUFLO - Main SFX Library"
    }
    if (-not (Test-Path -LiteralPath $sfxSource)) { throw "Ana SFX kutuphanesi bulunamadi: $sfxSource" }
    $sfxTarget = Join-Path $stage "content\sfx"
    if (Test-Path -LiteralPath $sfxTarget) { Remove-Item -LiteralPath $sfxTarget -Recurse -Force }
    New-Item -ItemType Directory -Path $sfxTarget -Force | Out-Null
    Copy-Item -LiteralPath $sfxSource -Destination $sfxTarget -Recurse -Force
    Write-Host "Ana SFX kutuphanesi eklendi: $sfxSource" -ForegroundColor DarkGray
} else {
    Write-Host "LEAN build (Model A): icerik pakete gomulmedi." -ForegroundColor DarkGray
}

# kendinden imzali sertifika (yoksa uret)
if (-not (Test-Path $cert)) {
    & $signer -selfSignedCert TR Istanbul "sametcreates" "sametcreates" $pass $cert | Out-Null
    Write-Host "Sertifika uretildi: $cert" -ForegroundColor DarkGray
}

if (Test-Path $zxp) { Remove-Item $zxp -Force }
& $signer -sign $stage $zxp $cert $pass -tsa http://timestamp.digicert.com

if (Test-Path $zxp) {
    Remove-Item $stage -Recurse -Force
    $kb = [math]::Round((Get-Item $zxp).Length / 1KB, 1)
    Write-Host ""
    Write-Host "Paket hazir: $zxp ($kb KB)" -ForegroundColor Green
    Write-Host "Kullanicilar ZXP/UXP Installer ile kurabilir." -ForegroundColor Green
} else {
    Write-Host "Imzalama basarisiz." -ForegroundColor Red
    exit 1
}
