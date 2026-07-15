# Deploy PC Kantor — URL IP, **gratis total**

Target: lepas Railway. User buka app dari **device masing-masing** lewat **IP PC server**.

```
http://192.168.x.x:8000
```

Tidak pakai: Railway, domain berbayar, Cloudflare berbayar, VPS berbayar.

---

## Arsitektur

| Komponen | Di mana |
|----------|---------|
| App (FastAPI + React dist) | PC kantor 24 jam |
| PostgreSQL | PC kantor (Docker **atau** Postgres Windows) |
| Playwright / Superman | PC kantor (jaringan kantor) |
| Browser user | Laptop/HP masing-masing di **Wi‑Fi/LAN yang sama** |

Batasan gratis IP LAN:

- Hanya device **satu jaringan** (Wi‑Fi kantor) yang bisa akses.
- Dari rumah / internet luar **tidak** bisa tanpa tunnel gratis terpisah (opsional nanti).

---

## Opsi A — Docker (disarankan jika Docker Desktop terpasang)

Docker Desktop **gratis** untuk penggunaan kecil/kantor non-enterprise besar.

```powershell
cd D:\Apps-Dev\Monitoringpemasaran

# 1) Password DB lokal
copy .env.office.example .env.office
# edit POSTGRES_PASSWORD + SECRET_KEY + SUPERMAN_*

# 2) Build & jalan
docker compose --env-file .env.office up -d --build

# 3) Cek
docker compose ps
# Buka di PC: http://localhost:8000
# Dari laptop lain: http://<IP-PC>:8000
```

Cek IP PC:

```powershell
Get-NetIPAddress -AddressFamily IPv4 | Where-Object { $_.IPAddress -notlike '127.*' }
```

---

## Opsi B — Native Windows (tanpa Docker)

### 1. PostgreSQL lokal (gratis)

- Install [PostgreSQL Windows](https://www.postgresql.org/download/windows/) atau `winget install PostgreSQL.PostgreSQL.16`
- Buat DB + user, contoh:

```sql
CREATE USER ptpn WITH PASSWORD 'PtpnKantor_Local_ChangeMe';
CREATE DATABASE monitoringpemasaran OWNER ptpn;
```

### 2. .env (bukan Railway)

```env
DATABASE_URL=postgresql://ptpn:PtpnKantor_Local_ChangeMe@127.0.0.1:5432/monitoringpemasaran
SECRET_KEY=ganti-secret-panjang
RUN_DB_MIGRATE=true
SUPERMAN_USER=...
SUPERMAN_PASSWORD=...
SUPERMAN_DEFAULT_EXECUTOR=server
```

### 3. Dependensi + frontend

```powershell
cd D:\Apps-Dev\Monitoringpemasaran
pip install -r requirements.txt
playwright install chromium
powershell -File scripts\build_office_frontend.ps1
```

### 4. Migrasi data dari Railway (sekali)

Butuh `pg_dump` / `psql` (ikut install Postgres) dan URL Railway lama:

```powershell
# Export (di PC yang bisa jangkau Railway)
pg_dump "postgresql://..." --no-owner --no-acl -n public -f backup_db.sql

# Import ke lokal
psql "postgresql://ptpn:PtpnKantor_Local_ChangeMe@127.0.0.1:5432/monitoringpemasaran" -f backup_db.sql
```

### 5. Jalankan server

```powershell
powershell -File scripts\start_office_server.ps1
```

Akses:

- Di server: `http://localhost:8000`
- Di laptop lain (LAN): `http://192.168.xxx.xxx:8000`

### 6. Autostart (gratis)

Task Scheduler → Create Task → At logon / at startup →  
Action: `powershell.exe -File D:\Apps-Dev\Monitoringpemasaran\scripts\start_office_server.ps1`

Power options: **Never sleep**.

---

## Firewall Windows

Buka port **8000** inbound (script start mencoba menambah rule). Manual:

```powershell
New-NetFirewallRule -DisplayName "Monitoring Pemasaran 8000" `
  -Direction Inbound -Protocol TCP -LocalPort 8000 -Action Allow
```

---

## Superman

Setelah app di PC kantor, biarkan:

```env
SUPERMAN_DEFAULT_EXECUTOR=server
```

Tidak perlu agent di tiap laptop. Login session Superman di PC server sekali (`scripts/superman_login.py` jika captcha).

---

## Checklist lepas Railway

1. [ ] Postgres lokal jalan + data di-import  
2. [ ] `.env` `DATABASE_URL` sudah lokal  
3. [ ] App listen `0.0.0.0:8000`  
4. [ ] Laptop lain buka `http://IP:8000` OK  
5. [ ] Login app + dashboard OK  
6. [ ] Superman test 1 invoice OK  
7. [ ] Autostart + never sleep  
8. [ ] Matikan / hapus project Railway (setelah yakin)  

---

## FAQ

**Q: Bisa URL cantik tanpa bayar?**  
A: IP LAN sudah cukup. Domain custom biasanya berbayar. Subdomain gratis (mis. freenom) tidak stabil.

**Q: Akses dari luar kantor gratis?**  
A: Butuh tunnel (Cloudflare Tunnel **gratis** + domain, atau Tailscale **gratis**). Bukan pure IP host publik tanpa risiko.

**Q: IP berubah tiap restart Wi‑Fi?**  
A: Set IP statis di router untuk PC server, atau cek IP lagi dengan perintah di atas.
