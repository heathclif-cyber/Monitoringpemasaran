import { StatusPill } from '@/components/patterns'
import { canSaveSapFields } from '@/store/laporanStore'
import { useAuthStore } from '@/store/authStore'
import { cn, formatCurrency, formatDate, safe } from '@/lib/utils'
import type { LaporanRow } from '@/types'

const SAP_CHIPS = [
  { field: 'Kontrak_SAP', label: 'Kontrak' },
  { field: 'SO_SAP', label: 'SO' },
  { field: 'DO_SAP', label: 'DO' },
] as const

const th = 'border-b bg-muted px-4 py-2.5 text-left text-xs font-semibold text-muted-foreground'
const td = 'border-b px-4 py-3.5 align-top text-[13px]'

const filled = (v: string | undefined | null) => !!(v || '').trim()

/** Invoice yang sudah terbit tetapi belum punya nomor billing SAP (bypass tanpa invoice tidak dihitung). */
export function isMissingBilling(row: LaporanRow): boolean {
  return filled(row.No_Invoice) && row.No_Invoice !== '-' && !row.No_DO.startsWith('BYPASS-') && !filled(row.Billing)
}

export function LaporanBelumSapTable({ rows, onSapSave }: {
  rows: LaporanRow[]
  onSapSave: (row: LaporanRow, field: string, value: string) => Promise<void>
}) {
  const canEdit = useAuthStore((s) => s.canEdit)
  if (rows.length === 0) {
    return <p className="px-4 py-10 text-center text-sm text-muted-foreground">Semua invoice pada filter ini sudah punya no billing SAP.</p>
  }
  return (
    <div className="max-h-[75vh] overflow-auto">
      <table className="w-full min-w-[1000px] table-fixed border-separate border-spacing-0">
        <colgroup>
          <col style={{ width: '22%' }} />
          <col style={{ width: '26%' }} />
          <col style={{ width: '14%' }} />
          <col style={{ width: '16%' }} />
          <col style={{ width: '22%' }} />
        </colgroup>
        <thead className="sticky top-0 z-10">
          <tr>
            <th className={th}>Mitra Pembeli</th>
            <th className={th}>Invoice / Kontrak</th>
            <th className={cn(th, 'text-right')}>Nilai Invoice</th>
            <th className={th}>SAP lainnya</th>
            <th className={th}>No. Billing</th>
          </tr>
        </thead>
        <tbody>
          {rows.map((row) => {
            const editable = canEdit() && canSaveSapFields(row)
            return (
              <tr key={row.No_Invoice} className="bg-red-50/40 transition-colors hover:bg-muted/40 dark:bg-red-950/10">
                <td className={td}>
                  <p className="font-semibold leading-snug">{safe(row.Mitra_Pembeli)}</p>
                  <p className="mt-1 text-xs text-muted-foreground">{safe(row.Unit)} · {safe(row.Komoditi)}</p>
                </td>
                <td className={td}>
                  <p className="font-medium tabular-nums [overflow-wrap:anywhere]">{row.No_Invoice}</p>
                  <p className="mt-1 text-xs text-muted-foreground tabular-nums [overflow-wrap:anywhere]">{safe(row.No_Kontrak, '—')}</p>
                  <p className="mt-1 text-xs text-muted-foreground">{formatDate(row.Billing_Date)}</p>
                </td>
                <td className={cn(td, 'text-right font-semibold tabular-nums')}>{row.Jumlah_Invoice > 0 ? formatCurrency(row.Jumlah_Invoice) : '—'}</td>
                <td className={td}>
                  <div className="flex flex-wrap gap-1">
                    {SAP_CHIPS.map(({ field, label }) => (
                      <span
                        key={field}
                        title={filled(row[field]) ? `${label} SAP: ${row[field]}` : `${label} SAP belum diisi`}
                        className={cn(
                          'rounded px-1.5 py-0.5 text-[11px] font-medium',
                          filled(row[field]) ? 'bg-emerald-100 text-emerald-800 dark:bg-emerald-950/40 dark:text-emerald-300' : 'bg-muted text-muted-foreground line-through',
                        )}
                      >
                        {label}
                      </span>
                    ))}
                  </div>
                </td>
                <td className={td}>
                  <StatusPill tone="danger">Belum ada no billing</StatusPill>
                  <input
                    key={`${row.No_Invoice}-${row.Billing || ''}`}
                    className={cn(
                      'mt-1.5 h-8 w-full rounded-md border border-border/60 bg-background px-2.5 text-[13px] hover:border-border focus:border-ring focus:outline-none focus:ring-1 focus:ring-ring/30',
                      !editable && 'cursor-not-allowed bg-muted/40 opacity-60',
                    )}
                    defaultValue=""
                    readOnly={!editable}
                    placeholder={editable ? 'Isi no billing' : '—'}
                    onBlur={(e) => { if (editable && e.target.value.trim()) void onSapSave(row, 'Billing', e.target.value) }}
                  />
                </td>
              </tr>
            )
          })}
        </tbody>
      </table>
    </div>
  )
}
