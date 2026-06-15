// ============================================================
// Union / Enum Types
// ============================================================

export type KontrakStatus = 'Draft' | 'Active'
export type TipeAlur = 'STANDAR' | 'PAYUNG_BA'
export type BAStatus = 'Draft' | 'Selesai' | 'Ter-invoice'
export type InvoiceStatus = 'Unpaid' | 'Paid'
export type Satuan = 'Kg' | 'Butir'
export type PpnStatus = 'true' | 'false'
export type PphStatus = 'true' | 'false'
export type PphDisetorStatus = 'true' | 'false'

export type SapField =
  | 'superman'
  | 'kontrak_sap'
  | 'so_sap'
  | 'do_sap'
  | 'billing_sap'
  | 'link_deklarasi_penerimaan'
  | 'link_berita_acara_serah_terima'

export type DocumentEntityType = 'kontrak' | 'invoice' | 'do' | 'bypass' | 'ba'
export type DocumentDocType = 'kontrak' | 'invoice' | 'kuitansi' | 'do' | 'deklarasi' | 'berita_acara'

// ============================================================
// Entity Interfaces — matching backend models.py / schemas.py
// ============================================================

export interface KontrakUnit {
  id: number
  no_kontrak: string
  nama_unit: string
  urutan: number
  volume: number
  komoditi?: string | null
  jenis_komoditi?: string | null
  satuan?: string | null
  tahun_panen?: string | null
  deskripsi_produk?: string | null
}

export interface Kontrak {
  no_kontrak: string
  tanggal_kontrak: string // date
  status: string
  pembeli: string | null
  nama_direktur: string | null
  alamat_pembeli: string | null
  komoditi: string | null
  jenis_komoditi: string | null
  satuan: string | null
  tahun_panen: string | null
  kebun_produsen: string | null
  simbol: string | null
  packaging: string | null
  deskripsi_produk: string | null
  mutu: string | null
  pelabuhan_muat: string | null
  volume: number
  harga_satuan: number
  premi: number
  is_ppn: string
  ppn_persen: number
  is_pph: string
  pph_persen: number
  alamat_produksi: string | null
  chop: string | null
  pack_qty: number
  banyaknya_bale_karung: number
  no_kav_chop: string | null
  kondisi_penyerahan: string | null
  waktu_penyerahan: string | null
  penyerahan_hari: number
  lama_pembayaran_hari: number
  levering: string | null
  catatan: string | null
  no_reff: string | null
  bid_offer_nomor: string | null
  pemilik_komoditas: string | null
  penjual: string | null
  pembayaran_metode: string | null
  pembayaran_cara: string | null
  pembayaran_bank: string | null
  pembayaran_atas_nama: string | null
  pembayaran_rek_no: string | null
  syarat_syarat: string | null
  dasar_ketentuan: string | null
  lokasi: string | null
  tipe_alur?: TipeAlur | string
  // Computed
  nilai_transaksi: number
  nominal_ppn: number
  jatuh_tempo_pembayaran: string | null
  terbilang: string | null
  units?: KontrakUnit[]
}

export interface Invoice {
  no_invoice: string
  no_kontrak: string
  tanggal_transaksi: string // date
  status_invoice: string
  pph_22_persen: number
  nama_unit: string | null
  no_ba?: string | null
  // Computed
  jumlah_pembayaran: number
  terbilang_invoice: string | null
  // Joined relation
  kontrak?: Kontrak
}

export interface DeliveryOrder {
  no_do: string
  no_invoice: string
  tanggal_do: string // date
  kepada_unit: string | null
  alamat_unit: string | null
  tanggal_pembayaran: string | null
  nominal_transfer: number
  is_pph_disetor: string
  rencana_pengambilan: string | null
  no_ba?: string | null
  // SAP fields
  superman: string | null
  kontrak_sap: string | null
  so_sap: string | null
  do_sap: string | null
  billing_sap: string | null
  link_deklarasi_penerimaan: string | null
  link_berita_acara_serah_terima: string | null
  // Computed
  selisih: number
  volume_do: number
  // Joined
  invoice?: Invoice
}

export interface BeritaAcara {
  no_ba: string
  no_kontrak: string
  tanggal_ba: string
  volume_ba: number
  nama_unit?: string | null
  komoditi?: string | null
  deskripsi?: string | null
  link_berita_acara?: string | null
  status: BAStatus | string
}

export interface BAAvailable {
  no_ba: string
  tanggal_ba: string | null
  volume_ba: number
  nama_unit?: string | null
  komoditi?: string | null
  status: string
}

