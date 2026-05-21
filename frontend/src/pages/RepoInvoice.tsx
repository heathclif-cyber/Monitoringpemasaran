import { useEffect, useMemo, useState } from 'react'
import { Edit, FileDown, Trash2, Search, Receipt, Eye } from 'lucide-react'
import { useNavigate } from 'react-router-dom'
import { useInvoiceStore } from '@/store/invoiceStore'
import { useAppStore } from '@/store/appStore'
import { Card, CardContent } from '@/components/ui/card'
import { Button } from '@/components/ui/button'
import { ConfirmDialog } from '@/components/common/ConfirmDialog'
import { EmptyState } from '@/components/common/EmptyState'
import { TableSkeleton } from '@/components/common/LoadingSkeleton'
import { formatCurrency, formatDate } from '@/lib/utils'
import { Dialog, DialogContent, DialogHeader, DialogTitle } from '@/components/ui/dialog'
import { DocxPreview } from '@/components/common/DocxPreview'
import type { Invoice } from '@/types'

const MONTHS: Record<string, string> = {
  '01': 'Januari', '02': 'Februari', '03': 'Maret', '04': 'April',
  '05': 'Mei', '06': 'Juni', '07': 'Juli', '08': 'Agustus',
  '09': 'September', '10': 'Oktober', '11': 'November', '12': 'Desember',
}

