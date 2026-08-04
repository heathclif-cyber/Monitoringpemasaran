# CLAUDE.md — Monitoring Pemasaran PTPN I

> **Agent / debug:** lihat [agent.md](./agent.md) dan log bug [bug.md](./bug.md).

## Project Overview

Sales Document Automation & Reporting System untuk PT Perkebunan Nusantara I Regional 8. 
Aplikasi menghasilkan dokumen Kontrak Penjualan, Invoice, dan Delivery Order dalam format .docx.

## Tech Stack

| Layer | Teknologi |
|-------|-----------|
| Backend | FastAPI (Python 3.12) + Uvicorn |
| Database | PostgreSQL via Railway (SQLAlchemy ORM) |
| Frontend | React 18 + TypeScript + Vite (di `frontend/`) |
| Styling | Tailwind CSS + HSL CSS Variables |
| UI Components | shadcn/ui (Radix primitives) |
| State | Zustand |
| Forms | react-hook-form + Zod |
| Charts | Recharts |
| Icons | Lucide React |
| Doc Generation | python-docx (backend only) |

## Perintah & Konvensi

### Backend (FastAPI)
```bash
cd D:\Apps-Dev\Monitoringpemasaran
python -m uvicorn main:app --host 0.0.0.0 --port 8000 --reload
```
- **JANGAN UBAH endpoint API tanpa diskusi** — format request/response sudah baku
- `.env` wajib ada di root dengan `DATABASE_URL` (Railway PostgreSQL) — **tidak ada fallback SQLite**
- Driver: auto-detect `psycopg2` → `psycopg` (v3). Install salah satu: `pip install psycopg[binary]`
- Model: `models.py`, Schema: `schemas.py`

### Frontend (React)
```bash
cd D:\Apps-Dev\Monitoringpemasaran\frontend
npm run dev      # dev server di :5173, proxy /api ke :8000
npm run build    # production build ke dist/
npx tsc --noEmit # type-check
```
- Semua komponen baru pakai shadcn/ui primitives (`components/ui/`)
- **UI & layout:** ikuti section **UI Design System (wajib)** di bawah
- Classnames selalu via `cn()` dari `@/lib/utils`
- Format currency: `formatCurrency()` / `formatCurrencyDec()` dari `@/lib/utils`
- Semua types di `types/index.ts` — jangan scatter di file lain
- Zustand store: 1 per entitas, pattern: fetch → re-fetch after mutation
- Halaman form: react-hook-form + Zod, dengan live preview panel di kanan

### Aturan Kode
- **Kode:** bahasa Inggris (variabel, fungsi, interface)
- **UI labels:** bahasa Indonesia
- **Commit:** bahasa Indonesia atau Inggris, konsisten
- **JANGAN refactor kode yang tidak terkait** dengan task yang diminta
- **JANGAN ubah format dokumen** (Kontrak, Invoice, DO) — sudah format baku perusahaan
- Format dokumen mengacu ke `forms.js` original (`buildLivePreview`, `buildInvoicePreview`, `buildDOPreview`)
- Preview panel selalu visible, lebar 600px, font 9pt

## UI Design System (wajib)

> Detail lengkap: [docs/architecture/DESIGN_SYSTEM.md](./docs/architecture/DESIGN_SYSTEM.md)  
> Ringkas palet/tipografi: [docs/architecture/DESIGN_GUIDELINES.md](./docs/architecture/DESIGN_GUIDELINES.md)  
> Implementasi pola: `frontend/src/components/patterns/`

### Prinsip (jangan dilanggar)

1. **Data over decoration** — hindari hero gradient, ring/chart berlebih di halaman operasional, shadow tebal.
2. **Action-first** — aksi utama (upload, simpan) terlihat jelas; halaman unit/list harus padat.
3. **Konsisten** — satu pola untuk header, filter, list, status, empty/loading.
4. **Token, bukan hardcode** — pakai `primary`, `muted`, `destructive`, `border`, `Badge` / `StatusPill`. Hindari warna ad-hoc (`rose-600`, hex) kecuali semantik yang sudah di `StatusPill` / `StatPills`.
5. **Bahasa UI Indonesia**, kode Inggris.

### Komponen & pola yang wajib dipakai

