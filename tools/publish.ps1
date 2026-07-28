# Suflo — tek komutla GitHub yayını
# Gereksinim: gh CLI kurulu ve "gh auth login" yapılmış olmalı.
# Kullanım:  powershell -ExecutionPolicy Bypass -File tools\publish.ps1

$ErrorActionPreference = "Stop"
$root = Split-Path -Parent $PSScriptRoot
Set-Location $root

# 0) gh girisi var mi?
gh auth status 2>$null | Out-Null
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
if (-not (git config user.email)) {
    git config user.name "sametcreates"
    git config user.email "sametkaygisiz27@gmail.com"
}

# OWNER yer tutucularini gercek kullaniciyla degistir
foreach ($f in @("docs\index.html", "marketing\lansman-kiti.md")) {
    $p = Join-Path $root $f
    if (Test-Path $p) {
        $c = [System.IO.File]::ReadAllText($p, [System.Text.Encoding]::UTF8)
        $c = $c.Replace("github.com/OWNER/suflo", "github.com/$owner/suflo")
        [System.IO.File]::WriteAllText($p, $c, (New-Object System.Text.UTF8Encoding($false)))
    }
}

git add -A
git commit -m "Suflo v1.1.0" 2>$null | Out-Null

# 2) repo olustur (varsa gec) + push
gh repo view "$owner/suflo" 2>$null | Out-Null
if ($LASTEXITCODE -ne 0) {
    gh repo create suflo --public --source . --remote origin --push `
        --description "Free, open-source AI subtitles for Adobe Premiere Pro. Local Whisper - no subscription, no credits, no limits. TR/AZ/EN/RU."
} else {
    if (-not (git remote | Select-String "^origin$")) {
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
}
gh release view "v$version" 2>$null | Out-Null
if ($LASTEXITCODE -ne 0) {
    gh release create "v$version" $zxp --title "Suflo $version" --notes-file (Join-Path $root "marketing\release-notes.md")
} else {
    Write-Host "Release v$version zaten var." -ForegroundColor DarkGray
}

# 4) GitHub Pages (docs/) — zaten acik ise hata verme
gh api -X POST "repos/$owner/suflo/pages" -f "source[branch]=main" -f "source[path]=/docs" 2>$null | Out-Null

Write-Host ""
Write-Host "YAYINDA:" -ForegroundColor Green
Write-Host "  Repo:    https://github.com/$owner/suflo"
Write-Host "  Indirme: https://github.com/$owner/suflo/releases/latest"
Write-Host "  Site:    https://$owner.github.io/suflo/  (ilk yayin birkac dakika surebilir)"
