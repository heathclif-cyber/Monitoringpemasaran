# Standar integrasi aplikasi

## Aturan wajib

- Gunakan HTTPS dan API versi, misalnya `/api/integrasi/v1/...`.
- Setiap endpoint integrasi bersifat eksplisit dan baca-saja kecuali telah
  disetujui sebagai endpoint tulis.
- Jangan memberi akses database langsung kepada aplikasi lain.
- Gunakan akun teknis ber-role `integrasi` untuk koneksi mesin-ke-mesin.
- Akun `integrasi` hanya diizinkan pada `/api/integrasi/v1/*`; ia tidak boleh
  memakai endpoint aplikasi umum maupun antarmuka web.
- Kirim `Authorization: Bearer <token>` pada setiap permintaan.
- Simpan kredensial akun teknis hanya pada environment/secret manager aplikasi
  pemakai, bukan di kode atau spreadsheet.
- Tanggal menggunakan ISO 8601 (`YYYY-MM-DD`), waktu menggunakan UTC ISO 8601,
  nominal dikirim sebagai angka, dan mata uang disebutkan eksplisit.
- Jangan mengubah arti atau menghapus field pada versi API yang sudah aktif.
  Tambahkan field baru sebagai opsional, atau terbitkan versi baru.
- Setiap record membawa ID sumber yang stabil dan dapat ditelusuri.

## Otorisasi v1

1. Administrator Pemasaran membuat user khusus, misalnya
   `svc-keuangan-pemasaran`, dengan role **Integrasi (API baca saja)**.
2. Server Keuangan meminta token melalui `POST /api/auth/login` memakai akun
   tersebut. Ini hanya mekanisme transisi; target Layer Zero adalah client
   credential dari identity provider pusat.
3. Server Keuangan memanggil endpoint integrasi dengan token tersebut.
4. Token berlaku sesuai kebijakan aplikasi saat ini dan diperbarui oleh server
   Keuangan sebelum kedaluwarsa.

Akun `integrasi` tidak dapat membuat, mengubah, atau menghapus data transaksi.

## Endpoint: arus kas masuk Pemasaran

`GET /api/integrasi/v1/cash-in`

Parameter opsional:

| Parameter | Bentuk | Keterangan |
|---|---|---|
| `tanggal_mulai` | `YYYY-MM-DD` | Tanggal pembayaran minimum |
| `tanggal_sampai` | `YYYY-MM-DD` | Tanggal pembayaran maksimum |
| `unit` | teks | Unit/kebun produsen |
| `limit` | 1–1000 | Maksimum data, default 100 |

Contoh respons disederhanakan:

```json
{
  "meta": {
    "schema_version": "1.0",
    "source": "pemasaran",
    "generated_at": "2026-08-24T00:00:00+00:00",
    "count": 1
  },
  "data": [
    {
      "id": "PAY-INV-001-1",
      "sumber": "pemasaran",
      "tanggal_kas_masuk": "2026-08-24",
      "nominal": 12500000,
      "mata_uang": "IDR",
      "status_pph_disetor": false,
      "referensi": {
        "no_pembayaran": "PAY-INV-001-1",
        "no_invoice": "INV-001",
        "no_kontrak": "KON-001",
        "no_ba": "BA-001",
        "no_do": "DO-001"
      },
      "asal_transaksi": {
        "pembeli": "Contoh Mitra",
        "unit": "Contoh Unit",
        "komoditi": "Karet",
        "tipe_kontrak": "STANDAR"
      }
    }
  ]
}
```

Keuangan menggunakan `id` atau `referensi.no_pembayaran` sebagai kunci
idempoten: satu pembayaran sumber tidak boleh dibuat menjadi jurnal yang sama
lebih dari sekali.

## Endpoint: pendapatan

`GET /api/integrasi/v1/revenue`

Kontrak respons berlaku untuk seluruh aplikasi pemilik pendapatan. Field inti:
`id`, `sumber`, `basis_pengakuan`, `tanggal_pengakuan`,
`pendapatan_pokok`, `ppn`, `pendapatan_bruto`, `pph`, `mata_uang`,
`referensi`, dan `asal_transaksi`.

Pemasaran menggunakan basis `realisasi_laporan_digital`: hanya realisasi yang
sudah memiliki DO atau pembayaran dicantumkan. Nilainya dihitung dari sumber
Laporan Digital yang sama, sehingga endpoint ini tidak menciptakan perhitungan
pendapatan kedua. Parameter `tanggal_mulai`, `tanggal_sampai`, `unit`, dan
`limit` memiliki bentuk yang sama dengan endpoint Cash In.

Pendapatan dan kas masuk adalah dua fakta berbeda. Keuangan boleh
merekonsiliasikan keduanya melalui referensi, tetapi tidak boleh menyamakan
tanggal atau nominalnya tanpa aturan akuntansi yang berlaku.

## Proses penambahan integrasi

1. Tetapkan aplikasi pemilik data dan aplikasi pemakai.
2. Tambahkan fakta yang dibutuhkan ke [katalog data](./DATA_CATALOG.md).
3. Rancang endpoint baca dengan contoh respons dan aturan akses.
4. Uji akses, filter tanggal, referensi sumber, dan kegagalan autentikasi.
5. Catat aplikasi pemakai dan owner bisnis pada changelog integrasi.

Endpoint tulis, webhook, dan sinkronisasi otomatis dua arah memerlukan
persetujuan desain terpisah karena risikonya lebih tinggi.
