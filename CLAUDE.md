# CLAUDE.md — Monitoring Pemasaran PTPN I

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
- .env ada di root untuk DATABASE_URL (Railway PostgreSQL)
- Model: `models.py`, Schema: `schemas.py`

### Frontend (React)
```bash
cd D:\Apps-Dev\Monitoringpemasaran\frontend
npm run dev      # dev server di :5173, proxy /api ke :8000
npm run build    # production build ke dist/
npx tsc --noEmit # type-check
```
- Semua komponen baru pakai shadcn/ui primitives (`components/ui/`)
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

## Struktur Direktori

```
Monitoringpemasaran/
  main.py              # FastAPI entry point
  models.py            # SQLAlchemy ORM models
  schemas.py           # Pydantic request/response schemas
  database.py          # DB connection (Railway PostgreSQL)
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
      pages/           # Dashboard, KontrakPage, InvoicePage, DOPage, LaporanPage, BypassPage, RepoKontrak/Invoice/DO
      components/
        layout/        # AppLayout, Sidebar, Header
        ui/            # shadcn/ui primitives (button, card, badge, dialog, etc.)
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

- `DESIGN_GUIDELINES.md` — Guideline UI/UX sebelum migrasi React
- `DESIGN_SYSTEM.md` (di `asetopt-monitor`) — Referensi arsitektur React + shadcn/ui
- `ANALYSIS_MULTI_INVOICE.md` — Analisis fitur multi-invoice per kontrak
