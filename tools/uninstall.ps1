# Suflo — kaldirma (uzanti kimligi tarihsel olarak com.sametcreates.kesit)
$dest = Join-Path $env:APPDATA "Adobe\CEP\extensions\com.sametcreates.kesit"
if (Test-Path $dest) {
    Remove-Item $dest -Recurse -Force
    Write-Host "Suflo kaldirildi: $dest" -ForegroundColor Green
} else {
    Write-Host "Suflo zaten kurulu degil." -ForegroundColor Yellow
}
Write-Host "Not: PlayerDebugMode ayari dokunulmadan birakildi (diger eklentiler kullaniyor olabilir)."
Write-Host "Kapatmak istersen: Remove-ItemProperty 'HKCU:\Software\Adobe\CSXS.11' -Name PlayerDebugMode"
