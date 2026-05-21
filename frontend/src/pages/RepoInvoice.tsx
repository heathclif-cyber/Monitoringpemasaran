import { useEffect, useMemo, useState } from 'react'
import { Edit, FileDown, Trash2, Search, Receipt, Eye, Loader2 } from 'lucide-react'
import { useNavigate } from 'react-router-dom'
import { useInvoiceStore } from '@/store/invoiceStore'
import { useAppStore } from '@/store/appStore'
import { Card, CardContent } from '@/components/ui/card'
import { Button } from '@/components/ui/button'
import { ConfirmDialog } from '@/components/common/ConfirmDialog'
import { EmptyState } from '@/components/common/EmptyState'
import { TableSkeleton } from '@/components/common/LoadingSkeleton'
import { formatCurrency, formatDate } from '@/lib/utils'
import { terbilangRupiah } from '@/utils/terbilang'
import { calculateKontrakPricing } from '@/utils/kontrakUtils'
import { Dialog, DialogContent, DialogHeader, DialogTitle } from '@/components/ui/dialog'
import { client } from '@/lib/client'
import type { Invoice, Kontrak } from '@/types'

const MONTHS: Record<string, string> = {
  '01': 'Januari', '02': 'Februari', '03': 'Maret', '04': 'April',
  '05': 'Mei', '06': 'Juni', '07': 'Juli', '08': 'Agustus',
  '09': 'September', '10': 'Oktober', '11': 'November', '12': 'Desember',
}

