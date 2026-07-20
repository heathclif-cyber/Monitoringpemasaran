# Pastikan stack Docker Monitoring Pemasaran hidup (dipakai Task Scheduler at startup).
# Usage: powershell -ExecutionPolicy Bypass -File .\scripts\office\ensure_up.ps1

$ErrorActionPreference = "Stop"
$Root = Split-Path -Parent (Split-Path -Parent (Split-Path -Parent $MyInvocation.MyCommand.Path))
Set-Location $Root

$logDir = Join-Path $Root "logs"
New-Item -ItemType Directory -Force -Path $logDir | Out-Null
$log = Join-Path $logDir "ensure_up.log"

function Write-Log([string] $msg) {
    $line = "[{0}] {1}" -f (Get-Date -Format "yyyy-MM-dd HH:mm:ss"), $msg
    Add-Content -Path $log -Value $line
    Write-Host $line
}

Write-Log "ensure_up start in $Root"

# Tunggu Docker daemon siap (setelah boot)
$dockerOk = $false
foreach ($i in 1..60) {
    try {
        docker info 2>$null | Out-Null
        if ($LASTEXITCODE -eq 0) { $dockerOk = $true; break }
    } catch { }
    Write-Log "Waiting for Docker daemon... ($i)"
    Start-Sleep -Seconds 5
}
if (-not $dockerOk) {
    Write-Log "ERROR: Docker daemon not ready"
    exit 1
}

docker compose up -d
Write-Log "docker compose up -d exit=$LASTEXITCODE"

Start-Sleep -Seconds 5
try {
    $health = & curl.exe -sS -m 15 "http://127.0.0.1:8000/health" 2>$null
    Write-Log "health: $health"
} catch {
    Write-Log "health check failed: $_"
}

Write-Log "ensure_up done"
exit 0
