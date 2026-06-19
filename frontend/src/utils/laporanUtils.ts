import type { LaporanRow } from '@/types'

const MONTHS_ID = ['', 'Januari', 'Februari', 'Maret', 'April', 'Mei', 'Juni', 'Juli', 'Agustus', 'September', 'Oktober', 'November', 'Desember']

export const MONTH_OPTIONS = Array.from({ length: 12 }, (_, i) => String(i + 1).padStart(2, '0'))
export const MONTH_LABELS = Object.fromEntries(MONTH_OPTIONS.map((m, i) => [m, MONTHS_ID[i + 1]]))

export function getCurrentMonthKey(): string {
  return String(new Date().getMonth() + 1).padStart(2, '0')
}

export function getCurrentYearKey(): string {
  return String(new Date().getFullYear())
}

export function getPreviousMonthKey(): string {
  const d = new Date()
  d.setMonth(d.getMonth() - 1)
  return String(d.getMonth() + 1).padStart(2, '0')
}

/** Filter periode saat halaman pertama dibuka: bulan & tahun berjalan */
export function getInitialLaporanMonthKeys(): string[] {
  return [getCurrentMonthKey()]
}

export function getInitialLaporanYearKey(): string {
  return getCurrentYearKey()
}

/** @deprecated Gunakan getInitialLaporanMonthKeys() */
export function getDefaultLaporanMonthKeys(): string[] {
  return getInitialLaporanMonthKeys()
}

export interface LaporanPeriodKeys {
  year: string
  month: string
}

function extractYearFromDateString(dateStr: string): string {
  if (!dateStr) return ''
  if (dateStr.length >= 7 && dateStr[4] === '-') return dateStr.slice(0, 4)
  if (dateStr.includes('/')) {
    const parts = dateStr.split('/')
    if (parts.length === 3) return parts[2]
  }
  return ''
}

function extractMonthFromDateString(dateStr: string): string {
  if (!dateStr) return ''
  if (dateStr.length >= 7 && dateStr[4] === '-') return dateStr.slice(5, 7)
  if (dateStr.includes('/')) {
    const parts = dateStr.split('/')
    if (parts.length === 3) return parts[1].padStart(2, '0')
  }
  return ''
}

export function extractPeriodKeys(row: LaporanRow, mode: 'TRANSFER' | 'RENCANA'): LaporanPeriodKeys {
  // Kontrak payung: bulan dari Bulan_Buku, tahun dari tanggal terkait
  if (row.No_BA) {
    const month = row.Bulan_Buku?.slice(0, 2) || ''
    const year = extractYearFromDateString(row.Rencana_Pengambilan || '')
      || extractYearFromDateString(row.Tanggal_BA || '')
      || extractYearFromDateString(row.Raw_Date || '')
    return { year, month }
  }

  if (mode === 'RENCANA') {
    const rencana = row.Rencana_Pengambilan || ''
    const month = rencana.length >= 7
      ? rencana.slice(5, 7)
      : (row.Bulan_Buku?.slice(0, 2) || '')
    const year = extractYearFromDateString(rencana)
      || extractYearFromDateString(row.Raw_Date || '')
      || extractYearFromDateString(row.Billing_Date || '')
    return { year, month }
  }

  const raw = row.Raw_Date || ''
  if (raw.length >= 7) {
    return { year: raw.slice(0, 4), month: raw.slice(5, 7) }
  }

  const transfer = row.Tanggal_Transfer || ''
  if (transfer.includes('/')) {
    const parts = transfer.split('/')
    if (parts.length === 3) {
      return { year: parts[2], month: parts[1].padStart(2, '0') }
    }
  }

  const month = row.Bulan_Buku?.slice(0, 2) || ''
  const year = extractYearFromDateString(row.Raw_Date || '')
    || extractYearFromDateString(row.Billing_Date || '')
  return { year, month }
}

export interface LaporanSummary {
  cashIn: number
  pendapatan: number
  sisaBayar: number
  sisaVolume: number
  sisaVolumeButir: number
  hargaRataKg: number
  hargaRataButir: number
  barangTerkirimKg: number
  barangTerkirimButir: number
  totalPphNominals: number
}

export function calculateLaporanSummary(rows: LaporanRow[]): LaporanSummary {
  const result: LaporanSummary = {
    cashIn: 0,
    pendapatan: 0,
    sisaBayar: 0,
    sisaVolume: 0,
    sisaVolumeButir: 0,
    hargaRataKg: 0,
    hargaRataButir: 0,
    barangTerkirimKg: 0,
    barangTerkirimButir: 0,
    totalPphNominals: 0,
  }

  let totalKgVolume = 0
  let totalKgPendapatan = 0
  let totalButirVolume = 0
  let totalButirPendapatan = 0

  for (const row of rows) {
    const isBypass = row.No_DO.startsWith('BYPASS-')
    const satuan = (row.Satuan || 'Kg').toLowerCase()

    result.cashIn += row.Jumlah_Transfer || 0
    result.pendapatan += row.Pendapatan_Pokok || 0
    result.totalPphNominals += row.PPh_Nominal || 0

    const sisaBayar = row.Sisa_Pembayaran || 0
    if (sisaBayar > 0) result.sisaBayar += sisaBayar

    if (satuan === 'butir') {
      result.sisaVolumeButir += row.Sisa_Volume || 0
      result.barangTerkirimButir += row.Jumlah_DO || 0
      totalButirVolume += row.Jumlah_DO || 0
      totalButirPendapatan += row.Pendapatan_Pokok || 0
    } else {
      result.sisaVolume += row.Sisa_Volume || 0
      result.barangTerkirimKg += row.Jumlah_DO || 0
      totalKgVolume += row.Jumlah_DO || 0
      totalKgPendapatan += row.Pendapatan_Pokok || 0
    }
  }

  result.hargaRataKg = totalKgVolume > 0 ? totalKgPendapatan / totalKgVolume : 0
  result.hargaRataButir = totalButirVolume > 0 ? totalButirPendapatan / totalButirVolume : 0

  return result
}

