import { useEffect, useMemo, useState } from 'react'
import { useForm } from 'react-hook-form'
import { zodResolver } from '@hookform/resolvers/zod'
import { z } from 'zod'
import { ClipboardList, RotateCcw, Save } from 'lucide-react'
import { useBAStore } from '@/store/baStore'
import { useKontrakStore } from '@/store/kontrakStore'
import { useAppStore } from '@/store/appStore'
import { useAuthStore } from '@/store/authStore'
import { Button } from '@/components/ui/button'
import { Input } from '@/components/ui/input'
import { NativeSelect } from '@/components/ui/native-select'
import { Label } from '@/components/ui/label'
import { Card, CardContent, CardHeader, CardTitle } from '@/components/ui/card'
import { Textarea } from '@/components/ui/textarea'
import { SearchableSelect } from '@/components/ui/searchable-select'
import { DocumentUpload } from '@/components/common/DocumentUpload'
import { ReadOnlyFieldset } from '@/components/common/ReadOnlyFieldset'
import { formatCurrency } from '@/lib/utils'
import type { Kontrak } from '@/types'

function previousMonthFrom(isoDate: string): string {
  const d = new Date(isoDate)
  d.setMonth(d.getMonth() - 1)
  return `${d.getFullYear()}-${String(d.getMonth() + 1).padStart(2, '0')}`
}

function toMonthInput(isoDate: string): string {
  return isoDate?.slice(0, 7) || ''
}

const baSchema = z.object({
  no_ba: z.string().min(1, 'No BA wajib diisi'),
  no_kontrak: z.string().min(1, 'Kontrak wajib dipilih'),
  tanggal_ba: z.string().min(1, 'Tanggal BA wajib diisi'),
  bulan_buku: z.string().min(1, 'Bulan buku wajib diisi'),
  volume_ba: z.coerce.number().min(0.01, 'Volume harus > 0'),
  nama_unit: z.string().optional(),
  komoditi: z.string().optional(),
  deskripsi: z.string().optional(),
  link_berita_acara: z.string().optional(),
  status: z.string().optional(),
})

type BAFormData = z.infer<typeof baSchema>

const FIXED_UNITS = ['Minahasa-Halmahera', 'Beteleme', 'Awaya-Telpaputih', 'Takalar', 'Camming', 'Kabaru']

