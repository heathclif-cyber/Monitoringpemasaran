import { useEffect, useMemo, useState } from 'react'
import { RefreshCw } from 'lucide-react'
import { useLaporanStore, canSaveSapFields, laporanRowKey } from '@/store/laporanStore'
import { useAppStore } from '@/store/appStore'
import { useAuthStore } from '@/store/authStore'
import { Button } from '@/components/ui/button'
import { SearchInput } from '@/components/common/SearchInput'
import { FilterSelect } from '@/components/common/FilterBar'
import { FilterToolbar, ListPanel, PageHeader, PageShell, StatPills, StatusPill } from '@/components/patterns'
import { groupLaporanByInvoice, mergeInvoiceGroup } from '@/utils/laporanUtils'
import { cn, formatCurrency, formatDate, safe } from '@/lib/utils'
import type { LaporanRow } from '@/types'

type StatusFilter = 'BELUM_BILLING' | 'SAP_BELUM_LENGKAP' | 'LENGKAP' | 'ALL'

const SAP_CHIPS = [
  { field: 'Kontrak_SAP', label: 'Kontrak' },
  { field: 'SO_SAP', label: 'SO' },
  { field: 'DO_SAP', label: 'DO' },
] as const

const TH = 'border-b bg-muted px-4 py-2.5 text-left text-xs font-semibold text-muted-foreground'
const TD = 'border-b px-4 py-3 align-top text-[13px]'

function hasValue(v: string | undefined | null): boolean {
  return !!(v || '').trim()
}

