import * as XLSX from 'xlsx-js-style'
import type { CellObject, CellStyle } from 'xlsx-js-style'
import type { LaporanRow } from '@/types'
import { normalizeSatuan } from '@/utils/satuanUtils'

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

type ColType = 'text' | 'currency' | 'volume' | 'percent' | 'date' | 'center'

interface ColDef {
  header: string
  width: number
  type: ColType
}

const COLUMNS: ColDef[] = [
  { header: 'No. DO', width: 16, type: 'text' },
  { header: 'No Invoice', width: 14, type: 'text' },
  { header: 'No Kontrak', width: 16, type: 'text' },
  { header: 'Unit', width: 12, type: 'text' },
  { header: 'Komoditi', width: 12, type: 'text' },
  { header: 'Satuan', width: 8, type: 'center' },
  { header: 'Billing Date', width: 13, type: 'date' },
  { header: 'Tgl Transfer', width: 13, type: 'date' },
  { header: 'Kewajiban Pembayaran (Inc. PPh)', width: 20, type: 'currency' },
  { header: 'Kewajiban Transfer (Cash In)', width: 20, type: 'currency' },
  { header: 'Jumlah Transfer', width: 16, type: 'currency' },
  { header: 'Mitra Pembeli', width: 22, type: 'text' },
  { header: 'Jenis Material', width: 20, type: 'text' },
  { header: 'Jml Invoice', width: 15, type: 'currency' },
  { header: 'Harga Satuan', width: 14, type: 'currency' },
  { header: 'Volume Invoice', width: 13, type: 'volume' },
  { header: 'Jumlah DO', width: 12, type: 'volume' },
  { header: '% PPN', width: 8, type: 'percent' },
  { header: '% PPh', width: 8, type: 'percent' },
  { header: 'Pendapatan Pokok', width: 16, type: 'currency' },
  { header: 'Setelah PPN', width: 16, type: 'currency' },
  { header: 'Pajak PPN', width: 14, type: 'currency' },
  { header: 'PPh', width: 14, type: 'currency' },
  { header: 'PPh Setor?', width: 11, type: 'center' },
  { header: 'Sisa Bayar', width: 14, type: 'currency' },
  { header: 'Sisa Volume', width: 12, type: 'volume' },
  { header: 'Bulan Buku', width: 12, type: 'text' },
  { header: 'Superman', width: 11, type: 'text' },
  { header: 'Kontrak SAP', width: 12, type: 'text' },
  { header: 'SO SAP', width: 10, type: 'text' },
  { header: 'DO SAP', width: 10, type: 'text' },
  { header: 'Billing', width: 10, type: 'text' },
]

const LAST_COL = COLUMNS.length - 1

const COL = {
  KEWAJIBAN: colLetter(8),
  KEWAJIBAN_TRANSFER: colLetter(9),
  JUMLAH_TRANSFER: colLetter(10),
  HARGA_SATUAN: colLetter(14),
  JUMLAH_DO: colLetter(16),
  PPN_PCT: colLetter(17),
  PPH_PCT: colLetter(18),
  PENDAPATAN_POKOK: colLetter(19),
  SETELAH_PPN: colLetter(20),
  PAJAK_PPN: colLetter(21),
  PPH: colLetter(22),
  PPH_SETOR: colLetter(23),
} as const

/** Baris (0-based): 0 = judul, 1 = header, 2..N = data, N+1 = total. */
const TITLE_ROW = 0
const HEADER_ROW = 1
const DATA_START_ROW = 2

const NAVY = '1F3B57'
const NAVY_DARK = '15293D'
const BAND = 'EEF3F8'
const BORDER_COLOR = 'D7E0EA'
const WHITE = 'FFFFFF'
const GREEN = '15803D'
const AMBER = 'B45309'
const MUTED = '6B7280'
const TEXT = '1F2937'

const thinBorder = (color: string) => ({ style: 'thin' as const, color: { rgb: color } })

