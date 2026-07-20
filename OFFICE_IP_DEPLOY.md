# Deploy PC Kantor — ringkasan cepat

> **Playbook lengkap (AI agent / VS Code):** lihat **[DEPLOY_GUIDE.md](./DEPLOY_GUIDE.md)**  
> Isi: Phase 0–8, Cloudflare Tunnel (internet luar), migrasi Railway, backup, cutover, script `scripts/office/*`.

---

## Target

| Mode | URL | Dokumen |
|------|-----|---------|
| **LAN saja** | `http://192.168.x.x:8000` | Bagian singkat di bawah |
| **LAN + internet** | `https://monitoring.domain.com` | **Wajib** ikuti [DEPLOY_GUIDE.md](./DEPLOY_GUIDE.md) Phase 0–4 |

Stack: PC Windows **24 jam** + Docker (`docker-compose.yml`) + Postgres lokal.  
**Lepas Railway** setelah cutover (checklist di DEPLOY_GUIDE Phase 7).

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

IP LAN:

```powershell
Get-NetIPAddress -AddressFamily IPv4 | Where-Object { $_.IPAddress -notlike '127.*' }
```

Rekan di Wi‑Fi yang sama: `http://<IP-PC>:8000`

---

## Internet luar

Tidak cukup IP LAN. Pasang **Cloudflare Tunnel** (gratis) — langkah lengkap:

→ [DEPLOY_GUIDE.md Phase 4](./DEPLOY_GUIDE.md#phase-4--cloudflare-tunnel-akses-internet)

Butuh domain di akun Cloudflare untuk URL permanen. Tanpa domain: quick tunnel (sementara saja).

---

## Opsi native Windows (tanpa Docker)

Hanya jika Docker tidak tersedia. Lihat `scripts/start_office_server.ps1` + Postgres Windows.  
Untuk production kantor + tunnel, **Docker tetap disarankan** (satu perintah, selaras compose).

---

## Firewall

```powershell
New-NetFirewallRule -DisplayName "Monitoring Pemasaran 8000" `
  -Direction Inbound -Protocol TCP -LocalPort 8000 -Action Allow
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
