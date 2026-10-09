import { useEffect, useMemo, useState } from 'react'
import { useForm } from 'react-hook-form'
import { zodResolver } from '@hookform/resolvers/zod'
import { z } from 'zod'
import { ClipboardList, RotateCcw, Save } from 'lucide-react'
import { useBAStore } from '@/store/baStore'
import { useKontrakStore } from '@/store/kontrakStore'
import { useDOStore } from '@/store/doStore'
import { useInvoiceStore } from '@/store/invoiceStore'
import { useAppStore } from '@/store/appStore'
import { useAuthStore } from '@/store/authStore'
import { Button } from '@/components/ui/button'
import { Input } from '@/components/ui/input'
import { NativeSelect } from '@/components/ui/native-select'
import { Label } from '@/components/ui/label'
import { Card, CardContent, CardHeader, CardTitle } from '@/components/ui/card'
import { SearchableSelect } from '@/components/ui/searchable-select'
import { DocumentUpload } from '@/components/common/DocumentUpload'
import { ReadOnlyFieldset } from '@/components/common/ReadOnlyFieldset'
import { PageHeader, PageShell } from '@/components/patterns'
import { formatCurrency, formatNumber } from '@/lib/utils'
import { calculateBAInvoiceAmount } from '@/utils/baUtils'
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
  no_do: z.string().optional(),
  tanggal_ba: z.string().min(1, 'Tanggal BA wajib diisi'),
  bulan_buku: z.string().optional(),
  volume_ba: z.coerce.number().min(0.01, 'Volume harus > 0'),
  harga_satuan: z.coerce.number().min(0),
  nama_unit: z.string().optional(),
  komoditi: z.string().optional(),
  deskripsi: z.string().optional(),
  link_berita_acara: z.string().optional(),
  status: z.string().optional(),
})

type BAFormData = z.infer<typeof baSchema>

