# Suflo — kac kisi indirdi / bakti?
# Kullanim:  powershell -ExecutionPolicy Bypass -File tools\istatistik.ps1
# Gereksinim: gh CLI (giris yapilmis olmali)

$repo = "sametcreates/suflo"

function Api($yol) {
  $ham = cmd /c "gh api $yol 2>&1"
  if ($LASTEXITCODE -ne 0) { return $null }
  try { return ($ham -join "`n") | ConvertFrom-Json } catch { return $null }
}

Write-Host ""
Write-Host "  SUFLO ISTATISTIK" -ForegroundColor Cyan
Write-Host "  ----------------" -ForegroundColor DarkGray
Write-Host ""

# --- Surum indirmeleri ---
$rel = Api "repos/$repo/releases"
if ($null -eq $rel) {
  Write-Host "  GitHub'a baglanilamadi. 'gh auth login' yapmis olman gerekiyor." -ForegroundColor Yellow
  exit 1
}

Write-Host "  ZXP INDIRMELERI" -ForegroundColor White
$toplam = 0
foreach ($r in $rel) {
  $zxp = @($r.assets | Where-Object { $_.name -like "*.zxp" })
  $n = 0
  foreach ($a in $zxp) { $n += $a.download_count }
  $toplam += $n
  $tarih = ([datetime]$r.published_at).ToString("dd.MM.yyyy HH:mm")
  Write-Host ("    {0,-10} {1,5} indirme   {2}" -f $r.tag_name, $n, $tarih)
}
Write-Host ("    {0,-10} {1,5} TOPLAM" -f "", $toplam) -ForegroundColor Green
Write-Host ""

# --- Depo ilgisi ---
$d = Api "repos/$repo"
if ($d) {
  Write-Host "  DEPO" -ForegroundColor White
  Write-Host ("    yildiz: {0}   izleyen: {1}   fork: {2}   acik konu: {3}" -f `
    $d.stargazers_count, $d.subscribers_count, $d.forks_count, $d.open_issues_count)
  Write-Host ""
}

# --- Trafik (son 14 gun, sadece depo sahibi gorebilir) ---
$v = Api "repos/$repo/traffic/views"
$c = Api "repos/$repo/traffic/clones"
if ($v) {
  Write-Host "  SON 14 GUN" -ForegroundColor White
  Write-Host ("    depo goruntuleme: {0}   tekil ziyaretci: {1}" -f $v.count, $v.uniques)
  if ($c) { Write-Host ("    klon: {0}   tekil: {1}" -f $c.count, $c.uniques) }
  Write-Host ""
}

Write-Host "  NOT: Web sitesi (suflo.app) ziyaretleri burada GORUNMEZ." -ForegroundColor DarkGray
Write-Host "  GitHub Pages ziyaretci sayaci tutmuyor; site trafigi icin" -ForegroundColor DarkGray
Write-Host "  Cloudflare Web Analytics ya da Plausible gibi bir arac eklemek gerekir." -ForegroundColor DarkGray
Write-Host ""