export default function BAPage() {
  const baStore = useBAStore()
  const kontrakStore = useKontrakStore()
  const { addNotification } = useAppStore()
  const canEdit = useAuthStore((s) => s.canEdit)
  const [isExisting, setIsExisting] = useState(false)
  const [exportNo, setExportNo] = useState<string | null>(null)

  const form = useForm<BAFormData>({
    resolver: zodResolver(baSchema),
    defaultValues: {
      no_ba: '',
      no_kontrak: '',
      tanggal_ba: new Date().toISOString().split('T')[0],
      bulan_buku: previousMonthFrom(new Date().toISOString().split('T')[0]),
      volume_ba: 0,
      nama_unit: '',
      komoditi: '',
      deskripsi: '',
      link_berita_acara: '',
      status: 'Draft',
    },
  })

  const { register, handleSubmit, reset, setValue, watch, formState: { errors, isSubmitting } } = form
  const selectedKontrak = watch('no_kontrak')
  const tanggalBa = watch('tanggal_ba')
  const volumeBa = watch('volume_ba')

  useEffect(() => {
    kontrakStore.fetch()
    baStore.fetch()
  }, [])

  const payungKontraks = useMemo(
    () => kontrakStore.data.filter((k) => String(k.tipe_alur || 'STANDAR').toUpperCase() === 'PAYUNG_BA'),
    [kontrakStore.data],
  )

  const currentKontrak: Kontrak | undefined = useMemo(
    () => kontrakStore.data.find((k) => k.no_kontrak === selectedKontrak),
    [kontrakStore.data, selectedKontrak],
  )

  const usedVolume = useMemo(() => {
    if (!selectedKontrak) return 0
    return baStore.data
      .filter((b) => b.no_kontrak === selectedKontrak && b.no_ba !== watch('no_ba'))
      .reduce((sum, b) => sum + (b.volume_ba || 0), 0)
  }, [baStore.data, selectedKontrak, watch('no_ba')])

  const sisaKuota = Math.max(0, (currentKontrak?.volume || 0) - usedVolume)

  useEffect(() => {
    if (currentKontrak) {
      if (!watch('komoditi')) setValue('komoditi', currentKontrak.komoditi || '')
    }
  }, [currentKontrak])

  useEffect(() => {
    if (isExisting || !tanggalBa) return
    setValue('bulan_buku', previousMonthFrom(tanggalBa))
  }, [tanggalBa, isExisting, setValue])

  const autoLoadBA = async () => {
    const no = form.getValues('no_ba')
    if (!no) return
    const data = await baStore.fetchOne(no)
    if (data) {
      setIsExisting(true)
      setExportNo(no)
      setValue('no_kontrak', data.no_kontrak)
      setValue('tanggal_ba', data.tanggal_ba)
      setValue('bulan_buku', toMonthInput(data.bulan_buku || data.tanggal_ba))
      setValue('volume_ba', data.volume_ba)
      setValue('nama_unit', data.nama_unit || '')
      setValue('komoditi', data.komoditi || '')
      setValue('deskripsi', data.deskripsi || '')
      setValue('link_berita_acara', data.link_berita_acara || '')
      setValue('status', data.status || 'Draft')
    } else {
      setIsExisting(false)
      setExportNo(null)
    }
  }

  const onSubmit = async (data: BAFormData) => {
    try {
      const payload = {
        ...data,
        bulan_buku: `${data.bulan_buku}-01`,
      }
      if (!payload.nama_unit) delete payload.nama_unit
      if (!payload.deskripsi) delete payload.deskripsi
      if (!payload.link_berita_acara) delete payload.link_berita_acara
      await baStore.save(payload)
      setExportNo(data.no_ba)
      setIsExisting(true)
      addNotification('Berita Acara berhasil disimpan', 'success')
      baStore.fetch(data.no_kontrak)
    } catch (err: any) {
      addNotification(err.message || 'Gagal menyimpan BA', 'error')
    }
  }

  const handleReset = () => {
    reset()
    setIsExisting(false)
    setExportNo(null)
  }

  return (
    <div className="max-w-5xl mx-auto">
      <form onSubmit={handleSubmit(onSubmit)} className="space-y-6" autoComplete="off">
        <Card>
          <CardHeader className="pb-3">
            <CardTitle className="text-sm font-semibold flex items-center gap-2">
              <ClipboardList size={15} className="text-brand-600" />
              Pilih Berita Acara
            </CardTitle>
          </CardHeader>
          <CardContent className="grid grid-cols-2 gap-4">
            <div>
              <Label className="text-xs">No Kontrak Payung *</Label>
              <SearchableSelect
                options={payungKontraks.map((k) => ({
                  value: k.no_kontrak,
                  label: `${k.no_kontrak}${k.pembeli ? ' - ' + k.pembeli.split('\n')[0] : ''}`,
                }))}
                value={watch('no_kontrak')}
                onChange={(v) => setValue('no_kontrak', v, { shouldValidate: true })}
                placeholder="-- Pilih Kontrak PAYUNG_BA --"
              />
              {payungKontraks.length === 0 && (
                <p className="text-xs text-amber-600 mt-1">Belum ada kontrak dengan tipe alur Payung BA</p>
              )}
              {errors.no_kontrak && <p className="text-xs text-red-500 mt-1">{errors.no_kontrak.message}</p>}
            </div>
            <div>
              <Label className="text-xs">No Berita Acara *</Label>
              <SearchableSelect
                options={baStore.data.map((b) => ({
                  value: b.no_ba,
                  label: `${b.no_ba} — ${b.no_kontrak}`,
                }))}
                value={watch('no_ba')}
                allowCustom={canEdit()}
                onChange={(v) => setValue('no_ba', v, { shouldValidate: true })}
                onValueCommit={() => autoLoadBA()}
                placeholder="Ketik baru atau pilih dari daftar"
              />
              <p className="text-xs text-slate-400 mt-1">Daftar dari database. Pilih BA lama → data terisi otomatis.</p>
              {errors.no_ba && <p className="text-xs text-red-500 mt-1">{errors.no_ba.message}</p>}
            </div>
          </CardContent>
        </Card>

        <ReadOnlyFieldset className="space-y-6 block">
        <Card>
          <CardHeader className="pb-3">
            <CardTitle className="text-sm font-semibold">Data Berita Acara</CardTitle>
          </CardHeader>
          <CardContent className="grid grid-cols-2 gap-4">
            <div>
              <Label className="text-xs">Tanggal BA *</Label>
              <Input type="date" {...register('tanggal_ba')} />
              <p className="text-xs text-slate-400 mt-1">Tanggal dokumen akumulasi (bisa beda bulan dengan pembukuan)</p>
            </div>
            <div>
              <Label className="text-xs">Bulan Buku *</Label>
              <Input type="month" {...register('bulan_buku')} />
              <p className="text-xs text-slate-400 mt-1">Periode pembukuan transaksi — dipakai di Laporan Digital</p>
              {errors.bulan_buku && <p className="text-xs text-red-500 mt-1">{errors.bulan_buku.message}</p>}
            </div>
            <div>
              <Label className="text-xs">Volume BA *</Label>
              <Input type="number" step="any" {...register('volume_ba')} />
              {errors.volume_ba && <p className="text-xs text-red-500 mt-1">{errors.volume_ba.message}</p>}
            </div>
            <div>
              <Label className="text-xs">Unit</Label>
              <NativeSelect {...register('nama_unit')}>
                <option value="">-- Pilih Unit --</option>
                {FIXED_UNITS.map((u) => <option key={u} value={u}>{u}</option>)}
              </NativeSelect>
            </div>
            <div>
              <Label className="text-xs">Komoditi</Label>
              <Input {...register('komoditi')} />
            </div>
            <div className="col-span-2">
              <Label className="text-xs">Deskripsi</Label>
              <Textarea rows={2} {...register('deskripsi')} />
            </div>
            <div>
              <Label className="text-xs">Status</Label>
              <NativeSelect {...register('status')} disabled={isExisting}>
                <option value="Draft">Draft</option>
                <option value="Selesai">Selesai</option>
              </NativeSelect>
            </div>
            <div>
              <Label className="text-xs">Link BA (opsional)</Label>
              <Input {...register('link_berita_acara')} placeholder="https://..." />
            </div>
          </CardContent>
        </Card>

        {currentKontrak && (
          <Card>
            <CardHeader className="pb-3">
              <CardTitle className="text-sm font-semibold">
                {(currentKontrak.volume || 0) > 0 ? 'Kuota Volume Kontrak' : 'Volume Berita Acara'}
              </CardTitle>
            </CardHeader>
            <CardContent className="text-sm grid grid-cols-2 gap-2">
              {(currentKontrak.volume || 0) > 0 ? (
                <>
                  <span className="text-slate-500">Volume Kontrak:</span>
                  <span>{formatCurrency(currentKontrak.volume)} {currentKontrak.satuan}</span>
                  <span className="text-slate-500">Sudah di-BA:</span>
                  <span>{formatCurrency(usedVolume)} {currentKontrak.satuan}</span>
                  <span className="text-slate-500">Sisa Kuota:</span>
                  <span className={volumeBa > sisaKuota ? 'text-red-600 font-semibold' : 'text-brand-600 font-semibold'}>
                    {formatCurrency(sisaKuota)} {currentKontrak.satuan}
                  </span>
                </>
              ) : (
                <>
                  <span className="text-slate-500">Harga Satuan Kontrak:</span>
                  <span>{formatCurrency(currentKontrak.harga_satuan)} / {currentKontrak.satuan || 'Kg'}</span>
                  <span className="text-slate-500">Total sudah di-BA:</span>
                  <span>{formatCurrency(usedVolume)} {currentKontrak.satuan || 'Kg'}</span>
                  <span className="col-span-2 text-xs text-slate-500 pt-1">
                    Kontrak payung tanpa volume tetap — setiap pengiriman barang dicatat terpisah di BA.
                  </span>
                </>
              )}
            </CardContent>
          </Card>
        )}

        {exportNo && (
          <Card>
            <CardHeader className="pb-3">
              <CardTitle className="text-sm font-semibold">Upload Dokumen BA</CardTitle>
            </CardHeader>
            <CardContent>
              <DocumentUpload entityType="ba" entityId={exportNo} docType="berita_acara" />
            </CardContent>
          </Card>
        )}
        </ReadOnlyFieldset>

        <div className="flex gap-3">
          <Button type="submit" disabled={isSubmitting || !canEdit()}>
            <Save size={15} className="mr-1.5" />
            {isSubmitting ? 'Menyimpan...' : !canEdit() ? 'Read-Only (Tamu)' : 'Simpan BA'}
          </Button>
          <Button type="button" variant="outline" onClick={handleReset} disabled={!canEdit()}>
            <RotateCcw size={15} className="mr-1.5" />
            Reset
          </Button>
        </div>
      </form>
    </div>
  )
}