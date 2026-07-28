# Panduan Skrip

Jalankan perintah dari root proyek, misalnya `python scripts/diagnostics/check_relations.py`.

- `data/`: seed dan impor data. Sebagian skrip menghapus atau mengganti data yang ada; baca kodenya dan pastikan target database sebelum menjalankan.
- `diagnostics/`: pemeriksaan relasi data dan verifikasi dashboard.
- `migrations/`: migrasi database satu kali.
- `deployment/`: tindakan deployment atau administrasi layanan eksternal. Kredensial harus disediakan melalui environment variable.
- `office/`: otomasi instalasi dan operasi server kantor.
- `legacy/`: skrip historis/satu-kali-pakai. Tidak digunakan oleh runtime aplikasi dan tidak boleh dijalankan tanpa peninjauan.
- `superman/`: otomasi portal Superman, dipisah menjadi `commands/`, `operations/`, `probes/`, `tests/`, dan `recovery/`.
- `utilities/`: utilitas pengembangan yang tidak terkait langsung dengan domain aplikasi.

Data lokal, session, hasil probe, database sementara, dan log berada di `var/` dan tidak masuk Git.
