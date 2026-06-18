import { useEffect, useMemo, useState } from 'react'
import { Edit, FileDown, Trash2, Eye } from 'lucide-react'
import { SupermanDeklarasiButton } from '@/components/common/SupermanDeklarasiButton'
import { useNavigate } from 'react-router-dom'
import { useDOStore } from '@/store/doStore'
import { useAppStore } from '@/store/appStore'
import { useAuthStore } from '@/store/authStore'
import { Card, CardContent } from '@/components/ui/card'
import { Button } from '@/components/ui/button'
import { ConfirmDialog } from '@/components/common/ConfirmDialog'
import { EmptyState } from '@/components/common/EmptyState'
import { TableSkeleton } from '@/components/common/LoadingSkeleton'
import { Dialog, DialogContent, DialogHeader, DialogTitle } from '@/components/ui/dialog'
import { DocxPreview } from '@/components/common/DocxPreview'
import { SearchInput } from '@/components/common/SearchInput'
import { FilterBar, FilterSelect } from '@/components/common/FilterBar'
import { DataTable } from '@/components/common/DataTable'
import { formatDate, safe } from '@/lib/utils'
import type { DeliveryOrder } from '@/types'

const MONTHS: Record<string, string> = {
  '01': 'Januari', '02': 'Februari', '03': 'Maret', '04': 'April',
  '05': 'Mei', '06': 'Juni', '07': 'Juli', '08': 'Agustus',
  '09': 'September', '10': 'Oktober', '11': 'November', '12': 'Desember',
}

export default function RepoDO() {
  const navigate = useNavigate()
  const store = useDOStore()
  const { addNotification } = useAppStore()
  const canEdit = useAuthStore((s) => s.canEdit)
  const [search, setSearch] = useState('')
  const [bulan, setBulan] = useState('ALL')
  const [unit, setUnit] = useState('ALL')
  const [sort, setSort] = useState<'DESC' | 'ASC'>('DESC')
  const [deleteTarget, setDeleteTarget] = useState<string | null>(null)
  const [previewOpen, setPreviewOpen] = useState(false)
  const [previewDO, setPreviewDO] = useState<DeliveryOrder | null>(null)

  useEffect(() => { store.fetch() }, [])

  const months = useMemo(() => {
    const keys = new Set<string>()
    store.data.forEach((d) => {
      if (d.tanggal_do) {
        const parts = d.tanggal_do.split('-')
        if (parts.length >= 2) keys.add(`${parts[0]}-${parts[1]}`)
      }
    })
    return Array.from(keys).sort().reverse().map((k) => {
      const [, mm] = k.split('-')
      return { value: k, label: `${MONTHS[mm] || ''} ${k.split('-')[0]}` }
    })
  }, [store.data])

  const units = useMemo(() => [...new Set(store.data.map((d) => d.kepada_unit).filter(Boolean))].sort(), [store.data])

  const filtered = useMemo(() => {
    let data = store.data.filter((d) => {
      if (bulan !== 'ALL' && !(d.tanggal_do || '').startsWith(bulan)) return false
      if (unit !== 'ALL' && d.kepada_unit !== unit) return false
      if (search && !(`${d.no_do} ${d.no_invoice} ${d.kepada_unit}`.toLowerCase().includes(search.toLowerCase()))) return false
      return true
    })
    data.sort((a, b) => {
      const ta = new Date(a.tanggal_do || 0).getTime()
      const tb = new Date(b.tanggal_do || 0).getTime()
      return sort === 'DESC' ? tb - ta : ta - tb
    })
    return data
  }, [store.data, bulan, unit, search, sort])

  const handleDelete = async () => {
    if (!deleteTarget) return
    try {
      await store.remove(deleteTarget)
      addNotification('DO dihapus', 'success')
    } catch { addNotification('Gagal menghapus', 'error') }
    setDeleteTarget(null)
  }

  return (
    <div className="space-y-4">
      <FilterBar>
        <SearchInput value={search} onChange={setSearch} placeholder="Cari no DO, invoice..." />
        <FilterSelect value={bulan} onChange={setBulan} options={[{ value: 'ALL', label: 'Semua Bulan' }, ...months]} />
        <FilterSelect
          value={unit}
          onChange={setUnit}
          options={[{ value: 'ALL', label: 'Semua Unit' }, ...units.filter(Boolean).map((u) => ({ value: u!, label: u! }))]}
        />
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
          {store.isLoading ? <TableSkeleton rows={5} cols={5} /> : filtered.length === 0 ? (
            <EmptyState title="Belum ada data DO" />
          ) : (
            <DataTable
              data={filtered}
              keyExtractor={(item) => item.no_do}
              columns={[
                { key: 'no', header: 'No DO', render: (item) => <span className="font-medium">{item.no_do}</span> },
                { key: 'inv', header: 'No Invoice', render: (item) => <span className="text-slate-600">{item.no_invoice}</span> },
                { key: 'tgl', header: 'Tanggal DO', render: (item) => formatDate(item.tanggal_do) },
                { key: 'unit', header: 'Unit Tujuan', render: (item) => safe(item.kepada_unit) },
                {
                  key: 'aksi',
                  header: 'Aksi',
                  align: 'center',
                  render: (item) => (
                    <div className="flex gap-0.5 justify-center">
                      {canEdit() && (
                        <Button size="icon" variant="ghost" className="h-8 w-8 text-slate-600 hover:text-primary" onClick={() => navigate(`/delivery-order?edit=${item.no_do}`)}>
                          <Edit size={14} />
                        </Button>
                      )}
                      <Button size="icon" variant="ghost" className="h-8 w-8 text-slate-600 hover:text-primary" onClick={() => { setPreviewDO(item); setPreviewOpen(true) }}>
                        <Eye size={14} />
                      </Button>
                      {canEdit() && (
                        <SupermanDeklarasiButton
                          noDo={item.no_do}
                          existingSuperman={item.superman}
                          compact
                          className="h-8 px-2"
                        />
                      )}
                      {canEdit() && (
                        <Button size="icon" variant="ghost" className="h-8 w-8 text-slate-400 hover:text-destructive" onClick={() => setDeleteTarget(item.no_do)}>
                          <Trash2 size={14} />
                        </Button>
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
        title="Hapus DO"
        description="Tindakan ini tidak dapat dibatalkan."
        confirmLabel="Hapus"
        isDestructive
        onConfirm={handleDelete}
      />

      <Dialog open={previewOpen} onOpenChange={setPreviewOpen}>
        <DialogContent className="max-w-[750px] max-h-[90vh] overflow-y-auto">
          <DialogHeader>
            <DialogTitle className="flex items-center gap-2 text-sm">
              <Eye size={16} className="text-primary" />
              Preview Delivery Order
            </DialogTitle>
          </DialogHeader>
          {previewDO && (
            <>
              <div className="border rounded-lg bg-white overflow-hidden">
                <DocxPreview url={`/api/do/export?no_do=${encodeURIComponent(previewDO.no_do)}`} />
              </div>
              <div className="flex justify-end">
                <a href={`/api/do/export?no_do=${encodeURIComponent(previewDO.no_do)}`} target="_blank" rel="noreferrer">
                  <Button variant="secondary" className="gap-2">
                    <FileDown size={14} />
                    Download DO .docx
                  </Button>
                </a>
              </div>
            </>
          )}
        </DialogContent>
      </Dialog>
    </div>
  )
}