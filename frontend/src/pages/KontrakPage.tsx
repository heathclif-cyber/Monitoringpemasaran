import { useEffect, useState, useCallback } from 'react'
import { useSearchParams } from 'react-router-dom'
import { useForm, Controller } from 'react-hook-form'
import { zodResolver } from '@hookform/resolvers/zod'
import { z } from 'zod'
import { Save, Eye, FileDown, RotateCcw } from 'lucide-react'
import { useKontrakStore } from '@/store/kontrakStore'
import { useAppStore } from '@/store/appStore'
import { Button } from '@/components/ui/button'
import { Input } from '@/components/ui/input'
import { Label } from '@/components/ui/label'
import { Card, CardContent, CardHeader, CardTitle } from '@/components/ui/card'
import { Textarea } from '@/components/ui/textarea'
import { KontrakPreview } from '@/components/feature/KontrakPreview'
import { formatCurrencyDec, formatDate } from '@/lib/utils'
import { terbilangRupiah } from '@/utils/terbilang'
import {
  calculateKontrakPricing,
  calculateJatuhTempo,
  generateSyaratSyarat,
  DEFAULT_SYARAT,
  DEFAULT_KETENTUAN,
} from '@/utils/kontrakUtils'

const kontrakSchema = z.object({
  no_kontrak: z.string().min(1, 'No Kontrak wajib diisi'),
  tanggal_kontrak: z.string().min(1, 'Tanggal wajib diisi'),
  lokasi: z.string().optional(),
  status: z.string().optional(),
  pembeli: z.string().min(1, 'Pembeli wajib diisi'),
  nama_direktur: z.string().optional(),
  alamat_pembeli: z.string().optional(),
  penjual: z.string().optional(),
  pemilik_komoditas: z.string().optional(),
  no_reff: z.string().optional(),
  komoditi: z.string().optional(),
  jenis_komoditi: z.string().optional(),
  satuan: z.string().optional(),
  tahun_panen: z.string().optional(),
  kebun_produsen: z.string().optional(),
  simbol: z.string().optional(),
  packaging: z.string().optional(),
  deskripsi_produk: z.string().optional(),
  mutu: z.string().optional(),
  pelabuhan_muat: z.string().optional(),
  volume: z.coerce.number().min(0),
  harga_satuan: z.coerce.number().min(0),
  premi: z.coerce.number().min(0),
  is_ppn: z.string().optional(),
  ppn_persen: z.coerce.number().min(0),
  is_pph: z.string().optional(),
  pph_persen: z.coerce.number().min(0),
  chop: z.string().optional(),
  pack_qty: z.coerce.number().min(0),
  banyaknya_bale_karung: z.coerce.number().min(0),
  kondisi_penyerahan: z.string().optional(),
  waktu_penyerahan: z.string().optional(),
  penyerahan_hari: z.coerce.number().min(0),
  lama_pembayaran_hari: z.coerce.number().min(0),
  levering: z.string().optional(),
  pembayaran_metode: z.string().optional(),
  pembayaran_cara: z.string().optional(),
  pembayaran_bank: z.string().optional(),
  catatan: z.string().optional(),
  syarat_syarat: z.string().optional(),
  dasar_ketentuan: z.string().optional(),
})

type KontrakFormData = z.infer<typeof kontrakSchema>

