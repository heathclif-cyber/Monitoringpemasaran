# Deploy PC Kantor — ringkasan cepat

> **Playbook lengkap (AI agent / VS Code):**  
> - **Windows:** [MIGRATE_RAILWAY_TO_OFFICE.md](./MIGRATE_RAILWAY_TO_OFFICE.md) + [DEPLOY_GUIDE.md](./DEPLOY_GUIDE.md)  
> - **Ubuntu Desktop 24.04:** [MIGRATE_RAILWAY_TO_UBUNTU.md](./MIGRATE_RAILWAY_TO_UBUNTU.md)  
> Isi: migrasi Railway, Docker, LAN, tunnel opsional, backup, cutover.

---

## Target

| Mode | URL | Dokumen |
|------|-----|---------|
| **LAN saja** | `http://192.168.x.x:8000` | Bagian singkat di bawah |
| **LAN + internet (Windows)** | `https://monitoring.domain.com` | [DEPLOY_GUIDE.md](./DEPLOY_GUIDE.md) Phase 4 |
| **LAN + internet (Ubuntu)** | `https://monitoring.domain.com` | [MIGRATE_RAILWAY_TO_UBUNTU.md](./MIGRATE_RAILWAY_TO_UBUNTU.md) Phase 4 |

Stack: PC kantor **24 jam** (Windows **atau** Ubuntu Desktop 24.04) + Docker (`docker-compose.yml`) + Postgres lokal.  
**Lepas Railway** setelah cutover (checklist di playbook OS Anda, Phase 7).

---

## Arsitektur (singkat)

| Komponen | Di mana |
|----------|---------|
| App (FastAPI + React dist) | PC kantor Docker `monpem-app` **:8000** |
| PostgreSQL | Docker `monpem-db` (hanya `127.0.0.1:5432`) |
| Playwright / Superman | PC kantor (`SUPERMAN_DEFAULT_EXECUTOR=server`) |
| Internet luar | Cloudflare Tunnel → `http://127.0.0.1:8000` |

---

## Quick start LAN (Docker)

### Windows

```powershell
cd D:\Apps-Dev\Monitoringpemasaran

# 1) Env
copy .env.office.example .env
# edit POSTGRES_PASSWORD + SECRET_KEY + SUPERMAN_*
# atau: scripts\office\setup_env.ps1 -PostgresPassword "..." -SecretKey "..."

# 2) Build & jalan
docker compose up -d --build

# 3) Cek
curl.exe -sS http://127.0.0.1:8000/health
docker compose ps
```

IP LAN (Windows):

```powershell
Get-NetIPAddress -AddressFamily IPv4 | Where-Object { $_.IPAddress -notlike '127.*' }
```

### Ubuntu Desktop 24.04

```bash
cd ~/Apps/Monitoringpemasaran

cp .env.office.example .env
# edit POSTGRES_PASSWORD + SECRET_KEY + SUPERMAN_*

docker compose up -d --build
curl -sS http://127.0.0.1:8000/health
docker compose ps

hostname -I
```

Detail penuh (dump Railway, firewall ufw, cron): [MIGRATE_RAILWAY_TO_UBUNTU.md](./MIGRATE_RAILWAY_TO_UBUNTU.md).

Rekan di Wi‑Fi yang sama: `http://<IP-PC>:8000`

---

## Internet luar

Tidak cukup IP LAN. Pasang **Cloudflare Tunnel** (gratis) — langkah lengkap:

→ [DEPLOY_GUIDE.md Phase 4](./DEPLOY_GUIDE.md#phase-4--cloudflare-tunnel-akses-internet)

Butuh domain di akun Cloudflare untuk URL permanen. Tanpa domain: quick tunnel (sementara saja).

---

## Opsi native Windows (tanpa Docker)

Hanya jika Docker tidak tersedia. Lihat `scripts/office/start_server.ps1` + Postgres Windows.
Untuk production kantor + tunnel, **Docker tetap disarankan** (satu perintah, selaras compose).

Ubuntu: jalur native tanpa Docker **tidak** dibakukan — pakai Docker Engine.

---

## Firewall

**Windows:**

```powershell
New-NetFirewallRule -DisplayName "Monitoring Pemasaran 8000" `
  -Direction Inbound -Protocol TCP -LocalPort 8000 -Action Allow
```

**Ubuntu:**

```bash
sudo ufw allow 8000/tcp comment 'Monitoring Pemasaran'
sudo ufw enable
```

---

## Superman

```env
SUPERMAN_DEFAULT_EXECUTOR=server
```

Login session di PC server. Tidak perlu agent di tiap laptop untuk mode ini.

---

## Checklist lepas Railway

Gunakan checklist resmi di [DEPLOY_GUIDE.md Phase 7](./DEPLOY_GUIDE.md#phase-7--backup-db-harian--cutover-railway).

Ringkas:

1. [ ] Health + login OK di PC  
2. [ ] Data migrasi OK  
3. [ ] Tunnel HTTPS OK (jika butuh luar)  
4. [ ] Backup DB jalan  
5. [ ] User setuju → stop Railway  

---

## Script helper

| Script | Fungsi |
|--------|--------|
| `scripts/office/setup_env.ps1` | Buat `.env` |
| `scripts/office/import_sql.ps1` | Restore dump Railway |
| `scripts/office/ensure_up.ps1` | Up setelah reboot |
| `scripts/office/backup_db.ps1` | Backup harian |
| `scripts/office/auto_deploy.ps1` | Auto git pull + rebuild |

---

## FAQ

**Q: Akses dari luar kantor?**  
A: Cloudflare Tunnel — lihat DEPLOY_GUIDE Phase 4.

**Q: PC harus nyala?**  
A: Ya, 24 jam; sleep/hibernate off (Phase 0).

**Q: Beda dengan Contabo VPS?**  
A: PC kantor = LAN bagus + Superman lebih stabil; Contabo = online tanpa PC. Keputusan product: PC + tunnel.
