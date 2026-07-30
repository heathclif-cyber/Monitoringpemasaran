# Playbook AI — Migrasi Railway → PC Kantor (otomatis)

> **Untuk:** VS Code + AI agent (Claude / Cursor / Copilot).  
> **User:** cukup jawab pertanyaan di awal, lalu **menunggu**.  
> **Akhir sukses:** agent menampilkan **URL final** (LAN + internet jika tunnel).  
> **Setelahnya:** update app **otomatis dari GitHub** (`git pull` + rebuild).

```text
User jawab variabel → AI eksekusi Phase 0–7 → output URL
                              ↓
                    PC kantor Docker 24 jam
                              ↓
                    Task Scheduler: auto_deploy.ps1 (GitHub)
```

| Item | Nilai baku |
|------|------------|
| Repo | `https://github.com/heathclif-cyber/Monitoringpemasaran.git` |
| Working dir | `D:\Apps-Dev\Monitoringpemasaran` (atau path user) |
| Shell | **PowerShell** (Admin untuk power, firewall, Task Scheduler, tunnel) |
| App port | **8000** |
| Health | `GET http://127.0.0.1:8000/health` → `{"status":"ok"}` |
| Superman | `SUPERMAN_DEFAULT_EXECUTOR=server` (tanpa multi-agent) |
| Detail teknis cadangan | [DEPLOY_GUIDE.md](./DEPLOY_GUIDE.md) |

---

## 0. Instruksi ke AI agent (WAJIB dibaca dulu)

Saat user bilang: **“migrasi ke PC kantor”**, **“eksekusi MIGRATE_RAILWAY_TO_OFFICE”**, **“setup office otomatis”**:

1. Baca **file ini penuh**.
2. Jalankan **Phase A (variabel)** — tanya user sekali; jangan tebak secret.
3. Eksekusi Phase **0 → 1 → 2 → 3 → 5 → 4 → 6 → 7** berurutan (lihat mode di bawah).
4. Setelah **setiap** step: jalankan **VERIFY**. Gagal → **STOP**, laporkan error + step.
5. **Jangan** matikan Railway sampai Phase 7 + user setuju.
6. **Jangan** commit/push `.env`, password, token Cloudflare, dump SQL.
7. **Jangan** expose Postgres ke internet (port 5432 hanya localhost).
8. **Jangan** arahkan user ke multi-agent / Mulai-Agent.bat sebagai jalur utama.
9. Di akhir: cetak **OUTPUT FINAL** (bagian bawah file ini) — user hanya salin URL.
10. PowerShell: HTTP pakai `curl.exe` (bukan alias `curl`).

### Mode (user boleh pilih)

| Kata user | Fase |
|-----------|------|
| `setup penuh` / `migrasi penuh` / default | 0→1→2→3→5→4→6→7 |
| `hanya lokal` / `LAN dulu` | 0→1→2→3→5 (URL = `http://IP:8000`) |
| `tanpa migrasi DB` | Skip dump Railway; schema kosong + migrate |
| `hanya tunnel` | Phase 4 (app harus sudah `/health` ok) |
| `hanya auto-update github` | Phase 6 |

### Prinsip “user menunggu”

- Agent menjalankan perintah; user **tidak** disuruh klik bat agent.
- User hanya: install Docker Desktop sekali (jika diminta), login Cloudflare di browser (Phase 4), setuju cutover Railway.
- Semua script di `scripts/office/*.ps1` — pakai itu, jangan invent path baru.

---

## Phase A — Kumpulkan variabel (sekali, di awal)

Tanya user (salin ke catatan sesi, **jangan** tulis ke file yang di-commit):

