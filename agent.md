# Agent Guide — Monitoring Pemasaran PTPN I

Panduan untuk AI agent / developer yang mendebug atau mengembangkan proyek ini.

## Dokumen terkait

| File | Isi |
|------|-----|
| [CLAUDE.md](./CLAUDE.md) | Overview proyek, stack, konvensi kode, struktur direktori |
| **[bug.md](./bug.md)** | **Log bug known issues — baca ini dulu sebelum debug Superman / Pembayaran** |
| [DEPLOY_GUIDE.md](./DEPLOY_GUIDE.md) | Deploy Railway |
| [ANALYSIS_MULTI_INVOICE.md](./ANALYSIS_MULTI_INVOICE.md) | Multi-invoice per kontrak |

---

## Prioritas baca berdasarkan task

| Task user | Baca |
|-----------|------|
| Superman macet / gagal / partial | [bug.md](./bug.md) → BUG-005, BUG-006, BUG-009 |
| Pembayaran ditolak / kelebihan transfer | [bug.md](./bug.md) → BUG-001, BUG-002 |
| Pulihkan To Do gagal | [bug.md](./bug.md) → BUG-007, BUG-009 |
| Umum / fitur baru | [CLAUDE.md](./CLAUDE.md) |

---

## Aturan agent

1. **Jangan ubah format API** request/response tanpa diskusi ([CLAUDE.md](./CLAUDE.md)).
2. **Jangan redeploy** hanya untuk observasi — cek production dulu dengan script/API.
3. **Superman job in-memory** — redeploy Railway memutus job aktif ([BUG-006](./bug.md#bug-006-superman--job-hilang-saat-railway-redeploy)).
4. Setelah fix Superman/pembayaran, **update [bug.md](./bug.md)** (status + commit).
5. Production URL: `https://monitoringpemasaran-production.up.railway.app`
6. Session Superman: `/app/data/.superman_state.json` di Railway volume.

---

## Debug cepat — Superman deklarasi

```bash
# Login + status
POST /api/auth/login  {"username":"...","password":"..."}
GET  /api/superman/status

# Sebelum deklarasi
GET /api/superman/doc-requirements?no_invoice=...
GET /api/superman/todo-inspect?no_invoice=...

# Jalankan job
POST /api/superman/deklarasi/start?no_invoice=...
GET  /api/superman/deklarasi/progress?job_id=...

# Recovery
POST /api/superman/recover?no_invoice=...
```

Script lokal: `scripts/test_superman_26035.py` (ganti `NO_INV`).

**Tahap progress yang normal:**
`25%` form → `45–82%` upload/isi → `88–94%` simpan (bisa 1–3 menit) → `95%` To Do → `100%`

Jika stuck &gt; 5 menit di 88–89% tanpa angka detik → deploy belum masuk atau [BUG-005](./bug.md#bug-005-superman--simpan-draft-macet-di-8895).

---

## Debug cepat — Input Pembayaran + PPh

- Pelunasan efektif = `nominal_transfer + pph_on_net_transfer` jika kontrak `is_pph=true`
- Transfer pas-pasan lunas: `max_nominal_transfer(sisa_pelunasan, kontrak)` — lihat `services/pembayaran_utils.py`
- Kelebihan transfer: `selisih < 0` pada record `Pembayaran`

Detail: [BUG-001](./bug.md#bug-001-pembayaran-pph--validasi-sisa-menyesatkan), [BUG-002](./bug.md#bug-002-pembayaran--kelebihan-transfer-tidak-tercatat)

---

## File kunci per area

| Area | Backend | Frontend |
|------|---------|----------|
| Superman fill/submit | `services/superman/filler.py` | `PembayaranPage.tsx`, `supermanUtils.ts` |
| Superman job/progress | `services/superman/progress.py`, `runner.py` | `SupermanProgressDialog.tsx` |
| Pembayaran | `api/r_pembayaran.py`, `pembayaran_utils.py` | `PembayaranPage.tsx`, `pembayaranUtils.ts` |
| Payload invoice→SPPn | `services/superman/payload.py` | — |

---

## Known open issues

Lihat tabel status di **[bug.md](./bug.md#ringkasan-status)**. Saat ini yang masih **Open**:

- **[BUG-009](./bug.md#bug-009-superman--store_body-null--recover-gagal)** — `store_body: null`, recover & To Do kosong untuk beberapa invoice (0353, 0354)

---

*Maintainer: update bug.md setiap selesai investigasi bug baru.*