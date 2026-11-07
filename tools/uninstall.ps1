# Suflo — kaldirma (uzanti kimligi tarihsel olarak com.sametcreates.kesit)
$dest = Join-Path $env:APPDATA "Adobe\CEP\extensions\com.sametcreates.kesit"
if (Test-Path $dest) {
    Remove-Item $dest -Recurse -Force
    Write-Host "Suflo kaldirildi: $dest" -ForegroundColor Green
} else {
    Write-Host "Suflo zaten kurulu degil." -ForegroundColor Yellow
}

# PlayerDebugMode: yalniz Suflo'nun degistirdigi geri alinir. Kurucu, deger zaten "1" degilse onceki
# degeri (yoksa "yok") SufloOncekiPlayerDebugMode isaretine yazar. Isaret yoksa deger Suflo'dan once de
# acikti ya da isaretsiz eski bir kurulumdan kaldi: diger eklentiler kullaniyor olabilir, dokunulmaz.
$isaret = "SufloOncekiPlayerDebugMode"
$geriAlinan = 0
foreach ($v in 9..14) {
    $key = "HKCU:\Software\Adobe\CSXS.$v"
    if (-not (Test-Path $key)) { continue }
    $ozellik = Get-ItemProperty -Path $key -ErrorAction SilentlyContinue
    $onceki = $ozellik.$isaret
    if ($null -eq $onceki) { continue }
    if ("$onceki" -eq "yok") {
        Remove-ItemProperty -Path $key -Name "PlayerDebugMode" -ErrorAction SilentlyContinue
    } else {
        New-ItemProperty -Path $key -Name "PlayerDebugMode" -Value "$onceki" -PropertyType String -Force | Out-Null
    }
    Remove-ItemProperty -Path $key -Name $isaret -ErrorAction SilentlyContinue
    $geriAlinan++
}
if ($geriAlinan -gt 0) {
    Write-Host "PlayerDebugMode Suflo'dan onceki haline dondu (CSXS surumu: $geriAlinan)." -ForegroundColor DarkGray
} else {
    Write-Host "Not: PlayerDebugMode ayari dokunulmadan birakildi (Suflo'dan once de acikti ya da diger eklentiler kullaniyor olabilir)."
    Write-Host "Kapatmak istersen: Remove-ItemProperty 'HKCU:\Software\Adobe\CSXS.11' -Name PlayerDebugMode"
}
