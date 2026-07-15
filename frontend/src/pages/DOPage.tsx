import { useEffect, useState, useMemo, useRef } from 'react'
import { useSearchParams } from 'react-router-dom'
import { useForm } from 'react-hook-form'
import { zodResolver } from '@hookform/resolvers/zod'
import { z } from 'zod'
import { FileDown, RotateCcw, Save } from 'lucide-react'
import { useDOStore } from '@/store/doStore'
import { usePembayaranStore } from '@/store/pembayaranStore'
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
import { client } from '@/lib/client'
import { cn, formatCurrency, formatNumber } from '@/lib/utils'
import type { DeliveryOrderInput, StokSaldo } from '@/types'
import {
  calculateProportionalVolume,
  calculateSelisih,
  formatDOSelectLabel,
  formatSupermanSelectLabel,
  getVolumePercentage,
} from '@/utils/doUtils'
import type { Kontrak, Pembayaran } from '@/types'

// Exact replica of forms.js buildDOPreview() format
function DOPreviewContent({ noDo, noInv, tgl, unit, k, volumeKeluar, maxVolume }: {
  noDo: string; noInv: string; tgl: string; unit: string; k: Partial<Kontrak>;
  volumeKeluar: number; maxVolume: number;
}) {
  const pembeli = k.pembeli ? k.pembeli.split('\n')[0] : '-'
  const tglDoStr = tgl ? tgl.split('-').reverse().join('/') : '-'

  const volStr = volumeKeluar > 0
    ? Math.round(volumeKeluar).toLocaleString('id-ID')
    : '-'
  const baleTotal = Number(k.banyaknya_bale_karung || 0)
  const refVol = maxVolume > 0 ? maxVolume : (k.volume || 0)
  const baleStr = baleTotal > 0 && volumeKeluar > 0 && refVol > 0
    ? Math.round(baleTotal * (volumeKeluar / refVol)).toLocaleString('id-ID')
    : (baleTotal > 0 ? baleTotal.toLocaleString('id-ID') : '-')

  const tableStyle: React.CSSProperties = { width: '100%', borderCollapse: 'collapse', fontSize: '9pt', fontFamily: '"Calibri", Arial, sans-serif', color: '#000', border: '1px solid #000', backgroundColor: '#fff' }
  const tdStyle: React.CSSProperties = { border: '1px solid #000', padding: '6px', verticalAlign: 'top' }
  const tdCenter: React.CSSProperties = { border: '1px solid #000', padding: '6px', verticalAlign: 'top', textAlign: 'center' }
  const thStyle: React.CSSProperties = { border: '1px solid #000', padding: '6px', verticalAlign: 'top', textAlign: 'center', fontWeight: 'bold' }

  return (
    <div style={{ padding: '10px', maxWidth: '800px', overflowX: 'auto', fontFamily: '"Calibri", Arial, sans-serif', fontSize: '9pt', color: '#000' }}>
      <table style={tableStyle}>
        <tbody>
          <tr>
            <td style={{ ...tdCenter, width: '40%' }} colSpan={3}>
              <strong>PT PERKEBUNAN NUSANTARA I</strong><br />
              <strong>REGIONAL 8</strong><br />
              <span style={{ fontSize: '8pt' }}>Jalan Urip Sumoharjo No 72-76, Kota Makassar</span>
            </td>
            <td style={{ ...tdCenter, verticalAlign: 'middle', fontSize: '11pt', width: '30%' }} colSpan={2}>
              <strong>DELIVERY ORDER</strong>
            </td>
            <td style={{ ...tdStyle, width: '30%' }} colSpan={2}>
              <strong>No.</strong><br />{noDo}<br /><br />
              <strong>Tanggal</strong><br />{tglDoStr}
            </td>
          </tr>
          <tr>
            <td style={tdStyle} colSpan={7}>
              <table style={{ width: '100%', border: 'none', padding: 0, margin: 0, fontSize: '9pt' }}>
                <tbody>
                  <tr><td style={{ width: '70px' }}>Kepada</td><td style={{ width: '10px' }}>:</td><td>Manajer Unit {unit}</td></tr>
                  <tr><td>Alamat</td><td>:</td><td>-</td></tr>
                </tbody>
              </table>
            </td>
          </tr>
          <tr>
            <td style={tdStyle} colSpan={7}>
              Atas penyerahan D.O. harap diserahkan barang-barang tersebut di bawah ini:<br />
              <table style={{ width: '100%', border: 'none', padding: 0, margin: 0, marginTop: '4px', fontSize: '9pt' }}>
                <tbody>
                  <tr><td style={{ width: '100px' }}>Kepada</td><td style={{ width: '10px' }}>:</td><td>{pembeli}</td></tr>
                  <tr><td>Jenis Barang</td><td>:</td><td>{k.jenis_komoditi || k.komoditi || '-'} <span style={{ display: 'inline-block', width: '100px' }} /> Tahun panen: {k.tahun_panen || '-'}</td></tr>
                </tbody>
              </table>
            </td>
          </tr>
          <tr>
            <td style={thStyle}>Kebun</td>
            <td style={thStyle}>Jenis<br />Produk/Mutu</td>
            <td style={thStyle}>Banyaknya<br />Bale/Karung</td>
            <td style={thStyle}>No.<br />Kav./Chop</td>
            <td style={thStyle}>No. Kontrak</td>
            <td style={thStyle}>Berat Kotor/<br />Bersih (Kg)</td>
            <td style={thStyle}>Levering</td>
          </tr>
          <tr>
            <td style={{ ...tdCenter, height: '100px' }}>{k.kebun_produsen || '-'}</td>
            <td style={tdCenter}>{k.jenis_komoditi || k.deskripsi_produk || k.komoditi || '-'}</td>
            <td style={tdCenter}>{baleStr}</td>
            <td style={tdCenter}>{k.no_kav_chop || '-'}</td>
            <td style={tdStyle}>{k.no_kontrak || '-'}</td>
            <td style={tdCenter}><strong>{volStr}</strong></td>
            <td style={tdCenter}>{k.levering || '-'}</td>
          </tr>
          <tr>
            <td style={tdStyle} colSpan={7}>
              <strong>CATATAN :</strong><br /><br />
              {k.catatan && k.catatan !== '-' ? k.catatan : ''}<br /><br />
            </td>
          </tr>
        </tbody>
      </table>
    </div>
  )
}

