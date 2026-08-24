# Methodology — Panduan & Prinsip Aplikasi

Dokumen ini adalah pedoman untuk merancang, mengubah, dan mengaudit alur
aplikasi. Prinsip utamanya: setiap fakta bisnis hanya memiliki satu sumber
pengisian. Form berikutnya boleh menampilkan fakta tersebut, tetapi tidak
boleh meminta pengguna mengetik ulang atau menyimpannya sebagai versi kedua.

Aturan ini berlaku pada seluruh alur: **Kontrak → BA → Invoice → Pembayaran →
DO → Persediaan → Laporan Digital**.

## Peta sumber data

| Fakta bisnis | Sumber tunggal | Dipakai oleh |
|---|---|---|
| Mitra, komoditi, deskripsi, unit, satuan, harga normal, pajak, kuota kontrak | Kontrak / unit kontrak | BA, invoice, DO, stok, laporan |
| Nomor BA, tanggal realisasi, kuantitas pengambilan | BA | DO dan Laporan Digital |
| Bulan buku kontrak payung | BA Payung | Laporan Digital dan laporan HO |
| Tanggal buku kontrak normal | Tanggal BA Normal | Laporan Digital |
| Harga transaksi kontrak payung | BA Payung | Invoice Payung, DO, laporan |
| Nilai dan volume tagihan | Invoice | Pembayaran, DO, laporan |
| Tanggal dan nominal kas masuk | Pembayaran | DO, laporan |
| Nomor DO, unit tujuan, volume barang keluar | DO | Persediaan, laporan |
| Saldo barang | Mutasi persediaan dari DO/stok masuk | Dashboard dan stok |
| Nilai realisasi, sisa bayar, sisa volume, status SAP | Perhitungan dari sumber di atas | Laporan Digital dan ekspor |

## Alur BA kontrak normal

Pengguna hanya mengisi nomor BA, memilih kontrak, tanggal realisasi, dan
kuantitas pengambilan. Setelah kontrak dipilih, unit, komoditi, deskripsi,
satuan, harga, serta pajak diturunkan dari kontrak dan hanya ditampilkan.

Tanggal BA otomatis menjadi tanggal buku. BA normal tidak memiliki Bulan Buku
manual. Saat BA dipilih pada DO normal, tanggal BA menggantikan rencana
pengambilan; Laporan Digital memakai tanggal BA tersebut sebagai periode
pelaporan. Jika BA belum ada, DO tetap memakai rencana pengambilan.

## Alur BA kontrak payung

Kontrak payung menyimpan syarat tetap, sedangkan BA menyimpan fakta transaksi
yang berubah pada setiap pengambilan. Pengguna mengisi nomor BA, tanggal BA,
bulan buku, kuantitas, dan harga transaksi. Unit hanya dipilih bila kontrak
memiliki lebih dari satu unit; komoditi dan deskripsi selalu diturunkan dari
unit atau kontrak.

Satu BA payung hanya dapat terhubung ke satu invoice. Bulan buku yang diisi
pada BA menjadi periode pelaporannya.

## Prinsip penegakan aturan

Antarmuka membantu pengguna, tetapi integritas data tidak boleh bergantung
pada antarmuka. API wajib menegakkan hal berikut.

- BA terkait ke kontrak yang valid.
- Metadata BA diturunkan dari kontrak atau unit kontrak.
- BA normal tidak menyimpan Bulan Buku dan harganya mengikuti kontrak.
- BA payung wajib memiliki Bulan Buku dan harga transaksi lebih dari nol.
- Unit pada BA kontrak multi-unit harus milik kontrak tersebut.
- Invoice payung hanya dapat memakai BA dari kontrak yang sama, dan satu BA
  tidak dapat dipakai lebih dari satu invoice.
- DO menolak BA yang tidak ada atau berasal dari kontrak lain.
- Laporan Digital hanya menghitung dari data sumber; laporan tidak boleh
  menjadi tempat pengisian atau sumber data transaksi.

## Kontrol audit

- BA normal tidak meminta Bulan Buku, harga, atau detail kontrak secara
  berulang; tanggal BA adalah tanggal buku.
- BA payung hanya meminta fakta transaksi yang belum ada pada kontrak.
- DO menggunakan tanggal BA apabila BA tersedia dan sesuai kontrak.
- Laporan mengambil tanggal BA normal atau Bulan Buku BA payung, tanpa input
  periode manual.
- Transaksi pengecualian tetap ditandai sebagai `BYPASS`; data tersebut tidak
  boleh diperlakukan sebagai sumber kontrak.

## Checklist pengembangan

Sebelum menambah field pada form atau API, jawab pertanyaan berikut.

1. Apakah fakta ini sudah ada pada entitas sebelumnya? Jika ya, tampilkan
   baca-saja atau turunkan di server.
2. Apakah fakta ini berubah pada transaksi saat ini? Jika ya, simpan di
   entitas transaksi yang paling dekat dengan kejadiannya.
3. Apakah API tetap benar bila dipanggil tanpa antarmuka? Jika tidak, tambahkan
   validasi atau derivasi di server sebelum mengubah UI.
