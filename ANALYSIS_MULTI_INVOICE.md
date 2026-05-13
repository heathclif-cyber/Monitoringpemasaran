# Analisis Fitur: Multi-Invoice per Kontrak (Pembayaran Bertahap)

## Problem Statement

Saat ini 1 kontrak hanya bisa menghasilkan 1 invoice dengan nilai penuh. User ingin bisa membuat **beberapa invoice** dari 1 kontrak dengan nominal partial.

**Contoh kasus:**
- Kontrak senilai **Rp 50.000.000** 
- Invoice #1: **Rp 10.000.000** (20%)
- Invoice #2: **Rp 20.000.000** (40%)
- Invoice #3: **Rp 20.000.000** (40%)
- Total = Rp 50.000.000 (tidak boleh melebihi nilai kontrak)

---

## Arsitektur Saat Ini

### Yang Sudah Mendukung (Tidak Perlu Diubah)

| Komponen | Status | Keterangan |
|----------|--------|------------|
| **Relasi DB** | ✅ | `Invoice.no_kontrak` FK → `Kontrak.no_kontrak`. Satu kontrak sudah bisa punya banyak invoice |
| **Cascade delete** | ✅ | `Kontrak.invoices = relationship(..., cascade="all, delete-orphan")` |
| **Invoice numbering** | ✅ | Frontend auto-suffix: `KONTRAK-01`, `KONTRAK-02`, dst |
| **DO volume proporsional** | ✅ | `volume_do = (nominal_transfer / invoice_total) × kontrak_volume` |
| **Laporan Dashboard** | ✅ | Agregasi iterasi semua invoice, bukan asumsi 1:1 |

### Yang HARUS Diubah

| Komponen | File | Masalah |
|----------|------|---------|
| **Backend Invoice POST** | `api/r_invoice.py:23-32` | `jumlah_pembayaran` dihitung otomatis = **nilai penuh kontrak**. Tidak bisa override. |
| **Frontend Invoice Form** | `pages/InvoicePage.tsx` | Form tidak punya input untuk nominal partial. Auto-generate langsung full amount. |
| **Validasi** | Belum ada | Tidak ada pengecekan apakah total invoice melebihi nilai kontrak |

---

## Logika Data Flow

```
┌─────────────────────────────────────────────────┐
│ KONTRAK: 50rb (volume 1000 Kg × 50rb)          │
│   nilai_pokok = (vol × harga) + premi = 50jt    │
│   nilai_transaksi = pokok + PPN                 │
│   total_kewajiban = nilai_transaksi - PPh       │
│   sisa_kontrak = 50jt (awal)                   │
└──────────┬──────────────────────────────────────┘
           │
    ┌──────┴──────┬──────────────┬──────────────┐
    ▼             ▼              ▼              ▼
┌─────────┐ ┌─────────┐  ┌─────────┐   ┌──────────┐
│ INV #1  │ │ INV #2  │  │ INV #3  │   │ SISA: 0  │
│ 10rb    │ │ 20rb    │  │ 20rb    │   │ (lunas)  │
│ vol:200 │ │ vol:400 │  │ vol:400 │   │          │
└────┬────┘ └────┬────┘  └────┬────┘   └──────────┘
     │           │            │
     ▼           ▼            ▼
  DO partial  DO partial   DO partial
  (volume     (volume      (volume
  proporsional) proporsional) proporsional)
```

---

## Detail Perubahan per File

### 1. Backend: `api/r_invoice.py` (line 15-53)

**Perubahan:** Endpoint POST harus menerima field opsional `jumlah_pembayaran` dari frontend.

```python
# 🟡 SEBELUM (current) — selalu hitung nilai penuh:
pokok = (vol * harga) + premi
ppn_val = pokok * (ppn_persen / 100) if is_ppn else 0
pph_val = pokok * (pph_persen / 100) if is_pph else 0
jumlah_pembayaran = pokok + ppn_val - pph_val  # ← SELALU FULL

# 🟢 SESUDAH (proposed):
# 1. Hitung nilai maksimum kontrak (sama seperti di atas)
# 2. Jika frontend mengirim `jumlah_pembayaran`, validasi:
#    a. Tidak boleh > nilai_maksimum
#    b. Tidak boleh > sisa_kontrak (nilai_maksimum - sum(invoice_existing))
# 3. Gunakan nilai yang dikirim frontend sebagai jumlah_pembayaran
```

**Aturan bisnis:**
- `jumlah_pembayaran ≤ nilai_maksimum_kontrak`
- `sum(semua invoice untuk kontrak ini) + jumlah_pembayaran ≤ nilai_maksimum_kontrak`
- `jumlah_pembayaran > 0`
- Tetap simpan `terbilang_invoice` berdasarkan `jumlah_pembayaran` (bukan nilai kontrak penuh)

