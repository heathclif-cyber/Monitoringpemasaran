import { useEffect, useMemo, useState } from 'react'
import { Edit, FileDown, Trash2, Receipt, Eye } from 'lucide-react'
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
import { SearchInput } from '@/components/common/SearchInput'
import { FilterBar, FilterSelect } from '@/components/common/FilterBar'
import { DataTable } from '@/components/common/DataTable'
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
  const [invPreviewOpen, setInvPreviewOpen] = useState(false)
  const [invPreviewItem, setInvPreviewItem] = useState<Invoice | null>(null)
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

  return (
    <div className="space-y-4">
      <FilterBar>
        <SearchInput value={search} onChange={setSearch} placeholder="Cari no invoice, kontrak..." />
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
          {store.isLoading ? <TableSkeleton rows={5} cols={5} /> : filtered.length === 0 ? (
            <EmptyState title="Belum ada data invoice" />
          ) : (
            <DataTable
              data={filtered}
              keyExtractor={(item) => item.no_invoice}
              columns={[
                { key: 'no', header: 'No Invoice', render: (item) => <span className="font-medium">{item.no_invoice}</span> },
                { key: 'kontrak', header: 'No Kontrak', render: (item) => <span className="text-slate-600">{item.no_kontrak}</span> },
                { key: 'tgl', header: 'Tgl Transaksi', render: (item) => formatDate(item.tanggal_transaksi) },
                {
                  key: 'tagihan',
                  header: 'Tagihan Total',
                  align: 'right',
                  className: 'font-semibold tabular-nums',
                  render: (item) => formatCurrency(item.jumlah_pembayaran),
                },
                {
                  key: 'aksi',
                  header: 'Aksi',
                  align: 'center',
                  render: (item) => (
                    <div className="flex gap-0.5 justify-center">
                      <Button size="icon" variant="ghost" className="h-8 w-8 text-slate-600 hover:text-primary" onClick={() => navigate(`/invoice?edit=${item.no_invoice}`)}>
                        <Edit size={14} />
                      </Button>
                      <Button size="icon" variant="ghost" className="h-8 w-8 text-slate-600 hover:text-primary" onClick={() => { setInvPreviewItem(item); setInvPreviewOpen(true) }}>
                        <Eye size={14} />
                      </Button>
                      <Button size="icon" variant="ghost" className="h-8 w-8 text-slate-600 hover:text-primary" onClick={() => { setKwPreviewItem(item); setKwPreviewOpen(true) }}>
                        <Receipt size={14} />
                      </Button>
                      <Button size="icon" variant="ghost" className="h-8 w-8 text-slate-400 hover:text-destructive" onClick={() => setDeleteTarget(item.no_invoice)}>
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
        title="Hapus Invoice"
        description="Data DO terkait juga akan terhapus."
        confirmLabel="Hapus"
        isDestructive
        onConfirm={handleDelete}
      />

      <Dialog open={invPreviewOpen} onOpenChange={setInvPreviewOpen}>
        <DialogContent className="max-w-[750px] max-h-[90vh] overflow-y-auto">
          <DialogHeader>
            <DialogTitle className="flex items-center gap-2 text-sm">
              <Eye size={16} className="text-primary" />
              Preview Invoice
            </DialogTitle>
          </DialogHeader>
          {invPreviewItem && (
            <>
              <div className="border rounded-lg bg-white overflow-auto max-h-[65vh]">
                <DocxPreview url={`/api/invoice/export?no_invoice=${encodeURIComponent(invPreviewItem.no_invoice)}`} />
              </div>
              <div className="flex justify-end">
                <a href={`/api/invoice/export?no_invoice=${encodeURIComponent(invPreviewItem.no_invoice)}`} target="_blank" rel="noreferrer">
                  <Button variant="secondary" className="gap-2">
                    <FileDown size={14} /> Download Invoice .docx
                  </Button>
                </a>
              </div>
            </>
          )}
        </DialogContent>
      </Dialog>

      <Dialog open={kwPreviewOpen} onOpenChange={setKwPreviewOpen}>
        <DialogContent className="max-w-[750px] max-h-[90vh] overflow-y-auto">
          <DialogHeader>
            <DialogTitle className="flex items-center gap-2 text-sm">
              <Receipt size={16} className="text-primary" />
              Preview Kuitansi
            </DialogTitle>
          </DialogHeader>
          {kwPreviewItem && (
            <>
              <div className="border rounded-lg bg-white overflow-auto max-h-[65vh]">
                <DocxPreview url={`/api/invoice/export-kuitansi?no_invoice=${encodeURIComponent(kwPreviewItem.no_invoice)}`} />
              </div>
              <div className="flex justify-end">
                <a href={`/api/invoice/export-kuitansi?no_invoice=${encodeURIComponent(kwPreviewItem.no_invoice)}`} target="_blank" rel="noreferrer">
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