export default function RepoInvoice() {
  const navigate = useNavigate()
  const store = useInvoiceStore()
  const { addNotification } = useAppStore()
  const [search, setSearch] = useState('')
  const [bulan, setBulan] = useState('ALL')
  const [sort, setSort] = useState<'DESC' | 'ASC'>('DESC')
  const [deleteTarget, setDeleteTarget] = useState<string | null>(null)

  // Invoice preview
  const [invPreviewOpen, setInvPreviewOpen] = useState(false)
  const [invPreviewItem, setInvPreviewItem] = useState<Invoice | null>(null)

  // Kuitansi preview
  const [kwPreviewOpen, setKwPreviewOpen] = useState(false)
  const [kwPreviewItem, setKwPreviewItem] = useState<Invoice | null>(null)

  useEffect(() => { store.fetch() }, [])

  const months = useMemo(() => {
    const keys = new Set<string>()
    store.data.forEach((i) => {
      if (i.tanggal_transaksi) {
        const parts = i.tanggal_transaksi.split('-')
        if (parts.length >= 2) keys.add(`${parts[0]}-${parts[1]}`)
      }
    })
    return Array.from(keys).sort().reverse().map((k) => {
      const [, mm] = k.split('-')
      return { value: k, label: `${MONTHS[mm] || ''} ${k.split('-')[0]}` }
    })
  }, [store.data])

  const filtered = useMemo(() => {
    let data = store.data.filter((i) => {
      if (bulan !== 'ALL' && !(i.tanggal_transaksi || '').startsWith(bulan)) return false
      if (search && !(`${i.no_invoice} ${i.no_kontrak}`.toLowerCase().includes(search.toLowerCase()))) return false
      return true
    })
    data.sort((a, b) => {
      const ta = new Date(a.tanggal_transaksi || 0).getTime()
      const tb = new Date(b.tanggal_transaksi || 0).getTime()
      return sort === 'DESC' ? tb - ta : ta - tb
    })
    return data
  }, [store.data, bulan, search, sort])

  const handleDelete = async () => {
    if (!deleteTarget) return
    try {
      await store.remove(deleteTarget)
      addNotification('Invoice dihapus', 'success')
    } catch { addNotification('Gagal menghapus', 'error') }
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
        <select value={sort} onChange={(e) => setSort(e.target.value as 'DESC' | 'ASC')} className={selCls}>
          <option value="DESC">Terbaru ke Terlama</option>
          <option value="ASC">Terlama ke Terbaru</option>
        </select>
      </div>

      <Card>
        <CardContent className="p-0">
          {store.isLoading ? <TableSkeleton rows={5} cols={5} /> : filtered.length === 0 ? (
            <EmptyState title="Belum ada data invoice" />
          ) : (
            <div className="overflow-auto max-h-[65vh]">
              <table className="w-full text-sm">
                <thead>
                  <tr className="border-b bg-gray-50 text-gray-500 text-xs uppercase tracking-wide sticky top-0 z-10">
                    <th className="text-left px-3 py-2">No Invoice</th>
                    <th className="text-left px-3 py-2">No Kontrak</th>
                    <th className="text-left px-3 py-2">Tgl Transaksi</th>
                    <th className="text-right px-3 py-2">Tagihan Total</th>
                    <th className="text-center px-3 py-2">Aksi</th>
                  </tr>
                </thead>
                <tbody className="divide-y">
                  {filtered.map((item) => (
                    <tr key={item.no_invoice} className="hover:bg-gray-50 transition-colors group">
                      <td className="px-3 py-2.5 font-medium">{item.no_invoice}</td>
                      <td className="px-3 py-2.5 text-slate-600">{item.no_kontrak}</td>
                      <td className="px-3 py-2.5 text-slate-600">{formatDate(item.tanggal_transaksi)}</td>
                      <td className="px-3 py-2.5 text-right font-bold">{formatCurrency(item.jumlah_pembayaran)}</td>
                      <td className="px-3 py-2.5">
                        <div className="flex gap-1 justify-center">
                          <Button size="icon" variant="ghost" className="h-8 w-8 text-indigo-600" onClick={() => navigate(`/invoice?edit=${item.no_invoice}`)}>
                            <Edit size={14} />
                          </Button>
                          <Button size="icon" variant="ghost" className="h-8 w-8 text-blue-600" onClick={() => { setInvPreviewItem(item); setInvPreviewOpen(true) }}>
                            <Eye size={14} />
                          </Button>
                          <Button size="icon" variant="ghost" className="h-8 w-8 text-emerald-600" onClick={() => { setKwPreviewItem(item); setKwPreviewOpen(true) }}>
                            <Receipt size={14} />
                          </Button>
                          <Button size="icon" variant="ghost" className="h-8 w-8 text-red-500" onClick={() => setDeleteTarget(item.no_invoice)}>
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
        title="Hapus Invoice"
        description="Data DO terkait juga akan terhapus."
        confirmLabel="Hapus"
        isDestructive
        onConfirm={handleDelete}
      />

      {/* Invoice Preview Dialog */}
      <Dialog open={invPreviewOpen} onOpenChange={setInvPreviewOpen}>
        <DialogContent className="max-w-[750px] max-h-[90vh] overflow-y-auto">
          <DialogHeader>
            <DialogTitle className="flex items-center gap-2 text-sm">
              <Eye size={16} className="text-blue-600" />
              Preview Invoice
            </DialogTitle>
          </DialogHeader>
          {invPreviewItem && (
            <>
              <div className="border rounded-lg bg-white overflow-auto max-h-[65vh]">
                <DocxPreview url={`/api/invoice/export?no_invoice=${encodeURIComponent(invPreviewItem.no_invoice)}`} />
              </div>
              <div className="flex justify-end">
                <a href={`/api/invoice/export?no_invoice=${encodeURIComponent(invPreviewItem.no_invoice)}`} target="_blank">
                  <Button variant="secondary" className="gap-2">
                    <FileDown size={14} /> Download Invoice .docx
                  </Button>
                </a>
              </div>
            </>
          )}
        </DialogContent>
      </Dialog>

      {/* Kuitansi Preview Dialog */}
      <Dialog open={kwPreviewOpen} onOpenChange={setKwPreviewOpen}>
        <DialogContent className="max-w-[750px] max-h-[90vh] overflow-y-auto">
          <DialogHeader>
            <DialogTitle className="flex items-center gap-2 text-sm">
              <Receipt size={16} className="text-emerald-600" />
              Preview Kuitansi
            </DialogTitle>
          </DialogHeader>
          {kwPreviewItem && (
            <>
              <div className="border rounded-lg bg-white overflow-auto max-h-[65vh]">
                <DocxPreview url={`/api/invoice/export-kuitansi?no_invoice=${encodeURIComponent(kwPreviewItem.no_invoice)}`} />
              </div>
              <div className="flex justify-end">
                <a href={`/api/invoice/export-kuitansi?no_invoice=${encodeURIComponent(kwPreviewItem.no_invoice)}`} target="_blank">
                  <Button variant="secondary" className="gap-2">
                    <FileDown size={14} /> Download Kuitansi .docx
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
