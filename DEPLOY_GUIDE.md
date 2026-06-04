# DEPLOY PLAYBOOK — Monitoring Pemasaran PTPN I

## Instruksi untuk Claude

Saat user mengatakan "eksekusi deploy guide" atau sejenisnya, lakukan ini:

1. Baca seluruh file ini terlebih dahulu
2. Tentukan **fase mana yang perlu dijalankan** (tanya user jika tidak jelas)
3. **Kumpulkan semua variabel** yang dibutuhkan fase tersebut (lihat bagian Variabel)
4. Eksekusi setiap step secara berurutan
5. Jalankan perintah VERIFY setelah setiap step — jika gagal, berhenti dan laporkan ke user
6. Laporkan ringkasan hasil di akhir

> **Working directory:** `D:\Apps-Dev\Monitoringpemasaran`
> **Shell:** PowerShell (jalankan sebagai Administrator untuk step yang butuh elevated privilege)

---

## Variabel

Kumpulkan variabel ini dari user sebelum mulai. Catat nilainya dan gunakan konsisten di semua perintah.

| Variabel | Keterangan | Contoh |
|----------|------------|--------|
| `{{GITHUB_URL}}` | URL clone repo GitHub | `https://github.com/heathclif-cyber/Monitoringpemasaran.git` |
| `{{DB_PASSWORD}}` | Password PostgreSQL lokal (min. 16 karakter) | `P@ssw0rd_Kantor_2024` |
| `{{DOMAIN}}` | Subdomain untuk akses internet | `monitoring.domainku.com` |
| `{{RAILWAY_DB_URL}}` | Direct URL dari Railway PostgreSQL | `postgresql://postgres:pass@host.railway.app:5432/railway` |
| `{{TUNNEL_ID}}` | Diisi otomatis saat Phase 3 berjalan | — |
| `{{WINDOWS_USERNAME}}` | Username Windows di komputer kantor | `ptpn-server` |

---

## Fase yang Tersedia