| ID | Wajib? | Arti | Contoh |
|----|--------|------|--------|
| `REPO_DIR` | Ya | Path repo di PC kantor | `D:\Apps-Dev\Monitoringpemasaran` |
| `GITHUB_URL` | Ya | Clone URL | `https://github.com/heathclif-cyber/Monitoringpemasaran.git` |
| `POSTGRES_PASSWORD` | Ya | Password DB lokal, min 16 char, hindari `@ # : / %` | generate |
| `SECRET_KEY` | Ya | JWT secret, min 32 char | generate |
| `RAILWAY_DB_URL` | Ya* | Postgres Railway untuk dump | `postgresql://…` |
| `SUPERMAN_USER` | Ya | Portal Superman unit | `op_r08d_reg8` |
| `SUPERMAN_PASSWORD` | Ya | Password portal | — |
| `DOMAIN` | Phase 4 | Hostname publik Cloudflare | `monitoring.perusahaan.com` |
| `WINDOWS_USER` | Phase 4/6 | User Windows PC server | dari `whoami` |
| `MIGRATE_DATA` | Ya | `yes` = dump Railway; `no` = DB kosong | `yes` |

\*Jika `MIGRATE_DATA=no`, skip dump.

### Generate secret (jika user minta AI generate)

```powershell
-join ((48..57 + 65..90 + 97..122 | Get-Random -Count 48 | ForEach-Object { [char]$_ }))
```

Cetak ke user sekali untuk disimpan di password manager; pakai di `.env`.

### Checklist prasyarat akun (user siapkan di luar)

- [ ] Docker Desktop terpasang / bisa diinstall
- [ ] Akses Railway (copy Database URL) jika migrasi data
- [ ] Domain di Cloudflare (jika ingin URL internet permanen)
- [ ] PC terhubung listrik, akan nyala 24 jam

---

## Phase 0 — PC 24 jam

### 0.1 Power plan (Admin)

```powershell
powercfg /change standby-timeout-ac 0
powercfg /change hibernate-timeout-ac 0
powercfg /change monitor-timeout-ac 30
powercfg /change disk-timeout-ac 0
powercfg /hibernate off
```

**VERIFY:** sleep AC = never / 0.

### 0.2 Catat IP LAN

```powershell
Get-NetIPAddress -AddressFamily IPv4 |
  Where-Object { $_.IPAddress -notlike '127.*' -and $_.PrefixOrigin -ne 'WellKnown' } |
  Select-Object IPAddress, InterfaceAlias
```

Simpan `LAN_IP` untuk OUTPUT FINAL.

### 0.3 Docker Desktop autostart

Minta user (sekali): Docker Desktop → Settings → **Start when you sign in** = ON.

---

## Phase 1 — Tool + repo

### 1.1 Cek / install tool

```powershell
docker --version
git --version
```

Jika gagal:

```powershell
winget install -e --id Git.Git --accept-package-agreements --accept-source-agreements
# Docker: user install dari https://www.docker.com/products/docker-desktop/ lalu restart
```

```powershell
docker info
```

**VERIFY:** daemon running.

### 1.2 Clone / pull

```powershell
$RepoDir = "{{REPO_DIR}}"
$GitUrl  = "{{GITHUB_URL}}"
New-Item -ItemType Directory -Force -Path (Split-Path $RepoDir) | Out-Null
if (Test-Path (Join-Path $RepoDir "docker-compose.yml")) {
  Set-Location $RepoDir
  git fetch origin
  git checkout main
  git pull origin main
} else {
  git clone $GitUrl $RepoDir
  Set-Location $RepoDir
}
```

**VERIFY:**

```powershell
Test-Path ".\docker-compose.yml"
Test-Path ".\scripts\office\setup_env.ps1"
Test-Path ".\scripts\office\auto_deploy.ps1"
```

---

## Phase 2 — Env + migrasi database Railway

### 2.1 Buat `.env`

```powershell
cd {{REPO_DIR}}
powershell -ExecutionPolicy Bypass -File .\scripts\office\setup_env.ps1 `
  -PostgresPassword "{{POSTGRES_PASSWORD}}" `
  -SecretKey "{{SECRET_KEY}}" `
  -SupermanUser "{{SUPERMAN_USER}}" `
  -SupermanPassword "{{SUPERMAN_PASSWORD}}" `
  -SupermanExecutor "server"
