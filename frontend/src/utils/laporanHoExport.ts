import type { LaporanRow } from '@/types'

function pickReportMonth(months: string[]): string | null {
  if (months.length === 0) return null
  return [...months].sort((a, b) => b.localeCompare(a))[0]
}

function toHoPayloadRow(row: LaporanRow) {
  return {
    Komoditi: row.Komoditi,
    Deskripsi_Produk: row.Deskripsi_Produk,
    Jumlah_DO: row.Jumlah_DO,
    DPP_Pokok: row.DPP_Pokok,
    Pendapatan_Pokok: row.Pendapatan_Pokok,
    Satuan: row.Satuan,
    Raw_Date: row.Raw_Date,
    Tanggal_Transfer: row.Tanggal_Transfer,
    Bulan_Buku: row.Bulan_Buku,
    Rencana_Pengambilan: row.Rencana_Pengambilan,
    No_BA: row.No_BA,
    Tanggal_BA: row.Tanggal_BA,
    Billing_Date: row.Billing_Date,
  }
}

function parseFilename(contentDisposition: string | null): string | null {
  if (!contentDisposition) return null
  const match = /filename="([^"]+)"/i.exec(contentDisposition)
  return match?.[1] ?? null
}

export async function exportLaporanHO(
  rows: LaporanRow[],
  options: { year: string; months: string[]; modeTanggal: 'TRANSFER' | 'RENCANA' },
): Promise<{ ok: true } | { ok: false; message: string }> {
  const month = pickReportMonth(options.months)
  const year = options.year.trim()

  if (!year) {
    return { ok: false, message: 'Pilih tahun laporan terlebih dahulu' }
  }
  if (!month) {
    return { ok: false, message: 'Pilih minimal satu bulan untuk export format HO' }
  }
  if (rows.length === 0) {
    return { ok: false, message: 'Tidak ada data laporan untuk diekspor' }
  }

  const token = localStorage.getItem('auth_token')
  const headers: Record<string, string> = { 'Content-Type': 'application/json' }
  if (token) headers.Authorization = `Bearer ${token}`

  const res = await fetch(`${import.meta.env.VITE_API_URL || ''}/api/laporan/export-ho`, {
    method: 'POST',
    headers,
    body: JSON.stringify({
      year,
      month,
      mode_tanggal: options.modeTanggal,
      rows: rows.map(toHoPayloadRow),
    }),
  })

  if (!res.ok) {
    const body = await res.json().catch(() => ({ message: res.statusText }))
    const message = typeof body?.message === 'string'
      ? body.message
      : (typeof body?.detail === 'string' ? body.detail : 'Gagal export format HO')
    return { ok: false, message }
  }

  const blob = await res.blob()
  const filename = parseFilename(res.headers.get('Content-Disposition'))
    || `Laporan_HO_Penjualan_Lokal_${month}_${year}.xlsx`

  const url = URL.createObjectURL(blob)
  const anchor = document.createElement('a')
  anchor.href = url
  anchor.download = filename
  anchor.click()
  URL.revokeObjectURL(url)

  return { ok: true }
}