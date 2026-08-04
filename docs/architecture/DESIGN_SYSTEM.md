# Design System — Monitoring Pemasaran

Standar visual dan pola halaman untuk React SPA (`frontend/`).  
Semua UI baru **wajib** mengikuti dokumen ini. Guideline ringkas lama: [DESIGN_GUIDELINES.md](./DESIGN_GUIDELINES.md).

**Prompt siap pakai untuk redesign dengan AI lain:** [PROMPT_UI_UX_REDESIGN.md](./PROMPT_UI_UX_REDESIGN.md)

---

## 1. Prinsip

| Prinsip | Arti |
|---------|------|
| **Data over decoration** | Hindari gradient besar, shadow tebal, hero berlebih |
| **Action-first** | Halaman operasional: aksi utama terlihat tanpa scroll panjang |
| **Konsisten** | Satu cara untuk header, filter, list, status, empty state |
| **Padat tapi legible** | Label `text-xs`, nilai penting `font-semibold` + `tabular-nums` |
| **Token, bukan hardcode** | Pakai `primary`, `muted`, `destructive`, `Badge` variants — hindari `rose-600` ad-hoc kecuali semantik aksi darurat yang sudah ada di pattern `StatusPill` |

**Bahasa UI:** Indonesia. **Kode:** Inggris.

---

## 2. Fondasi (token)

### Warna (HSL CSS vars → Tailwind)

| Token | Penggunaan |
|-------|------------|
| `background` / `foreground` | Latar app, teks utama |
| `card` | Panel konten |
| `muted` / `muted-foreground` | Latar sekunder, label |
| `primary` | Aksi utama (brand teal/emerald) |
| `destructive` | Bahaya / hapus / belum wajib |
| `border` / `input` / `ring` | Garis & focus |

Definisi: `frontend/src/index.css` + map di `frontend/tailwind.config.js`.

Brand scale: `brand-50` … `brand-900` (emerald).

### Tipografi

- Font: **Inter** (`font-sans`)
- Judul halaman: `text-base font-semibold` (page padat) atau `text-lg font-semibold`
- Deskripsi: `text-sm text-muted-foreground` atau `text-xs`
- Label form/filter: `text-xs font-medium text-muted-foreground`
- Angka: selalu `tabular-nums`

### Spacing halaman

| Elemen | Standar |
|--------|---------|
| Konten main | `max-w-[1600px] p-5 lg:p-6` (layout) |
| Halaman padat/opsional sempit | `PageShell width="narrow"` → `max-w-5xl` |
| Stack vertikal section | `space-y-4` (default), `space-y-3` (padat) |
| Gap filter | `gap-2` |
| Tinggi kontrol | `h-8` atau `h-9` (form) |

---

## 3. Komponen primitif (wajib)

| Kebutuhan | Pakai | Lokasi |
|-----------|--------|--------|
| Button, Input, Card, Dialog, Badge, Label, Select | **shadcn** | `components/ui/*` |
| Class merge | `cn()` | `lib/utils` |
| Status teks/chip | `Badge` atau `StatusPill` | `ui/badge`, `common/StatusPill` |
| KPI besar | `StatCard` | `common/StatCard` |
| KPI baris padat | `StatPills` | `common/StatPills` |
| Empty | `EmptyState` | `common/EmptyState` |
| Loading | `LoadingSkeleton` | `common/LoadingSkeleton` |
| Upload PDF | `DocumentUpload` | `common/DocumentUpload` |

**Jangan** buat button/input custom dengan class acak jika primitif sudah ada.

### Status semantik (`StatusPill` / `Badge`)

| Semantik | Variant / tone |
|----------|----------------|
| Lengkap / OK | `success` |
| Perlu aksi / kurang | `destructive` atau `warning` |
| Info netral | `secondary` / `info` |
| Aksi upload wajib unit | Button `default` atau variant action di pattern list |

---

## 4. Pola halaman (templates)

Implementasi di `frontend/src/components/patterns/`.

### 4.1 `PageShell`

Wrapper konten page.

```tsx
<PageShell width="narrow"> {/* default | narrow | wide | full */}
  ...
</PageShell>
```

