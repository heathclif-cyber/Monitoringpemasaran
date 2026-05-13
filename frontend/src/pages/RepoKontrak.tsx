import { useEffect, useMemo, useState } from 'react'
import { Edit, FileDown, Trash2, Search } from 'lucide-react'
import { useNavigate } from 'react-router-dom'
import { useKontrakStore } from '@/store/kontrakStore'
import { useAppStore } from '@/store/appStore'
import { Card, CardContent, CardHeader, CardTitle } from '@/components/ui/card'
import { Button } from '@/components/ui/button'
import { Input } from '@/components/ui/input'
import { ConfirmDialog } from '@/components/common/ConfirmDialog'
import { EmptyState } from '@/components/common/EmptyState'
import { TableSkeleton } from '@/components/common/LoadingSkeleton'
import { formatCurrency, formatDate, safe } from '@/lib/utils'

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

  const selCls = 'h-9 rounded-md border border-input bg-white px-3 py-1 text-xs shadow-sm'

  return (
    <div className="space-y-4">
      <div className="flex flex-wrap items-center gap-3">
        <div className="relative flex-1 max-w-xs">
          <Search size={14} className="absolute left-3 top-1/2 -translate-y-1/2 text-slate-400" />
          <input placeholder="Cari..." value={search} onChange={(e) => setSearch(e.target.value)} className="h-9 pl-9 pr-3 rounded-md border border-input bg-white text-sm shadow-sm w-full" />
        </div>
        <select value={bulan} onChange={(e) => setBulan(e.target.value)} className={selCls}>
          <option value="ALL">Semua Bulan</option>
          {months.map((m) => <option key={m.value} value={m.value}>{m.label}</option>)}
        </select>
        <select value={unit} onChange={(e) => setUnit(e.target.value)} className={selCls}>
          <option value="ALL">Semua Unit</option>
          {units.map((u) => u && <option key={u} value={u!}>{u}</option>)}
        </select>
        <select value={pembeli} onChange={(e) => setPembeli(e.target.value)} className={selCls}>
          <option value="ALL">Semua Pembeli</option>
          {pembelis.map((p) => <option key={p} value={p}>{p}</option>)}
        </select>
        <select value={sort} onChange={(e) => setSort(e.target.value as 'DESC' | 'ASC')} className={selCls}>
          <option value="DESC">Terbaru ke Terlama</option>
          <option value="ASC">Terlama ke Terbaru</option>
        </select>
      </div>

      <Card>
        <CardContent className="p-0">
          {store.isLoading ? <TableSkeleton rows={5} cols={6} /> : filtered.length === 0 ? (
            <EmptyState title="Belum ada data kontrak" />
          ) : (
            <div className="overflow-auto max-h-[65vh]">
              <table className="w-full text-sm">
                <thead>
                  <tr className="border-b bg-gray-50 text-gray-500 text-xs uppercase tracking-wide sticky top-0 z-10">
                    <th className="text-left px-3 py-2">No Kontrak</th>
                    <th className="text-left px-3 py-2">Tanggal</th>
                    <th className="text-left px-3 py-2">Pembeli</th>
                    <th className="text-center px-3 py-2">Komoditi</th>
                    <th className="text-right px-3 py-2">Nilai</th>
                    <th className="text-center px-3 py-2">Aksi</th>
                  </tr>
                </thead>
                <tbody className="divide-y">
                  {filtered.map((item) => (
                    <tr key={item.no_kontrak} className="hover:bg-gray-50 transition-colors group">
                      <td className="px-3 py-2.5 font-medium">{item.no_kontrak}</td>
                      <td className="px-3 py-2.5 text-slate-600">{formatDate(item.tanggal_kontrak)}</td>
                      <td className="px-3 py-2.5">{(item.pembeli || '-').split('\n')[0]}</td>
                      <td className="px-3 py-2.5 text-center">
                        <span className="inline-flex items-center px-2 py-0.5 rounded-full text-xs font-semibold bg-emerald-50 text-emerald-700 border border-emerald-200">
                          {safe(item.komoditi)}
                        </span>
                      </td>
                      <td className="px-3 py-2.5 text-right font-bold">{formatCurrency(item.nilai_transaksi)}</td>
                      <td className="px-3 py-2.5">
                        <div className="flex gap-1 justify-center">
                          <Button size="icon" variant="ghost" className="h-8 w-8 text-indigo-600" onClick={() => navigate(`/kontrak?edit=${item.no_kontrak}`)}>
                            <Edit size={14} />
                          </Button>
                          <a href={`/api/kontrak/export?no_kontrak=${encodeURIComponent(item.no_kontrak)}`} target="_blank">
                            <Button size="icon" variant="ghost" className="h-8 w-8 text-blue-600">
                              <FileDown size={14} />
                            </Button>
                          </a>
                          <Button size="icon" variant="ghost" className="h-8 w-8 text-red-500" onClick={() => setDeleteTarget(item.no_kontrak)}>
                            <Trash2 size={14} />
                          </Button>
                        </div>
                      </td>
                    </tr>
                  ))}
                </tbody>
              </table>
            </div>
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
    </div>
  )
}
