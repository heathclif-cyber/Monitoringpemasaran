# Build React SPA ke frontend/dist (disajikan FastAPI di port 8000).
$ErrorActionPreference = "Stop"
$Root = Split-Path -Parent (Split-Path -Parent $MyInvocation.MyCommand.Path)
Set-Location (Join-Path $Root "frontend")
if (-not (Test-Path "node_modules")) {
    npm ci
}
npm run build
Write-Host "OK: frontend/dist siap." -ForegroundColor Green