export default function CekSapPage() {
  const { rows, isLoading, fetch, patchRow, updateSapField } = useLaporanStore()
  const { addNotification } = useAppStore()
  const canEdit = useAuthStore((s) => s.canEdit)
  const [status, setStatus] = useState<StatusFilter>('BELUM_BILLING')
  const [unit, setUnit] = useState('')
  const [search, setSearch] = useState('')

  useEffect(() => { void fetch() }, [])

  // Satu baris per invoice (billing SAP terbit setelah invoice ada); entri bypass tanpa invoice tidak ikut.
  const invoices = useMemo(() => {
    const withInvoice = rows.filter((r) => hasValue(r.No_Invoice) && r.No_Invoice !== '-' && !r.No_DO.startsWith('BYPASS-'))
    return groupLaporanByInvoice(withInvoice, 'DESC').map(mergeInvoiceGroup)
  }, [rows])

  const units = useMemo(() => [...new Set(invoices.map((r) => r.Unit).filter(Boolean))].sort(), [invoices])

  const stats = useMemo(() => {
    const noBilling = invoices.filter((r) => !hasValue(r.Billing)).length
    const lengkap = invoices.filter((r) => hasValue(r.Kontrak_SAP) && hasValue(r.SO_SAP) && hasValue(r.DO_SAP) && hasValue(r.Billing)).length
    return { total: invoices.length, noBilling, lengkap, belumLengkap: invoices.length - lengkap }
  }, [invoices])

  const list = useMemo(() => {
    const q = search.trim().toLowerCase()
    return invoices.filter((r) => {
      if (unit && r.Unit !== unit) return false
      const complete = hasValue(r.Kontrak_SAP) && hasValue(r.SO_SAP) && hasValue(r.DO_SAP) && hasValue(r.Billing)
      if (status === 'BELUM_BILLING' && hasValue(r.Billing)) return false
      if (status === 'SAP_BELUM_LENGKAP' && complete) return false
      if (status === 'LENGKAP' && !complete) return false
      if (!q) return true
      return [r.No_Invoice, r.No_Kontrak, r.Mitra_Pembeli, r.Unit, r.Komoditi, r.Kontrak_SAP, r.SO_SAP, r.DO_SAP, r.Billing]
        .some((v) => (v || '').toLowerCase().includes(q))
    })
  }, [invoices, status, unit, search])

  const saveBilling = async (row: LaporanRow, value: string) => {
    const key = laporanRowKey(row)
    try {
      await updateSapField(key, 'Billing', value)
      patchRow(key, { Billing: value })
      addNotification('Billing tersimpan', 'success')
    } catch (err) {
      addNotification(err instanceof Error ? err.message : 'Gagal menyimpan', 'error')
    }
  }

  return (
    <PageShell width="wide" density="compact">
      <PageHeader
        title="Cek SAP"
        description="Daftar invoice yang belum masuk SAP. Invoice tanpa nomor billing ditandai “Belum ada no billing”."
        actions={
          <Button variant="outline" size="sm" onClick={() => void fetch({ fresh: true })} disabled={isLoading} className="gap-1.5">
            <RefreshCw size={14} className={isLoading ? 'animate-spin' : ''} /> Refresh
          </Button>
        }
      />

      <FilterToolbar>
        <FilterSelect
          value={status}
          onChange={(v) => setStatus(v as StatusFilter)}
          options={[
            { value: 'BELUM_BILLING', label: 'Belum ada no billing' },
            { value: 'SAP_BELUM_LENGKAP', label: 'SAP belum lengkap' },
            { value: 'LENGKAP', label: 'SAP lengkap' },
            { value: 'ALL', label: 'Semua invoice' },
          ]}
          className="w-52"
        />
        <FilterSelect
          value={unit}
          onChange={setUnit}
          options={[{ value: '', label: 'Semua Unit' }, ...units.map((u) => ({ value: u, label: u }))]}
          className="w-48"
        />
        <SearchInput value={search} onChange={setSearch} placeholder="Cari invoice, kontrak, mitra, no SAP..." className="min-w-[240px] max-w-none flex-1" />
      </FilterToolbar>

      <StatPills items={[
        { label: 'Total invoice', value: stats.total },
        { label: 'Belum ada no billing', value: stats.noBilling, tone: stats.noBilling > 0 ? 'danger' : 'success' },
        { label: 'SAP belum lengkap', value: stats.belumLengkap, tone: stats.belumLengkap > 0 ? 'warning' : 'success' },
        { label: 'SAP lengkap', value: stats.lengkap, tone: 'success' },
      ]} />

      <ListPanel
        loading={isLoading && rows.length === 0}
        empty={list.length === 0}
        emptyTitle={status === 'BELUM_BILLING' ? 'Semua invoice sudah punya no billing' : 'Tidak ada data'}
        emptyDescription="Ubah filter atau kata kunci pencarian."
      >
        <div className="max-h-[75vh] overflow-auto">
          <table className="w-full min-w-[960px] table-fixed border-separate border-spacing-0">
            <colgroup>
              <col style={{ width: '20%' }} />
              <col style={{ width: '24%' }} />
              <col style={{ width: '14%' }} />
              <col style={{ width: '20%' }} />
              <col style={{ width: '22%' }} />
            </colgroup>
            <thead className="sticky top-0 z-10">
              <tr>
                <th className={TH}>Mitra Pembeli</th>
                <th className={TH}>Invoice / Kontrak</th>
                <th className={cn(TH, 'text-right')}>Nilai Invoice</th>
                <th className={TH}>No. SAP</th>
                <th className={TH}>No. Billing</th>
              </tr>
            </thead>
            <tbody>
              {list.map((row) => {
                const noBilling = !hasValue(row.Billing)
                const editable = canEdit() && canSaveSapFields(row)
                return (
                  <tr key={row.No_Invoice} className={cn('transition-colors hover:bg-muted/40', noBilling && 'bg-red-50/40 dark:bg-red-950/10')}>
                    <td className={TD}>
                      <p className="font-semibold leading-snug">{safe(row.Mitra_Pembeli)}</p>
                      <p className="mt-1 text-xs text-muted-foreground">{safe(row.Unit)} · {safe(row.Komoditi)}</p>
                    </td>
                    <td className={TD}>
                      <p className="font-medium tabular-nums [overflow-wrap:anywhere]">{row.No_Invoice}</p>
                      <p className="mt-1 text-xs text-muted-foreground tabular-nums [overflow-wrap:anywhere]">{safe(row.No_Kontrak, '—')}</p>
                      <p className="mt-1 text-xs text-muted-foreground">{formatDate(row.Billing_Date)}</p>
                    </td>
                    <td className={cn(TD, 'text-right font-semibold tabular-nums')}>
                      {row.Jumlah_Invoice > 0 ? formatCurrency(row.Jumlah_Invoice) : '—'}
                    </td>
                    <td className={TD}>
                      <div className="flex flex-wrap gap-1">
                        {SAP_CHIPS.map(({ field, label }) => (
                          <span
                            key={field}
                            title={hasValue(row[field]) ? `${label} SAP: ${row[field]}` : `${label} SAP belum diisi`}
                            className={cn(
                              'rounded px-1.5 py-0.5 text-[11px] font-medium',
                              hasValue(row[field]) ? 'bg-emerald-100 text-emerald-800 dark:bg-emerald-950/40 dark:text-emerald-300' : 'bg-muted text-muted-foreground line-through',
                            )}
                          >
                            {label}
                          </span>
                        ))}
                      </div>
                    </td>
                    <td className={TD}>
                      {noBilling && <StatusPill tone="danger">Belum ada no billing</StatusPill>}
                      <input
                        key={`${row.No_Invoice}-${row.Billing || ''}`}
                        className={cn(
                          'mt-1.5 h-8 w-full rounded-md border border-border/60 bg-background px-2.5 text-[13px] hover:border-border focus:border-ring focus:outline-none focus:ring-1 focus:ring-ring/30',
                          !editable && 'cursor-not-allowed bg-muted/40 opacity-60',
                          !noBilling && 'mt-0',
                        )}
                        defaultValue={row.Billing || ''}
                        readOnly={!editable}
                        placeholder={editable ? 'Isi no billing' : '—'}
                        onBlur={(e) => { if (editable && e.target.value !== (row.Billing || '')) void saveBilling(row, e.target.value) }}
                      />
                    </td>
                  </tr>
                )
              })}
            </tbody>
          </table>
        </div>
      </ListPanel>
    </PageShell>
  )
}