function KuitansiPreview({ invoice, kontrak }: { invoice: Invoice; kontrak: Kontrak | null }) {
  if (!kontrak) {
    return (
      <div className="flex items-center justify-center py-16">
        <Loader2 size={24} className="animate-spin text-slate-300" />
      </div>
    )
  }

  const pokok = (kontrak.volume || 0) * (kontrak.harga_satuan || 0) + (kontrak.premi || 0)
  const isPpn = String(kontrak.is_ppn).toLowerCase() !== 'false'
  const isPph = String(kontrak.is_pph).toLowerCase() === 'true'
  const ppnPct = kontrak.ppn_persen || 11
  const pphPct = kontrak.pph_persen || 0

  const fullPpn = isPpn ? pokok * (ppnPct / 100) : 0
  const fullPph = isPph ? pokok * (pphPct / 100) : 0
  const fullNilaiTransaksi = pokok + fullPpn
  const fullTotalTagihan = pokok + fullPpn - fullPph

  const invAmount = invoice.jumlah_pembayaran || 0
  const ratio = fullTotalTagihan > 0 ? invAmount / fullTotalTagihan : 1
  const nilaiKuitansi = fullNilaiTransaksi * ratio
  const terbilangK = terbilangRupiah(Math.floor(nilaiKuitansi))

  const rp = (v: number) => 'Rp' + (v > 0 ? v.toLocaleString('id-ID', { minimumFractionDigits: 2, maximumFractionDigits: 2 }) : '0,00')
  const lokasi = kontrak.lokasi || 'Makassar'

  const MONTHS = ['', 'Januari', 'Februari', 'Maret', 'April', 'Mei', 'Juni', 'Juli', 'Agustus', 'September', 'Oktober', 'November', 'Desember']
  let tglFormatted = '-'
  if (invoice.tanggal_transaksi) {
    const d = new Date(invoice.tanggal_transaksi)
    if (!isNaN(d.getTime())) {
      tglFormatted = `${d.getDate()} ${MONTHS[d.getMonth() + 1]} ${d.getFullYear()}`
    }
  }

  // Match reference DOCX format: Calibri 11pt, line-height 1.15
  const s = {
    wrapper: { fontFamily: 'Calibri, Arial, sans-serif', fontSize: '11pt', color: '#000', lineHeight: '1.15' } as React.CSSProperties,
    title: { textAlign: 'center', fontWeight: 'bold', textDecoration: 'underline', margin: '0 0 0 0', lineHeight: '1.15' } as React.CSSProperties,
    para: { margin: '0', lineHeight: '1.15' } as React.CSSProperties,
    through: { margin: '0 0 21px 0', lineHeight: '1.15' } as React.CSSProperties,
    justify: { textAlign: 'justify', margin: '0', lineHeight: '1.15' } as React.CSSProperties,
    center: { textAlign: 'center', margin: '0', lineHeight: '1.15' } as React.CSSProperties,
  }

  const tbl = { width: '100%', borderCollapse: 'collapse' as const, lineHeight: '1.15' }
  const tdL = { padding: '1px 4px', verticalAlign: 'top' as const, width: '38%' }
  const tdD = { padding: '1px 4px', verticalAlign: 'top' as const, width: '4%' }
  const tdV = { padding: '1px 4px', verticalAlign: 'top' as const }

  return (
    <div style={s.wrapper}>
      {/* Title: center, bold, underline — exact match */}
      <p style={s.title}>KUITANSI</p>

      {/* No.     [no_invoice] */}
      <p style={s.para}><span> </span>No.&nbsp;&nbsp;&nbsp;&nbsp;&nbsp;{invoice.no_invoice}</p>

      {/* Spacer */}
      <p style={s.center}>&nbsp;</p>
      <p style={s.para}>&nbsp;</p>

      {/* Melalui, — with 21pt space after */}
      <p style={s.through}>Melalui,</p>

      {/* Spacer paragraphs */}
      <p style={s.justify}>&nbsp;</p>
      <p style={s.justify}>&nbsp;</p>
      <p style={s.justify}>&nbsp;</p>
      <p style={s.para}>&nbsp;</p>

      {/* TABLE 1: Data Pembayaran */}
      <table style={tbl}>
        <tbody>
          <tr>
            <td style={tdL}>Telah Diterima Dari</td>
            <td style={tdD}>:</td>
            <td style={tdV}>{(kontrak.pembeli || '-').split('\n')[0]}</td>
          </tr>
          <tr>
            <td style={tdL}>Banyaknya Uang<br />(Termasuk PPN)</td>
            <td style={tdD}>:</td>
            <td style={tdV}>{rp(nilaiKuitansi)}</td>
          </tr>
          <tr>
            <td style={tdL}>Terbilang</td>
            <td style={tdD}>:</td>
            <td style={{ ...tdV, textAlign: 'justify' }}>{terbilangK}</td>
          </tr>
          <tr>
            <td style={tdL}>Untuk Pembayaran</td>
            <td style={tdD}>:</td>
            <td style={{ ...tdV, textAlign: 'justify' }}>Pembelian {kontrak.komoditi || '-'} sesuai Invoice No. {invoice.no_invoice}</td>
          </tr>
        </tbody>
      </table>

      {/* Spacer */}
      <p style={s.justify}>&nbsp;</p>
      <p style={s.justify}>&nbsp;</p>
      <p style={s.justify}>&nbsp;</p>

      {/* TABLE 2: Info Bank */}
      <table style={tbl}>
        <tbody>
          <tr>
            <td style={tdL}>Bank Penerima</td>
            <td style={tdD}>:</td>
            <td style={tdV}>{kontrak.pembayaran_bank || 'Bank Rakyat Indonesia'}</td>
          </tr>
          <tr>
            <td style={tdL}>Nama Pemilik Rekening</td>
            <td style={tdD}>:</td>
            <td style={tdV}>{kontrak.pembayaran_atas_nama || 'PT Perkebunan Nusantara I Regional 8'}</td>
          </tr>
          <tr>
            <td style={tdL}>Nomor Rekening Penerima</td>
            <td style={tdD}>:</td>
            <td style={tdV}>{kontrak.pembayaran_rek_no || '0050-01-005356-30-0'}</td>
          </tr>
        </tbody>
      </table>

      {/* Spacer */}
      <p style={s.justify}>&nbsp;</p>
      <p style={s.justify}>&nbsp;</p>
      <p style={s.justify}>&nbsp;</p>

      {/* Signature */}
      <table style={tbl}>
        <tbody>
          <tr>
            <td style={{ width: '50%', padding: '1px 4px', verticalAlign: 'top' }}></td>
            <td style={{ width: '50%', padding: '1px 4px', verticalAlign: 'top', textAlign: 'center' }}>
              {lokasi}, {tglFormatted}
            </td>
          </tr>
          <tr>
            <td style={{ padding: '1px 4px' }}></td>
            <td style={{ padding: '1px 4px', textAlign: 'center' }}></td>
          </tr>
        </tbody>
      </table>
    </div>
  )
}