**Schema update (`schemas.py`):**
```python
class InvoiceBase(BaseModel):
    no_invoice: str
    no_kontrak: str
    tanggal_transaksi: date
    status_invoice: Optional[str] = "Unpaid"
    pph_22_persen: Optional[float] = 0.0
    jumlah_pembayaran: Optional[float] = None  # 🟢 TAMBAH: opsional, untuk partial
```

### 2. Frontend: `pages/InvoicePage.tsx`

**Perubahan:** Form invoice perlu field "Jumlah Pembayaran" yang editable.

```
┌──────────────────────────────────────────────────┐
│  No Kontrak*:  [001/KTR/IV/2025     ▼]          │
│  No Invoice*:  [001/KTR/IV/2025-02  ]  [Cari]   │
│  Tanggal*:     [2026-05-13           ]           │
│                                                   │
│  ┌─── Info Kontrak ───────────────────────────┐  │
│  │ Pembeli: PT Nasional Bhirawa Tama          │  │
│  │ Komoditi: Karet | Volume: 1000 Kg          │  │
│  │ Nilai Kontrak: Rp 50.000.000               │  │
│  │ Total Invoice: Rp 10.000.000 (20%)         │  │
│  │ ┌──────────────────────────────────────┐   │  │
│  │ │ ████████░░░░░░░░░░░░░░░░░░░░  20%    │   │  │
│  │ └──────────────────────────────────────┘   │  │
│  │ Sisa Kontrak: Rp 40.000.000 (80%)          │  │
│  └───────────────────────────────────────────┘  │
│                                                   │
│  🟢 Jumlah Pembayaran: [  20.000.000  ]          │
│     (Maks: Rp 40.000.000)                        │
│                                                   │
│  [Simpan] [Export .docx] [Reset]                 │
└──────────────────────────────────────────────────┘
```

**Komponen yang ditambahkan:**
1. **Progress bar** — menunjukkan persentase kontrak yang sudah di-invoice
2. **Input "Jumlah Pembayaran"** — user bisa isi nominal parsial
3. **Label "Maks"** — menampilkan sisa yang masih bisa di-invoice
4. **Summary invoice existing** — list invoice yang sudah ada untuk kontrak ini

### 3. Frontend: `store/invoiceStore.ts`

**Perubahan:** method `fetchByKontrak()` untuk mendapatkan daftar invoice existing.

```typescript
// 🟢 TAMBAH
getInvoicesByKontrak: (noKontrak: string) => Invoice[]
totalInvoicedForKontrak: (noKontrak: string) => number
```

### 4. Backend: `api/r_dashboard.py` & `api/r_laporan.py`

**Status:** ✅ Tidak perlu diubah.

Dashboard sudah iterasi semua invoice per kontrak:
```python
for kontrak in kontraks:
    for invoice in kontrak.invoices:  # ← sudah iterasi semua
        for do in invoice.delivery_orders:
            # hitung pendapatan proporsional
```

Laporan juga sudah iterasi per DO, yang sudah proporsional dari invoice masing-masing.

---

## Skenario Edge Cases

| Kasus | Handling |
|-------|----------|
| Invoice pertama = full amount | Sama seperti flow sekarang |
| Total invoice > nilai kontrak | **Ditolak** — error: "Total invoice melebihi nilai kontrak" |
| Invoice = 0 atau negatif | **Ditolak** — validasi > 0 |
| Kontrak dihapus setelah ada invoice | ✅ Cascade delete sudah handle |
| Invoice diedit setelah ada DO | Perlu **recalculate** DO terkait (volume_do & selisih) |
| Kontrak diedit (volume/harga) | Perlu **cascade recalculate** semua invoice & DO (sudah ada di `endpoints/kontrak.py`) |

---

## Prioritas Implementasi

| # | Langkah | File | Estimasi |
|---|---------|------|----------|
| 1 | Tambah field `jumlah_pembayaran` opsional di `schemas.py` | `schemas.py` | 5 menit |
| 2 | Update backend POST invoice: terima override + validasi sisa | `api/r_invoice.py` | 30 menit |
| 3 | Update InvoiceStore: fetch invoices by kontrak, hitung sisa | `store/invoiceStore.ts` | 20 menit |
| 4 | Update InvoicePage: input nominal, progress bar, info sisa | `pages/InvoicePage.tsx` | 45 menit |
| 5 | Update preview invoice: tampilkan nominal parsial (bukan full) | `pages/InvoicePage.tsx` | 15 menit |
| 6 | Test: buat 3 invoice partial, verifikasi DO proporsional | Manual | 15 menit |

**Total estimasi: ~2 jam**

---

## Kesimpulan

Fitur multi-invoice per kontrak **80% infrastrukturnya sudah ada**. Yang perlu diubah hanya:
1. Backend: izinkan override `jumlah_pembayaran` + validasi batas
2. Frontend: tambah input nominal + progress bar

Sistem DO, dashboard, laporan, dan numbering **tidak perlu diubah** karena sudah mendukung relasi 1:N sejak awal.
