import { AlertTriangle, ArrowDown, ArrowUp } from 'lucide-react'
import { Button } from '@/components/ui/button'
import { cn, formatCurrency, formatCurrencyDec, formatDate, formatNumber, safe } from '@/lib/utils'
import { normalizeSatuan } from '@/utils/satuanUtils'
import { pickupRemainingRatio } from '@/utils/laporanUtils'
import type { LaporanInvoiceGroup, LaporanRow, PiutangRow } from '@/types'

/** Penjelasan tanggal yang tampil di bawah nama mitra */
const DATE_LABEL: Record<string, string> = {
  REALISASI: 'BA',
  RENCANA: 'Rencana DO',
  INVOICE: 'Invoice',
  KONTRAK: 'Kontrak',
  BYPASS: 'Bypass',
  PEMBAYARAN: 'Transfer',
}

function Shortfall({ row, balances }: { row: LaporanRow; balances: PiutangRow[] | null }) {
  if (!row.No_Invoice || row.No_Invoice === '-' || row.No_DO.startsWith('BYPASS-')) return <span className="text-muted-foreground">—</span>
  if (!balances) return <span className="text-xs text-muted-foreground">…</span>
  const shortfall = balances.find((b) => b.no_invoice === row.No_Invoice)?.piutang_pokok ?? 0
  return <span className={shortfall > 0 ? 'font-semibold text-destructive' : 'text-muted-foreground'}>{formatCurrency(shortfall)}</span>
}

export function LaporanRincianTable({ groups, balances, sort, onToggleSort, onDetail }: {
  groups: LaporanInvoiceGroup[]
  balances: PiutangRow[] | null
  sort: 'DESC' | 'ASC'
  onToggleSort: () => void
  onDetail: (row: LaporanRow) => void
}) {
  const band = 'border-b border-l px-3 py-1 text-center text-[11px] font-semibold uppercase tracking-wide text-muted-foreground'
  const th = 'border-b px-3 py-2 text-xs font-semibold whitespace-nowrap'
  const td = 'border-b px-3 py-2 align-top text-[13px]'
  const num = cn(td, 'whitespace-nowrap text-right tabular-nums')
  const edge = 'border-l'
  return (
    <div className="max-h-[70vh] overflow-auto">
      <table className="w-full min-w-[1150px] border-separate border-spacing-0">
        <thead className="sticky top-0 z-10 bg-muted">
          <tr>
            <th colSpan={2} className={cn(band, 'border-l-0')}>Transaksi</th>
            <th colSpan={3} className={band}>Pengambilan Barang</th>
            <th className={band}>Nilai</th>
            <th colSpan={2} className={band}>Pembayaran</th>
            <th className={band} />
          </tr>
          <tr>
            <th className={cn(th, 'text-left')}>
              <button type="button" className="inline-flex items-center gap-1 hover:text-foreground" onClick={onToggleSort} title="Urutkan berdasarkan tanggal di bawah nama mitra">
                Mitra Pembeli {sort === 'DESC' ? <ArrowDown size={12} /> : <ArrowUp size={12} />}
                <span className="font-normal text-muted-foreground">{sort === 'DESC' ? 'terbaru' : 'terlama'}</span>
              </button>
            </th>
            <th className={cn(th, 'text-left')}>Unit / Komoditi / Material</th>
            <th className={cn(th, edge, 'text-right')}>DO Terbit</th>
            <th className={cn(th, 'text-right')}>DO Terlayani (BA)</th>
            <th className={cn(th, 'text-right')}>Outstanding Pengambilan</th>
            <th className={cn(th, edge, 'text-right')}>Pendapatan Pokok</th>
            <th className={cn(th, edge, 'text-right')}>Cash In</th>
            <th className={cn(th, 'text-right')}>Sisa Kurang Bayar</th>
            <th className={th} />
          </tr>
        </thead>
        <tbody>
          {groups.map((g) => {
            const row = g.main
            const unit = normalizeSatuan(row.Satuan)
            const isBypass = row.No_DO.startsWith('BYPASS-')
            const ratio = pickupRemainingRatio(row)
            const date = g.salesDate || g.cashDate
            const dateLabel = DATE_LABEL[g.rowTypes[0] || (g.cashIn > 0 ? 'PEMBAYARAN' : '')] || ''
            return (
              <tr key={g.key} className="hover:bg-muted/40">
                <td className={cn(td, 'min-w-[240px] max-w-[320px]')}>
                  <p className="font-medium break-words">{safe(row.Mitra_Pembeli)}</p>
                  {isBypass ? <p className="text-[11px] text-muted-foreground">Entri manual</p> : <>
                    <p className="text-[11px] text-muted-foreground [overflow-wrap:anywhere]">Invoice: {safe(row.No_Invoice, 'Belum terbit')}</p>
                    <p className="text-[11px] text-muted-foreground [overflow-wrap:anywhere]">Kontrak: {safe(row.No_Kontrak, '—')}</p>
                  </>}
                  <p className="mt-0.5 inline-flex items-center gap-1 text-[11px] text-muted-foreground">
                    {date ? `${dateLabel} ${formatDate(date)}` : 'Belum ada tanggal BA / rencana DO'}
                    {g.warnings.length > 0 && (
                      <span title={g.warnings.join('\n')} aria-label="Perlu diperiksa"><AlertTriangle size={12} className="text-amber-600" /></span>
                    )}
                  </p>
                </td>
                <td className={cn(td, 'min-w-[170px] max-w-[230px]')}>
                  <p className="break-words">{safe(row.Komoditi)}{row.Deskripsi_Produk && row.Deskripsi_Produk !== row.Komoditi ? ` · ${row.Deskripsi_Produk}` : ''}</p>
                  <p className="text-[11px] text-muted-foreground">{safe(row.Unit)}</p>
                </td>
                <td className={cn(num, edge)}>{isBypass ? `${formatNumber(g.volume)} ${unit}` : g.doIssued > 0 ? `${formatNumber(g.doIssued)} ${unit}` : 'Belum ada DO'}</td>
                <td className={num}>{isBypass || g.served <= 0 ? '—' : `${formatNumber(g.served)} ${unit}`}</td>
                <td className={cn(num, !isBypass && g.outstanding > 0 && (ratio >= 0.5 ? 'font-semibold text-destructive' : 'text-destructive/80'))}>
                  {isBypass || g.doIssued <= 0 ? '—' : g.outstanding > 0 ? `${formatNumber(g.outstanding)} ${unit}` : 'Selesai'}
                  {!isBypass && g.outstanding > 0 && <p className="text-[11px] font-normal">{Math.round(ratio * 100)}% belum diambil</p>}
                </td>
                <td className={cn(num, edge)}>
                  <p className="font-medium">{g.sales > 0 ? formatCurrency(g.sales) : '—'}</p>
                  {g.sales > 0 && <p className="text-[11px] text-muted-foreground">{formatCurrencyDec(row.Harga_Satuan)} / {unit}</p>}
                </td>
                <td className={cn(num, edge)}>
                  <p>{g.cashIn > 0 ? formatCurrency(g.cashIn) : '—'}</p>
                  {g.cashIn > 0 && g.cashDate && <p className="text-[11px] text-muted-foreground">Transfer {formatDate(g.cashDate)}</p>}
                </td>
                <td className={num}><Shortfall row={row} balances={balances} /></td>
                <td className={cn(td, 'text-right')}>
                  <Button type="button" variant="ghost" size="sm" className="h-7 px-2" onClick={() => onDetail(row)}>Detail</Button>
                </td>
              </tr>
            )
          })}
        </tbody>
      </table>
    </div>
  )
}
