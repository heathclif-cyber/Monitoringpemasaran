# Single Source of Data

## Tujuan

Setiap fakta bisnis hanya memiliki satu sumber pengisian. Form berikutnya boleh
menampilkan fakta itu sebagai informasi, tetapi tidak boleh meminta pengguna
mengetik ulang atau menyimpannya sebagai versi kedua.

Aturan ini berlaku untuk semua alur: **Kontrak → BA → Invoice → Pembayaran →
DO → Persediaan → Laporan Digital**.

## Peta sumber data

| Fakta bisnis | Sumber tunggal | Dipakai oleh |
|---|---|---|
| Mitra, komoditi, deskripsi, unit, satuan, harga normal, pajak, kuota kontrak | Kontrak / unit kontrak | BA, invoice, DO, stok, laporan |
| Nomor BA, tanggal realisasi, kuantitas pengambilan | BA | DO dan Laporan Digital |
| Bulan buku kontrak payung | BA Payung | Laporan Digital dan laporan HO |
| Tanggal buku kontrak normal | Tanggal BA Normal | Laporan Digital |
| Harga transaksi kontrak payung | BA Payung | Invoice Payung, DO, laporan |
| Nilai/volume tagihan | Invoice | Pembayaran, DO, laporan |
| Tanggal dan nominal kas masuk | Pembayaran | DO, laporan |
| Nomor DO, unit tujuan, volume barang keluar | DO | Persediaan, laporan |
| Saldo barang | Mutasi persediaan dari DO/stok masuk | Dashboard dan stok |
| Nilai realisasi, sisa bayar, sisa volume, status SAP | Perhitungan dari sumber di atas | Laporan Digital dan ekspor |

## Aturan BA

### BA Kontrak Normal

Pengguna hanya mengisi nomor BA, memilih kontrak, tanggal realisasi, dan
kuantitas pengambilan. Setelah kontrak dipilih, unit, komoditi, deskripsi,
satuan, harga, serta pajak adalah informasi kontrak dan tidak diinput ulang.

Tanggal BA adalah **tanggal buku otomatis**. Tidak ada kolom Bulan Buku pada
BA normal dan sistem tidak menyimpan periode buku manual untuk alur ini.

Saat BA dipilih pada DO normal, tanggal BA menggantikan rencana pengambilan.
Laporan Digital mengambil periode dari tanggal BA tersebut.

### BA Kontrak Payung

Kontrak Payung menyimpan syarat tetap, sedangkan BA menyimpan fakta transaksi
yang berubah per pengambilan. Pengguna mengisi nomor BA, tanggal BA, bulan
buku, kuantitas, dan harga transaksi.

Unit hanya dipilih jika kontrak memiliki lebih dari satu unit. Komoditi dan
deskripsi diturunkan otomatis dari unit yang dipilih atau dari kontrak. Satu BA
Payung hanya dapat terhubung ke satu invoice, dan bulan buku BA menjadi periode
pelaporannya.

## Alur wajib

### Kontrak Normal

1. Buat kontrak dan invoice.
2. Catat pembayaran.
3. Buat BA normal bila barang telah diambil; masukkan tanggal realisasi dan
   kuantitas saja.
4. Pilih BA tersebut pada DO. Bila BA belum ada, DO memakai rencana
   pengambilan.
5. Setelah BA dipilih, tanggal BA adalah tanggal pengambilan efektif dan
   tanggal buku laporan.

### Kontrak Payung

1. Buat kontrak payung tanpa mengulang volume/harga transaksi.
2. Buat BA Payung untuk setiap realisasi; isi bulan buku, kuantitas, dan harga
   transaksi.
3. Buat invoice dengan memilih BA yang sama.
4. Catat pembayaran dan buat DO. Sistem selalu memakai BA yang terhubung pada
   invoice/DO.

## Penegakan di server

Antarmuka hanya membantu pengguna; integritas tidak boleh bergantung pada
antarmuka. API wajib menegakkan aturan berikut.

- BA harus terkait ke kontrak yang valid.
- Metadata BA (unit, komoditi, deskripsi) diturunkan dari kontrak/unit kontrak.
- BA normal selalu menyimpan `bulan_buku = null` dan harga mengikuti kontrak.
- BA payung wajib memiliki bulan buku dan harga transaksi lebih dari nol.
- Unit BA yang dikirim untuk kontrak multi-unit harus merupakan unit milik
  kontrak tersebut.
- Invoice payung wajib memilih BA dari kontrak yang sama; satu BA tidak boleh
  dipakai lebih dari satu invoice.
- DO wajib menolak BA yang tidak ada atau berasal dari kontrak lain.
- Laporan Digital tidak menjadi sumber data: ia hanya menghitung ulang dari
  kontrak, BA, invoice, pembayaran, dan DO.

## Hasil audit — 24 Agustus 2026

| Area | Hasil | Kontrol |
|---|---|---|
| BA normal | Tidak ada Bulan Buku dan tidak ada pengisian harga/detail kontrak berulang | Tanggal BA sebagai tanggal buku; metadata dipaksa dari kontrak |
| BA payung | Hanya fakta transaksi yang diisi per BA | Metadata dipaksa dari kontrak/unit; bulan buku dan harga wajib |
| Invoice payung | BA terhubung satu-ke-satu dengan invoice | Validasi kontrak sama dan BA belum digunakan |
| DO | BA normal opsional, BA payung wajib | Validasi BA ada, kontrak sama, tanggal BA menggantikan rencana |
| Laporan | Tidak menerima input periode manual | Mengambil tanggal BA normal atau Bulan Buku BA payung |
| Bypass | Pengecualian transaksi manual | Tetap ditandai sebagai `BYPASS`, tidak boleh diperlakukan sebagai sumber kontrak |

## Checklist perubahan berikutnya

Sebelum menambah field pada form, jawab tiga pertanyaan berikut.

1. Apakah fakta ini sudah ada pada entitas sebelumnya? Jika ya, tampilkan
   sebagai baca-saja atau turunkan di server.
2. Apakah fakta ini memang berubah pada transaksi saat ini? Jika ya, simpan di
   entitas transaksi yang paling dekat.
3. Apakah API tetap benar bila dipanggil tanpa antarmuka? Jika tidak, tambahkan
   validasi atau derivasi di server sebelum mengubah UI.
