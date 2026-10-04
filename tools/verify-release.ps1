param(
    [string]$ZxpPath = "",
    [string]$InstallerPath = ""
)

$ErrorActionPreference = "Stop"
$root = Split-Path -Parent $PSScriptRoot
[xml]$manifest = Get-Content -LiteralPath (Join-Path $root "CSXS\manifest.xml")
$version = [string]$manifest.ExtensionManifest.ExtensionBundleVersion
# Davet odulleri (manifest.extras.davet ve ref kademeli token) sunucuda yalniz belli bir istemci
# surumunden itibaren gonderilir. Paket o surumden eskiyse karttaki odul vaadi hic gerceklesmez:
# esik server/pro-v1/index.php'den okunur, manifest surumu altindaysa yayin durur.
$serverPhp = Join-Path $root "server\pro-v1\index.php"
if (Test-Path -LiteralPath $serverPhp -PathType Leaf) {
    $esik = [regex]::Match((Get-Content -Raw -LiteralPath $serverPhp), 'version_compare\(\$clientVersion,\s*''([0-9.]+)'',\s*''>=''\)')
    if ($esik.Success -and ([version]$version -lt [version]$esik.Groups[1].Value)) {
        Write-Host ("Surum {0}, davet odullerinin sunucu esigi {1}'in altinda: CSXS/manifest.xml surumunu yukselt." -f $version, $esik.Groups[1].Value) -ForegroundColor Red
        exit 1
    }
}
if (-not $ZxpPath) { $ZxpPath = Join-Path $root ("dist\Suflo-{0}.zxp" -f $version) }
if (-not $InstallerPath) { $InstallerPath = Join-Path $root ("dist\Suflo-{0}-Kurulum.zip" -f $version) }
# Ilk acilis rehberinin ornek klibi (kurucunun kendi sesi/yuzu, MIT ile dagitilir): bu klasordeki
# mp4/wav/mp3 ucretli icerik sayilmaz. Depoda ornek.json varsa pakette de olmali.
$onboardingMedia = '(^|/)assets/onboarding/[^/]+\.(mp4|wav|mp3)$'
$ornekVar = Test-Path -LiteralPath (Join-Path $root "assets\onboarding\ornek.json") -PathType Leaf

# Davet et, kazan: Lemon Squeezy API anahtari TUM MAGAZAYA yetkilidir ve yalniz sunucudaki private
# config.php'de durur. Paketteki metin dosyalarinda gomulu bir Bearer tokeni, dolu bir ls_api_key
# ya da (yerelde biliniyorsa) anahtarin kendisi bulunursa yayin durur. Panelin kullanicinin kendi
# Groq anahtarini gonderdigi "Bearer " + degisken kodu serbesttir; yalniz sabit token aranir.
$lsKeys = @()
if ($env:SUFLO_LS_API_KEY) { $lsKeys += [string]$env:SUFLO_LS_API_KEY }
foreach ($cfgPath in @((Join-Path $root "dist\pro-cdn\upload\private\pro-v1\config.php"), (Join-Path $root "server\pro-v1\config.php"))) {
    if (Test-Path -LiteralPath $cfgPath -PathType Leaf) {
        $m = [regex]::Match((Get-Content -Raw -LiteralPath $cfgPath), "'ls_api_key'\s*=>\s*'([^']+)'")
        if ($m.Success) { $lsKeys += $m.Groups[1].Value }
    }
}
$secretPatterns = @(
    'Bearer\s+[A-Za-z0-9_\-]{20,}\.[A-Za-z0-9_\-]{10,}',
    'Bearer\s+eyJ[A-Za-z0-9_\-]{10,}',
    "ls_api_key'?\s*=>\s*'[^']+'"
)
function Test-Secrets($zip, [string]$kind) {
    $hits = @()
    foreach ($entry in $zip.Entries) {
        if ($entry.FullName -notmatch '\.(js|jsx|html|htm|json|php|txt|md|xml|css|ps1|sh|bat|cmd)$') { continue }
        $reader = New-Object System.IO.StreamReader($entry.Open())
        try { $text = $reader.ReadToEnd() } finally { $reader.Dispose() }
        foreach ($pattern in $secretPatterns) { if ($text -match $pattern) { $hits += $entry.FullName; break } }
        foreach ($key in $lsKeys) { if ($key -and $text.Contains($key)) { $hits += $entry.FullName; break } }
    }
    return @($hits | Select-Object -Unique)
}

