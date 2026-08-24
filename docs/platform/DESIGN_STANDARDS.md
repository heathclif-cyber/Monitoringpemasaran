# Standar desain lintas aplikasi

Dokumen ini adalah kontrak desain Layer Zero. Fondasinya mengadopsi AsetOpt
Monitor dan berlaku untuk Monitoring Pemasaran maupun aplikasi berikutnya.

## Stack dan struktur

- React 18 + TypeScript strict + Vite.
- Tailwind CSS dengan CSS variables HSL.
- shadcn/ui (Radix) untuk primitive yang aksesibel.
- Zustand untuk state aplikasi, react-hook-form + Zod untuk form, dan Lucide
  untuk ikon.
- `types/index.ts` adalah sumber tunggal type frontend.
- `components/ui` untuk primitive, `components/common` untuk komponen lintas
  halaman, dan `components/feature` untuk komponen khusus domain.

## Token visual

| Token | Nilai / aturan |
|---|---|
| Font | Inter, base 14px |
| Primary | `210 61% 28%` (navy/biru AsetOpt) |
| Secondary/muted | skala biru muda netral |
| Success | hijau; hanya untuk status positif atau selesai |
| Warning | amber/oranye |
| Error | merah |
| Radius | `0.5rem` |
| Konten | padding `p-5`; jarak section `space-y-6` |
| Ikon menu | Lucide 15–16 px, selalu dengan label |

Warna status bersifat semantik: hijau tidak dipakai sebagai brand utama. Warna
aktif yang mewakili status selesai tetap hijau, sedangkan aksi utama dan
navigasi memakai biru/navy.

## Pola interaksi

- Sidebar tetap di kiri dan header tetap di atas pada layar desktop.
- Navigasi dideklarasikan sebagai data; grup menu dapat dibuka/tutup.
- Halaman memiliki satu aksi primer yang jelas.
- Form memakai primitive shadcn dan validasi eksplisit; fakta dari entitas
  sebelumnya ditampilkan baca-saja, bukan diminta ulang.
- Tabel, badge status, empty state, loading skeleton, dialog konfirmasi, dan
  tampilan mata uang memakai komponen bersama.
- Bahasa antarmuka Indonesia, kode Inggris.
- Aksesibilitas minimum: fokus keyboard terlihat, label form jelas, warna tidak
  menjadi satu-satunya penanda status, dan ikon ambigu selalu memiliki teks.

## Adopsi bertahap

Jangan melakukan rewrite besar hanya untuk tampilan. Saat halaman disentuh,
terapkan token dan komponen bersama terlebih dahulu. Pola dokumen operasional
yang sudah baku tetap dipertahankan sampai ada keputusan perubahan proses.

## Kepemilikan

AsetOpt Monitor menjadi referensi awal desain. Perubahan standar lintas aplikasi
dibahas di Layer Zero dan diperbarui pada kedua repository pada perubahan yang
sama.
