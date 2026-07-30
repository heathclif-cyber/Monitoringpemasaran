# Superman Local Agent — LEGACY (tidak disarankan)

> **Jalur utama sekarang: PC kantor murni (Docker), tanpa multi-agent.**  
> Baca: **[`docs/deployment/KANTOR_MURNI.md`](../deployment/KANTOR_MURNI.md)**  
> Staf hanya buka browser; Superman + captcha di server PC kantor.

---

## Di bawah ini: dokumentasi agent desktop (legacy / darurat Railway)

Aplikasi di Railway. Playwright dijalankan di PC lewat agent desktop — **hanya jika belum pindah ke PC kantor**.

```
[Browser user]  →  Railway (UI + API + DB)
                        │
                        │  job milik user_id Anda
                        ▼
              [Agent di PC Anda]  →  Playwright → portal Superman
```

## Aturan penting (multi-user / multi-device)

| Aturan | Arti |
|--------|------|
| Agent = user login | Heartbeat & claim pakai token user app yang sama dengan browser web |
| Job terikat `user_id` | Agent Budi **tidak** bisa ambil job Ani — aman multi-user |
| Multi-device | Tiap user jalankan `watch` di PC-nya sendiri (paralel OK) |
| Satu user, banyak PC | Hanya 1 agent aktif per user; matikan agent di PC lama |
| Session Superman | Per-PC di file lokal (`.superman_state.json`); captcha di PC agent |
| Railway | Host app + antrean job; Playwright default di PC agent jika online |

**Contoh 3 user:** Budi, Ani, Citra masing-masing buka `Mulai-Superman-Agent.bat`, login user app sendiri, biarkan jendela terbuka. Di web, masing-masing login user yang sama lalu klik Buat Deklarasi — job hanya jatuh ke agent user itu.

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
python scripts\superman\commands\login.py --manual
```

## Menjalankan agent (setiap kali kerja / autostart)

Pakai **username/password app Monitoring** yang sama dengan login web:

```powershell
python scripts\superman\commands\agent.py watch `
  --api https://monitoringpemasaran-production.up.railway.app `
  --username NAMA_USER_APP `
  --password ****
```

Biarkan jendela ini **tetap terbuka** saat klik “Buat SPPn Superman” di web.

Cek status:

```powershell
python scripts\superman\commands\agent.py status `
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
| Captcha Superman | Agent auto-OCR dulu; jika gagal buka browser. Atau: `commands/login.py --manual` |
| DATABASE_URL error | Agent butuh URL Postgres production di `.env` |
| Job user A di agent user B | Normal tidak terjadi (filter `user_id`). Cek login web vs agent sama |
| Beberapa agent 1 user | Claim race: satu agent menang; matikan agent di device yang tidak dipakai |

## Verifikasi uji (2026-07-30)

Invoice `R08D-RO/INV/2026.07.29-1` (CV Melolo Indah, Rp 180jt) via agent lokal:

1. Heartbeat + claim + unduh 3 dokumen ✓  
2. Playwright di PC (session captcha lokal) ✓  
3. Draft SPPn tersimpan: **R8/R08D/SPPn/83/VII/2026** ✓  
4. Field `superman` di invoice ter-update ✓
