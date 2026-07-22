import { useEffect, useState, useMemo } from 'react'
import { useSearchParams } from 'react-router-dom'
import { useForm } from 'react-hook-form'
import { zodResolver } from '@hookform/resolvers/zod'
import { z } from 'zod'
import { FileDown, RotateCcw, Save } from 'lucide-react'
import { useInvoiceStore } from '@/store/invoiceStore'
import { useKontrakStore } from '@/store/kontrakStore'
import { useBAStore } from '@/store/baStore'
import { useAppStore } from '@/store/appStore'
import { useAuthStore } from '@/store/authStore'
import { Button } from '@/components/ui/button'
import { Input } from '@/components/ui/input'
import { NativeSelect } from '@/components/ui/native-select'
import { Label } from '@/components/ui/label'
import { PreviewPanel } from '@/components/common/PreviewPanel'
import { Card, CardContent, CardHeader, CardTitle } from '@/components/ui/card'
import { DocumentUpload } from '@/components/common/DocumentUpload'
import { ReadOnlyFieldset } from '@/components/common/ReadOnlyFieldset'
import { SearchableSelect } from '@/components/ui/searchable-select'
import { formatCurrency, formatDate } from '@/lib/utils'
import { terbilangRupiah } from '@/utils/terbilang'
import { calculateKontrakPricing, calculateJatuhTempo, isPayungBA as isPayungBAKontrak } from '@/utils/kontrakUtils'
import { calculateBAInvoiceAmount } from '@/utils/baUtils'
import type { Kontrak } from '@/types'

// Exact replica of forms.js buildInvoicePreview() format
function InvoicePreviewContent({ noInv, noK, tgl, k, pricing: _p, jumlahPembayaran, baVolume, baHarga }: {
  noInv: string; noK: string; tgl: string; k: Kontrak;
  pricing: ReturnType<typeof calculateKontrakPricing> | null;
  jumlahPembayaran: number;
  baVolume?: number;
  baHarga?: number;
}) {
  const useBaPricing = (baVolume || 0) > 0 && (baHarga || 0) > 0
  const vol = useBaPricing ? (baVolume || 0) : (k.volume || 0)
  const hrg = useBaPricing ? (baHarga || 0) : (k.harga_satuan || 0)
  const premi = useBaPricing ? 0 : (k.premi || 0)
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
  // Tampilan dibulatkan; nilai hitung di atas tetap desimal (ratio/pokok/ppn).
  const fmtNum = (v: number) =>
    v > 0
      ? Math.round(v).toLocaleString('id-ID')
      : '-'

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
              <strong>{k.jenis_komoditi || k.komoditi || '-'}</strong>
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
            <td style={tdStyle}>{k.jenis_komoditi || k.komoditi || '-'}</td>
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
              {/* Match export: terbilang of actual payment amount; already includes "Rupiah" */}
              <i>{estTotal > 0 ? terbilangRupiah(Math.floor(estTotal)) : '-'}</i>
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
  volume: z.coerce.number().min(0).optional(),
  no_ba: z.string().optional(),
})

type InvoiceFormData = z.infer<typeof invoiceSchema>

