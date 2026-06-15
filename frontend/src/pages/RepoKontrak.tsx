import { useEffect, useMemo, useState } from 'react'
import { Edit, FileDown, Trash2, Eye, GitBranch } from 'lucide-react'
import { useNavigate } from 'react-router-dom'
import { useKontrakStore } from '@/store/kontrakStore'
import { useAppStore } from '@/store/appStore'
import { Card, CardContent } from '@/components/ui/card'
import { Button } from '@/components/ui/button'
import { Badge } from '@/components/ui/badge'
import { ConfirmDialog } from '@/components/common/ConfirmDialog'
import { EmptyState } from '@/components/common/EmptyState'
import { TableSkeleton } from '@/components/common/LoadingSkeleton'
import { Dialog, DialogContent, DialogHeader, DialogTitle } from '@/components/ui/dialog'
import { DocxPreview } from '@/components/common/DocxPreview'
import { SearchInput } from '@/components/common/SearchInput'
import { FilterBar, FilterSelect } from '@/components/common/FilterBar'
import { DataTable } from '@/components/common/DataTable'
import { formatCurrency, formatDate, safe } from '@/lib/utils'
import type { Kontrak } from '@/types'

function formatMonthKey(dateStr: string): string {
  if (!dateStr) return ''
  const parts = dateStr.split('-')
  return parts.length >= 2 ? `${parts[0]}-${parts[1]}` : ''
}

const MONTHS: Record<string, string> = {
  '01': 'Januari', '02': 'Februari', '03': 'Maret', '04': 'April',
  '05': 'Mei', '06': 'Juni', '07': 'Juli', '08': 'Agustus',
  '09': 'September', '10': 'Oktober', '11': 'November', '12': 'Desember',
}

