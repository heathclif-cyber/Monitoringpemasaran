# Katalog data lintas aplikasi

Katalog ini menunjukkan pemilik setiap fakta bisnis. Ia mencegah satu data
diinput dan dipelihara ulang oleh beberapa aplikasi.

| Data | Pemilik saat ini | Pemakai yang diizinkan | Cara akses | ID referensi |
|---|---|---|---|---|
| Kontrak penjualan | Pemasaran | Keuangan, Aset/Operasional | API Pemasaran | `no_kontrak` |
| BA Pengambilan | Pemasaran | Keuangan, Aset/Operasional | API Pemasaran | `no_ba` |
| Invoice penjualan | Pemasaran | Keuangan | API Pemasaran | `no_invoice` |
| Pembayaran/kas masuk penjualan | Pemasaran | Keuangan | API Cash In Pemasaran | `no_pembayaran` |
| Delivery Order penjualan | Pemasaran | Keuangan, Aset/Operasional | API Pemasaran | `no_do` |
| Jurnal dan rekonsiliasi bank | Keuangan | Pemasaran (bila diperlukan) | API Keuangan | ID jurnal Keuangan |
| Data aset dan operasional aset | Aset/Operasional | Keuangan, Pemasaran (bila diperlukan) | API Aset/Operasional | ID aset/operasional |
| Unit, mitra, komoditi, struktur organisasi | Belum ditetapkan | Semua aplikasi | Master data bersama (rencana) | ID master global |

## Aturan pembaruan katalog

- Aplikasi pemilik dan owner bisnis wajib ditetapkan sebelum field digunakan
  lintas aplikasi.
- “Pemakai” boleh menyimpan ID referensi dan salinan baca, tetapi tidak menjadi
  pemilik baru atas fakta tersebut.
- Jika pemilik berubah, lakukan migrasi dan pencatatan keputusan desain;
  jangan mengalihkan akses database secara diam-diam.
