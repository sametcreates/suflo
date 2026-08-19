# Suflo — son kullanıcı kurulum paketi üretir
#
# Neden: .zxp kurmak için kullanıcının ayrıca ZXP/UXP Installer indirmesi gerekiyor.
# Bu iki adım, ürüne hiç giremeden düşen kullanıcıların en büyük sebebi. Bu paket
# tek dosyaya indiriyor: ZIP'i aç, kur dosyasına çift tıkla, bitti.
#
# Kullanım:  powershell -ExecutionPolicy Bypass -File tools\kurucu-yap.ps1

$ErrorActionPreference = "Stop"
$root = Split-Path -Parent $PSScriptRoot
Set-Location $root

[xml]$mf = Get-Content (Join-Path $root "CSXS\manifest.xml")
$surum = $mf.ExtensionManifest.ExtensionBundleVersion

$stage = Join-Path $env:TEMP "suflo-kurucu"
$panel = Join-Path $stage "panel"
if (Test-Path $stage) { Remove-Item $stage -Recurse -Force }
New-Item -ItemType Directory -Path $panel -Force | Out-Null

# Panelin çalışması için gereken her şey (kurucu betikleri hariç)
foreach ($item in @("CSXS", "css", "js", "jsx", "fonts", "emoji", "content", "index.html", "LICENSE")) {
    $p = Join-Path $root $item
    if (Test-Path $p) { Copy-Item $p -Destination $panel -Recurse -Force }
}

# Kurucular paketin köküne
Copy-Item (Join-Path $PSScriptRoot "kurucu\Suflo-Kur.bat") -Destination $stage -Force
Copy-Item (Join-Path $PSScriptRoot "kurucu\Suflo-Kur.command") -Destination $stage -Force

# Kısa yol tarifi: ZIP'i açan kişi ne yapacağını dosya adından anlamalı
$oku = @"
SUFLO - Premiere Turkce Altyazi
===============================

KURULUM (2 adim)

  Windows : "Suflo-Kur.bat" dosyasina cift tikla
  Mac     : "Suflo-Kur.command" dosyasina cift tikla

  Sonra Premiere Pro'yu ac:  Window > Extensions > Suflo

Not: Windows "Bilinmeyen yayimci" uyarisi verirse
"Ek bilgi" > "Yine de calistir" de. Suflo acik kaynak,
kodun tamami burada: github.com/sametcreates/suflo

Mac'te "gelistirici dogrulanamadi" derse: dosyaya sag tikla,
"Ac" de, cikan pencerede yine "Ac" secenegini tikla.

Mac'te "erisim ayricaliklarina sahip degilsiniz" derse:
Terminal'i ac, once su komutu yaz (sonuna BOSLUK birak),
sonra Suflo-Kur.command dosyasini Terminal penceresine SURUKLE
ve Enter'a bas:

  chmod +x

Sonra dosyaya tekrar cift tikla.

Panel ilk altyazida gerekli motoru kendisi indirir;
senin ayrica bir sey kurman gerekmez.

Yardim: https://suflo.app
Surum : $surum
"@
Set-Content -Path (Join-Path $stage "OKUBENI.txt") -Value $oku -Encoding UTF8

$dist = Join-Path $root "dist"
New-Item -ItemType Directory -Path $dist -Force | Out-Null
$zip = Join-Path $dist "Suflo-$surum-Kurulum.zip"
if (Test-Path $zip) { Remove-Item $zip -Force }

Compress-Archive -Path (Join-Path $stage "*") -DestinationPath $zip -Force
Remove-Item $stage -Recurse -Force

# Compress-Archive Unix izin bitlerini yazmaz: macOS'ta .command calistirilamaz
# halde cikiyor ve kullanici "erisim ayricaliklarina sahip degilsiniz" aliyor.
node (Join-Path $PSScriptRoot "zip-izin.js") $zip
if ($LASTEXITCODE -ne 0) {
    Write-Host "UYARI: ZIP izinleri yazilamadi - macOS kurucusu calismayabilir!" -ForegroundColor Red
}

$mb = [math]::Round((Get-Item $zip).Length / 1MB, 2)
Write-Host ""
Write-Host "Kurulum paketi hazir: $zip ($mb MB)" -ForegroundColor Green
Write-Host "Kullanici: ZIP'i acar, kur dosyasina cift tiklar, Premiere'i acar." -ForegroundColor DarkGray
