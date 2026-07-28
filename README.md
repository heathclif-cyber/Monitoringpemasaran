# Monitoring Pemasaran — PTPN I

Sistem otomatisasi dokumen penjualan dan pelaporan.

## Struktur proyek

- `main.py`, `database.py`, `models.py`, dan `schemas.py`: entry point serta modul inti backend.
- `api/`, `endpoints/`, dan `services/`: router serta logika aplikasi backend.
- `frontend/`: aplikasi React/Vite.
- `templates/` dan `static/`: fallback antarmuka server-rendered serta asetnya.
- `scripts/`: skrip data, diagnosa, migrasi, deployment, dan arsip skrip satu-kali-pakai. Lihat [panduan skrip](scripts/README.md).
- `docs/`: dokumentasi arsitektur, deployment, operasi, dan catatan. Lihat [indeks dokumentasi](docs/README.md).

## Konfigurasi

Deploy utama memakai Railway dan PostgreSQL. `DATABASE_URL` wajib diset di `.env` atau environment variable; `SECRET_KEY` bersifat opsional. Driver PostgreSQL dipilih otomatis (`psycopg2`, lalu `psycopg` v3).
