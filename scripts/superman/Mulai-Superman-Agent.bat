@echo off
REM Agent lokal: Playwright di PC ini, app tetap di Railway.
REM Login app: dari .env (MONITORING_USER / MONITORING_PASSWORD) — tanpa ketik tiap kali.
REM Double-click, biarkan jendela terbuka, lalu di web (user sama) klik Buat Deklarasi Superman.

setlocal EnableExtensions
cd /d "%~dp0..\.."
set API_URL=https://monitoringpemasaran-production.up.railway.app

echo.
echo === Superman Local Agent ===
echo API: %API_URL%
echo Login app dari .env (MONITORING_USER / MONITORING_PASSWORD)
echo.

if not exist ".env" (
  echo PERINGATAN: file .env tidak ada.
  echo Isi DATABASE_URL, MONITORING_USER, MONITORING_PASSWORD, SUPERMAN_USER, SUPERMAN_PASSWORD
  echo.
  pause
  exit /b 1
)

set "MONITORING_USER="
set "MONITORING_PASSWORD="
for /f "usebackq eol=# tokens=1,* delims==" %%A in (".env") do (
  if /i "%%A"=="MONITORING_USER" set "MONITORING_USER=%%B"
  if /i "%%A"=="MONITORING_PASSWORD" set "MONITORING_PASSWORD=%%B"
)
if defined MONITORING_USER set "MONITORING_USER=%MONITORING_USER: =%"

if "%MONITORING_USER%"=="" (
  echo [!] MONITORING_USER kosong di .env — contoh: MONITORING_USER=putrisalsabila6835
  pause
  exit /b 1
)
if "%MONITORING_PASSWORD%"=="" (
  echo [!] MONITORING_PASSWORD kosong di .env
  pause
  exit /b 1
)

echo User app: %MONITORING_USER%
echo Menjalankan agent... Ctrl+C untuk berhenti.
echo.

python scripts\superman\commands\agent.py watch --api "%API_URL%" --username "%MONITORING_USER%" --password "%MONITORING_PASSWORD%"
if errorlevel 1 (
  echo.
  echo Gagal. Cek Python, pip install -r requirements.txt, playwright install chromium, dan .env
  pause
)
endlocal
