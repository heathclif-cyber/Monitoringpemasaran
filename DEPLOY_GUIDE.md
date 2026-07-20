# DEPLOY PLAYBOOK — PC Kantor Windows + Internet (Cloudflare Tunnel)

> **Target arsitektur (disetujui user 2026-07):**  
> PC Windows kantor **nyala 24 jam** → Docker (app + Postgres) → akses LAN + **internet luar** via Cloudflare Tunnel.  
> Lepas Railway setelah cutover sukses.

| Item | Nilai baku |
|------|------------|
| Working directory | `D:\Apps-Dev\Monitoringpemasaran` |
| Shell | **PowerShell** (Admin untuk firewall, tunnel service, Task Scheduler, power plan) |
| App URL lokal | `http://localhost:8000` |
| App URL LAN | `http://<IP-PC>:8000` |
| App URL internet | `https://{{DOMAIN}}` |
| Compose stack | `docker-compose.yml` (service `app` + `db`) |
| Port app container | **8000** (bukan 80) |
| Health publik (tanpa auth) | `GET /health` → `{"status":"ok"}` |
| Helper scripts | `scripts/office/*.ps1` |

---

## Instruksi untuk AI Agent (VS Code / Claude / Cursor)

Saat user bilang **"eksekusi deploy guide"**, **"setup PC kantor"**, **"deploy office"**, atau sejenis:

