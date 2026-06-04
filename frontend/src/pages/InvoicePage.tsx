import { useEffect, useState, useMemo } from 'react'
import { useSearchParams } from 'react-router-dom'
import { useForm } from 'react-hook-form'
import { zodResolver } from '@hookform/resolvers/zod'
import { z } from 'zod'
import { Save, FileDown, RotateCcw, Eye } from 'lucide-react'
import { useInvoiceStore } from '@/store/invoiceStore'
import { useKontrakStore } from '@/store/kontrakStore'
import { useAppStore } from '@/store/appStore'
import { Button } from '@/components/ui/button'
import { Input } from '@/components/ui/input'
import { Label } from '@/components/ui/label'
import { Card, CardContent, CardHeader, CardTitle } from '@/components/ui/card'
import { Textarea } from '@/components/ui/textarea'
import { formatCurrency, formatDate } from '@/lib/utils'
import { terbilangRupiah } from '@/utils/terbilang'
import { calculateKontrakPricing, calculateJatuhTempo } from '@/utils/kontrakUtils'
import type { Kontrak } from '@/types'

// Exact replica of forms.js buildInvoicePreview() format
function InvoicePreviewContent({ noInv, noK, tgl, k, pricing: _p, jumlahPembayaran }: {
  noInv: string; noK: string; tgl: string; k: Kontrak;
  pricing: ReturnType<typeof calculateKontrakPricing> | null;
  jumlahPembayaran: number;
}) {
  const vol = k.volume || 0
  const hrg = k.harga_satuan || 0
  const premi = k.premi || 0
  const nilaiPokok = (vol * hrg) + premi
  const ppnPct = k.ppn_persen || 11
  const isPpn = String(k.is_ppn).toLowerCase() !== 'false'

  // Invoice = pokok + PPN, tanpa PPh
  const fullPpn = isPpn ? nilaiPokok * (ppnPct / 100) : 0
  const fullTotal = nilaiPokok + fullPpn

  // jumlah_pembayaran adalah final amount (pokok + PPN).
  // Kosongkan/0 = auto full kontrak.
  const actualPayment = jumlahPembayaran > 0 ? jumlahPembayaran : fullTotal
  const ratio = fullTotal > 0 ? actualPayment / fullTotal : 1

  const displayVol = vol * ratio
  const displayHrg = hrg
  const displayPokok = nilaiPokok * ratio

  // PPN di-breakdown proporsional dari actual payment
  const nomPpn = fullPpn * ratio
  const estTotal = actualPayment
  const lamaStr = k.lama_pembayaran_hari ? `${k.lama_pembayaran_hari} hari` : '-'
  const fmtNum = (v: number) => v > 0 ? Math.round(v).toLocaleString('id-ID') : '-'

  const tableStyle: React.CSSProperties = { width: '100%', borderCollapse: 'collapse', fontSize: '9pt', fontFamily: '"Calibri", Arial, sans-serif', color: '#000', border: '1px solid #000', backgroundColor: '#fff' }
  const tdStyle: React.CSSProperties = { border: '1px solid #000', padding: '4px 6px', verticalAlign: 'top' }
  const thStyle: React.CSSProperties = { border: '1px solid #000', padding: '4px 6px', verticalAlign: 'top', textAlign: 'center', fontWeight: 'bold' }

  const pbl = k.pembeli ? k.pembeli.replace(/\n/g, '<br/>') : '[Nama Pembeli]'

  return (
    <div style={{ padding: '10px', maxWidth: '800px', overflowX: 'auto', fontFamily: '"Calibri", Arial, sans-serif', fontSize: '9pt', color: '#000' }}>
      <table style={tableStyle}>
        <tbody>
          <tr>
            <td style={tdStyle} colSpan={5} rowSpan={4}>
              <strong>Kepada Yth:</strong><br />
              <strong dangerouslySetInnerHTML={{ __html: pbl }} /><br />
              Di –<br />
              &nbsp;&nbsp;&nbsp;&nbsp;Tempat
            </td>
            <td style={{ ...tdStyle, textAlign: 'center', verticalAlign: 'middle', fontSize: '16pt' }} colSpan={5}>
              <strong>Proforma Invoice</strong>
            </td>
          </tr>
          <tr><td style={tdStyle} colSpan={5}><strong>Proforma Invoice No:</strong><br />{noInv}</td></tr>
          <tr><td style={tdStyle} colSpan={5}><strong>Kontrak No:</strong><br />{noK}</td></tr>
          <tr><td style={tdStyle} colSpan={5}><strong>No. Ref Pembeli:</strong><br />{k.no_reff || '-'}</td></tr>
          <tr>
            <td style={tdStyle} colSpan={5}><strong>Produsen:</strong><br />{k.kebun_produsen || '-'}</td>
            <td style={tdStyle} colSpan={5}><strong>Tanggal:</strong><br />{tgl || '-'}</td>
          </tr>
          <tr>
            <td style={tdStyle} colSpan={5} rowSpan={3}>
              <strong>Deskripsi Produk:</strong><br />
              <strong>{k.komoditi || '-'}</strong>
            </td>
            <td style={tdStyle} colSpan={5}><strong>Tanggal Jatuh Tempo:</strong><br />{lamaStr}</td>
          </tr>
          <tr><td style={tdStyle} colSpan={5}><strong>Mutu:</strong><br />{k.mutu || '-'}</td></tr>
          <tr><td style={tdStyle} colSpan={5}><strong>PPN:</strong><br />Tarif Efektif {ppnPct}%</td></tr>
          <tr>
            <td style={tdStyle} colSpan={5}><strong>Kondisi Penyerahan:</strong><br />{k.kondisi_penyerahan || '-'}</td>
            <td style={tdStyle} colSpan={5}><strong>Pelabuhan Muat:</strong><br />{k.pelabuhan_muat || '-'}</td>
          </tr>
          <tr>
            <td style={{ ...tdStyle, textAlign: 'center' }} colSpan={10}>Untuk dan atas nama PT Perkebunan Nusantara I, harap dilakukan pembayaran atas penyerahan:</td>
          </tr>
          <tr>
            <td style={thStyle}>No.<br />Reff</td>
            <td style={thStyle}>Jenis<br />Komoditi</td>
            <td style={thStyle}>Packaging</td>
            <td style={thStyle}>Chop</td>
            <td style={thStyle}>Symbol/<br />Kebun</td>
            <td style={thStyle}>Pack<br />Qty</td>
            <td style={thStyle}>Volume<br />(Kg)</td>
            <td style={thStyle}>Harga<br />(IDR)</td>
            <td style={thStyle} colSpan={2}>Nilai Rupiah</td>
          </tr>
          <tr>
            <td style={tdStyle}>-</td>
            <td style={tdStyle}>{k.komoditi || '-'}</td>
            <td style={tdStyle}>{k.packaging || '-'}</td>
            <td style={tdStyle}>-</td>
            <td style={tdStyle}>{k.simbol || '-'}</td>
            <td style={tdStyle}>-</td>
            <td style={{ ...tdStyle, textAlign: 'right' }}>{fmtNum(displayVol)}</td>
            <td style={{ ...tdStyle, textAlign: 'right' }}>{fmtNum(displayHrg)}</td>
            <td style={{ ...tdStyle, borderRight: 'none' }}>Rp</td>
            <td style={{ ...tdStyle, textAlign: 'right', borderLeft: 'none' }}>{fmtNum(displayPokok)}</td>
          </tr>
          <tr>
            <td style={{ ...tdStyle, textAlign: 'right' }} colSpan={8}><strong>PPN</strong></td>
            <td style={{ ...tdStyle, borderRight: 'none' }}>Rp</td>
            <td style={{ ...tdStyle, textAlign: 'right', borderLeft: 'none' }}><strong>{fmtNum(nomPpn)}</strong></td>
          </tr>
          <tr>
            <td style={{ ...tdStyle, textAlign: 'right' }} colSpan={8}><strong>Jumlah Pembayaran</strong></td>
            <td style={{ ...tdStyle, borderRight: 'none' }}>Rp</td>
            <td style={{ ...tdStyle, textAlign: 'right', borderLeft: 'none' }}>{fmtNum(estTotal)}</td>
          </tr>
          <tr>
            <td style={tdStyle} colSpan={10}>
              <strong>Terbilang:</strong><br />
              <i>{k.terbilang || '-'} Rupiah</i>
            </td>
          </tr>
          <tr>
            <td style={tdStyle} colSpan={10}>
              <strong>Transfer Ke:</strong><br />
              {k.pembayaran_atas_nama || 'PT Perkebunan Nusantara I Regional 8'} {k.pembayaran_bank || 'Bank Rakyat Indonesia'}<br />
              No. Rekening: {k.pembayaran_rek_no || '0050-01-005356-30-0'}
            </td>
          </tr>
        </tbody>
      </table>
    </div>
  )
}

