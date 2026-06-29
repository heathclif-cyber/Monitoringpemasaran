import { useEffect, useMemo, useState } from 'react'
import { Edit, Trash2 } from 'lucide-react'
import { useNavigate } from 'react-router-dom'
import { usePembayaranStore } from '@/store/pembayaranStore'
import { useAppStore } from '@/store/appStore'
import { useAuthStore } from '@/store/authStore'
import { Card, CardContent } from '@/components/ui/card'
import { Button } from '@/components/ui/button'
import { ConfirmDialog } from '@/components/common/ConfirmDialog'
import { EmptyState } from '@/components/common/EmptyState'
import { TableSkeleton } from '@/components/common/LoadingSkeleton'
import { SearchInput } from '@/components/common/SearchInput'
import { FilterBar, FilterSelect } from '@/components/common/FilterBar'
import { DataTable } from '@/components/common/DataTable'
import { cn, formatCurrency, formatDate } from '@/lib/utils'
import type { Pembayaran } from '@/types'

const MONTHS: Record<string, string> = {
  '01': 'Januari', '02': 'Februari', '03': 'Maret', '04': 'April',
  '05': 'Mei', '06': 'Juni', '07': 'Juli', '08': 'Agustus',
  '09': 'September', '10': 'Oktober', '11': 'November', '12': 'Desember',
}

export default function RepoPembayaran() {
  const navigate = useNavigate()
  const store = usePembayaranStore()
  const { addNotification } = useAppStore()
  const canEdit = useAuthStore((s) => s.canEdit)
  const [search, setSearch] = useState('')
  const [bulan, setBulan] = useState('ALL')
  const [sort, setSort] = useState<'DESC' | 'ASC'>('DESC')
  const [deleteTarget, setDeleteTarget] = useState<string | null>(null)

  useEffect(() => { store.fetch() }, [])

  const months = useMemo(() => {
    const keys = new Set<string>()
    store.data.forEach((p) => {
      if (p.tanggal_pembayaran) {
        const parts = p.tanggal_pembayaran.split('-')
        if (parts.length >= 2) keys.add(`${parts[0]}-${parts[1]}`)
      }
    })
    return Array.from(keys).sort().reverse().map((k) => {
      const [, mm] = k.split('-')
      return { value: k, label: `${MONTHS[mm] || ''} ${k.split('-')[0]}` }
    })
  }, [store.data])

  const filtered = useMemo(() => {
    let data = store.data.filter((p) => {
      if (bulan !== 'ALL' && !(p.tanggal_pembayaran || '').startsWith(bulan)) return false
      if (search && !(`${p.no_pembayaran} ${p.no_invoice}`.toLowerCase().includes(search.toLowerCase()))) return false
      return true
    })
    data.sort((a, b) => {
      const ta = new Date(a.tanggal_pembayaran || 0).getTime()
      const tb = new Date(b.tanggal_pembayaran || 0).getTime()
      return sort === 'DESC' ? tb - ta : ta - tb
    })
    return data
  }, [store.data, bulan, search, sort])

  const handleDelete = async () => {
    if (!deleteTarget) return
    try {
      await store.remove(deleteTarget)
      addNotification('Pembayaran dihapus', 'success')
    } catch (err: unknown) {
      const message = err instanceof Error ? err.message : 'Gagal menghapus'
      addNotification(message, 'error')
    }
    setDeleteTarget(null)
  }

  return (
    <div className="space-y-4">
      <FilterBar>
        <SearchInput value={search} onChange={setSearch} placeholder="Cari no pembayaran, invoice..." />
        <FilterSelect value={bulan} onChange={setBulan} options={[{ value: 'ALL', label: 'Semua Bulan' }, ...months]} />
        <FilterSelect
          value={sort}
          onChange={(v) => setSort(v as 'DESC' | 'ASC')}
          options={[
            { value: 'DESC', label: 'Terbaru ke Terlama' },
            { value: 'ASC', label: 'Terlama ke Terbaru' },
          ]}
        />
      </FilterBar>

      <Card className="border-slate-200/80">
        <CardContent className="p-0">
          {store.isLoading ? <TableSkeleton rows={5} cols={6} /> : filtered.length === 0 ? (
            <EmptyState title="Belum ada data pembayaran" />
          ) : (
            <DataTable
              data={filtered}
              keyExtractor={(p) => p.no_pembayaran}
              columns={[
                {
                  key: 'no_pembayaran',
                  header: 'Termin',
                  render: (p: Pembayaran) => (
                    <span className="font-mono text-xs text-slate-700">{p.no_pembayaran}</span>
                  ),
                },
                { key: 'no_invoice', header: 'Invoice', render: (p: Pembayaran) => p.no_invoice },
                { key: 'tanggal_pembayaran', header: 'Tanggal', render: (p: Pembayaran) => formatDate(p.tanggal_pembayaran) },
                { key: 'nominal_transfer', header: 'Nominal', render: (p: Pembayaran) => formatCurrency(p.nominal_transfer) },
                {
                  key: 'superman',
                  header: 'Superman (Invoice)',
                  render: (p: Pembayaran) => (
                    <span className={cn('text-xs', p.superman ? 'text-emerald-700' : 'text-amber-700')}>
                      {p.superman || 'Menunggu pelunasan / Superman'}
                    </span>
                  ),
                },
                {
                  key: 'status',
                  header: 'Status DO',
                  render: (p: Pembayaran) => (
                    <span className={p.no_do ? 'text-emerald-700' : 'text-amber-700'}>
                      {p.no_do ? `DO: ${p.no_do}` : 'Menunggu DO'}
                    </span>
                  ),
                },
                {
                  key: 'actions',
                  header: 'Aksi',
                  align: 'center',
                  render: (p: Pembayaran) => (
                    <div className="flex gap-1 justify-end">
                      {canEdit() && (
                        <>
                          <Button
                            size="sm"
                            variant="ghost"
                            onClick={() => navigate(`/pembayaran?edit=${encodeURIComponent(p.no_pembayaran)}`)}
                          >
                            <Edit size={14} />
                          </Button>
                          {!p.no_do && !p.superman && (
                            <Button size="sm" variant="ghost" className="text-red-600" onClick={() => setDeleteTarget(p.no_pembayaran)}>
                              <Trash2 size={14} />
                            </Button>
                          )}
                        </>
                      )}
                    </div>
                  ),
                },
              ]}
            />
          )}
        </CardContent>
      </Card>

      <ConfirmDialog
        open={!!deleteTarget}
        onOpenChange={() => setDeleteTarget(null)}
        title="Hapus Pembayaran?"
        description="Pembayaran yang sudah punya DO tidak bisa dihapus."
        onConfirm={handleDelete}
      />
    </div>
  )
}