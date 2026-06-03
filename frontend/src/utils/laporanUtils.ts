import type { LaporanRow } from '@/types'

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
      totalButirPendapatan += row.DPP_Pokok || 0
    } else {
      result.sisaVolume += row.Sisa_Volume || 0
      result.barangTerkirimKg += row.Jumlah_DO || 0
      totalKgVolume += row.Jumlah_DO || 0
      totalKgPendapatan += row.DPP_Pokok || 0
    }
  }

  result.hargaRataKg = totalKgVolume > 0 ? totalKgPendapatan / totalKgVolume : 0
  result.hargaRataButir = totalButirVolume > 0 ? totalButirPendapatan / totalButirVolume : 0

  return result
}

export function filterLaporanRows(rows: LaporanRow[], filters: LaporanFilters): LaporanRow[] {
  return rows.filter((row) => {
    if (filters.unit !== 'ALL' && row.Unit !== filters.unit) return false
    if (filters.pembeli !== 'ALL' && row.Mitra_Pembeli !== filters.pembeli) return false
    if (filters.komoditi !== 'ALL' && row.Komoditi !== filters.komoditi) return false

    if (filters.tipe === 'NO_BYPASS' && row.No_DO.startsWith('BYPASS-')) return false
    if (filters.tipe === 'ONLY_BYPASS' && !row.No_DO.startsWith('BYPASS-')) return false

    if (filters.months.length > 0) {
      const bulanBuku = row.Bulan_Buku || ''
      if (!filters.months.some((m) => bulanBuku.startsWith(m))) return false
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
  unit: string
  pembeli: string
  komoditi: string
  months: string[]
  modeTanggal: 'TRANSFER' | 'RENCANA'
  sort: 'DESC' | 'ASC'
  tipe: 'ALL' | 'NO_BYPASS' | 'ONLY_BYPASS'
  sap: string
  statusBayar: string
  search: string
}

export const DEFAULT_LAPORAN_FILTERS: LaporanFilters = {
  unit: 'ALL',
  pembeli: 'ALL',
  komoditi: 'ALL',
  months: [],
  modeTanggal: 'TRANSFER',
  sort: 'DESC',
  tipe: 'ALL',
  sap: 'ALL',
  statusBayar: 'ALL',
  search: '',
}