| Fase | Kapan dijalankan |
|------|-----------------|
| [Phase 1](#phase-1--prasyarat--clone) | Pertama kali setup di komputer baru |
| [Phase 2](#phase-2--migrasi-database) | Sekali saja — pindah data dari database lama ke lokal |
| [Phase 3](#phase-3--jalankan-aplikasi) | Setelah Phase 1 & 2, atau restart manual |
| [Phase 4](#phase-4--cloudflare-tunnel-akses-internet) | Sekali saja — setup akses internet |
| [Phase 5](#phase-5--auto-deploy-dari-github) | Sekali saja — setup Task Scheduler |
| [Phase 6](#phase-6--backup-database-otomatis) | Sekali saja — setup backup harian |
| [Phase 7](#phase-7--update-manual) | Kapan saja ingin update tanpa tunggu scheduler |

---

## Phase 1 — Prasyarat & Clone

**Butuh variabel:** tidak ada (URL sudah hardcoded)

### Step 1.1 — Verifikasi prasyarat

```powershell
docker --version
git --version
cloudflared --version
```

**VERIFY:** Ketiga perintah harus menghasilkan output versi. Jika salah satu gagal, instruksikan user untuk install:
- Docker Desktop: https://www.docker.com/products/docker-desktop/
- Git: https://git-scm.com/download/win
- cloudflared: https://github.com/cloudflare/cloudflared/releases/latest → `cloudflared-windows-amd64.msi`

Setelah install, ulangi Step 1.1.

### Step 1.2 — Verifikasi Docker Desktop berjalan

```powershell
docker info
```

**VERIFY:** Output harus menampilkan info server. Jika error "daemon is not running", minta user buka Docker Desktop dan tunggu hingga ikon whale di system tray muncul, lalu ulangi.

### Step 1.3 — Clone repository

```powershell
New-Item -ItemType Directory -Force -Path D:\Apps-Dev
cd D:\Apps-Dev
git clone https://github.com/heathclif-cyber/Monitoringpemasaran.git Monitoringpemasaran
cd Monitoringpemasaran
```

**VERIFY:**

```powershell
Test-Path D:\Apps-Dev\Monitoringpemasaran\docker-compose.yml
```

Output harus `True`.

### Step 1.4 — Buat file .env

```powershell
Set-Content D:\Apps-Dev\Monitoringpemasaran\.env "DB_PASSWORD={{DB_PASSWORD}}"
```

**VERIFY:**

```powershell
Get-Content D:\Apps-Dev\Monitoringpemasaran\.env
```

Output harus menampilkan baris `DB_PASSWORD=...`.

---

## Phase 2 — Migrasi Database

**Butuh variabel:** `{{RAILWAY_DB_URL}}`

**Catatan:** Jalankan Phase 3 (Step 3.1 saja) terlebih dahulu agar container database sudah berjalan.

### Step 2.1 — Cara mendapatkan Database URL

Instruksikan user:
1. Buka Railway Dashboard → pilih project
2. Klik **PostgreSQL** service
3. Di bagian **Connect**, copy **Connection URL**
4. Berikan URL-nya ke Claude

### Step 2.2 — Start database lokal saja

```powershell
cd D:\Apps-Dev\Monitoringpemasaran
docker compose up -d db
```

**VERIFY (tunggu 15 detik lalu cek):**

```powershell
Start-Sleep -Seconds 15
docker compose exec db pg_isready -U ptpn -d monitoringpemasaran
```

Output harus: `monitoringpemasaran:5432 - accepting connections`

### Step 2.3 — Export data dari database lama

```powershell
docker run --rm -v "D:\Apps-Dev\Monitoringpemasaran:/backup" postgres:16-alpine `
  pg_dump "{{RAILWAY_DB_URL}}" --no-owner --no-acl -n public `
  -f /backup/backup_db.sql
```

**VERIFY:**

```powershell
$size = (Get-Item D:\Apps-Dev\Monitoringpemasaran\backup_db.sql).Length
Write-Host "Ukuran file backup: $size bytes"
```

File harus ada dan ukurannya > 0 bytes.

### Step 2.4 — Import data ke PostgreSQL lokal

```powershell
docker compose -f D:\Apps-Dev\Monitoringpemasaran\docker-compose.yml exec -T db `
  psql -U ptpn -d monitoringpemasaran < D:\Apps-Dev\Monitoringpemasaran\backup_db.sql
```

**VERIFY:**

```powershell
docker compose -f D:\Apps-Dev\Monitoringpemasaran\docker-compose.yml exec db `
  psql -U ptpn -d monitoringpemasaran -c "SELECT COUNT(*) as jumlah_kontrak FROM kontrak;"
docker compose -f D:\Apps-Dev\Monitoringpemasaran\docker-compose.yml exec db `
  psql -U ptpn -d monitoringpemasaran -c "SELECT COUNT(*) as jumlah_invoice FROM invoice;"
```

Laporkan jumlah baris ke user — konfirmasi sesuai dengan data di database sumber.

---

## Phase 3 — Jalankan Aplikasi

**Butuh variabel:** tidak ada (sudah ada di .env)

### Step 3.1 — Build dan jalankan semua service

```powershell
cd D:\Apps-Dev\Monitoringpemasaran
docker compose up -d --build
```

Proses build pertama kali memakan waktu 5–10 menit. Informasikan ke user.

**VERIFY:**

```powershell
docker compose ps
```

Semua service harus berstatus `running`. Khusus `db` harus `running (healthy)`.

### Step 3.2 — Verifikasi aplikasi bisa diakses

```powershell
Start-Sleep -Seconds 5
Invoke-WebRequest -Uri "http://localhost/api/dashboard/stats" -UseBasicParsing | Select-Object StatusCode
```

**VERIFY:** StatusCode harus `200`.

Laporkan ke user: "Aplikasi berjalan di http://localhost"

---

## Phase 4 — Cloudflare Tunnel (Akses Internet)

**Butuh variabel:** `{{DOMAIN}}`, `{{WINDOWS_USERNAME}}`

**Jalankan sebagai Administrator.**

### Step 4.1 — Login ke Cloudflare

```powershell
cloudflared tunnel login
```

Browser akan terbuka. Instruksikan user untuk login dan pilih domain. Tunggu konfirmasi dari user bahwa browser sudah selesai.

### Step 4.2 — Buat tunnel

```powershell
cloudflared tunnel create monitoring-pemasaran
```

**VERIFY & CATAT TUNNEL ID:**

```powershell
$tunnelInfo = cloudflared tunnel list --output json | ConvertFrom-Json
$tunnel = $tunnelInfo | Where-Object { $_.name -eq "monitoring-pemasaran" }
Write-Host "TUNNEL ID: $($tunnel.id)"
```

Simpan nilai `TUNNEL_ID` ini sebagai `{{TUNNEL_ID}}` untuk digunakan di step berikutnya.

### Step 4.3 — Buat file konfigurasi tunnel

```powershell
$configContent = @"
tunnel: {{TUNNEL_ID}}
credentials-file: C:\Users\{{WINDOWS_USERNAME}}\.cloudflared\{{TUNNEL_ID}}.json

ingress:
  - hostname: {{DOMAIN}}
    service: http://localhost:80
  - service: http_status:404
"@

Set-Content "C:\Users\{{WINDOWS_USERNAME}}\.cloudflared\config.yml" $configContent -Encoding utf8
```

**VERIFY:**

```powershell
Get-Content "C:\Users\{{WINDOWS_USERNAME}}\.cloudflared\config.yml"
```

Output harus menampilkan konfigurasi yang benar dengan Tunnel ID yang valid.

### Step 4.4 — Daftarkan DNS

```powershell
cloudflared tunnel route dns monitoring-pemasaran {{DOMAIN}}
```

**VERIFY:**

```powershell
cloudflared tunnel info monitoring-pemasaran
```

### Step 4.5 — Install sebagai Windows Service

```powershell
cloudflared service install
Start-Service cloudflared
```

**VERIFY:**

```powershell
Get-Service cloudflared | Select-Object Name, Status, StartType
```

Status harus `Running`, StartType harus `Automatic`.

### Step 4.6 — Test akses dari internet

Tunggu 30 detik untuk DNS propagasi, lalu:

```powershell
Start-Sleep -Seconds 30
Invoke-WebRequest -Uri "https://{{DOMAIN}}/api/dashboard/stats" -UseBasicParsing | Select-Object StatusCode
```

**VERIFY:** StatusCode harus `200`.

Laporkan ke user: "Aplikasi dapat diakses di https://{{DOMAIN}}"

---

## Phase 5 — Auto Deploy dari GitHub

**Butuh variabel:** tidak ada

### Step 5.1 — Setup Git credential store

```powershell
cd D:\Apps-Dev\Monitoringpemasaran
git config --global credential.helper wincred
git fetch origin main
```

Jika muncul prompt username/password, instruksikan user untuk memasukkan credentials GitHub-nya (akan tersimpan otomatis).

**VERIFY:**

```powershell
git fetch origin main
echo "Git fetch sukses — tidak ada prompt password"
```

### Step 5.2 — Buat script deploy

```powershell
$deployScript = @'
Set-Location D:\Apps-Dev\Monitoringpemasaran

git fetch origin main
$LOCAL  = git rev-parse HEAD
$REMOTE = git rev-parse origin/main

if ($LOCAL -ne $REMOTE) {
    $timestamp = Get-Date -Format "yyyy-MM-dd HH:mm:ss"
    Write-Host "[$timestamp] Update ditemukan, deploying..."
    git pull origin main
    docker compose up -d --build
    Write-Host "[$timestamp] Deploy selesai."
} else {
    Write-Host "[$( Get-Date -Format 'HH:mm:ss' )] Tidak ada update."
}
'@

Set-Content "D:\Apps-Dev\Monitoringpemasaran\deploy.ps1" $deployScript -Encoding utf8
```

**VERIFY:**

```powershell
Test-Path D:\Apps-Dev\Monitoringpemasaran\deploy.ps1
```

Output harus `True`.

### Step 5.3 — Daftarkan ke Task Scheduler

```powershell
$action = New-ScheduledTaskAction `
    -Execute "powershell.exe" `
    -Argument "-NonInteractive -ExecutionPolicy Bypass -File D:\Apps-Dev\Monitoringpemasaran\deploy.ps1"

$trigger = New-ScheduledTaskTrigger `
    -RepetitionInterval (New-TimeSpan -Minutes 5) `
    -Once -At (Get-Date)

$settings = New-ScheduledTaskSettingsSet `
    -ExecutionTimeLimit (New-TimeSpan -Minutes 10) `
    -StartWhenAvailable

Register-ScheduledTask `
    -TaskName "MonitoringPemasaran-AutoDeploy" `
    -Action $action -Trigger $trigger -Settings $settings `
    -RunLevel Highest -Force
```

**VERIFY:**

```powershell
Get-ScheduledTask -TaskName "MonitoringPemasaran-AutoDeploy" | Select-Object TaskName, State
```

State harus `Ready`.

### Step 5.4 — Test jalankan sekali

```powershell
Start-ScheduledTask -TaskName "MonitoringPemasaran-AutoDeploy"
Start-Sleep -Seconds 10
Get-ScheduledTask -TaskName "MonitoringPemasaran-AutoDeploy" | Select-Object LastRunTime, LastTaskResult
```

**VERIFY:** `LastTaskResult` harus `0` (sukses).

---

## Phase 6 — Backup Database Otomatis

**Butuh variabel:** tidak ada

### Step 6.1 — Buat folder backup

```powershell
New-Item -ItemType Directory -Force -Path D:\Backup\MonitoringPemasaran
```

### Step 6.2 — Buat script backup

```powershell
$backupScript = @'
$date   = Get-Date -Format "yyyyMMdd_HHmm"
$output = "D:\Backup\MonitoringPemasaran\backup_$date.sql"

Set-Location D:\Apps-Dev\Monitoringpemasaran
docker compose exec -T db pg_dump -U ptpn monitoringpemasaran | Out-File $output -Encoding utf8

Write-Host "Backup selesai: $output ($('{0:N0}' -f (Get-Item $output).Length) bytes)"

# Hapus backup lebih dari 30 hari
Get-ChildItem "D:\Backup\MonitoringPemasaran\*.sql" |
    Where-Object { $_.LastWriteTime -lt (Get-Date).AddDays(-30) } |
    Remove-Item -Force
'@

Set-Content "D:\Apps-Dev\Monitoringpemasaran\backup_db.ps1" $backupScript -Encoding utf8
```

### Step 6.3 — Jadwalkan backup harian jam 02:00

```powershell
$action = New-ScheduledTaskAction `
    -Execute "powershell.exe" `
    -Argument "-NonInteractive -ExecutionPolicy Bypass -File D:\Apps-Dev\Monitoringpemasaran\backup_db.ps1"

$trigger = New-ScheduledTaskTrigger -Daily -At "02:00"

Register-ScheduledTask `
    -TaskName "MonitoringPemasaran-BackupDB" `
    -Action $action -Trigger $trigger `
    -RunLevel Highest -Force
```

### Step 6.4 — Test backup sekali

```powershell
Start-ScheduledTask -TaskName "MonitoringPemasaran-BackupDB"
Start-Sleep -Seconds 15
Get-ChildItem D:\Backup\MonitoringPemasaran\ | Sort-Object LastWriteTime -Descending | Select-Object -First 3
```

**VERIFY:** Harus ada file backup terbaru dengan ukuran > 0.

---

## Phase 7 — Update Manual

**Kapan digunakan:** Ingin update segera tanpa tunggu 5 menit.

```powershell
cd D:\Apps-Dev\Monitoringpemasaran
git pull origin main
docker compose up -d --build
```

**VERIFY:**

```powershell
docker compose ps
Invoke-WebRequest -Uri "http://localhost/api/dashboard/stats" -UseBasicParsing | Select-Object StatusCode
```

---

## Perintah Diagnostik (jalankan kapan saja)

Claude boleh menjalankan perintah-perintah ini kapan saja untuk mengecek kondisi sistem:

```powershell
# Status semua container
docker compose -f D:\Apps-Dev\Monitoringpemasaran\docker-compose.yml ps

# Log terbaru backend
docker compose -f D:\Apps-Dev\Monitoringpemasaran\docker-compose.yml logs --tail=30 app

# Status Cloudflare Tunnel
Get-Service cloudflared | Select-Object Name, Status

# Status Task Scheduler
Get-ScheduledTask | Where-Object { $_.TaskName -like "MonitoringPemasaran*" } | Select-Object TaskName, State, @{n='LastRun';e={$_.LastRunTime}}

# Disk backup
Get-ChildItem D:\Backup\MonitoringPemasaran\ | Measure-Object -Property Length -Sum | Select-Object Count, @{n='TotalMB';e={[math]::Round($_.Sum/1MB,1)}}

# Verifikasi app dari internet
Invoke-WebRequest -Uri "https://{{DOMAIN}}/api/dashboard/stats" -UseBasicParsing | Select-Object StatusCode
```
