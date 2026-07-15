# agent.md — Panduan AI Agent (hemat token)

> **Baca file ini dulu.** Jangan baca seluruh repo. CLAUDE.md = detail lengkap (baca hanya jika perlu). bug.md = log bug (baca **ringkasan status** + 1 entri BUG saja).

---

## 1. Routing cepat (task → baca apa)

| Task user | Baca (urutan) | Jangan baca dulu |
|-----------|---------------|------------------|
| Superman gagal / macet / partial | `bug.md` ringkasan + BUG-005/009/012 | Seluruh `filler.py` |
| Superman 502 di 0% | BUG-012 + `runner.py` `start_deklarasi_job` | Netprobe, WAF |
| Pembayaran ditolak / PPh | BUG-001, BUG-002 + `pembayaran_utils.py` | Superman |
| Captcha / login Superman | `sync_executor.py`, `captcha_challenge.py` | `runner.py` penuh |
| Fitur UI baru | `CLAUDE.md` konvensi frontend + 1 page terkait | Backend |
| Agent lokal Superman (Playwright di PC user, app di Railway) | [SUPERMAN_AGENT.md](./SUPERMAN_AGENT.md) + `scripts/superman_agent.py watch` — job terikat `user_id` | Server Railway Playwright |
| Deploy Railway | `DEPLOY_GUIDE.md` fase yang diminta saja | — |
| Deploy server Windows kantor | `DEPLOY_GUIDE.md` Phase 1–7 | Railway |

**Aturan emas:** 1 task = maks **3–5 file** dibuka. Pakai `Grep` / `Read` dengan `offset`+`limit`, bukan baca file utuh.

---

## 2. Peta file (satu baris = cukup)

### Backend — entry & API
| File | Isi |
|------|-----|
| `main.py` | Router mount, middleware tamu |
| `api/r_superman.py` | Endpoint Superman (+ mapping error HTTP) |
| `api/r_pembayaran.py` | CRUD pembayaran, doc-requirements |
| `api/r_invoice.py` | Invoice CRUD |
| `models.py` | ORM — cari class dulu via Grep |
| `schemas.py` | Pydantic — jangan ubah response tanpa diskusi |

### Superman (otomatisasi Playwright)
| File | Isi |
|------|-----|
| `services/superman/runner.py` | Job deklarasi, preview, recover, **start_deklarasi_job** |
| `services/superman/filler.py` | Isi form, upload, simpan `/spp/store` — **file besar, Grep saja** |
| `services/superman/progress.py` | Job state + `superman_jobs.json` di volume |
| `services/superman/auth.py` | Session, `ensure_session`, `open_authenticated_context` |
| `services/superman/sync_executor.py` | **Wajib** untuk Playwright dari HTTP (hindari asyncio 500) |
| `services/superman/captcha_challenge.py` | Flow captcha login |
| `services/superman/payload.py` | Invoice → data form Superman |
| `services/superman/preflight.py` | `validate_deklarasi_ready` |
| `services/superman/persist.py` | Simpan nomor SPP ke DB |

### Frontend (React)
| File | Isi |
|------|-----|
| `frontend/src/types/index.ts` | **Semua** interface TS |
| `frontend/src/pages/PembayaranPage.tsx` | Input pembayaran + tombol Superman |
| `frontend/src/components/common/SupermanDeklarasiButton.tsx` | Dialog progress deklarasi |
| `frontend/src/utils/supermanUtils.ts` | Poll job, retry 502/503 |
| `frontend/src/lib/client.ts` | API client + pesan error |

### Script debug (jalankan, jangan rewrite)
| Script | Pakai untuk |
|--------|-------------|
| `scripts/superman_agent.py watch` | **Agent lokal** — Playwright di PC, job dari Railway |
| `scripts/test_superman_0353.py` | E2E deklarasi production (ganti `NO_INV`) |
| `scripts/test_superman_26035.py` | Template sama, invoice lain |

---

## 3. Konstanta production (jangan Grep ulang)

```
URL:     https://monitoringpemasaran-production.up.railway.app
Volume:  /data  (mount Railway)
Sesi:    SUPERMAN_STATE_PATH=/data/.superman_state.json
Upload:  UPLOAD_DIR=/data/uploads
Jobs:    /data/superman_jobs.json
Region:  asia-southeast1 (Singapore)
```

Login app: `POST /api/auth/login` → Bearer token untuk semua `/api/*`.

---

## 4. Gejala error → arti (tanpa baca log panjang)