export interface LaporanBypass {
  id: number
  unit: string | null
  komoditi: string | null
  tanggal: string
  nominal: number
  pembeli: string | null
  deskripsi: string | null
  volume: number
  satuan: string
  superman: string | null
  kontrak_sap: string | null
  so_sap: string | null
  do_sap: string | null
  billing_sap: string | null
  link_deklarasi_penerimaan: string | null
}

// ============================================================
// Laporan Row (from GET /api/laporan)
// ============================================================

export interface LaporanRow {
  No_DO: string
  No_Invoice: string
  No_Kontrak: string
  Unit: string
  Komoditi: string
  Satuan: string
  Billing_Date: string
  Tanggal_Transfer: string
  Jumlah_Transfer: number
  Pelunasan: number
  Mitra_Pembeli: string
  Deskripsi_Produk: string
  Jumlah_Invoice: number
  Harga_Satuan: number
  Jumlah_DO: number
  Pendapatan_Pokok: number
  Pendapatan_Setelah_PPN: number
  DPP_Pokok: number
  Pajak_PPN: number
  PPh_Nominal: number
  PPh_Setor: string
  Kewajiban_Pembayaran: number
  Sisa_Pembayaran: number
  Sisa_Volume: number
  Bulan_Buku: string
  No_BA?: string
  Tanggal_BA?: string
  Rencana_Pengambilan: string
  Raw_Date: string
  Superman: string
  Kontrak_SAP: string
  SO_SAP: string
  DO_SAP: string
  Billing: string
  Link_Deklarasi_Penerimaan: string
  Link_Berita_Acara_Serah_Terima: string
}

export interface DocumentUpload {
  id: number
  entity_type: DocumentEntityType
  entity_id: string
  doc_type: DocumentDocType
  file_name: string
  onedrive_item_id: string | null
  web_url: string
  uploaded_at: string | null
}

export interface DocumentStatusResponse {
  configured: boolean
  mode: 'personal' | 'organizational' | 'pending_auth' | null
  auth_url: string | null
  redirect_uri: string | null
  doc_types: DocumentDocType[]
  entity_types: DocumentEntityType[]
}

export interface DocumentSlot {
  doc_type: DocumentDocType
  label: string
  uploaded: boolean
  file_name: string | null
  web_url: string | null
  uploaded_at: string | null
  document_id: number | null
}

export interface DocumentCompletenessSummary {
  total: number
  uploaded: number
  missing: number
}

export interface DocumentCompleteness {
  entity_type: DocumentEntityType
  entity_id: string
  display_label: string
  sublabel: string | null
  slots: DocumentSlot[]
  summary: DocumentCompletenessSummary
  related: DocumentCompleteness[]
}

export interface DocumentReference {
  entity_type: DocumentEntityType
  entity_id: string
  label: string
  sublabel: string | null
}

// ============================================================
// Dashboard Types
// ============================================================

export interface SapStats {
  missing_kontrak: number
  missing_so: number
  missing_do: number
  missing_billing: number
}

export interface DashboardSummary {
  total_kontrak: number
  total_invoice: number
  total_do: number
  total_pendapatan: number
  total_nilai_invoice: number
  total_cash_in: number
  total_volume_all: number
  total_volume_kg: number
  total_volume_butir: number
  sap_stats: SapStats
}

export interface ChartData {
  labels: string[]
  values: number[]
}

export interface BulananChart {
  labels: string[]
  pendapatan: number[]
  invoice: number[]
  cashin: number[]
  volume_kg: number[]
  volume_butir: number[]
}

export interface SapBulanan {
  labels: string[]
  missing_kontrak: number[]
  missing_so: number[]
  missing_do: number[]
  missing_billing: number[]
}

export interface DashboardCharts {
  komoditas: ChartData
  unit: ChartData
  bulanan: BulananChart
  sap_bulanan: SapBulanan
}

export interface DashboardResponse {
  summary: DashboardSummary
  charts: DashboardCharts
  available_years: number[]
  selected_year: number
  available_units: string[]
  selected_unit: string
  available_komoditas: string[]
  selected_komoditi: string
}

export interface DashboardFilters {
  year: number
  unit: string
  komoditi: string
}

// ============================================================
// Input Types (for forms)
// ============================================================

