import { useEffect, useState, useCallback, useRef } from 'react'
import { useSearchParams } from 'react-router-dom'
import { useForm, Controller } from 'react-hook-form'
import { zodResolver } from '@hookform/resolvers/zod'
import { z } from 'zod'
import { FileDown, RotateCcw, Plus, X } from 'lucide-react'
import { useKontrakStore } from '@/store/kontrakStore'
import { useAppStore } from '@/store/appStore'
import { useAuthStore } from '@/store/authStore'
import { Button } from '@/components/ui/button'
import { Input } from '@/components/ui/input'
import { NativeSelect } from '@/components/ui/native-select'
import { Label } from '@/components/ui/label'
import { PreviewPanel } from '@/components/common/PreviewPanel'
import { FormStepper, FormStepActions, type FormStep } from '@/components/common/FormStepper'
import { Card, CardContent, CardHeader, CardTitle } from '@/components/ui/card'
import { Textarea } from '@/components/ui/textarea'
import { KontrakPreview } from '@/components/feature/KontrakPreview'
import { DocumentUpload } from '@/components/common/DocumentUpload'
import { ReadOnlyFieldset } from '@/components/common/ReadOnlyFieldset'
import { SearchableSelect } from '@/components/ui/searchable-select'

import { formatCurrency, formatDate } from '@/lib/utils'
import { terbilangRupiah } from '@/utils/terbilang'
import {
  calculateKontrakPricing,
  calculateJatuhTempo,
  generateSyaratSyarat,
  isPayungBA,
  DEFAULT_SYARAT,
  DEFAULT_KETENTUAN,
  materialOptionsForUnit,
  syncKontrakFieldsFromUnits,
  type UnitRow,
} from '@/utils/kontrakUtils'

const KONTRAK_STEPS: FormStep[] = [
  { id: 'identitas', label: 'Identitas', description: 'Data dasar & pihak' },
  { id: 'komoditas', label: 'Komoditas', description: 'Barang & produksi' },
  { id: 'finalisasi', label: 'Finalisasi', description: 'Nilai, bayar & syarat' },
]

const FIXED_UNITS = [
  'Minahasa-Halmahera',
  'Beteleme',
  'Awaya-Telpaputih',
  'Takalar',
  'Camming',
  'Kabaru',
]

const kontrakSchema = z.object({
  no_kontrak: z.string().min(1, 'No Kontrak wajib diisi'),
  tanggal_kontrak: z.string().min(1, 'Tanggal wajib diisi'),
  lokasi: z.string().optional(),
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
  tipe_alur: z.string().optional(),
})

type KontrakFormData = z.infer<typeof kontrakSchema>

