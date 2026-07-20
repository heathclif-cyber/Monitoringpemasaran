# Bug Log — Monitoring Pemasaran

Daftar bug yang ditemukan saat development/operasional. **Agent:** baca file ini sebelum debug Superman atau Input Pembayaran — lihat juga [agent.md](./agent.md).

**Terakhir diperbarui:** 2026-07-20

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
| [BUG-011](#bug-011-dokumen-non-pdf-docx-bikin-upload-superman-gagal-23-file) | Documents/Superman | Medium | Fixed 2026-07-06 (`07fba36`) — batasi upload PDF only |
| [BUG-012](#bug-012-superman--gagal-intermittent-di-railway-lalu-tiba-tiba-berhasil) | Superman / Railway | Critical | Mitigated 2026-07-07 — infra fix + perilaku intermittent `/spp/store` |
| [BUG-013](#bug-013-superman--dialog-0-memulai-deadlock-progresspy) | Superman / Railway | Critical | Fixed 2026-07-07 (`73d974d`) — deadlock lock di `progress.py` |
| [BUG-014](#bug-014-superman--nomor-spp-sama-di-multi-invoice-sekontrak) | Superman | Critical | Fixed 2026-07-14 — data 26.041 dibersihkan |
| [BUG-015](#bug-015-superman--draft-sukses-tapi-nomor-tidak-terekam-di-app) | Superman | Critical | Fixed 2026-07-20 — soft match + agent supports |

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

**Keputusan:** requirements.txt dikembalikan ke `playwright>=1.49.0` / `ddddocr>=1.4.0` (unpinned, seperti semula) supaya build sukses lagi. Hipotesis version-drift Chromium sebagai penyebab `ERR_ALPN_NEGOTIATION_FAILED` **tidak jadi terverifikasi** — untuk menguji ini dengan benar butuh pin base image ke digest/tag Debian spesifik SEKALIGUS versi Playwright yang kompatibel dengannya (bukan asal downgrade Playwright), yang berarti "membekukan" seluruh environment ke snapshot lama — trade-off besar (kehilangan patch keamanan OS terbaru) untuk sebuah hipotesis yang belum pasti benar.

**Klarifikasi penting (2026-07-06):** teori "IP Railway diblokir WAF Superman" tidak cukup menjelaskan "dulu jalan normal, sekarang tidak" — kalau IP Railway memang diblokir/dicurigai, harusnya SELALU gagal sejak fitur ini pertama dibuat (juga jalan di Railway). Jadi sesuatu yang BERUBAH, entah IP egress Railway, konfigurasi server Superman, atau versi Chromium — bukan "Railway inherently diblokir".

**Tes TLS mentah dari jaringan lokal (2026-07-06, `openssl s_client`):** langsung ke `superman.ptpn1.co.id:443`:
- ALPN hanya `h2` → **gagal** (`SSL routines:tls_parse_stoc_alpn:bad extension`) — bug nyata di server/WAF Superman kalau client tidak menawarkan fallback.
- ALPN `http/1.1` saja → sukses.
- ALPN `h2,http/1.1` (persis perilaku browser normal) → **sukses**, server pilih `http/1.1`.

Dari jaringan lokal, kombinasi ALPN standar browser tidak memicu bug itu. Artinya server Superman TIDAK rusak secara universal — kemungkinan ada sesuatu yang beda di jalur/fingerprint Railway/Chromium yang memicu bug ALPN itu di sana tapi tidak di jaringan lokal biasa.

**Mitigasi v5 (2026-07-06, commit `946e444`) — dicoba, belum terverifikasi live:** User menegaskan **tidak ingin melibatkan IT Superman/PTPN sama sekali** — solusi harus murni teknis dari sisi kita. Ditambahkan opsi ganti engine browser Playwright dari Chromium ke **Firefox** (TLS stack total berbeda: NSS vs BoringSSL Chromium) via env var `SUPERMAN_BROWSER=firefox` (default tetap `chromium`, tidak ada perubahan kalau env var tidak diset). Dockerfile diupdate install firefox juga. **Diverifikasi lokal:** Firefox berhasil load session tersimpan, buka form `/spp/tambah`, jQuery & tombol simpan terdeteksi normal — kompatibel dengan UI Superman.

**Langkah selanjutnya:** tambahkan env var `SUPERMAN_BROWSER=firefox` di Railway, redeploy, lalu uji deklarasi ulang invoice 0353 — kalau `ERR_ALPN_NEGOTIATION_FAILED` hilang dengan Firefox, itu konfirmasi bug spesifik ke TLS fingerprint Chromium. Kalau masih gagal sama, kemungkinan besar ini soal jaringan/IP Railway (bukan browser), dan opsi berikutnya adalah proxy/VPS jalur keluar berbeda (tanpa IT) — lihat diskusi opsi di percakapan.

**Hasil Firefox (2026-07-06):** TIDAK menyelesaikan masalah — error berubah bentuk jadi `NS_BINDING_ABORTED` (kode Firefox), tapi gejalanya SAMA: POST `/spp/store` tidak pernah direspons, sampai timer abort kita sendiri yang membunuhnya. Beda dari Chromium (`ERR_ALPN_NEGOTIATION_FAILED`, ditolak cepat) — Firefox malah menggantung total tanpa respons apa pun. Kesimpulan: bukan soal implementasi TLS browser tertentu, koneksinya memang tidak pernah selesai dari Railway, apapun browsernya.

**Bukti definitif (2026-07-06) — deklarasi sungguhan invoice 0353 dari jaringan lokal:** kode, data bisnis, dan 3 dokumen PDF yang PERSIS SAMA (diunduh dari Railway) dijalankan via Playwright (Firefox) langsung dari komputer lokal (bukan Railway) — **berhasil sempurna, tahap submit selesai 0 detik** (`ok: true`, SPPb `R8/R08D/SPPb/30/VI/2026`, SPPn `R8/R08D/SPPn/72/VI/2026`, tersimpan ke DB). Ini membuktikan 100%: masalahnya di jaringan Railway, bukan kode/dokumen/browser.

**Percobaan pindah region Amsterdam → Singapore (2026-07-06):** hipotesis: Superman (`ip-99-jak.ptpn1.co.id`, cPanel, hosting di Jakarta — dikonfirmasi lewat DNS, **tidak ada AAAA/IPv6 record**) jauh dari Amsterdam (EU West), jadi transfer besar rentan gagal karena latensi/rute panjang; Singapore jauh lebih dekat ke Jakarta. **Hasil: TIDAK membantu** — job Singapore dengan dokumen full-PDF (invoice `R08D-RO/INV/2026.07.03-1`) tetap gagal identik (`NS_BINDING_ABORTED` di `/spp/store`, retry 2x, semua gagal). Ini **menyingkirkan teori jarak/latensi geografis** sebagai penyebab utama — Singapore-ke-Jakarta jauh lebih dekat dari Amsterdam-ke-Jakarta, tapi hasilnya sama persis.

**Kesimpulan sementara (belum bisa dipastikan 100% tanpa akses WAF/log Superman, dan user tidak mau melibatkan IT):** kemungkinan besar bukan soal region Railway MANA yang dipakai, tapi Railway sebagai penyedia (IP datacenter/cloud) itu sendiri yang diperlakukan berbeda oleh server Superman — di region manapun. Solusi paling realistis saat ini: jalankan deklarasi dari jaringan non-datacenter (komputer lokal/kantor — sudah terbukti berhasil), atau proxy/VPS residential sebagai jalur keluar Railway (belum dicoba).

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

## BUG-011: Dokumen non-PDF (.docx) bikin upload Superman gagal "2/3 file"

**Gejala (2026-07-06, invoice `R08D-RO/INV/2026.07.03-1`):** "Dokumen pendukung SPPb belum terlampir (2/3 file)" — konsisten muncul baik di region Railway Amsterdam maupun Singapore, walau ukuran file kecil (<250KB) dan jaringan tidak jadi masalah (beda dari BUG-009).

**Root cause:** Dokumen "Invoice" untuk invoice ini ter-upload ke sistem kita sebagai **`.docx`** (Word), bukan PDF — semua invoice lain yang berhasil selalu pakai PDF. Widget upload bootstrap-fileinput di Superman kemungkinan besar menolak/tidak mendaftarkan file non-PDF, sehingga selalu persis 1 dari 3 file gagal terhitung.

**Fix (2026-07-06, commit `07fba36`):** Upload dokumen (Kontrak, Invoice, Kuitansi, Rekening Koran, DO, Deklarasi, Berita Acara) sekarang dibatasi PDF saja — `accept=".pdf"` di 3 titik input file (`DocumentUpload.tsx` x2, `UploadPage.tsx`) + validasi klien (tolak sebelum upload) + validasi server di `/api/documents/upload` (400 kalau bukan `.pdf`, tidak bisa di-bypass dari sisi klien).

**Tindak lanjut user:** upload ulang dokumen "Invoice" untuk `R08D-RO/INV/2026.07.03-1` dalam format PDF sebelum deklarasi ulang.

---

## BUG-012: Superman — gagal intermittent di Railway, lalu tiba-tiba berhasil

**Tanggal log:** 2026-07-07 (malam, sesi debug Railway CLI + retry deklarasi production)

**Invoice uji utama:** `R08D-RO/INV/2026.07.03-1` (form `sppb_sppn`, DPP ~24 jt, 3 dokumen PDF)

### Gejala

- Dua kali deklarasi otomatis dari Railway **gagal identik** di tahap 88–94% (*Menunggu urutan & respons simpan Superman*), lalu retry percobaan 2 — `partial: true`, `ok: false`
- Error konsisten: `POST https://superman.ptpn1.co.id/spp/store -> NS_BINDING_ABORTED` (2x per run)
- Form sudah benar (validasi OK, `#simpan` tidak disabled, dialog urutan SPPb/SPPn muncul) — bukan masalah isian
- Beberapa jam kemudian, **pembuatan Superman tiba-tiba berhasil** (dilaporkan user; diverifikasi agent di production)

### Hasil verifikasi production (2026-07-07)

```
GET /api/superman/status
  session_valid: true
  session_path: /data/.superman_state.json

GET /api/invoice/R08D-RO/INV/2026.07.03-1
  superman: R8/R08D/SPPb/30/VII/2026 + R8/R08D/SPPn/72/VII/2026
```

Nomor bulan **VII/2026** (Juli) — deklarasi baru, bukan label lama dari invoice lain.

### Yang sudah disingkirkan sebagai penyebab (sesi malam ini)

| Hipotesis | Hasil investigasi |
|-----------|-------------------|
| Jaringan Railway tidak bisa kirim data besar | Disingkirkan — netprobe authenticated 2,5 MB sukses ~0,2 detik |
| WAF / DDoS / captcha memblokir | Disingkirkan — dashboard Superman 200 OK, tidak ada challenge |
| Region Railway (Amsterdam vs Singapore) | Disingkirkan sebelumnya (BUG-009) + netprobe Singapore sama |
| Sesi login tidak valid | Disingkirkan setelah fix path + re-login OCR |
| Isian form / dokumen salah | Disingkirkan — `doc-requirements ready: true`, validasi pre-save OK |
| Serverless / cold start Railway | Disingkirkan — `sleepApplication: false` |
| OOM / memori habis | Tidak terlihat — plan Hobby 8 GB, satu job |

### Perbaikan infrastruktur yang dilakukan malam ini (bukan penyebab langsung sukses, tapi wajib)

1. **`SUPERMAN_STATE_PATH`** — dari `/app/data/.superman_state.json` (ephemeral, hilang tiap redeploy) ke **`/data/.superman_state.json`** (volume Railway persisten). User ubah manual di dashboard Railway.
2. **Restart service** Railway — bersihkan state thread pool rusak.
3. **Fix captcha 500** — commit `4701fdb`: Playwright sync API dijalankan lewat `sync_executor.py` (dedicated thread, bukan anyio worker asyncio). Endpoint `/api/superman/captcha` tidak lagi intermittent 500.
4. **Re-login Superman** via OCR setelah deploy — `session_valid: true` tersimpan di volume.

Tanpa (1) dan (3), operasi malam ini tidak bisa dilanjutkan sama sekali — tapi keduanya **bukan** yang membuat `/spp/store` tiba-tiba lolos; mereka memperbaiki login dan stabilitas API.

### Kenapa bisa gagal berkali-kali lalu tiba-tiba berhasil?

**Kesimpulan utama:** kegagalan di `/spp/store` dari Railway bersifat **intermittent** (tidak deterministik 100% gagal / 100% sukses), selaras dengan temuan BUG-009 sejak 2026-07-06.

**Faktor yang menjelaskan pola "gagal → gagal → tiba-tiba OK":**

1. **Bukan bug kode isian form** — dua run agent gagal dengan debug identik (`request_failures: NS_BINDING_ABORTED`, `fetch_on_submit` aborted, `store_body_preview: null`). Run berikutnya (user atau retry ke-3) lolos ke To Do dan menulis nomor ke DB.

2. **Endpoint kecil vs upload nyata** — `check-urutan-anomaly` selalu sukses; hanya `POST /spp/store` (multipart + lampiran PDF) yang putus. Netprobe ke path dummy 404 tidak merefleksikan beban proses upload server Superman.

3. **Jalur datacenter Railway vs jaringan lokal** — deklarasi identik dari komputer lokal (invoice 0353, 2026-07-06) sukses 0 detik di tahap submit. Dari Railway, submit yang sama kadang `ERR_ALPN_NEGOTIATION_FAILED` (Chromium) atau `NS_BINDING_ABORTED` (Firefox). Ini menunjukkan perlakuan berbeda terhadap traffic cloud, bukan data bisnis yang salah.

4. **Retry memang bagian dari desain** — kode sudah punya percobaan 2 di simpan draft; kegagalan agent = kedua percobaan dalam satu job habis tanpa respons. Percobaan job **baru** (atau klik ulang user) = kesempatan independen — dan inilah yang kemungkinan berhasil.

5. **Kondisi sisi Superman / jaringan perantara** — tidak bisa diobservasi tanpa log IT. Kemungkinan: beban server, timeout proxy cPanel, atau reset koneksi saat body multipart besar — **bukan selalu aktif**, sehingga terasa "tiba-tiba" berhasil tanpa perubahan kode aplikasi.

6. **Bukan karena TENDER/0353 "sukses di Railway"** — klaim sukses 0353 malam ini salah interpretasi; deklarasi 0353 yang terbukti end-to-end adalah dari **jaringan lokal** (BUG-009, 2026-07-06). Sukses R08D inilah **bukti live pertama** deklarasi penuh dari Railway setelah rangkaian fix infra malam ini.

### Timeline singkat sesi 2026-07-07

| Waktu (kira-kira) | Kejadian |
|-------------------|----------|
| Awal sesi | Netprobe + WAF check: jaringan Railway ke Superman OK untuk request anonim/kecil |
| | Login OCR + sesi valid |
| | Temuan `SUPERMAN_STATE_PATH` salah → user perbaiki ke `/data/...` |
| Setelah redeploy | Captcha intermittent 500 (`Playwright Sync API inside asyncio loop`) |
| | Restart Railway + deploy `4701fdb` (sync_executor) |
| | Re-login OCR berhasil |
| Retry 1–2 R08D (agent) | Job gagal — `NS_BINDING_ABORTED` di `/spp/store`, `invoice.superman` tetap null |
| Beberapa saat kemudian | User lapor tiba-tiba berhasil |
| Verifikasi agent | `R08D-RO/INV/2026.07.03-1` → `SPPb/30/VII/2026 + SPPn/72/VII/2026` |

### Status & rekomendasi operasional

- **Status:** Mitigated — Railway **bisa** menyelesaikan deklarasi, tapi **tidak boleh dianggap 100% reliable** untuk `/spp/store`
- **Jika gagal lagi:** tunggu 1–2 menit, **Coba Lagi** sekali (jangan paralel 2 job); jangan redeploy saat job di 88%+
- **Pantau:** apakah kegagalan >50% per minggu — kalau ya, pertimbangkan server Windows kantor (`DEPLOY_GUIDE.md`) atau VPS worker non-datacenter
- **Jangan** anggap masalah selesai permanen hanya karena satu run sukses

**File terkait:** `services/superman/sync_executor.py` (`4701fdb`), `services/superman/filler.py`, `services/superman/netdiag.py`, `api/r_superman.py`

**Commit malam ini:** `4701fdb` (Playwright thread pool), `61ef516` (netprobe authenticated + waf-check)

---

## BUG-013: Superman — dialog 0% "Memulai..." (deadlock progress.py)

**Tanggal log:** 2026-07-07

**Gejala:** Dialog Superman stuck **0% / "Memulai..."** tanpa error. `POST /deklarasi/start` dan `GET /deklarasi/progress` **timeout** (15–25s); endpoint lain (`preview`, `doc-requirements`) tetap 200 cepat.

**Penyebab:** `_ensure_loaded()` memegang `threading.Lock` lalu memanggil `_sync_from_disk()` yang mencoba lock yang sama — **self-deadlock** saat file `superman_jobs.json` sudah ada di volume Railway (setelah restart + job pertama). Worker HTTP terkunci selamanya; semua request progress/start ikut hang.

**Fix (`73d974d`):**
- Baca/merge disk **tanpa nested lock**; pakai `RLock` + persist di luar lock
- Debounce tulis disk (tidak setiap `update_job`)
- Throttle `_sync_from_disk` pada poll
- Fail cepat job `running` di 0% > 90 detik

**Verifikasi:** Invoice `0757/HO-SUPCO/WASTE-L/N-I/V/2026` — `start` 0.21s, progress naik normal, selesai `SPPb/31/V/2026 + SPPn/73/V/2026`.

**File:** `services/superman/progress.py`

---

## BUG-014: Superman — nomor SPP sama di multi-invoice sekontrak

**Tanggal log:** 2026-07-14

**Gejala:** Dua invoice beda nomor (`26.040/...` dan `26.041/...`) pada kontrak yang sama (`033/SGN/SPJB/BO/GKP-N1/VII/2026`), nominal mirip (Rp 750 jt), di Laporan menampilkan **Superman sama**: `R8/R08D/SPPn/73/VII/2026`. Padahal Superman harus per invoice.

**Root cause:** To Do matching di `runner.py` memasukkan `no_kontrak` sebagai strong match_ref (+~970 jika `sp_opl` berisi kontrak) + soft kontrak +100 + nominal/mitra. Invoice saudara sekontrak (tanpa match nomor invoice) lolos ambang recover (≥70) → `save_superman_to_invoice` menulis nomor SPP invoice A ke invoice B. Tidak ada guard unik antar-invoice.

**Fix (2026-07-14):**
1. `_collect_todo_match_refs` — **tanpa** `no_kontrak` (hanya referensi/invoice/pembayaran/DO)
2. `_todo_row_matches_identity` — wajib identitas invoice; skor final 0 jika tidak
3. Kontrak/`sp_opl` hanya soft signal kecil
4. `_coalesce_spp_numbers` — respons `/spp/store` menang atas To Do match
5. `save_superman_to_invoice` + recover — tolak jika nomor SPP sudah dipakai invoice lain

**Pembersihan data (2026-07-14):**
- **Dipertahankan:** `26.040/GKP-N1/BO/NJM/VII/2026` → `R8/R08D/SPPn/73/VII/2026` (lebih dulu)
- **Dikosongkan:** `26.041/GKP-N1/BO/NJM/VII/2026` + pembayaran terkait — deklarasi ulang setelah deploy fix

**File:** `services/superman/runner.py`, `services/superman/persist.py`

---

## BUG-015: Superman — draft sukses tapi nomor tidak terekam di app

**Tanggal log:** 2026-07-20

**Gejala:** Deklarasi lewat app (agent lokal) berhasil isi form + simpan draft di portal Superman (To Do muncul, tgl 17/VII/2026), tetapi kolom `invoice.superman` kosong. Tombol recover juga gagal.

**Root cause (dua lapis):**
1. **Agent path crash:** `submit_deklarasi_invoice` hanya set `supports` jika `support_doc_paths` kosong. Agent selalu kirim path unduhan → `UnboundLocalError: supports` **setelah** `/spp/store` sukses → nomor tidak sempat `save_superman_to_invoice`.
2. **To Do match skor 0:** API `getTodo` sering **tidak** mengembalikan `referensi`/`au58` meski form terisi. Gate BUG-014 (`require identity`) men-zero semua skor soft (nominal+mitra+kontrak) → match/recover gagal; user melihat “bisa buat di Superman, tidak terekam di app”.

**Fix (2026-07-20):**
1. `supports` selalu di-resolve (agent + server) — `e311645`
2. Soft score pasca-store: `_find_new_todo_match` pakai `require_identity=False` (wajib nominal cocok)
3. Soft recover: kandidat unassigned nominal+mitra; jika >1 ambil `sppn_id` terbaru; label clash tetap ditolak

**Data invoice contoh:** `R08D-RO/INV/2026.07.15-1` → dipulihkan ke `R8/R08D/SPPn/78/VII/2026` (76/77 soft-match duplikat di portal — cek manual).

**File:** `services/superman/runner.py`

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
| `4701fdb` | BUG-012: Playwright sync di dedicated thread (fix captcha 500 asyncio) |
| `61ef516` | Debug netprobe authenticated + waf-check |
| `73d974d` | BUG-013: deadlock `progress.py` — fix dialog 0% Memulai |

---

Lihat [agent.md](./agent.md) untuk workflow debug agent.