export function filterLaporanRows(rows: LaporanRow[], filters: LaporanFilters): LaporanRow[] {
  return rows.filter((row) => {
    if (filters.unit.length > 0 && !filters.unit.includes(row.Unit)) return false
    if (filters.pembeli.length > 0 && !filters.pembeli.includes(row.Mitra_Pembeli)) return false
    if (filters.komoditi.length > 0 && !filters.komoditi.includes(row.Komoditi)) return false
    if (filters.jenisKomoditi.length > 0 && !filters.jenisKomoditi.includes(row.Deskripsi_Produk)) return false

    if (filters.tipe === 'NO_BYPASS' && row.No_DO.startsWith('BYPASS-')) return false
    if (filters.tipe === 'ONLY_BYPASS' && !row.No_DO.startsWith('BYPASS-')) return false

    if (filters.year || filters.months.length > 0) {
      const { year, month } = extractPeriodKeys(row, filters.modeTanggal)
      if (filters.year && (!year || year !== filters.year)) return false
      if (filters.months.length > 0 && (!month || !filters.months.includes(month))) return false
    }

    if (filters.sap !== 'ALL') {
      const { Superman, Kontrak_SAP, SO_SAP, DO_SAP, Billing } = row
      if (filters.sap === 'MISSING_SAP' && Kontrak_SAP && SO_SAP && DO_SAP && Billing) return false
      if (filters.sap === 'NO_KONTRAK_SAP' && Kontrak_SAP) return false
      if (filters.sap === 'NO_SO_SAP' && SO_SAP) return false
      if (filters.sap === 'NO_DO_SAP' && DO_SAP) return false
      if (filters.sap === 'NO_BILLING_SAP' && Billing) return false
      if (filters.sap === 'ALL_COMPLETE' && (!Kontrak_SAP || !SO_SAP || !DO_SAP || !Billing)) return false
    }

    if (filters.statusBayar !== 'ALL') {
      const sisa = row.Sisa_Pembayaran || 0
      const total = row.Kewajiban_Pembayaran || 0
      if (filters.statusBayar === 'BELUM' && sisa >= total && total > 0) { /* pass */ }
      else if (filters.statusBayar === 'SEBAGIAN' && sisa > 0 && sisa < total) { /* pass */ }
      else if (filters.statusBayar === 'LUNAS' && sisa <= 0) { /* pass */ }
      else return false
    }

    if (filters.search) {
      const q = filters.search.toLowerCase()
      const haystack = [
        row.No_DO, row.No_Invoice, row.No_Kontrak,
        row.Mitra_Pembeli, row.Unit, row.Komoditi,
        row.Kontrak_SAP, row.SO_SAP, row.DO_SAP, row.Billing, row.Superman,
      ].filter(Boolean).join(' ').toLowerCase()
      if (!haystack.includes(q)) return false
    }

    return true
  })
}

export interface LaporanFilters {
  unit: string[]
  pembeli: string[]
  komoditi: string[]
  jenisKomoditi: string[]
  year: string
  months: string[]
  modeTanggal: 'TRANSFER' | 'RENCANA'
  sort: 'DESC' | 'ASC'
  tipe: 'ALL' | 'NO_BYPASS' | 'ONLY_BYPASS'
  sap: string
  statusBayar: string
  search: string
}

/** State reset filter — semua periode (tanpa filter tahun/bulan) */
export function createDefaultLaporanFilters(): LaporanFilters {
  return {
    unit: [],
    pembeli: [],
    komoditi: [],
    jenisKomoditi: [],
    year: '',
    months: [],
    modeTanggal: 'TRANSFER',
    sort: 'DESC',
    tipe: 'ALL',
    sap: 'ALL',
    statusBayar: 'ALL',
    search: '',
  }
}

/** State awal halaman — bulan & tahun berjalan + filter lain default */
export function createInitialLaporanFilters(): LaporanFilters {
  return {
    ...createDefaultLaporanFilters(),
    year: getInitialLaporanYearKey(),
    months: getInitialLaporanMonthKeys(),
  }
}

/** @deprecated Use createInitialLaporanFilters() atau createDefaultLaporanFilters() */
export const DEFAULT_LAPORAN_FILTERS: LaporanFilters = createInitialLaporanFilters()