export default function KontrakPage() {
  const store = useKontrakStore()
  const { addNotification } = useAppStore()
  const [kontrakNo, setKontrakNo] = useState('')
  const [isExisting, setIsExisting] = useState(false)
  const [previewData, setPreviewData] = useState<Partial<KontrakFormData>>({})
  const [exportNo, setExportNo] = useState<string | null>(null)

  const form = useForm<KontrakFormData>({
    resolver: zodResolver(kontrakSchema),
    defaultValues: {
      no_kontrak: '',
      tanggal_kontrak: new Date().toISOString().split('T')[0],
      lokasi: 'Makassar',
      status: 'Draft',
      pembeli: '',
      nama_direktur: '',
      alamat_pembeli: '',
      penjual: 'PT Perkebunan Nusantara I Regional 8\nJalan Urip Sumoharjo No. 72-76, Kota Makassar',
      pemilik_komoditas: 'PT Perkebunan Nusantara I Regional 8',
      no_reff: '',
      komoditi: 'Kelapa',
      jenis_komoditi: '',
      satuan: 'Butir',
      tahun_panen: '',
      kebun_produsen: '',
      simbol: '',
      packaging: '',
      deskripsi_produk: '',
      mutu: '',
      pelabuhan_muat: '',
      volume: 0,
      harga_satuan: 0,
      premi: 0,
      is_ppn: 'true',
      ppn_persen: 11,
      is_pph: 'false',
      pph_persen: 0.25,
      chop: '',
      pack_qty: 0,
      banyaknya_bale_karung: 0,
      kondisi_penyerahan: 'Netto tanpa Pembungkus',
      waktu_penyerahan: '',
      penyerahan_hari: 15,
      lama_pembayaran_hari: 15,
      levering: '',
      pembayaran_metode: 'Tunai',
      pembayaran_cara: 'Transfer',
      pembayaran_bank: 'Bank Rakyat Indonesia',
      catatan: '',
      syarat_syarat: DEFAULT_SYARAT,
      dasar_ketentuan: DEFAULT_KETENTUAN,
    },
  })

  const { register, handleSubmit, reset, setValue, watch, getValues, formState: { errors, isSubmitting } } = form

  // Watch all fields for live preview
  const watchedFields = watch()

  const pricing = calculateKontrakPricing(
    Number(watchedFields.volume) || 0,
    Number(watchedFields.harga_satuan) || 0,
    Number(watchedFields.premi) || 0,
    watchedFields.is_ppn || 'true',
    Number(watchedFields.ppn_persen) || 11,
    watchedFields.is_pph || 'false',
    Number(watchedFields.pph_persen) || 0,
  )

  const jatuhTempo = calculateJatuhTempo(watchedFields.tanggal_kontrak || '', Number(watchedFields.lama_pembayaran_hari) || 15)

  // Auto-load kontrak for edit
  const autoLoadKontrak = useCallback(async () => {
    const no = form.getValues('no_kontrak')
    if (!no || no === kontrakNo) return
    setKontrakNo(no)

    const data = await store.fetchOne(no)
    if (data) {
      setIsExisting(true)
      setExportNo(no)
      const fields: (keyof KontrakFormData)[] = [
        'no_kontrak', 'tanggal_kontrak', 'lokasi', 'status', 'pembeli',
        'nama_direktur', 'alamat_pembeli', 'penjual', 'pemilik_komoditas',
        'no_reff', 'komoditi', 'jenis_komoditi', 'satuan', 'tahun_panen',
        'kebun_produsen', 'simbol', 'packaging', 'deskripsi_produk', 'mutu',
        'pelabuhan_muat', 'volume', 'harga_satuan', 'premi', 'is_ppn',
        'ppn_persen', 'is_pph', 'pph_persen', 'chop', 'pack_qty',
        'banyaknya_bale_karung', 'kondisi_penyerahan', 'waktu_penyerahan',
        'penyerahan_hari', 'lama_pembayaran_hari', 'levering',
        'pembayaran_metode', 'pembayaran_cara', 'pembayaran_bank',
        'catatan', 'syarat_syarat', 'dasar_ketentuan',
      ]
      for (const f of fields) {
        const val = (data as any)[f]
        if (val !== undefined && val !== null) {
          setValue(f, val)
        }
      }
    } else {
      setIsExisting(false)
      setExportNo(null)
    }
  }, [form, kontrakNo, store])

  // Reset everything
  const handleReset = () => {
    reset()
    setIsExisting(false)
    setExportNo(null)
    setKontrakNo('')
  }

  // Submit
  const onSubmit = async (data: KontrakFormData) => {
    try {
      const payload: any = { ...data }
      // Include default fields
      if (!data.syarat_syarat) {
        payload.syarat_syarat = generateSyaratSyarat(data.lama_pembayaran_hari || 15, data.penyerahan_hari || 15)
      }
      payload.pembayaran_atas_nama = 'PT Perkebunan Nusantara I Regional 8'
      payload.pembayaran_rek_no = 'No. 0050-01-005356-30-0'

      await store.save(payload)
      setExportNo(data.no_kontrak)
      setIsExisting(true)
      addNotification('Kontrak berhasil disimpan', 'success')
    } catch (err: any) {
      addNotification(err.message || 'Gagal menyimpan kontrak', 'error')
    }
  }

  // Export
  const handleExport = () => {
    if (exportNo) {
      window.open(`/api/kontrak/export?no_kontrak=${encodeURIComponent(exportNo)}`, '_blank')
    }
  }

  // Read ?edit= param to auto-load kontrak for editing
  const [searchParams] = useSearchParams()
  const editNo = searchParams.get('edit')
  useEffect(() => {
    if (editNo) {
      setValue('no_kontrak', editNo)
      // Trigger auto-load after a tick so form is ready
      const t = setTimeout(() => autoLoadKontrak(), 100)
      return () => clearTimeout(t)
    }
  }, [editNo])

  // Regenerate syarat on lama/ambil change
  useEffect(() => {
    const sub = form.watch((values, { name }) => {
      if (name === 'lama_pembayaran_hari' || name === 'penyerahan_hari') {
        const lama = Number(values.lama_pembayaran_hari) || 15
        const ambil = Number(values.penyerahan_hari) || 15
        const syarat = generateSyaratSyarat(lama, ambil)
        form.setValue('syarat_syarat', syarat)
      }
    })
    return () => sub.unsubscribe()
  }, [form])

  // Input class
  const ic = 'h-9 rounded-md border border-input bg-white px-3 py-1 text-sm shadow-sm w-full focus:outline-none focus:ring-1 focus:ring-ring'

  return (
    <div className="flex gap-6">
      {/* Left: Form */}
      <div className="flex-1 min-w-0">
        <form onSubmit={handleSubmit(onSubmit)} className="space-y-6">
          {/* Data Dasar */}
          <Card>
            <CardHeader className="pb-3">
              <CardTitle className="text-sm font-semibold">Data Dasar</CardTitle>
            </CardHeader>
            <CardContent className="grid grid-cols-3 gap-4">
              <div>
                <Label className="text-xs">No Kontrak *</Label>
                <input {...register('no_kontrak')} className={ic} placeholder="No Kontrak" list="kontrak-datalist" />
                <datalist id="kontrak-datalist">
                  {store.data.map((k) => <option key={k.no_kontrak} value={k.no_kontrak} />)}
                </datalist>
                {errors.no_kontrak && <p className="text-xs text-red-500 mt-1">{errors.no_kontrak.message}</p>}
              </div>
              <div>
                <Label className="text-xs">Tanggal *</Label>
                <input type="date" {...register('tanggal_kontrak')} className={ic} />
              </div>
              <div>
                <Label className="text-xs">Status</Label>
                <select {...register('status')} className={ic}>
                  <option value="Draft">Draft</option>
                  <option value="Active">Active</option>
                </select>
              </div>
              <div>
                <Label className="text-xs">Lokasi</Label>
                <input {...register('lokasi')} className={ic} />
              </div>
              <div className="self-end">
                <Button type="button" variant="outline" size="sm" onClick={autoLoadKontrak}>Cari / Load</Button>
              </div>
            </CardContent>
          </Card>

          {/* Para Pihak */}
          <Card>
            <CardHeader className="pb-3">
              <CardTitle className="text-sm font-semibold">Para Pihak</CardTitle>
            </CardHeader>
            <CardContent className="grid grid-cols-2 gap-4">
              <div>
                <Label className="text-xs">Pembeli *</Label>
                <input {...register('pembeli')} className={ic} />
                {errors.pembeli && <p className="text-xs text-red-500 mt-1">{errors.pembeli.message}</p>}
              </div>
              <div>
                <Label className="text-xs">Nama Direktur</Label>
                <input {...register('nama_direktur')} className={ic} />
              </div>
              <div className="col-span-2">
                <Label className="text-xs">Alamat Pembeli</Label>
                <Textarea {...register('alamat_pembeli')} rows={2} />
              </div>
              <div className="col-span-2">
                <Label className="text-xs">Penjual</Label>
                <Textarea {...register('penjual')} rows={2} />
              </div>
              <div>
                <Label className="text-xs">Pemilik Komoditas</Label>
                <input {...register('pemilik_komoditas')} className={ic} />
              </div>
              <div>
                <Label className="text-xs">No. Reff</Label>
                <input {...register('no_reff')} className={ic} />
              </div>
            </CardContent>
          </Card>

          {/* Data Barang & Produksi */}
          <Card>
            <CardHeader className="pb-3">
              <CardTitle className="text-sm font-semibold">Data Barang & Produksi</CardTitle>
            </CardHeader>
            <CardContent className="grid grid-cols-3 gap-4">
              <div><Label className="text-xs">Komoditi</Label><input {...register('komoditi')} className={ic} /></div>
              <div><Label className="text-xs">Jenis Komoditi</Label><input {...register('jenis_komoditi')} className={ic} /></div>
              <div>
                <Label className="text-xs">Satuan</Label>
                <select {...register('satuan')} className={ic}>
                  <option value="Kg">Kg</option>
                  <option value="Butir">Butir</option>
                </select>
              </div>
              <div><Label className="text-xs">Tahun Panen</Label><input {...register('tahun_panen')} className={ic} /></div>
              <div><Label className="text-xs">Kebun Produsen</Label><input {...register('kebun_produsen')} className={ic} /></div>
              <div><Label className="text-xs">Deskripsi Produk</Label><input {...register('deskripsi_produk')} className={ic} /></div>
              <div><Label className="text-xs">Mutu</Label><input {...register('mutu')} className={ic} /></div>
              <div><Label className="text-xs">Packaging</Label><input {...register('packaging')} className={ic} /></div>
              <div><Label className="text-xs">Simbol</Label><input {...register('simbol')} className={ic} /></div>
              <div><Label className="text-xs">Pelabuhan Muat</Label><input {...register('pelabuhan_muat')} className={ic} /></div>
              <div><Label className="text-xs">Chop</Label><input {...register('chop')} className={ic} /></div>
              <div><Label className="text-xs">Pack Qty</Label><input type="number" step="any" {...register('pack_qty')} className={ic} /></div>
              <div><Label className="text-xs">Banyak Bale/Karung</Label><input type="number" step="any" {...register('banyaknya_bale_karung')} className={ic} /></div>
              <div>
                <Label className="text-xs">PPN</Label>
                <select {...register('is_ppn')} className={ic}>
                  <option value="true">Ya (PPN)</option>
                  <option value="false">Tidak (Non-PPN)</option>
                </select>
              </div>
              <div><Label className="text-xs">PPN %</Label><input type="number" step="any" {...register('ppn_persen')} className={ic} /></div>
              <div>
                <Label className="text-xs">PPh</Label>
                <select {...register('is_pph')} className={ic}>
                  <option value="false">Tidak</option>
                  <option value="true">Ya</option>
                </select>
              </div>
              <div><Label className="text-xs">PPh %</Label><input type="number" step="any" {...register('pph_persen')} className={ic} /></div>
            </CardContent>
          </Card>

          {/* Harga & Volume */}
          <Card>
            <CardHeader className="pb-3">
              <CardTitle className="text-sm font-semibold">Harga & Volume</CardTitle>
            </CardHeader>
            <CardContent className="grid grid-cols-3 gap-4">
              <div>
                <Label className="text-xs">Volume *</Label>
                <input type="number" step="any" {...register('volume')} className={ic} />
              </div>
              <div>
                <Label className="text-xs">Harga Satuan *</Label>
                <input type="number" step="any" {...register('harga_satuan')} className={ic} />
              </div>
              <div>
                <Label className="text-xs">Premi</Label>
                <input type="number" step="any" {...register('premi')} className={ic} />
              </div>
            </CardContent>
            {/* Quick calculation */}
            <div className="px-5 pb-4 grid grid-cols-2 gap-2 text-sm">
              <div className="text-slate-500">Nilai Pokok:</div>
              <div className="text-right font-semibold">{formatCurrencyDec(pricing.pokok)}</div>
              {watchedFields.is_ppn !== 'false' && (
                <>
                  <div className="text-slate-500">Nominal PPN ({watchedFields.ppn_persen || 11}%):</div>
                  <div className="text-right">{formatCurrencyDec(pricing.nominalPpn)}</div>
                </>
              )}
              {watchedFields.is_pph === 'true' && (
                <>
                  <div className="text-slate-500">Potongan PPh ({watchedFields.pph_persen || 0}%):</div>
                  <div className="text-right text-red-600">-{formatCurrencyDec(pricing.nominalPph)}</div>
                </>
              )}
              <div className="text-slate-700 font-semibold border-t pt-1">Total Tagihan:</div>
              <div className="text-right font-bold text-brand-600 border-t pt-1">{formatCurrencyDec(pricing.totalTagihan)}</div>
              {pricing.totalTagihan > 0 && (
                <>
                  <div className="text-slate-400 text-xs">Terbilang:</div>
                  <div className="text-right text-xs text-slate-500">{terbilangRupiah(pricing.totalTagihan)}</div>
                </>
              )}
              <div className="text-slate-500">Jatuh Tempo:</div>
              <div className="text-right">{formatDate(jatuhTempo)}</div>
            </div>
          </Card>

          {/* Delivery & Payment */}
          <Card>
            <CardHeader className="pb-3">
              <CardTitle className="text-sm font-semibold">Ketentuan & Pembayaran</CardTitle>
            </CardHeader>
            <CardContent className="grid grid-cols-3 gap-4">
              <div><Label className="text-xs">Kondisi Penyerahan</Label><input {...register('kondisi_penyerahan')} className={ic} /></div>
              <div><Label className="text-xs">Waktu Penyerahan</Label><input {...register('waktu_penyerahan')} className={ic} /></div>
              <div><Label className="text-xs">Lama Pembayaran (hari)</Label><input type="number" {...register('lama_pembayaran_hari')} className={ic} /></div>
              <div><Label className="text-xs">Penyerahan (hari)</Label><input type="number" {...register('penyerahan_hari')} className={ic} /></div>
              <div><Label className="text-xs">Levering</Label><input {...register('levering')} className={ic} /></div>
              <div><Label className="text-xs">Metode Bayar</Label><input {...register('pembayaran_metode')} className={ic} /></div>
              <div><Label className="text-xs">Cara Bayar</Label><input {...register('pembayaran_cara')} className={ic} /></div>
              <div><Label className="text-xs">Bank</Label><input {...register('pembayaran_bank')} className={ic} /></div>
            </CardContent>
          </Card>

          {/* Terms */}
          <Card>
            <CardHeader className="pb-3">
              <CardTitle className="text-sm font-semibold">Syarat & Ketentuan</CardTitle>
            </CardHeader>
            <CardContent className="space-y-3">
              <div>
                <Label className="text-xs">Syarat-Syarat</Label>
                <Textarea {...register('syarat_syarat')} rows={4} />
              </div>
              <div>
                <Label className="text-xs">Dasar Ketentuan</Label>
                <input {...register('dasar_ketentuan')} className={ic} />
              </div>
              <div>
                <Label className="text-xs">Catatan</Label>
                <Textarea {...register('catatan')} rows={2} />
              </div>
            </CardContent>
          </Card>

          {/* Action buttons */}
          <div className="flex gap-3">
            <Button type="submit" disabled={isSubmitting} className="gap-2">
              <Save size={14} />
              {isSubmitting ? 'Menyimpan...' : isExisting ? 'Simpan Perubahan' : 'Simpan & Preview'}
            </Button>
            {exportNo && (
              <Button type="button" variant="secondary" onClick={handleExport} className="gap-2">
                <FileDown size={14} />
                Export .docx
              </Button>
            )}
            <Button type="button" variant="outline" onClick={handleReset} className="gap-2">
              <RotateCcw size={14} />
              Reset
            </Button>
          </div>
        </form>
      </div>

      {/* Right: Live Preview Panel */}
      <div className="w-[600px] shrink-0">
        <div className="sticky top-[76px] max-h-[calc(100vh-100px)] overflow-y-auto border border-slate-200 rounded-xl bg-white shadow-sm">
          <div className="px-5 py-3 border-b border-slate-100 flex items-center justify-between">
            <span className="text-sm font-semibold text-slate-800">Live Preview</span>
            <Eye size={14} className="text-slate-400" />
          </div>
          <div className="p-5">
            {!watchedFields.no_kontrak && !watchedFields.pembeli ? (
              <div className="flex flex-col items-center justify-center py-16 text-center">
                <Eye size={32} className="text-slate-300 mb-3" />
                <p className="text-sm text-slate-500 font-medium">Preview akan muncul di sini</p>
                <p className="text-xs text-slate-400 mt-1">Isi form kontrak untuk melihat preview</p>
              </div>
            ) : (
              <KontrakPreview data={watchedFields} />
            )}
          </div>
        </div>
      </div>
    </div>
  )
}