const BASE_BORDER: CellStyle['border'] = {
  top: thinBorder(BORDER_COLOR),
  bottom: thinBorder(BORDER_COLOR),
  left: thinBorder(BORDER_COLOR),
  right: thinBorder(BORDER_COLOR),
}

const FONT_BASE = { name: 'Calibri', sz: 10, color: { rgb: TEXT } }

const ALIGN_BY_TYPE: Record<ColType, CellStyle['alignment']> = {
  text: { horizontal: 'left', vertical: 'center', wrapText: true },
  currency: { horizontal: 'right', vertical: 'center' },
  volume: { horizontal: 'right', vertical: 'center' },
  percent: { horizontal: 'center', vertical: 'center' },
  date: { horizontal: 'center', vertical: 'center' },
  center: { horizontal: 'center', vertical: 'center' },
}

const NUMFMT_BY_TYPE: Partial<Record<ColType, string>> = {
  currency: '"Rp" #,##0;[RED]-"Rp" #,##0',
  volume: '#,##0.00',
  percent: '0.##"%"',
  date: 'dd mmm yyyy',
}

function dataStyle(type: ColType, banded: boolean, overrides?: Partial<CellStyle['font']>): CellStyle {
  return {
    font: { ...FONT_BASE, ...overrides },
    border: BASE_BORDER,
    alignment: ALIGN_BY_TYPE[type],
    fill: banded ? { fgColor: { rgb: BAND }, patternType: 'solid' } : undefined,
    numFmt: NUMFMT_BY_TYPE[type],
  }
}

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

/** Serial tanggal Excel (hari sejak 1899-12-30) dari string "YYYY-MM-DD". */
function excelDateSerial(dateStr: string | null | undefined): number | null {
  if (!dateStr) return null
  const [y, m, d] = dateStr.split('-').map(Number)
  if (!y || !m || !d) return null
  const EXCEL_EPOCH = Date.UTC(1899, 11, 30)
  return Math.round((Date.UTC(y, m - 1, d) - EXCEL_EPOCH) / 86400000)
}

/**
 * Export laporan ke Excel dengan rumus:
 * - Pendapatan Pokok = Harga Satuan × Jumlah DO
 * - Pajak PPN = Pendapatan Pokok × % PPN / 100
 * - Setelah PPN = Pendapatan Pokok + Pajak PPN
 * - PPh = Pendapatan Pokok × % PPh / 100
 * - Kewajiban Transfer (Cash In) = Setelah PPN − PPh
 * - Kewajiban Pembayaran (Inc. PPh) = Jumlah Transfer (+ PPh jika disetor)
 */