export interface KontrakInput {
  no_kontrak: string
  tanggal_kontrak: string
  status?: string
  pembeli?: string
  nama_direktur?: string
  alamat_pembeli?: string
  komoditi?: string
  jenis_komoditi?: string
  satuan?: string
  tahun_panen?: string
  kebun_produsen?: string
  simbol?: string
  packaging?: string
  deskripsi_produk?: string
  mutu?: string
  pelabuhan_muat?: string
  volume?: number
  harga_satuan?: number
  premi?: number
  is_ppn?: string
  ppn_persen?: number
  is_pph?: string
  pph_persen?: number
  alamat_produksi?: string
  chop?: string
  pack_qty?: number
  banyaknya_bale_karung?: number
  no_kav_chop?: string
  kondisi_penyerahan?: string
  waktu_penyerahan?: string
  penyerahan_hari?: number
  lama_pembayaran_hari?: number
  levering?: string
  catatan?: string
  no_reff?: string
  bid_offer_nomor?: string
  pemilik_komoditas?: string
  penjual?: string
  pembayaran_metode?: string
  pembayaran_cara?: string
  pembayaran_bank?: string
  pembayaran_atas_nama?: string
  pembayaran_rek_no?: string
  syarat_syarat?: string
  dasar_ketentuan?: string
  lokasi?: string
  tipe_alur?: TipeAlur | string
  units?: { nama_unit: string; volume?: number; komoditi?: string; jenis_komoditi?: string; satuan?: string; tahun_panen?: string; deskripsi_produk?: string }[]
}

export interface InvoiceInput {
  no_invoice: string
  no_kontrak: string
  tanggal_transaksi: string
  status_invoice?: string
  pph_22_persen?: number
  no_ba?: string
  jumlah_pembayaran?: number
  nama_unit?: string
}

export interface BeritaAcaraInput {
  no_ba: string
  no_kontrak: string
  tanggal_ba: string
  volume_ba: number
  nama_unit?: string
  komoditi?: string
  deskripsi?: string
  link_berita_acara?: string
  status?: string
}

export interface DeliveryOrderInput {
  no_do: string
  no_invoice: string
  tanggal_do: string
  kepada_unit?: string
  alamat_unit?: string
  tanggal_pembayaran?: string | null
  nominal_transfer?: number
  is_pph_disetor?: string
  rencana_pengambilan?: string | null
  no_ba?: string
}

export interface BypassInput {
  Unit?: string
  Komoditi?: string
  Tanggal?: string
  Volume?: number
  Satuan?: string
  Nominal?: number
  Pembeli?: string
  Deskripsi?: string
}

export interface SapUpdateInput {
  No_DO: string
  Superman?: string
  Kontrak_SAP?: string
  SO_SAP?: string
  DO_SAP?: string
  Billing?: string
  Link_Deklarasi_Penerimaan?: string
  Link_Berita_Acara_Serah_Terima?: string
}

// ============================================================
// Kontrak Trace (dari GET /api/kontrak/trace)
// ============================================================

export type PaymentStatus = 'LUNAS' | 'SEBAGIAN' | 'BELUM'

export interface TraceDO {
  no_do: string
  tanggal_do: string | null
  tanggal_pembayaran: string | null
  rencana_pengambilan: string | null
  kepada_unit: string | null
  nominal_transfer: number
  volume_do: number
  selisih: number
  is_pph_disetor: string
}

export interface TraceInvoice {
  no_invoice: string
  tanggal_transaksi: string | null
  nama_unit: string | null
  jumlah_pembayaran: number
  kewajiban: number
  total_terbayar: number
  sisa_pembayaran: number
  persen_terbayar: number
  payment_status: PaymentStatus
  jumlah_do: number
  delivery_orders: TraceDO[]
}

export interface KontrakTraceSummary {
  total_nilai: number
  total_terbayar: number
  sisa_pembayaran: number
  persen_terbayar: number
  total_volume: number
  total_volume_do: number
  sisa_volume: number
  persen_volume: number
  jumlah_invoice: number
  jumlah_do: number
  overall_status: PaymentStatus
}

export interface KontrakTrace {
  no_kontrak: string
  tanggal_kontrak: string | null
  jatuh_tempo_pembayaran: string | null
  pembeli: string | null
  komoditi: string | null
  satuan: string | null
  nilai_transaksi: number
  volume: number
  kebun_produsen: string | null
  summary: KontrakTraceSummary
  invoices: TraceInvoice[]
}

// ============================================================
// Notification
// ============================================================

export type NotificationType = 'success' | 'error' | 'info' | 'warning'

export interface Notification {
  id: string
  message: string
  type: NotificationType
}

// ============================================================
// Nav Item (sidebar)
// ============================================================

export interface NavItem {
  label: string
  to?: string
  icon: string // lucide icon name
  children?: NavItem[]
}
