import { Button } from '@/components/ui/button'
import { cn, formatCurrency, formatNumber } from '@/lib/utils'
import { rekapAveragePrice } from '@/utils/laporanUtils'
import type { LaporanRekapDimension, LaporanRekapRow } from '@/types'

export const REKAP_DIMENSIONS: { value: LaporanRekapDimension; label: string }[] = [
  { value: 'komoditi', label: 'Komoditi' },
  { value: 'produk', label: 'Produk' },
  { value: 'unit', label: 'Unit' },
  { value: 'pembeli', label: 'Pembeli' },
  { value: 'bulan', label: 'Bulan' },
]

function volumeText(kg: number, ea: number): string {
  const parts = []
  if (kg > 0) parts.push(`${formatNumber(Math.round(kg))} Kg`)
  if (ea > 0) parts.push(`${formatNumber(Math.round(ea))} EA`)
  return parts.length > 0 ? parts.join(' + ') : '—'
}

function priceText(r: LaporanRekapRow): string {
  // Harga rata-rata lintas komoditi tidak bermakna (mis. kelapa vs gula).
  if (r.komoditiCount > 1) return 'campuran'
  const price = rekapAveragePrice(r)
  return price ? `${formatCurrency(price.value)}/${price.unit}` : '—'
}

export function LaporanRekapTable({ dimension, onDimensionChange, groups, total, activeKeys, onSelect }: {
  dimension: LaporanRekapDimension
  onDimensionChange: (dimension: LaporanRekapDimension) => void
  groups: LaporanRekapRow[]
  total: LaporanRekapRow
  activeKeys: string[]
  onSelect: (row: LaporanRekapRow) => void
}) {
  const isPeriod = dimension === 'bulan'
  const th = 'border-b px-3 py-2 text-xs font-semibold whitespace-nowrap'
  const td = 'border-b px-3 py-2 text-[13px] whitespace-nowrap tabular-nums text-right'
  const maxSales = Math.max(...groups.map((g) => g.sales), 0)

  const cells = (r: LaporanRekapRow, isTotal = false) => (
    <>
      <td className={td}>{volumeText(r.volumeKg, r.volumeEa)}</td>
      <td className={td}>
        <p className="font-semibold">{formatCurrency(r.sales)}</p>
        {r.salesRencana > 0 && <p className="text-[11px] font-normal text-muted-foreground">rencana {formatCurrency(r.salesRencana)}</p>}
      </td>
      <td className={cn(td, 'w-36')}>
        {total.sales > 0 && (
          <div className="flex items-center justify-end gap-2">
            {!isTotal && <div className="h-1.5 w-16 rounded-full bg-muted"><div className="h-1.5 rounded-full bg-primary" style={{ width: `${maxSales > 0 ? (r.sales / maxSales) * 100 : 0}%` }} /></div>}
            <span className="w-11">{Math.round((r.sales / total.sales) * 100)}%</span>
          </div>
        )}
      </td>
      <td className={td}>{priceText(r)}</td>
      <td className={td}>
        <p>{r.cashIn > 0 ? formatCurrency(r.cashIn) : '—'}</p>
        {r.transferCount > 0 && <p className="text-[11px] text-muted-foreground">{r.transferCount}× transfer</p>}
      </td>
      {!isPeriod && (
        <>
          <td className={cn(td, (r.shortfall ?? 0) > 0 && 'text-destructive')}>
            <p>{r.shortfall == null ? '…' : r.shortfall > 0 ? formatCurrency(r.shortfall) : '—'}</p>
            {r.unpaidInvoices > 0 && <p className="text-[11px] text-muted-foreground">{r.unpaidInvoices} invoice</p>}
          </td>
          <td className={td}>{volumeText(r.pickupOutstandingKg, r.pickupOutstandingEa)}</td>
        </>
      )}
    </>
  )

  return (
    <div>
      <div className="flex flex-wrap items-center justify-between gap-2 border-b px-4 py-3">
        <div className="flex flex-wrap items-center gap-1">
          <span className="mr-1 text-sm font-semibold">Rekap per</span>
          {REKAP_DIMENSIONS.map((d) => (
            <Button key={d.value} type="button" size="sm" className="h-8" variant={dimension === d.value ? 'default' : 'outline'} onClick={() => onDimensionChange(d.value)}>
              {d.label}
            </Button>
          ))}
        </div>
        <p className="text-xs text-muted-foreground">Klik baris untuk memfilter · nilai sebelum PPN</p>
      </div>
      <div className="max-h-[60vh] overflow-auto">
        <table className="w-full min-w-[960px] border-separate border-spacing-0">
          <thead className="sticky top-0 z-10 bg-muted">
            <tr>
              <th className={cn(th, 'text-left')}>{REKAP_DIMENSIONS.find((d) => d.value === dimension)?.label}</th>
              <th className={cn(th, 'text-right')}>Volume</th>
              <th className={cn(th, 'text-right')}>Penjualan</th>
              <th className={cn(th, 'text-right')}>Porsi</th>
              <th className={cn(th, 'text-right')}>Harga Rata-rata</th>
              <th className={cn(th, 'text-right')}>Cash In</th>
              {!isPeriod && <th className={cn(th, 'text-right')}>Kurang Bayar</th>}
              {!isPeriod && <th className={cn(th, 'text-right')}>Belum Diambil</th>}
            </tr>
          </thead>
          <tbody>
            {groups.map((r) => (
              <tr
                key={r.key || '__empty__'}
                className={cn('cursor-pointer hover:bg-muted/50', activeKeys.includes(r.key) && 'bg-primary/5')}
                onClick={() => onSelect(r)}
              >
                <td className="border-b px-3 py-2 text-[13px] font-medium">{r.label}</td>
                {cells(r)}
              </tr>
            ))}
          </tbody>
          <tfoot className="sticky bottom-0 bg-muted">
            <tr className="font-semibold">
              <td className="px-3 py-2 text-[13px]">Total ({groups.length})</td>
              {cells(total, true)}
            </tr>
          </tfoot>
        </table>
      </div>
    </div>
  )
}
