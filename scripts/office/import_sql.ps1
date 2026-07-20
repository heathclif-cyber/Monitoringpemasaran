# Import file SQL ke container Postgres monpem-db (PowerShell-safe, tanpa redirect <).
# Usage:
#   powershell -ExecutionPolicy Bypass -File .\scripts\office\import_sql.ps1 -SqlFile .\backup_db.sql

param(
    [Parameter(Mandatory = $true)]
    [string] $SqlFile,

    [string] $PostgresUser = "ptpn",
    [string] $PostgresDb = "monitoringpemasaran"
)

$ErrorActionPreference = "Stop"
$Root = Split-Path -Parent (Split-Path -Parent (Split-Path -Parent $MyInvocation.MyCommand.Path))
Set-Location $Root

if (-not [System.IO.Path]::IsPathRooted($SqlFile)) {
    $SqlFile = Join-Path $Root $SqlFile
}
if (-not (Test-Path $SqlFile)) {
    throw "SQL file not found: $SqlFile"
}

$size = (Get-Item $SqlFile).Length
Write-Host "Importing $SqlFile ($size bytes) into db=$PostgresDb ..."

# Pipe raw SQL into psql inside container
Get-Content -Raw -Path $SqlFile | docker compose exec -T db psql -U $PostgresUser -d $PostgresDb
$code = $LASTEXITCODE
if ($code -ne 0) {
    throw "psql import failed with exit code $code"
}
Write-Host "Import finished OK."
