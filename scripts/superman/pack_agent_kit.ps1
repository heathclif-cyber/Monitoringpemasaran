# Bangun folder minimal untuk device user (bukan full repo).
# Jalankan dari root repo:
#   powershell -ExecutionPolicy Bypass -File scripts\superman\pack_agent_kit.ps1
#
# Hasil: dist\superman-agent-kit\  → zip & bagikan ke PC lain

$ErrorActionPreference = "Stop"
$Root = Resolve-Path (Join-Path $PSScriptRoot "..\..")
$Out = Join-Path $Root "dist\superman-agent-kit"

Write-Host "Repo root: $Root"
Write-Host "Output:    $Out"

if (Test-Path $Out) {
  Remove-Item -Recurse -Force $Out
}
New-Item -ItemType Directory -Force -Path $Out | Out-Null

$files = @(
  "database.py",
  "models.py",
  "api\__init__.py",
  "api\r_laporan.py",
  "services\__init__.py",
  "services\auth.py",
  "services\ba_utils.py",
  "services\cache.py",
  "services\laporan_ho_export.py",
  "services\local_storage.py",
  "services\money_utils.py",
  "services\pembayaran_utils.py",
  "services\volume_utils.py",
  "services\superman\__init__.py",
  "services\superman\agent_registry.py",
  "services\superman\auth.py",
  "services\superman\captcha.py",
  "services\superman\captcha_challenge.py",
  "services\superman\config.py",
  "services\superman\documents.py",
  "services\superman\error_log.py",
  "services\superman\filler.py",
  "services\superman\komoditi_map.py",
  "services\superman\payload.py",
  "services\superman\persist.py",
  "services\superman\preflight.py",
  "services\superman\progress.py",
  "services\superman\runner.py",
  "services\superman\select2_helpers.py",
  "services\superman\sync_executor.py",
  "scripts\superman\commands\agent.py",
  "scripts\superman\commands\login.py",
  "scripts\superman\commands\deklarasi.py"
)

foreach ($rel in $files) {
  $src = Join-Path $Root $rel
  if (-not (Test-Path $src)) {
    Write-Warning "Skip missing: $rel"
    continue
  }
  $dst = Join-Path $Out $rel
  $dir = Split-Path $dst -Parent
  if (-not (Test-Path $dir)) {
    New-Item -ItemType Directory -Force -Path $dir | Out-Null
  }
  Copy-Item -Force $src $dst
  Write-Host "  + $rel"
}

# commands __init__ optional
$cmdInit = Join-Path $Out "scripts\superman\commands\__init__.py"
if (-not (Test-Path $cmdInit)) {
  New-Item -ItemType File -Path $cmdInit -Force | Out-Null
}

# Minimal requirements (agent only)
@'
# Superman agent kit — install di PC user
python-dotenv>=1.0.0
sqlalchemy>=2.0.0
psycopg[binary]>=3.0
httpx>=0.27.0
playwright>=1.49.0
ddddocr>=1.4.0
Pillow>=10.0.0
passlib[argon2]>=1.7.4
pyjwt>=2.8.0
pydantic>=2.0.0
fastapi>=0.100.0
openpyxl>=3.1.2
'@ | Set-Content -Encoding utf8 (Join-Path $Out "requirements.txt")

# .env template
@'
# Salin file ini jadi ".env" di folder kit yang sama (root kit).
# JANGAN commit / share password di chat publik.

# Postgres production Railway (sama dengan app web Monitoring)
DATABASE_URL=postgresql://USER:PASSWORD@HOST:PORT/railway

# Login app Monitoring — sekali di sini, Mulai-Agent.bat TIDAK minta lagi
# Harus sama dengan user login di browser web
MONITORING_USER=putrisalsabila6835
MONITORING_PASSWORD=

# Portal Superman (akun unit — biasanya SAMA di semua PC)
SUPERMAN_URL=https://superman.ptpn1.co.id/
SUPERMAN_USER=
SUPERMAN_PASSWORD=
SUPERMAN_HEADLESS=true
# Pakai Edge yang sudah ada di Windows (TIDAK unduh Chromium — lolos blokir keamanan IT)
SUPERMAN_BROWSER=msedge
'@ | Set-Content -Encoding utf8 (Join-Path $Out ".env.example")

# Bat launcher (root kit) — auto login dari .env
@'
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
'@ | Set-Content -Encoding ascii (Join-Path $Out "Mulai-Agent.bat")