export default function BAPage() {
  const baStore = useBAStore()
  const kontrakStore = useKontrakStore()
  const doStore = useDOStore()
  const invoiceStore = useInvoiceStore()
  const { addNotification } = useAppStore()
  const canEdit = useAuthStore((s) => s.canEdit)
  const [isExisting, setIsExisting] = useState(false)
  const [exportNo, setExportNo] = useState<string | null>(null)
  const [tipeKontrak, setTipeKontrak] = useState<'STANDAR' | 'PAYUNG_BA'>('STANDAR')

  const form = useForm<BAFormData>({
    resolver: zodResolver(baSchema),
    defaultValues: {
      no_ba: '',
      no_kontrak: '',
      no_do: '',
      tanggal_ba: new Date().toISOString().split('T')[0],
      bulan_buku: previousMonthFrom(new Date().toISOString().split('T')[0]),
      volume_ba: 0,
      harga_satuan: 0,
      nama_unit: '',
      komoditi: '',
      deskripsi: '',
      link_berita_acara: '',
      status: 'Draft',
    },
  })

  const { register, handleSubmit, reset, setValue, watch, formState: { errors, isSubmitting } } = form
  const selectedKontrak = watch('no_kontrak')
  const selectedUnit = watch('nama_unit')
  const tanggalBa = watch('tanggal_ba')
  const volumeBa = watch('volume_ba')
  const hargaSatuan = watch('harga_satuan')
  const isPayungBA = tipeKontrak === 'PAYUNG_BA'

  useEffect(() => {
    kontrakStore.fetch()
    baStore.fetch()
    doStore.fetch()
    invoiceStore.fetch()
  }, [])

  const kontrakOptions = useMemo(
    () => kontrakStore.data
      .filter((k) => String(k.tipe_alur || 'STANDAR').toUpperCase() === tipeKontrak)
      .map((k) => ({
        value: k.no_kontrak,
        label: `${k.no_kontrak}${k.pembeli ? ' - ' + k.pembeli.split('\n')[0] : ''}`,
      })),
    [kontrakStore.data, tipeKontrak],
  )

  const baOptions = useMemo(
    () => baStore.data
      .filter((ba) => {
        const kontrak = kontrakStore.data.find((k) => k.no_kontrak === ba.no_kontrak)
        const tipe = String(kontrak?.tipe_alur || 'STANDAR').toUpperCase()
        return tipe === tipeKontrak && (!selectedKontrak || ba.no_kontrak === selectedKontrak)
      })
      .map((ba) => ({
        value: ba.no_ba,
        label: `${ba.no_ba} — ${ba.no_kontrak}`,
      })),
    [baStore.data, kontrakStore.data, selectedKontrak, tipeKontrak],
  )

  const currentKontrak: Kontrak | undefined = useMemo(
    () => kontrakStore.data.find((k) => k.no_kontrak === selectedKontrak),
    [kontrakStore.data, selectedKontrak],
  )
  const pickupDOOptions = useMemo(() => {
    const invoices = new Set(invoiceStore.data.filter(i => i.no_kontrak === selectedKontrak).map(i => i.no_invoice))
    return doStore.data.filter(d => invoices.has(d.no_invoice)).map(d => ({
      value: d.no_do,
      label: `${d.no_do} — Invoice ${d.no_invoice} — ${formatNumber(d.volume_do)} ${currentKontrak?.satuan || 'Kg'}`,
    }))
  }, [doStore.data, invoiceStore.data, selectedKontrak, currentKontrak])

  const unitOptions = useMemo(
    () => (currentKontrak?.units || [])
      .map((unit) => unit.nama_unit)
      .filter((unit): unit is string => Boolean(unit)),
    [currentKontrak],
  )
  const perluPilihUnit = isPayungBA && unitOptions.length > 1
  const currentKontrakUnit = useMemo(
    () => currentKontrak?.units?.find((unit) => unit.nama_unit === selectedUnit),
    [currentKontrak, selectedUnit],
  )
  const infoUnit = selectedUnit || currentKontrak?.kebun_produsen || unitOptions[0] || ''
  const infoKomoditi = currentKontrakUnit?.jenis_komoditi || currentKontrakUnit?.komoditi || currentKontrak?.jenis_komoditi || currentKontrak?.komoditi || ''
  const infoDeskripsi = currentKontrak?.deskripsi_produk || infoKomoditi

  const usedVolume = useMemo(() => {
    if (!selectedKontrak) return 0
    return baStore.data
      .filter((b) => b.no_kontrak === selectedKontrak && b.no_ba !== watch('no_ba'))
      .reduce((sum, b) => sum + (b.volume_ba || 0), 0)
  }, [baStore.data, selectedKontrak, watch('no_ba')])

  const sisaKuota = Math.max(0, (currentKontrak?.volume || 0) - usedVolume)

  const nilaiBA = useMemo(() => {
    if (!currentKontrak || volumeBa <= 0 || hargaSatuan <= 0) return 0
    return calculateBAInvoiceAmount(
      volumeBa,
      hargaSatuan,
      currentKontrak.is_ppn || 'true',
      currentKontrak.ppn_persen || 11,
    )
  }, [currentKontrak, volumeBa, hargaSatuan])

  useEffect(() => {
    if (currentKontrak) {
      const defaultUnit = currentKontrak.kebun_produsen || unitOptions[0] || ''
      if (!selectedUnit && defaultUnit) setValue('nama_unit', defaultUnit)
      if (!isExisting) {
        setValue('komoditi', infoKomoditi)
        setValue('deskripsi', infoDeskripsi)
      }
      if (!watch('harga_satuan') && currentKontrak.harga_satuan) {
        setValue('harga_satuan', currentKontrak.harga_satuan)
      }
    }
  }, [currentKontrak, infoDeskripsi, infoKomoditi, isExisting, selectedUnit, setValue, unitOptions])

  useEffect(() => {
    if (isExisting || !isPayungBA || !tanggalBa) return
    setValue('bulan_buku', previousMonthFrom(tanggalBa))
  }, [tanggalBa, isExisting, isPayungBA, setValue])

  const autoLoadBA = async () => {
    const no = form.getValues('no_ba')
    if (!no) return
    const data = await baStore.fetchOne(no)
    if (data) {
      setIsExisting(true)
      setExportNo(no)
      setValue('no_kontrak', data.no_kontrak)
      setValue('no_do', data.no_do || '')
      const kontrakBA = kontrakStore.data.find((k) => k.no_kontrak === data.no_kontrak)
      setTipeKontrak(String(kontrakBA?.tipe_alur || 'STANDAR').toUpperCase() === 'PAYUNG_BA' ? 'PAYUNG_BA' : 'STANDAR')
      setValue('tanggal_ba', data.tanggal_ba)
      setValue('bulan_buku', toMonthInput(data.bulan_buku || ''))
      setValue('volume_ba', data.volume_ba)
      setValue('harga_satuan', data.harga_satuan || 0)
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
      if (isPayungBA && (!data.harga_satuan || data.harga_satuan <= 0)) {
        addNotification('Harga satuan BA wajib diisi untuk kontrak payung', 'error')
        return
      }
      const payload: any = { ...data }
      payload.bulan_buku = data.tanggal_ba
      payload.no_do = isPayungBA ? null : data.no_do || null
      if (!payload.nama_unit) delete payload.nama_unit
      if (!payload.deskripsi) delete payload.deskripsi
      if (!payload.link_berita_acara) delete payload.link_berita_acara
      const savedBA = await baStore.save(payload)
      setValue('no_do', savedBA.no_do || '')
      setValue('status', savedBA.status)
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
    setTipeKontrak('STANDAR')
  }

  const selectTab = (next: 'STANDAR' | 'PAYUNG_BA') => {
    if (next === tipeKontrak) return
    setTipeKontrak(next)
    setValue('no_kontrak', '')
    setValue('no_ba', '')
    setIsExisting(false)
    setExportNo(null)
  }

  return (
    <PageShell width="narrow">
      <PageHeader
        title="BA Pengambilan"
        description="Normal: BA terhubung ke DO. Payung: BA menjadi dasar invoice, lalu diwarisi DO."
      />
      <form onSubmit={handleSubmit((data) => onSubmit({ ...data, status: data.status === 'Ter-invoice' ? data.status : 'Selesai' }))} className="space-y-6" autoComplete="off">
        <Card>
          <CardHeader className="pb-3">
            <CardTitle className="text-sm font-semibold flex items-center gap-2">
              <ClipboardList size={15} className="text-brand-600" />
              Pilih Alur BA
            </CardTitle>
          </CardHeader>
          <CardContent className="space-y-4">
            <div className="grid grid-cols-2 rounded-lg border border-border p-1 bg-muted/40">
              <button
                type="button"
                onClick={() => selectTab('STANDAR')}
                className={`rounded-md px-3 py-2 text-sm font-medium transition-colors ${!isPayungBA ? 'bg-emerald-600 text-white shadow-sm hover:bg-emerald-700' : 'text-muted-foreground hover:text-foreground'}`}
              >
                Kontrak Normal
              </button>
              <button
                type="button"
                onClick={() => selectTab('PAYUNG_BA')}
                className={`rounded-md px-3 py-2 text-sm font-medium transition-colors ${isPayungBA ? 'bg-emerald-600 text-white shadow-sm hover:bg-emerald-700' : 'text-muted-foreground hover:text-foreground'}`}
              >
                Kontrak Payung
              </button>
            </div>
            <p className="text-xs text-slate-500">
              {isPayungBA
                ? 'BA menjadi dasar volume, harga, dan invoice kontrak payung.'
                : 'BA mencatat realisasi pengambilan dan ditautkan ke DO. Setiap BA selesai masuk laporan sesuai tanggal BA; Draft belum dihitung sebagai pengambilan.'}
            </p>
            <div className="grid grid-cols-2 gap-4">
            <div>
              <Label className="text-xs">No Kontrak *</Label>
              <SearchableSelect
                options={kontrakOptions}
                value={watch('no_kontrak')}
                onChange={(v) => setValue('no_kontrak', v, { shouldValidate: true })}
                placeholder={`-- Pilih Kontrak ${isPayungBA ? 'Payung' : 'Normal'} --`}
              />
              {kontrakOptions.length === 0 && (
                <p className="text-xs text-amber-600 mt-1">Belum ada kontrak yang dapat dipilih</p>
              )}
              {errors.no_kontrak && <p className="text-xs text-red-500 mt-1">{errors.no_kontrak.message}</p>}
            </div>
            <div>
              <Label className="text-xs">No Berita Acara *</Label>
              <SearchableSelect
                options={baOptions}
                value={watch('no_ba')}
                allowCustom={canEdit()}
                onChange={(v) => setValue('no_ba', v, { shouldValidate: true })}
                onValueCommit={() => autoLoadBA()}
                placeholder="Ketik baru atau pilih dari daftar"
              />
              <p className="text-xs text-slate-400 mt-1">Daftar dari database. Pilih BA lama → data terisi otomatis.</p>
              {errors.no_ba && <p className="text-xs text-red-500 mt-1">{errors.no_ba.message}</p>}
            </div>
            </div>
          </CardContent>
        </Card>

        <ReadOnlyFieldset className="space-y-6 block">
        <Card>
          <CardHeader className="pb-3">
            <CardTitle className="text-sm font-semibold">Data Berita Acara</CardTitle>
          </CardHeader>
          <CardContent className="grid grid-cols-2 gap-4">
            {!isPayungBA && <div className="col-span-2">
              <Label className="text-xs">DO Pengambilan</Label>
              <SearchableSelect value={watch('no_do') || ''} onChange={v => setValue('no_do', v)} options={pickupDOOptions} placeholder="Pilih DO · otomatis jika hanya satu kandidat sesuai" />
              <p className="text-xs text-muted-foreground mt-1">Pilih DO untuk menghubungkan BA lama atau pengambilan bertahap. Realisasi wajib memiliki DO yang sesuai.</p>
            </div>}
            <div className="col-span-2 text-xs text-muted-foreground">Status: {watch('status') || 'Draft'} · Draft belum dihitung sebagai pengambilan.</div>
            <div className={!isPayungBA ? 'col-span-2' : ''}>
              <Label className="text-xs">Tanggal BA *</Label>
              <Input type="date" {...register('tanggal_ba')} />
              <p className="text-xs text-slate-400 mt-1">
                Tanggal realisasi pengambilan; otomatis menjadi tanggal acuan laporan.
              </p>
            </div>
            <div>
              <Label className="text-xs">{isPayungBA ? 'Volume BA *' : `Kuantitas Pengambilan (${currentKontrak?.satuan || 'Kg'}) *`}</Label>
              <Input type="number" step="any" {...register('volume_ba')} />
              {errors.volume_ba && <p className="text-xs text-red-500 mt-1">{errors.volume_ba.message}</p>}
            </div>
            {isPayungBA && (
              <>
                <div>
                  <Label className="text-xs">Harga Satuan (saat transaksi) *</Label>
                  <Input type="number" step="any" {...register('harga_satuan')} />
                  <p className="text-xs text-slate-400 mt-1">Harga komoditi berlaku pada pengiriman ini — tidak disimpan di kontrak payung.</p>
                  {errors.harga_satuan && <p className="text-xs text-red-500 mt-1">{errors.harga_satuan.message}</p>}
                </div>
                {perluPilihUnit && (
                <div>
                  <Label className="text-xs">Unit Pengambilan *</Label>
                  <NativeSelect {...register('nama_unit')}>
                    <option value="">-- Pilih Unit --</option>
                    {unitOptions.map((unit) => <option key={unit} value={unit}>{unit}</option>)}
                  </NativeSelect>
                </div>
                )}
              </>
            )}
          </CardContent>
        </Card>

        {currentKontrak && (
          <Card>
            <CardHeader className="pb-3">
              <CardTitle className="text-sm font-semibold">
                {isPayungBA ? 'Volume Berita Acara Payung' : 'Realisasi Pengambilan Kontrak Normal'}
              </CardTitle>
            </CardHeader>
            <CardContent className="text-sm grid grid-cols-2 gap-2">
              {!isPayungBA ? (
                <>
                  <span className="text-slate-500">Volume Kontrak:</span>
                  <span>{formatCurrency(currentKontrak.volume)} {currentKontrak.satuan}</span>
                  <span className="text-slate-500">Unit:</span>
                  <span>{currentKontrak.kebun_produsen || '—'}</span>
                  <span className="text-slate-500">Komoditi:</span>
                  <span>{currentKontrak.jenis_komoditi || currentKontrak.komoditi || '—'}</span>
                  <span className="text-slate-500">Harga Kontrak:</span>
                  <span>{currentKontrak.harga_satuan ? `${formatCurrency(currentKontrak.harga_satuan)} / ${currentKontrak.satuan || 'Kg'}` : '—'}</span>
                  <span className="text-slate-500">Sudah di-BA:</span>
                  <span>{formatCurrency(usedVolume)} {currentKontrak.satuan}</span>
                  <span className="text-slate-500">Sisa Kuota:</span>
                  <span className={volumeBa > sisaKuota ? 'text-red-600 font-semibold' : 'text-brand-600 font-semibold'}>
                    {formatCurrency(sisaKuota)} {currentKontrak.satuan}
                  </span>
                  <span className="col-span-2 text-xs text-slate-500 pt-1">
                    Simpan Realisasi untuk menghitung pengambilan pada DO terkait. Satu DO dapat memiliki beberapa BA.
                  </span>
                </>
              ) : (
                <>
                  <span className="text-slate-500">Harga Satuan (form):</span>
                  <span>{hargaSatuan > 0 ? `${formatCurrency(hargaSatuan)} / ${currentKontrak.satuan || 'Kg'}` : '—'}</span>
                  <span className="text-slate-500">Unit:</span>
                  <span>{infoUnit || '—'}</span>
                  <span className="text-slate-500">Komoditi:</span>
                  <span>{infoKomoditi || '—'}</span>
                  <span className="text-slate-500">Nilai Invoice (estimasi):</span>
                  <span className="font-semibold text-brand-600">{nilaiBA > 0 ? formatCurrency(nilaiBA) : '—'}</span>
                  <span className="text-slate-500">Total sudah di-BA:</span>
                  <span>{formatCurrency(usedVolume)} {currentKontrak.satuan || 'Kg'}</span>
                  <span className="col-span-2 text-xs text-slate-500 pt-1">
                    Kontrak payung tanpa harga tetap — volume dan harga dicatat per Berita Acara.
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
              <DocumentUpload
                entityType="ba"
                entityId={exportNo}
                docType="berita_acara"
                label="Dokumen Berita Acara"
              />
            </CardContent>
          </Card>
        )}
        </ReadOnlyFieldset>

        <div className="flex gap-3">
          <Button type="submit" disabled={isSubmitting || !canEdit() || watch('status') === 'Ter-invoice'}>
            <Save size={15} className="mr-1.5" />
            {isSubmitting ? 'Menyimpan...' : !canEdit() ? 'Read-Only (Tamu)' : 'Simpan Realisasi'}
          </Button>
          <Button type="button" variant="outline" onClick={handleSubmit((data) => onSubmit({ ...data, status: 'Draft' }))} disabled={isSubmitting || !canEdit() || watch('status') === 'Ter-invoice'}>Simpan Draft</Button>
          <Button type="button" variant="outline" onClick={handleReset} disabled={!canEdit()}>
            <RotateCcw size={15} className="mr-1.5" />
            Reset
          </Button>
        </div>
      </form>
    </PageShell>
  )
}
