# Auto pull origin/main + rebuild jika ada update (Task Scheduler).
# Usage: powershell -ExecutionPolicy Bypass -File .\scripts\office\auto_deploy.ps1

$ErrorActionPreference = "Continue"
$Root = Split-Path -Parent (Split-Path -Parent (Split-Path -Parent $MyInvocation.MyCommand.Path))
Set-Location $Root

$logDir = Join-Path $Root "logs"
New-Item -ItemType Directory -Force -Path $logDir | Out-Null
$log = Join-Path $logDir "auto_deploy.log"

function Write-Log([string] $msg) {
    $line = "[{0}] {1}" -f (Get-Date -Format "yyyy-MM-dd HH:mm:ss"), $msg
    Add-Content -Path $log -Value $line
    Write-Host $line
}

Write-Log "auto_deploy check"

git fetch origin main 2>> $log
if ($LASTEXITCODE -ne 0) {
    Write-Log "git fetch failed"
    exit 1
}

$local = (git rev-parse HEAD).Trim()
$remote = (git rev-parse origin/main).Trim()

if ($local -eq $remote) {
    Write-Log "No update (HEAD=$local)"
    exit 0
}

Write-Log "Update found $local -> $remote ; deploying..."
git pull origin main 2>> $log
if ($LASTEXITCODE -ne 0) {
    Write-Log "git pull failed"
    exit 1
}

docker compose up -d --build 2>> $log
Write-Log "deploy finished exit=$LASTEXITCODE"
exit $LASTEXITCODE