```

**VERIFY:** file `.env` ada; keys `POSTGRES_*`, `SECRET_KEY`, `SUPERMAN_DEFAULT_EXECUTOR=server` (cek nama key saja, jangan log password).

### 2.2 Start Postgres

```powershell
docker compose up -d db
```

Tunggu healthy (loop `pg_isready` max ~2 menit).

### 2.3 Migrasi data dari Railway (`MIGRATE_DATA=yes`)

```powershell
cd {{REPO_DIR}}
$RailwayUrl = "{{RAILWAY_DB_URL}}"
New-Item -ItemType Directory -Force -Path ".\backups" | Out-Null
$Dump = ".\backups\railway_$(Get-Date -Format 'yyyyMMdd_HHmmss').sql"

# Dump via container postgres client (tidak perlu pg_dump di host)
docker run --rm -e PGPASSWORD=unused `
  postgres:16-alpine `
  pg_dump "$RailwayUrl" --no-owner --no-acl -f /tmp/dump.sql
# Alternatif andal: pipe
docker run --rm postgres:16-alpine `
  sh -c "pg_dump `"$RailwayUrl`" --no-owner --no-acl" > $Dump
```

Jika `pg_dump` gagal SSL/URL, coba URL **public** Railway (bukan pooler) atau:

```powershell
# Host Windows jika ada pg_dump
pg_dump "{{RAILWAY_DB_URL}}" --no-owner --no-acl -f $Dump
```

**VERIFY:** file dump size > 1 KB.

Restore:

```powershell
powershell -ExecutionPolicy Bypass -File .\scripts\office\import_sql.ps1 -SqlFile $Dump
```

Jika helper beda param, baca `import_sql.ps1` lalu sesuaikan — **jangan** tebak flag.

**VERIFY:**

```powershell
docker compose exec -T db psql -U ptpn -d monitoringpemasaran -c "\dt" | Select-Object -First 30
```

Harus ada tabel bisnis (mis. invoice/kontrak/users — nama sesuai schema app).

### 2.4 Skip migrasi (`MIGRATE_DATA=no`)

Lewati dump; Phase 3 `RUN_DB_MIGRATE=true` akan buat schema kosong.

### 2.5 Uploads (jika user punya backup folder)

Salin isi `uploads/` Railway/backup ke `{{REPO_DIR}}\uploads\` (volume compose).

---

## Phase 3 — Build & jalankan app

```powershell
cd {{REPO_DIR}}
docker compose up -d --build
```

Tunggu container healthy (max 5–10 menit build pertama).

**VERIFY:**

```powershell
docker compose ps
curl.exe -sS -m 20 http://127.0.0.1:8000/health
```

Harus `{"status":"ok"}` (atau setara ok).

**VERIFY login app** (opsional):

```powershell
curl.exe -sS -m 20 -X POST http://127.0.0.1:8000/api/auth/login `
  -H "Content-Type: application/json" `
  -d "{\"username\":\"admin\",\"password\":\"...\"}"
```

(User berikan 1 user existing setelah restore.)

**VERIFY Superman reachability dari container** (penting):

```powershell
docker compose exec -T app python -c "import urllib.request; r=urllib.request.urlopen('https://superman.ptpn1.co.id/', timeout=20); print(r.status)"
```

Harus `200` (atau 3xx). Jika timeout: jaringan PC kantor tidak tembus Superman — **STOP**, laporkan IT.

---

## Phase 5 — Firewall LAN + autostart stack

### 5.1 Firewall port 8000 (Admin)

```powershell
New-NetFirewallRule -DisplayName "Monitoring Pemasaran 8000" `
  -Direction Inbound -Protocol TCP -LocalPort 8000 -Action Allow -ErrorAction SilentlyContinue
