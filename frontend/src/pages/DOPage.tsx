import { useEffect, useState, useMemo } from 'react'
import { useSearchParams } from 'react-router-dom'
import { useForm } from 'react-hook-form'
import { zodResolver } from '@hookform/resolvers/zod'
import { z } from 'zod'
import { FileDown, RotateCcw, Save } from 'lucide-react'
import { useDOStore } from '@/store/doStore'
import { useInvoiceStore } from '@/store/invoiceStore'
import { useBAStore } from '@/store/baStore'
import { useAppStore } from '@/store/appStore'
import { Button } from '@/components/ui/button'
import { Input } from '@/components/ui/input'
import { NativeSelect } from '@/components/ui/native-select'
import { Label } from '@/components/ui/label'
import { PreviewPanel } from '@/components/common/PreviewPanel'
import { Card, CardContent, CardHeader, CardTitle } from '@/components/ui/card'
import { DocumentUpload } from '@/components/common/DocumentUpload'
import { SearchableSelect } from '@/components/ui/searchable-select'
import { formatCurrency } from '@/lib/utils'
import { calculateProportionalVolume, calculateSelisih, getVolumePercentage } from '@/utils/doUtils'
import type { Kontrak } from '@/types'

// Exact replica of forms.js buildDOPreview() format
function DOPreviewContent({ noDo, noInv, tgl, unit, k, nilaiPenuh, nominal, kontrakVol }: {
  noDo: string; noInv: string; tgl: string; unit: string; k: Partial<Kontrak>;
  nilaiPenuh: number; nominal: number; kontrakVol: number;
}) {
  const pembeli = k.pembeli ? k.pembeli.split('\n')[0] : '-'
  const tglDoStr = tgl ? tgl.split('-').reverse().join('/') : '-'

  let propVol = 0
  if (nilaiPenuh > 0 && kontrakVol > 0) {
    propVol = (nominal / nilaiPenuh) * kontrakVol
  }
  const volStr = propVol > 0 ? Math.round(propVol).toLocaleString('id-ID') : (k.volume ? Math.round(k.volume).toLocaleString('id-ID') : '-')
  const baleStr = k.banyaknya_bale_karung ? Number(k.banyaknya_bale_karung) : '-'

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
  no_invoice: z.string().min(1, 'Invoice wajib dipilih'),
  tanggal_do: z.string().min(1, 'Tanggal wajib diisi'),
  kepada_unit: z.string().optional(),
  tanggal_pembayaran: z.string().optional(),
  nominal_transfer: z.coerce.number().min(0),
  is_pph_disetor: z.string().optional(),
  rencana_pengambilan: z.string().optional(),
  no_ba: z.string().optional(),
})

type DOFormData = z.infer<typeof doSchema>

