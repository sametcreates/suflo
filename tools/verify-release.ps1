param(
    [string]$ZxpPath = "",
    [string]$InstallerPath = ""
)

$ErrorActionPreference = "Stop"
$root = Split-Path -Parent $PSScriptRoot
[xml]$manifest = Get-Content -LiteralPath (Join-Path $root "CSXS\manifest.xml")
$version = [string]$manifest.ExtensionManifest.ExtensionBundleVersion
if (-not $ZxpPath) { $ZxpPath = Join-Path $root ("dist\Suflo-{0}.zxp" -f $version) }
if (-not $InstallerPath) { $InstallerPath = Join-Path $root ("dist\Suflo-{0}-Kurulum.zip" -f $version) }

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
        $paid = @($names | Where-Object { $_ -match '\.(mogrt|wav|mp3|aif|aiff|m4a|flac|ogg|wma)$' })
        $private = @($names | Where-Object { $_ -match '(^|/)(private|server)(/|$)|(^|/)config\.php$' })
        $badSeparators = @($names | Where-Object { $_ -match '\\' })
        $required = @(
            '(^|/)js/pro-sync\.js$',
            '(^|/)assets/pro-mogrt-showcase/catalog\.json$',
            '(^|/)assets/pro-sfx-showcase/catalog\.json$',
            '(^|/)CSXS/manifest\.xml$'
        )
        $missing = @()
        foreach ($pattern in $required) {
            if (-not ($names | Where-Object { $_ -match $pattern } | Select-Object -First 1)) { $missing += $pattern }
        }
        if ($paid.Count -or $private.Count -or $badSeparators.Count -or $missing.Count) {
            Write-Host ("{0} arsiv denetimi basarisiz: paid={1} private={2} separator={3} missing={4}" -f $kind,$paid.Count,$private.Count,$badSeparators.Count,$missing.Count) -ForegroundColor Red
            exit 1
        }
        $item = Get-Item -LiteralPath $path
        $hash = (Get-FileHash -LiteralPath $path -Algorithm SHA256).Hash
        Write-Host ("{0}: {1} oge, {2:N2} MB, SHA256 {3}" -f $kind,$names.Count,($item.Length / 1MB),$hash) -ForegroundColor Green
    } finally {
        $zip.Dispose()
    }
}

Test-Archive $ZxpPath "ZXP"
Test-Archive $InstallerPath "Kurulum ZIP"
Write-Host ("Suflo {0} yayin paketleri dogrulandi." -f $version) -ForegroundColor Green

