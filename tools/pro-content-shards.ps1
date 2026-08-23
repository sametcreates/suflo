# Hostinger tek buyuk arsivi acamazsa Pro icerigini kucuk, ayni kok yapisina
# sahip ZIP parcalarina ayirir. Her parca gecici deploy klasorune cikartilir.

param(
    [int]$TargetMB = 140
)

$ErrorActionPreference = "Stop"
$root = Split-Path -Parent $PSScriptRoot
$dist = Join-Path $root "dist"
$private = Join-Path $dist "pro-cdn\upload\private\pro-v1"
$content = Join-Path $private "content"
$manifestPath = Join-Path $private "manifest.json"
$out = Join-Path $dist "pro-content-shards"

function Assert-Inside([string]$Parent, [string]$Child) {
    $p = [System.IO.Path]::GetFullPath($Parent).TrimEnd('\')
    $c = [System.IO.Path]::GetFullPath($Child)
    if (-not ($c -eq $p -or $c.StartsWith($p + '\', [System.StringComparison]::OrdinalIgnoreCase))) {
        throw "Guvenli olmayan cikti yolu: $c"
    }
}

Assert-Inside $dist $out
if ($TargetMB -lt 50 -or $TargetMB -gt 200) { throw "TargetMB 50-200 arasinda olmali." }
if (-not (Test-Path -LiteralPath $content -PathType Container) -or -not (Test-Path -LiteralPath $manifestPath -PathType Leaf)) {
    throw "Pro CDN icerigi eksik. Once build-pro-cdn.js calistir."
}

$manifest = [System.IO.File]::ReadAllText($manifestPath, [System.Text.Encoding]::UTF8) | ConvertFrom-Json
$version = [string]$manifest.content_version
if ($version -notmatch '^[a-zA-Z0-9][a-zA-Z0-9._-]{0,63}$') { throw "Manifest surumu gecersiz." }

if (Test-Path -LiteralPath $out) {
    Assert-Inside $dist $out
    Remove-Item -LiteralPath $out -Recurse -Force
}
New-Item -ItemType Directory -Path $out -Force | Out-Null

Add-Type -AssemblyName System.IO.Compression
Add-Type -AssemblyName System.IO.Compression.FileSystem
$limit = [int64]$TargetMB * 1MB
$groups = @()
$current = @()
$currentBytes = [int64]0

foreach ($entry in $manifest.files) {
    $relative = ([string]$entry.path).Replace('/', '\')
    $source = Join-Path $content $relative
    if (-not (Test-Path -LiteralPath $source -PathType Leaf)) { throw "Manifest dosyasi eksik: $relative" }
    $bytes = (Get-Item -LiteralPath $source).Length
    if ($current.Count -gt 0 -and ($currentBytes + $bytes) -gt $limit) {
        $groups += ,@($current)
        $current = @()
        $currentBytes = [int64]0
    }
    $current += [pscustomobject]@{ Source = $source; Entry = ("content/" + ([string]$entry.path)); Bytes = $bytes }
    $currentBytes += $bytes
}
if ($current.Count -gt 0) { $groups += ,@($current) }

$report = @()
for ($i = 0; $i -lt $groups.Count; $i++) {
    $name = "Suflo-Pro-{0}-part-{1:d3}.zip" -f $version, ($i + 1)
    $zipPath = Join-Path $out $name
    $stream = [System.IO.File]::Open($zipPath, [System.IO.FileMode]::CreateNew)
    try {
        $archive = New-Object System.IO.Compression.ZipArchive($stream, [System.IO.Compression.ZipArchiveMode]::Create, $false)
        try {
            foreach ($item in $groups[$i]) {
                $zipEntry = $archive.CreateEntry($item.Entry, [System.IO.Compression.CompressionLevel]::Optimal)
                $zipEntry.LastWriteTime = (Get-Item -LiteralPath $item.Source).LastWriteTime
                $input = [System.IO.File]::OpenRead($item.Source)
                $output = $zipEntry.Open()
                try { $input.CopyTo($output) } finally { $output.Dispose(); $input.Dispose() }
            }
        } finally { $archive.Dispose() }
    } finally { $stream.Dispose() }
    $file = Get-Item -LiteralPath $zipPath
    $report += [pscustomobject]@{
        name = $name
        files = $groups[$i].Count
        input_bytes = ($groups[$i] | Measure-Object -Property Bytes -Sum).Sum
        zip_bytes = $file.Length
        sha256 = (Get-FileHash -LiteralPath $zipPath -Algorithm SHA256).Hash
    }
    Write-Host ("Parca {0}/{1}: {2} ({3:N1} MB)" -f ($i + 1), $groups.Count, $name, ($file.Length / 1MB))
}

$manifestZip = Join-Path $out ("Suflo-Pro-{0}-manifest.zip" -f $version)
$stream = [System.IO.File]::Open($manifestZip, [System.IO.FileMode]::CreateNew)
try {
    $archive = New-Object System.IO.Compression.ZipArchive($stream, [System.IO.Compression.ZipArchiveMode]::Create, $false)
    try { [System.IO.Compression.ZipFileExtensions]::CreateEntryFromFile($archive, $manifestPath, "manifest.json", [System.IO.Compression.CompressionLevel]::Optimal) | Out-Null }
    finally { $archive.Dispose() }
} finally { $stream.Dispose() }

$manifestFile = Get-Item -LiteralPath $manifestZip
$report += [pscustomobject]@{
    name = $manifestFile.Name
    files = 1
    input_bytes = (Get-Item -LiteralPath $manifestPath).Length
    zip_bytes = $manifestFile.Length
    sha256 = (Get-FileHash -LiteralPath $manifestZip -Algorithm SHA256).Hash
}

$reportPath = Join-Path $out "shards.json"
$report | ConvertTo-Json -Depth 4 | Set-Content -LiteralPath $reportPath -Encoding UTF8
$totalMB = [math]::Round((($report | Measure-Object -Property zip_bytes -Sum).Sum / 1MB), 2)
Write-Host "Hostinger parcalari hazir: $($report.Count) ZIP, $totalMB MB" -ForegroundColor Green
