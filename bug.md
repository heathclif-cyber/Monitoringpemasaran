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
| [BUG-009](#bug-009-superman--store_body-null--recover-gagal) | Superman | Critical | Fix v2 2026-07-06 (blokir `form.submit()` native + store via fetch) — belum diverifikasi live |
| [BUG-010](#bug-010-superman--to-do-match-false-positive-adopsi-spp-user-lain) | Superman | Critical | Fixed 2026-07-06 — data invoice 0353 perlu dibersihkan |

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

**Masih gagal (2026-07-06) — root cause v2:** Tiga run E2E invoice 0353 (`scripts/_test_0353_last.txt`, `_run2`, `_run3`) tetap `chrome_error_seen: true` meski submit-guard `7acf96b` aktif. Penyebab:

1. **Guard hanya menahan *event* `submit`.** Setelah dialog "Info Urutan Nomor" di-klik ("Simpan Saja"), JS Superman memanggil **method native `form.submit()`** — method ini *tidak memicu event submit*, jadi `preventDefault` tidak pernah jalan → navigasi POST penuh (multipart + PDF lampiran) → gagal/timeout jaringan → `chrome-error://chromewebdata/` → `form_spp` hilang. Di run2 halaman berakhir di chrome-error ("form_spp tidak ada"); di run3 dialog urutan sempat tampil (urutan SPPB 29 / SPPN 71) lalu tetap chrome-error.
2. **Fallback fetch yang gagal dianggap sukses.** `_post_store_via_fetch` yang error (`{"ok": false, "reason": "Failed to fetch"}`) dikembalikan sebagai `store_body` karena kondisi hanya mengecek key `success`, bukan `ok` → retry percobaan-2 dan ekstraksi nomor dari halaman dilewati → pesan akhir "Gagal mendapatkan nomor SPPn/SPPb dari Superman" (run3).

**Fix v2 (2026-07-06, `filler.py`):**
- `_install_form_submit_guard` — selain event listener, **override `form.submit`** jadi pencatat flag `window.__storeSubmitRequested` (navigasi mustahil terjadi). Dipasang ulang setelah `page.go_back()` dari chrome-error.
- Loop `_submit_and_wait_store` memantau flag itu: begitu Superman minta submit, tunggu 1,5s (beri kesempatan AJAX asli), lalu kirim POST `/spp/store` via `fetch` (FormData snapshot form pasca-callback dialog, abort timeout 120s) dan pakai respons JSON-nya.
- `_fetch_store_result_ok` — hasil fetch `ok: false` kini dianggap gagal (lanjut retry/ekstraksi, tidak lagi "sukses palsu").
- Listener `page.on("requestfailed")` merekam `request_failures` (URL + errorText, mis. `net::ERR_TIMED_OUT`) di `store_debug` — kalau masih gagal, run berikutnya menunjukkan error jaringan persisnya.

**Sisa risiko:** Penyebab cek-urutan lambat di sisi Superman (server pihak ketiga) sendiri belum diketahui — apakah karena beban server, atau ada draft/anomali nyangkut dari percobaan gagal sebelumnya untuk kontrak yang sama. Kalau fail-fast 90s sering ke-trigger, cek manual portal Superman untuk draft SPPb/SPPn duplikat/nyangkut terkait kontrak yang gagal.

**Root cause v3 ketemu (2026-07-06, live run production invoice 0353 job `5408942c`):** Berkat `request_failures` dari fix v2, sekarang penyebabnya presisi: setiap POST ke `https://superman.ptpn1.co.id/spp/store` (baik lewat native click maupun fallback `fetch`) gagal dengan **`net::ERR_ALPN_NEGOTIATION_FAILED`** — kegagalan TLS/ALPN negotiation di level jaringan, bukan lagi soal navigasi Playwright. `seen_post_urls` cuma pernah berisi `check-urutan-anomaly` (endpoint kecil, non-upload) — POST `/spp/store` (multipart, bawa 3 lampiran PDF) **tidak pernah berhasil membuka koneksi TLS**, 2x percobaan fetch berturut-turut gagal identik.

Ini kemungkinan besar **bukan bug di kode kita** — ini masalah infrastruktur/jaringan antara Railway (tempat Playwright browser jalan) dan server Superman, khusus untuk endpoint `/spp/store` (kemungkinan WAF/reverse-proxy Superman menolak/reset koneksi saat body multipart besar, atau ada middlebox yang salah menangani ALPN untuk rute upload). Endpoint `check-urutan-anomaly` (payload kecil) selalu berhasil; `/spp/store` (payload besar dengan lampiran) yang selalu gagal — pola ini konsisten mengarah ke masalah ukuran payload atau kebijakan WAF sisi Superman, bukan client.

**Fix dicoba #1 (2026-07-06, `auth.py`):** `fetch()` di level JS halaman memang tidak bisa memaksa versi TLS/HTTP, tapi **launch argument Chromium bisa**. `open_authenticated_context` meluncurkan Chromium dengan `args=["--disable-http2"]`. **Hasil: TIDAK menyelesaikan masalah** — run live (job `e5a0d52d`) tetap `net::ERR_ALPN_NEGOTIATION_FAILED` identik. Ini membuktikan bukan soal HTTP/2 secara spesifik.

**Root cause v4 ketemu (2026-07-06, audit git history):** `requirements.txt` punya `playwright>=1.49.0` dan `ddddocr>=1.4.0` — **tidak di-pin ke versi eksak**, dan baris ini tidak pernah diubah sejak commit pertama integrasi Superman (`5112147`, 2026-06-18). Tanpa pin eksak, setiap kali Railway build ulang dari nol (cache Docker invalidated — base image update, cache eviction, dll — bukan berarti kita ubah kode), `pip install` mengambil versi **terbaru yang tersedia saat itu**, dan `playwright install --with-deps chromium` membawa **build Chromium berbeda** mengikuti versi playwright itu.

**Bukti konkret:** di environment dev lokal (pakai spec unpinned yang sama), ada 2 versi Chromium ter-cache di `~/AppData/Local/ms-playwright/` (`chromium-1223` dan `chromium-1228`), dan playwright yang terpasang sekarang **1.60.0** — jauh dari `1.49.0` yang tertulis di requirements.txt sejak awal. Drift versi ini nyata terjadi tanpa siapa pun sengaja mengubahnya.

**Hipotesis:** Chromium versi baru (kemungkinan juga yang jalan di Railway sekarang, kalau pernah ter-rebuild dari nol sejak 18 Juni) punya perilaku negosiasi ALPN yang tidak cocok dengan server Superman, sementara Chromium versi lama (yang jalan waktu fitur ini pertama terbukti berhasil) kompatibel. Ini menjelaskan kenapa error `ERR_ALPN_NEGOTIATION_FAILED` muncul tanpa ada perubahan kode kita sendiri — sesuai laporan user "sebelumnya tidak ada masalah."

**Fix v4 (commit `e75b1ad`):** pin `playwright==1.49.0` dan `ddddocr==1.4.0` di `requirements.txt` (versi eksak sesuai yang tertulis sejak commit pertama), memaksa Railway install Chromium build yang sama seperti waktu fitur ini pertama terbukti jalan normal. **Catatan:** karena `requirements.txt` berubah, cache layer Docker untuk `pip install` & `playwright install --with-deps chromium` akan invalidated — build kali ini akan **lebih lama dari biasanya** (perlu download ulang Chromium binary), jangan buru-buru menganggap deploy gagal kalau lebih lama dari deploy-deploy sebelumnya. **Belum diverifikasi live** — perlu run E2E setelah deploy selesai untuk konfirmasi apakah `ERR_ALPN_NEGOTIATION_FAILED` hilang.

Kalau pin versi ini TIDAK menyelesaikan masalah, itu berarti hipotesis version-drift salah, dan kemungkinan mitigasi lain kembali ke: (a) laporkan ke tim IT Superman/PTPN1 soal error `ERR_ALPN_NEGOTIATION_FAILED`/upload gagal sebagian yang konsisten dari IP Railway, (b) coba declare manual via portal Superman langsung dari browser biasa (jaringan kantor) untuk isolasi apakah ini spesifik ke jaringan Railway, (c) pindahkan eksekusi Playwright ke luar Railway.

**Eksperimen v4 GAGAL — dibatalkan (2026-07-06, commit `c2b4780`):** Pin `playwright==1.49.0` tidak bisa di-build sama sekali. Ternyata `python:3.12-slim` (base image kita) **juga tidak di-pin ke versi Debian tertentu** — build log menunjukkan base image sekarang jalan di **Debian "trixie"**. Playwright 1.49.0 tidak mengenali OS ini ("BEWARE: your OS is not officially supported by Playwright"), fallback ke paket dependensi Ubuntu 20.04 yang tidak ada di trixie (`ttf-ubuntu-font-family`, `ttf-unifont`) → `playwright install --with-deps chromium` gagal total (exit 100), build tidak pernah selesai.

Ini artinya **drift-nya dua lapis**: bukan cuma versi Playwright yang tidak di-pin, base image OS-nya (`FROM python:3.12-slim` tanpa tag Debian spesifik) juga ikut bergeser dari waktu ke waktu. Playwright versi terbaru (unpinned) sudah mengenali trixie dengan benar — jadi kombinasi (Playwright terbaru + trixie) itulah yang sekarang berjalan di production, dan sudah terbukti bisa build sukses berkali-kali malam ini.

**Keputusan:** requirements.txt dikembalikan ke `playwright>=1.49.0` / `ddddocr>=1.4.0` (unpinned, seperti semula) supaya build sukses lagi. Hipotesis version-drift Chromium sebagai penyebab `ERR_ALPN_NEGOTIATION_FAILED` **tidak jadi terverifikasi** — untuk menguji ini dengan benar butuh pin base image ke digest/tag Debian spesifik SEKALIGUS versi Playwright yang kompatibel dengannya (bukan asal downgrade Playwright), yang berarti "membekukan" seluruh environment ke snapshot lama — trade-off besar (kehilangan patch keamanan OS terbaru) untuk sebuah hipotesis yang belum pasti benar. **Tidak direkomendasikan dilanjutkan** kecuali opsi non-kode (test jaringan kantor, lapor IT Superman, pindah eksekusi keluar Railway) sudah dicoba dan mengarah kembali ke sini.

**Nomor urut ke-generate saat gagal:** SPPb 30 (max bersih 29), SPPn 72 (max bersih 71) — draft **tidak tersimpan** (todo_rows tidak bertambah, `new_todo_ids: []`), jadi aman dicoba lagi tanpa membersihkan draft nyangkut.

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

## BUG-010: Superman — To Do match false positive (adopsi SPP user lain)

**Gejala (2026-07-06, invoice 0353):** Deklarasi ulang ditolak *"sudah pernah dibuatkan SPPn/SPPb: R8/R08D/SPPb/29/VII/2026 + R8/R08D/SPPn/71/VII/2026 — tidak dapat membuat duplikat"* — padahal nomor itu milik SPP **user lain** (`op_divisi`, Jasa Witnessing KKK SUCOFINDO, Rp 11,1 jt / PPh Rp 200 rb), bukan invoice Karet Lump Rp 473 jt.

**Root cause:** `_find_new_todo_match` di `runner.py` memberi bonus **+250 tanpa syarat** ke setiap baris To Do yang baru muncul setelah simpan draft, dengan ambang terima 120. Nomor urut Superman dipakai bersama satu regional — saat `op_divisi` menyimpan SPP mereka di window yang sama (dan mengambil urutan 29/71 yang tadinya dialokasikan untuk kita), baris asing itu (skor konten hanya ~10) tetap lolos: 10 + 250 = 260 ≥ 120 → dianggap milik kita → `save_superman_to_invoice` menulis nomor salah ke DB → deklarasi ulang terblokir cek duplikat.

**Fix (2026-07-06, `runner.py`):** Baris baru wajib punya bukti konten minimal (skor dasar ≥ 30: nominal SPPn/SPPb cocok, kontrak, atau referensi) sebelum bonus baris-baru diberikan. Baris asing (skor ~10) kini di-skip.

**Pembersihan data:** kolom `superman` di invoice `ADD-TENDER/0353/...` + pembayaran `PAY-ADD-TENDER-0353-...-1` masih berisi label salah `R8/R08D/SPPb/29/VII/2026 + R8/R08D/SPPn/71/VII/2026` — harus di-NULL-kan sebelum deklarasi ulang. (DO terkait tidak ada yang terisi.)

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