@echo off
chcp 65001 >nul 2>&1
setlocal enabledelayedexpansion
title Suflo Kaldirma / Uninstall

rem Iki dilli: her Turkce satirin altinda Ingilizcesi. Onay E/e (Evet) ya da Y/y (Yes).
rem Suflo-Kur.bat'in tersi: panel klasorunu siler ve PlayerDebugMode'u yalniz Suflo degistirdiyse
rem eski haline dondurur (tools\uninstall.ps1 ile ayni kural).

echo.
echo   ====================================
echo     SUFLO - Kaldirma / Uninstall
echo   ====================================
echo.

set "HEDEF=%APPDATA%\Adobe\CEP\extensions\com.sametcreates.kesit"

rem 1) Onay: yanlislikla cift tiklama hicbir seyi silmesin
set "DEVAM="
set /p DEVAM="  Suflo kaldirilsin mi? / Uninstall Suflo? (E/Y = evet/yes, H/N = hayir/no): "
set "ILK=!DEVAM:~0,1!"
set "ONAY="
if /I "!ILK!"=="E" set "ONAY=1"
if /I "!ILK!"=="Y" set "ONAY=1"
if not defined ONAY (
  echo   Kaldirma iptal edildi. / Uninstall cancelled.
  pause
  exit /b 0
)

rem 2) PlayerDebugMode: kurucu, deger zaten 1 degilse onceki degeri (yoksa "yok") SufloOncekiPlayerDebugMode
rem    isaretine yazar. Isaret yoksa deger Suflo'dan once de acikti ya da isaretsiz eski bir kurulumdan kaldi:
rem    diger eklentiler kullaniyor olabilir, dokunulmaz.
echo   [1/2] Premiere ayari geri aliniyor... / Restoring the Premiere setting...
set "GERI=0"
for %%V in (9 10 11 12 13 14) do (
  set "ONCEKI="
  for /f "tokens=3" %%A in ('reg query "HKCU\Software\Adobe\CSXS.%%V" /v SufloOncekiPlayerDebugMode 2^>nul ^| find /I "SufloOncekiPlayerDebugMode"') do set "ONCEKI=%%A"
  if defined ONCEKI (
    if /I "!ONCEKI!"=="yok" (
      reg delete "HKCU\Software\Adobe\CSXS.%%V" /v PlayerDebugMode /f >nul 2>&1
    ) else (
      reg add "HKCU\Software\Adobe\CSXS.%%V" /v PlayerDebugMode /t REG_SZ /d "!ONCEKI!" /f >nul 2>&1
    )
    reg delete "HKCU\Software\Adobe\CSXS.%%V" /v SufloOncekiPlayerDebugMode /f >nul 2>&1
    set /a GERI+=1
  )
)

rem 3) Panel klasorunu sil
echo   [2/2] Panel siliniyor... / Removing the panel...
if exist "%HEDEF%" (
  rd /s /q "%HEDEF%" >nul 2>&1
  if exist "%HEDEF%" (
    echo.
    echo   HATA: Panel klasoru silinemedi. Premiere Pro ve After Effects'i kapatip tekrar dene.
    echo   ERROR: The panel folder couldn't be removed. Close Premiere Pro and After Effects, then try again.
    echo     %HEDEF%
    echo.
    pause
    exit /b 1
  )
  echo   Suflo kaldirildi. / Suflo was uninstalled.
) else (
  echo   Suflo zaten kurulu degil. / Suflo isn't installed.
)

echo.
if !GERI! GTR 0 (
  echo   PlayerDebugMode Suflo'dan onceki haline dondu ^(CSXS: !GERI!^).
  echo   PlayerDebugMode is back to its pre-Suflo value ^(CSXS: !GERI!^).
) else (
  echo   PlayerDebugMode ayarina dokunulmadi ^(Suflo'dan once de acikti ya da diger eklentiler kullaniyor olabilir^).
  echo   PlayerDebugMode was left as is ^(it was on before Suflo, or other extensions may use it^).
)
echo.
pause