```

**VERIFY:** dari PC lain di LAN (atau minta user): `http://{{LAN_IP}}:8000/health`

### 5.2 Task Scheduler — pastikan stack hidup saat boot

```powershell
$ps = "powershell.exe"
$arg = "-ExecutionPolicy Bypass -File `"{{REPO_DIR}}\scripts\office\ensure_up.ps1`""
# Buat task AtStartup (Admin) — sesuaikan nama task
$action = New-ScheduledTaskAction -Execute $ps -Argument $arg
$trigger = New-ScheduledTaskTrigger -AtStartup
Register-ScheduledTask -TaskName "MonPem-EnsureUp" -Action $action -Trigger $trigger `
  -User "SYSTEM" -RunLevel Highest -Force
```

Jika Register gagal user SYSTEM, pakai user Windows interaktif + “Run whether user is logged on or not” sesuai policy PC.

**VERIFY:** `Get-ScheduledTask -TaskName "MonPem-EnsureUp"`

---

## Phase 4 — URL internet (Cloudflare Tunnel)

**Prasyarat:** Phase 3 health OK.

### 4A — Tunnel permanen (disarankan)

1. Install cloudflared: `winget install Cloudflare.cloudflared`
2. `cloudflared tunnel login` → user login browser Cloudflare
3. `cloudflared tunnel create monitoring-pemasaran`
4. Config ingress ke `http://127.0.0.1:8000`
5. DNS CNAME `{{DOMAIN}}` → tunnel
6. Install service: `cloudflared service install`

Ikuti detail perintah di **DEPLOY_GUIDE.md Phase 4** jika langkah di atas perlu flag exact.

**VERIFY:**

```powershell
curl.exe -sS -m 30 "https://{{DOMAIN}}/health"
```

### 4B — Quick tunnel (hanya uji, URL berubah)

```powershell
cloudflared tunnel --url http://127.0.0.1:8000
```

Catat URL `https://….trycloudflare.com` ke OUTPUT — **bukan** production permanen.

---

## Phase 6 — Auto-update dari GitHub (otomatis)

Agar user **tidak** deploy manual: setiap push ke `main` di GitHub, PC kantor pull + rebuild.

### 6.1 Pastikan git remote

```powershell
cd {{REPO_DIR}}
git remote -v
git status -sb
```

### 6.2 Task Scheduler — cek update berkala

```powershell
$ps = "powershell.exe"
$arg = "-ExecutionPolicy Bypass -File `"{{REPO_DIR}}\scripts\office\auto_deploy.ps1`""
$action = New-ScheduledTaskAction -Execute $ps -Argument $arg
# tiap 15 menit
$trigger = New-ScheduledTaskTrigger -Once -At (Get-Date) -RepetitionInterval (New-TimeSpan -Minutes 15) -RepetitionDuration ([TimeSpan]::MaxValue)
Register-ScheduledTask -TaskName "MonPem-AutoDeployGitHub" -Action $action -Trigger $trigger `
  -User "SYSTEM" -RunLevel Highest -Force
```

Script `auto_deploy.ps1` sudah: `git fetch` → jika `origin/main` beda → `git pull` → `docker compose up -d --build`.

**VERIFY:**

```powershell
Get-ScheduledTask -TaskName "MonPem-AutoDeployGitHub"
Get-Content "{{REPO_DIR}}\logs\auto_deploy.log" -ErrorAction SilentlyContinue | Select-Object -Last 5
```

### 6.3 Alur developer (untuk AI/user di dev machine)

1. Commit + push ke `main` di GitHub  
2. PC kantor (max 15 menit) auto pull + rebuild  
3. User hard-refresh browser  

**Jangan** push `.env` atau secret.

---

## Phase 7 — Cutover Railway (setelah stabil)

### 7.1 Checklist sebelum cutover

- [ ] `/health` OK di LAN URL  
- [ ] Login staf OK dengan data migrated  
- [ ] Upload dokumen terlihat  
- [ ] Buat Deklarasi Superman: captcha web OK, draft masuk  
- [ ] URL internet (jika dipakai) OK  
- [ ] Backup dump lokal tersimpan di `backups/`

