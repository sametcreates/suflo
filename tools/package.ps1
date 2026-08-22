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
# Pro MOGRT/SFX eklentiye ASLA gomulmez. Lisans etkinlesince Pro Icerik Bulutu
# bunlari private sunucudan indirir. Eski ortam degiskeni acik kaldiysa ucretli
# dosyalari public GitHub release'ine sizdirma riskine karsi paketi durdur.
if ($env:SUFLO_BUNDLE_CONTENT) { throw "SUFLO_BUNDLE_CONTENT desteklenmiyor: Pro icerigi public pakete gomulemez." }
if (Test-Path $stage) { Remove-Item $stage -Recurse -Force }
New-Item -ItemType Directory -Path $stage -Force | Out-Null
$stageItems = @("CSXS", "css", "js", "jsx", "fonts", "emoji", "assets", "index.html", "README.md", "LICENSE")
foreach ($item in $stageItems) {
    $p = Join-Path $root $item
    if (Test-Path $p) { Copy-Item $p -Destination $stage -Recurse -Force }
}
Write-Host "LEAN build: Pro icerigi private buluttan gelir, release'e gomulmedi." -ForegroundColor DarkGray

# bridge.js VERSION'i manifest'ten OTOMATIK senkronla — surum kaymasini kokten onler
# (panel kendini eski sanip surekli "Guncelle" gostermesin). Kaynak dosyaya dokunmaz,
# yalniz paketlenen kopyayi gunceller.
$bridgeStaged = Join-Path $stage "js\bridge.js"
if (Test-Path $bridgeStaged) {
    $raw = [System.IO.File]::ReadAllText($bridgeStaged)
    $raw = [System.Text.RegularExpressions.Regex]::Replace($raw, 'var VERSION = "[^"]*"', "var VERSION = `"$version`"")
    [System.IO.File]::WriteAllText($bridgeStaged, $raw, (New-Object System.Text.UTF8Encoding($false)))
    Write-Host "bridge.js VERSION -> $version" -ForegroundColor DarkGray
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
