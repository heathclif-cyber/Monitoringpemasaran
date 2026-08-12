# Monitoring Pemasaran — Migrasi Railway → PC Kantor Murni

> **Ini migrasi production:** keluar dari Railway, app + DB + Superman di **satu PC kantor**.  
> **Staf tidak install apa-apa** — hanya browser.  
> **Tidak ada multi-agent / Mulai-Agent.bat.**

```
SEBELUM (Railway):
  Browser → Railway (app) ──X──→ Superman (timeout)
                    │
                    └── agent di banyak PC (ribet / diblokir IT)

SESUDAH (PC kantor):
  Browser (LAN/internet) → PC kantor Docker :8000
                              ├── Postgres (data dari Railway)
                              └── Playwright → Superman OK
```

### Pilih OS + playbook AI

| OS PC server | Playbook (VS Code / Cursor — user menunggu) |
|--------------|-----------------------------------------------|
| **Windows 10/11** | [MIGRATE_RAILWAY_TO_OFFICE.md](./MIGRATE_RAILWAY_TO_OFFICE.md) + [DEPLOY_GUIDE.md](./DEPLOY_GUIDE.md) |
| **Ubuntu Desktop 24.04** | **[MIGRATE_RAILWAY_TO_UBUNTU.md](./MIGRATE_RAILWAY_TO_UBUNTU.md)** |

LAN singkat: [OFFICE_IP_DEPLOY.md](./OFFICE_IP_DEPLOY.md) · Konsep stack sama: `docker-compose.yml`.

---

## 1. Apa yang dipasang di PC kantor (sekali, oleh admin)

| Software | Windows | Ubuntu Desktop 24.04 |
|----------|---------|----------------------|
| Container | Docker **Desktop** (auto-start) | Docker **Engine** + compose plugin |
| Editor + AI | VS Code / Cursor | VS Code (`snap`) / Cursor |
| (Opsional) Tunnel | Cloudflare Tunnel (Windows service) | Cloudflare Tunnel (systemd) |

Repo sudah punya:

- `docker-compose.yml` — `SUPERMAN_DEFAULT_EXECUTOR=server` (**identik** di kedua OS)
- `scripts/office/*.ps1` — helper **Windows**
- `docs/deployment/MIGRATE_RAILWAY_TO_UBUNTU.md` — bash/cron/systemd **Ubuntu**
- `docs/deployment/DEPLOY_GUIDE.md` — detail tunnel + migrasi (asal Windows)
- `docs/deployment/OFFICE_IP_DEPLOY.md` — LAN singkat

### Langkah ringkas — Windows

1. Install **Docker Desktop** (biarkan Auto-start).
2. Clone/copy repo Monitoringpemasaran ke PC itu.
3. Salin env:

```powershell
copy .env.office.example .env
# isi SUPERMAN_USER, SUPERMAN_PASSWORD (portal unit)
# SECRET_KEY ganti string acak
```

4. Jalankan:

```powershell
cd D:\path\Monitoringpemasaran
docker compose up -d --build
```

### Langkah ringkas — Ubuntu Desktop 24.04

1. Install OS: unduh **Desktop** (bukan Server / WSL / Core / Cloud) — lihat playbook Ubuntu.  
2. Pasang Docker Engine + VS Code (detail di [MIGRATE_RAILWAY_TO_UBUNTU.md](./MIGRATE_RAILWAY_TO_UBUNTU.md)).  
3. Env + stack:

```bash
cd ~/Apps/Monitoringpemasaran
cp .env.office.example .env
# edit SUPERMAN_*, SECRET_KEY, POSTGRES_PASSWORD
docker compose up -d --build
```

### Setelah stack jalan (kedua OS)

5. Cek: buka `http://localhost:8000` di PC itu.  
6. Login admin → **Buat Deklarasi Superman** sekali → **isi captcha di web** (sekali / sampai session habis).  
7. Session tersimpan di volume Docker (`SUPERMAN_STATE_PATH`).

### Akses staf

| Dari mana | URL |
|-----------|-----|
| LAN kantor | `http://IP-PC-KANTOR:8000` (Windows: `ipconfig` / Ubuntu: `hostname -I`) |
| Internet | Tunnel Cloudflare — Windows: DEPLOY_GUIDE Phase 4; Ubuntu: MIGRATE_RAILWAY_TO_UBUNTU Phase 4 |

