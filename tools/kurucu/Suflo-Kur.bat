@echo off
chcp 65001 >nul 2>&1
setlocal enabledelayedexpansion
title Suflo Kurulum / Setup

rem Iki dilli: her Turkce satirin altinda Ingilizcesi. Onay E/e (Evet) ya da Y/y (Yes).

echo.
echo   ====================================
echo     SUFLO - Premiere Altyazi / Captions
echo   ====================================
echo.

rem Panel dosyalari bu .bat ile AYNI klasorde olmali (panel\ alt klasoru)
set "KAYNAK=%~dp0panel"
set "HEDEF=%APPDATA%\Adobe\CEP\extensions\com.sametcreates.kesit"

if not exist "%KAYNAK%\index.html" (
  echo   HATA: Panel dosyalari bulunamadi.
  echo   ERROR: Panel files not found.
  echo.
  echo   Bu dosyayi indirdigin ZIP'ten CIKARMADAN calistirmis olabilirsin.
  echo   ZIP'e sag tikla, "Tumunu ayikla" de, sonra bu dosyaya cift tikla.
  echo   You may have run this file without EXTRACTING the ZIP first.
  echo   Right-click the ZIP, choose "Extract All", then double-click this file.
  echo.
  pause
  exit /b 1
)

rem 1) Premiere acikken kurulum yapilirsa panel bozuk yuklenir
tasklist /FI "IMAGENAME eq Adobe Premiere Pro.exe" 2>nul | find /I "Adobe Premiere Pro.exe" >nul
if not errorlevel 1 (
  echo   UYARI: Premiere Pro su anda acik.
  echo   Kurulumun duzgun olmasi icin once Premiere'i kapat.
  echo   WARNING: Premiere Pro is running. Close it first for a clean install.
  echo.
  set "DEVAM="
  set /p DEVAM="  Yine de devam edilsin mi? / Continue anyway? (E/Y = evet/yes, H/N = hayir/no): "
  set "ILK=!DEVAM:~0,1!"
  set "ONAY="
  if /I "!ILK!"=="E" set "ONAY=1"
  if /I "!ILK!"=="Y" set "ONAY=1"
  if not defined ONAY (
    echo   Kurulum iptal edildi. / Setup cancelled.
    pause
    exit /b 0
  )
)

rem 2) Imzasiz eklentilere izin. Suflo imzali ama kendi sertifikasiyla imzali;
rem    Adobe yalnizca kendi onayladigi sertifikalari "guvenli" sayiyor.
echo   [1/3] Premiere ayari yapiliyor... / Configuring Premiere...
for %%V in (9 10 11 12 13 14) do (
  reg add "HKCU\Software\Adobe\CSXS.%%V" /v PlayerDebugMode /t REG_SZ /d 1 /f >nul 2>&1
)

rem 3) Panel dosyalarini kopyala
echo   [2/3] Panel kopyalaniyor... / Copying the panel...
if exist "%HEDEF%" rd /s /q "%HEDEF%" >nul 2>&1
mkdir "%HEDEF%" >nul 2>&1
xcopy "%KAYNAK%\*" "%HEDEF%\" /E /I /Y /Q >nul
if errorlevel 1 (
  echo.
  echo   HATA: Dosyalar kopyalanamadi.
  echo   Antivirus engellemis olabilir; bu dosyayi gecici olarak izin listesine ekleyip tekrar dene.
  echo   ERROR: Files couldn't be copied.
  echo   Your antivirus may have blocked it; allow this file temporarily and try again.
  echo.
  pause
  exit /b 1
)

rem 4) Kurulumu dogrula: dosya gercekten yerinde mi
echo   [3/3] Dogrulaniyor... / Verifying...
if not exist "%HEDEF%\index.html" (
  echo   HATA: Kurulum dogrulanamadi. / ERROR: Install couldn't be verified.
  pause
  exit /b 1
)
if not exist "%HEDEF%\CSXS\manifest.xml" (
  echo   HATA: Eksik kurulum ^(manifest yok^). / ERROR: Incomplete install ^(no manifest^).
  pause
  exit /b 1
)

echo.
echo   ====================================
echo     KURULUM TAMAM / SETUP COMPLETE
echo   ====================================
echo.
echo   Simdi:
echo     1. Premiere Pro'yu ac ^(acikken kurduysan kapatip yeniden ac^)
echo     2. Ustteki menuden:
echo          Premiere 25.6+ / 2026 : Window ^> Extensions (Legacy) ^> Suflo
echo          Daha eski surumler    : Window ^> Extensions ^> Suflo
echo.
echo   Next:
echo     1. Open Premiere Pro ^(restart it if it was open during setup^)
echo     2. From the top menu:
echo          Premiere 25.6+ / 2026 : Window ^> Extensions (Legacy) ^> Suflo
echo          Older versions        : Window ^> Extensions ^> Suflo
echo.
echo   Ilk acilista "Ilk altyazin 2 dakikada" rehberi seni adim adim goturur;
echo   gerekli motoru panel kendisi indirir.
echo   On first launch, pick Turkce or English (beta); the setup guide walks you
echo   through it and the panel downloads the engine it needs by itself.
echo.
echo   Menude Suflo yoksa / Suflo missing from the menu:
echo     https://suflo.app/blog/premiere-suflo-paneli-gorunmuyor
echo   Takilirsan / Need help: https://suflo.app
echo.
pause