export default function InvoicePage() {
  const invoiceStore = useInvoiceStore()
  const kontrakStore = useKontrakStore()
  const currentKontrak = useInvoiceStore((s) => s.currentKontrak)
  const fetchKontrakForInvoice = useInvoiceStore((s) => s.fetchKontrakForInvoice)
  const { addNotification } = useAppStore()
  const canEdit = useAuthStore((s) => s.canEdit)
  const [exportNo, setExportNo] = useState<string | null>(null)
  const [isExisting, setIsExisting] = useState(false)
  const [liveJumlah, setLiveJumlah] = useState(0)

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
      volume: 0,
      no_ba: '',
    },
  })

  const { register, handleSubmit, reset, setValue, getValues, watch, formState: { errors, isSubmitting } } = form
  const selectedKontrak = watch('no_kontrak')
  const selectedUnit = watch('nama_unit')
  const selectedBA = watch('no_ba')
  const baStore = useBAStore()

  // Fetch kontrak list on mount
  useEffect(() => {
    kontrakStore.fetch()
    invoiceStore.fetch()
  }, [])

  const kontrakFromList = useMemo(
    () => kontrakStore.data.find((row) => row.no_kontrak === selectedKontrak),
    [kontrakStore.data, selectedKontrak],
  )

  // Auto-populate when kontrak selected
  useEffect(() => {
    if (!selectedKontrak) return
    setValue('no_ba', '')
    fetchKontrakForInvoice(selectedKontrak)
    baStore.fetchAvailable(selectedKontrak)
    baStore.fetch(selectedKontrak)
  }, [selectedKontrak, fetchKontrakForInvoice, setValue])

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
      setValue('no_ba', data.no_ba || '')
      setValue('tanggal_transaksi', data.tanggal_transaksi)
      setValue('volume', data.volume || 0)
      setValue('jumlah_pembayaran', data.jumlah_pembayaran || 0)
      setLiveJumlah(data.jumlah_pembayaran || 0)
    } else {
      setIsExisting(false)
      setExportNo(null)
    }
  }


  // Kontrak aktif harus match no_kontrak yang dipilih — hindari stale currentKontrak dari pilihan sebelumnya
  const k = useMemo(() => {
    if (kontrakFromList?.no_kontrak === selectedKontrak) return kontrakFromList
    if (currentKontrak?.no_kontrak === selectedKontrak) return currentKontrak
    return kontrakFromList ?? null
  }, [kontrakFromList, currentKontrak, selectedKontrak])

  const isPayungBA = isPayungBAKontrak(k?.tipe_alur)

  const baOptions = useMemo(() => {
    if (!isPayungBA || !selectedKontrak) return []
    if (baStore.available.length > 0) return baStore.available
    const invoicedBa = new Set(
      invoiceStore.data
        .filter((inv) => inv.no_kontrak === selectedKontrak && inv.no_ba && inv.no_invoice !== watch('no_invoice'))
        .map((inv) => inv.no_ba as string),
    )
    return baStore.data
      .filter((b) => b.no_kontrak === selectedKontrak && !invoicedBa.has(b.no_ba))
      .map((b) => ({
        no_ba: b.no_ba,
        tanggal_ba: b.tanggal_ba,
        bulan_buku: b.bulan_buku,
        volume_ba: b.volume_ba,
        harga_satuan: b.harga_satuan,
        nama_unit: b.nama_unit,
        komoditi: b.komoditi,
        status: b.status,
        siap_invoice: (b.harga_satuan || 0) > 0 && (b.volume_ba || 0) > 0,
      }))
  }, [isPayungBA, selectedKontrak, baStore.available, baStore.data, invoiceStore.data, watch('no_invoice')])
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

  const selectedBAObj = useMemo(() => {
    if (!selectedBA) return null
    const fromAvailable = baOptions.find((b) => b.no_ba === selectedBA)
    if (fromAvailable) return fromAvailable
    const fromData = baStore.data.find((b) => b.no_ba === selectedBA)
    if (!fromData) return null
    return {
      no_ba: fromData.no_ba,
      tanggal_ba: fromData.tanggal_ba,
      bulan_buku: fromData.bulan_buku,
      volume_ba: fromData.volume_ba,
      harga_satuan: fromData.harga_satuan,
      nama_unit: fromData.nama_unit,
      komoditi: fromData.komoditi,
      status: fromData.status,
    }
  }, [baOptions, baStore.data, selectedBA])

  const payungInvoiceMax = useMemo(() => {
    if (!isPayungBA || !selectedBAObj || !k) return 0
    return calculateBAInvoiceAmount(
      selectedBAObj.volume_ba,
      selectedBAObj.harga_satuan,
      k.is_ppn || 'true',
      k.ppn_persen || 11,
    )
  }, [isPayungBA, selectedBAObj, k])

  const kontrakMax = isPayungBA ? payungInvoiceMax : (pricing?.nilaiTransaksi || 0)

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
    if (isPayungBA && selectedBA) {
      return existingInvoices.filter((inv) => inv.no_ba === selectedBA)
    }
    if (selectedUnit) {
      return existingInvoices.filter(inv => inv.nama_unit === selectedUnit)
    }
    return existingInvoices
  }, [existingInvoices, selectedUnit, isPayungBA, selectedBA])

  // Live-tracking jumlah_pembayaran via onInput DOM event — bypass RHF watch
  const currentJumlah = liveJumlah

  const totalInvoicedExisting = useMemo(() =>
    invoicesForProgress.reduce((sum: number, inv) => sum + (inv.jumlah_pembayaran || 0), 0),
  [invoicesForProgress])

  const totalInvoiced = totalInvoicedExisting + currentJumlah

  const maxForProgress = selectedUnit ? unitMax : kontrakMax
  const sisaKontrak = Math.max(0, maxForProgress - totalInvoiced)
  const progressPct = maxForProgress > 0 ? Math.round((totalInvoiced / maxForProgress) * 100) : 0

  /** Volume scope dari kontrak / unit / BA — acuan utama volume invoice. */
  const scopeVolume = useMemo(() => {
    if (isPayungBA && selectedBAObj?.volume_ba) return Number(selectedBAObj.volume_ba) || 0
    if (selectedUnitObj && (selectedUnitObj.volume || 0) > 0) return Number(selectedUnitObj.volume) || 0
    return Number(k?.volume) || 0
  }, [isPayungBA, selectedBAObj, selectedUnitObj, k])

  /** Volume yang sudah dipakai invoice lain di scope yang sama (unit/BA/kontrak). */
  const usedVolumeOther = useMemo(
    () =>
      invoicesForProgress.reduce((sum, inv) => sum + (Number(inv.volume) || 0), 0),
    [invoicesForProgress],
  )

  /** Sisa volume kontrak/unit yang belum di-invoice — default isi form. */
  const sisaVolumeScope = useMemo(
    () => Math.max(0, scopeVolume - usedVolumeOther),
    [scopeVolume, usedVolumeOther],
  )

  const suggestedVolume = sisaVolumeScope > 0 ? sisaVolumeScope : scopeVolume

  // Saat pilih kontrak/unit/BA: volume menunjuk sisa volume kontrak (bukan angka lepas)
  useEffect(() => {
    if (isExisting) return
    if (suggestedVolume > 0) setValue('volume', suggestedVolume)
  }, [suggestedVolume, isExisting, setValue, selectedKontrak, selectedUnit, selectedBA])

  const onSubmit = async (data: InvoiceFormData) => {
    try {
      const payload: any = { ...data }
      // Kirim nama_unit hanya jika dipilih
      if (!data.nama_unit) delete payload.nama_unit
      if (isPayungBA) {
        if (!data.no_ba) {
          addNotification('Kontrak payung wajib memilih Berita Acara', 'error')
          return
        }
        payload.no_ba = data.no_ba
      } else {
        delete payload.no_ba
      }
      // Kirim jumlah_pembayaran hanya jika user mengisinya (partial)
      if (data.jumlah_pembayaran && data.jumlah_pembayaran > 0) {
        payload.jumlah_pembayaran = data.jumlah_pembayaran
      } else {
        delete payload.jumlah_pembayaran // backend will use full/unit value
      }
      // Volume fisik — wajib untuk klop dengan DO/laporan
      if (data.volume && data.volume > 0) {
        payload.volume = data.volume
      } else if (suggestedVolume > 0) {
        payload.volume = suggestedVolume
      } else {
        addNotification('Isi volume invoice (kg/satuan fisik) terlebih dahulu', 'error')
        return
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
    setLiveJumlah(0)
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

  return (
    <div className="flex flex-col lg:flex-row gap-6">
      <div className="flex-1 min-w-0">
        <form onSubmit={handleSubmit(onSubmit)} className="space-y-6" autoComplete="off">
          <Card>
            <CardHeader className="pb-3">
              <CardTitle className="text-sm font-semibold">Pilih Dokumen</CardTitle>
            </CardHeader>
            <CardContent className="grid grid-cols-2 gap-4">
              <div>
                <Label className="text-xs">No Kontrak *</Label>
                <SearchableSelect
                  options={kontrakStore.data.map((k) => ({
                    value: k.no_kontrak,
                    label: `${k.no_kontrak}${k.pembeli ? ' - ' + k.pembeli.split('\n')[0] : ''}`,
                  }))}
                  value={watch('no_kontrak')}
                  onChange={(v) => setValue('no_kontrak', v, { shouldValidate: true })}
                  placeholder="-- Pilih / Cari Kontrak --"
                />
                {errors.no_kontrak && <p className="text-xs text-red-500 mt-1">{errors.no_kontrak.message}</p>}
              </div>
              <div>
                <Label className="text-xs">No Invoice *</Label>
                <SearchableSelect
                  options={invoiceStore.data.map((i) => ({
                    value: i.no_invoice,
                    label: i.no_invoice,
                  }))}
                  value={watch('no_invoice')}
                  allowCustom={canEdit()}
                  onChange={(v) => setValue('no_invoice', v, { shouldValidate: true })}
                  onValueCommit={() => autoLoadInvoice()}
                  placeholder="Ketik baru atau pilih dari daftar"
                />
                <p className="text-xs text-slate-400 mt-1">Daftar dari database. Pilih invoice lama → data terisi otomatis.</p>
                {errors.no_invoice && <p className="text-xs text-red-500 mt-1">{errors.no_invoice.message}</p>}
              </div>
            </CardContent>
          </Card>

          <ReadOnlyFieldset className="space-y-6 block">
          <Card>
            <CardHeader className="pb-3">
              <CardTitle className="text-sm font-semibold">Data Dokumen</CardTitle>
            </CardHeader>
            <CardContent className="grid grid-cols-2 gap-4">
              <div>
                <Label className="text-xs">Tanggal Transaksi *</Label>
                <Input type="date" {...register('tanggal_transaksi')} />
              </div>
              {isPayungBA && (
                <div className="col-span-2">
                  <Label className="text-xs">Berita Acara *</Label>
                  <NativeSelect {...register('no_ba')}>
                    <option value="">-- Pilih BA --</option>
                    {baOptions.map((b) => (
                      <option key={b.no_ba} value={b.no_ba}>
                        {b.no_ba} — {b.volume_ba?.toLocaleString('id-ID')} {k?.satuan || 'Kg'} @ {formatCurrency(b.harga_satuan)}
                        {!b.siap_invoice ? ' (belum ada harga/volume)' : ''} ({b.tanggal_ba})
                      </option>
                    ))}
                  </NativeSelect>
                  {baOptions.length === 0 ? (
                    <p className="text-xs text-amber-700 mt-1">
                      Tidak ada BA tersedia untuk kontrak ini. Buat Berita Acara baru di menu Berita Acara
                      (status Selesai, isi volume & harga satuan).
                    </p>
                  ) : (
                    <p className="text-xs text-slate-400 mt-1">
                      Invoice payung wajib terhubung ke BA. Nilai = volume BA × harga BA + PPN.
                    </p>
                  )}
                </div>
              )}
              {showUnitSelector && !isPayungBA && (
                <div className="col-span-2">
                  <Label className="text-xs">Unit yang Diinvoice</Label>
                  <NativeSelect {...register('nama_unit')}>
                    <option value="">-- Pilih Unit (opsional) --</option>
                    {unitOptions.map(u => (
                      <option key={u.nama_unit} value={u.nama_unit}>
                        {u.nama_unit}{u.volume > 0 ? ` — ${u.volume.toLocaleString('id-ID')} ${k?.satuan || 'Kg'}` : ''}
                      </option>
                    ))}
                  </NativeSelect>
                  {!selectedUnit && <p className="text-xs text-slate-400 mt-1">Kosongkan jika invoice untuk keseluruhan kontrak</p>}
                </div>
              )}
            </CardContent>
          </Card>

          {k && pricing ? (
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
                  {isPayungBA && selectedBAObj ? (
                    <>
                      <span className="text-slate-500">BA Dipilih:</span>
                      <span className="font-medium text-brand-600">{selectedBA}</span>
                      <span className="text-slate-500">Volume BA:</span>
                      <span>{formatCurrency(selectedBAObj.volume_ba)} {k.satuan}</span>
                      <span className="text-slate-500">Harga Satuan BA:</span>
                      <span>{formatCurrency(selectedBAObj.harga_satuan)} / {k.satuan}</span>
                      <span className="text-slate-500">Nilai Invoice (BA):</span>
                      <span className="font-bold text-brand-600">{formatCurrency(kontrakMax)}</span>
                    </>
                  ) : (
                    <>
                      <span className="text-slate-500">Volume:</span>
                      <span>{formatCurrency(k.volume)} {k.satuan}</span>
                      <span className="text-slate-500">Nilai Kontrak:</span>
                      <span className="font-bold text-brand-600">{formatCurrency(kontrakMax)}</span>
                    </>
                  )}
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

                {/* Volume mengacu volume kontrak/unit/BA; boleh dipecah multi-invoice */}
                <div className="border-t pt-3">
                  <Label className="text-xs">Volume Invoice ({k.satuan || 'Kg'}) *</Label>
                  <Input
                    type="number"
                    step="any"
                    className="mt-1"
                    {...register('volume')}
                    placeholder={
                      scopeVolume > 0
                        ? scopeVolume.toLocaleString('id-ID')
                        : 'Volume dari kontrak'
                    }
                  />
                  <div className="mt-1 space-y-0.5 text-xs text-slate-500">
                    <p>
                      Mengacu volume{' '}
                      {isPayungBA ? 'BA' : selectedUnit ? `unit ${selectedUnit}` : 'kontrak'}:{' '}
                      <strong>
                        {scopeVolume > 0
                          ? `${scopeVolume.toLocaleString('id-ID')} ${k.satuan || 'Kg'}`
                          : '—'}
                      </strong>
                    </p>
                    {usedVolumeOther > 0 && (
                      <p>
                        Sudah terpakai invoice lain: {usedVolumeOther.toLocaleString('id-ID')} · Sisa:{' '}
                        <strong className="text-brand-600">
                          {sisaVolumeScope.toLocaleString('id-ID')} {k.satuan || 'Kg'}
                        </strong>
                      </p>
                    )}
                    <p className="text-slate-400">
                      Default = sisa volume kontrak/unit. Boleh dipecah multi-invoice; DO ambil dari volume
                      invoice ini.
                    </p>
                  </div>
                </div>

                {/* Jumlah Pembayaran input */}
                <div className="border-t pt-3">
                  <Label className="text-xs">Jumlah Pembayaran Invoice Ini *</Label>
                  <div className="flex items-center gap-2 mt-1">
                    {(() => {
                      const reg = register('jumlah_pembayaran')
                      return (
                        <Input
                          type="number"
                          step="1"
                          name={reg.name}
                          ref={reg.ref}
                          onBlur={reg.onBlur}
                          onChange={(e) => {
                            reg.onChange(e)
                            setLiveJumlah(Number(e.target.value) || 0)
                          }}
                          placeholder={formatCurrency(sisaKontrak)}
                        />
                      )
                    })()}
                  </div>
                  <p className="text-xs text-slate-400 mt-1">
                    Kosongkan untuk auto (nilai penuh{isPayungBA ? ' BA' : selectedUnit ? ` unit ${selectedUnit}` : ' kontrak'}). Maks: {formatCurrency(sisaKontrak)}
                  </p>
                  {Number(watch('jumlah_pembayaran')) > 0 && kontrakMax > 0 && (
                    <p className="text-xs text-slate-500 mt-1">
                      Terbilang: {terbilangRupiah(Number(watch('jumlah_pembayaran')))}
                    </p>
                  )}
                </div>
              </CardContent>
            </Card>
          ) : (
            <Card>
              <CardContent className="py-8 text-center text-sm text-muted-foreground">
                Pilih No Kontrak untuk melihat data pembayaran dan progress invoice.
              </CardContent>
            </Card>
          )}

          {exportNo && (
            <div className="grid grid-cols-1 md:grid-cols-2 gap-3">
              <DocumentUpload entityType="invoice" entityId={exportNo} docType="invoice" />
              <DocumentUpload entityType="invoice" entityId={exportNo} docType="kuitansi" />
            </div>
          )}
          </ReadOnlyFieldset>

          <div className="flex flex-wrap gap-3">
            <Button type="submit" disabled={isSubmitting || !canEdit()} className="gap-2">
              <Save size={14} />
              {isSubmitting ? 'Menyimpan...' : !canEdit() ? 'Read-Only (Tamu)' : isExisting ? 'Simpan Perubahan' : 'Buat Invoice'}
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
            <Button type="button" variant="outline" onClick={handleReset} disabled={!canEdit()} className="gap-2">
              <RotateCcw size={14} /> Reset
            </Button>
          </div>
        </form>
      </div>

      <PreviewPanel
        title="Preview Proforma Invoice"
        isEmpty={!k}
        emptyDescription="Pilih No Kontrak untuk melihat preview"
      >
        <InvoicePreviewContent
          noInv={watch('no_invoice') || '[No Invoice]'}
          noK={selectedKontrak || '[No Kontrak]'}
          tgl={watch('tanggal_transaksi') || ''}
          k={k!}
          pricing={pricing}
          jumlahPembayaran={Number(watch('jumlah_pembayaran')) || 0}
          baVolume={isPayungBA ? selectedBAObj?.volume_ba : undefined}
          baHarga={isPayungBA ? selectedBAObj?.harga_satuan : undefined}
        />
      </PreviewPanel>
    </div>
  )
}
