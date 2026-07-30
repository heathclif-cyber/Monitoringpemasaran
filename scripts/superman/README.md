# Otomasi Superman

- `commands/`: perintah utama operator: login, deklarasi, dan agent desktop.
- `operations/`: tindakan operasional seperti login produksi, E2E, dan unggah session Railway.
- `probes/`: eksplorasi dan diagnosa teknis portal; bukan alur produksi.
- `tests/`: skrip verifikasi UI, API, dan regresi.
- `recovery/`: skrip pemulihan atau investigasi insiden historis.

Session dan seluruh keluaran lokal disimpan di `var/superman/`. Gunakan `commands/login.py` sebelum menjalankan alur deklarasi atau agent.
