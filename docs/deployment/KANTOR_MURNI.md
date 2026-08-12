# Monitoring Pemasaran — Migrasi Railway → PC Kantor Murni

> **Ini migrasi production:** keluar dari Railway, app + DB + Superman di **satu PC Ubuntu Desktop 24.04**.  
> **Staf tidak install apa-apa** — hanya browser.  
> **Tidak ada multi-agent / Mulai-Agent.bat.**  
> **Jalur Windows / PowerShell sudah dihapus** — hanya Ubuntu.

```
SEBELUM (Railway):
  Browser → Railway (app) ──X──→ Superman (timeout)
                    │
                    └── agent di banyak PC (ribet / diblokir IT)

SESUDAH (PC kantor):
  Browser (LAN/internet) → PC Ubuntu Docker :8000
                              ├── Postgres (data dari Railway)
                              └── Playwright → Superman OK
```

**Playbook AI (VS Code / Cursor — user menunggu, output URL, auto GitHub):**  
→ **[MIGRATE_RAILWAY_TO_UBUNTU.md](./MIGRATE_RAILWAY_TO_UBUNTU.md)**

---

## 1. Apa yang dipasang di PC kantor (sekali, oleh admin)

| Software | Kegunaan |
|----------|----------|
| Ubuntu **Desktop** 24.04 LTS | OS server kantor (bukan Server/WSL/Core/Cloud) |
| Docker **Engine** + compose plugin | App + Postgres |
| VS Code / Cursor | AI bantu migrasi & maintenance |
| (Opsional) Cloudflare Tunnel | Akses dari internet luar kantor |

Repo:

- `docker-compose.yml` — `SUPERMAN_DEFAULT_EXECUTOR=server`
- `.env.office.example` → salin ke `.env`
- `docs/deployment/MIGRATE_RAILWAY_TO_UBUNTU.md` — langkah penuh Phase 0–7

### Langkah ringkas

1. Install **Ubuntu 24.04 Desktop**.  
2. Pasang Docker Engine + VS Code (detail di playbook Ubuntu).  
3. Clone repo, buat env, jalankan stack:

```bash
cd ~/Apps/Monitoringpemasaran
cp .env.office.example .env
# edit SUPERMAN_*, SECRET_KEY, POSTGRES_PASSWORD
docker compose up -d --build
```

4. Cek: `http://localhost:8000`  
5. Login → **Buat Deklarasi Superman** → **isi captcha di web** (sekali / sampai session habis).  
6. Session di volume Docker (`SUPERMAN_STATE_PATH`).

Migrasi data Railway, firewall, never-sleep, cron backup/auto-deploy: **ikuti playbook Ubuntu penuh**.

### Akses staf

| Dari mana | URL |
|-----------|-----|
| LAN kantor | `http://IP-PC:8000` (`hostname -I`) |
| Internet | Phase 4 playbook Ubuntu (Cloudflare Tunnel + HTTPS) |

Firewall: `sudo ufw allow 8000/tcp` (LAN), atau hanya tunnel.

### Agar PC tidak “tidur”

- Suspend / sleep **Never** (plugged in)  
- `systemctl enable docker`  
- `restart: unless-stopped` di compose  

---

## 2. Yang dilakukan staf (setiap hari)

1. Buka URL app (LAN atau `https://...` tunnel)  
2. Login  
3. Kerja biasa → **Buat Deklarasi Superman**  
4. Jika diminta captcha → isi di **web**  

Tidak ada install Python, tidak ada bat, tidak ada agent di laptop.

---

## 3. Kenapa bukan Railway + multi-agent?

| Railway (cloud) | PC kantor Ubuntu |
|-----------------|------------------|
| Sering **tidak** tembus portal Superman | Jaringan kantor biasanya **bisa** |
| Butuh agent di banyak PC | Cukup **satu** mesin server |
| Captcha web timeout | Captcha web **bisa** |

---

## 4. Migrasi dari Railway

Urutan aman (jangan matikan Railway dulu) — detail perintah di [MIGRATE_RAILWAY_TO_UBUNTU.md](./MIGRATE_RAILWAY_TO_UBUNTU.md):

| # | Fase | Isi |
|---|------|-----|
| 1 | 0–1 | Ubuntu 24 jam + Docker Engine + clone + `.env` |
| 2 | 2 | Dump DB Railway → restore Postgres lokal |
| 3 | 3 | Build app, cek login + data |
| 4 | 5 | Never sleep + ufw 8000 |
| 5 | 4 | Cloudflare Tunnel (opsional) |
| 6 | Uji | Captcha Superman di web, Buat Deklarasi |
| 7 | 7 | Cutover; **baru** matikan Railway |

### Dump / restore (ringkas)

```bash
export RAILWAY_DB_URL='postgresql://...'
docker run --rm postgres:16-alpine \
  sh -c "pg_dump \"$RAILWAY_DB_URL\" --no-owner --no-acl" > backup_db.sql
cat backup_db.sql | docker compose exec -T db psql -U ptpn -d monitoringpemasaran
```

### Setelah cutover sukses

- Staf hanya buka URL PC kantor / tunnel  
- Railway app + DB boleh di-pause/delete (setelah backup final)  
- Multi-agent kit **tidak** dipakai lagi  

---

## 5. Troubleshooting Superman di PC kantor

| Gejala | Cek |
|--------|-----|
| Captcha tidak load | PC bisa buka `https://superman.ptpn1.co.id` di browser? |
| Session sering habis | Isi captcha lagi di web; volume `/data` jangan dihapus |
| Staf di luar tidak bisa akses | Tunnel Cloudflare belum jalan / firewall |
| Docker tidak start | `sudo systemctl start docker`; user di group `docker` |

---

## Ringkas

| Peran | Tugas |
|-------|--------|
| Admin | Ubuntu + Docker di 1 PC + captcha Superman di web |
| Semua staf | Browser saja ke URL app |

**Tidak ada multi-agent. Tidak ada kit bat untuk setiap user. Tidak ada playbook Windows.**
