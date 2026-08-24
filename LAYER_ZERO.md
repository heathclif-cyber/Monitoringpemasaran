# Layer Zero — Monitoring Pemasaran

Repository ini memakai [Layer Zero](./docs/platform/README.md) sebagai standar
bersama untuk identitas, integrasi, data, desain, dan operasi lintas aplikasi
PTPN I Regional 8.

## Status akses saat ini

- Pengguna login seperti biasa. Browser menyimpan sesi dan otomatis mengirim
  bearer token untuk setiap API; pengguna tidak pernah mengisi token manual.
- Endpoint transaksi dan laporan tidak dapat dibaca tanpa sesi login.
- Role `integrasi` adalah akun mesin, hanya untuk `/api/integrasi/v1/*`, dan
  tidak dapat memakai UI atau API operasional.
- Login Pemasaran dan AsetOpt masih terpisah. SSO pusat adalah target Layer
  Zero berikutnya, bukan fitur yang sudah aktif.

Sebelum membuat API, field lintas aplikasi, atau perubahan role, baca
[Identity & Access](./docs/platform/IDENTITY_AND_ACCESS.md) dan
[Integration Standards](./docs/platform/INTEGRATION_STANDARDS.md).