const doSchema = z.object({
  no_do: z.string().min(1, 'No DO wajib diisi'),
  no_pembayaran: z.string().min(1, 'Superman wajib dipilih'),
  no_invoice: z.string().optional(),
  tanggal_do: z.string().min(1, 'Tanggal wajib diisi'),
  kepada_unit: z.string().optional(),
  volume_keluar: z.coerce.number().min(0).optional(),
  rencana_pengambilan: z.string().optional(),
  no_ba: z.string().optional(),
})

type DOFormData = z.infer<typeof doSchema>

export default function DOPage() {
  const doStore = useDOStore()
  const pembayaranStore = usePembayaranStore()
  const invoiceStore = useInvoiceStore()
  const kontrakStore = useKontrakStore()
  const baStore = useBAStore()
  const { currentInvoice, currentKontrak, currentPembayaran, fetchPembayaranForDO } = doStore
  const [availablePembayaranRows, setAvailablePembayaranRows] = useState<Pembayaran[]>([])
  const { addNotification } = useAppStore()
  const canEdit = useAuthStore((s) => s.canEdit)
  const [exportNo, setExportNo] = useState<string | null>(null)

  const [isExisting, setIsExisting] = useState(false)
  const volumeManualRef = useRef(false)

  const form = useForm<DOFormData>({
    resolver: zodResolver(doSchema),
    defaultValues: {
      no_do: '',
      no_pembayaran: '',
      no_invoice: '',
      tanggal_do: new Date().toISOString().split('T')[0],
      kepada_unit: '',
      volume_keluar: 0,
      rencana_pengambilan: '',
    },
  })

  const { register, handleSubmit, reset, setValue, getValues, watch, formState: { errors, isSubmitting } } = form
  const selectedPembayaran = watch('no_pembayaran')
  const selectedInvoice = watch('no_invoice')
  const nominalTransfer = currentPembayaran?.nominal_transfer || 0
  const volumeKeluar = watch('volume_keluar')
  const kepadaUnit = watch('kepada_unit')
  const noDo = watch('no_do')
  const tanggalDo = watch('tanggal_do')
  const [stokSaldo, setStokSaldo] = useState<StokSaldo | null>(null)

  useEffect(() => {
    pembayaranStore.fetch()
    invoiceStore.fetch()
    kontrakStore.fetch()
    doStore.fetch()
    pembayaranStore.fetchAvailableForDO().then(setAvailablePembayaranRows)
  }, [])

  const invoiceByNo = useMemo(
    () => Object.fromEntries(invoiceStore.data.map((i) => [i.no_invoice, i])),
    [invoiceStore.data],
  )

  const kontrakByNo = useMemo(
    () => Object.fromEntries(kontrakStore.data.map((k) => [k.no_kontrak, k])),
    [kontrakStore.data],
  )

  const availablePembayaran = useMemo(
    () => availablePembayaranRows.map((p) => ({
      value: p.no_pembayaran,
      label: formatSupermanSelectLabel(p, invoiceByNo, kontrakByNo),
    })),
    [availablePembayaranRows, invoiceByNo, kontrakByNo],
  )

  const doOptions = useMemo(
    () => doStore.data.map((d) => ({
      value: d.no_do,
      label: formatDOSelectLabel(d, invoiceByNo, kontrakByNo),
    })),
    [doStore.data, invoiceByNo, kontrakByNo],
  )

  useEffect(() => {
    if (selectedPembayaran) fetchPembayaranForDO(selectedPembayaran)
  }, [selectedPembayaran])

  useEffect(() => {
    if (currentInvoice?.no_invoice) setValue('no_invoice', currentInvoice.no_invoice)
  }, [currentInvoice?.no_invoice, setValue])

  useEffect(() => {
    if (currentInvoice?.no_kontrak) baStore.fetch(currentInvoice.no_kontrak)
  }, [currentInvoice?.no_kontrak])

  // Auto-populate kepada_unit dari nama_unit invoice saat invoice berhasil di-load
  useEffect(() => {
    if (currentInvoice?.nama_unit && !isExisting) {
      setValue('kepada_unit', currentInvoice.nama_unit)
    }
  }, [currentInvoice])

  // Auto-load DO for edit
  const autoLoadDO = async () => {
    const no = form.getValues('no_do')
    if (!no) return
    const data = await doStore.fetchOne(no)
    if (data) {
      setIsExisting(true)
      setExportNo(no)

      if (data.no_pembayaran) setValue('no_pembayaran', data.no_pembayaran)
      setValue('no_invoice', data.no_invoice)
      setValue('tanggal_do', data.tanggal_do)
      setValue('kepada_unit', data.kepada_unit || '')
      setValue('volume_keluar', data.volume_do || 0)
      volumeManualRef.current = true
      setValue('rencana_pengambilan', data.rencana_pengambilan || '')
      if (data.no_pembayaran) {
        setAvailablePembayaranRows((rows) => {
          if (rows.some((r) => r.no_pembayaran === data.no_pembayaran)) return rows
          const existing = pembayaranStore.data.find((p) => p.no_pembayaran === data.no_pembayaran)
          if (existing) return [existing, ...rows]
          const noPay = data.no_pembayaran as string
          return [
            {
              no_pembayaran: noPay,
              no_invoice: data.no_invoice,
              tanggal_pembayaran: data.tanggal_pembayaran || '',
              nominal_transfer: data.nominal_transfer || 0,
              is_pph_disetor: data.is_pph_disetor || 'false',
              selisih: 0,
              superman: data.superman,
            } satisfies Pembayaran,
            ...rows,
          ]
        })
      }
    } else {
      setIsExisting(false)
      setExportNo(null)

    }
  }


  // Jika invoice punya nama_unit, pakai volume unit untuk kalkulasi
  const unitForDO = useMemo(() => {
    if (!currentInvoice?.nama_unit || !currentKontrak?.units) return null
    return currentKontrak.units.find(u => u.nama_unit === currentInvoice.nama_unit) || null
  }, [currentInvoice, currentKontrak])

  const invoiceTotal = currentInvoice?.jumlah_pembayaran || 0
  const isPayungBA = String(currentKontrak?.tipe_alur || 'STANDAR').toUpperCase() === 'PAYUNG_BA'
  const linkedBA = currentInvoice?.no_ba
  const linkedBAData = useMemo(
    () => (linkedBA ? baStore.data.find((b) => b.no_ba === linkedBA) : null),
    [baStore.data, linkedBA],
  )

  const maxVolume = useMemo(() => {
    if (isPayungBA) return linkedBAData?.volume_ba || 0
    return unitForDO?.volume || currentKontrak?.volume || 0
  }, [isPayungBA, linkedBAData, unitForDO, currentKontrak])

  const nilaiUnitPenuh = useMemo(() => {
    if (!currentKontrak) return 0
    if (isPayungBA) return invoiceTotal
    const vol = currentKontrak.volume || 0
    const harga = currentKontrak.harga_satuan || 0
    const premi = currentKontrak.premi || 0
    const isppn = String(currentKontrak.is_ppn).toLowerCase() === 'true'
    const ppnPct = (currentKontrak.ppn_persen || 0) / 100
    if (!vol) return invoiceTotal
    const ratio = maxVolume / vol
    const pokokFull = vol * harga + premi
    const ppnFull = isppn ? pokokFull * ppnPct : 0
    return Math.round((pokokFull + ppnFull) * ratio)
  }, [currentKontrak, isPayungBA, invoiceTotal, maxVolume])

  // Volume DO default = volume invoice (manual), selalu klop — bukan proporsi transfer/PPh.
  const volumeFromInvoice = useMemo(() => {
    const invVol = Number(currentInvoice?.volume) || 0
    if (invVol > 0) return Math.round(invVol)
    // Fallback data lama
    return calculateProportionalVolume(Number(nominalTransfer) || 0, nilaiUnitPenuh, maxVolume)
  }, [currentInvoice?.volume, nominalTransfer, nilaiUnitPenuh, maxVolume])

  useEffect(() => {
    if (volumeManualRef.current || isExisting) return
    setValue('volume_keluar', volumeFromInvoice)
  }, [volumeFromInvoice, isExisting, setValue])

  useEffect(() => {
    if (!selectedPembayaran) {
      volumeManualRef.current = false
    }
  }, [selectedPembayaran])

  const volumeDo = Number(volumeKeluar) || 0
  const selisih = calculateSelisih(invoiceTotal, Number(nominalTransfer) || 0)
  const volumePct = getVolumePercentage(volumeDo, maxVolume)

  const stokUnit = kepadaUnit || currentInvoice?.nama_unit || ''
  const stokMaterial =
    unitForDO?.jenis_komoditi ||
    currentKontrak?.jenis_komoditi ||
    currentKontrak?.deskripsi_produk ||
    ''
  const stokSatuan = unitForDO?.satuan || currentKontrak?.satuan || 'Kg'
  const stokKurang = stokSaldo != null && volumeDo > 0 && stokSaldo.saldo < volumeDo

  useEffect(() => {
    if (!stokUnit || !stokMaterial) {
      setStokSaldo(null)
      return
    }
    const params = new URLSearchParams({
      unit: stokUnit,
      jenis_material: stokMaterial,
      satuan: stokSatuan,
    })
    if (tanggalDo) params.set('tanggal', tanggalDo)
    if (isExisting && noDo) params.set('exclude_referensi_id', noDo)
    client
      .get<StokSaldo>(`/api/stok/saldo/detail?${params.toString()}`)
      .then(setStokSaldo)
      .catch(() => setStokSaldo(null))
  }, [stokUnit, stokMaterial, stokSatuan, tanggalDo, isExisting, noDo, volumeDo])

  const onSubmit = async (data: DOFormData) => {
    try {
      const payload: DeliveryOrderInput = {
        no_do: data.no_do,
        no_pembayaran: data.no_pembayaran,
        no_invoice: data.no_invoice || currentInvoice?.no_invoice,
        tanggal_do: data.tanggal_do,
        kepada_unit: data.kepada_unit,
        rencana_pengambilan: data.rencana_pengambilan || null,
        no_ba: data.no_ba,
      }
      if (data.volume_keluar && data.volume_keluar > 0) {
        payload.volume_do = Math.round(data.volume_keluar)
      }
      await doStore.save(payload)
      setExportNo(data.no_do)
      setIsExisting(true)
      addNotification('Delivery Order berhasil disimpan', 'success')
    } catch (err: any) {
      addNotification(err.message || 'Gagal menyimpan DO', 'error')
    }
  }

  const handleReset = () => {
    reset()
    setIsExisting(false)
    setExportNo(null)
    volumeManualRef.current = false
  }

  const handleExport = () => {
    if (exportNo) window.open(`/api/do/export?no_do=${encodeURIComponent(exportNo)}`, '_blank')
  }

  // Read ?edit= param to auto-load DO for editing
  const [searchParams] = useSearchParams()
  const editNo = searchParams.get('edit')
  useEffect(() => {
    if (editNo) {
      setValue('no_do', editNo)
      const t = setTimeout(() => autoLoadDO(), 100)
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
                <Label className="text-xs">Superman (SPPn/SPPb) *</Label>
                <SearchableSelect
                  options={availablePembayaran}
                  value={watch('no_pembayaran')}
                  onChange={(v) => setValue('no_pembayaran', v, { shouldValidate: true })}
                  placeholder="-- Pilih Superman (belum punya DO) --"
                />
                {errors.no_pembayaran && <p className="text-xs text-red-500 mt-1">{errors.no_pembayaran.message}</p>}
                <p className="text-xs text-slate-400 mt-1">
                  Pilih nomor Superman dari pembayaran yang sudah lunas. Buat deklarasi di menu Input Pembayaran.
                  Format: nomor Superman - nama pembeli - tanggal pembayaran.
                </p>
              </div>
              <div>
                <Label className="text-xs">No DO *</Label>
                <SearchableSelect
                  options={doOptions}
                  value={watch('no_do')}
                  allowCustom={canEdit()}
                  onChange={(v) => setValue('no_do', v, { shouldValidate: true })}
                  onValueCommit={() => autoLoadDO()}
                  placeholder="Ketik baru atau pilih dari daftar"
                />
                <p className="text-xs text-slate-400 mt-1">
                  Daftar dari database. Pilih DO lama → data terisi otomatis.
                  Format: nomor DO - nama pembeli - tanggal DO.
                </p>
              </div>
              {selectedInvoice && (
                <div className="col-span-2">
                  <Label className="text-xs">No Invoice</Label>
                  <Input value={selectedInvoice} className="bg-slate-50" readOnly />
                </div>
              )}
            </CardContent>
          </Card>

          <ReadOnlyFieldset className="space-y-6 block">
          {currentPembayaran && (
            <Card>
              <CardHeader className="pb-3">
                <CardTitle className="text-sm font-semibold">Info Pembayaran</CardTitle>
              </CardHeader>
              <CardContent className="grid grid-cols-3 gap-4 text-sm">
                <div>
                  <span className="text-xs text-slate-500 block">Tanggal Pembayaran</span>
                  <span className="font-medium">{currentPembayaran.tanggal_pembayaran?.split('-').reverse().join('/') || '-'}</span>
                </div>
                <div>
                  <span className="text-xs text-slate-500 block">Nominal Transfer</span>
                  <span className="font-semibold text-emerald-700">{formatCurrency(currentPembayaran.nominal_transfer)}</span>
                </div>
                <div>
                  <span className="text-xs text-slate-500 block">PPh Disetor</span>
                  <span className="font-medium">{currentPembayaran.is_pph_disetor === 'true' ? 'Sudah' : 'Belum'}</span>
                </div>
                {currentPembayaran.superman && (
                  <div className="col-span-3">
                    <span className="text-xs text-slate-500 block">Superman (SPPn)</span>
                    <span className="font-medium text-emerald-700">{currentPembayaran.superman}</span>
                  </div>
                )}
              </CardContent>
            </Card>
          )}

          <Card>
            <CardHeader className="pb-3">
              <CardTitle className="text-sm font-semibold">Data Dokumen</CardTitle>
            </CardHeader>
            <CardContent className="grid grid-cols-2 gap-4">
              <div>
                <Label className="text-xs">Tanggal DO *</Label>
                <Input type="date" {...register('tanggal_do')} />
              </div>
              <div>
                <Label className="text-xs">Kepada Unit</Label>
                {currentInvoice?.nama_unit ? (
                  <div>
                    <Input {...register('kepada_unit')} className="bg-slate-50" readOnly />
                    <p className="text-xs text-slate-400 mt-1">Otomatis dari invoice (unit {currentInvoice.nama_unit})</p>
                  </div>
                ) : (
                  <div>
                    <NativeSelect {...register('kepada_unit')}>
                      <option value="">-- Pilih Unit --</option>
                      {['Minahasa-Halmahera','Beteleme','Awaya-Telpaputih','Takalar','Camming','Kabaru'].map(u => (
                        <option key={u} value={u}>{u}</option>
                      ))}
                    </NativeSelect>
                  </div>
                )}
              </div>
            </CardContent>
          </Card>

          <Card>
            <CardHeader className="pb-3">
              <CardTitle className="text-sm font-semibold">Data Pengiriman</CardTitle>
            </CardHeader>
            <CardContent className="grid grid-cols-3 gap-4">
              <div>
                <Label className="text-xs">Rencana Pengambilan</Label>
                {isPayungBA ? (
                  <div>
                    <Input
                      type="date"
                      value={baStore.data.find((b) => b.no_ba === linkedBA)?.tanggal_ba || ''}
                      className="bg-slate-50"
                      readOnly
                    />
                    <p className="text-xs text-slate-400 mt-1">Otomatis dari tanggal BA (pengakuan pendapatan)</p>
                  </div>
                ) : (
                  <Input type="date" {...register('rencana_pengambilan')} />
                )}
              </div>
              <div className="col-span-3 border-t pt-3 grid grid-cols-1 md:grid-cols-2 gap-4">
                <div>
                  <Label className="text-xs">Volume Barang Keluar ({currentKontrak?.satuan || 'Kg'}) *</Label>
                  <Input
                    type="number"
                    step="any"
                    {...register('volume_keluar', {
                      onChange: () => { volumeManualRef.current = true },
                    })}
                  />
                  <p className="text-xs text-slate-500 mt-1">
                    Default dari <strong>volume invoice</strong>:{' '}
                    <strong>{formatNumber(volumeFromInvoice)} {currentKontrak?.satuan || 'Kg'}</strong>
                    {(currentInvoice?.volume || 0) > 0 ? (
                      <> (invoice: {formatNumber(currentInvoice?.volume || 0)})</>
                    ) : (
                      <> (invoice belum isi volume — fallback proporsi)</>
                    )}
                    {maxVolume > 0 && <> — maks scope {formatNumber(maxVolume)} {currentKontrak?.satuan || 'Kg'}</>}
                  </p>
                  {volumeDo > maxVolume && maxVolume > 0 && (
                    <p className="text-xs text-red-600 mt-1">Volume melebihi maksimum ({formatNumber(maxVolume)})</p>
                  )}
                </div>
                <div>
                  <Label className="text-xs">Ringkasan</Label>
                  <p className={`text-lg font-bold mt-1 ${
                    volumePct > 100 ? 'text-red-600' : volumePct > 0 ? 'text-green-600' : 'text-blue-600'
                  }`}>
                    {formatNumber(volumeDo)} {currentKontrak?.satuan || ''}
                    {volumePct > 0 && ` (${Math.round(volumePct)}% volume)`}
                  </p>
                  <p className="text-xs text-slate-500 mt-1">Selisih pembayaran: {formatCurrency(selisih)}</p>
                  {stokUnit && stokMaterial && (
                    <p className={cn('text-xs mt-2', stokKurang ? 'text-amber-700' : 'text-slate-600')}>
                      Persediaan tersedia{tanggalDo ? ` per ${tanggalDo.split('-').reverse().join('/')}` : ''}:{' '}
                      {stokSaldo != null ? `${formatNumber(stokSaldo.saldo)} ${stokSatuan}` : '—'}
                      {stokKurang && ' — kurang, DO tetap dapat disimpan'}
                    </p>
                  )}
                </div>
              </div>
            </CardContent>
          </Card>

          {currentInvoice && currentKontrak ? (
            <Card>
              <CardHeader className="pb-3">
                <CardTitle className="text-sm font-semibold">Data Riwayat Invoice & Kontrak</CardTitle>
              </CardHeader>
              <CardContent className="text-sm space-y-1">
                <div className="grid grid-cols-2 gap-2">
                  <span className="text-slate-500">No Kontrak:</span><span className="font-medium">{currentKontrak.no_kontrak}</span>
                  <span className="text-slate-500">Pembeli:</span><span>{(currentKontrak.pembeli || '-').split('\n')[0]}</span>
                  <span className="text-slate-500">Komoditi:</span><span>{currentKontrak.komoditi || '-'}</span>
                  {currentInvoice.nama_unit && (
                    <><span className="text-slate-500">Unit:</span><span className="font-medium text-brand-600">{currentInvoice.nama_unit}</span></>
                  )}
                  <span className="text-slate-500">{isPayungBA ? 'Volume BA:' : currentInvoice.nama_unit ? 'Volume Unit:' : 'Volume Kontrak:'}</span><span>{formatCurrency(maxVolume)} {currentKontrak.satuan}</span>
                  <span className="text-slate-500">Nilai Penuh Unit:</span><span className="text-slate-700">{formatCurrency(nilaiUnitPenuh)}</span>
                  <span className="text-slate-500">Invoice ini:</span><span className="font-semibold">{formatCurrency(invoiceTotal)}{nilaiUnitPenuh > 0 ? ` (${Math.round(invoiceTotal / nilaiUnitPenuh * 100)}%)` : ''}</span>
                  {isPayungBA && linkedBA && (
                    <>
                      <span className="text-slate-500">Berita Acara:</span>
                      <span className="font-medium text-brand-600">{linkedBA}</span>
                    </>
                  )}
                </div>
              </CardContent>
            </Card>
          ) : (
            <Card>
              <CardContent className="py-8 text-center text-sm text-muted-foreground">
                Pilih No Pembayaran untuk melihat ringkasan kontrak dan invoice.
              </CardContent>
            </Card>
          )}

          {exportNo && (
            <div className="grid grid-cols-1 md:grid-cols-3 gap-3">
              <DocumentUpload entityType="do" entityId={exportNo} docType="do" />
              <DocumentUpload entityType="do" entityId={exportNo} docType="deklarasi" />
              <DocumentUpload entityType="do" entityId={exportNo} docType="berita_acara" />
            </div>
          )}
          </ReadOnlyFieldset>

          <div className="flex flex-wrap gap-3">
            <Button type="submit" disabled={isSubmitting || !canEdit()} className="gap-2">
              <Save size={14} />
              {isSubmitting ? 'Menyimpan...' : !canEdit() ? 'Read-Only (Tamu)' : isExisting ? 'Simpan Perubahan' : 'Terbitkan DO'}
            </Button>
            {exportNo && (
              <>
                <Button type="button" variant="secondary" onClick={handleExport} className="gap-2">
                  <FileDown size={14} /> Export .docx
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
        title="Preview Delivery Order"
        isEmpty={!currentInvoice && !currentKontrak}
        emptyDescription="Pilih No Pembayaran untuk melihat preview"
      >
        <DOPreviewContent
          noDo={watch('no_do') || '[No DO]'}
          noInv={selectedInvoice || '[No Invoice]'}
          tgl={watch('tanggal_do') || ''}
          unit={watch('kepada_unit') || '-'}
          k={currentKontrak || {}}
          volumeKeluar={volumeDo}
          maxVolume={maxVolume}
        />
      </PreviewPanel>
    </div>
  )
}
