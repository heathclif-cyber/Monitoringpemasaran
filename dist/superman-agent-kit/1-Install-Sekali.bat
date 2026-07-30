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
REM Baca SUPERMAN_BROWSER dari .env ??? msedge/chrome = skip unduh Chromium
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
echo [2/2] Lewati unduh Chromium ??? pakai browser terpasang: %SUPERMAN_BROWSER%
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