Firewall: izinkan inbound **port 8000** (LAN), atau hanya tunnel (internet).  
Windows: `New-NetFirewallRule` · Ubuntu: `sudo ufw allow 8000/tcp`.

### Agar PC tidak “tidur”

- Sleep / suspend **Never** (plugged in)  
- Docker start on boot (Desktop Windows / `systemctl enable docker` Ubuntu)  
- `restart: unless-stopped` sudah di compose  

---

## 2. Yang dilakukan staf (setiap hari)

1. Buka URL app (LAN atau `https://...` tunnel)  
2. Login  
3. Kerja biasa → **Buat Deklarasi Superman**  
4. Jika diminta captcha → isi di **web** (bukan bat)  

Tidak ada install Python, tidak ada bat, tidak ada agent di laptop.

---

## 3. Kenapa bukan Railway + multi-agent?

| Railway (cloud) | PC kantor |
|-----------------|-----------|
| Sering **tidak** tembus portal Superman | Jaringan kantor biasanya **bisa** |
| Butuh agent di banyak PC | Cukup **satu** mesin server |
| Captcha web timeout | Captcha web **bisa** |

---

## 4. Migrasi dari Railway (wajib untuk cutover)

Urutan aman (jangan matikan Railway dulu):

| # | Fase | Isi | Windows | Ubuntu Desktop 24.04 |
|---|------|-----|---------|----------------------|
| 1 | Phase 0–1 | Docker + clone + `.env` + compose | DEPLOY_GUIDE / MIGRATE_OFFICE | MIGRATE_RAILWAY_TO_UBUNTU |
| 2 | Phase 2 | **Dump DB Railway** → restore lokal | `import_sql.ps1` | `psql` via `docker compose exec` |
| 3 | Phase 3 | Salin `uploads/`, cek login + data | sama | sama |
| 4 | Phase 5 | Never sleep + firewall 8000 | Powercfg + NetFirewall | gsettings/systemd + ufw |
| 5 | Phase 4 | Cloudflare Tunnel | Windows service | systemd `cloudflared` |
| 6 | Uji | Captcha Superman **di web**, Buat Deklarasi | sama | sama |
| 7 | Phase 7 | Cutover; **baru** matikan Railway | sama | sama |

### Dump DB Railway (contoh)

**Windows:**

```powershell
$env:RAILWAY_DB = "postgresql://..."
# atau via container:
docker run --rm postgres:16-alpine sh -c "pg_dump `"$env:RAILWAY_DB`" --no-owner --no-acl" > backup_db.sql
.\scripts\office\import_sql.ps1 -SqlFile .\backup_db.sql
```

**Ubuntu:**

```bash
export RAILWAY_DB_URL='postgresql://...'
docker run --rm postgres:16-alpine \
  sh -c "pg_dump \"$RAILWAY_DB_URL\" --no-owner --no-acl" > backup_db.sql
cat backup_db.sql | docker compose exec -T db psql -U ptpn -d monitoringpemasaran
```

### Setelah cutover sukses

- Staf hanya buka URL PC kantor / tunnel  
- Railway service app + DB boleh di-pause/delete (setelah backup final)  
- Multi-agent kit **tidak** dipakai lagi

---

## 5. Troubleshooting Superman di PC kantor

| Gejala | Cek |
|--------|-----|
| Captcha tidak load | PC bisa buka `https://superman.ptpn1.co.id` di browser? |
| Session sering habis | Isi captcha lagi di web; volume `/data` jangan dihapus |
| Staf di luar tidak bisa akses | Tunnel Cloudflare belum jalan / firewall |
| Docker tidak start | Windows: Docker Desktop + WSL; Ubuntu: `sudo systemctl start docker`, user di group `docker` |

---

## Ringkas

| Peran | Tugas |
|-------|--------|
| Admin | Docker di 1 PC kantor + captcha Superman sekali di web |
| Semua staf | Browser saja ke URL app |

**Tidak ada multi-agent. Tidak ada kit bat untuk setiap user.**