export default function RepoInvoice() {
  const navigate = useNavigate()
  const store = useInvoiceStore()
  const { addNotification } = useAppStore()
  const [search, setSearch] = useState('')
  const [bulan, setBulan] = useState('ALL')
  const [sort, setSort] = useState<'DESC' | 'ASC'>('DESC')
  const [deleteTarget, setDeleteTarget] = useState<string | null>(null)

  // Kuitansi preview state
  const [previewOpen, setPreviewOpen] = useState(false)
  const [previewInvoice, setPreviewInvoice] = useState<Invoice | null>(null)
  const [previewKontrak, setPreviewKontrak] = useState<Kontrak | null>(null)
  const [isLoadingPreview, setIsLoadingPreview] = useState(false)

  // Invoice preview state
  const [invPreviewOpen, setInvPreviewOpen] = useState(false)
  const [invPreviewItem, setInvPreviewItem] = useState<Invoice | null>(null)

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

  const handlePreviewInvoice = (invoice: Invoice) => {
    setInvPreviewItem(invoice)
    setInvPreviewOpen(true)
  }

  const handlePreviewKuitansi = async (invoice: Invoice) => {
    setPreviewInvoice(invoice)
    setPreviewKontrak(null)
    setIsLoadingPreview(true)
    setPreviewOpen(true)
    try {
      const kontrak = await client.get<Kontrak>(`/api/kontrak/${encodeURIComponent(invoice.no_kontrak)}`)
      setPreviewKontrak(kontrak)
    } catch {
      setPreviewKontrak(null)
    } finally {
      setIsLoadingPreview(false)
    }
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
                          <Button size="icon" variant="ghost" className="h-8 w-8 text-blue-600" onClick={() => handlePreviewInvoice(item)}>
                            <Eye size={14} />
                          </Button>
                          <Button size="icon" variant="ghost" className="h-8 w-8 text-emerald-600" onClick={() => handlePreviewKuitansi(item)}>
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
        <DialogContent className="max-w-[480px] max-h-[90vh] overflow-y-auto">
          <DialogHeader>
            <DialogTitle className="flex items-center gap-2 text-sm">
              <Eye size={16} className="text-blue-600" />
              Preview Invoice
            </DialogTitle>
          </DialogHeader>

          {invPreviewItem && (
            <>
              <div className="border rounded-lg p-5 bg-white">
                <div className="text-sm space-y-2 font-sans">
                  <div className="grid grid-cols-2 gap-x-4 gap-y-1">
                    <span className="text-slate-500">No Invoice</span><span className="font-medium">{invPreviewItem.no_invoice}</span>
                    <span className="text-slate-500">No Kontrak</span><span>{invPreviewItem.no_kontrak}</span>
                    <span className="text-slate-500">Tgl Transaksi</span><span>{formatDate(invPreviewItem.tanggal_transaksi)}</span>
                    <span className="text-slate-500">Status</span><span>{invPreviewItem.status_invoice || 'Unpaid'}</span>
                    <span className="text-slate-500">Jumlah Pembayaran</span><span className="font-bold text-brand-600">{formatCurrency(invPreviewItem.jumlah_pembayaran)}</span>
                  </div>
                  {invPreviewItem.terbilang_invoice && (
                    <div className="border-t pt-2 mt-2">
                      <p className="text-xs text-slate-500">Terbilang:</p>
                      <p className="text-sm italic">{invPreviewItem.terbilang_invoice} Rupiah</p>
                    </div>
                  )}
                </div>
              </div>

              <div className="flex justify-end">
                <a href={`/api/invoice/export?no_invoice=${encodeURIComponent(invPreviewItem.no_invoice)}`} target="_blank">
                  <Button variant="secondary" className="gap-2">
                    <FileDown size={14} />
                    Download Invoice .docx
                  </Button>
                </a>
              </div>
            </>
          )}
        </DialogContent>
      </Dialog>

      {/* Kuitansi Preview Dialog */}
      <Dialog open={previewOpen} onOpenChange={setPreviewOpen}>
        <DialogContent className="max-w-[660px] max-h-[90vh] overflow-y-auto">
          <DialogHeader>
            <DialogTitle className="flex items-center gap-2 text-sm">
              <Receipt size={16} className="text-emerald-600" />
              Preview Kuitansi
            </DialogTitle>
          </DialogHeader>

          {previewInvoice && (
            <>
              <div className="border rounded-lg p-5 bg-white">
                <KuitansiPreview invoice={previewInvoice} kontrak={previewKontrak} />
              </div>

              <div className="flex justify-end">
                <a
                  href={`/api/invoice/export-kuitansi?no_invoice=${encodeURIComponent(previewInvoice.no_invoice)}`}
                  target="_blank"
                >
                  <Button variant="secondary" className="gap-2">
                    <FileDown size={14} />
                    Download Kuitansi .docx
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
