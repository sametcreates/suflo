@echo off
chcp 65001 >nul 2>&1
setlocal enabledelayedexpansion
title Suflo Kurulum

echo.
echo   ====================================
echo     SUFLO - Premiere Turkce Altyazi
echo   ====================================
echo.

rem Panel dosyalari bu .bat ile AYNI klasorde olmali (panel\ alt klasoru)
set "KAYNAK=%~dp0panel"
set "HEDEF=%APPDATA%\Adobe\CEP\extensions\com.sametcreates.kesit"

if not exist "%KAYNAK%\index.html" (
  echo   HATA: Panel dosyalari bulunamadi.
  echo.
  echo   Bu dosyayi indirdigin ZIP'ten CIKARMADAN calistirmis olabilirsin.
  echo   ZIP'e sag tikla, "Tumunu ayikla" de, sonra bu dosyaya cift tikla.
  echo.
  pause
  exit /b 1
)

rem 1) Premiere acikken kurulum yapilirsa panel bozuk yuklenir
tasklist /FI "IMAGENAME eq Adobe Premiere Pro.exe" 2>nul | find /I "Adobe Premiere Pro.exe" >nul
if not errorlevel 1 (
  echo   UYARI: Premiere Pro su anda acik.
  echo   Kurulumun duzgun olmasi icin once Premiere'i kapat.
  echo.
  set /p DEVAM="  Yine de devam edilsin mi? (E/H): "
  if /I not "!DEVAM!"=="E" (
    echo   Kurulum iptal edildi.
    pause
    exit /b 0
  )
)

rem 2) Imzasiz eklentilere izin. Suflo imzali ama kendi sertifikasiyla imzali;
rem    Adobe yalnizca kendi onayladigi sertifikalari "guvenli" sayiyor.
echo   [1/3] Premiere ayari yapiliyor...
for %%V in (9 10 11 12 13 14) do (
  reg add "HKCU\Software\Adobe\CSXS.%%V" /v PlayerDebugMode /t REG_SZ /d 1 /f >nul 2>&1
)

rem 3) Panel dosyalarini kopyala
echo   [2/3] Panel kopyalaniyor...
if exist "%HEDEF%" rd /s /q "%HEDEF%" >nul 2>&1
mkdir "%HEDEF%" >nul 2>&1
xcopy "%KAYNAK%\*" "%HEDEF%\" /E /I /Y /Q >nul
if errorlevel 1 (
  echo.
  echo   HATA: Dosyalar kopyalanamadi.
  echo   Antivirus engellemis olabilir; bu dosyayi gecici olarak izin listesine ekleyip tekrar dene.
  echo.
  pause
  exit /b 1
)

rem 4) Kurulumu dogrula: dosya gercekten yerinde mi
echo   [3/3] Dogrulaniyor...
if not exist "%HEDEF%\index.html" (
  echo   HATA: Kurulum dogrulanamadi.
  pause
  exit /b 1
)
if not exist "%HEDEF%\CSXS\manifest.xml" (
  echo   HATA: Eksik kurulum ^(manifest yok^).
  pause
  exit /b 1
)

echo.
echo   ====================================
echo     KURULUM TAMAM
echo   ====================================
echo.
echo   Simdi:
echo     1. Premiere Pro'yu ac ^(acikken kurduysan kapatip yeniden ac^)
echo     2. Ustteki menuden:  Window ^> Extensions ^> Suflo
echo.
echo   Ilk altyazida panel gerekli motoru kendisi indirir.
echo.
echo   Takilirsan: https://suflo.app
echo.
pause
