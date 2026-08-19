# Suflo — geliştirici kurulumu
# Paneli CEP eklenti klasörüne kopyalar ve imzasız eklentilere izin verir.
# Kullanim:  powershell -ExecutionPolicy Bypass -File tools\install.ps1

$ErrorActionPreference = "Stop"
$src = Split-Path -Parent $PSScriptRoot
$dest = Join-Path $env:APPDATA "Adobe\CEP\extensions\com.sametcreates.kesit"
$cepRoot = [IO.Path]::GetFullPath((Join-Path $env:APPDATA "Adobe\CEP\extensions"))
$destFull = [IO.Path]::GetFullPath($dest)
if (-not $destFull.StartsWith($cepRoot + [IO.Path]::DirectorySeparatorChar, [StringComparison]::OrdinalIgnoreCase)) {
    throw "Guvenli olmayan kurulum hedefi: $destFull"
}

Write-Host "Suflo kuruluyor..." -ForegroundColor Cyan

# 1) Imzasiz eklentilere izin (kullanici kapsamli, geri alinabilir)
foreach ($v in 9..14) {
    $key = "HKCU:\Software\Adobe\CSXS.$v"
    if (-not (Test-Path $key)) { New-Item -Path $key -Force | Out-Null }
    New-ItemProperty -Path $key -Name "PlayerDebugMode" -Value "1" -PropertyType String -Force | Out-Null
}
Write-Host "  PlayerDebugMode acildi (CSXS 9-14)" -ForegroundColor DarkGray

# 2) Dosyalari kopyala
if (Test-Path -LiteralPath $destFull) { Remove-Item -LiteralPath $destFull -Recurse -Force }
New-Item -ItemType Directory -Path $destFull -Force | Out-Null
foreach ($item in @("CSXS", "css", "js", "jsx", "fonts", "emoji", "content", "index.html", "README.md", "LICENSE", ".debug")) {
    $p = Join-Path $src $item
    if (Test-Path -LiteralPath $p) { Copy-Item -LiteralPath $p -Destination $destFull -Recurse -Force }
}
Write-Host "  Kopyalandi: $destFull" -ForegroundColor DarkGray

Write-Host ""
Write-Host "Bitti. Premiere Pro'yu yeniden baslat, sonra:" -ForegroundColor Green
Write-Host "  Window > Extensions > Suflo" -ForegroundColor Green
