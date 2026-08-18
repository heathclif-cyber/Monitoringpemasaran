import ExcelJS from 'exceljs'
import type { PiutangRow, PiutangSummary } from '@/types'

const CURRENCY_FMT = '"Rp"#,##0;[Red]-"Rp"#,##0'

const COLOR = {
  headerFill: 'FF1E3A5F',
  headerFont: 'FFFFFFFF',
  titleFill: 'FF0F2942',
  bandFill: 'FFF4F6F8',
  border: 'FFD9DEE4',
  pokokFill: 'FFFCE4E4',
  pokokFont: 'FFB42318',
  pphFill: 'FFFEF3D6',
  pphFont: 'FF92640A',
  statPokokFill: 'FFFCE4E4',
  statPphFill: 'FFFEF3D6',
  statNeutralFill: 'FFEAF0F6',
}

const HEADERS = [
  'No Invoice',
  'No Kontrak',
  'Mitra',
  'Komoditi',
  'Unit',
  'Tanggal Invoice',
  'Jumlah Pembayaran',
  'Piutang Pokok',
  'Piutang PPh Belum Setor',
  'Kategori',
]

const COL_WIDTHS = [26, 26, 28, 14, 16, 14, 18, 18, 20, 20]

function thinBorder(colorArgb: string) {
  const side = { style: 'thin' as const, color: { argb: colorArgb } }
  return { top: side, left: side, bottom: side, right: side }
}

function kategoriLabel(kategori: string[]): string {
  const labels: string[] = []
  if (kategori.includes('pokok')) labels.push('Pokok')
  if (kategori.includes('pph_belum_setor')) labels.push('PPh Belum Setor')
  return labels.join(' + ') || '-'
}

export interface PiutangExportFilterInfo {
  mitra: string
  kategori: string
}

