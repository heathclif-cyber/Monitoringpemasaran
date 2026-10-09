import type { LaporanInvoiceGroup, LaporanRekapDimension, LaporanRekapRow, LaporanRow, PiutangRow } from '@/types'

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
  if (row.Row_Type) {
    const raw = row.Report_Date || ''
    return { year: raw.slice(0, 4), month: raw.slice(5, 7) }
  }
  // Setiap BA (normal maupun payung) memakai periode pembukuan BA.
  if (row.No_BA) {
    const buku = row.Raw_Bulan_Buku || ''
    const month = extractMonthFromDateString(buku) || row.Bulan_Buku?.slice(0, 2) || ''
    const year = extractYearFromDateString(buku)
      || extractYearFromDateString(row.Rencana_Pengambilan || '')
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

export function pickupRemainingRatio(row: LaporanRow): number {
  const issuedVolume = row.Volume_DO_Invoice ?? 0
  if (issuedVolume <= 0) return 0
  return Math.min(1, Math.max(0, (row.Outstanding_Pengambilan ?? 0) / issuedVolume))
}

function summaryRowKey(row: LaporanRow): string | null {
  if (row.No_DO.startsWith('BYPASS-')) return row.No_DO
  if (row.No_Invoice && row.No_Invoice !== '-') return `INV-${row.No_Invoice}`
  if (row.No_Kontrak && row.No_Kontrak !== '-') return `KONTRAK-${row.No_Kontrak}`
  return null
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
  let totalKgHargaVolume = 0
  let totalButirVolume = 0
  let totalButirHargaVolume = 0
  const seenSisaKeys = new Set<string>()
  const seenPickupContracts = new Set<string>()

  for (const row of rows) {
    const satuan = (row.Satuan || 'Kg').toLowerCase()
    const isEa = satuan === 'ea' || satuan === 'butir'
    const volDo = row.Jumlah_DO || 0
    const harga = row.Harga_Satuan || 0

    result.cashIn += row.Jumlah_Transfer || 0
    result.pendapatan += row.Pendapatan_Pokok || 0
    result.totalPphNominals += row.PPh_Nominal || 0

    const idKey = summaryRowKey(row)
    if (idKey && !seenSisaKeys.has(idKey)) {
      seenSisaKeys.add(idKey)
      const sisaBayar = row.Sisa_Pembayaran || 0
      if (sisaBayar > 0) result.sisaBayar += sisaBayar
      const sisaVol = row.Outstanding_Pengambilan === undefined ? row.Sisa_Volume || 0 : 0
      if (sisaVol > 0) {
        if (isEa) result.sisaVolumeButir += sisaVol
        else result.sisaVolume += sisaVol
      }
    }

    const pickupKey = summaryRowKey(row)
    if (row.Row_Type) {
      if (isEa) result.barangTerkirimButir += row.Volume_Pengambilan ?? 0
      else result.barangTerkirimKg += row.Volume_Pengambilan ?? 0
    }
    if (row.Outstanding_Pengambilan !== undefined && pickupKey && !seenPickupContracts.has(pickupKey)) {
      seenPickupContracts.add(pickupKey)
      const pickedUp = row.Volume_Pengambilan ?? 0
      if (isEa) {
        result.sisaVolumeButir += row.Outstanding_Pengambilan
        if (!row.Row_Type) result.barangTerkirimButir += pickedUp
      } else {
        result.sisaVolume += row.Outstanding_Pengambilan
        if (!row.Row_Type) result.barangTerkirimKg += pickedUp
      }
    }

    if (isEa) {
      totalButirVolume += volDo
      totalButirHargaVolume += row.Row_Type ? row.DPP_Pokok || 0 : harga * volDo
    } else {
      totalKgVolume += volDo
      totalKgHargaVolume += row.Row_Type ? row.DPP_Pokok || 0 : harga * volDo
    }
  }

  result.hargaRataKg = totalKgVolume > 0 ? totalKgHargaVolume / totalKgVolume : 0
  result.hargaRataButir = totalButirVolume > 0 ? totalButirHargaVolume / totalButirVolume : 0

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
        row.No_DO, row.No_Invoice, row.No_Kontrak, row.No_BA, row.No_Pembayaran,
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

/** State awal halaman — tahun berjalan (semua bulan) + filter lain default */
export function createInitialLaporanFilters(): LaporanFilters {
  return {
    ...createDefaultLaporanFilters(),
    year: getInitialLaporanYearKey(),
  }
}

/** @deprecated Use createInitialLaporanFilters() atau createDefaultLaporanFilters() */
export const DEFAULT_LAPORAN_FILTERS: LaporanFilters = createInitialLaporanFilters()

const REKAP_EMPTY_LABEL: Record<LaporanRekapDimension, string> = {
  komoditi: 'Tanpa komoditi',
  produk: 'Tanpa produk',
  unit: 'Tanpa unit',
  pembeli: 'Tanpa pembeli',
  bulan: 'Tanpa tanggal',
}

export function laporanRekapKey(row: LaporanRow, dimension: LaporanRekapDimension): string {
  switch (dimension) {
    case 'komoditi': return (row.Komoditi || '').trim()
    case 'produk': return (row.Deskripsi_Produk || row.Komoditi || '').trim()
    case 'unit': return (row.Unit || '').trim()
    case 'pembeli': return (row.Mitra_Pembeli || '').trim()
    case 'bulan': return (row.Report_Date || '').slice(0, 7)
  }
}

export function laporanRekapLabel(key: string, dimension: LaporanRekapDimension): string {
  if (!key) return REKAP_EMPTY_LABEL[dimension]
  if (dimension === 'bulan') return `${MONTHS_ID[Number(key.slice(5, 7))] || key.slice(5, 7)} ${key.slice(0, 4)}`
  return key
}

function emptyRekapRow(key: string, label: string): LaporanRekapRow {
  return {
    key, label, sales: 0, salesRencana: 0, salesKg: 0, salesEa: 0, volumeKg: 0, volumeEa: 0,
    cashIn: 0, transferCount: 0, shortfall: null, unpaidInvoices: 0,
    pickupOutstandingKg: 0, pickupOutstandingEa: 0, komoditiCount: 0,
  }
}

function isEaRow(row: LaporanRow): boolean {
  const satuan = (row.Satuan || '').trim().toLowerCase()
  return satuan === 'ea' || satuan === 'butir'
}

function hasInvoice(row: LaporanRow): boolean {
  return !!row.No_Invoice && row.No_Invoice !== '-' && !row.No_DO.startsWith('BYPASS-')
}

/**
 * Rekap per dimensi. Penjualan & cash in dijumlah per baris kejadian;
 * kurang bayar & sisa pengambilan dihitung sekali per invoice.
 */
export function buildLaporanRekap(
  rows: LaporanRow[],
  dimension: LaporanRekapDimension,
  balances: PiutangRow[] | null,
): { groups: LaporanRekapRow[]; total: LaporanRekapRow } {
  const balanceByInvoice = new Map((balances || []).map((b) => [b.no_invoice, b]))
  const buckets = new Map<string, { rekap: LaporanRekapRow; invoices: Map<string, LaporanRow>; komoditi: Set<string> }>()
  const total = { rekap: emptyRekapRow('__total__', 'Total'), invoices: new Map<string, LaporanRow>(), komoditi: new Set<string>() }

  for (const row of rows) {
    const key = laporanRekapKey(row, dimension)
    let bucket = buckets.get(key)
    if (!bucket) {
      bucket = { rekap: emptyRekapRow(key, laporanRekapLabel(key, dimension)), invoices: new Map(), komoditi: new Set() }
      buckets.set(key, bucket)
    }
    for (const target of [bucket, total]) {
      const r = target.rekap
      const sales = row.Pendapatan_Pokok || 0
      const volume = row.Jumlah_DO || 0
      r.sales += sales
      if (row.Row_Type === 'RENCANA') r.salesRencana += sales
      if (isEaRow(row)) { r.salesEa += sales; r.volumeEa += volume } else { r.salesKg += sales; r.volumeKg += volume }
      if ((row.Jumlah_Transfer || 0) > 0) { r.cashIn += row.Jumlah_Transfer; r.transferCount += 1 }
      if (sales > 0 && row.Komoditi) target.komoditi.add(row.Komoditi)
      if (hasInvoice(row) && !target.invoices.has(row.No_Invoice)) target.invoices.set(row.No_Invoice, row)
    }
  }

  const finish = (target: { rekap: LaporanRekapRow; invoices: Map<string, LaporanRow>; komoditi: Set<string> }) => {
    const r = target.rekap
    r.komoditiCount = target.komoditi.size
    let shortfall = 0
    for (const [noInvoice, row] of target.invoices) {
      const outstanding = row.Outstanding_Pengambilan || 0
      if (isEaRow(row)) r.pickupOutstandingEa += outstanding
      else r.pickupOutstandingKg += outstanding
      const piutang = balanceByInvoice.get(noInvoice)?.piutang_pokok || 0
      shortfall += piutang
      if (piutang > 0) r.unpaidInvoices += 1
    }
    r.shortfall = balances ? shortfall : null
    return r
  }

  const groups = [...buckets.values()].map(finish)
  if (dimension === 'bulan') groups.sort((a, b) => (a.key || '9999').localeCompare(b.key || '9999'))
  else groups.sort((a, b) => b.sales - a.sales || b.cashIn - a.cashIn || a.label.localeCompare(b.label))
  return { groups, total: finish(total) }
}

/** Harga rata-rata (sebelum PPN) per satuan dominan; null bila tidak ada volume */
export function rekapAveragePrice(r: LaporanRekapRow): { value: number; unit: 'Kg' | 'EA' } | null {
  if (r.volumeKg > 0) return { value: r.salesKg / r.volumeKg, unit: 'Kg' }
  if (r.volumeEa > 0) return { value: r.salesEa / r.volumeEa, unit: 'EA' }
  return null
}

/**
 * Gabungkan baris kejadian (BA/rencana DO/pembayaran) menjadi satu baris per invoice.
 * Total penjualan & cash in tetap penjumlahan kejadian, tidak ada yang dihitung ulang.
 */
export function groupLaporanByInvoice(rows: LaporanRow[], order: 'DESC' | 'ASC'): LaporanInvoiceGroup[] {
  const groups = new Map<string, LaporanInvoiceGroup>()
  rows.forEach((row, index) => {
    const key = hasInvoice(row) ? `INV:${row.No_Invoice}` : row.Row_ID || `ROW:${index}`
    let g = groups.get(key)
    if (!g) {
      g = { key, main: row, rows: [], sales: 0, volume: 0, cashIn: 0, salesDate: '', cashDate: '', sortDate: '', rowTypes: [], warnings: [] }
      groups.set(key, g)
    }
    g.rows.push(row)
    const date = row.Report_Date || ''
    if ((row.Pendapatan_Pokok || 0) > 0) {
      g.sales += row.Pendapatan_Pokok
      g.volume += row.Jumlah_DO || 0
      if (date && (!g.salesDate || date < g.salesDate)) g.salesDate = date
      if ((g.main.Pendapatan_Pokok || 0) <= 0 || (row.Row_Type === 'REALISASI' && g.main.Row_Type !== 'REALISASI')) g.main = row
    }
    if ((row.Jumlah_Transfer || 0) > 0) {
      g.cashIn += row.Jumlah_Transfer
      if (date && date > g.cashDate) g.cashDate = date
    }
    if (row.Row_Type && row.Row_Type !== 'PEMBAYARAN' && !g.rowTypes.includes(row.Row_Type)) g.rowTypes.push(row.Row_Type)
    for (const w of row.Reporting_Warnings || []) if (!g.warnings.includes(w)) g.warnings.push(w)
  })
  const result = [...groups.values()]
  for (const g of result) {
    g.sortDate = g.salesDate || g.cashDate || g.main.Report_Date || g.main.Raw_Date || ''
    if (g.rowTypes.length === 0 && g.cashIn > 0) g.rowTypes.push('PEMBAYARAN')
  }
  result.sort((a, b) => (order === 'DESC' ? b.sortDate.localeCompare(a.sortDate) : a.sortDate.localeCompare(b.sortDate)))
  return result
}

const SAP_FIELDS = ['Superman', 'Kontrak_SAP', 'SO_SAP', 'DO_SAP', 'Billing'] as const

/** Satu baris LaporanRow gabungan per invoice (untuk tabel lengkap & Excel). */
export function mergeInvoiceGroup(group: LaporanInvoiceGroup): LaporanRow {
  if (group.rows.length === 1) return group.main
  const sumOf = (pick: (r: LaporanRow) => number | undefined) => group.rows.reduce((t, r) => t + (pick(r) || 0), 0)
  const merged: LaporanRow = {
    ...group.main,
    Jumlah_DO: group.volume,
    Pendapatan_Pokok: group.sales,
    Pendapatan_Setelah_PPN: sumOf((r) => r.Pendapatan_Setelah_PPN),
    DPP_Pokok: sumOf((r) => r.DPP_Pokok),
    Pajak_PPN: sumOf((r) => r.Pajak_PPN),
    PPh_Nominal: sumOf((r) => r.PPh_Nominal),
    Jumlah_Transfer: group.cashIn,
    Pelunasan: sumOf((r) => r.Pelunasan),
    Reporting_Warnings: group.warnings,
  }
  const paid = [...group.rows].filter((r) => (r.Jumlah_Transfer || 0) > 0 && r.Tanggal_Transfer).pop()
  if (paid) {
    merged.Tanggal_Transfer = paid.Tanggal_Transfer
    merged.No_Pembayaran = paid.No_Pembayaran
    merged.PPh_Setor = paid.PPh_Setor
  }
  for (const field of SAP_FIELDS) {
    if (!merged[field]) merged[field] = group.rows.find((r) => r[field])?.[field] || ''
  }
  return merged
}
