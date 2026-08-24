# Identity & Access — Layer Zero

Dokumen ini menetapkan fondasi identitas lintas aplikasi. Tujuannya bukan
memusatkan database transaksi, melainkan memusatkan **siapa** yang boleh
memakai aplikasi dan API apa.

## Aturan saat ini

1. Setiap API aplikasi membutuhkan bearer token, selain login dan health
   check yang dinyatakan publik.
2. Role aplikasi dipisahkan menjadi:
   - `admin`: administrasi pengguna dan perubahan data sesuai aplikasi.
   - `staff` atau `viewer`: akses manusia yang dibatasi kebutuhan kerja.
   - `integrasi`: akun mesin; hanya endpoint `/api/integrasi/v1/*` baca-saja.
3. Akun integrasi tidak dipakai untuk login manusia, tidak ditaruh di browser,
   dan tidak boleh membuka REST API generik.
4. Penonaktifan akun berlaku segera; token harus selalu dipetakan kembali ke
   akun aktif pada saat API dipanggil.
5. Satu-satunya admin aktif tidak boleh dapat dinonaktifkan atau diturunkan
   rolenya.

## Kondisi transisi

Pemasaran dan AsetOpt masih memiliki user store sendiri. AsetOpt kini
menyediakan `/api/users` dan menu **Kelola Pengguna** untuk admin lokal.
Ini adalah kontrol transisi, bukan tujuan akhir: pengguna yang sama tidak
boleh dikelola manual berulang di setiap aplikasi dalam jangka panjang.

## Target Layer Zero

Bangun layanan identity provider yang mendukung OIDC/OAuth 2.1. Ia menjadi
sumber tunggal pengguna, group, service account, dan client credential.

```text
Admin Platform ──> Identity Provider
                         ├─ token manusia ──> Pemasaran / AsetOpt
                         └─ client credential ──> API Gateway ──> API domain
```

Setiap token target minimal membawa `sub`, organisasi, aplikasi pemakai,
scope, waktu kedaluwarsa, dan `jti` untuk pencabutan/audit. Scope memakai
format domain, misalnya `pemasaran.revenue.read` dan `asetopt.revenue.read`.
Role UI tidak boleh otomatis menjadi izin API lintas aplikasi.

## Keputusan implementasi berikutnya

1. Tentukan owner platform dan administrator identitas.
2. Sediakan identity provider, secret manager, dan admin console Layer Zero.
3. Migrasikan aplikasi satu per satu untuk memverifikasi token pusat sambil
   mempertahankan role domain lokal selama masa transisi.
4. Ganti login akun/password untuk integrasi dengan client credentials,
   rotation, expiry pendek, dan audit penggunaan.
5. Tambahkan API gateway/registry sebelum aplikasi ketiga terhubung.

Tidak ada aplikasi boleh menganggap dirinya sumber kebenaran pengguna global
sebelum langkah tersebut selesai.
