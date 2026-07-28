# Suflo — tek komutla GitHub yayını
# Gereksinim: gh CLI kurulu ve "gh auth login" yapılmış olmalı.
# Kullanım:  powershell -ExecutionPolicy Bypass -File tools\publish.ps1
#
# Not: PS 5.1'de EAP=Stop altında native komut stderr'i script'i öldürür;
# bu yüzden "beklenen hata" üretebilecek yoklamalar cmd /c üzerinden yapılır.

$ErrorActionPreference = "Stop"
$root = Split-Path -Parent $PSScriptRoot
Set-Location $root

# gh PATH'te olmayabilir (kurulumdan sonra terminal yenilenmediyse)
if (-not (Get-Command gh -ErrorAction SilentlyContinue)) {
    $env:PATH += ";C:\Program Files\GitHub CLI"
}
if (-not (Get-Command gh -ErrorAction SilentlyContinue)) {
    Write-Host "gh CLI bulunamadi. Kur: winget install GitHub.cli" -ForegroundColor Red
    exit 1
}

# 0) gh girisi var mi?
$null = cmd /c "gh auth status >nul 2>&1"
if ($LASTEXITCODE -ne 0) {
    Write-Host "GitHub girisi yok. Once su komutu calistir:" -ForegroundColor Red
    Write-Host "  gh auth login" -ForegroundColor Yellow
    exit 1
}
$owner = gh api user --jq .login
Write-Host "GitHub kullanicisi: $owner" -ForegroundColor Cyan

# 1) git deposu + commit
if (-not (Test-Path (Join-Path $root ".git"))) {
    git init | Out-Null
    git branch -M main
}
$null = cmd /c "git config user.email >nul 2>&1"
if ($LASTEXITCODE -ne 0) {
    git config user.name "sametcreates"
    git config user.email "sametkaygisiz27@gmail.com"
}

# OWNER yer tutucularini gercek kullaniciyla degistir (bridge.js guncelleme kontrolu dahil)
foreach ($f in @("docs\index.html", "marketing\lansman-kiti.md", "js\bridge.js")) {
    $p = Join-Path $root $f
    if (Test-Path $p) {
        $c = [System.IO.File]::ReadAllText($p, [System.Text.Encoding]::UTF8)
        $c = $c.Replace("OWNER/suflo", "$owner/suflo")
        [System.IO.File]::WriteAllText($p, $c, (New-Object System.Text.UTF8Encoding($false)))
    }
}

git add -A
$null = cmd /c "git commit -m ""Suflo yayin"" >nul 2>&1"

# 2) repo olustur (varsa gec) + push
$null = cmd /c "gh repo view $owner/suflo >nul 2>&1"
if ($LASTEXITCODE -ne 0) {
    gh repo create suflo --public --source . --remote origin --push `
        --description "Free, open-source AI subtitles for Adobe Premiere Pro. Runs Whisper locally (optional cloud) - no subscription, no credits, no limits. TR/AZ/EN/RU."
} else {
    $null = cmd /c "git remote get-url origin >nul 2>&1"
    if ($LASTEXITCODE -ne 0) {
        git remote add origin "https://github.com/$owner/suflo.git"
    }
    git push -u origin main
}

# 3) Release + zxp
[xml]$mf = Get-Content (Join-Path $root "CSXS\manifest.xml")
$version = $mf.ExtensionManifest.ExtensionBundleVersion
$zxp = Join-Path $root "dist\Suflo-$version.zxp"
if (-not (Test-Path $zxp)) {
    Write-Host "Paket yok, uretiliyor..." -ForegroundColor DarkGray
    powershell -ExecutionPolicy Bypass -File (Join-Path $PSScriptRoot "package.ps1")
    if (-not (Test-Path $zxp)) { Write-Host "Paket uretilemedi." -ForegroundColor Red; exit 1 }
}
$null = cmd /c "gh release view v$version >nul 2>&1"
if ($LASTEXITCODE -ne 0) {
    gh release create "v$version" $zxp --title "Suflo $version" --notes-file (Join-Path $root "marketing\release-notes.md")
} else {
    Write-Host "Release v$version zaten var." -ForegroundColor DarkGray
}

# 4) GitHub Pages (docs/) — zaten acik ise sessizce gec
$null = cmd /c "gh api -X POST repos/$owner/suflo/pages -f source[branch]=main -f source[path]=/docs >nul 2>&1"

Write-Host ""
Write-Host "YAYINDA:" -ForegroundColor Green
Write-Host "  Repo:    https://github.com/$owner/suflo"
Write-Host "  Indirme: https://github.com/$owner/suflo/releases/latest"
Write-Host "  Site:    https://$owner.github.io/suflo/  (ilk yayin birkac dakika surebilir)"