### 7.2 Komunikasi ke staf

Kirim **OUTPUT FINAL** (URL). Staf hanya bookmark URL baru.

### 7.3 Matikan Railway

**Hanya setelah user setuju eksplisit:**

1. Pause / remove service app Railway  
2. Snapshot/export DB terakhir (opsional)  
3. Jangan hapus DB sampai 7 hari stabil (kebijakan aman)

### 7.4 Backup harian lokal

```powershell
# Task harian
$arg = "-ExecutionPolicy Bypass -File `"{{REPO_DIR}}\scripts\office\backup_db.ps1`""
# Register-ScheduledTask MonPem-BackupDaily -Daily -At 02:00 ...
```

---

## OUTPUT FINAL (cetak ke user — wajib)

Setelah Phase 3 (+ 4/5 sesuai mode), agent **wajib** menampilkan:

```markdown
## ✅ Migrasi siap

| Item | Nilai |
|------|--------|
| Status | SUKSES / GAGAL (fase terakhir: …) |
| PC | {{hostname}} |
| LAN URL | http://{{LAN_IP}}:8000 |
| Internet URL | https://{{DOMAIN}}  (atau: belum / quick tunnel) |
| Health | http://…/health → ok |
| Superman | server di PC kantor (executor=server) |
| Auto-update GitHub | Task MonPem-AutoDeployGitHub tiap 15 mnt |
| Pastikan stack | Task MonPem-EnsureUp at startup |

### Yang staf lakukan
1. Buka **LAN URL** atau **Internet URL**
2. Login seperti biasa
3. Buat Deklarasi Superman — captcha di **web** jika diminta
4. Tidak install bat/agent di laptop

### Yang admin lakukan
- PC kantor: biarkan nyala + Docker Desktop + user login Windows jika perlu
- Update app: push ke GitHub `main` → PC auto rebuild

### Railway
- Status: masih hidup / dijadwalkan dimatikan setelah: …
```

---

## Jika gagal (diagnostik cepat)

```powershell
cd {{REPO_DIR}}
docker compose ps
docker compose logs app --tail 80
curl.exe -sS -m 15 http://127.0.0.1:8000/health
Get-Content .\logs\ensure_up.log -Tail 20 -ErrorAction SilentlyContinue
Get-Content .\logs\auto_deploy.log -Tail 20 -ErrorAction SilentlyContinue
```

| Gejala | Tindakan |
|--------|----------|
| Docker daemon down | Buka Docker Desktop |
| Health 502/empty | `docker compose logs app` |
| Superman timeout dari container | Jaringan PC → portal; cek proxy/firewall |
| Tunnel 502 | cloudflared service running? |
| Auto deploy tidak jalan | Task Scheduler history + `git remote` auth |

---

## Ringkas untuk user manusia

1. Buka repo di **VS Code di PC kantor**.  
2. Chat AI: **“Eksekusi docs/deployment/MIGRATE_RAILWAY_TO_OFFICE.md setup penuh”**.  
3. Jawab pertanyaan (password DB, Railway URL, Superman, domain).  
4. **Tunggu** sampai AI kirim tabel URL.  
5. Bookmark URL; staf hanya buka browser.  
6. Update fitur: push GitHub → PC auto update.

---

## Referensi silang

| File | Isi |
|------|-----|
| [DEPLOY_GUIDE.md](./DEPLOY_GUIDE.md) | Detail perintah tunnel/backup panjang |
| [KANTOR_MURNI.md](./KANTOR_MURNI.md) | Konsep tanpa multi-agent |
| [OFFICE_IP_DEPLOY.md](./OFFICE_IP_DEPLOY.md) | LAN singkat |
| `scripts/office/*.ps1` | setup_env, import_sql, ensure_up, auto_deploy, backup_db |
