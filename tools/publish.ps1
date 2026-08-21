# Suflo — tek komutla GitHub yayını
# Gereksinim: gh CLI kurulu ve "gh auth login" yapılmış olmalı.
# Kullanım:  powershell -ExecutionPolicy Bypass -File tools\publish.ps1
#
# Not: PS 5.1'de EAP=Stop altında native komut stderr'i script'i öldürür;
# bu yüzden "beklenen hata" üretebilecek yoklamalar cmd /c üzerinden yapılır.

$ErrorActionPreference = "Stop"
$root = Split-Path -Parent $PSScriptRoot
Set-Location $root
[xml]$mf = Get-Content (Join-Path $root "CSXS\manifest.xml")
$version = $mf.ExtensionManifest.ExtensionBundleVersion
$zxp = Join-Path $root "dist\Suflo-$version.zxp"
$installer = Join-Path $root "dist\Suflo-$version-Kurulum.zip"

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

# Her yayinda paketleri mevcut kaynaktan yeniden uret. Eski ama ayni isimli
# bir ZXP'nin yanlislikla yayinlanmasina izin verme.
& powershell -NoProfile -ExecutionPolicy Bypass -File (Join-Path $PSScriptRoot "package.ps1")
if ($LASTEXITCODE -ne 0) { Write-Host "ZXP uretilemedi." -ForegroundColor Red; exit 1 }
& powershell -NoProfile -ExecutionPolicy Bypass -File (Join-Path $PSScriptRoot "kurucu-yap.ps1")
if ($LASTEXITCODE -ne 0) { Write-Host "Kurulum ZIP'i uretilemedi." -ForegroundColor Red; exit 1 }

& powershell -NoProfile -ExecutionPolicy Bypass -File (Join-Path $PSScriptRoot "verify-release.ps1")
if ($LASTEXITCODE -ne 0) { Write-Host "Yayin paketi dogrulamasi gecmedi." -ForegroundColor Red; exit 1 }

& powershell -NoProfile -ExecutionPolicy Bypass -File (Join-Path $PSScriptRoot "test.ps1")
if ($LASTEXITCODE -ne 0) { Write-Host "Testler gecmedi; yayin durduruldu." -ForegroundColor Red; exit 1 }

& git diff --check
if ($LASTEXITCODE -ne 0) { Write-Host "Git bosluk denetimi gecmedi; yayin durduruldu." -ForegroundColor Red; exit 1 }

# Pro Icerik Bulutu canli degilken yeni istemciyi yayinlama: aksi halde odeme
# yapan kullanicinin ilk otomatik kurulumu 404 ile baslar.
& node (Join-Path $PSScriptRoot "check-pro-cdn.js")
if ($LASTEXITCODE -ne 0) {
    Write-Host "Yayin durduruldu: once private Pro CDN yuklemesini tamamla." -ForegroundColor Red
    exit 1
}

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

git add -A
$staged = @(git diff --cached --name-only)
$yasak = @($staged | Where-Object {
    $_ -match '(^|/)dist/' -or $_ -match '\.(p12|mogrt|wav|mp3|aif|aiff|m4a|flac|ogg|wma)$' -or $_ -match '(^|/)config\.php$'
})
if ($yasak.Count -gt 0) {
    Write-Host ("Yasakli/gizli dosya stage edildi: {0}" -f ($yasak -join ", ")) -ForegroundColor Red
    exit 1
}
$null = cmd /c "git diff --cached --quiet"
if ($LASTEXITCODE -ne 0) {
    & git commit -m "Suflo v$version"
    if ($LASTEXITCODE -ne 0) { Write-Host "Git commit basarisiz; yayin durduruldu." -ForegroundColor Red; exit 1 }
} else {
    Write-Host "Yeni kaynak degisikligi yok; mevcut commit yayinlanacak." -ForegroundColor DarkGray
}

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
$null = cmd /c "gh release view v$version >nul 2>&1"
if ($LASTEXITCODE -ne 0) {
    # Surum notu GERCEKTEN bu surume mi ait? Dosya guncellenmeyi unutulursa
    # yayina bir onceki surumun notlari gider ve kullanici yanlis sey okur.
    $notlar = Join-Path $root "marketing\release-notes.md"
    if (-not (Test-Path $notlar)) {
        Write-Host "release-notes.md yok — yayin durduruldu." -ForegroundColor Red; exit 1
    }
    $ilkSatir = (Get-Content $notlar -TotalCount 1)
    if ($ilkSatir -notmatch [regex]::Escape($version)) {
        Write-Host "DUR: release-notes.md '$version' surumunden bahsetmiyor." -ForegroundColor Red
        Write-Host "     Ilk satir: $ilkSatir" -ForegroundColor DarkGray
        Write-Host "     Notlari guncelle, sonra tekrar calistir." -ForegroundColor DarkGray
        exit 1
    }
    # Yalnizca en ustteki guncel surum bolumunu yayinla. Tum arsivi vermek
    # eski surumlerin satis/iade metinlerini yeni release aciklamasina tasiyordu.
    $guncelBolum = @()
    foreach ($satir in (Get-Content $notlar)) {
        if ($guncelBolum.Count -gt 0 -and $satir -match '^##\s+') { break }
        $guncelBolum += $satir
    }
    $releaseNotesTemp = Join-Path ([System.IO.Path]::GetTempPath()) ("suflo-release-" + $version + ".md")
    try {
        Set-Content -LiteralPath $releaseNotesTemp -Value $guncelBolum -Encoding UTF8
        if (Test-Path -LiteralPath $installer) {
            gh release create "v$version" $zxp $installer --title "Suflo $version" --notes-file $releaseNotesTemp
        } else {
            gh release create "v$version" $zxp --title "Suflo $version" --notes-file $releaseNotesTemp
        }
    } finally {
        if (Test-Path -LiteralPath $releaseNotesTemp) { Remove-Item -LiteralPath $releaseNotesTemp -Force }
    }
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