1. Baca **file ini seluruhnya** dulu (satu-satunya playbook deploy PC kantor).
2. Tentukan fase: default **Phase 0 → 7 berurutan** jika setup baru; tanya user jika hanya sebagian.
3. Kumpulkan **semua variabel** (bagian [Variabel](#variabel)) **sebelum** eksekusi. Jangan tebak secret.
4. Eksekusi step **berurutan**. Setelah tiap step: jalankan **VERIFY**. Gagal → **STOP**, laporkan error + step, minta user.
5. **Jangan** ubah 2 app lain (Contabo/trading). Scope hanya repo + PC ini.
6. **Jangan** matikan/hapus Railway sampai Phase 7 cutover sukses + user setuju.
7. **Jangan** commit/push secret (`.env`, password, token Cloudflare).
8. **Jangan** expose Postgres `5432` ke internet (compose sudah bind `127.0.0.1` — pertahankan).
9. PowerShell: pakai `curl.exe` jika perlu HTTP; `curl` alias = `Invoke-WebRequest` (beda parameter).
10. Akhir sesi: ringkasan tabel (apa yang jalan, URL, fase selesai, sisa manual user).

### Mode eksekusi

| Mode user | Perilaku agent |
|-----------|----------------|
| `setup penuh` / `eksekusi semua fase` | Phase 0→7 |
| `hanya lokal dulu` | Phase 0–3 (+ 5 power/firewall) |
| `pasang tunnel` | Phase 4 (app harus sudah sehat di :8000) |
| `migrasi DB` | Phase 2 |
| `update app` | Phase 8 |
| `diagnostik` | [Perintah diagnostik](#perintah-diagnostik) |

---

## Arsitektur target

```text
[Browser di mana saja: kantor / rumah / HP]
              │
              │  HTTPS
              ▼
     Cloudflare Edge (gratis)
              │
              │  Tunnel (outbound dari PC — tidak buka port router)
              ▼
     cloudflared (Windows Service, Automatic)
              │
              ▼
     http://127.0.0.1:8000
              │
     ┌────────┴────────┐
     │  Docker Desktop │
     │  monpem-app     │  FastAPI + React dist + Playwright
     │  monpem-db      │  PostgreSQL 16 (hanya localhost:5432)
     └─────────────────┘
     PC Windows kantor 24 jam
```

**Akses paralel:**
- LAN kantor: `http://192.168.x.x:8000` (firewall port 8000)
- Internet: `https://{{DOMAIN}}` (tunnel)

---

## Variabel

Kumpulkan dari user **sebelum** mulai. Simpan di catatan sesi agent (jangan tulis secret ke file yang di-commit).

| Placeholder | Wajib? | Keterangan | Contoh |
|-------------|--------|------------|--------|
| `{{GITHUB_URL}}` | Ya | Repo clone | `https://github.com/heathclif-cyber/Monitoringpemasaran.git` |
| `{{REPO_DIR}}` | Ya | Path lokal | `D:\Apps-Dev\Monitoringpemasaran` |
| `{{POSTGRES_PASSWORD}}` | Ya | Password DB lokal, **min 16 karakter alfanumerik** (hindari `@ # : / %` agar URL DB aman) | `PtpnKantorDb2026Secure` |
| `{{SECRET_KEY}}` | Ya | Secret JWT/session app, min 32 karakter acak | (generate) |
| `{{RAILWAY_DB_URL}}` | Phase 2 | Direct URL Postgres Railway (bukan proxy pooler jika gagal SSL) | `postgresql://postgres:…@….railway.app:5432/railway` |
| `{{DOMAIN}}` | Phase 4A | Hostname publik, zone harus di Cloudflare | `monitoring.perusahaan.com` |
| `{{WINDOWS_USERNAME}}` | Phase 4 | Username Windows login PC server | `ptpn-server` |
| `{{SUPERMAN_USER}}` | Disarankan | Akun Superman | — |
| `{{SUPERMAN_PASSWORD}}` | Disarankan | Password Superman | — |
| `{{TUNNEL_NAME}}` | Phase 4 | Default tetap | `monitoring-pemasaran` |
| `{{TUNNEL_ID}}` | Otomatis | Diisi agent setelah `tunnel create` | UUID |

### Generate SECRET_KEY (jika user tidak punya)

```powershell
-join ((48..57 + 65..90 + 97..122 | Get-Random -Count 48 | ForEach-Object { [char]$_ }))
```

### Prasyarat akun (user siapkan di luar terminal)

| Akun | Untuk |
|------|--------|
| GitHub | Clone / pull (public OK tanpa token; private butuh auth) |
| Railway | Copy `DATABASE_URL` / Connection URL (Phase 2) |
| Cloudflare | Login browser + **domain** di account (Phase 4A permanen) |
| Login app Monitoring | User/password existing setelah data di-restore |

**Domain:** untuk tunnel **permanen 24/7** butuh domain di Cloudflare (gratis plan OK).  
Tanpa domain: pakai **Phase 4B quick tunnel** (URL berubah tiap restart — hanya uji sementara).

---

## Fase

| Fase | Nama | Kapan |
|------|------|--------|
| [0](#phase-0--siapkan-pc-24-jam) | Siapkan PC 24 jam | Pertama kali |
| [1](#phase-1--prasyarat-software--clone) | Prasyarat + clone | Pertama kali |
| [2](#phase-2--env--database-lokal--migrasi-dari-railway) | Env + DB + migrasi Railway | Sekali (atau ulang restore) |
| [3](#phase-3--build--jalankan-aplikasi) | Build & jalankan app | Setelah 1–2 |
| [4](#phase-4--cloudflare-tunnel-akses-internet) | Tunnel internet | Setelah 3 sehat |
| [5](#phase-5--firewall-lan--autostart-docker) | Firewall + autostart | Setelah 3 |
| [6](#phase-6--auto-update-dari-github-opsional) | Auto-pull GitHub | Opsional |
| [7](#phase-7--backup-db-harian--cutover-railway) | Backup + cutover Railway | Setelah 3–4 stabil |
| [8](#phase-8--update-manual) | Update manual | Kapan saja |

**Urutan disarankan setup baru:** 0 → 1 → 2 → 3 → 5 → 4 → 7 → (6 opsional).

---

## Phase 0 — Siapkan PC 24 jam

**Tujuan:** PC tidak sleep; Docker bisa jalan terus.

### Step 0.1 — Power plan (Administrator)

```powershell
powercfg /change standby-timeout-ac 0
powercfg /change hibernate-timeout-ac 0
powercfg /change monitor-timeout-ac 30
powercfg /change disk-timeout-ac 0
powercfg /hibernate off
```

**VERIFY:**

```powershell
powercfg /query SCHEME_CURRENT SUB_SLEEP
```

Timeout sleep/hibernate AC harus **0** (never) atau setara “Never”.

### Step 0.2 — Informasikan user (manual UI)

Minta user cek sekali:
- **Settings → System → Power** → Sleep = **Never** (plugged in)
- PC terhubung listrik stabil (UPS disarankan, bukan wajib di guide)
- Docker Desktop: Settings → **Start Docker Desktop when you sign in** = ON  
  Settings → **General** → resource RAM ≥ **4 GB** ke Docker (6–8 GB lebih aman jika Superman Playwright aktif)

### Step 0.3 — Catat IP LAN

```powershell
Get-NetIPAddress -AddressFamily IPv4 |
  Where-Object { $_.IPAddress -notlike '127.*' -and $_.PrefixOrigin -ne 'WellKnown' } |
  Select-Object IPAddress, InterfaceAlias
```

Catat IP ke ringkasan (untuk akses LAN rekan kantor). Sarankan IP **statis/DHCP reservation** di router agar tidak berubah.

---

## Phase 1 — Prasyarat software & clone

### Step 1.1 — Cek tool

```powershell
docker --version
git --version
cloudflared --version
```

**VERIFY:** Ketiga perintah cetak versi.

Jika gagal, agent **instruksikan user install** (jangan anggap terpasang):

| Tool | Install |
|------|---------|
| Docker Desktop | https://www.docker.com/products/docker-desktop/ — restart PC setelah install |
| Git | `winget install Git.Git` atau https://git-scm.com/download/win |
| cloudflared | `winget install Cloudflare.cloudflared` **atau** MSI: https://github.com/cloudflare/cloudflared/releases/latest → `cloudflared-windows-amd64.msi` |

Ulangi Step 1.1 sampai lulus.

### Step 1.2 — Docker daemon hidup

```powershell
docker info
```

**VERIFY:** Ada info server, bukan error “daemon is not running”.  
Jika gagal: minta user buka **Docker Desktop**, tunggu ikon whale siap, ulang.

### Step 1.3 — Clone atau update repo

```powershell
$RepoDir = "D:\Apps-Dev\Monitoringpemasaran"
$GitUrl  = "https://github.com/heathclif-cyber/Monitoringpemasaran.git"

New-Item -ItemType Directory -Force -Path "D:\Apps-Dev" | Out-Null

if (Test-Path (Join-Path $RepoDir "docker-compose.yml")) {
  Set-Location $RepoDir
  git fetch origin
  git pull origin main
} else {
  git clone $GitUrl $RepoDir
  Set-Location $RepoDir
}
```

**VERIFY:**

```powershell
Test-Path "D:\Apps-Dev\Monitoringpemasaran\docker-compose.yml"
Test-Path "D:\Apps-Dev\Monitoringpemasaran\scripts\office\setup_env.ps1"
```

Keduanya `True`.

---

## Phase 2 — Env, database lokal, migrasi dari Railway

### Step 2.1 — Buat `.env` dari template

Jalankan helper (ganti nilai sebelum/ setelah generate):

```powershell
cd D:\Apps-Dev\Monitoringpemasaran
powershell -ExecutionPolicy Bypass -File .\scripts\office\setup_env.ps1 `
  -PostgresPassword "{{POSTGRES_PASSWORD}}" `
  -SecretKey "{{SECRET_KEY}}" `
  -SupermanUser "{{SUPERMAN_USER}}" `
  -SupermanPassword "{{SUPERMAN_PASSWORD}}"
```

Atau manual: salin `.env.office.example` → `.env` lalu isi:

```env
POSTGRES_USER=ptpn
POSTGRES_PASSWORD={{POSTGRES_PASSWORD}}
POSTGRES_DB=monitoringpemasaran
SECRET_KEY={{SECRET_KEY}}
RUN_DB_MIGRATE=true
SUPERMAN_URL=https://superman.ptpn1.co.id/
SUPERMAN_USER={{SUPERMAN_USER}}
SUPERMAN_PASSWORD={{SUPERMAN_PASSWORD}}
SUPERMAN_HEADLESS=true
SUPERMAN_DEFAULT_EXECUTOR=server
```

**VERIFY:**

```powershell
# Jangan cetak password penuh ke log chat jika bisa dihindari — cek key saja
Select-String -Path "D:\Apps-Dev\Monitoringpemasaran\.env" -Pattern '^(POSTGRES_|SECRET_KEY|SUPERMAN_|RUN_)' |
  ForEach-Object { ($_.Line -split '=',2)[0] }
```

Harus ada minimal: `POSTGRES_USER`, `POSTGRES_PASSWORD`, `POSTGRES_DB`, `SECRET_KEY`.  
File `.env` **tidak** boleh di-commit (ada di `.gitignore`).

### Step 2.2 — Start Postgres saja

```powershell
cd D:\Apps-Dev\Monitoringpemasaran
docker compose up -d db
```

**VERIFY (tunggu healthy):**

```powershell
$ok = $false
foreach ($i in 1..24) {
  Start-Sleep -Seconds 5
  $r = docker compose exec -T db pg_isready -U ptpn -d monitoringpemasaran 2>&1
  Write-Host "[$i] $r"
  if ("$r" -match "accepting connections") { $ok = $true; break }
}
if (-not $ok) { throw "Postgres belum ready" }
```

### Step 2.3 — Dapatkan `{{RAILWAY_DB_URL}}`

Instruksikan user:
1. Railway Dashboard → project Monitoring Pemasaran  
2. Service **PostgreSQL** → **Connect** / Variables  
3. Copy **Database URL** / `DATABASE_URL` (format `postgresql://…`)  
4. Berikan ke agent (sekali pakai; jangan commit)

Jika user **tidak migrasi data** (install bersih): **lewati Step 2.4–2.5**, lanjut Phase 3 (schema dibuat `RUN_DB_MIGRATE`).

### Step 2.4 — Export dari Railway

```powershell
cd D:\Apps-Dev\Monitoringpemasaran
$RailwayUrl = "{{RAILWAY_DB_URL}}"

docker run --rm `
  -v "D:\Apps-Dev\Monitoringpemasaran:/backup" `
  postgres:16-alpine `
  pg_dump "$RailwayUrl" --no-owner --no-acl -n public -f /backup/backup_db.sql
```

**VERIFY:**

```powershell
$f = Get-Item "D:\Apps-Dev\Monitoringpemasaran\backup_db.sql"
Write-Host "Backup size: $($f.Length) bytes"
if ($f.Length -lt 100) { throw "backup_db.sql terlalu kecil / gagal" }
```

`backup_db.sql` juga **jangan di-commit** (data sensitif). Opsional: pastikan ada di ignore lokal.

### Step 2.5 — Import ke Postgres lokal

PowerShell tidak selalu menangani `<` redirect ke `docker` — pakai helper:

```powershell
cd D:\Apps-Dev\Monitoringpemasaran
powershell -ExecutionPolicy Bypass -File .\scripts\office\import_sql.ps1 -SqlFile ".\backup_db.sql"
```

Atau setara:

```powershell
cd D:\Apps-Dev\Monitoringpemasaran
Get-Content -Raw ".\backup_db.sql" | docker compose exec -T db psql -U ptpn -d monitoringpemasaran
```

**VERIFY:**

```powershell
docker compose exec -T db psql -U ptpn -d monitoringpemasaran -c "SELECT COUNT(*) AS kontrak FROM kontrak;"
docker compose exec -T db psql -U ptpn -d monitoringpemasaran -c "SELECT COUNT(*) AS invoice FROM invoice;"
docker compose exec -T db psql -U ptpn -d monitoringpemasaran -c "SELECT COUNT(*) AS do_count FROM delivery_order;"
```

Laporkan angka ke user; bandingkan ekspektasi Railway. Jika tabel belum ada di dump kosong, cek error import.

---

## Phase 3 — Build & jalankan aplikasi

### Step 3.1 — Build + up

```powershell
cd D:\Apps-Dev\Monitoringpemasaran
docker compose up -d --build
```

Build pertama **5–15 menit** (Node frontend + Playwright browser di image). Beri tahu user agar menunggu.

**VERIFY:**

```powershell
docker compose ps
```

- `monpem-db`: `running` / **healthy**  
- `monpem-app`: `running`

### Step 3.2 — Health check lokal

```powershell
Start-Sleep -Seconds 8
curl.exe -sS -m 15 "http://127.0.0.1:8000/health"
curl.exe -sS -m 15 -o NUL -w "root_http=%{http_code}`n" "http://127.0.0.1:8000/"
```

**VERIFY:**
- Body health mengandung `"status"` dan `"ok"`
- Root HTTP `200`

### Step 3.3 — Health dari IP LAN (opsional di PC server)

```powershell
$ip = (Get-NetIPAddress -AddressFamily IPv4 |
  Where-Object { $_.IPAddress -notlike '127.*' -and $_.PrefixOrigin -ne 'WellKnown' } |
  Select-Object -First 1 -ExpandProperty IPAddress)
curl.exe -sS -m 15 "http://${ip}:8000/health"
```

**VERIFY:** Sama `"ok"`. Jika gagal dari IP lain di LAN setelah firewall (Phase 5), cek rule.

Laporkan ke user:
- Lokal: `http://localhost:8000`
- LAN: `http://<IP>:8000`

---

## Phase 4 — Cloudflare Tunnel (akses internet)

**Prasyarat:** Phase 3 lulus (`/health` di `:8000`).  
**Jalankan cloudflared login / service install sebagai user yang akan menjalankan service** (biasanya Administrator untuk `service install`).

Pilih jalur:

| Jalur | Kapan | URL |
|-------|--------|-----|
| **4A Named tunnel + domain** | Production 24/7 | `https://{{DOMAIN}}` stabil |
| **4B Quick tunnel** | Uji tanpa domain | `https://….trycloudflare.com` berubah tiap start |

### Phase 4A — Named tunnel (direkomendasikan)

#### Step 4A.1 — Login Cloudflare

```powershell
cloudflared tunnel login
```

Browser terbuka → user login Cloudflare → pilih **domain/zone** yang dipakai.  
Agent **tunggu konfirmasi user** bahwa login selesai.

**VERIFY:**

```powershell
Test-Path "$env:USERPROFILE\.cloudflared\cert.pem"
```

Harus `True`.

#### Step 4A.2 — Buat tunnel (skip jika sudah ada)

```powershell
$TunnelName = "monitoring-pemasaran"
$existing = cloudflared tunnel list 2>$null | Select-String $TunnelName
if (-not $existing) {
  cloudflared tunnel create $TunnelName
}
cloudflared tunnel list
```

**VERIFY & catat TUNNEL_ID:**

```powershell
# Parse ID dari list (format tabel cloudflared)
cloudflared tunnel list
```

Agent salin UUID tunnel `monitoring-pemasaran` sebagai `{{TUNNEL_ID}}`.  
File credentials biasanya:  
`C:\Users\{{WINDOWS_USERNAME}}\.cloudflared\{{TUNNEL_ID}}.json`

**VERIFY credentials:**

```powershell
Test-Path "$env:USERPROFILE\.cloudflared\{{TUNNEL_ID}}.json"
```

#### Step 4A.3 — Tulis config.yml

**Penting:** service backend = `http://127.0.0.1:8000` (bukan port 80).

```powershell
$TunnelId = "{{TUNNEL_ID}}"
$Domain   = "{{DOMAIN}}"
$Cred     = Join-Path $env:USERPROFILE ".cloudflared\$TunnelId.json"
$CfgDir   = Join-Path $env:USERPROFILE ".cloudflared"
$CfgPath  = Join-Path $CfgDir "config.yml"

@"
tunnel: $TunnelId
credentials-file: $Cred

ingress:
  - hostname: $Domain
    service: http://127.0.0.1:8000
  - service: http_status:404
"@ | Set-Content -Path $CfgPath -Encoding utf8

Get-Content $CfgPath
```

**VERIFY:** File berisi `hostname: {{DOMAIN}}` dan `service: http://127.0.0.1:8000`.

#### Step 4A.4 — DNS route

```powershell
cloudflared tunnel route dns monitoring-pemasaran {{DOMAIN}}
```

**VERIFY:**

```powershell
cloudflared tunnel info monitoring-pemasaran
```

#### Step 4A.5 — Install Windows Service

```powershell
# Jika service lama ada dan config berubah:
# cloudflared service uninstall

cloudflared service install
Start-Service cloudflared
```

**VERIFY:**

```powershell
Get-Service cloudflared | Format-List Name, Status, StartType
```

`Status=Running`, `StartType=Automatic`.

#### Step 4A.6 — Test HTTPS publik

```powershell
Start-Sleep -Seconds 20
curl.exe -sS -m 30 "https://{{DOMAIN}}/health"
curl.exe -sS -m 30 -o NUL -w "https_root=%{http_code}`n" "https://{{DOMAIN}}/"
```

**VERIFY:** health `"ok"`, root `200`.  
Jika DNS belum propagate: tunggu 1–5 menit, ulang. Cek `cloudflared tunnel info` dan Event Viewer jika gagal.

Laporkan: **Aplikasi publik di `https://{{DOMAIN}}`**

---

### Phase 4B — Quick tunnel (sementara, tanpa domain)

Hanya untuk demo. URL berubah; tidak cocok production.

```powershell
# Foreground — biarkan jalan di terminal terpisah / job
cloudflared tunnel --url http://127.0.0.1:8000
```

Salin URL `https://….trycloudflare.com` dari output.  
Test: `curl.exe -sS "https://….trycloudflare.com/health"`

Untuk production, **ganti ke 4A** segera setelah domain siap.

---

## Phase 5 — Firewall LAN + autostart Docker

### Step 5.1 — Firewall inbound 8000 (Administrator)

```powershell
$rule = Get-NetFirewallRule -DisplayName "Monitoring Pemasaran 8000" -ErrorAction SilentlyContinue
if (-not $rule) {
  New-NetFirewallRule -DisplayName "Monitoring Pemasaran 8000" `
    -Direction Inbound -Protocol TCP -LocalPort 8000 -Action Allow | Out-Null
}
Get-NetFirewallRule -DisplayName "Monitoring Pemasaran 8000" | Select-Object DisplayName, Enabled, Direction
```

**VERIFY:** Rule ada, Enabled True.

### Step 5.2 — Docker restart policy (sudah `unless-stopped` di compose)

Setelah reboot, pastikan Docker Desktop auto-start (Step 0.2). Lalu:

```powershell
cd D:\Apps-Dev\Monitoringpemasaran
docker compose up -d
```

Opsional Task Scheduler “at startup” (delay 1–2 menit agar Docker siap):

```powershell
$action = New-ScheduledTaskAction -Execute "powershell.exe" -Argument `
  "-NoProfile -ExecutionPolicy Bypass -File D:\Apps-Dev\Monitoringpemasaran\scripts\office\ensure_up.ps1"
$trigger = New-ScheduledTaskTrigger -AtStartup
$trigger.Delay = "PT2M"
$settings = New-ScheduledTaskSettingsSet -StartWhenAvailable -ExecutionTimeLimit (New-TimeSpan -Minutes 15)
Register-ScheduledTask -TaskName "MonitoringPemasaran-EnsureUp" `
  -Action $action -Trigger $trigger -Settings $settings -RunLevel Highest -Force
```

**VERIFY:**

```powershell
Get-ScheduledTask -TaskName "MonitoringPemasaran-EnsureUp" | Select-Object TaskName, State
```

---

## Phase 6 — Auto-update dari GitHub (opsional)

Hanya jika user ingin PC auto `git pull` + rebuild tiap ada commit di `main`.

### Step 6.1 — Credential git (jika repo private)

```powershell
cd D:\Apps-Dev\Monitoringpemasaran
git config --global credential.helper manager
git fetch origin main
```

### Step 6.2 — Script + scheduler

Script sudah ada: `scripts/office/auto_deploy.ps1`.

```powershell
$action = New-ScheduledTaskAction -Execute "powershell.exe" -Argument `
  "-NoProfile -ExecutionPolicy Bypass -File D:\Apps-Dev\Monitoringpemasaran\scripts\office\auto_deploy.ps1"
# Ulangi tiap 15 menit (lebih aman daripada 5 menit rebuild berat)
$trigger = New-ScheduledTaskTrigger -Once -At (Get-Date) -RepetitionInterval (New-TimeSpan -Minutes 15) -RepetitionDuration ([TimeSpan]::MaxValue)
$settings = New-ScheduledTaskSettingsSet -ExecutionTimeLimit (New-TimeSpan -Minutes 30) -StartWhenAvailable
Register-ScheduledTask -TaskName "MonitoringPemasaran-AutoDeploy" `
  -Action $action -Trigger $trigger -Settings $settings -RunLevel Highest -Force
```

**VERIFY:**

```powershell
Get-ScheduledTask -TaskName "MonitoringPemasaran-AutoDeploy" | Select-Object TaskName, State
Start-ScheduledTask -TaskName "MonitoringPemasaran-AutoDeploy"
```

**Catatan agent:** rebuild Docker sering memakan CPU/RAM. Jika PC lemot, **skip Phase 6**, pakai Phase 8 manual.

---

## Phase 7 — Backup DB harian + cutover Railway

### Step 7.1 — Folder backup

```powershell
New-Item -ItemType Directory -Force -Path "D:\Backup\MonitoringPemasaran" | Out-Null
```

### Step 7.2 — Jadwalkan backup jam 02:00

Script: `scripts/office/backup_db.ps1`.

```powershell
$action = New-ScheduledTaskAction -Execute "powershell.exe" -Argument `
  "-NoProfile -ExecutionPolicy Bypass -File D:\Apps-Dev\Monitoringpemasaran\scripts\office\backup_db.ps1"
$trigger = New-ScheduledTaskTrigger -Daily -At "02:00"
Register-ScheduledTask -TaskName "MonitoringPemasaran-BackupDB" `
  -Action $action -Trigger $trigger -RunLevel Highest -Force
```

### Step 7.3 — Test backup sekali

```powershell
powershell -ExecutionPolicy Bypass -File D:\Apps-Dev\Monitoringpemasaran\scripts\office\backup_db.ps1
Get-ChildItem "D:\Backup\MonitoringPemasaran" | Sort-Object LastWriteTime -Descending | Select-Object -First 3 Name, Length, LastWriteTime
```

**VERIFY:** File `.sql` terbaru size > 0.

### Step 7.4 — Checklist cutover (laporkan ke user, jangan hapus Railway tanpa izin)

- [ ] `/health` lokal OK  
- [ ] Login UI lokal OK  
- [ ] Data count kontrak/invoice masuk akal  
- [ ] HTTPS tunnel OK (jika Phase 4A)  
- [ ] Rekan uji dari HP (data seluler)  
- [ ] Superman: 1 deklarasi uji (opsional tapi disarankan)  
- [ ] Backup DB sukses  
- [ ] User setuju → **pause/stop** service app Railway (DB boleh di-hold 7 hari dulu)  
- [ ] Setelah 7 hari stabil → hapus project Railway (keputusan user)

---

## Phase 8 — Update manual

```powershell
cd D:\Apps-Dev\Monitoringpemasaran
git pull origin main
docker compose up -d --build
Start-Sleep -Seconds 8
curl.exe -sS -m 15 "http://127.0.0.1:8000/health"
docker compose ps
```

---

## Perintah diagnostik

```powershell
cd D:\Apps-Dev\Monitoringpemasaran

# Container
docker compose ps
docker compose logs --tail=50 app
docker compose logs --tail=30 db

# Health
curl.exe -sS -m 10 "http://127.0.0.1:8000/health"

# Tunnel
Get-Service cloudflared -ErrorAction SilentlyContinue | Format-List *
cloudflared tunnel list 2>$null

# Tasks
Get-ScheduledTask | Where-Object { $_.TaskName -like "MonitoringPemasaran*" } |
  Select-Object TaskName, State

# Backup size
Get-ChildItem "D:\Backup\MonitoringPemasaran" -ErrorAction SilentlyContinue |
  Measure-Object Length -Sum |
  Select-Object Count, @{n='TotalMB';e={[math]::Round($_.Sum/1MB,1)}}

# Disk & RAM cepat
Get-PSDrive C | Select-Object Used, Free
systeminfo | Select-String "Total Physical Memory","Available Physical Memory"
```

---

## Troubleshooting cepat

| Gejala | Cek | Perbaikan |
|--------|-----|-----------|
| `docker info` gagal | Docker Desktop belum jalan | Buka Docker Desktop |
| Build gagal OOM | RAM Docker terlalu kecil | Naikkan memory Docker ≥ 4–6 GB |
| `/health` refused | Container app down | `docker compose logs app` + `up -d` |
| LAN tidak bisa, localhost bisa | Firewall | Phase 5.1 |
| Tunnel 502 | App down atau port salah di config | Config harus `127.0.0.1:8000`; cek `docker compose ps` |
| Tunnel DNS NXDOMAIN | DNS belum ada / zone salah | Ulangi `tunnel route dns`; cek domain di CF |
| `pg_dump` Railway gagal | URL/network/SSL | Coba public URL Railway; pastikan PC online |
| Import error relasi | DB tidak kosong / dump partial | Drop schema atau `docker compose down -v` (**HAPUS DATA**) lalu import ulang — **konfirmasi user dulu** |
| Superman gagal di Docker | Session/captcha | Login ulang Superman di server; cek `SUPERMAN_*` di `.env` |
| PC sleep | Power plan | Phase 0 |
| Setelah reboot app mati | Docker tidak autostart | Phase 0.2 + EnsureUp task |

### Reset DB lokal (DESTRUCTIVE — hanya dengan izin user)

```powershell
cd D:\Apps-Dev\Monitoringpemasaran
docker compose down -v
docker compose up -d db
# lalu ulang import Phase 2.5 + Phase 3
```

---

## Keamanan (wajib dipatuhi agent)

1. Jangan commit `.env`, `backup_db.sql`, credentials Cloudflare `*.json`.  
2. Jangan publish port `5432` ke `0.0.0.0`.  
3. App di internet **harus** lewat HTTPS tunnel + login app (auth existing).  
4. Password DB & `SECRET_KEY` beda dari contoh di repo.  
5. Batasi siapa yang tahu `{{DOMAIN}}` URL jika data sensitif; auth tetap wajib.

---

## Ringkasan file terkait

| File | Peran |
|------|--------|
| `DEPLOY_GUIDE.md` | **Playbook ini** — sumber kebenaran deploy PC+tunnel |
| `OFFICE_IP_DEPLOY.md` | Ringkas LAN-only; arahkan ke playbook ini untuk internet |
| `docker-compose.yml` | Stack `app` + `db` |
| `.env.office.example` | Template env |
| `scripts/office/setup_env.ps1` | Buat `.env` |
| `scripts/office/import_sql.ps1` | Restore SQL ke container db |
| `scripts/office/ensure_up.ps1` | `docker compose up -d` setelah boot |
| `scripts/office/auto_deploy.ps1` | git pull + rebuild |
| `scripts/office/backup_db.ps1` | Dump harian |
| `agent.md` | Routing task → file ini |

---

## Changelog playbook

| Tanggal | Perubahan |
|---------|-----------|
| 2026-07-20 | Rewrite penuh: port **8000**, health `/health`, env selaras compose, Phase 0 (24 jam), tunnel 4A/4B, script `scripts/office/*`, checklist cutover Railway, instruksi AI agent VS Code |
| (lama) | Versi awal port 80 / `.env` hanya `DB_PASSWORD` — **usang, diganti** |
