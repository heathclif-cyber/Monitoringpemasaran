# Platform Bersama — Layer Zero

Platform Bersama adalah fondasi lintas aplikasi PTPN I Regional 8. Tujuannya
agar setiap aplikasi tetap mandiri dalam proses bisnisnya, tetapi aman untuk
terhubung, konsisten dipakai, dan mudah diaudit.

Ini bukan satu database untuk semua aplikasi. Setiap aplikasi memiliki data
transaksi dan aturan bisnisnya sendiri; pertukaran data dilakukan melalui API
versi yang terdokumentasi.

## Prinsip platform

1. **Satu pemilik per domain.** Pemasaran memiliki kontrak, BA, invoice,
   pembayaran, DO, dan persediaan penjualan. Aplikasi Keuangan memiliki
   pencatatan jurnal dan rekonsiliasi keuangannya sendiri.
2. **Satu sumber data.** Aplikasi pemakai tidak boleh menginput ulang fakta
   yang sudah dimiliki aplikasi sumber.
3. **API, bukan akses database.** Tidak ada aplikasi yang membaca tabel
   aplikasi lain secara langsung.
4. **Akun integrasi terpisah.** Akses antar aplikasi memakai akun teknis
   baca-saja dengan hak minimum, bukan akun personal pegawai.
5. **Referensi dapat ditelusuri.** Data lintas aplikasi membawa ID dari sumber,
   misalnya `no_pembayaran`, `no_invoice`, dan `no_kontrak`.
6. **Standar bersama, implementasi fleksibel.** UI, API, keamanan, dan operasi
   mengikuti standar; proses bisnis tetap menyesuaikan domain masing-masing.

## Ruang lingkup versi pertama

| Bagian | Status | Keterangan |
|---|---|---|
| Metodologi dan pemilik data | Aktif | [METHODOLOGY.md](../../METHODOLOGY.md) |
| Standar integrasi | Aktif | [INTEGRATION_STANDARDS.md](./INTEGRATION_STANDARDS.md) |
| Katalog data | Aktif | [DATA_CATALOG.md](./DATA_CATALOG.md) |
| Standar desain | Aktif | [DESIGN_STANDARDS.md](./DESIGN_STANDARDS.md), diadopsi dari AsetOpt Monitor |
| API arus kas Pemasaran | Aktif | `GET /api/integrasi/v1/cash-in` |
| API pendapatan Pemasaran | Aktif | `GET /api/integrasi/v1/revenue` |
| API pendapatan AsetOpt | Siap deploy | `GET /api/integrasi/v1/revenue` pada AsetOpt Monitor |
| Identitas lintas aplikasi (SSO) | Rencana | Dimulai setelah minimal dua aplikasi memakai API |
| Master data lintas aplikasi | Rencana | Unit, mitra, komoditi, organisasi |
| Event/webhook dan data warehouse | Rencana | Setelah kebutuhan sinkronisasi nyata terukur |

## Pola data: Pemasaran ke Keuangan

```text
Pemasaran (pemilik penjualan)
  ├─ API Cash In v1 ──> Keuangan (pembaca)
  └─ API Revenue v1 ──> Keuangan (pembaca)
       no_pembayaran, tanggal, nominal, unit,
       no_invoice, no_kontrak, no_BA, no_DO

Keuangan menyimpan referensi sumber tersebut pada jurnal/rekonsiliasinya.
Keuangan tidak mengubah pembayaran di Pemasaran.
```

Lihat [standar integrasi](./INTEGRATION_STANDARDS.md) sebelum membuat koneksi
aplikasi baru.