foreach ($path in @($ZxpPath, $InstallerPath)) {
    if (-not (Test-Path -LiteralPath $path -PathType Leaf)) {
        Write-Host ("Eksik yayin dosyasi: {0}" -f $path) -ForegroundColor Red
        exit 1
    }
}

$signer = $null
foreach ($candidate in @((Join-Path $PSScriptRoot "ZXPSignCmd.exe"), "ZXPSignCmd.exe", "ZXPSignCmd")) {
    try {
        $cmd = Get-Command $candidate -ErrorAction Stop
        $signer = $cmd.Source
        break
    } catch {}
}
if (-not $signer) {
    Write-Host "ZXPSignCmd bulunamadi; imza dogrulanamadi." -ForegroundColor Red
    exit 1
}

& $signer -verify $ZxpPath -certInfo
if ($LASTEXITCODE -ne 0) {
    Write-Host "ZXP imzasi gecersiz." -ForegroundColor Red
    exit 1
}

Add-Type -AssemblyName System.IO.Compression.FileSystem
function Test-Archive([string]$path, [string]$kind) {
    $zip = [System.IO.Compression.ZipFile]::OpenRead((Resolve-Path -LiteralPath $path))
    try {
        $names = @($zip.Entries | ForEach-Object FullName)
        $paid = @($names | Where-Object { $_ -match '\.(mogrt|prfpset|mov|mp4|m4v|wav|mp3|aif|aiff|m4a|flac|ogg|wma)$' -and $_ -notmatch $onboardingMedia })
        $sample = @($names | Where-Object { $_ -match $onboardingMedia })
        $private = @($names | Where-Object { $_ -match '(^|/)(private|server)(/|$)|(^|/)config\.php$' })
        $badSeparators = @($names | Where-Object { $_ -match '\\' })
        $required = @(
            '(^|/)js/pro-sync\.js$',
            '(^|/)js/preset-pack\.js$',
            '(^|/)js/presets\.js$',
            '(^|/)jsx/host\.jsx$',
            '(^|/)assets/pro-mogrt-showcase/catalog\.json$',
            '(^|/)assets/pro-caption-showcase/catalog\.json$',
            '(^|/)assets/pro-sfx-showcase/catalog\.json$',
            '(^|/)CSXS/manifest\.xml$'
        )
        if ($ornekVar -or $sample.Count) { $required += '(^|/)assets/onboarding/ornek\.json$' }
        $missing = @()
        foreach ($pattern in $required) {
            if (-not ($names | Where-Object { $_ -match $pattern } | Select-Object -First 1)) { $missing += $pattern }
        }
        $secrets = @(Test-Secrets $zip $kind)
        if ($paid.Count -or $private.Count -or $badSeparators.Count -or $missing.Count -or $secrets.Count) {
            Write-Host ("{0} arsiv denetimi basarisiz: paid={1} private={2} separator={3} missing={4} secret={5}" -f $kind,$paid.Count,$private.Count,$badSeparators.Count,$missing.Count,$secrets.Count) -ForegroundColor Red
            if ($secrets.Count) { Write-Host ("Gizli anahtar izi: {0}" -f ($secrets -join ', ')) -ForegroundColor Red }
            exit 1
        }
        $item = Get-Item -LiteralPath $path
        $hash = (Get-FileHash -LiteralPath $path -Algorithm SHA256).Hash
        Write-Host ("{0}: {1} oge, {2:N2} MB, SHA256 {3}, ornek klip dosyasi {4}" -f $kind,$names.Count,($item.Length / 1MB),$hash,$sample.Count) -ForegroundColor Green
    } finally {
        $zip.Dispose()
    }
}

Test-Archive $ZxpPath "ZXP"
Test-Archive $InstallerPath "Kurulum ZIP"
Write-Host ("Suflo {0} yayin paketleri dogrulandi." -f $version) -ForegroundColor Green
