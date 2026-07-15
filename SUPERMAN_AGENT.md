# Superman Local Agent — Railway + device user

Aplikasi **tetap di Railway**. Playwright (isi form Superman) dijalankan di **PC/device user yang login**, lewat agent desktop.

```
[Browser user]  →  Railway (UI + API + DB)
                        │
                        │  job milik user_id Anda
                        ▼
              [Agent di PC Anda]  →  Playwright → portal Superman
```

## Aturan penting

| Aturan | Arti |
|--------|------|
| Agent = user login | Heartbeat & claim pakai token user app yang sama |
| Job terikat `user_id` | Agent Budi **tidak** bisa ambil job Ani |
| Multi-device | Jalankan `watch` di PC yang sedang dipakai; matikan agent di PC lama |
| Railway | Host app saja; **bukan** default runner Playwright jika agent online |

## Setup sekali per device user

1. Python 3.12 + clone/copy repo (atau folder minimal: `scripts/`, `services/`, `requirements.txt`, `.env` dengan `DATABASE_URL` production).
2. Install:

```powershell
cd D:\Apps-Dev\Monitoringpemasaran
pip install -r requirements.txt
playwright install chromium
```

3. `.env` di PC user (sama DB Railway agar payload invoice bisa dibangun):

```env
DATABASE_URL=postgresql://...   # URL Railway Postgres (sama production)
SUPERMAN_USER=...
SUPERMAN_PASSWORD=...
SUPERMAN_HEADLESS=false
```

4. Login session Superman di PC itu (jika captcha):

```powershell
python scripts\superman_login.py --manual
```

## Menjalankan agent (setiap kali kerja / autostart)

Pakai **username/password app Monitoring** yang sama dengan login web:

```powershell
python scripts\superman_agent.py watch `
  --api https://monitoringpemasaran-production.up.railway.app `
  --username NAMA_USER_APP `
  --password ****
```

Biarkan jendela ini **tetap terbuka** saat klik “Buat SPPn Superman” di web.

Cek status:

```powershell
python scripts\superman_agent.py status `
  --api https://monitoringpemasaran-production.up.railway.app `
  --username NAMA_USER_APP --password ****
```

## Alur kerja harian

1. Buka web Railway di browser (device mana pun di jaringan).
2. Pastikan agent `watch` jalan di **PC Anda** (login user yang sama).
3. Klik **Buat SPPn Superman** di web.
4. UI: “Menunggu agent lokal…” → progress naik di dialog → nomor SPP tersimpan.

Jika agent offline → fallback ke Railway (sering gagal di `/spp/store`); jalankan agent dulu.

## Keamanan

- Token Bearer = user staff/admin (bukan secret global).
- Claim hanya job dengan `user_id` sama.
- Progress/complete ditolak jika job milik user lain (kecuali admin).

## API (ringkas)

| Method | Path | Fungsi |
|--------|------|--------|
| GET | `/api/superman/agent/status` | Agent **Anda** online? |
| POST | `/api/superman/agent/heartbeat` | Daftarkan agent + `user_id` |
| POST | `/api/superman/agent/claim` | Ambil job milik Anda |
| POST | `/api/superman/agent/progress` | Update % |
| POST | `/api/superman/agent/complete` | Selesai + simpan SPP |
| POST | `/api/superman/deklarasi/start?executor=auto\|agent\|server` | Buat job |

## Ganti device

1. Stop agent di PC lama (`Ctrl+C`).
2. Di PC baru: setup + `watch` dengan user yang sama.
3. Klik Superman di web → job ke agent PC baru.

Tidak perlu ubah Railway URL.

## Troubleshooting

| Gejala | Cek |
|--------|-----|
| Stuck “Menunggu agent” | `watch` belum jalan / username beda dengan web |
| Claim kosong terus | Token agent beda user dari yang klik web |
| Gagal dokumen | Upload PDF di app; unduh lewat `/api/documents/download/...` |
| Captcha Superman | `superman_login.py --manual` di PC agent |
| DATABASE_URL error | Agent butuh URL Postgres production di `.env` |
