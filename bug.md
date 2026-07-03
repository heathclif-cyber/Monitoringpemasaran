# Bug Log — Monitoring Pemasaran

Daftar bug yang ditemukan saat development/operasional. **Agent:** baca file ini sebelum debug Superman atau Input Pembayaran — lihat juga [agent.md](./agent.md).

**Terakhir diperbarui:** 2026-07-03

---

## Ringkasan status

| ID | Area | Severity | Status |
|----|------|----------|--------|
| [BUG-001](#bug-001-pembayaran-pph--validasi-sisa-menyesatkan) | Pembayaran | High | Fixed |
| [BUG-002](#bug-002-pembayaran--kelebihan-transfer-tidak-tercatat) | Pembayaran | Medium | Fixed |
| [BUG-003](#bug-003-superman--upload-detection-bootstrap-fileinput) | Superman | High | Fixed |
| [BUG-004](#bug-004-superman--jquery-change-invalidstateerror) | Superman | High | Fixed |
| [BUG-005](#bug-005-superman--simpan-draft-macet-di-8895) | Superman | Critical | Mitigated |
| [BUG-006](#bug-006-superman--job-hilang-saat-railway-redeploy) | Superman | High | Fixed (deploy pending) |
| [BUG-007](#bug-007-superman--todo-matching-salah-prioritas-referensi) | Superman | High | Fixed |
| [BUG-008](#bug-008-ui-pembayaran--progress--teks-misleading) | Frontend | Low | Fixed (deploy pending) |
| [BUG-009](#bug-009-superman--store_body-null--recover-gagal) | Superman | Critical | Mitigated (root cause ketemu 2026-07-03 sore) |

---

## BUG-001: Pembayaran PPh — validasi sisa menyesatkan

**Gejala:** User isi nominal transfer = sisa invoice (mis. `474.276.907`) → error *"Nominal melebihi sisa invoice. Sisa tersedia: Rp 474.276.907"*.

**Penyebab:** Backend menghitung pelunasan = `nominal_transfer + PPh dipotong pembeli`, tapi UI menampilkan **sisa pelunasan penuh** sebagai batas transfer.

**Contoh (invoice 0353, PPh 0,25%):**
- Transfer `474.276.907` → pelunasan efektif `475.347.509` → ditolak
- Transfer pas-pasan lunas: **`473.208.716`**

**File:** `api/r_pembayaran.py`, `services/pembayaran_utils.py`, `frontend/src/pages/PembayaranPage.tsx`

**Fix:** `dc1a7a5` — tampilkan *Maks. transfer* / *Transfer pas-pasan lunas*

---

## BUG-002: Pembayaran — kelebihan transfer tidak tercatat

**Gejala:** User tidak bisa menyimpan pembayaran yang melebihi kewajiban; tidak ada indikator kelebihan.

**Penyebab:** Validasi hard-block `existing + incoming > invoice_total`.

**Fix:** `aceaad2` — izinkan simpan, `selisih` negatif = kelebihan, UI tampilkan **Kelebihan** + peringatan.

**File:** `api/r_pembayaran.py`, `services/pembayaran_utils.py`, `frontend/src/utils/pembayaranUtils.ts`, `frontend/src/pages/PembayaranPage.tsx`

---

## BUG-003: Superman — upload detection bootstrap-fileinput

**Gejala:** Upload dokumen terlihat OK di UI app, tapi Superman gagal simpan / `sppn_files == 0`.

**Penyebab:** `_count_uploaded_docs` memakai selector `#list_dokumen_pendukung_sppn li`; Superman pakai **kartik bootstrap-fileinput** (`.file-preview-frame`).

**Fix:** `622097b` — deteksi via `input.files.length` + `.file-preview-thumbnails .file-preview-frame`

**File:** `services/superman/filler.py`

---

## BUG-004: Superman — jQuery change InvalidStateError

**Gejala:** Gagal di tahap simpan; console/Playwright: `InvalidStateError` saat trigger `change` pada file input.

**Penyebab:** Handler Superman memanggil `$('#dokumen_pendukung_sppn').val(...)` setelah `set_input_files`.

**Fix:** `e36cdff` — hapus trigger `change` jQuery setelah upload.

**File:** `services/superman/filler.py`

---

## BUG-005: Superman — simpan draft macet di 88–95%

**Gejala:** Progress berhenti lama di **88–89%** (*"Menyimpan draft"* / *"Menunggu cek urutan nomor Superman..."*), bisa 2–7 menit.

**Penyebab (berlapis):**
1. Klik `#simpan` → `simpan_spp()` → Swal loading *"Mengecek urutan..."* → dialog anomali → *Simpan Saja* → POST `/spp/store`
2. Headless Playwright tidak selalu menyelesaikan dialog; `expect_response` timeout
3. Progress tidak di-update selama menunggu dialog
4. Fallback `form.submit()` sering dapat `store_body: null`

**Mitigasi:** `547c11a`, `ee328c9` — auto-klik Swal, kirim form langsung dulu, heartbeat detik di progress

**File:** `services/superman/filler.py`

**Sisa risiko:** Masih bisa partial (`ok: false`, nomor tidak ke DB) — lihat [BUG-009](#bug-009-superman--store_body-null--recover-gagal)

---

## BUG-006: Superman — job hilang saat Railway redeploy

**Gejala:** Dialog gagal di ~95%: *"Job deklarasi tidak ditemukan atau sudah kedaluwarsa"*; toast yang sama.

**Penyebab:** Job deklarasi disimpan **in-memory** (`services/superman/progress.py`). Setiap `git push` → Railway redeploy → proses mati → `job_id` invalid.

**Fix:** `5236f7c` — persist job ke `superman_jobs.json` di volume `/app/data`; job `running` saat restart ditandai `failed` dengan pesan jelas; tombol **Coba Lagi** di dialog.

**File:** `services/superman/progress.py`, `frontend/src/utils/supermanUtils.ts`, `frontend/src/components/common/SupermanProgressDialog.tsx`

**Catatan deploy:** Commit mungkin belum di-push jika DNS GitHub gagal — verifikasi di production.

---

## BUG-007: Superman — To Do matching salah prioritas referensi

**Gejala:** Deklarasi selesai partial; `todo_top: []`, recover gagal padahal draft mungkin ada di To Do.

**Penyebab:**
1. `_score_todo_row` memprioritaskan `no_pembayaran` (`PAY-ADD-TENDER-...`) bukan `referensi` / `no_invoice` yang diisi di form Superman
2. Gate tanggal: jika tanggal tidak match dan skor &lt; 800 → skor dipaksa **0**, meski kontrak+nominal cocok

**Fix:** `edcab3c` — `_collect_todo_match_refs()`, prioritas referensi/invoice, gate tanggal tidak menolak match kontrak kuat

**File:** `services/superman/runner.py`

---

## BUG-008: UI Pembayaran — progress & teks misleading

**Gejala:**
- *"0% terbayar saat ini"* padahal invoice sudah lunas
- Teks *"Catat pembayaran dulu"* muncul saat status *"Menunggu Superman"*

**Penyebab:**
- `progressPct` memakai `existingTotal` (exclude termin yang sedang diedit) bukan `paidTotalAll`
- Subtitle pembayaran tidak cek `isInvoiceFullyPaid`

**Fix:** `5236f7c`

**File:** `frontend/src/pages/PembayaranPage.tsx`

---

## BUG-009: Superman — store_body null & recover gagal

**Gejala:** Job `completed` + `partial: true`; invoice tetap *"Menunggu Superman"*; Pulihkan dari To Do gagal; `todo_top: []`, `new_todo_ids: []`.

**Invoice terdampak (contoh):** `ADD-TENDER/0353/...`, `ADD-TENDER/0354/...` (form `sppb_sppn` + PPh)

**Root cause ketemu (2026-07-03 sore):** Tombol `#simpan` ada di dalam `<form id="form_spp">` — klik tombol memicu **native form submit** (navigasi halaman penuh) ke `/spp/check-urutan-anomaly` **selain** AJAX `simpan_spp()`. Karena cek urutan di server Superman kadang lambat, navigasi native ini timeout → browser menampilkan `chrome-error://chromewebdata/` → `form_spp` hilang dari halaman → draft SPPb/SPPn gagal total, tidak pernah sampai POST `/spp/store`.

Fix ini sempat dibuat (`9a0f807`, submit-guard `preventDefault`/`stopPropagation` pada event `submit`), **tapi ter-revert tanpa sengaja** oleh commit berikutnya (`50515e4`) yang menambahkan fallback fetch. Akibatnya bug kembali muncul di run E2E siang itu (`page_url: "chrome-error://chromewebdata/"`, `store_body_preview: null`).

**Fix final (2026-07-03 sore, terverifikasi live run invoice 0353):**
- `7acf96b` — kembalikan submit-guard anti-navigasi + `page.go_back()` best-effort saat chrome-error terdeteksi. **Terverifikasi:** run setelah deploy ini tidak lagi macet di chrome-error; dialog "Mengecek urutan..." akhirnya bisa resolve ke dialog hasil ("Info Urutan Nomor", nomor SPPb/SPPn ditampilkan) alih-alih macet selamanya.
- `951b287` — gagal cepat (90 detik) kalau dialog "Mengecek urutan..." belum selesai, dengan pesan error jelas. **Catatan operasional dari user:** deklarasi normal selesai **< 1 menit**; kalau > 2 menit itu **sudah pasti** ada gangguan di sisi Superman — jadi sistem tidak lagi menunggu 5-10 menit sebelum menyerah, cukup 90 detik.

**Sisa risiko:** Penyebab cek-urutan lambat di sisi Superman (server pihak ketiga) sendiri belum diketahui — apakah karena beban server, atau ada draft/anomali nyangkut dari percobaan gagal sebelumnya untuk kontrak yang sama. Kalau fail-fast 90s sering ke-trigger, cek manual portal Superman untuk draft SPPb/SPPn duplikat/nyangkut terkait kontrak yang gagal.

**Langkah debug agent:**
```bash
# Production (perlu token admin)
GET /api/superman/todo-inspect?no_invoice=ADD-TENDER/0353/...
POST /api/superman/recover?no_invoice=...
POST /api/superman/deklarasi/start?no_invoice=...
GET /api/superman/deklarasi/progress?job_id=...
```

Script lokal terbaru: `scripts/test_superman_0353.py`.

**Screenshot debug:** `SUPERMAN_DEBUG_DIR` (default `/tmp/superman_debug`) — file `spp_store_empty_*.png`

---

## Pola operasional (bukan bug, sering disalahartikan)

### PPh dipotong pembeli
Kontrak `is_pph=true` → pelunasan = transfer + PPh. Isi **transfer pas-pasan** dari UI, bukan `jumlah_pembayaran` invoice mentah.

### Multi-PDF sama nama
Kontrak & Invoice pakai file PDF identik → upload Superman replace file; sudah ditangani `_prepare_unique_upload_paths` di `filler.py`.

### Deploy saat job jalan
Jangan push/redeploy saat user menunggu dialog Superman 88%+. Tunggu job selesai atau gagal dulu.

---

## Commit referensi (urutan kronologis)

| Commit | Ringkasan |
|--------|-----------|
| `622097b` | Upload detection bootstrap-fileinput |
| `e36cdff` | Hapus jQuery change pada file input |
| `dc1a7a5` | Batas nominal transfer PPh |
| `aceaad2` | Catat & tampilkan kelebihan transfer |
| `547c11a` | Superman simpan: listener + stale job timeout |
| `edcab3c` | To Do matching referensi invoice |
| `ee328c9` | Superman simpan cepat + Swal auto + heartbeat |
| `5236f7c` | Job persist disk + UI retry (mungkin belum di remote) |
| `7acf96b` | BUG-009: kembalikan submit-guard anti-navigasi form_spp (fix regresi `50515e4`) |
| `951b287` | BUG-009: gagal cepat 90s kalau cek urutan Superman macet |

---

Lihat [agent.md](./agent.md) untuk workflow debug agent.