# Proxy Chromium Superman di Railway

Gunakan dokumen ini bila Railway tidak dapat membuka `https://superman.ptpn1.co.id/` dari Chromium. Proxy dipakai **hanya** oleh browser Superman; trafik aplikasi dan database Railway tidak berubah.

## Variabel Railway

Tambahkan variabel berikut pada service aplikasi Railway. Jangan simpan nilainya di Git.

```env
SUPERMAN_PROXY_SERVER=http://host-proxy:port
SUPERMAN_PROXY_USERNAME=nama-user-proxy
SUPERMAN_PROXY_PASSWORD_B64=<password-proxy-base64>
```

`SUPERMAN_PROXY_USERNAME`, `SUPERMAN_PROXY_PASSWORD`, dan `SUPERMAN_PROXY_PASSWORD_B64` opsional untuk proxy tanpa autentikasi. Jika memakai password biasa, gunakan `SUPERMAN_PROXY_PASSWORD`; nilai base64 lebih aman terhadap karakter khusus.

Tetap pertahankan:

```env
SUPERMAN_BROWSER=chromium
SUPERMAN_DEFAULT_EXECUTOR=server
SUPERMAN_STATE_PATH=/data/.superman_state.json
```

## Setelah variabel diisi

1. Redeploy service Railway.
2. Klik **Buat Deklarasi Superman**.
3. Captcha harus muncul dari sesi Chromium yang melewati proxy.
4. Setelah jawaban benar, state sesi disimpan kembali di volume `/data`.

Pilih proxy dengan IP egress tetap dan lokasi Indonesia/Singapore agar dapat di-whitelist bila portal Superman membatasi akses datacenter.
