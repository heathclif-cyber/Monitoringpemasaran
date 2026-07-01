import * as XLSX from 'xlsx'
import type { LaporanRow } from '@/types'

/** Convert 0-based column index to Excel letter (0 → A, 13 → N). */
function colLetter(index: number): string {
  let s = ''
  let n = index + 1
  while (n > 0) {
    const rem = (n - 1) % 26
    s = String.fromCharCode(65 + rem) + s
    n = Math.floor((n - 1) / 26)
  }
  return s
}

const EXPORT_HEADERS = [
  'No. DO',
  'No Invoice',
  'No Kontrak',
  'Unit',
  'Komoditi',
  'Satuan',
  'Billing Date',
  'Tgl Transfer',
  'Jumlah Transfer',
  'Pelunasan (Inc. PPh)',
  'Mitra Pembeli',
  'Jenis Material',
  'Jml Invoice',
  'Harga Satuan',
  'Volume Invoice',
  'Jumlah DO',
  '% PPN',
  '% PPh',
  'Pendapatan Pokok',
  'Setelah PPN',
  'Pajak PPN',
  'PPh',
  'PPh Setor?',
  'Kewajiban (Gross)',
  'Sisa Bayar',
  'Sisa Volume',
  'Bulan Buku',
  'Superman',
  'Kontrak SAP',
  'SO SAP',
  'DO SAP',
  'Billing',
] as const

const COL = {
  JUMLAH_TRANSFER: colLetter(8),
  HARGA_SATUAN: colLetter(13),
  JUMLAH_DO: colLetter(15),
  PPN_PCT: colLetter(16),
  PPH_PCT: colLetter(17),
  PENDAPATAN_POKOK: colLetter(18),
  SETELAH_PPN: colLetter(19),
  PAJAK_PPN: colLetter(20),
  PPH: colLetter(21),
  PPH_SETOR: colLetter(22),
  KEWAJIBAN: colLetter(23),
} as const

function num(v: number | null | undefined): number {
  return Number(v) || 0
}

function pphSetorLabel(value: string | undefined): string {
  const v = String(value || '').toLowerCase()
  return v === 'disetor' || v === 'true' ? 'Disetor' : '-'
}

function sisaBayarLabel(row: LaporanRow): string | number {
  const sisa = row.Sisa_Pembayaran || 0
  return sisa <= 0 ? 'Lunas' : sisa
}

function sisaVolumeLabel(row: LaporanRow): string | number {
  const sisa = row.Sisa_Volume || 0
  return sisa <= 0 ? 'Selesai' : sisa
}

/**
 * Export laporan ke Excel dengan rumus:
 * - Pendapatan Pokok = Harga Satuan × Jumlah DO
 * - Pajak PPN = Pendapatan Pokok × % PPN / 100
 * - Setelah PPN = Pendapatan Pokok + Pajak PPN
 * - PPh = Pendapatan Pokok × % PPh / 100
 * - Kewajiban (Gross) = Setelah PPN − PPh
 * - Pelunasan = Jumlah Transfer (+ PPh jika disetor)
 */
export function exportLaporanExcel(rows: LaporanRow[], filename: string): void {
  const ws: XLSX.WorkSheet = {}

  EXPORT_HEADERS.forEach((header, c) => {
    ws[XLSX.utils.encode_cell({ r: 0, c })] = { v: header, t: 's' }
  })

  rows.forEach((row, i) => {
    const r = i + 1
    const rn = r + 1

    const setNum = (c: number, v: number) => {
      ws[XLSX.utils.encode_cell({ r, c })] = { v: num(v), t: 'n' }
    }
    const setStr = (c: number, v: string | number) => {
      ws[XLSX.utils.encode_cell({ r, c })] = { v: String(v ?? ''), t: 's' }
    }
    const setFormula = (c: number, formula: string) => {
      ws[XLSX.utils.encode_cell({ r, c })] = { f: formula, t: 'n' }
    }

    setStr(0, row.No_DO)
    setStr(1, row.No_Invoice)
    setStr(2, row.No_Kontrak)
    setStr(3, row.Unit)
    setStr(4, row.Komoditi)
    setStr(5, row.Satuan || 'Kg')
    setStr(6, row.Billing_Date)
    setStr(7, row.Tanggal_Transfer)
    setNum(8, row.Jumlah_Transfer)
    setStr(10, row.Mitra_Pembeli)
    setStr(11, row.Deskripsi_Produk)
    setNum(12, row.Jumlah_Invoice)
    setNum(13, row.Harga_Satuan)
    setNum(14, row.Volume_Invoice)
    setNum(15, row.Jumlah_DO)
    setNum(16, row.PPN_Persen ?? 0)
    setNum(17, row.PPh_Persen ?? 0)

    const { HARGA_SATUAN, JUMLAH_DO, PPN_PCT, PPH_PCT, PENDAPATAN_POKOK, SETELAH_PPN, PAJAK_PPN, PPH, PPH_SETOR, JUMLAH_TRANSFER } = COL

    setFormula(18, `ROUND(${HARGA_SATUAN}${rn}*${JUMLAH_DO}${rn},0)`)
    setFormula(20, `ROUND(${PENDAPATAN_POKOK}${rn}*${PPN_PCT}${rn}/100,0)`)
    setFormula(19, `${PENDAPATAN_POKOK}${rn}+${PAJAK_PPN}${rn}`)
    setFormula(21, `ROUND(${PENDAPATAN_POKOK}${rn}*${PPH_PCT}${rn}/100,0)`)
    setStr(22, pphSetorLabel(row.PPh_Setor))
    setFormula(23, `${SETELAH_PPN}${rn}-${PPH}${rn}`)
    setFormula(
      9,
      `IF(${PPH_SETOR}${rn}="Disetor",${JUMLAH_TRANSFER}${rn}+${PPH}${rn},${JUMLAH_TRANSFER}${rn})`,
    )

    const sisaBayar = sisaBayarLabel(row)
    if (typeof sisaBayar === 'number') setNum(24, sisaBayar)
    else setStr(24, sisaBayar)

    const sisaVol = sisaVolumeLabel(row)
    if (typeof sisaVol === 'number') setNum(25, sisaVol)
    else setStr(25, sisaVol)

    setStr(26, row.Bulan_Buku)
    setStr(27, (row.Superman || '').trim() || 'Belum')
    setStr(28, row.Kontrak_SAP)
    setStr(29, row.SO_SAP)
    setStr(30, row.DO_SAP)
    setStr(31, row.Billing)
  })

  ws['!ref'] = XLSX.utils.encode_range({
    s: { r: 0, c: 0 },
    e: { r: Math.max(rows.length, 1), c: EXPORT_HEADERS.length - 1 },
  })

  const wb = XLSX.utils.book_new()
  XLSX.utils.book_append_sheet(wb, ws, 'Laporan')
  XLSX.writeFile(wb, filename)
}