# Install once bat — auto-install Python bila belum ada, lalu deps + chromium
@'
@echo off
setlocal EnableExtensions EnableDelayedExpansion
cd /d "%~dp0"
title Install Superman Agent (sekali)

echo.
echo ============================================
echo  Install Superman Agent (SEKALI per PC)
echo  Termasuk auto-install Python jika belum ada
echo ============================================
echo.

call :FIND_PYTHON
if defined PYEXE goto :HAVE_PYTHON

echo Python belum ada. Mencoba pasang otomatis...
echo.

REM --- Opsi 1: winget ---
where winget >nul 2>&1
if not errorlevel 1 (
  echo [A] winget install Python 3.12 ...
  winget install -e --id Python.Python.3.12 --accept-package-agreements --accept-source-agreements --disable-interactivity
  call :REFRESH_PATH
  call :FIND_PYTHON
  if defined PYEXE goto :HAVE_PYTHON
)

REM --- Opsi 2: unduh installer resmi python.org (silent) ---
echo [B] Unduh Python 3.12 dari python.org ...
set "PY_VER=3.12.8"
set "PY_URL=https://www.python.org/ftp/python/!PY_VER!/python-!PY_VER!-amd64.exe"
set "PY_SETUP=%TEMP%\python-!PY_VER!-amd64-superman-agent.exe"

powershell -NoProfile -ExecutionPolicy Bypass -Command ^
  "$ProgressPreference='SilentlyContinue'; " ^
  "try { Invoke-WebRequest -Uri '%PY_URL%' -OutFile '%PY_SETUP%' -UseBasicParsing } catch { exit 1 }"
if errorlevel 1 (
  echo [GAGAL] Tidak bisa unduh Python. Cek internet / firewall.
  echo Manual: https://www.python.org/downloads/  ^(centang Add to PATH^)
  pause
  exit /b 1
)
if not exist "%PY_SETUP%" (
  echo [GAGAL] File installer tidak ada: %PY_SETUP%
  pause
  exit /b 1
)

echo Installer silent: PrependPath=1 Include_pip=1 ...
"%PY_SETUP%" /quiet InstallAllUsers=0 PrependPath=1 Include_pip=1 Include_test=0 SimpleInstall=1
set "INST_ERR=!ERRORLEVEL!"
if not "!INST_ERR!"=="0" (
  echo [GAGAL] Installer Python kode !INST_ERR!
  echo Coba jalankan sebagai Administrator, atau install manual dari python.org
  pause
  exit /b 1
)

call :REFRESH_PATH
call :FIND_PYTHON
if not defined PYEXE (
  echo [GAGAL] Python terpasang tapi tidak ketemu di PATH.
  echo Tutup jendela ini, buka CMD baru, jalankan lagi 1-Install-Sekali.bat
  echo Atau restart PC lalu coba lagi.
  pause
  exit /b 1
)

:HAVE_PYTHON
echo.
echo Python siap: %PYEXE%
%PYEXE% --version
echo.

echo [1/2] pip install -r requirements.txt ...
%PYEXE% -m pip install --upgrade pip
if errorlevel 1 (
  echo [GAGAL] pip upgrade gagal.
  pause
  exit /b 1
)
%PYEXE% -m pip install -r requirements.txt
if errorlevel 1 (
  echo [GAGAL] pip install requirements gagal.
  pause
  exit /b 1
)

echo.
REM Baca SUPERMAN_BROWSER dari .env — msedge/chrome = skip unduh Chromium
set "SUPERMAN_BROWSER=msedge"
if exist ".env" (
  for /f "usebackq eol=# tokens=1,* delims==" %%A in (".env") do (
    if /i "%%A"=="SUPERMAN_BROWSER" set "SUPERMAN_BROWSER=%%B"
  )
)
if defined SUPERMAN_BROWSER set "SUPERMAN_BROWSER=%SUPERMAN_BROWSER: =%"
echo SUPERMAN_BROWSER=%SUPERMAN_BROWSER%

if /i "%SUPERMAN_BROWSER%"=="msedge" goto :SKIP_CHROMIUM
if /i "%SUPERMAN_BROWSER%"=="edge" goto :SKIP_CHROMIUM
if /i "%SUPERMAN_BROWSER%"=="chrome" goto :SKIP_CHROMIUM

