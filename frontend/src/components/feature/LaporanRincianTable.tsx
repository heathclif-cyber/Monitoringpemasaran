import { AlertTriangle, ArrowDown, ArrowUp } from 'lucide-react'
import { Button } from '@/components/ui/button'
import { StatusPill, type StatusPillTone } from '@/components/patterns'
import { cn, formatCurrency, formatDate, formatNumber, safe } from '@/lib/utils'
import { normalizeSatuan } from '@/utils/satuanUtils'
import type { LaporanInvoiceGroup, LaporanRow, PiutangRow } from '@/types'

const ROW_TYPE: Record<string, { label: string; tone: StatusPillTone }> = {
  REALISASI: { label: 'Realisasi', tone: 'success' },
  RENCANA: { label: 'Rencana DO', tone: 'warning' },
  PEMBAYARAN: { label: 'Pembayaran', tone: 'neutral' },
  INVOICE: { label: 'Invoice', tone: 'neutral' },
  KONTRAK: { label: 'Kontrak', tone: 'neutral' },
  BYPASS: { label: 'Bypass', tone: 'neutral' },
}

function PaymentStatus({ row, balances }: { row: LaporanRow; balances: PiutangRow[] | null }) {
  if (!row.No_Invoice || row.No_Invoice === '-' || row.No_DO.startsWith('BYPASS-')) return <span className="text-muted-foreground">—</span>
  if (!balances) return <span className="text-xs text-muted-foreground">…</span>
  const balance = balances.find((b) => b.no_invoice === row.No_Invoice)
  const shortfall = balance?.piutang_pokok ?? 0
  if (shortfall <= 0) return <StatusPill tone="success">Lunas</StatusPill>
  const paid = (balance?.total_dibayar_efektif ?? 0) > 0
  return (
    <div className="space-y-0.5">
      <StatusPill tone={paid ? 'warning' : 'danger'}>{paid ? 'Sebagian' : 'Belum bayar'}</StatusPill>
      <p className="text-[11px] tabular-nums text-destructive">sisa {formatCurrency(shortfall)}</p>
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
  const th = 'border-b px-3 py-2 text-xs font-semibold whitespace-nowrap'
  const td = 'border-b px-3 py-2 align-top text-[13px]'
  const num = cn(td, 'whitespace-nowrap text-right tabular-nums')
  return (
    <div className="max-h-[70vh] overflow-auto">
      <table className="w-full min-w-[1100px] border-separate border-spacing-0">
        <thead className="sticky top-0 z-10 bg-muted">
          <tr>
            <th className={cn(th, 'text-left')}>
              <button type="button" className="inline-flex items-center gap-1 hover:text-foreground" onClick={onToggleSort}>
                Tanggal {sort === 'DESC' ? <ArrowDown size={12} /> : <ArrowUp size={12} />}
              </button>
            </th>
            <th className={cn(th, 'text-left')}>Pembeli / Invoice</th>
            <th className={cn(th, 'text-left')}>Unit</th>
            <th className={cn(th, 'text-left')}>Produk</th>
            <th className={cn(th, 'text-right')}>Volume</th>
            <th className={cn(th, 'text-right')}>Harga</th>
            <th className={cn(th, 'text-right')}>Penjualan</th>
            <th className={cn(th, 'text-right')}>Cash In</th>
            <th className={cn(th, 'text-left')}>Status Bayar</th>
            <th className={th} />
          </tr>
        </thead>
        <tbody>
          {groups.map((g) => {
            const row = g.main
            const unit = normalizeSatuan(row.Satuan)
            const doc = row.No_DO.startsWith('BYPASS-') ? 'Entri manual' : row.No_Invoice || row.No_Kontrak
            return (
              <tr key={g.key} className="hover:bg-muted/40">
                <td className={cn(td, 'whitespace-nowrap')}>
                  <span className="inline-flex items-center gap-1">
                    {g.salesDate ? formatDate(g.salesDate) : g.cashDate ? formatDate(g.cashDate) : <span className="text-muted-foreground">Belum ada</span>}
                    {g.warnings.length > 0 && (
                      <span title={g.warnings.join('\n')} aria-label="Perlu diperiksa">
                        <AlertTriangle size={13} className="text-amber-600" />
                      </span>
                    )}
                  </span>
                  <div className="mt-1 flex flex-wrap gap-1">
                    {g.rowTypes.map((t) => {
                      const type = ROW_TYPE[t] ?? { label: t, tone: 'neutral' as const }
                      return <StatusPill key={t} tone={type.tone} icon={false}>{type.label}</StatusPill>
                    })}
                  </div>
                </td>
                <td className={cn(td, 'min-w-[200px] max-w-[280px]')}>
                  <p className="font-medium break-words">{safe(row.Mitra_Pembeli)}</p>
                  <p className="text-[11px] text-muted-foreground [overflow-wrap:anywhere]">{safe(doc)}</p>
                </td>
                <td className={cn(td, 'whitespace-nowrap')}>{safe(row.Unit)}</td>
                <td className={cn(td, 'min-w-[140px] max-w-[200px]')}>
                  <p>{safe(row.Komoditi)}</p>
                  {row.Deskripsi_Produk && row.Deskripsi_Produk !== row.Komoditi && <p className="text-[11px] text-muted-foreground break-words">{row.Deskripsi_Produk}</p>}
                </td>
                <td className={num}>{g.volume > 0 ? `${formatNumber(g.volume)} ${unit}` : '—'}</td>
                <td className={num}>{g.sales > 0 ? formatCurrency(row.Harga_Satuan) : '—'}</td>
                <td className={cn(num, 'font-medium')}>{g.sales > 0 ? formatCurrency(g.sales) : '—'}</td>
                <td className={num}>
                  <p>{g.cashIn > 0 ? formatCurrency(g.cashIn) : '—'}</p>
                  {g.cashIn > 0 && g.cashDate && <p className="text-[11px] text-muted-foreground">{formatDate(g.cashDate)}</p>}
                </td>
                <td className={td}><PaymentStatus row={row} balances={balances} /></td>
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
