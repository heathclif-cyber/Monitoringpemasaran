# Monitoring Pemasaran - PTPN I
Sales Document Automation & Reporting System.

## Configuration
This project is configured for deployment on Railway (connected via GitHub).
Database: **Railway PostgreSQL** (no SQLite fallback).
`DATABASE_URL` wajib diset di `.env` atau environment variable.
Driver: auto-detect `psycopg2` → `psycopg` (v3).

Environment variables needed:
- `DATABASE_URL` (wajib — Railway PostgreSQL connection URL)
- `SECRET_KEY` (opsional)