| Kebutuhan | Pakai (import dari) |
|-----------|---------------------|
| Wrapper halaman | `PageShell` — `@/components/patterns` |
| Judul + deskripsi + actions | `PageHeader` |
| Bar filter | `FilterToolbar` (+ kontrol `h-8` / `h-9`) |
| Ringkasan angka 1 baris | `StatPills` |
| KPI dashboard besar | `StatCard` — `@/components/common` |
| List + loading + empty | `ListPanel` (+ `EmptyState` / `LoadingSkeleton`) |
| Chip status baris | `StatusPill` atau `Badge` |
| Button / Input / Card / Dialog | shadcn `components/ui/*` |
| Upload PDF | `DocumentUpload` |

Import pola:

```ts
import {
  PageShell, PageHeader, FilterToolbar, StatPills, ListPanel, StatusPill,
} from '@/components/patterns'
```

### Checklist page / UI baru

- [ ] Bungkus `PageShell` (`width`: `default` | `narrow` | `wide` | `full`)
- [ ] `PageHeader` bila perlu judul lokal (jangan double deskripsi panjang vs `pageMeta`)
- [ ] Filter lewat `FilterToolbar`
- [ ] Angka ringkas: `StatPills` (bukan grid kartu besar di halaman unit/ops)
- [ ] List: `ListPanel`; status: `StatusPill` / `Badge`
- [ ] Empty/loading: `EmptyState` / `LoadingSkeleton`
- [ ] Aksi utama: 1 tombol primer per baris operasional
- [ ] Types di `types/index.ts`; labels Indonesia

### Pola layout yang sudah baku (jangan dirombak tanpa diskusi)

| Pola | Aturan |
|------|--------|
| **Form dokumen** (Kontrak, Invoice, DO, Pembayaran) | Form kiri + preview kanan ~600px, font preview 9pt; **format .docx tidak diubah** |
| **Repository** | Filter + tabel/DataTable + preview/download `DocxPreview` |
| **Dashboard / Laporan** | `StatCard` + Recharts; boleh chart |
| **Halaman operasional unit** (mis. Dokumen Unit) | Padat: `StatPills` + list; **tanpa** hero/chart |

### Anti-pattern (dilarang untuk page baru)

- Hero gradient + banyak chart di halaman upload/unit
- Button/input custom yang menduplikasi shadcn
- Empty state hanya teks polos (wajib `EmptyState`)
- Copy-paste layout 3 halaman tanpa pakai `patterns/`
- Mengubah token global tanpa update `index.css` + `DESIGN_SYSTEM.md`

### Migrasi bertahap

Saat menyentuh halaman lama, **utamakan** bungkus `PageShell` + `PageHeader` (dan `FilterToolbar` jika ada filter). Jangan big-bang rewrite. Status migrasi ada di tabel §7 `DESIGN_SYSTEM.md`.

## Struktur Direktori

```
Monitoringpemasaran/
  main.py              # FastAPI entry point
  models.py            # SQLAlchemy ORM models
  schemas.py           # Pydantic request/response schemas
  database.py          # DB connection (Railway PostgreSQL, no SQLite fallback)
  api/                 # API route modules (invoice, do, dashboard, laporan)
  endpoints/           # Kontrak endpoints
  services/            # Word docx generator, image generator, utils
  templates/           # Jinja2 templates (legacy) + kuitansi_template.docx
  static/              # Legacy static files (tidak dipakai React)
  frontend/            # React SPA
    src/
      main.tsx, App.tsx, index.css
      types/index.ts   # SEMUA TypeScript interfaces
      lib/             # client.ts (API), utils.ts (cn, formatters)
      utils/           # terbilang.ts, kontrakUtils.ts, doUtils.ts, laporanUtils.ts
      store/           # Zustand: kontrakStore, invoiceStore, doStore, dashboardStore, laporanStore, appStore
      pages/           # Dashboard, KontrakPage, InvoicePage, DOPage, LaporanPage, BypassPage, Repo*, UnitDoc, DocMonitor
      components/
        layout/        # AppLayout, Sidebar, Header
        ui/            # shadcn/ui primitives (button, card, badge, dialog, etc.)
        patterns/      # PageShell, PageHeader, FilterToolbar, StatPills, ListPanel, StatusPill (WAJIB page baru)
        common/        # StatCard, StatusBadge, ConfirmDialog, EmptyState, LoadingSkeleton, Toast, DocxPreview
        feature/       # KontrakPreview, InvoicePreview (inline), DOPreview (inline)
```

