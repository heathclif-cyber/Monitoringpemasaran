import { AlertTriangle, ArrowDown, ArrowUp } from 'lucide-react'
import { StatusPill } from '@/components/patterns'
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

function Shortfall({ row, balances, hasCash }: { row: LaporanRow; balances: PiutangRow[] | null; hasCash: boolean }) {
  if (!row.No_Invoice || row.No_Invoice === '-' || row.No_DO.startsWith('BYPASS-')) return <span className="text-muted-foreground">—</span>
  if (!balances) return <span className="text-xs text-muted-foreground">…</span>
  const shortfall = balances.find((b) => b.no_invoice === row.No_Invoice)?.piutang_pokok ?? 0
  if (shortfall > 0) return <span className="font-semibold text-destructive">{formatCurrency(shortfall)}</span>
  return hasCash ? <StatusPill tone="success">Lunas</StatusPill> : <span className="text-muted-foreground">—</span>
}

function PickupLine({ label, children, className }: { label: string; children: React.ReactNode; className?: string }) {
  return (
    <div className="flex items-baseline justify-between gap-2">
      <span className="text-xs text-muted-foreground">{label}</span>
      <span className={cn('whitespace-nowrap tabular-nums', className)}>{children}</span>
    </div>
  )
}

function DocLine({ label, value }: { label: string; value: string }) {
  return (
    <div>
      <p className="text-[11px] text-muted-foreground">{label}</p>
      <p className="text-xs font-medium leading-5 tabular-nums [overflow-wrap:anywhere]">{value.split('/').map((part, i, all) => <span key={i}>{part}{i < all.length - 1 && <>/<wbr /></>}</span>)}</p>
    </div>
  )
}

export function LaporanRincianTable({ groups, balances, sort, onToggleSort, onDetail }: {
  groups: LaporanInvoiceGroup[]
  balances: PiutangRow[] | null
  sort: 'DESC' | 'ASC'
  onToggleSort: () => void
  onDetail: (row: LaporanRow) => void
}) {
  const th = 'border-b bg-muted px-4 py-2.5 text-xs font-semibold text-muted-foreground'
  const td = 'border-b px-4 py-3.5 align-top text-[13px]'
  return (
    <div className="max-h-[75vh] overflow-auto">
      <table className="w-full min-w-[1100px] table-fixed border-separate border-spacing-0">
        <colgroup>
          <col style={{ width: '14%' }} />
          <col style={{ width: '17%' }} />
          <col style={{ width: '13%' }} />
          <col style={{ width: '20%' }} />
          <col style={{ width: '12%' }} />
          <col style={{ width: '12%' }} />
          <col style={{ width: '12%' }} />
        </colgroup>
        <thead className="sticky top-0 z-10">
          <tr>
            <th className={cn(th, 'text-left')}>
              <button type="button" className="inline-flex items-center gap-1 hover:text-primary" onClick={onToggleSort} title="Urutkan berdasarkan tanggal di bawah nama mitra">
                Mitra Pembeli {sort === 'DESC' ? <ArrowDown size={12} /> : <ArrowUp size={12} />}
              </button>
            </th>
            <th className={cn(th, 'text-left')}>Invoice / Kontrak</th>
            <th className={cn(th, 'text-left')}>Komoditi / Material</th>
            <th className={cn(th, 'text-left')}>Pengambilan Barang</th>
            <th className={cn(th, 'text-right')}>Pendapatan Pokok</th>
            <th className={cn(th, 'text-right')}>Cash In</th>
            <th className={cn(th, 'text-right')}>Sisa Kurang Bayar</th>
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
            const servedPct = g.doIssued > 0 ? Math.min(100, (g.served / g.doIssued) * 100) : g.served > 0 ? 100 : 0
            return (
              <tr key={g.key} className="group cursor-pointer transition-colors hover:bg-muted/40" onClick={() => onDetail(row)}>
                <td className={td}>
                  <p className="font-semibold leading-snug">{safe(row.Mitra_Pembeli)}</p>
                  <p className="mt-1.5 inline-flex items-center gap-1 text-xs text-muted-foreground">
                    {date ? `${dateLabel} · ${formatDate(date)}` : 'Belum ada tanggal BA / rencana DO'}
                    {g.warnings.length > 0 && (
                      <span title={g.warnings.join('\n')} aria-label="Perlu diperiksa"><AlertTriangle size={13} className="text-amber-600" /></span>
                    )}
                  </p>
                </td>
                <td className={cn(td, 'space-y-1')}>
                  {isBypass ? <p className="text-xs text-muted-foreground">Entri manual</p> : <>
                    <DocLine label="Invoice" value={safe(row.No_Invoice, 'Belum terbit')} />
                    <DocLine label="Kontrak" value={safe(row.No_Kontrak, '—')} />
                  </>}
                </td>
                <td className={td}>
                  <p className="font-medium leading-snug">{safe(row.Komoditi)}</p>
                  {row.Deskripsi_Produk && row.Deskripsi_Produk !== row.Komoditi && <p className="mt-0.5 text-xs leading-snug text-muted-foreground">{row.Deskripsi_Produk}</p>}
                  <p className="mt-1.5 text-xs text-muted-foreground">{safe(row.Unit)}</p>
                </td>
                <td className={cn(td, 'space-y-1.5')}>
                  {isBypass ? (
                    <PickupLine label="Volume">{formatNumber(g.volume)} {unit}</PickupLine>
                  ) : <>
                    <PickupLine label="DO Terbit">{g.doIssued > 0 ? `${formatNumber(g.doIssued)} ${unit}` : <span className="text-muted-foreground">Tanpa DO</span>}</PickupLine>
                    <PickupLine label="DO Terlayani">{g.served > 0 ? `${formatNumber(g.served)} ${unit}` : <span className="text-muted-foreground">—</span>}</PickupLine>
                    {g.doIssued > 0 && (
                      <PickupLine label="Outstanding" className={cn('font-semibold', g.outstanding > 0 ? (ratio >= 0.5 ? 'text-destructive' : 'text-amber-700 dark:text-amber-400') : 'text-emerald-700 dark:text-emerald-400')}>
                        {g.outstanding > 0 ? `${formatNumber(g.outstanding)} ${unit}` : 'Selesai'}
                      </PickupLine>
                    )}
                    {g.doIssued > 0 && g.served > 0 && <div className="h-1.5 overflow-hidden rounded-full bg-muted"><div className="h-full rounded-full bg-primary" style={{ width: `${servedPct}%` }} /></div>}
                  </>}
                </td>
                <td className={cn(td, 'text-right tabular-nums')}>
                  <p className="text-sm font-semibold">{g.sales > 0 ? formatCurrency(g.sales) : '—'}</p>
                  {g.sales > 0 && <p className="mt-1 whitespace-nowrap text-xs text-muted-foreground">@ {Number.isInteger(row.Harga_Satuan) ? formatCurrency(row.Harga_Satuan) : formatCurrencyDec(row.Harga_Satuan)}/{unit}</p>}
                </td>
                <td className={cn(td, 'text-right tabular-nums')}>
                  <p className="text-sm font-semibold">{g.cashIn > 0 ? formatCurrency(g.cashIn) : '—'}</p>
                  {g.cashIn > 0 && g.cashDate && <p className="mt-1 text-xs text-muted-foreground">Transfer · {formatDate(g.cashDate)}</p>}
                </td>
                <td className={cn(td, 'text-right tabular-nums')}>
                  <Shortfall row={row} balances={balances} hasCash={g.cashIn > 0} />
                </td>
              </tr>
            )
          })}
        </tbody>
      </table>
    </div>
  )
}