export async function exportPiutangExcel(
  rows: PiutangRow[],
  summary: PiutangSummary | undefined,
  filterInfo: PiutangExportFilterInfo,
  filename: string,
): Promise<void> {
  const wb = new ExcelJS.Workbook()
  wb.creator = 'Monitoring Pemasaran PTPN I'
  wb.created = new Date()

  const ws = wb.addWorksheet('Monitoring Piutang', {
    views: [{ state: 'frozen', ySplit: 8 }],
  })
  ws.columns = COL_WIDTHS.map((width) => ({ width }))

  // --- Judul ---
  ws.mergeCells(1, 1, 1, HEADERS.length)
  const titleCell = ws.getCell(1, 1)
  titleCell.value = 'Monitoring Piutang — PT Perkebunan Nusantara I Regional 8'
  titleCell.font = { bold: true, size: 14, color: { argb: 'FFFFFFFF' } }
  titleCell.fill = { type: 'pattern', pattern: 'solid', fgColor: { argb: COLOR.titleFill } }
  titleCell.alignment = { vertical: 'middle', horizontal: 'left' }
  ws.getRow(1).height = 26

  ws.mergeCells(2, 1, 2, HEADERS.length)
  const subtitleCell = ws.getCell(2, 1)
  const tanggalExport = new Intl.DateTimeFormat('id-ID', {
    day: '2-digit',
    month: 'long',
    year: 'numeric',
    hour: '2-digit',
    minute: '2-digit',
  }).format(new Date())
  subtitleCell.value = `Diekspor ${tanggalExport} · Filter mitra: ${filterInfo.mitra} · Filter kategori: ${filterInfo.kategori}`
  subtitleCell.font = { italic: true, size: 9, color: { argb: 'FF5B6B7A' } }
  subtitleCell.alignment = { vertical: 'middle', horizontal: 'left' }
  ws.getRow(2).height = 18

  // --- Ringkasan (stat pills) ---
  const stats: { label: string; value: string; fill: string; font: string }[] = [
    {
      label: 'Total Piutang Pokok',
      value: CURRENCY(summary?.total_piutang_pokok ?? 0),
      fill: COLOR.statPokokFill,
      font: COLOR.pokokFont,
    },
    {
      label: 'Total Piutang PPh Belum Setor',
      value: CURRENCY(summary?.total_piutang_pph_belum_setor ?? 0),
      fill: COLOR.statPphFill,
      font: COLOR.pphFont,
    },
    {
      label: 'Mitra Terdampak',
      value: String(summary?.jumlah_mitra_terdampak ?? 0),
      fill: COLOR.statNeutralFill,
      font: 'FF1E3A5F',
    },
    {
      label: 'Invoice Terdampak',
      value: String(summary?.total_invoice_outstanding ?? 0),
      fill: COLOR.statNeutralFill,
      font: 'FF1E3A5F',
    },
  ]

  const statRowLabel = 4
  const statRowValue = 5
  const span = Math.max(2, Math.floor(HEADERS.length / stats.length))
  stats.forEach((stat, i) => {
    const startCol = i * span + 1
    const endCol = i === stats.length - 1 ? HEADERS.length : startCol + span - 1

    ws.mergeCells(statRowLabel, startCol, statRowLabel, endCol)
    const labelCell = ws.getCell(statRowLabel, startCol)
    labelCell.value = stat.label
    labelCell.font = { size: 9, color: { argb: stat.font }, bold: true }
    labelCell.fill = { type: 'pattern', pattern: 'solid', fgColor: { argb: stat.fill } }
    labelCell.alignment = { vertical: 'middle', horizontal: 'center' }

    ws.mergeCells(statRowValue, startCol, statRowValue, endCol)
    const valueCell = ws.getCell(statRowValue, startCol)
    valueCell.value = stat.value
    valueCell.font = { size: 13, bold: true, color: { argb: stat.font } }
    valueCell.fill = { type: 'pattern', pattern: 'solid', fgColor: { argb: stat.fill } }
    valueCell.alignment = { vertical: 'middle', horizontal: 'center' }
  })
  ws.getRow(statRowLabel).height = 16
  ws.getRow(statRowValue).height = 22

  // --- Header tabel ---
  const headerRowIdx = 7
  const headerRow = ws.getRow(headerRowIdx)
  HEADERS.forEach((h, i) => {
    const cell = headerRow.getCell(i + 1)
    cell.value = h
    cell.font = { bold: true, color: { argb: COLOR.headerFont }, size: 10 }
    cell.fill = { type: 'pattern', pattern: 'solid', fgColor: { argb: COLOR.headerFill } }
    cell.alignment = { vertical: 'middle', horizontal: i >= 6 && i <= 8 ? 'right' : 'left' }
    cell.border = thinBorder(COLOR.headerFill)
  })
  headerRow.height = 20
  ws.autoFilter = {
    from: { row: headerRowIdx, column: 1 },
    to: { row: headerRowIdx, column: HEADERS.length },
  }

  // --- Data ---
  rows.forEach((r, i) => {
    const rowIdx = headerRowIdx + 1 + i
    const row = ws.getRow(rowIdx)
    const band = i % 2 === 1
    const bandFill = band ? COLOR.bandFill : 'FFFFFFFF'

    const values = [
      r.no_invoice,
      r.no_kontrak,
      r.mitra,
      r.komoditi || '-',
      r.unit || '-',
      r.tanggal_invoice || '-',
      r.jumlah_pembayaran,
      r.piutang_pokok || null,
      r.piutang_pph_belum_setor || null,
      kategoriLabel(r.kategori),
    ]

    values.forEach((v, c) => {
      const cell = row.getCell(c + 1)
      cell.value = v as string | number | null
      cell.border = thinBorder(COLOR.border)
      cell.font = { size: 10 }
      cell.alignment = { vertical: 'middle', horizontal: c >= 6 && c <= 8 ? 'right' : 'left' }

      let fill = bandFill
      if (c === 7 && r.piutang_pokok > 0) {
        cell.font = { size: 10, bold: true, color: { argb: COLOR.pokokFont } }
        fill = COLOR.pokokFill
      } else if (c === 8 && r.piutang_pph_belum_setor > 0) {
        cell.font = { size: 10, bold: true, color: { argb: COLOR.pphFont } }
        fill = COLOR.pphFill
      }
      cell.fill = { type: 'pattern', pattern: 'solid', fgColor: { argb: fill } }

      if (c === 6 || c === 7 || c === 8) {
        cell.numFmt = CURRENCY_FMT
      }
    })
  })

  const buffer = await wb.xlsx.writeBuffer()
  const blob = new Blob([buffer], {
    type: 'application/vnd.openxmlformats-officedocument.spreadsheetml.sheet',
  })
  const url = URL.createObjectURL(blob)
  const a = document.createElement('a')
  a.href = url
  a.download = filename
  document.body.appendChild(a)
  a.click()
  document.body.removeChild(a)
  URL.revokeObjectURL(url)
}

function CURRENCY(value: number): string {
  return new Intl.NumberFormat('id-ID', {
    style: 'currency',
    currency: 'IDR',
    minimumFractionDigits: 0,
    maximumFractionDigits: 0,
  }).format(value)
}