| Gejala UI / API | Bukan ini | Kemungkinan penyebab |
|-----------------|-----------|----------------------|
| **502, progress 0%** | Gagal upload Superman | `deklarasi/start` hang/timeout — cek `runner.py` start, restart Railway, hapus `superman_jobs.json` jika stuck |
| **428** + captcha | Bug form | Sesi Superman habis — login captcha |
| **409** duplikat | Error jaringan | Invoice sudah punya nomor SPP — cek `invoice.superman` |
| **88–94% lama lalu gagal** | Isian salah | `NS_BINDING_ABORTED` / ALPN di `/spp/store` — intermittent Railway (BUG-009/012) |
| **Job tidak ditemukan** | Bug kode | Redeploy saat job jalan (BUG-006) atau job kedaluwarsa |
| **2/3 file upload** | Jaringan | Dokumen bukan PDF (BUG-011) |

---

## 5. Pola hemat token untuk Composer / Claude

### Lakukan
- `Grep "fungsi"` di folder spesifik (`services/superman/`) sebelum `Read`
- `Read` dengan `offset`+`limit` (50–80 baris sekitar match)
- Satu pertanyaan user = satu hipotesis = satu batch tool call paralel
- Verifikasi production via **1 script** atau 2–3 `curl`/PowerShell, bukan eksplorasi dashboard
- Setelah investigasi bug Superman/pembayaran: update **1 entri** di `bug.md`, bukan dokumen baru
- Untuk fix: ubah **hanya** file di tabel routing §2

### Jangan
- Baca `filler.py` / `runner.py` utuh (~1000+ baris)
- Baca `bug.md` utuh (~300 baris) — cukup ringkasan + 1 BUG
- Baca `CLAUDE.md` utuh jika task sudah jelas dari agent.md
- `railway variables --json` (cetak secret ke transcript)
- Redeploy/restart production tanpa konfirmasi user
- Jalankan 2 deklarasi Superman paralel di Railway
- Ulangi netprobe/WAF jika BUG-012 sudah menyingkirkan hipotesis itu

### Ukuran respons
- Jawaban user: ringkas, tabel jika membandingkan
- Code citation: `startLine:endLine:path` — potong bagian tidak relevan dengan `...`
- Jangan ulang isi CLAUDE.md ke chat

---

## 6. API Superman — urutan debug (copy-paste)

```http
POST /api/auth/login
GET  /api/superman/status
GET  /api/superman/doc-requirements?no_invoice={URL_ENCODED}
GET  /api/superman/preview?no_invoice={URL_ENCODED}
POST /api/superman/deklarasi/start?no_invoice={URL_ENCODED}
GET  /api/superman/deklarasi/progress?job_id={uuid}
POST /api/superman/recover?no_invoice={URL_ENCODED}   # jika partial
```

**Progress normal:** 25% → 45–82% isi → 88–94% simpan (1–3 menit) → 95% To Do → 100%

**Invoice di URL:** encode `/` → `%2F` (contoh `0757%2FHO-SUPCO%2F...`).

---

## 7. Grep siap pakai

```bash
# Cari simbol di area Superman
rg "def start_deklarasi" services/superman/
rg "NS_BINDING|spp/store|ensure_session" services/superman/
rg "502|428|409" api/r_superman.py frontend/src/

# Cari BUG terkait
rg "BUG-00[59]|BUG-012" bug.md
```

---

## 8. Aturan agent (tetap berlaku)

1. **Jangan ubah format API** request/response tanpa diskusi.
2. **Jangan redeploy/restart** production hanya untuk observasi — pakai API/log dulu.
3. Redeploy **memutus** job Superman aktif (BUG-006).
4. Setelah fix bug: update `bug.md` (status + commit).
5. Playwright dari HTTP **harus** lewat `sync_executor` atau thread terpisah.
6. `deklarasi/start` **tidak** boleh blokir Playwright — validasi sesi di thread job (`bd4b736`).

---

## 9. Dokumen panjang — kapan dibuka

| File | Kapan |
|------|-------|
| [CLAUDE.md](./CLAUDE.md) | Konvensi kode, struktur direktori, bisnis logic kontrak/invoice |
| [bug.md](./bug.md) | Detail root cause historis — 1 BUG per sesi |
| [DEPLOY_GUIDE.md](./DEPLOY_GUIDE.md) | Setup Windows server / migrasi DB |
| [ANALYSIS_MULTI_INVOICE.md](./ANALYSIS_MULTI_INVOICE.md) | Multi-invoice per kontrak |

---

## 10. Changelog agent.md

| Tanggal | Perubahan |
|---------|-----------|
| 2026-07-07 | Rewrite fokus hemat token; perbaiki session path `/data/`; tambah BUG-012, 502@0%, sync_executor |

*Maintainer: update §4 dan §10 saat ada pola error baru; detail teknis tetap di bug.md.*