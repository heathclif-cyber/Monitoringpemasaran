@echo off
REM Agent lokal: Playwright di PC ini, app tetap di Railway.
REM Double-click file ini, biarkan jendela terbuka, lalu di web klik Buat Deklarasi Superman.

cd /d "%~dp0..\.."
set API_URL=https://monitoringpemasaran-production.up.railway.app

echo.
echo === Superman Local Agent ===
echo API: %API_URL%
echo Login ke app Monitoring (bukan portal Superman)...
echo.

set /p APP_USER=Username app Monitoring: 
set /p APP_PASS=Password app Monitoring: 

echo.
echo Menjalankan agent... Ctrl+C untuk berhenti.
echo.

python scripts\superman\commands\agent.py watch --api "%API_URL%" --username "%APP_USER%" --password "%APP_PASS%"
if errorlevel 1 (
  echo.
  echo Gagal. Pastikan Python terpasang, pip install -r requirements.txt, playwright install chromium
  echo dan DATABASE_URL production ada di .env
  pause
)
