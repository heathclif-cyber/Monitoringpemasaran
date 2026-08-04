# Prompt: Redesign UI/UX — Monitoring Pemasaran (standar proyek)

Salin blok **PROMPT** di bawah ke AI lain (Claude, Cursor, ChatGPT, dll.) saat minta redesign.  
Sesuaikan bagian `[SCOPE]` dan `[PAGE]` saja.

---

## PROMPT (copy dari sini)

```
Kamu adalah senior product designer + frontend engineer untuk aplikasi **Monitoring Pemasaran PTPN I Regional 8**.

## Konteks produk
- SPA React 18 + TypeScript + Vite + Tailwind + shadcn/ui (Radix).
- Backend FastAPI; API request/response **jangan diubah** tanpa diskusi.
- UI labels: **Bahasa Indonesia**. Kode: **Inggris**.
- Domain: kontrak penjualan, invoice, pembayaran, DO, dokumen unit (BA Serah Terima), laporan, stok, Superman.
- Format dokumen Word (.docx) kontrak/invoice/DO/kuitansi **sudah baku perusahaan — JANGAN ubah layout export/preview docx**.

## Sumber standar (wajib dibaca dulu di repo)
1. `docs/architecture/DESIGN_SYSTEM.md` — design system + pola halaman + checklist
2. `docs/architecture/DESIGN_GUIDELINES.md` — palet & tipografi ringkas
3. Section **UI Design System (wajib)** di `CLAUDE.md`
4. Implementasi pola: `frontend/src/components/patterns/`
5. Primitif: `frontend/src/components/ui/` (shadcn)
6. Common: `frontend/src/components/common/` (StatCard, EmptyState, DocumentUpload, dll.)

## Prinsip UI/UX (non-negotiable)
1. **Data over decoration** — tidak ada hero gradient besar, glassmorphism tebal, atau chart berlebih di halaman operasional.
2. **Action-first** — aksi utama (Simpan, Upload, Export) jelas; halaman unit/list harus **padat**, minim ruang kosong sia-sia.
3. **Konsisten** — satu pola untuk header, filter, list, status, empty, loading.
4. **Token, bukan hardcode** — pakai `primary`, `muted`, `destructive`, `border`, `card`, `Badge`/`StatusPill`/`StatPills`. Hindari warna ad-hoc (mis. rose hex) kecuali semantik yang sudah ada di StatusPill/StatPills.
5. **Tipografi** — font Inter; label `text-xs text-muted-foreground`; angka `tabular-nums`.
6. **Kontrol** — toolbar `h-8`, form `h-9`; filter di dalam pola FilterToolbar (atau FilterBar existing).
7. **Aksesibilitas dasar** — kontras cukup, tombol punya label, fokus ring token.

## Pola halaman yang HARUS dipakai
Import:
```ts
import {
  PageShell, PageHeader, FilterToolbar, StatPills, ListPanel, StatusPill,
} from '@/components/patterns'
```

| Kebutuhan | Pola |
|-----------|------|
| Wrapper | `PageShell` (`default` \| `narrow` \| `wide` \| `full`) |
| Judul + deskripsi + actions | `PageHeader` |
| Filter bar | `FilterToolbar` |
| KPI 1 baris (ops/unit) | `StatPills` |
| KPI dashboard besar | `StatCard` |
| List + loading + empty | `ListPanel` + `EmptyState` / `LoadingSkeleton` |
| Status chip | `StatusPill` atau `Badge` |
| Form primitif | shadcn `Button`, `Input`, `Card`, `Dialog`, `Label`, `NativeSelect` |
| Upload PDF | `DocumentUpload` |

### Pola layout baku (jangan dirombak tanpa alasan kuat)
- **Form dokumen** (Kontrak, Invoice, DO, Pembayaran): form kiri + **preview kanan ~600px**, font preview **9pt**. Isi form = react-hook-form + Zod.
- **Repository**: filter + tabel/DataTable + preview/download DocxPreview.
- **Dashboard/Laporan**: StatCard + Recharts boleh.
- **Halaman unit/operasional** (Dokumen Unit): padat, StatPills + list; **tanpa** hero/chart dekoratif.
- **Dokumen unit**: hanya **BA Serah Terima Barang** (wajib per DO); tampilkan **volume DO + satuan** di samping status; BA Panen **tidak** dilacak di UI unit.

### Tanggung jawab dokumen (bisnis)
- **Regional:** kontrak, invoice, rekening koran, faktur pajak, DO file, deklarasi, kuitansi (opsional), Superman.
- **Unit:** BA Serah Terima Barang saja (per DO) + volume yang diserahkan.

## Anti-pattern (dilarang)
- Redesign yang memecah API / menghapus field bisnis.
- Mengubah format .docx preview/export.
- Membuat button/input custom yang menduplikasi shadcn.
- Empty state teks polos tanpa EmptyState.
- Halaman unit dengan banyak chart/pie/ring besar.
- Warna acak di mana-mana; duplikasi header panjang vs pageMeta.

## Cara kerja redesign
1. Baca file page + pola terkait **sebelum** edit.
2. Redesign **visual & UX saja** dalam kerangka pola di atas; refactor layout lewat `patterns/`, bukan one-off CSS.
3. Jika butuh komponen baru: taruh di `ui/` (shadcn-style) atau `common/` / `patterns/`, dan sebutkan di DESIGN_SYSTEM.md.
4. Jangan refactor file di luar scope.
5. Setelah edit: pastikan `npx tsc --noEmit` lolos (di folder `frontend/`).
6. UI labels tetap Indonesia.

## Scope tugas kali ini
[SCOPE: contoh — "redesign halaman Dokumen Unit agar lebih jelas untuk petugas unit" / "rapikan Repo Invoice" / "konsolidasi spacing form Kontrak tanpa ubah preview"]

## Halaman / file target
[PAGE: path file, mis. frontend/src/pages/UnitDocPage.tsx]

## Hasil yang diharapkan
- UX lebih jelas, padat, konsisten dengan design system.
- Diff minimal di luar UI yang diminta.
- Ringkas: apa yang diubah + kenapa (1–2 paragraf).
- Jangan deploy/push kecuali saya minta.
```

---

## Variasi singkat (satu paragraf)

Jika butuh prompt super pendek:

```
Redesign UI di repo Monitoring Pemasaran (React+Tailwind+shadcn). WAJIB ikuti docs/architecture/DESIGN_SYSTEM.md dan components/patterns (PageShell, PageHeader, FilterToolbar, StatPills, ListPanel, StatusPill). Prinsip: data over decoration, action-first, padat, token warna (bukan hardcode), label Indonesia. Jangan ubah API atau format .docx. Form dokumen: form+preview 600px/9pt. Unit hanya BA Serah Terima + volume DO. Target: [PAGE]. Jangan push/deploy kecuali diminta.
```

---

## Checklist review hasil AI lain

Setelah AI selesai redesign, cek:

- [ ] Masih import/pakai `@/components/patterns` dan shadcn?
- [ ] Tidak ada hero/chart berlebih di page operasional?
- [ ] Form preview docx tidak berubah?
- [ ] Endpoint API tidak diubah?
- [ ] Label Indonesia?
- [ ] Volume BA Serah Terima masih terlihat di Dokumen Unit?
- [ ] `tsc --noEmit` OK?

---

*Update file ini jika design system berubah (token baru, pola baru).*
