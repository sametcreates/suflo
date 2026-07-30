# Suflo — geliştirici kurulumu
# Paneli CEP eklenti klasörüne kopyalar ve imzasız eklentilere izin verir.
# Kullanim:  powershell -ExecutionPolicy Bypass -File tools\install.ps1

$ErrorActionPreference = "Stop"
$src = Split-Path -Parent $PSScriptRoot
$dest = Join-Path $env:APPDATA "Adobe\CEP\extensions\com.sametcreates.kesit"

Write-Host "Suflo kuruluyor..." -ForegroundColor Cyan

# 1) Imzasiz eklentilere izin (kullanici kapsamli, geri alinabilir)
foreach ($v in 9..14) {
    $key = "HKCU:\Software\Adobe\CSXS.$v"
    if (-not (Test-Path $key)) { New-Item -Path $key -Force | Out-Null }
    New-ItemProperty -Path $key -Name "PlayerDebugMode" -Value "1" -PropertyType String -Force | Out-Null
}
Write-Host "  PlayerDebugMode acildi (CSXS 9-14)" -ForegroundColor DarkGray

# 2) Dosyalari kopyala
if (Test-Path $dest) { Remove-Item $dest -Recurse -Force }
New-Item -ItemType Directory -Path $dest -Force | Out-Null
foreach ($item in @("CSXS", "css", "js", "jsx", "index.html", ".debug")) {
    $p = Join-Path $src $item
    if (Test-Path $p) { Copy-Item $p -Destination $dest -Recurse -Force }
}
Write-Host "  Kopyalandi: $dest" -ForegroundColor DarkGray

Write-Host ""
Write-Host "Bitti. Premiere Pro'yu yeniden baslat, sonra:" -ForegroundColor Green
Write-Host "  Window > Extensions > Suflo" -ForegroundColor Green