### 4.2 `PageHeader`

Judul + deskripsi singkat + actions (kanan).

```tsx
<PageHeader
  title="Dokumen Unit"
  description="Wajib: BA Serah Terima Barang per DO"
  actions={<Button size="sm">Muat</Button>}
/>
```

*Catatan:* `AppLayout` sudah menampilkan `pageMeta.description` di atas outlet. Hindari mengulang deskripsi panjang dua kali — page boleh deskripsi satu baris di header, atau andalkan meta saja.

### 4.3 `FilterToolbar`

Baris filter di dalam `Card` padat: select, search, toggle.

```tsx
<FilterToolbar>
  <NativeSelect ... />
  <Input ... />
</FilterToolbar>
```

### 4.4 `StatPills`

Ringkasan angka satu baris (bukan grid kartu besar).

```tsx
<StatPills
  items={[
    { label: 'Total', value: 12 },
    { label: 'Belum', value: 3, tone: 'danger' },
    { label: 'Lengkap', value: 9, tone: 'success' },
  ]}
/>
```

### 4.5 `ListPanel`

Kontainer list/tabel dengan loading + empty state.

```tsx
<ListPanel loading={loading} empty={!rows.length} emptyTitle="Tidak ada data">
  {rows.map(...)}
</ListPanel>
```

### 4.6 Form + preview (kontrak/invoice/DO)

Pola existing: grid 2 kolom form kiri + preview kanan ~600px, preview font 9pt.  
Jangan diubah format dokumen baku. Komponen: `PreviewPanel`, form + `react-hook-form` + Zod.

### 4.7 Repository list

Pola: filter bar + `DataTable` / tabel + aksi download/preview (`DocxPreview`).

---

## 5. Checklist page baru

- [ ] Bungkus dengan `PageShell` (+ `PageHeader` jika perlu judul lokal)
- [ ] Filter pakai `FilterToolbar` + kontrol `h-8`/`h-9`
- [ ] Ringkasan angka: `StatPills` atau `StatCard` (dashboard)
- [ ] List: `ListPanel` + baris padat, status via `Badge`/`StatusPill`
- [ ] Empty/loading: `EmptyState` / `LoadingSkeleton`
- [ ] Aksi utama: `Button` shadcn, 1 aksi primer per baris operasional
- [ ] Tidak ada gradient hero / chart kecuali halaman analitik (Dashboard/Laporan)
- [ ] Types di `types/index.ts`, label UI bahasa Indonesia

---

## 6. Anti-pattern

| Jangan | Ganti dengan |
|--------|----------------|
| Hero gradient + ring chart di halaman unit | `PageHeader` + `StatPills` |
| Duplikat deskripsi panjang | Meta di `pageMeta` atau 1 baris di header |
| Warna hex/rose acak di mana-mana | Token + `StatusPill` tones |
| Input height beda-beda | `h-8` (toolbar) / `h-9` (form) |
| Empty state teks polos | `EmptyState` |
| Copy-paste layout 3 halaman | Import pattern components |

---

## 7. Evolusi

1. Page baru → pattern dulu, baru logic.
2. Perlu komponen UI baru → tambah di `ui/` (shadcn-style) atau `common/`, dokumentasikan di sini.
3. Ubah token global → update `index.css` + panduan ini bersamaan.

### Migrasi bertahap (status)

| Halaman | Status |
|---------|--------|
| Dokumen Unit | ✅ full patterns |
| Dokumen (pantau) | ✅ `PageShell` + `PageHeader` |
| Persediaan | ✅ |
| Berita Acara | ✅ |
| Input Bypass | ✅ |
| Arsip Kontrak / Invoice / DO / Pembayaran | ✅ |
| Dashboard | ✅ header + shell (charts tetap) |
| Laporan Digital | ✅ header + shell (tabel tetap) |
| Form Kontrak / Invoice / DO / Pembayaran | ✅ header + shell (form+preview tidak diubah) |
| Users / Trace Kontrak | ✅ |

*Maintainer: update §4–§5 dan tabel migrasi saat pola baru disepakati.*