echo [2/2] playwright install chromium ^(bisa diblokir keamanan IT^) ...
%PYEXE% -m playwright install chromium
if errorlevel 1 (
  echo.
  echo Unduh Chromium gagal/diblokir. Beralih ke Microsoft Edge ^(tanpa unduh^)...
  if exist ".env" (
    findstr /i /c:"SUPERMAN_BROWSER" ".env" >nul 2>&1
    if errorlevel 1 (
      echo SUPERMAN_BROWSER=msedge>> ".env"
    )
  )
  set "SUPERMAN_BROWSER=msedge"
  goto :SKIP_CHROMIUM
)
goto :AFTER_BROWSER

:SKIP_CHROMIUM
echo [2/2] Lewati unduh Chromium — pakai browser terpasang: %SUPERMAN_BROWSER%
echo       Pastikan Microsoft Edge ^(atau Chrome^) terpasang di PC.
:AFTER_BROWSER

echo.
echo ============================================
echo  INSTALL BERHASIL
echo ============================================
if not exist ".env" (
  if exist ".env.example" (
    copy /Y ".env.example" ".env" >nul
    echo File .env dibuat dari .env.example
  )
) else (
  echo File .env sudah ada.
)
echo.
echo Lanjut: double-click Mulai-Agent.bat
echo ^(biarkan terbuka, lalu di web Buat Deklarasi Superman^)
echo.
pause
endlocal
exit /b 0

:FIND_PYTHON
set "PYEXE="
REM py launcher
where py >nul 2>&1
if not errorlevel 1 (
  py -3 -c "import sys; raise SystemExit(0 if sys.version_info>=(3,10) else 1)" >nul 2>&1
  if not errorlevel 1 (
    set "PYEXE=py -3"
    goto :eof
  )
)
REM python di PATH ^(bukan stub Store^)
where python >nul 2>&1
if not errorlevel 1 (
  python -c "import sys; raise SystemExit(0 if sys.version_info>=(3,10) else 1)" >nul 2>&1
  if not errorlevel 1 (
    set "PYEXE=python"
    goto :eof
  )
)
REM lokasi umum user install
if exist "%LocalAppData%\Programs\Python\Python312\python.exe" (
  "%LocalAppData%\Programs\Python\Python312\python.exe" -c "import sys" >nul 2>&1
  if not errorlevel 1 (
    set "PYEXE=%LocalAppData%\Programs\Python\Python312\python.exe"
    goto :eof
  )
)
if exist "%LocalAppData%\Programs\Python\Python313\python.exe" (
  set "PYEXE=%LocalAppData%\Programs\Python\Python313\python.exe"
  goto :eof
)
if exist "%ProgramFiles%\Python312\python.exe" (
  set "PYEXE=%ProgramFiles%\Python312\python.exe"
  goto :eof
)
goto :eof

:REFRESH_PATH
REM PATH sesi ini + lokasi umum Python user
set "PATH=%LocalAppData%\Programs\Python\Python312;%LocalAppData%\Programs\Python\Python312\Scripts;%LocalAppData%\Programs\Python\Python313;%LocalAppData%\Programs\Python\Python313\Scripts;%ProgramFiles%\Python312;%ProgramFiles%\Python312\Scripts;%PATH%"
REM muat PATH machine+user terbaru dari registry
for /f "tokens=2*" %%A in ('reg query "HKLM\SYSTEM\CurrentControlSet\Control\Session Manager\Environment" /v Path 2^>nul') do set "SYS_PATH=%%B"
for /f "tokens=2*" %%A in ('reg query "HKCU\Environment" /v Path 2^>nul') do set "USR_PATH=%%B"
if defined SYS_PATH if defined USR_PATH set "PATH=%SYS_PATH%;%USR_PATH%;%PATH%"
goto :eof
'@ | Set-Content -Encoding ascii (Join-Path $Out "1-Install-Sekali.bat")

Copy-Item -Force (Join-Path $PSScriptRoot "KIT_README.md") (Join-Path $Out "README.md") -ErrorAction SilentlyContinue

Write-Host ""
Write-Host "OK. Kit ada di: $Out"
Write-Host "Zip folder itu dan bagikan ke PC user (bukan full repo)."
Write-Host "Atau: Compress-Archive -Path dist\superman-agent-kit -DestinationPath dist\superman-agent-kit.zip"