export default function KontrakPage() {
  const kontrakList = useKontrakStore((s) => s.data)
  const fetchKontraks = useKontrakStore((s) => s.fetch)
  const fetchOneKontrak = useKontrakStore((s) => s.fetchOne)
  const saveKontrak = useKontrakStore((s) => s.save)
  const { addNotification } = useAppStore()
  const canEdit = useAuthStore((s) => s.canEdit)
  const [isExisting, setIsExisting] = useState(false)
  const [previewData, setPreviewData] = useState<Partial<KontrakFormData>>({})
  const [exportNo, setExportNo] = useState<string | null>(null)
  const emptyUnit = (): UnitRow => ({
    nama_unit: '', volume: 0, komoditi: '', jenis_komoditi: '', satuan: 'Kg', tahun_panen: '', deskripsi_produk: '',
  })
  const [unitList, setUnitList] = useState<UnitRow[]>([emptyUnit()])
  const [activeStep, setActiveStep] = useState(0)
  const lastFetchedNo = useRef<string | null>(null)
  const editLoadedRef = useRef<string | null>(null)
  const unitsDirtyRef = useRef(false)

  const patchUnitList = useCallback((updater: UnitRow[] | ((prev: UnitRow[]) => UnitRow[])) => {
    unitsDirtyRef.current = true
    setUnitList(updater)
  }, [])

  const form = useForm<KontrakFormData>({
    resolver: zodResolver(kontrakSchema),
    defaultValues: {
      no_kontrak: '',
      tanggal_kontrak: new Date().toISOString().split('T')[0],
      lokasi: 'Makassar',
      tipe_alur: 'STANDAR',
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

  const { register, handleSubmit, reset, setValue, watch, getValues, trigger, formState: { errors, isSubmitting } } = form

  // Watch all fields for live preview
  const watchedFields = watch()
  const payungMode = isPayungBA(watchedFields.tipe_alur)

  const pricing = calculateKontrakPricing(
    payungMode ? 0 : (Number(watchedFields.volume) || 0),
    Number(watchedFields.harga_satuan) || 0,
    Number(watchedFields.premi) || 0,
    watchedFields.is_ppn || 'true',
    Number(watchedFields.ppn_persen) || 11,
    watchedFields.is_pph || 'false',
    Number(watchedFields.pph_persen) || 0,
  )

  const jatuhTempo = calculateJatuhTempo(watchedFields.tanggal_kontrak || '', Number(watchedFields.lama_pembayaran_hari) || 15)

  const loadKontrakByNo = useCallback(async (no: string, force = false) => {
    const trimmed = no?.trim()
    if (!trimmed) return
    if (!force && unitsDirtyRef.current) return

    const data = await fetchOneKontrak(trimmed)
    if (data) {
      unitsDirtyRef.current = false
      setIsExisting(true)
      setExportNo(trimmed)
      const fields: (keyof KontrakFormData)[] = [
        'no_kontrak', 'tanggal_kontrak', 'lokasi', 'tipe_alur', 'pembeli',
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
      // Load units — fallback ke kebun_produsen jika belum ada units
      // Fallback material fields dari kontrak-level jika unit tidak punya
      const fbKomoditi = data.komoditi || ''
      const fbJenis = data.jenis_komoditi || ''
      const fbSatuan = data.satuan || 'Kg'
      const fbTahun = data.tahun_panen || ''
      const fbDeskripsi = data.deskripsi_produk || ''
      const loadedPayung = isPayungBA(data.tipe_alur)
      if (loadedPayung) {
        setValue('volume', 0)
      }
      if (data.units && data.units.length > 0) {
        setUnitList(data.units.map(u => ({
          nama_unit: u.nama_unit,
          volume: loadedPayung ? 0 : (u.volume || 0),
          komoditi: u.komoditi || fbKomoditi,
          jenis_komoditi: u.jenis_komoditi || fbJenis,
          satuan: u.satuan || fbSatuan,
          tahun_panen: u.tahun_panen || fbTahun,
          deskripsi_produk: u.deskripsi_produk || fbDeskripsi,
        })))
      } else if (data.kebun_produsen || fbKomoditi || fbJenis) {
        setUnitList([{
          nama_unit: data.kebun_produsen || '',
          volume: loadedPayung ? 0 : (data.volume || 0),
          komoditi: fbKomoditi,
          jenis_komoditi: fbJenis,
          satuan: fbSatuan,
          tahun_panen: fbTahun,
          deskripsi_produk: fbDeskripsi,
        }])
      } else {
        setUnitList([emptyUnit()])
      }
    } else {
      setIsExisting(false)
      setExportNo(null)
    }
  }, [fetchOneKontrak, setValue])

  const selectedNoKontrak = watch('no_kontrak')

  useEffect(() => {
    fetchKontraks()
  }, [fetchKontraks])

  useEffect(() => {
    const no = selectedNoKontrak?.trim()
    if (!no) {
      setIsExisting(false)
      setExportNo(null)
      lastFetchedNo.current = null
      return
    }
    if (lastFetchedNo.current === no) return
    if (kontrakList.length === 0) return
    if (!kontrakList.some((k) => k.no_kontrak === no)) {
      setIsExisting(false)
      setExportNo(null)
      lastFetchedNo.current = null
      return
    }
    lastFetchedNo.current = no
    loadKontrakByNo(no)
  }, [selectedNoKontrak, kontrakList.length, loadKontrakByNo])

  useEffect(() => {
    const patch = syncKontrakFieldsFromUnits(unitList, payungMode)
    for (const [key, val] of Object.entries(patch)) {
      if (val !== undefined) setValue(key as keyof KontrakFormData, val as never)
    }
  }, [unitList, payungMode, setValue])

  // Kontrak payung: volume & harga hanya di Berita Acara, bukan di kontrak
  useEffect(() => {
    if (!payungMode) return
    setValue('volume', 0)
    setValue('premi', 0)
    setValue('harga_satuan', 0)
    setUnitList((prev) => prev.map((u) => ({ ...u, volume: 0 })))
  }, [payungMode, setValue])

  // Reset everything
  const handleReset = () => {
    reset()
    setActiveStep(0)
    setIsExisting(false)
    setExportNo(null)
    setUnitList([emptyUnit()])
    lastFetchedNo.current = null
    editLoadedRef.current = null
    unitsDirtyRef.current = false
  }

  // Submit
  const onSubmit = async (data: KontrakFormData) => {
    try {
      const payload: any = { ...data, status: 'Active' }
      // Include default fields
      if (!data.syarat_syarat) {
        payload.syarat_syarat = generateSyaratSyarat(data.lama_pembayaran_hari || 15, data.penyerahan_hari || 15)
      }
      payload.pembayaran_atas_nama = 'PT Perkebunan Nusantara I Regional 8'
      payload.pembayaran_rek_no = 'No. 0050-01-005356-30-0'
      const validUnits = unitList.filter(u => u.nama_unit.trim())
      payload.units = validUnits.map(u => ({
        nama_unit: u.nama_unit,
        volume: u.volume || 0,
        komoditi: u.komoditi || undefined,
        jenis_komoditi: u.jenis_komoditi || undefined,
        satuan: u.satuan || undefined,
        tahun_panen: u.tahun_panen || undefined,
        deskripsi_produk: u.deskripsi_produk || undefined,
      }))
      // Sync kontrak-level material dari unit pertama (selalu dari unit, bukan field form lama)
      if (validUnits.length > 0) {
        const first = validUnits[0]
        payload.komoditi = first.komoditi || payload.komoditi
        payload.jenis_komoditi = first.jenis_komoditi || payload.jenis_komoditi
        payload.satuan = first.satuan || payload.satuan
        payload.tahun_panen = first.tahun_panen || payload.tahun_panen
        payload.deskripsi_produk = first.deskripsi_produk || first.jenis_komoditi || payload.deskripsi_produk
        payload.kebun_produsen = validUnits.map((u) => u.nama_unit).join(', ')
      }
      if (isPayungBA(data.tipe_alur)) {
        payload.volume = 0
        payload.premi = 0
        payload.harga_satuan = 0
        payload.units = validUnits.map((u) => ({ ...u, volume: 0 }))
      } else if (validUnits.length > 0 && validUnits.every(u => (u.volume || 0) > 0)) {
        payload.volume = validUnits.reduce((s, u) => s + (u.volume || 0), 0)
      }

      await saveKontrak(payload)
      unitsDirtyRef.current = false
      lastFetchedNo.current = null
      await loadKontrakByNo(data.no_kontrak, true)
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
    if (!editNo) {
      editLoadedRef.current = null
      return
    }
    if (editLoadedRef.current === editNo) return
    editLoadedRef.current = editNo
    setValue('no_kontrak', editNo)
    lastFetchedNo.current = editNo
    unitsDirtyRef.current = false
    loadKontrakByNo(editNo, true)
    setActiveStep(0)
  }, [editNo, setValue, loadKontrakByNo])

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

  const validateStep = async (step: number): Promise<boolean> => {
    if (step === 0) {
      return trigger(['no_kontrak', 'tanggal_kontrak', 'pembeli'])
    }
    if (step === 2) {
      if (payungMode) return true
      return trigger(['volume', 'harga_satuan'])
    }
    return true
  }

  const handleNextStep = async () => {
    const ok = await validateStep(activeStep)
    if (!ok) return
    // Tunda ganti step agar tombol Lanjut tidak langsung diganti Submit pada klik yang sama
    // (klik bisa "menetes" ke tombol submit baru dan memicu simpan prematur).
    window.setTimeout(() => {
      setActiveStep((s) => Math.min(s + 1, KONTRAK_STEPS.length - 1))
    }, 0)
  }

  const handleFormSubmit = handleSubmit(async (data) => {
    if (activeStep !== KONTRAK_STEPS.length - 1) return
    await onSubmit(data)
  })

  const handleBackStep = () => setActiveStep((s) => Math.max(s - 1, 0))

  return (
    <div className="flex flex-col lg:flex-row gap-6">
      {/* Left: Form */}
      <div className="flex-1 min-w-0">
        <FormStepper
          steps={KONTRAK_STEPS}
          activeStep={activeStep}
          onStepClick={(i) => { if (i <= activeStep) setActiveStep(i) }}
        />
        <form
          onSubmit={handleFormSubmit}
          onKeyDown={(e) => {
            if (e.key === 'Enter' && activeStep !== KONTRAK_STEPS.length - 1) {
              const tag = (e.target as HTMLElement).tagName
              if (tag === 'INPUT' || tag === 'TEXTAREA' || tag === 'SELECT') {
                e.preventDefault()
              }
            }
          }}
          className="space-y-6"
          autoComplete="off"
        >
          {activeStep === 0 && (
          <Card>
            <CardHeader className="pb-3">
              <CardTitle className="text-sm font-semibold">Pilih Kontrak</CardTitle>
            </CardHeader>
            <CardContent>
              <Label className="text-xs">No Kontrak *</Label>
              <SearchableSelect
                options={kontrakList.map((k) => ({
                  value: k.no_kontrak,
                  label: `${k.no_kontrak}${k.pembeli ? ' - ' + k.pembeli.split('\n')[0] : ''}`,
                }))}
                value={selectedNoKontrak || ''}
                allowCustom={canEdit()}
                onChange={(v) => setValue('no_kontrak', v, { shouldValidate: true })}
                onValueCommit={(v) => {
                  if (v && kontrakList.some((k) => k.no_kontrak === v)) {
                    unitsDirtyRef.current = false
                    lastFetchedNo.current = v
                    editLoadedRef.current = null
                    loadKontrakByNo(v, true)
                  }
                }}
                placeholder="Ketik baru atau pilih dari daftar"
              />
              <p className="text-xs text-slate-400 mt-1">
                Daftar dari database. Pilih → data terisi otomatis. Nomor baru → buat kontrak baru.
              </p>
              {errors.no_kontrak && <p className="text-xs text-red-500 mt-1">{errors.no_kontrak.message}</p>}
            </CardContent>
          </Card>
          )}

          <ReadOnlyFieldset className="space-y-6 block">
          {activeStep === 0 && (
          <>
          {/* Data Dasar */}
          <Card>
            <CardHeader className="pb-3">
              <CardTitle className="text-sm font-semibold">Data Dasar</CardTitle>
            </CardHeader>
            <CardContent className="grid grid-cols-3 gap-4">
              <div>
                <Label className="text-xs">Tanggal *</Label>
                <Input type="date" {...register('tanggal_kontrak')} />
              </div>
              <div>
                <Label className="text-xs">Tipe Alur</Label>
                <NativeSelect {...register('tipe_alur')}>
                  <option value="STANDAR">Standar (Invoice → DO)</option>
                  <option value="PAYUNG_BA">Payung + Berita Acara</option>
                </NativeSelect>
                {payungMode && (
                  <p className="text-xs text-amber-700 mt-1">
                    Kontrak payung tidak memuat volume — volume dicatat per Berita Acara saat barang dikirim.
                  </p>
                )}
              </div>
              <div>
                <Label className="text-xs">Lokasi</Label>
                <Input {...register('lokasi')}  />
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
                <Input {...register('pembeli')}  />
                {errors.pembeli && <p className="text-xs text-red-500 mt-1">{errors.pembeli.message}</p>}
              </div>
              <div>
                <Label className="text-xs">Nama Direktur</Label>
                <Input {...register('nama_direktur')}  />
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
                <Input {...register('pemilik_komoditas')}  />
              </div>
              <div>
                <Label className="text-xs">No. Reff</Label>
                <Input {...register('no_reff')}  />
              </div>
            </CardContent>
          </Card>
          </>
          )}

          {activeStep === 1 && (
          <Card>
            <CardHeader className="pb-3">
              <CardTitle className="text-sm font-semibold">Data Barang & Produksi</CardTitle>
            </CardHeader>
            <CardContent className="space-y-3">
              <div>
                <Label className="text-xs">Unit / Kebun Produsen & Material</Label>
                <div className="space-y-2 mt-1">
                  {unitList.map((unit, i) => {
                    const isLainnya = unit.nama_unit !== '' && !FIXED_UNITS.includes(unit.nama_unit)
                    const selectValue = isLainnya ? '__lainnya__' : unit.nama_unit
                    const sel = 'text-xs'
                    return (
                      <div key={i} className="border rounded-lg p-2 space-y-2 bg-slate-50/50">
                        {/* Row 1: Material fields */}
                        <div className="flex gap-2 items-center">
                          <Input
                            value={unit.komoditi}
                            onChange={e => {
                              const next = [...unitList]
                              next[i] = { ...next[i], komoditi: e.target.value }
                              patchUnitList(next)
                            }}
                            className={`${sel} w-28 shrink-0`}
                            placeholder="Komoditi"
                          />
                          <NativeSelect
                            value={unit.jenis_komoditi}
                            onChange={e => {
                              const next = [...unitList]
                              next[i] = { ...next[i], jenis_komoditi: e.target.value }
                              patchUnitList(next)
                            }}
                            className={`${sel} min-w-[12rem] flex-1 shrink-0`}
                          >
                            <option value="">-- Jenis Material --</option>
                            {materialOptionsForUnit(unit.jenis_komoditi).map((m) => (
                              <option key={m} value={m}>{m}</option>
                            ))}
                          </NativeSelect>
                          <NativeSelect
                            value={unit.satuan}
                            onChange={e => {
                              const next = [...unitList]
                              next[i] = { ...next[i], satuan: e.target.value }
                              patchUnitList(next)
                            }}
                            className={`${sel} w-20 shrink-0`}
                          >
                            <option value="Kg">Kg</option>
                            <option value="Butir">Butir</option>
                          </NativeSelect>
                          <Input
                            value={unit.tahun_panen}
                            onChange={e => {
                              const next = [...unitList]
                              next[i] = { ...next[i], tahun_panen: e.target.value }
                              patchUnitList(next)
                            }}
                            className={`${sel} w-24 shrink-0`}
                            placeholder="Thn Panen"
                          />
                          <Input
                            value={unit.deskripsi_produk}
                            onChange={e => {
                              const next = [...unitList]
                              next[i] = { ...next[i], deskripsi_produk: e.target.value }
                              patchUnitList(next)
                            }}
                            className={`${sel} flex-1 min-w-0`}
                            placeholder="Deskripsi"
                          />
                        </div>
                        {/* Row 2: Unit + Volume */}
                        <div className="flex gap-2 items-center">
                          <NativeSelect
                            value={selectValue}
                            onChange={e => {
                              const next = [...unitList]
                              if (e.target.value === '__lainnya__') {
                                next[i] = { ...next[i], nama_unit: '' }
                              } else {
                                next[i] = { ...next[i], nama_unit: e.target.value }
                              }
                              patchUnitList(next)
                            }}
                            className={`${sel} flex-1 min-w-0`}
                          >
                            <option value="">Unit Produksi</option>
                            {FIXED_UNITS.map(u => <option key={u} value={u}>{u}</option>)}
                            <option value="__lainnya__">Lainnya (isi manual)</option>
                          </NativeSelect>
                          {(selectValue === '__lainnya__' || isLainnya) && (
                            <Input
                              value={unit.nama_unit}
                              onChange={e => {
                                const next = [...unitList]
                                next[i] = { ...next[i], nama_unit: e.target.value }
                                patchUnitList(next)
                              }}
                              className={`${sel} flex-1 min-w-0`}
                              placeholder="Nama unit..."
                            />
                          )}
                          {!payungMode && (
                          <Input
                            type="number"
                            step="any"
                            value={unit.volume || ''}
                            onChange={e => {
                              const next = [...unitList]
                              next[i] = { ...next[i], volume: parseFloat(e.target.value) || 0 }
                              patchUnitList(next)
                            }}
                            className={`${sel} w-32 shrink-0`}
                            placeholder="Volume"
                          />
                          )}
                          {unitList.length > 1 && (
                            <Button
                              type="button"
                              variant="ghost"
                              size="icon"
                              className="h-9 w-9 shrink-0 text-slate-400 hover:text-red-500"
                              onClick={() => patchUnitList(unitList.filter((_, j) => j !== i))}
                            >
                              <X size={14} />
                            </Button>
                          )}
                        </div>
                      </div>
                    )
                  })}
                  <div className="flex items-center justify-between">
                    <Button
                      type="button"
                      variant="outline"
                      size="sm"
                      className="gap-1 text-xs"
                      onClick={() => patchUnitList([...unitList, emptyUnit()])}
                    >
                      <Plus size={12} />
                      Tambah Unit
                    </Button>
                    {unitList.filter(u => u.nama_unit.trim() && (u.volume || 0) > 0).length > 0 && (
                      <span className="text-xs text-slate-500">
                        Total: {unitList.filter(u => u.nama_unit.trim()).reduce((s, u) => s + (u.volume || 0), 0).toLocaleString('id-ID')} {unitList.filter(u => u.nama_unit.trim()).length > 0 ? (unitList.filter(u => u.nama_unit.trim())[0]?.satuan || 'Kg') : 'Kg'}
                      </span>
                    )}
                  </div>
                </div>
              </div>
              {/* Remaining fields */}
              <div className="grid grid-cols-3 gap-4">
                <div><Label className="text-xs">Mutu</Label><Input {...register('mutu')}  /></div>
                <div><Label className="text-xs">Packaging</Label><Input {...register('packaging')}  /></div>
                <div><Label className="text-xs">Simbol</Label><Input {...register('simbol')}  /></div>
                <div><Label className="text-xs">Pelabuhan Muat</Label><Input {...register('pelabuhan_muat')}  /></div>
                <div><Label className="text-xs">Chop</Label><Input {...register('chop')}  /></div>
                <div><Label className="text-xs">Pack Qty</Label><Input type="number" step="any" {...register('pack_qty')}  /></div>
                <div><Label className="text-xs">Banyak Bale/Karung</Label><Input type="number" step="any" {...register('banyaknya_bale_karung')}  /></div>
                <div>
                  <Label className="text-xs">PPN</Label>
                  <NativeSelect {...register('is_ppn')}>
                    <option value="true">Ya (PPN)</option>
                    <option value="false">Tidak (Non-PPN)</option>
                  </NativeSelect>
                </div>
                <div><Label className="text-xs">PPN %</Label><Input type="number" step="any" {...register('ppn_persen')}  /></div>
                <div>
                  <Label className="text-xs">PPh</Label>
                  <NativeSelect {...register('is_pph')}>
                    <option value="false">Tidak</option>
                    <option value="true">Ya</option>
                  </NativeSelect>
                </div>
                <div><Label className="text-xs">PPh %</Label><Input type="number" step="any" {...register('pph_persen')}  /></div>
              </div>
            </CardContent>
          </Card>
          )}

          {activeStep === 2 && (
          <>
          <Card>
            <CardHeader className="pb-3">
              <CardTitle className="text-sm font-semibold">{payungMode ? 'Kontrak Payung' : 'Harga & Volume'}</CardTitle>
            </CardHeader>
            <CardContent className="grid grid-cols-3 gap-4">
              {payungMode ? (
                <div className="col-span-3 rounded-md border border-amber-200 bg-amber-50 px-3 py-2 text-xs text-amber-800">
                  Kontrak payung tidak memuat volume maupun harga. Volume dan harga komoditi diinput per Berita Acara saat transaksi.
                </div>
              ) : (
              <div>
                <Label className="text-xs">Volume *</Label>
                {(() => {
                  const validUnitsWithVol = unitList.filter(u => u.nama_unit.trim() && (u.volume || 0) > 0)
                  const derivedVol = validUnitsWithVol.length > 0 && validUnitsWithVol.length === unitList.filter(u => u.nama_unit.trim()).length
                  return derivedVol ? (
                    <div className="flex h-9 items-center rounded-md border border-input bg-slate-50 px-3 text-sm text-slate-600">
                      {validUnitsWithVol.reduce((s, u) => s + (u.volume || 0), 0).toLocaleString('id-ID')}
                      <span className="text-xs text-slate-400 ml-2">(dari unit)</span>
                    </div>
                  ) : (
                    <Input type="number" step="any" {...register('volume')}  />
                  )
                })()}
              </div>
              )}
              {!payungMode && (
              <>
              <div>
                <Label className="text-xs">Harga Satuan *</Label>
                <Input type="number" step="any" {...register('harga_satuan')}  />
              </div>
              <div>
                <Label className="text-xs">Premi</Label>
                <Input type="number" step="any" {...register('premi')}  />
              </div>
              </>
              )}
            </CardContent>
            {/* Quick calculation */}
            <div className="px-5 pb-4 grid grid-cols-2 gap-2 text-sm">
              {payungMode ? (
                <>
                  <div className="text-slate-500">Volume:</div>
                  <div className="text-right text-slate-600">Sesuai Berita Acara</div>
                  <div className="text-slate-500">Harga Satuan:</div>
                  <div className="text-right text-slate-600">Sesuai harga pasar / Berita Acara</div>
                  <div className="text-slate-500">Jatuh Tempo:</div>
                  <div className="text-right">{formatDate(jatuhTempo)}</div>
                </>
              ) : (
                <>
                  <div className="text-slate-500">Nilai Pokok:</div>
                  <div className="text-right font-semibold">{formatCurrency(pricing.pokok)}</div>
                  {watchedFields.is_ppn !== 'false' && (
                    <>
                      <div className="text-slate-500">Nominal PPN ({watchedFields.ppn_persen || 11}%):</div>
                      <div className="text-right">{formatCurrency(pricing.nominalPpn)}</div>
                    </>
                  )}
                  {watchedFields.is_pph === 'true' && (
                    <>
                      <div className="text-slate-500">Potongan PPh ({watchedFields.pph_persen || 0}%):</div>
                      <div className="text-right text-red-600">-{formatCurrency(pricing.nominalPph)}</div>
                    </>
                  )}
                  <div className="text-slate-700 font-semibold border-t pt-1">Total Tagihan:</div>
                  <div className="text-right font-bold text-brand-600 border-t pt-1">{formatCurrency(pricing.totalTagihan)}</div>
                  {pricing.totalTagihan > 0 && (
                    <>
                      <div className="text-slate-400 text-xs">Terbilang:</div>
                      <div className="text-right text-xs text-slate-500">{terbilangRupiah(pricing.totalTagihan)}</div>
                    </>
                  )}
                  <div className="text-slate-500">Jatuh Tempo:</div>
                  <div className="text-right">{formatDate(jatuhTempo)}</div>
                </>
              )}
            </div>
          </Card>

          {/* Delivery & Payment */}
          <Card>
            <CardHeader className="pb-3">
              <CardTitle className="text-sm font-semibold">Ketentuan & Pembayaran</CardTitle>
            </CardHeader>
            <CardContent className="grid grid-cols-3 gap-4">
              <div><Label className="text-xs">Kondisi Penyerahan</Label><Input {...register('kondisi_penyerahan')}  /></div>
              <div><Label className="text-xs">Waktu Penyerahan</Label><Input {...register('waktu_penyerahan')}  /></div>
              <div><Label className="text-xs">Lama Pembayaran (hari)</Label><Input type="number" {...register('lama_pembayaran_hari')}  /></div>
              <div><Label className="text-xs">Penyerahan (hari)</Label><Input type="number" {...register('penyerahan_hari')}  /></div>
              <div><Label className="text-xs">Levering</Label><Input {...register('levering')}  /></div>
              <div><Label className="text-xs">Metode Bayar</Label><Input {...register('pembayaran_metode')}  /></div>
              <div><Label className="text-xs">Cara Bayar</Label><Input {...register('pembayaran_cara')}  /></div>
              <div><Label className="text-xs">Bank</Label><Input {...register('pembayaran_bank')}  /></div>
            </CardContent>
          </Card>

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
                <Input {...register('dasar_ketentuan')}  />
              </div>
              <div>
                <Label className="text-xs">Catatan</Label>
                <Textarea {...register('catatan')} rows={2} />
              </div>
            </CardContent>
          </Card>
          </>
          )}

          {exportNo && activeStep === KONTRAK_STEPS.length - 1 && (
            <DocumentUpload entityType="kontrak" entityId={exportNo} docType="kontrak" />
          )}
          </ReadOnlyFieldset>

          <FormStepActions
            activeStep={activeStep}
            totalSteps={KONTRAK_STEPS.length}
            onBack={handleBackStep}
            onNext={handleNextStep}
            isSubmitting={isSubmitting || !canEdit()}
            submitLabel={!canEdit() ? 'Read-Only (Tamu)' : isExisting ? 'Simpan Perubahan' : 'Simpan & Preview'}
            extraActions={
              <>
                {exportNo && activeStep === KONTRAK_STEPS.length - 1 && (
                  <Button type="button" variant="secondary" onClick={handleExport} className="gap-2">
                    <FileDown size={14} />
                    Export .docx
                  </Button>
                )}
                <Button type="button" variant="outline" onClick={handleReset} disabled={!canEdit()} className="gap-2">
                  <RotateCcw size={14} />
                  Reset
                </Button>
              </>
            }
          />
        </form>
      </div>

      <PreviewPanel
        title="Live Preview"
        isEmpty={!watchedFields.no_kontrak && !watchedFields.pembeli}
        emptyTitle="Preview akan muncul di sini"
        emptyDescription="Isi form kontrak untuk melihat preview"
      >
        <KontrakPreview data={{ ...watchedFields, volume: payungMode ? 0 : watchedFields.volume, units: unitList.filter(u => u.nama_unit.trim()).map((u, i) => ({ id: i, no_kontrak: watchedFields.no_kontrak || '', nama_unit: u.nama_unit, urutan: i, volume: payungMode ? 0 : (u.volume || 0), komoditi: u.komoditi || null, jenis_komoditi: u.jenis_komoditi || null, satuan: u.satuan || null, tahun_panen: u.tahun_panen || null, deskripsi_produk: u.deskripsi_produk || null })) }} />
      </PreviewPanel>
    </div>
  )
}
