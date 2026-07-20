# Backup harian PostgreSQL dari container monpem-db.
# Usage: powershell -ExecutionPolicy Bypass -File .\scripts\office\backup_db.ps1

param(
    [string] $BackupDir = "D:\Backup\MonitoringPemasaran",
    [string] $PostgresUser = "ptpn",
    [string] $PostgresDb = "monitoringpemasaran",
    [int] $RetainDays = 30
)

$ErrorActionPreference = "Stop"
$Root = Split-Path -Parent (Split-Path -Parent (Split-Path -Parent $MyInvocation.MyCommand.Path))
Set-Location $Root

New-Item -ItemType Directory -Force -Path $BackupDir | Out-Null
$date = Get-Date -Format "yyyyMMdd_HHmm"
$out = Join-Path $BackupDir "backup_$date.sql"

Write-Host "Dumping $PostgresDb -> $out"
docker compose exec -T db pg_dump -U $PostgresUser $PostgresDb | Out-File -FilePath $out -Encoding utf8

if (-not (Test-Path $out) -or (Get-Item $out).Length -lt 50) {
    throw "Backup failed or too small: $out"
}

Write-Host ("Backup OK: {0} ({1:N0} bytes)" -f $out, (Get-Item $out).Length)

Get-ChildItem (Join-Path $BackupDir "backup_*.sql") |
    Where-Object { $_.LastWriteTime -lt (Get-Date).AddDays(-$RetainDays) } |
    ForEach-Object {
        Write-Host "Removing old backup $($_.Name)"
        Remove-Item $_.FullName -Force
    }
