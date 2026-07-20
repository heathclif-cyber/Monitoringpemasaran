# scripts/office — helper deploy PC kantor

Digunakan oleh playbook **[DEPLOY_GUIDE.md](../../DEPLOY_GUIDE.md)** (AI agent / manual).

| Script | Fungsi |
|--------|--------|
| `setup_env.ps1` | Generate `.env` (Postgres + SECRET_KEY + Superman) |
| `import_sql.ps1` | Restore `backup_db.sql` ke container `db` |
| `ensure_up.ps1` | `docker compose up -d` setelah boot |
| `auto_deploy.ps1` | `git pull` + rebuild jika ada update |
| `backup_db.ps1` | Dump Postgres ke `D:\Backup\MonitoringPemasaran` |

Jalankan dari root repo atau dengan path penuh; semua script resolve root = 3 level di atas file ini (`Monitoringpemasaran/`).
