@echo off
setlocal EnableExtensions
cd /d "%~dp0"
title Superman Agent Lokal
set API_URL=https://monitoringpemasaran-production.up.railway.app

echo.
echo ============================================
echo  Superman Agent - Deklarasi Otomatis (PC)
echo ============================================
echo  Login app diambil dari file .env
echo  (MONITORING_USER / MONITORING_PASSWORD)
echo  Tidak perlu ketik password tiap buka.
echo.

if not exist ".env" (
  echo [!] File .env belum ada.
  echo     Salin .env.example menjadi .env
  echo     Isi: DATABASE_URL, MONITORING_USER, MONITORING_PASSWORD,
  echo          SUPERMAN_USER, SUPERMAN_PASSWORD
  pause
  exit /b 1
)

REM PATH umum setelah auto-install Python
set "PATH=%LocalAppData%\Programs\Python\Python312;%LocalAppData%\Programs\Python\Python312\Scripts;%LocalAppData%\Programs\Python\Python313;%LocalAppData%\Programs\Python\Python313\Scripts;%PATH%"

set "PYEXE="
where py >nul 2>&1 && (
  py -3 -c "import sys" >nul 2>&1
  if not errorlevel 1 set "PYEXE=py -3"
)
if not defined PYEXE (
  where python >nul 2>&1 && (
    python -c "import sys; raise SystemExit(0 if sys.version_info>=(3,10) else 1)" >nul 2>&1
    if not errorlevel 1 set "PYEXE=python"
  )
)
if not defined PYEXE if exist "%LocalAppData%\Programs\Python\Python312\python.exe" set "PYEXE=%LocalAppData%\Programs\Python\Python312\python.exe"
if not defined PYEXE (
  echo [GAGAL] Python belum terpasang.
  echo Double-click dulu: 1-Install-Sekali.bat
  echo ^(itu akan pasang Python otomatis + dependensi agent^)
  pause
  exit /b 1
)

REM Baca MONITORING_* dari .env (lewati baris komentar / kosong)
set "MONITORING_USER="
set "MONITORING_PASSWORD="
for /f "usebackq eol=# tokens=1,* delims==" %%A in (".env") do (
  if /i "%%A"=="MONITORING_USER" set "MONITORING_USER=%%B"
  if /i "%%A"=="MONITORING_PASSWORD" set "MONITORING_PASSWORD=%%B"
)

REM trim spasi sederhana
if defined MONITORING_USER set "MONITORING_USER=%MONITORING_USER: =%"

if "%MONITORING_USER%"=="" (
  echo [!] MONITORING_USER kosong di .env
  echo     Contoh: MONITORING_USER=putrisalsabila6835
  pause
  exit /b 1
)
if "%MONITORING_PASSWORD%"=="" (
  echo [!] MONITORING_PASSWORD kosong di .env
  echo     Isi password app Monitoring untuk user %MONITORING_USER%
  pause
  exit /b 1
)

echo Python:   %PYEXE%
echo User app: %MONITORING_USER%
echo API:      %API_URL%
echo.
echo Menjalankan agent... biarkan jendela ini TERBUKA.
echo Browser web: login sebagai %MONITORING_USER%, lalu Buat Deklarasi Superman.
echo.

%PYEXE% scripts\superman\commands\agent.py watch --api "%API_URL%" --username "%MONITORING_USER%" --password "%MONITORING_PASSWORD%"
set ERR=%ERRORLEVEL%
echo.
if not "%ERR%"=="0" (
  echo Agent berhenti kode %ERR%.
  echo Cek: 1-Install-Sekali.bat  dan isi .env dengan benar
  pause
)
endlocal
exit /b %ERR%
