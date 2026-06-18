import type { LaporanRow } from '@/types'

const MONTHS_ID = ['', 'Januari', 'Februari', 'Maret', 'April', 'Mei', 'Juni', 'Juli', 'Agustus', 'September', 'Oktober', 'November', 'Desember']

export const MONTH_OPTIONS = Array.from({ length: 12 }, (_, i) => String(i + 1).padStart(2, '0'))
export const MONTH_LABELS = Object.fromEntries(MONTH_OPTIONS.map((m, i) => [m, MONTHS_ID[i + 1]]))

export function getCurrentMonthKey(): string {
  return String(new Date().getMonth() + 1).padStart(2, '0')
}

export function getPreviousMonthKey(): string {
  const d = new Date()
  d.setMonth(d.getMonth() - 1)
  return String(d.getMonth() + 1).padStart(2, '0')
}

/** Default filter laporan: bulan berjalan + 1 bulan sebelumnya */
export function getDefaultLaporanMonthKeys(): string[] {
  const current = getCurrentMonthKey()
  const previous = getPreviousMonthKey()
  return previous === current ? [current] : [previous, current]
}

function extractMonthKey(row: LaporanRow, mode: 'TRANSFER' | 'RENCANA'): string {
  // Kontrak payung: periode pembukuan dari Bulan_Buku (bukan tanggal BA / transfer)
  if (row.No_BA) {
    const bulanBuku = row.Bulan_Buku?.slice(0, 2)
    if (bulanBuku) return bulanBuku
  }

  if (mode === 'RENCANA') {
    const rencana = row.Rencana_Pengambilan || ''
    if (rencana.length >= 7) return rencana.slice(5, 7)
    return row.Bulan_Buku?.slice(0, 2) || ''
  }

  const raw = row.Raw_Date || ''
  if (raw.length >= 7) return raw.slice(5, 7)

  const transfer = row.Tanggal_Transfer || ''
  if (transfer.includes('/')) {
    const parts = transfer.split('/')
    if (parts.length === 3) return parts[1].padStart(2, '0')
  }

  return row.Bulan_Buku?.slice(0, 2) || ''
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

    if (filters.months.length > 0) {
      const monthKey = extractMonthKey(row, filters.modeTanggal)
      if (!monthKey || !filters.months.includes(monthKey)) return false
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
  months: string[]
  modeTanggal: 'TRANSFER' | 'RENCANA'
  sort: 'DESC' | 'ASC'
  tipe: 'ALL' | 'NO_BYPASS' | 'ONLY_BYPASS'
  sap: string
  statusBayar: string
  search: string
}

export function createDefaultLaporanFilters(): LaporanFilters {
  return {
    unit: [],
    pembeli: [],
    komoditi: [],
    jenisKomoditi: [],
    months: getDefaultLaporanMonthKeys(),
    modeTanggal: 'TRANSFER',
    sort: 'DESC',
    tipe: 'ALL',
    sap: 'ALL',
    statusBayar: 'ALL',
    search: '',
  }
}

/** @deprecated Use createDefaultLaporanFilters() agar bulan default selalu terbaru */
export const DEFAULT_LAPORAN_FILTERS: LaporanFilters = createDefaultLaporanFilters()
