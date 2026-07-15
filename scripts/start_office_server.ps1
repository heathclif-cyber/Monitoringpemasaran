# Start Monitoring Pemasaran di PC kantor — GRATIS, akses via IP LAN.
# URL: http://<IP-PC>:8000
#
# Prasyarat:
#   - Python 3.12 + pip install -r requirements.txt
#   - playwright install chromium
#   - DATABASE_URL di .env mengarah ke Postgres lokal (bukan Railway)
#   - frontend/dist sudah di-build (npm run build di folder frontend)
#
# Autostart: Task Scheduler → run this script at logon.

$ErrorActionPreference = "Stop"
$Root = Split-Path -Parent (Split-Path -Parent $MyInvocation.MyCommand.Path)
Set-Location $Root

# Load .env into process env (simple KEY=VALUE)
$envFile = Join-Path $Root ".env"
if (Test-Path $envFile) {
    Get-Content $envFile | ForEach-Object {
        $line = $_.Trim()
        if (-not $line -or $line.StartsWith("#")) { return }
        $i = $line.IndexOf("=")
        if ($i -lt 1) { return }
        $k = $line.Substring(0, $i).Trim()
        $v = $line.Substring($i + 1).Trim().Trim('"').Trim("'")
        [Environment]::SetEnvironmentVariable($k, $v, "Process")
    }
}

if (-not $env:DATABASE_URL) {
    Write-Error "DATABASE_URL kosong. Isi .env dengan Postgres lokal."
}

$env:RUN_DB_MIGRATE = if ($env:RUN_DB_MIGRATE) { $env:RUN_DB_MIGRATE } else { "true" }
$env:SUPERMAN_DEFAULT_EXECUTOR = if ($env:SUPERMAN_DEFAULT_EXECUTOR) { $env:SUPERMAN_DEFAULT_EXECUTOR } else { "server" }

# Bind all interfaces → device lain di Wi-Fi/LAN bisa akses
$HostBind = if ($env:OFFICE_BIND_HOST) { $env:OFFICE_BIND_HOST } else { "0.0.0.0" }
$Port = if ($env:PORT) { $env:PORT } else { "8000" }

$ips = Get-NetIPAddress -AddressFamily IPv4 |
    Where-Object { $_.IPAddress -notlike "127.*" -and $_.PrefixOrigin -ne "WellKnown" } |
    Select-Object -ExpandProperty IPAddress

Write-Host "========================================" -ForegroundColor Cyan
Write-Host " Monitoring Pemasaran — mode kantor" -ForegroundColor Cyan
Write-Host " Bind: http://${HostBind}:$Port" -ForegroundColor Cyan
foreach ($ip in $ips) {
    Write-Host " Akses LAN: http://${ip}:$Port" -ForegroundColor Green
}
Write-Host " (Tanpa domain, tanpa Railway, gratis)" -ForegroundColor DarkGray
Write-Host "========================================" -ForegroundColor Cyan

# Firewall rule (abaikan jika sudah ada / butuh admin)
try {
    $rule = Get-NetFirewallRule -DisplayName "Monitoring Pemasaran 8000" -ErrorAction SilentlyContinue
    if (-not $rule) {
        New-NetFirewallRule -DisplayName "Monitoring Pemasaran 8000" `
            -Direction Inbound -Protocol TCP -LocalPort $Port -Action Allow `
            -ErrorAction SilentlyContinue | Out-Null
        Write-Host "Firewall: rule port $Port ditambahkan (jika admin)." -ForegroundColor DarkGray
    }
} catch { }

python -m uvicorn main:app --host $HostBind --port $Port --proxy-headers
