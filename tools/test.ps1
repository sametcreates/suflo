# Suflo test kosumu — tools\test.ps1
#
# Testler panelin GERCEK kaynagini (js/*.js) dosyadan okuyup calistirir; kopya
# mantik test etmez. Bu yuzden bir test kirilirsa gercekten urun kirilmistir.
#
# Kullanim:  powershell -ExecutionPolicy Bypass -File tools\test.ps1
#            powershell -ExecutionPolicy Bypass -File tools\test.ps1 -Hizli   (ffmpeg gerektirenleri atla)

param([switch]$Hizli)

$ErrorActionPreference = "Continue"
$kok = Split-Path -Parent $PSScriptRoot
$testDir = Join-Path $kok "tests"

# ffmpeg gerektiren testler: yoksa atlanir (CI'da veya temiz makinede kirmizi gostermesin)
$ffmpegGerekli = @("test-export.js", "test-burn.js")
$ffmpegVar = $null -ne (Get-Command ffmpeg -ErrorAction SilentlyContinue)

$dosyalar = Get-ChildItem -Path $testDir -Filter "*.js" | Sort-Object Name
$gecen = 0; $kalan = 0; $atlanan = 0
$kirilanlar = @()

Write-Host ""
Write-Host "Suflo test kosumu" -ForegroundColor Cyan
Write-Host ("-" * 52)

foreach ($d in $dosyalar) {
  $ad = $d.Name

  if (-not $ffmpegVar -and $ffmpegGerekli -contains $ad) {
    Write-Host ("  ATLA  {0,-22} ffmpeg bulunamadi" -f $ad) -ForegroundColor DarkGray
    $atlanan++
    continue
  }
  if ($Hizli -and $ffmpegGerekli -contains $ad) {
    Write-Host ("  ATLA  {0,-22} -Hizli" -f $ad) -ForegroundColor DarkGray
    $atlanan++
    continue
  }

  $cikti = & node $d.FullName 2>&1
  $kod = $LASTEXITCODE
  $ozet = ($cikti | Select-String -Pattern "gecti|RISK|SORUN" | Select-Object -Last 1)
  if ($null -eq $ozet) { $ozet = ($cikti | Select-Object -Last 1) }

  if ($kod -eq 0) {
    Write-Host ("  OK    {0,-22} {1}" -f $ad, $ozet) -ForegroundColor Green
    $gecen++
  } else {
    Write-Host ("  HATA  {0,-22} {1}" -f $ad, $ozet) -ForegroundColor Red
    $kalan++
    $kirilanlar += $ad
    # kirilan testin FAIL satirlarini goster: sessiz kirmizi ise yaramaz
    $cikti | Select-String -Pattern "^FAIL|^SORUN" | Select-Object -First 6 | ForEach-Object {
      Write-Host ("          " + $_) -ForegroundColor DarkRed
    }
  }
}

Write-Host ("-" * 52)
if ($kalan -eq 0) {
  Write-Host ("TAMAM: {0} dosya gecti, {1} atlandi" -f $gecen, $atlanan) -ForegroundColor Green
} else {
  Write-Host ("KIRIK: {0} dosya kirildi -> {1}" -f $kalan, ($kirilanlar -join ", ")) -ForegroundColor Red
}
Write-Host ""
exit $kalan
