# scripts/office

Script lokal PC kantor Ubuntu (dibuat saat migrasi). Jangan commit `.env`.

| File | Fungsi |
|------|--------|
| `bootstrap_ubuntu.sh` | Phase 0–1: anti-sleep, Docker Engine, cloudflared (sudo) |
| `auto_deploy.sh` | Cron tiap 15 menit: `git pull` + `docker compose up -d --build` |
| `backup_db.sh` | Cron 02:00: dump Postgres ke `~/Backup/MonitoringPemasaran/` |

Playbook: [docs/deployment/MIGRATE_RAILWAY_TO_UBUNTU.md](../../docs/deployment/MIGRATE_RAILWAY_TO_UBUNTU.md)
