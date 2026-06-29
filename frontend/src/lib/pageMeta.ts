export interface PageMeta {
  title: string
  description?: string
  breadcrumb?: string
}

const PAGE_META: Record<string, PageMeta> = {
  '/': {
    title: 'Dashboard',
    description: 'Ringkasan pendapatan, volume, dan status SAP',
    breadcrumb: 'Beranda',
  },
  '/kontrak': {
    title: 'Buat Kontrak',
    description: 'Otomasi dokumen kontrak penjualan (.docx)',
    breadcrumb: 'Dokumen / Kontrak',
  },
  '/invoice': {
    title: 'Cetak Invoice',
    description: 'Buat proforma invoice dan kuitansi dari kontrak',
    breadcrumb: 'Dokumen / Invoice',
  },
  '/pembayaran': {
    title: 'Input Pembayaran',
    description: 'Catat transfer mitra dan buat SPPn Superman (no pembayaran = referensi AU58)',
    breadcrumb: 'Dokumen / Pembayaran',
  },
  '/delivery-order': {
    title: 'Delivery Order',
    description: 'Terbitkan DO berdasarkan pembayaran yang sudah dicatat',
    breadcrumb: 'Dokumen / Delivery Order',
  },
  '/laporan': {
    title: 'Laporan Digital',
    description: 'Rekapitulasi terintegrasi kontrak, invoice, dan DO',
    breadcrumb: 'Laporan',
  },
  '/bypass': {
    title: 'Input Bypass',
    description: 'Entri manual transaksi tanpa kontrak',
    breadcrumb: 'Laporan / Bypass',
  },
  '/upload': {
    title: 'Upload Dokumen',
    description: 'Unggah kontrak, invoice, DO, deklarasi, dan berita acara',
    breadcrumb: 'Dokumen / Upload',
  },
  '/stok': {
    title: 'Persediaan',
    description: 'Catat persediaan masuk per tanggal; penjualan DO mengurangi saldo otomatis',
    breadcrumb: 'Operasional / Persediaan',
  },
  '/repo/kontrak': {
    title: 'Arsip Kontrak',
    description: 'Kelola dan unduh dokumen kontrak tersimpan',
    breadcrumb: 'Repository / Kontrak',
  },
  '/repo/invoice': {
    title: 'Arsip Invoice',
    description: 'Kelola invoice dan kuitansi tersimpan',
    breadcrumb: 'Repository / Invoice',
  },
  '/repo/pembayaran': {
    title: 'Arsip Pembayaran',
    description: 'Kelola pembayaran mitra tersimpan',
    breadcrumb: 'Repository / Pembayaran',
  },
  '/repo/do': {
    title: 'Arsip Delivery Order',
    description: 'Kelola DO tersimpan',
    breadcrumb: 'Repository / DO',
  },
  '/kontrak-trace': {
    title: 'Trace Kontrak',
    description: 'Lacak alur pembayaran dan pengiriman per kontrak',
    breadcrumb: 'Repository / Trace',
  },
}

export function getPageMeta(pathname: string): PageMeta {
  return PAGE_META[pathname] ?? { title: 'Dashboard', breadcrumb: 'Beranda' }
}