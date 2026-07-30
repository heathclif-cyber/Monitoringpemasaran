# Monitoring Pemasaran — Migrasi Railway → PC Kantor Murni

> **Ini migrasi production:** keluar dari Railway, app + DB + Superman di **satu PC Windows kantor**.  
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

**Playbook AI (VS Code — user menunggu, output URL, auto GitHub):**  
→ **[MIGRATE_RAILWAY_TO_OFFICE.md](./MIGRATE_RAILWAY_TO_OFFICE.md)**

Detail teknis cadangan: **[DEPLOY_GUIDE.md](./DEPLOY_GUIDE.md)** · LAN: **[OFFICE_IP_DEPLOY.md](./OFFICE_IP_DEPLOY.md)**

---

## 1. Apa yang dipasang di PC kantor (sekali, oleh admin)

| Software | Kegunaan |
|----------|----------|
| Docker Desktop | Menjalankan app + database |
| (Opsional) Cloudflare Tunnel | Akses dari internet luar kantor |

Repo sudah punya:

- `docker-compose.yml` — `SUPERMAN_DEFAULT_EXECUTOR=server`
- `scripts/office/*` — setup / start
- `docs/deployment/DEPLOY_GUIDE.md` — detail tunnel + migrasi Railway
- `docs/deployment/OFFICE_IP_DEPLOY.md` — LAN singkat

### Langkah ringkas

1. Install **Docker Desktop** di PC Windows kantor (biarkan Auto-start).
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

5. Cek: buka `http://localhost:8000` di PC itu.  
6. Login admin → **Buat Deklarasi Superman** sekali → **isi captcha di web** (sekali / sampai session habis).  
7. Session tersimpan di volume Docker (`SUPERMAN_STATE_PATH`).

### Akses staf

| Dari mana | URL |
|-----------|-----|
| LAN kantor | `http://IP-PC-KANTOR:8000` (lihat `ipconfig`) |
| Internet | Ikuti **DEPLOY_GUIDE.md** Phase 4 (Cloudflare Tunnel + HTTPS) |

Firewall Windows: izinkan inbound **port 8000** (LAN), atau hanya tunnel (internet).

### Agar PC tidak “tidur”

- Power Options → sleep **Never** (plugged in)  
- Docker Desktop start with Windows  
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

| # | Fase | Isi | Detail |
|---|------|-----|--------|
| 1 | Phase 0–1 | Docker Desktop + clone repo + `.env` + `docker compose up` | DEPLOY_GUIDE |
| 2 | Phase 2 | **Dump DB Railway** → restore ke Postgres lokal | `import_sql.ps1` |
| 3 | Phase 3 | Salin `uploads/`, cek login + data | |
| 4 | Phase 5 | Power never sleep + firewall 8000 | |
| 5 | Phase 4 | Cloudflare Tunnel → internet `https://…` | butuh domain |
| 6 | Uji | Captcha Superman **di web** sekali, Buat Deklarasi | |
| 7 | Phase 7 | Cutover: staf pakai URL baru; **baru** matikan Railway | |

### Dump DB Railway (contoh)

Di PC yang punya akses Railway URL:

```powershell
# Simpan DATABASE_URL Railway ke variabel (jangan commit)
$env:RAILWAY_DB = "postgresql://..."
pg_dump $env:RAILWAY_DB --no-owner --no-acl -f backup_db.sql
```

Restore ke Docker kantor:

```powershell
.\scripts\office\import_sql.ps1 -SqlFile .\backup_db.sql
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
| Docker tidak start | Docker Desktop running + WSL update |

---

## Ringkas

| Peran | Tugas |
|-------|--------|
| Admin | Docker di 1 PC kantor + captcha Superman sekali di web |
| Semua staf | Browser saja ke URL app |

**Tidak ada multi-agent. Tidak ada kit bat untuk setiap user.**