export default function DOPage() {
  const doStore = useDOStore()
  const invoiceStore = useInvoiceStore()
  const baStore = useBAStore()
  const { currentInvoice, currentKontrak, fetchInvoiceForDO } = doStore
  const { addNotification } = useAppStore()
  const [exportNo, setExportNo] = useState<string | null>(null)
  const [isExisting, setIsExisting] = useState(false)

  const form = useForm<DOFormData>({
    resolver: zodResolver(doSchema),
    defaultValues: {
      no_do: '',
      no_invoice: '',
      tanggal_do: new Date().toISOString().split('T')[0],
      kepada_unit: '',
      tanggal_pembayaran: '',
      nominal_transfer: 0,
      is_pph_disetor: 'false',
      rencana_pengambilan: '',
    },
  })

  const { register, handleSubmit, reset, setValue, getValues, watch, formState: { errors, isSubmitting } } = form
  const selectedInvoice = watch('no_invoice')
  const nominalTransfer = watch('nominal_transfer')

  useEffect(() => {
    invoiceStore.fetch()
    doStore.fetch()
  }, [])

  useEffect(() => {
    if (selectedInvoice) fetchInvoiceForDO(selectedInvoice)
  }, [selectedInvoice])

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
      setValue('no_invoice', data.no_invoice)
      setValue('tanggal_do', data.tanggal_do)
      setValue('kepada_unit', data.kepada_unit || '')
      setValue('tanggal_pembayaran', data.tanggal_pembayaran || '')
      setValue('nominal_transfer', data.nominal_transfer)
      setValue('is_pph_disetor', data.is_pph_disetor)
      setValue('rencana_pengambilan', data.rencana_pengambilan || '')
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

  // Volume calculation — pakai unit volume jika ada
  const invoiceTotal = currentInvoice?.jumlah_pembayaran || 0
  const kontrakVolume = unitForDO?.volume || currentKontrak?.volume || 0

  // Nilai penuh unit/kontrak = denominator yang benar untuk volume proporsional
  // (bukan invoice.jumlah_pembayaran yang bisa berupa pembayaran parsial)
  const nilaiUnitPenuh = useMemo(() => {
    if (!currentKontrak) return 0
    const vol = currentKontrak.volume || 0
    const harga = currentKontrak.harga_satuan || 0
    const premi = currentKontrak.premi || 0
    const isppn = String(currentKontrak.is_ppn).toLowerCase() === 'true'
    const ppnPct = (currentKontrak.ppn_persen || 0) / 100
    if (!vol) return 0
    const ratio = kontrakVolume / vol
    const pokokFull = vol * harga + premi
    const ppnFull = isppn ? pokokFull * ppnPct : 0
    return Math.round((pokokFull + ppnFull) * ratio)
  }, [currentKontrak, kontrakVolume])

  const isPayungBA = String(currentKontrak?.tipe_alur || 'STANDAR').toUpperCase() === 'PAYUNG_BA'
  const linkedBA = currentInvoice?.no_ba
  const volumeDo = isPayungBA
    ? (baStore.data.find((b) => b.no_ba === linkedBA)?.volume_ba || 0)
    : calculateProportionalVolume(Number(nominalTransfer) || 0, nilaiUnitPenuh, kontrakVolume)
  const selisih = calculateSelisih(invoiceTotal, Number(nominalTransfer) || 0)
  const volumePct = getVolumePercentage(volumeDo, kontrakVolume)

  const onSubmit = async (data: DOFormData) => {
    try {
      await doStore.save(data)
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
              <CardTitle className="text-sm font-semibold">Data Dokumen</CardTitle>
            </CardHeader>
            <CardContent className="grid grid-cols-2 gap-4">
              <div>
                <Label className="text-xs">No Invoice *</Label>
                <SearchableSelect
                  options={invoiceStore.data.map((i) => ({
                    value: i.no_invoice,
                    label: i.no_invoice,
                  }))}
                  value={watch('no_invoice')}
                  onChange={(v) => setValue('no_invoice', v, { shouldValidate: true })}
                  placeholder="-- Pilih / Cari Invoice --"
                />
                {errors.no_invoice && <p className="text-xs text-red-500 mt-1">{errors.no_invoice.message}</p>}
              </div>
              <div>
                <Label className="text-xs">No DO *</Label>
                <SearchableSelect
                  options={doStore.data.map((d) => ({
                    value: d.no_do,
                    label: d.no_do,
                  }))}
                  value={watch('no_do')}
                  allowCustom
                  onChange={(v) => setValue('no_do', v, { shouldValidate: true })}
                  onValueCommit={() => autoLoadDO()}
                  placeholder="Ketik baru atau pilih dari daftar"
                />
                <p className="text-xs text-slate-400 mt-1">Daftar dari database. Pilih DO lama → data terisi otomatis.</p>
              </div>
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
              <CardTitle className="text-sm font-semibold">Data Pembayaran</CardTitle>
            </CardHeader>
            <CardContent className="grid grid-cols-3 gap-4">
              <div>
                <Label className="text-xs">Tanggal Pembayaran</Label>
                <Input type="date" {...register('tanggal_pembayaran')} />
              </div>
              <div>
                <Label className="text-xs">Nominal Transfer</Label>
                <Input type="number" step="any" {...register('nominal_transfer')} />
              </div>
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
              <div>
                <Label className="text-xs">PPh Disetor</Label>
                <NativeSelect {...register('is_pph_disetor')}>
                  <option value="false">Belum</option>
                  <option value="true">Sudah</option>
                </NativeSelect>
              </div>
              <div>
                <Label className="text-xs">Volume Dapat Diambil</Label>
                <p className={`text-lg font-bold mt-1 ${
                  volumePct > 100 ? 'text-red-600' : volumePct > 0 ? 'text-green-600' : 'text-blue-600'
                }`}>
                  {formatCurrency(volumeDo)} {currentKontrak?.satuan || ''}
                  {volumePct > 0 && ` (${Math.round(volumePct)}%)`}
                </p>
                <p className="text-xs text-slate-500 mt-1">Selisih: {formatCurrency(selisih)}</p>
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
                  <span className="text-slate-500">{currentInvoice.nama_unit ? 'Volume Unit:' : 'Volume Kontrak:'}</span><span>{formatCurrency(kontrakVolume)} {currentKontrak.satuan}</span>
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
                Pilih No Invoice untuk melihat ringkasan kontrak dan invoice.
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

          <div className="flex flex-wrap gap-3">
            <Button type="submit" disabled={isSubmitting} className="gap-2">
              <Save size={14} />
              {isSubmitting ? 'Menyimpan...' : isExisting ? 'Simpan Perubahan' : 'Terbitkan DO'}
            </Button>
            {exportNo && (
              <Button type="button" variant="secondary" onClick={handleExport} className="gap-2">
                <FileDown size={14} /> Export .docx
              </Button>
            )}
            <Button type="button" variant="outline" onClick={handleReset} className="gap-2">
              <RotateCcw size={14} /> Reset
            </Button>
          </div>
        </form>
      </div>

      <PreviewPanel
        title="Preview Delivery Order"
        isEmpty={!currentInvoice && !currentKontrak}
        emptyDescription="Pilih No Invoice untuk melihat preview"
      >
        <DOPreviewContent
          noDo={watch('no_do') || '[No DO]'}
          noInv={selectedInvoice || '[No Invoice]'}
          tgl={watch('tanggal_do') || ''}
          unit={watch('kepada_unit') || '-'}
          k={currentKontrak || {}}
          nilaiPenuh={nilaiUnitPenuh}
          nominal={Number(nominalTransfer) || 0}
          kontrakVol={kontrakVolume}
        />
      </PreviewPanel>
    </div>
  )
}