export default function RepoKontrak() {
  const navigate = useNavigate()
  const store = useKontrakStore()
  const { addNotification } = useAppStore()
  const [search, setSearch] = useState('')
  const [bulan, setBulan] = useState('ALL')
  const [unit, setUnit] = useState('ALL')
  const [pembeli, setPembeli] = useState('ALL')
  const [sort, setSort] = useState<'DESC' | 'ASC'>('DESC')
  const [deleteTarget, setDeleteTarget] = useState<string | null>(null)
  const [previewOpen, setPreviewOpen] = useState(false)
  const [previewData, setPreviewData] = useState<Kontrak | null>(null)

  useEffect(() => { store.fetch() }, [])

  const months = useMemo(() => {
    const keys = new Set<string>()
    store.data.forEach((k) => {
      const m = formatMonthKey(k.tanggal_kontrak)
      if (m) keys.add(m)
    })
    return Array.from(keys).sort().reverse().map((k) => {
      const [, mm] = k.split('-')
      return { value: k, label: `${MONTHS[mm] || ''} ${k.split('-')[0]}` }
    })
  }, [store.data])

  const units = useMemo(() => [...new Set(store.data.map((k) => k.kebun_produsen).filter(Boolean))].sort(), [store.data])
  const pembelis = useMemo(() => [...new Set(store.data.map((k) => (k.pembeli || '').split('\n')[0]).filter(Boolean))].sort(), [store.data])

  const filtered = useMemo(() => {
    let data = store.data.filter((k) => {
      if (bulan !== 'ALL' && !(k.tanggal_kontrak || '').startsWith(bulan)) return false
      if (unit !== 'ALL' && k.kebun_produsen !== unit) return false
      if (pembeli !== 'ALL' && !(k.pembeli || '').includes(pembeli)) return false
      if (search && !(`${k.no_kontrak} ${k.pembeli} ${k.komoditi}`.toLowerCase().includes(search.toLowerCase()))) return false
      return true
    })
    data.sort((a, b) => {
      const ta = new Date(a.tanggal_kontrak || 0).getTime()
      const tb = new Date(b.tanggal_kontrak || 0).getTime()
      return sort === 'DESC' ? tb - ta : ta - tb
    })
    return data
  }, [store.data, bulan, unit, pembeli, search, sort])

  const handleDelete = async () => {
    if (!deleteTarget) return
    try {
      await store.remove(deleteTarget)
      addNotification('Kontrak dihapus', 'success')
    } catch {
      addNotification('Gagal menghapus kontrak', 'error')
    }
    setDeleteTarget(null)
  }

  const handlePreview = (item: Kontrak) => {
    setPreviewData(item)
    setPreviewOpen(true)
  }

  const sortOptions = [
    { value: 'DESC', label: 'Terbaru ke Terlama' },
    { value: 'ASC', label: 'Terlama ke Terbaru' },
  ]

  return (
    <div className="space-y-4">
      <FilterBar>
        <SearchInput value={search} onChange={setSearch} placeholder="Cari no kontrak, pembeli..." />
        <FilterSelect
          value={bulan}
          onChange={setBulan}
          options={[{ value: 'ALL', label: 'Semua Bulan' }, ...months]}
        />
        <FilterSelect
          value={unit}
          onChange={setUnit}
          options={[{ value: 'ALL', label: 'Semua Unit' }, ...units.filter(Boolean).map((u) => ({ value: u!, label: u! }))]}
        />
        <FilterSelect
          value={pembeli}
          onChange={setPembeli}
          options={[{ value: 'ALL', label: 'Semua Pembeli' }, ...pembelis.map((p) => ({ value: p, label: p }))]}
        />
        <FilterSelect value={sort} onChange={(v) => setSort(v as 'DESC' | 'ASC')} options={sortOptions} />
      </FilterBar>

      <Card className="border-slate-200/80">
        <CardContent className="p-0">
          {store.isLoading ? <TableSkeleton rows={5} cols={6} /> : filtered.length === 0 ? (
            <EmptyState title="Belum ada data kontrak" description="Buat kontrak baru dari menu Buat Kontrak" />
          ) : (
            <DataTable
              data={filtered}
              keyExtractor={(item) => item.no_kontrak}
              columns={[
                {
                  key: 'no',
                  header: 'No Kontrak',
                  render: (item) => <span className="font-medium text-slate-900">{item.no_kontrak}</span>,
                },
                {
                  key: 'tgl',
                  header: 'Tanggal',
                  render: (item) => <span className="text-slate-600">{formatDate(item.tanggal_kontrak)}</span>,
                },
                {
                  key: 'pembeli',
                  header: 'Pembeli',
                  render: (item) => (item.pembeli || '-').split('\n')[0],
                },
                {
                  key: 'komoditi',
                  header: 'Komoditi',
                  align: 'center',
                  render: (item) => (
                    <Badge variant="outline" className="bg-emerald-50 text-emerald-700 border-emerald-200 font-medium">
                      {safe(item.komoditi)}
                    </Badge>
                  ),
                },
                {
                  key: 'nilai',
                  header: 'Nilai',
                  align: 'right',
                  className: 'font-semibold tabular-nums',
                  render: (item) => formatCurrency(item.nilai_transaksi),
                },
                {
                  key: 'aksi',
                  header: 'Aksi',
                  align: 'center',
                  render: (item) => (
                    <div className="flex gap-0.5 justify-center opacity-80 group-hover:opacity-100">
                      <Button size="icon" variant="ghost" className="h-8 w-8 text-slate-600 hover:text-primary" title="Edit" onClick={() => navigate(`/kontrak?edit=${item.no_kontrak}`)}>
                        <Edit size={14} />
                      </Button>
                      <Button size="icon" variant="ghost" className="h-8 w-8 text-slate-600 hover:text-primary" title="Trace" onClick={() => navigate(`/kontrak-trace?id=${encodeURIComponent(item.no_kontrak)}`)}>
                        <GitBranch size={14} />
                      </Button>
                      <Button size="icon" variant="ghost" className="h-8 w-8 text-slate-600 hover:text-primary" title="Preview" onClick={() => handlePreview(item)}>
                        <Eye size={14} />
                      </Button>
                      <Button size="icon" variant="ghost" className="h-8 w-8 text-slate-400 hover:text-destructive" title="Hapus" onClick={() => setDeleteTarget(item.no_kontrak)}>
                        <Trash2 size={14} />
                      </Button>
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
        title="Hapus Kontrak"
        description="Semua invoice dan DO terkait juga akan terhapus. Tindakan ini tidak dapat dibatalkan."
        confirmLabel="Hapus"
        isDestructive
        onConfirm={handleDelete}
      />

      <Dialog open={previewOpen} onOpenChange={setPreviewOpen}>
        <DialogContent className="max-w-[780px] max-h-[90vh] overflow-y-auto">
          <DialogHeader>
            <DialogTitle className="flex items-center gap-2 text-sm">
              <Eye size={16} className="text-primary" />
              Preview Kontrak
            </DialogTitle>
          </DialogHeader>
          {previewData && (
            <>
              <div className="border rounded-lg bg-white overflow-hidden">
                <DocxPreview url={`/api/kontrak/export?no_kontrak=${encodeURIComponent(previewData.no_kontrak)}`} />
              </div>
              <div className="flex justify-end">
                <a href={`/api/kontrak/export?no_kontrak=${encodeURIComponent(previewData.no_kontrak)}`} target="_blank" rel="noreferrer">
                  <Button variant="secondary" className="gap-2">
                    <FileDown size={14} />
                    Download Kontrak .docx
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