export function exportLaporanExcel(rows: LaporanRow[], filename: string): void {
  const ws: XLSX.WorkSheet = {}
  const set = (r: number, c: number, cell: CellObject) => {
    ws[XLSX.utils.encode_cell({ r, c })] = cell
  }

  // Judul laporan (baris merge di atas header)
  const title = filename.replace(/\.xlsx$/i, '').replace(/_/g, ' ')
  set(TITLE_ROW, 0, {
    v: title,
    t: 's',
    s: {
      font: { name: 'Calibri', sz: 14, bold: true, color: { rgb: NAVY } },
      alignment: { horizontal: 'left', vertical: 'center' },
    },
  })

  // Header
  COLUMNS.forEach((col, c) => {
    set(HEADER_ROW, c, {
      v: col.header,
      t: 's',
      s: {
        font: { name: 'Calibri', sz: 10, bold: true, color: { rgb: WHITE } },
        fill: { fgColor: { rgb: NAVY }, patternType: 'solid' },
        alignment: { horizontal: 'center', vertical: 'center', wrapText: true },
        border: {
          top: thinBorder(NAVY_DARK),
          bottom: thinBorder(NAVY_DARK),
          left: thinBorder(NAVY_DARK),
          right: thinBorder(NAVY_DARK),
        },
      },
    })
  })

  const SUM_COLS = [8, 9, 10, 13, 15, 16, 19, 20, 21, 22]
  const columnSums: Record<number, number> = Object.fromEntries(SUM_COLS.map((c) => [c, 0]))

  rows.forEach((row, i) => {
    const r = DATA_START_ROW + i
    const rn = r + 1 // nomor baris Excel 1-based, untuk rumus
    const banded = i % 2 === 1

    const setText = (c: number, v: string | number, overrides?: Partial<CellStyle['font']>) => {
      set(r, c, { v: String(v ?? ''), t: 's', s: dataStyle(COLUMNS[c].type, banded, overrides) })
    }
    const setNum = (c: number, v: number) => {
      set(r, c, { v: num(v), t: 'n', s: dataStyle(COLUMNS[c].type, banded) })
    }
    const setDate = (c: number, v: string | null | undefined) => {
      const serial = excelDateSerial(v)
      if (serial == null) {
        set(r, c, { v: '-', t: 's', s: dataStyle('center', banded) })
      } else {
        set(r, c, { v: serial, t: 'n', s: dataStyle('date', banded) })
      }
    }
    const setFormula = (c: number, formula: string, value: number) => {
      set(r, c, { f: formula, v: value, t: 'n', s: dataStyle(COLUMNS[c].type, banded) })
    }

    setText(0, row.No_DO)
    setText(1, row.No_Invoice)
    setText(2, row.No_Kontrak)
    setText(3, row.Unit)
    setText(4, row.Komoditi)
    setText(5, normalizeSatuan(row.Satuan))
    setDate(6, row.Billing_Date)
    setDate(7, row.Tanggal_Transfer)
    setNum(10, row.Jumlah_Transfer)
    setText(11, row.Mitra_Pembeli)
    setText(12, row.Deskripsi_Produk)
    setNum(13, row.Jumlah_Invoice)
    setNum(14, row.Harga_Satuan)
    setNum(15, row.Volume_Invoice)
    setNum(16, row.Jumlah_DO)
    setNum(17, row.PPN_Persen ?? 0)
    setNum(18, row.PPh_Persen ?? 0)
    columnSums[10] += num(row.Jumlah_Transfer)
    columnSums[13] += num(row.Jumlah_Invoice)
    columnSums[15] += num(row.Volume_Invoice)
    columnSums[16] += num(row.Jumlah_DO)

    const {
      HARGA_SATUAN,
      JUMLAH_DO,
      PPN_PCT,
      PPH_PCT,
      PENDAPATAN_POKOK,
      SETELAH_PPN,
      PAJAK_PPN,
      PPH,
      PPH_SETOR,
      JUMLAH_TRANSFER,
    } = COL

    const pendapatanPokok = Math.round(num(row.Harga_Satuan) * num(row.Jumlah_DO))
    const pajakPPN = Math.round(pendapatanPokok * num(row.PPN_Persen) / 100)
    const setelahPPN = pendapatanPokok + pajakPPN
    const pph = Math.round(pendapatanPokok * num(row.PPh_Persen) / 100)

    setFormula(19, `ROUND(${HARGA_SATUAN}${rn}*${JUMLAH_DO}${rn},0)`, pendapatanPokok)
    setFormula(21, `ROUND(${PENDAPATAN_POKOK}${rn}*${PPN_PCT}${rn}/100,0)`, pajakPPN)
    setFormula(20, `${PENDAPATAN_POKOK}${rn}+${PAJAK_PPN}${rn}`, setelahPPN)
    setFormula(22, `ROUND(${PENDAPATAN_POKOK}${rn}*${PPH_PCT}${rn}/100,0)`, pph)
    columnSums[19] += pendapatanPokok
    columnSums[21] += pajakPPN
    columnSums[20] += setelahPPN
    columnSums[22] += pph

    const pphSetor = pphSetorLabel(row.PPh_Setor)
    setText(23, pphSetor, pphSetor === 'Disetor' ? { color: { rgb: GREEN }, bold: true } : { color: { rgb: MUTED } })

    const kewajibanTransfer = setelahPPN - pph
    const kewajibanPembayaran = pphSetor === 'Disetor' ? num(row.Jumlah_Transfer) + pph : num(row.Jumlah_Transfer)
    setFormula(9, `${SETELAH_PPN}${rn}-${PPH}${rn}`, kewajibanTransfer)
    setFormula(
      8,
      `IF(${PPH_SETOR}${rn}="Disetor",${JUMLAH_TRANSFER}${rn}+${PPH}${rn},${JUMLAH_TRANSFER}${rn})`,
      kewajibanPembayaran,
    )
    columnSums[9] += kewajibanTransfer
    columnSums[8] += kewajibanPembayaran

    const sisaBayar = sisaBayarLabel(row)
    if (typeof sisaBayar === 'number') setNum(24, sisaBayar)
    else setText(24, sisaBayar, { color: { rgb: GREEN }, bold: true })

    const sisaVol = sisaVolumeLabel(row)
    if (typeof sisaVol === 'number') setNum(25, sisaVol)
    else setText(25, sisaVol, { color: { rgb: GREEN }, bold: true })

    setText(26, row.Bulan_Buku)
    const superman = (row.Superman || '').trim() || 'Belum'
    setText(27, superman, superman === 'Belum' ? { color: { rgb: AMBER }, bold: true } : undefined)
    setText(28, row.Kontrak_SAP)
    setText(29, row.SO_SAP)
    setText(30, row.DO_SAP)
    setText(31, row.Billing)
  })

  const lastDataRow = DATA_START_ROW + Math.max(rows.length, 1) - 1
  const totalRow = DATA_START_ROW + rows.length

  if (rows.length > 0) {
    set(totalRow, 0, {
      v: `TOTAL (${rows.length} baris)`,
      t: 's',
      s: {
        font: { name: 'Calibri', sz: 10, bold: true, color: { rgb: NAVY } },
        fill: { fgColor: { rgb: BAND }, patternType: 'solid' },
        alignment: { horizontal: 'left', vertical: 'center' },
        border: { ...BASE_BORDER, top: thinBorder(NAVY) },
      },
    })
    ws['!merges'] = ws['!merges'] || []
    ws['!merges']!.push({ s: { r: totalRow, c: 0 }, e: { r: totalRow, c: 7 } })

    COLUMNS.forEach((col, c) => {
      if (c < 8) return
      const isSum = SUM_COLS.includes(c)
      const style: CellStyle = {
        font: { name: 'Calibri', sz: 10, bold: true, color: { rgb: NAVY } },
        fill: { fgColor: { rgb: BAND }, patternType: 'solid' },
        alignment: ALIGN_BY_TYPE[col.type],
        border: { ...BASE_BORDER, top: thinBorder(NAVY) },
        numFmt: NUMFMT_BY_TYPE[col.type],
      }
      if (isSum) {
        set(totalRow, c, {
          f: `SUM(${colLetter(c)}${DATA_START_ROW + 1}:${colLetter(c)}${lastDataRow + 1})`,
          v: columnSums[c],
          t: 'n',
          s: style,
        })
      } else {
        set(totalRow, c, { v: '', t: 's', s: style })
      }
    })
  }

  const lastRow = rows.length > 0 ? totalRow : HEADER_ROW

  ws['!ref'] = XLSX.utils.encode_range({
    s: { r: 0, c: 0 },
    e: { r: lastRow, c: LAST_COL },
  })
  ws['!merges'] = [
    ...(ws['!merges'] || []),
    { s: { r: TITLE_ROW, c: 0 }, e: { r: TITLE_ROW, c: LAST_COL } },
  ]
  ws['!cols'] = COLUMNS.map((col) => ({ wch: col.width }))
  ws['!rows'] = [{ hpt: 22 }, { hpt: 26 }]
  ws['!autofilter'] = {
    ref: XLSX.utils.encode_range({ s: { r: HEADER_ROW, c: 0 }, e: { r: lastDataRow, c: LAST_COL } }),
  }

  const wb = XLSX.utils.book_new()
  XLSX.utils.book_append_sheet(wb, ws, 'Laporan')
  XLSX.writeFile(wb, filename)
}
