# scripts/office — helper deploy PC kantor

## Windows (PowerShell)

Digunakan oleh playbook **[MIGRATE_RAILWAY_TO_OFFICE.md](../../docs/deployment/MIGRATE_RAILWAY_TO_OFFICE.md)** dan **[DEPLOY_GUIDE.md](../../docs/deployment/DEPLOY_GUIDE.md)**.

| Script | Fungsi |
|--------|--------|
| `setup_env.ps1` | Generate `.env` (Postgres + SECRET_KEY + Superman) |
| `import_sql.ps1` | Restore `backup_db.sql` ke container `db` |
| `ensure_up.ps1` | `docker compose up -d` setelah boot |
| `auto_deploy.ps1` | `git pull` + rebuild jika ada update |
| `backup_db.ps1` | Dump Postgres ke `D:\Backup\MonitoringPemasaran` |

Jalankan dari root repo atau dengan path penuh; semua script resolve root = 3 level di atas file ini (`Monitoringpemasaran/`).

## Ubuntu Desktop 24.04

**Jangan** menjalankan `*.ps1` di bash.  
Playbook: **[MIGRATE_RAILWAY_TO_UBUNTU.md](../../docs/deployment/MIGRATE_RAILWAY_TO_UBUNTU.md)**  
(perintah bash + `docker compose`; script `auto_deploy.sh` / `backup_db.sh` dibuat di Phase 6–7 playbook itu).

| OS | Runtime | Env template |
|----|---------|--------------|
| Windows | Docker Desktop | `.env.office.example` → `.env` |
| Ubuntu 24.04 Desktop | Docker Engine | `.env.office.example` → `.env` (sama) |