## Data Model (relasi utama)

```
Kontrak (1) ──→ Invoice (N) ──→ DeliveryOrder (N)
                      │
LaporanBypass (standalone)
```

- **Kontrak:** no_kontrak (PK), volume, harga_satuan, premi, is_ppn, ppn_persen, is_pph, pph_persen
- **Invoice:** no_invoice (PK), no_kontrak (FK), tanggal_transaksi, jumlah_pembayaran
- **DeliveryOrder:** no_do (PK), no_invoice (FK), nominal_transfer, volume_do (proporsional)
- **LaporanBypass:** id (PK), unit, komoditi, nominal, volume (entry manual tanpa kontrak)

## Business Logic Penting

### Perhitungan Kontrak
```
pokok = (volume × harga_satuan) + premi
PPN = pokok × (ppn_persen / 100)  jika is_ppn = true
PPh = pokok × (pph_persen / 100)  jika is_pph = true
nilai_transaksi = pokok + PPN
total_tagihan = pokok + PPN - PPh
```

### Perhitungan Invoice
- Backend menerima `jumlah_pembayaran` opsional — kalau kosong = nilai penuh kontrak
- Validasi: total semua invoice per kontrak ≤ nilai maksimum kontrak

### Perhitungan DO
```
volume_do = (nominal_transfer / invoice.jumlah_pembayaran) × kontrak.volume
selisih = invoice.jumlah_pembayaran - nominal_transfer
```

### Laporan
- Semua agregasi iterasi per-DO melalui Invoice → Kontrak
- Harga rata-rata: DPP_Pokok / volume (excl. PPN)
- Sisa Pembayaran: Kewajiban - total nominal transfer semua DO
- Sisa Volume: kontrak.volume - total volume_do semua DO

## Multi-Invoice per Kontrak

Satu kontrak bisa punya beberapa invoice (pembayaran bertahap). Saat buat invoice:
- Form menampilkan progress bar + total ter-invoice + sisa kontrak
- User isi `jumlah_pembayaran` (kosongkan = auto nilai penuh)
- Backend validasi: total semua invoice ≤ nilai maksimum kontrak

## Format Dokumen Baku

- `buildLivePreview()` → Kontrak: Arial 9pt, judul "KONTRAK PENJUALAN", tabel rowS/rowD
- `buildInvoicePreview()` → Invoice: Calibri 9pt, tabel bordered 10 kolom, "Proforma Invoice"
- `buildDOPreview()` → DO: Calibri 9pt, header PT PERKEBUNAN NUSANTARA I REGIONAL 8, 7 kolom

## Kuitansi

- Template: `templates/kuitansi_template.docx` (A4, Calibri, underline title)
- Generator: `services/generator_word.py` → `generate_kuitansi_docx(invoice)`
- Endpoint: `GET /api/invoice/export-kuitansi?no_invoice=XXX`
- Nilai kuitansi = **pokok + PPN** (sebelum dikurangi PPh, berbeda dengan invoice)
- Dihitung proporsional: `(pokok + PPN) × (jumlah_pembayaran / total_tagihan)`

## Preview Dialog (Repository Pages)

- Semua repository (RepoKontrak, RepoInvoice, RepoDO) pakai **docx-preview**
- Klik ikon mata/receipt → fetch .docx → render via `DocxPreview` component
- Preview = file yang akan di-download (WYSIWYG, identik dengan hasil download)
- Component: `frontend/src/components/common/DocxPreview.tsx`

## Panduan Referensi

- [docs/architecture/DESIGN_SYSTEM.md](./docs/architecture/DESIGN_SYSTEM.md) — **Standar UI + pola halaman** (baca sebelum UI baru)
- [docs/architecture/DESIGN_GUIDELINES.md](./docs/architecture/DESIGN_GUIDELINES.md) — Guideline ringkas (palet, tipografi)
- `frontend/src/components/patterns/` — implementasi pola (import dari `@/components/patterns`)
- `docs/architecture/ANALYSIS_MULTI_INVOICE.md` — Analisis fitur multi-invoice per kontrak