const invoiceSchema = z.object({
  no_invoice: z.string().min(1, 'No Invoice wajib diisi'),
  no_kontrak: z.string().min(1, 'Kontrak wajib dipilih'),
  nama_unit: z.string().optional(),
  tanggal_transaksi: z.string().min(1, 'Tanggal wajib diisi'),
  status_invoice: z.string().optional(),
  pph_22_persen: z.coerce.number().min(0),
  jumlah_pembayaran: z.coerce.number().min(0).optional(),
})

type InvoiceFormData = z.infer<typeof invoiceSchema>

export default function InvoicePage() {
  const invoiceStore = useInvoiceStore()
  const kontrakStore = useKontrakStore()
  const { currentKontrak, fetchKontrakForInvoice } = invoiceStore
  const { addNotification } = useAppStore()
  const [exportNo, setExportNo] = useState<string | null>(null)
  const [isExisting, setIsExisting] = useState(false)

  const form = useForm<InvoiceFormData>({
    resolver: zodResolver(invoiceSchema),
    defaultValues: {
      no_invoice: '',
      no_kontrak: '',
      nama_unit: '',
      tanggal_transaksi: new Date().toISOString().split('T')[0],
      status_invoice: 'Unpaid',
      pph_22_persen: 0,
      jumlah_pembayaran: 0,
    },
  })

  const { register, handleSubmit, reset, setValue, getValues, watch, formState: { errors, isSubmitting } } = form
  const selectedKontrak = watch('no_kontrak')
  const selectedUnit = watch('nama_unit')

  // Fetch kontrak list on mount
  useEffect(() => {
    kontrakStore.fetch()
    invoiceStore.fetch()
  }, [])

  // Auto-populate when kontrak selected
  useEffect(() => {
    if (selectedKontrak) {
      fetchKontrakForInvoice(selectedKontrak)
    }
  }, [selectedKontrak])

  // Auto-load invoice for edit
  const autoLoadInvoice = async () => {
    const no = form.getValues('no_invoice')
    if (!no) return
    const data = await invoiceStore.fetchOne(no)
    if (data) {
      setIsExisting(true)
      setExportNo(no)
      setValue('no_kontrak', data.no_kontrak)
      setValue('nama_unit', data.nama_unit || '')
      setValue('tanggal_transaksi', data.tanggal_transaksi)
    } else {
      setIsExisting(false)
      setExportNo(null)
    }
  }


  // Pricing
  const k = currentKontrak
  const pricing = k
    ? calculateKontrakPricing(
        k.volume || 0, k.harga_satuan || 0, k.premi || 0,
        k.is_ppn || 'true', k.ppn_persen || 11,
        k.is_pph || 'false', k.pph_persen || 0,
      )
    : null

  // Units dari kontrak yang dipilih; jika tidak ada, pakai fixed list
  const FIXED_UNITS = ['Minahasa-Halmahera','Beteleme','Awaya-Telpaputih','Takalar','Camming','Kabaru']
  const kontrakUnits = useMemo(() => k?.units && k.units.length > 0 ? k.units : [], [k])
  const unitOptions = useMemo(() =>
    kontrakUnits.length > 0
      ? kontrakUnits.map(u => ({ nama_unit: u.nama_unit, volume: u.volume || 0 }))
      : FIXED_UNITS.map(u => ({ nama_unit: u, volume: 0 })),
  [kontrakUnits])

  // Unit yang sedang dipilih di form
  const selectedUnitObj = useMemo(() =>
    kontrakUnits.find(u => u.nama_unit === selectedUnit) || null,
  [kontrakUnits, selectedUnit])

  const showUnitSelector = !!selectedKontrak && !!k

  // Kalkulasi multi-invoice: existing invoices, remaining, progress
  const existingInvoices = useMemo(() => {
    if (!selectedKontrak) return []
    return invoiceStore.data.filter((inv) => inv.no_kontrak === selectedKontrak && inv.no_invoice !== watch('no_invoice'))
  }, [selectedKontrak, invoiceStore.data, watch('no_invoice')])

  const kontrakMax = pricing?.nilaiTransaksi || 0

  // Batas per-unit jika ada unit dipilih (hanya berlaku jika unit punya volume)
  const unitMax = useMemo(() => {
    if (!selectedUnit || !k || !kontrakMax) return kontrakMax
    if (selectedUnitObj && selectedUnitObj.volume > 0 && (k.volume || 0) > 0) {
      return kontrakMax * (selectedUnitObj.volume / k.volume)
    }
    return kontrakMax // tidak ada volume unit → gunakan max kontrak
  }, [selectedUnit, selectedUnitObj, k, kontrakMax])

  // Filter invoice untuk progress bar: per-unit jika unit dipilih, semua jika tidak
  const invoicesForProgress = useMemo(() => {
    if (selectedUnit) {
      return existingInvoices.filter(inv => inv.nama_unit === selectedUnit)
    }
    return existingInvoices
  }, [existingInvoices, selectedUnit])

  // currentJumlah pakai watch() seperti terbilang — sudah terbukti reactive
  const currentJumlah = Number(watch('jumlah_pembayaran')) || 0

  const totalInvoicedExisting = useMemo(() =>
    invoicesForProgress.reduce((sum: number, inv) => sum + (inv.jumlah_pembayaran || 0), 0),
  [invoicesForProgress])

  const totalInvoiced = totalInvoicedExisting + currentJumlah

  const maxForProgress = selectedUnit ? unitMax : kontrakMax
  const sisaKontrak = Math.max(0, maxForProgress - totalInvoiced)
  const progressPct = maxForProgress > 0 ? Math.round((totalInvoiced / maxForProgress) * 100) : 0

  const onSubmit = async (data: InvoiceFormData) => {
    try {
      const payload: any = { ...data }
      // Kirim nama_unit hanya jika dipilih
      if (!data.nama_unit) delete payload.nama_unit
      // Kirim jumlah_pembayaran hanya jika user mengisinya (partial)
      if (data.jumlah_pembayaran && data.jumlah_pembayaran > 0) {
        payload.jumlah_pembayaran = data.jumlah_pembayaran
      } else {
        delete payload.jumlah_pembayaran // backend will use full/unit value
      }
      await invoiceStore.save(payload)
      setExportNo(data.no_invoice)
      setIsExisting(true)
      addNotification('Invoice berhasil disimpan', 'success')
      invoiceStore.fetch() // refresh untuk update existing invoices list
    } catch (err: any) {
      addNotification(err.message || 'Gagal menyimpan invoice', 'error')
    }
  }

  const handleReset = () => {
    reset()
    setIsExisting(false)
    setExportNo(null)
  }

  const handleExport = () => {
    if (exportNo) window.open(`/api/invoice/export?no_invoice=${encodeURIComponent(exportNo)}`, '_blank')
  }

  const handleExportKuitansi = () => {
    if (exportNo) window.open(`/api/invoice/export-kuitansi?no_invoice=${encodeURIComponent(exportNo)}`, '_blank')
  }

  // Read ?edit= param to auto-load invoice for editing
  const [searchParams] = useSearchParams()
  const editNo = searchParams.get('edit')
  useEffect(() => {
    if (editNo) {
      setValue('no_invoice', editNo)
      const t = setTimeout(() => autoLoadInvoice(), 100)
      return () => clearTimeout(t)
    }
  }, [editNo])

  const ic = 'h-9 rounded-md border border-input bg-white px-3 py-1 text-sm shadow-sm w-full focus:outline-none focus:ring-1 focus:ring-ring'

  return (
    <div className="flex gap-6">
      <div className="flex-1 min-w-0">
        <form onSubmit={handleSubmit(onSubmit)} className="space-y-6">
          <Card>
            <CardHeader className="pb-3">
              <CardTitle className="text-sm font-semibold">Data Dokumen</CardTitle>
            </CardHeader>
            <CardContent className="grid grid-cols-2 gap-4">
              <div>
                <Label className="text-xs">No Kontrak *</Label>
                <select {...register('no_kontrak')} className={ic}>
                  <option value="">-- Pilih Kontrak --</option>
                  {kontrakStore.data.map((k) => (
                    <option key={k.no_kontrak} value={k.no_kontrak}>
                      {k.no_kontrak} - {k.pembeli?.split('\n')[0] || ''}
                    </option>
                  ))}
                </select>
              </div>
              <div>
                <Label className="text-xs">No Invoice *</Label>
                <input {...register('no_invoice')} className={ic} list="invoice-datalist" />
                <datalist id="invoice-datalist">
                  {invoiceStore.data.map((i) => <option key={i.no_invoice} value={i.no_invoice} />)}
                </datalist>
                <button type="button" onClick={(e) => { e.preventDefault(); autoLoadInvoice(); }} className="text-xs text-brand-600 mt-1 hover:underline">
                  Cari / Load Invoice
                </button>
                {errors.no_invoice && <p className="text-xs text-red-500 mt-1">{errors.no_invoice.message}</p>}
              </div>
              <div>
                <Label className="text-xs">Tanggal Transaksi *</Label>
                <input type="date" {...register('tanggal_transaksi')} className={ic} />
              </div>
              {showUnitSelector && (
                <div className="col-span-2">
                  <Label className="text-xs">Unit yang Diinvoice</Label>
                  <select {...register('nama_unit')} className={ic}>
                    <option value="">-- Pilih Unit (opsional) --</option>
                    {unitOptions.map(u => (
                      <option key={u.nama_unit} value={u.nama_unit}>
                        {u.nama_unit}{u.volume > 0 ? ` — ${u.volume.toLocaleString('id-ID')} ${k?.satuan || 'Kg'}` : ''}
                      </option>
                    ))}
                  </select>
                  {!selectedUnit && <p className="text-xs text-slate-400 mt-1">Kosongkan jika invoice untuk keseluruhan kontrak</p>}
                </div>
              )}
            </CardContent>
          </Card>

          {/* Kontrak Summary + Multi-Invoice */}
          {k && pricing && (
            <Card>
              <CardHeader className="pb-3">
                <CardTitle className="text-sm font-semibold">Data Kontrak & Pembayaran Bertahap</CardTitle>
              </CardHeader>
              <CardContent className="text-sm space-y-3">
                <div className="grid grid-cols-2 gap-2">
                  <span className="text-slate-500">Pembeli:</span>
                  <span className="font-medium">{(k.pembeli || '-').split('\n')[0]}</span>
                  <span className="text-slate-500">Komoditi:</span>
                  <span>{k.komoditi || '-'}</span>
                  <span className="text-slate-500">Volume:</span>
                  <span>{formatCurrency(k.volume)} {k.satuan}</span>
                  <span className="text-slate-500">Nilai Kontrak:</span>
                  <span className="font-bold text-brand-600">{formatCurrency(kontrakMax)}</span>
                </div>

                {/* Progress bar */}
                <div className="border-t pt-3">
                  {selectedUnit && (
                    <p className="text-xs font-semibold text-brand-600 mb-1">
                      Unit: {selectedUnit} — Volume: {selectedUnitObj?.volume.toLocaleString('id-ID')} {k?.satuan}
                    </p>
                  )}
                  <div className="flex justify-between text-xs mb-1">
                    <span className="text-slate-500">
                      Total Ter-invoice{selectedUnit ? ` (${selectedUnit})` : ''}: <strong>{formatCurrency(totalInvoiced)}</strong>
                      {currentJumlah > 0 && <span className="text-slate-400"> (sebelumnya: {formatCurrency(totalInvoicedExisting)})</span>}
                    </span>
                    <span className="text-slate-500">Sisa: <strong className={sisaKontrak < maxForProgress ? 'text-brand-600' : 'text-slate-700'}>{formatCurrency(sisaKontrak)}</strong></span>
                  </div>
                  <div className="w-full h-3 bg-gray-200 rounded-full overflow-hidden">
                    <div
                      className="h-full bg-brand-500 rounded-full transition-all duration-300"
                      style={{ width: `${Math.min(progressPct, 100)}%` }}
                    />
                  </div>
                  <p className="text-xs text-slate-400 mt-1 text-right">{progressPct}% ter-invoice{selectedUnit ? ` (unit ${selectedUnit})` : ''}</p>
                </div>

                {/* Existing invoices list */}
                {invoicesForProgress.length > 0 && (
                  <div className="border-t pt-2">
                    <p className="text-xs font-semibold text-slate-600 mb-1">
                      Invoice Sebelumnya{selectedUnit ? ` — ${selectedUnit}` : ''}:
                    </p>
                    <div className="max-h-28 overflow-y-auto space-y-1">
                      {invoicesForProgress.map((inv) => (
                        <div key={inv.no_invoice} className="flex justify-between text-xs text-slate-600 bg-gray-50 rounded px-2 py-1">
                          <span>{inv.no_invoice}{inv.nama_unit ? ` (${inv.nama_unit})` : ''}</span>
                          <span className="font-medium">{formatCurrency(inv.jumlah_pembayaran)}</span>
                        </div>
                      ))}
                    </div>
                  </div>
                )}

                {/* Jumlah Pembayaran input */}
                <div className="border-t pt-3">
                  <Label className="text-xs">Jumlah Pembayaran Invoice Ini *</Label>
                  <div className="flex items-center gap-2 mt-1">
                    <input
                      type="number"
                      step="1"
                      {...register('jumlah_pembayaran')}
                      className={ic}
                      placeholder={formatCurrency(sisaKontrak)}
                    />
                  </div>
                  <p className="text-xs text-slate-400 mt-1">
                    Kosongkan untuk auto (nilai penuh{selectedUnit ? ` unit ${selectedUnit}` : ' kontrak'}). Maks: {formatCurrency(sisaKontrak)}
                  </p>
                  {Number(watch('jumlah_pembayaran')) > 0 && kontrakMax > 0 && (
                    <p className="text-xs text-slate-500 mt-1">
                      Terbilang: {terbilangRupiah(Number(watch('jumlah_pembayaran')))}
                    </p>
                  )}
                </div>
              </CardContent>
            </Card>
          )}

          <div className="flex gap-3">
            <Button type="submit" disabled={isSubmitting} className="gap-2">
              <Save size={14} />
              {isSubmitting ? 'Menyimpan...' : isExisting ? 'Simpan Perubahan' : 'Buat Invoice'}
            </Button>
            {exportNo && (
              <>
                <Button type="button" variant="secondary" onClick={handleExport} className="gap-2">
                  <FileDown size={14} /> Export .docx
                </Button>
                <Button type="button" variant="secondary" onClick={handleExportKuitansi} className="gap-2">
                  <FileDown size={14} /> Export Kuitansi
                </Button>
              </>
            )}
            <Button type="button" variant="outline" onClick={handleReset} className="gap-2">
              <RotateCcw size={14} /> Reset
            </Button>
          </div>
        </form>
      </div>

      {/* Preview Panel — exact format from forms.js buildInvoicePreview() */}
      <div className="w-[600px] shrink-0">
        <div className="sticky top-[76px] max-h-[calc(100vh-100px)] overflow-y-auto border border-slate-200 rounded-xl bg-white shadow-sm">
          <div className="px-5 py-3 border-b border-slate-100 flex items-center justify-between">
            <span className="text-sm font-semibold text-slate-800">Preview Proforma Invoice</span>
            <Eye size={14} className="text-slate-400" />
          </div>
          <div className="p-2.5">
            {!k ? (
              <div className="flex flex-col items-center justify-center py-16 text-center">
                <Eye size={32} className="text-slate-300 mb-3" />
                <p className="text-sm text-slate-500 font-medium">Belum ada data</p>
                <p className="text-xs text-slate-400 mt-1">Pilih No Kontrak untuk melihat preview</p>
              </div>
            ) : (
              <InvoicePreviewContent
                noInv={watch('no_invoice') || '[No Invoice]'}
                noK={selectedKontrak || '[No Kontrak]'}
                tgl={watch('tanggal_transaksi') || ''}
                k={k}
                pricing={pricing}
                jumlahPembayaran={Number(watch('jumlah_pembayaran')) || 0}
              />
            )}
          </div>
        </div>
      </div>
    </div>
  )
}
