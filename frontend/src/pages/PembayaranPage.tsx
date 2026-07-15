import { useCallback, useEffect, useMemo, useRef, useState } from 'react'
import { useSearchParams } from 'react-router-dom'
import { useForm } from 'react-hook-form'
import { zodResolver } from '@hookform/resolvers/zod'
import { z } from 'zod'
import { Loader2, RotateCcw, Save, Send } from 'lucide-react'
import { usePembayaranStore } from '@/store/pembayaranStore'
import { useInvoiceStore } from '@/store/invoiceStore'
import { useKontrakStore } from '@/store/kontrakStore'
import { useAppStore } from '@/store/appStore'
import { useAuthStore } from '@/store/authStore'
import { Button } from '@/components/ui/button'
import { Input } from '@/components/ui/input'
import { NativeSelect } from '@/components/ui/native-select'
import { Label } from '@/components/ui/label'
import { Card, CardContent, CardHeader, CardTitle } from '@/components/ui/card'
import { ReadOnlyFieldset } from '@/components/common/ReadOnlyFieldset'
import { SearchableSelect } from '@/components/ui/searchable-select'
import { DocumentUpload } from '@/components/common/DocumentUpload'
import { SupermanDocChecklist } from '@/components/common/SupermanDocChecklist'
import { SupermanCaptchaDialog } from '@/components/common/SupermanCaptchaDialog'
import { SupermanProgressDialog } from '@/components/common/SupermanProgressDialog'
import { ApiError, client, isSupermanSessionError } from '@/lib/client'
import { cn, formatCurrency } from '@/lib/utils'
import { fetchInvoiceDocRequirements, formatInvoiceSelectLabel } from '@/utils/invoiceUtils'
import {
  effectivePelunasan,
  isInvoicePaid,
  maxNominalTransfer,
  PAYMENT_LUNAS_TOLERANCE,
  paymentBalance,
  paymentProgressPercent,
  pphOnNetTransfer,
} from '@/utils/pembayaranUtils'
import { isPayungBA } from '@/utils/kontrakUtils'
import {
  checkSupermanDocsReady,
  isSupermanSessionMessage,
  extractJobIdFromConflict,
  pollSupermanJob,
  recoverSupermanFromTodo,
  resolveSupermanExecutor,
} from '@/utils/supermanUtils'
import type {
  Pembayaran,
  PembayaranInput,
  SupermanDeklarasiJobStart,
  SupermanDeklarasiResult,
  SupermanDocRequirement,
  SupermanStatus,
} from '@/types'

const pembayaranSchema = z.object({
  no_invoice: z.string().min(1, 'Invoice wajib dipilih'),
  tanggal_pembayaran: z.string().min(1, 'Tanggal wajib diisi'),
  nominal_transfer: z.coerce.number().min(1, 'Nominal harus lebih dari 0'),
  is_pph_disetor: z.string().optional(),
})

type PembayaranFormData = z.infer<typeof pembayaranSchema>

export default function PembayaranPage() {
  const pembayaranStore = usePembayaranStore()
  const invoiceStore = useInvoiceStore()
  const kontrakStore = useKontrakStore()
  const { currentInvoice, currentKontrak, fetchInvoiceContext } = pembayaranStore
  const { addNotification } = useAppStore()
  const canEdit = useAuthStore((s) => s.canEdit)
  const [isExisting, setIsExisting] = useState(false)
  const [savedNo, setSavedNo] = useState<string | null>(null)
  const [docRequirements, setDocRequirements] = useState<SupermanDocRequirement[]>([])
  const [docsReady, setDocsReady] = useState(false)
  const [invoicePembayaran, setInvoicePembayaran] = useState<Pembayaran[]>([])
  const [supermanRunning, setSupermanRunning] = useState(false)
  const [progressOpen, setProgressOpen] = useState(false)
  const [captchaOpen, setCaptchaOpen] = useState(false)
  const [percent, setPercent] = useState(0)
  const [stage, setStage] = useState('Memulai...')
  const [failed, setFailed] = useState(false)
  const [partial, setPartial] = useState(false)
  const [recoverable, setRecoverable] = useState(true)
  const [failedMessage, setFailedMessage] = useState('')
  const [recoverLoading, setRecoverLoading] = useState(false)
  const [supermanInvoice, setSupermanInvoice] = useState<string | undefined>()
  const cancelledRef = useRef(false)
  const pendingSupermanRef = useRef(false)

  const form = useForm<PembayaranFormData>({
    resolver: zodResolver(pembayaranSchema),
    defaultValues: {
      no_invoice: '',
      tanggal_pembayaran: new Date().toISOString().split('T')[0],
      nominal_transfer: 0,
      is_pph_disetor: 'false',
    },
  })

  const { register, handleSubmit, reset, setValue, watch, formState: { errors, isSubmitting } } = form
  const selectedInvoice = watch('no_invoice')
  const nominalTransfer = watch('nominal_transfer')
  const isPphDisetor = watch('is_pph_disetor')

  const invoiceSuperman = (currentInvoice?.superman || '').trim()
  const invoiceTotal = currentInvoice?.jumlah_pembayaran || 0

  useEffect(() => {
    invoiceStore.fetch()
    kontrakStore.fetch()
    pembayaranStore.fetch()
  }, [])

  const kontrakByNo = useMemo(
    () => Object.fromEntries(kontrakStore.data.map((k) => [k.no_kontrak, k])),
    [kontrakStore.data],
  )

  const invoiceOptions = useMemo(
    () => [...invoiceStore.data]
      .sort((a, b) => {
        const ta = new Date(a.tanggal_transaksi || 0).getTime()
        const tb = new Date(b.tanggal_transaksi || 0).getTime()
        return tb - ta
      })
      .map((i) => ({
        value: i.no_invoice,
        label: formatInvoiceSelectLabel(i, kontrakByNo),
      })),
    [invoiceStore.data, kontrakByNo],
  )

  useEffect(() => {
    if (selectedInvoice) {
      fetchInvoiceContext(selectedInvoice)
      pembayaranStore.fetchByInvoice(selectedInvoice).then(setInvoicePembayaran)
    } else {
      setInvoicePembayaran([])
    }
  }, [selectedInvoice])

  const fetchDocRequirements = async (noInvoice: string) => {
    try {
      const res = await fetchInvoiceDocRequirements(noInvoice)
      setDocRequirements(res.requirements)
      setDocsReady(res.ready)
      return res
    } catch (err) {
      setDocRequirements([])
      setDocsReady(false)
      throw err
    }
  }

  useEffect(() => {
    if (selectedInvoice) {
      void fetchDocRequirements(selectedInvoice)
    } else {
      setDocRequirements([])
      setDocsReady(false)
    }
  }, [selectedInvoice])

  const handleDocumentUploaded = () => {
    if (selectedInvoice) {
      void fetchDocRequirements(selectedInvoice)
    }
  }

  const loadPembayaran = async (no: string) => {
    const data = await pembayaranStore.fetchOne(no)
    if (data) {
      setIsExisting(true)
      setSavedNo(data.no_pembayaran)
      setValue('no_invoice', data.no_invoice)
      setValue('tanggal_pembayaran', data.tanggal_pembayaran)
      setValue('nominal_transfer', data.nominal_transfer)
      setValue('is_pph_disetor', data.is_pph_disetor)
    }
  }

  const [searchParams] = useSearchParams()
  const editNo = searchParams.get('edit')
  useEffect(() => {
    if (editNo) {
      const t = setTimeout(() => loadPembayaran(editNo), 100)
      return () => clearTimeout(t)
    }
  }, [editNo])

  const pelunasanForPayment = useCallback(
    (p: Pembayaran) => effectivePelunasan(p.nominal_transfer, p.is_pph_disetor, currentKontrak),
    [currentKontrak],
  )

  const paidTotalAll = useMemo(
    () => invoicePembayaran.reduce((sum, p) => sum + pelunasanForPayment(p), 0),
    [invoicePembayaran, pelunasanForPayment],
  )

  const existingTotal = useMemo(() => {
    return invoicePembayaran
      .filter((p) => p.no_pembayaran !== savedNo)
      .reduce((sum, p) => sum + pelunasanForPayment(p), 0)
  }, [invoicePembayaran, savedNo, pelunasanForPayment])

  const effectiveCurrent = effectivePelunasan(
    Number(nominalTransfer) || 0,
    isPphDisetor || 'false',
    currentKontrak,
  )
  const currentPphAddon =
    currentKontrak?.is_pph === 'true'
      ? pphOnNetTransfer(Number(nominalTransfer) || 0, currentKontrak)
      : 0

  const totalAfterSave = existingTotal + effectiveCurrent
  const sisaPelunasan = Math.max(0, invoiceTotal - existingTotal)
  const exactTransferNominal = maxNominalTransfer(sisaPelunasan, currentKontrak)
  const { shortfall: sisaAfterSave, surplus: surplusAfterSave } = paymentBalance(
    totalAfterSave,
    invoiceTotal,
  )
  const { surplus: surplusPaidAll } = paymentBalance(paidTotalAll, invoiceTotal)
  const progressPct = paymentProgressPercent(paidTotalAll, invoiceTotal)
  const afterThisPct = paymentProgressPercent(totalAfterSave, invoiceTotal)
  const willCompleteInvoice = isInvoicePaid(totalAfterSave, invoiceTotal)
  const isInvoiceFullyPaid = isInvoicePaid(paidTotalAll, invoiceTotal)
  const isPayung = isPayungBA(currentKontrak?.tipe_alur)
  const baNo = (currentInvoice?.no_ba || '').trim()
  const isInvoiceLocked = Boolean(invoiceSuperman)

  useEffect(() => {
    if (!selectedInvoice || isExisting || savedNo) return
    if (exactTransferNominal > 0 && sisaPelunasan > 0) {
      setValue('nominal_transfer', exactTransferNominal)
    }
  }, [selectedInvoice, exactTransferNominal, sisaPelunasan, isExisting, savedNo, setValue])

  const resetSupermanProgress = () => {
    setFailed(false)
    setPartial(false)
    setRecoverable(true)
    setFailedMessage('')
    setPercent(0)
    setStage('Memulai...')
  }

  const closeSupermanProgress = () => {
    setProgressOpen(false)
    resetSupermanProgress()
  }

  const refreshAfterSuperman = async (noInvoice: string) => {
    await fetchInvoiceContext(noInvoice)
    const updated = await pembayaranStore.fetchByInvoice(noInvoice)
    setInvoicePembayaran(updated)
    await pembayaranStore.fetch()
  }

  const runSupermanForInvoice = async (noInvoice: string) => {
    let docCheck: Awaited<ReturnType<typeof checkSupermanDocsReady>>
    try {
      docCheck = await checkSupermanDocsReady(noInvoice)
    } catch (err) {
      addNotification(
        err instanceof Error ? err.message : 'Gagal memuat status dokumen pendukung',
        'error',
      )
      return
    }
    if (!docCheck.ready) {
      addNotification(docCheck.message, 'warning')
      return
    }

    cancelledRef.current = false
    setSupermanRunning(true)
    resetSupermanProgress()
    setSupermanInvoice(noInvoice)
    setProgressOpen(true)

    try {
      const exec = await resolveSupermanExecutor()
      if (exec.executor === 'agent') {
        setStage('Menunggu agent lokal di PC...')
        addNotification(exec.hint, 'info')
      } else {
        addNotification(exec.hint, 'warning')
      }
      const params = new URLSearchParams({
        no_invoice: noInvoice,
        executor: exec.executor,
      })
      let jobId: string
      try {
        const start = await client.post<SupermanDeklarasiJobStart>(
          `/api/superman/deklarasi/start?${params.toString()}`,
        )
        jobId = start.job_id
        if (start.executor === 'agent') {
          setStage(start.message || 'Menunggu agent lokal di PC...')
        }
      } catch (startErr: unknown) {
        const detail = startErr instanceof ApiError ? startErr.message : ''
        const resumeId =
          startErr instanceof ApiError && startErr.status === 409
            ? extractJobIdFromConflict(detail)
            : null
        if (resumeId) {
          jobId = resumeId
          addNotification('Melanjutkan job Superman yang masih berjalan...', 'info')
        } else {
          throw startErr
        }
      }
      const result = await pollSupermanJob(jobId, {
        noInvoice,
        isCancelled: () => cancelledRef.current,
        onProgress: (p, s) => {
          setPercent(p)
          setStage(s)
        },
      })

      const label = (result.superman_saved || '').trim()
      if (result.partial || (!result.ok && (result.sppn_no || result.sppb_no))) {
        setPartial(true)
        setRecoverable(result.recoverable !== false)
        setPercent(100)
        setStage(result.message || 'Nomor Superman belum tersimpan otomatis')
        addNotification(
          label
            ? `Superman: ${label} — gunakan Pulihkan dari To Do jika kolom kosong`
            : result.message || 'Deklarasi sebagian berhasil',
          'warning',
        )
        return
      }

      if (label) {
        addNotification(`Superman: ${label} masuk To Do List`, 'success')
        if (result.superman_url) {
          window.open(result.superman_url, '_blank', 'noopener,noreferrer')
        }
        closeSupermanProgress()
        await refreshAfterSuperman(noInvoice)
      } else {
        addNotification(result.message || 'Deklarasi Superman selesai', 'success')
        closeSupermanProgress()
        await refreshAfterSuperman(noInvoice)
      }
    } catch (err) {
      const message = err instanceof Error ? err.message : 'Gagal membuat SPPn di Superman'
      if (isSupermanSessionError(err) || isSupermanSessionMessage(message)) {
        closeSupermanProgress()
        setCaptchaOpen(true)
        return
      }
      setFailed(true)
      setFailedMessage(message)
      setStage(message)
      addNotification(message, 'error')
    } finally {
      setSupermanRunning(false)
      pendingSupermanRef.current = false
    }
  }

  const handleRecoverSuperman = async () => {
    const noInvoice = supermanInvoice || selectedInvoice
    if (!noInvoice) return
    setRecoverLoading(true)
    try {
      const res = await recoverSupermanFromTodo(noInvoice)
      if (res.ok && res.superman_saved) {
        addNotification(`Nomor Superman dipulihkan: ${res.superman_saved}`, 'success')
        closeSupermanProgress()
        await refreshAfterSuperman(noInvoice)
      } else {
        addNotification(res.message || 'Gagal memulihkan nomor dari To Do List', 'error')
      }
    } catch (err) {
      addNotification(
        err instanceof Error ? err.message : 'Gagal memulihkan nomor Superman',
        'error',
      )
    } finally {
      setRecoverLoading(false)
    }
  }

  const startSupermanFlow = async (noInvoice: string) => {
    let docCheck: Awaited<ReturnType<typeof checkSupermanDocsReady>>
    try {
      docCheck = await checkSupermanDocsReady(noInvoice)
      setDocRequirements(docCheck.requirements)
      setDocsReady(docCheck.ready)
    } catch (err) {
      addNotification(
        err instanceof Error ? err.message : 'Gagal memuat status dokumen pendukung',
        'error',
      )
      return
    }
    if (!docCheck.ready) {
      addNotification(docCheck.message, 'warning')
      return
    }
    try {
      const status = await client.get<SupermanStatus>('/api/superman/status')
      if (!status.session_valid) {
        pendingSupermanRef.current = true
        setCaptchaOpen(true)
        return
      }
      await runSupermanForInvoice(noInvoice)
    } catch (err) {
      addNotification(
        err instanceof Error ? err.message : 'Gagal memeriksa session Superman',
        'error',
      )
    }
  }

  const savePembayaran = async (data: PembayaranFormData, triggerSuperman: boolean) => {
    try {
      let nominalTransfer = Number(data.nominal_transfer) || 0
      if (
        currentKontrak?.is_pph === 'true' &&
        exactTransferNominal > 0 &&
        sisaPelunasan > 0
      ) {
        const wouldBe = existingTotal + effectivePelunasan(nominalTransfer, data.is_pph_disetor, currentKontrak)
        if (wouldBe > invoiceTotal + PAYMENT_LUNAS_TOLERANCE) {
          nominalTransfer = exactTransferNominal
          setValue('nominal_transfer', exactTransferNominal)
          addNotification(
            'Nominal transfer disesuaikan ke pas-pasan lunas (PPh dipotong pembeli).',
            'info',
          )
        }
      }

      const payload: PembayaranInput = {
        no_invoice: data.no_invoice,
        tanggal_pembayaran: data.tanggal_pembayaran,
        nominal_transfer: nominalTransfer,
        is_pph_disetor: data.is_pph_disetor,
      }
      if (savedNo && isExisting) {
        payload.no_pembayaran = savedNo
      }

      if (triggerSuperman) {
        let docCheck: Awaited<ReturnType<typeof checkSupermanDocsReady>>
        try {
          docCheck = await checkSupermanDocsReady(data.no_invoice)
          setDocRequirements(docCheck.requirements)
          setDocsReady(docCheck.ready)
        } catch (err) {
          addNotification(
            err instanceof Error ? err.message : 'Gagal memuat status dokumen pendukung',
            'error',
          )
          return
        }
        if (!docCheck.ready) {
          addNotification(docCheck.message, 'warning')
          return
        }
      }

      const saved = await pembayaranStore.save(payload)
      setIsExisting(true)
      setSavedNo(saved.no_pembayaran)
      addNotification('Pembayaran berhasil disimpan', 'success')
      if (saved.warning) {
        addNotification(saved.warning, 'warning')
      }
      const updated = await pembayaranStore.fetchByInvoice(data.no_invoice)
      setInvoicePembayaran(updated)
      await fetchInvoiceContext(data.no_invoice)

      if (triggerSuperman) {
        addNotification('Invoice lunas — memulai deklarasi Superman...', 'info')
        await startSupermanFlow(data.no_invoice)
      }
    } catch (err: unknown) {
      const message = err instanceof Error ? err.message : 'Gagal menyimpan pembayaran'
      addNotification(message, 'error')
    }
  }

  const onSaveOnly = handleSubmit((data) => savePembayaran(data, false))
  const onSaveAndSuperman = handleSubmit((data) => savePembayaran(data, true))

  const handleReset = () => {
    reset()
    setIsExisting(false)
    setSavedNo(null)
  }

  const saveOnlyLabel = (() => {
    if (!canEdit()) return 'Read-Only (Tamu)'
    if (isSubmitting || supermanRunning) return 'Memproses...'
    if (isExisting) return 'Simpan Perubahan'
    return 'Catat Pembayaran'
  })()

  const showSupermanSaveOption = willCompleteInvoice && !invoiceSuperman && canEdit()
  const actionsBusy = isSubmitting || supermanRunning

  return (
    <div className="max-w-3xl">
      <form onSubmit={(e) => e.preventDefault()} className="space-y-6" autoComplete="off">
        <Card>
          <CardHeader className="pb-3">
            <CardTitle className="text-sm font-semibold">Pilih Invoice</CardTitle>
          </CardHeader>
          <CardContent className="grid grid-cols-1 gap-4">
            <div>
              <Label className="text-xs">No Invoice *</Label>
              <SearchableSelect
                options={invoiceOptions}
                value={watch('no_invoice')}
                onChange={(v) => setValue('no_invoice', v, { shouldValidate: true })}
                placeholder="-- Pilih / Cari Invoice --"
              />
              {errors.no_invoice && <p className="text-xs text-red-500 mt-1">{errors.no_invoice.message}</p>}
            </div>
            {selectedInvoice && (
              <div className="rounded-md border border-slate-200 bg-slate-50 px-3 py-2">
                <p className="text-xs text-slate-500">Nomor Dokumen Superman</p>
                <p className={cn(
                  'text-sm font-medium',
                  invoiceSuperman ? 'text-emerald-800' : isInvoiceFullyPaid ? 'text-amber-700' : 'text-slate-600',
                )}>
                  {invoiceSuperman || (isInvoiceFullyPaid ? 'Menunggu Superman' : 'Belum lunas')}
                </p>
                {!invoiceSuperman && !isInvoiceFullyPaid && (
                  <p className="text-xs text-slate-400 mt-1">
                    Catat pembayaran dulu. Superman dibuat terpisah setelah invoice lunas dan dokumen wajib lengkap.
                  </p>
                )}
                {!invoiceSuperman && isInvoiceFullyPaid && (
                  <p className="text-xs text-amber-700 mt-1">
                    Invoice sudah lunas — klik Buat Deklarasi Superman setelah dokumen wajib siap.
                  </p>
                )}
              </div>
            )}
          </CardContent>
        </Card>

        {selectedInvoice && currentInvoice && (
          <Card>
            <CardHeader className="pb-3">
              <CardTitle className="text-sm font-semibold">Dokumen Pendukung Superman</CardTitle>
              <p className="text-xs text-slate-500 mt-1">
                {isPayung
                  ? 'Wajib: Berita Acara, Invoice, dan Rekening Koran Penerimaan (kontrak payung TBS). Kuitansi opsional.'
                  : 'Wajib: Kontrak, Invoice, dan Rekening Koran Penerimaan. Kuitansi opsional.'}
              </p>
            </CardHeader>
            <CardContent className="space-y-4">
              <div className="grid grid-cols-1 md:grid-cols-2 xl:grid-cols-4 gap-3">
                {isPayung && baNo ? (
                  <DocumentUpload
                    entityType="ba"
                    entityId={baNo}
                    docType="berita_acara"
                    label="Berita Acara"
                    onUploaded={handleDocumentUploaded}
                  />
                ) : currentKontrak?.no_kontrak ? (
                  <DocumentUpload
                    entityType="kontrak"
                    entityId={currentKontrak.no_kontrak}
                    docType="kontrak"
                    onUploaded={handleDocumentUploaded}
                  />
                ) : null}
                <DocumentUpload
                  entityType="invoice"
                  entityId={currentInvoice.no_invoice}
                  docType="invoice"
                  onUploaded={handleDocumentUploaded}
                />
                <DocumentUpload
                  entityType="invoice"
                  entityId={currentInvoice.no_invoice}
                  docType="rekening_koran"
                  onUploaded={handleDocumentUploaded}
                />
                <DocumentUpload
                  entityType="invoice"
                  entityId={currentInvoice.no_invoice}
                  docType="kuitansi"
                  label="Kuitansi (opsional)"
                  onUploaded={handleDocumentUploaded}
                />
              </div>
              <SupermanDocChecklist requirements={docRequirements} docsReady={docsReady} />
            </CardContent>
          </Card>
        )}

        <ReadOnlyFieldset className="space-y-6 block">
          <fieldset disabled={isInvoiceLocked} className="border-0 p-0 m-0 min-w-0 space-y-6 block">
            <Card>
              <CardHeader className="pb-3">
                <CardTitle className="text-sm font-semibold">Data Pembayaran (Termin)</CardTitle>
              </CardHeader>
              <CardContent className="grid grid-cols-2 gap-4">
                <div>
                  <Label className="text-xs">Tanggal Pembayaran *</Label>
                  <Input type="date" {...register('tanggal_pembayaran')} />
                  {errors.tanggal_pembayaran && (
                    <p className="text-xs text-red-500 mt-1">{errors.tanggal_pembayaran.message}</p>
                  )}
                </div>
                <div>
                  <Label className="text-xs">Nominal Transfer *</Label>
                  <Input type="number" step="any" {...register('nominal_transfer')} />
                  {errors.nominal_transfer && (
                    <p className="text-xs text-red-500 mt-1">{errors.nominal_transfer.message}</p>
                  )}
                  {selectedInvoice && exactTransferNominal > 0 && sisaPelunasan > 0 && (
                    <div className="flex flex-wrap items-center gap-2 mt-1">
                      <p className="text-xs text-slate-500">
                        Transfer pas-pasan lunas: {formatCurrency(exactTransferNominal)}
                        {currentKontrak?.is_pph === 'true' && (
                          <> · pelunasan tersisa {formatCurrency(sisaPelunasan)}</>
                        )}
                      </p>
                      {Number(nominalTransfer) !== exactTransferNominal && canEdit() && (
                        <button
                          type="button"
                          className="text-xs text-primary underline-offset-2 hover:underline"
                          onClick={() => setValue('nominal_transfer', exactTransferNominal)}
                        >
                          Gunakan pas-pasan
                        </button>
                      )}
                    </div>
                  )}
                  {surplusAfterSave > 0 && (
                    <p className="text-xs text-amber-700 mt-1">
                      Kelebihan pelunasan setelah simpan: {formatCurrency(surplusAfterSave)}
                      {exactTransferNominal > 0 && (
                        <> · pas-pasan: {formatCurrency(exactTransferNominal)}</>
                      )}
                    </p>
                  )}
                  {currentPphAddon > 0 && (
                    <p className="text-xs text-emerald-700 mt-1">
                      + PPh dipotong pembeli: {formatCurrency(currentPphAddon)} → dianggap lunas{' '}
                      {formatCurrency(effectiveCurrent)}
                    </p>
                  )}
                </div>
                <div>
                  <Label className="text-xs">PPh Disetor</Label>
                  <NativeSelect {...register('is_pph_disetor')}>
                    <option value="false">Belum</option>
                    <option value="true">Sudah</option>
                  </NativeSelect>
                  {currentKontrak?.is_pph === 'true' && (
                    <p className="text-xs text-slate-500 mt-1">
                      Status setor PPh ke KPP — tampil di Laporan Digital. Tidak mempengaruhi lunas/Superman.
                    </p>
                  )}
                </div>
                {savedNo && (
                  <div>
                    <Label className="text-xs">ID Termin</Label>
                    <p className="text-sm font-mono text-slate-600 mt-1">{savedNo}</p>
                  </div>
                )}
              </CardContent>
            </Card>

            {currentInvoice ? (
              <Card>
                <CardHeader className="pb-3">
                  <CardTitle className="text-sm font-semibold">Progress Pembayaran Invoice</CardTitle>
                </CardHeader>
                <CardContent className="space-y-3 text-sm">
                  <div className="grid grid-cols-2 gap-2">
                    <span className="text-slate-500">Kewajiban Invoice:</span>
                    <span className="font-semibold">{formatCurrency(invoiceTotal)}</span>
                    <span className="text-slate-500">Sudah Dibayar:</span>
                    <span className="text-emerald-700 font-medium">{formatCurrency(paidTotalAll)}</span>
                    <span className="text-slate-500">{surplusPaidAll > 0 ? 'Kelebihan:' : 'Sisa:'}</span>
                    <span
                      className={cn(
                        'font-medium',
                        surplusPaidAll > 0 ? 'text-amber-700' : undefined,
                      )}
                    >
                      {surplusPaidAll > 0
                        ? formatCurrency(surplusPaidAll)
                        : formatCurrency(Math.max(0, invoiceTotal - paidTotalAll))}
                    </span>
                    {currentKontrak && (
                      <>
                        <span className="text-slate-500">Kontrak:</span>
                        <span>{currentKontrak.no_kontrak}</span>
                        <span className="text-slate-500">Pembeli:</span>
                        <span>{(currentKontrak.pembeli || '-').split('\n')[0]}</span>
                      </>
                    )}
                  </div>
                  <div>
                    <div className="h-2 bg-slate-100 rounded-full overflow-hidden">
                      <div
                        className="h-full bg-emerald-500 transition-all"
                        style={{ width: `${Math.min(afterThisPct, 100)}%` }}
                      />
                    </div>
                    <p className="text-xs text-slate-400 mt-1 text-right">
                      {progressPct}% terbayar saat ini · {afterThisPct}% setelah simpan
                      {surplusAfterSave > 0 && (
                        <> · kelebihan {formatCurrency(surplusAfterSave)}</>
                      )}
                      {sisaAfterSave > 0.5 && afterThisPct < 100 && surplusAfterSave <= 0 && (
                        <> · sisa {formatCurrency(sisaAfterSave)}</>
                      )}
                    </p>
                  </div>
                  {invoicePembayaran.length > 0 && (
                    <div className="border-t pt-3">
                      <p className="text-xs font-semibold text-slate-600 mb-2">Riwayat Termin</p>
                      <div className="space-y-1">
                        {invoicePembayaran.map((p) => {
                          const pelunasan = pelunasanForPayment(p)
                          const over = p.selisih < -PAYMENT_LUNAS_TOLERANCE
                          return (
                            <button
                              key={p.no_pembayaran}
                              type="button"
                              onClick={() => loadPembayaran(p.no_pembayaran)}
                              className={cn(
                                'w-full flex justify-between gap-2 text-xs px-2 py-1 rounded hover:bg-slate-100',
                                savedNo === p.no_pembayaran && 'bg-slate-100 font-medium',
                              )}
                            >
                              <span className="text-slate-600 font-mono truncate">{p.no_pembayaran}</span>
                              <span className="shrink-0 text-right">
                                <span className="block">{formatCurrency(p.nominal_transfer)}</span>
                                <span className="block text-slate-400">
                                  pelunasan {formatCurrency(pelunasan)}
                                  {over && (
                                    <span className="text-amber-700">
                                      {' '}
                                      · +{formatCurrency(-p.selisih)}
                                    </span>
                                  )}
                                </span>
                              </span>
                            </button>
                          )
                        })}
                      </div>
                    </div>
                  )}
                </CardContent>
              </Card>
            ) : (
              <Card>
                <CardContent className="py-8 text-center text-sm text-muted-foreground">
                  Pilih No Invoice untuk melihat progress pembayaran.
                </CardContent>
              </Card>
            )}
          </fieldset>
        </ReadOnlyFieldset>

        {isPayung && !baNo && selectedInvoice && (
          <Card>
            <CardContent className="py-4 text-sm text-amber-800">
              Invoice payung BA belum terhubung ke Berita Acara. Hubungkan di menu Invoice terlebih dahulu.
            </CardContent>
          </Card>
        )}

        {docsReady && !willCompleteInvoice && !isInvoiceFullyPaid && !invoiceSuperman && selectedInvoice && (
          <Card>
            <CardContent className="py-4 text-sm text-amber-800">
              Dokumen sudah lengkap, tetapi invoice belum lunas
              {sisaAfterSave > PAYMENT_LUNAS_TOLERANCE && <> (sisa {formatCurrency(sisaAfterSave)})</>}.
            </CardContent>
          </Card>
        )}

        {isInvoiceFullyPaid && !invoiceSuperman && selectedInvoice && (
          <Card>
            <CardContent className="py-4 flex flex-wrap items-center justify-between gap-3">
              <p className="text-sm text-amber-800">
                Invoice sudah lunas tetapi deklarasi Superman belum dibuat.
              </p>
              <Button
                type="button"
                variant="secondary"
                className="gap-2"
                disabled={supermanRunning || !canEdit()}
                onClick={() => void startSupermanFlow(selectedInvoice)}
              >
                {supermanRunning ? <Loader2 size={14} className="animate-spin" /> : <Send size={14} />}
                Buat Deklarasi Superman
              </Button>
            </CardContent>
          </Card>
        )}

        {invoiceSuperman && (
          <Card>
            <CardContent className="py-4 text-sm text-emerald-800 bg-emerald-50 rounded-md">
              Invoice sudah terdaftar di Superman: <strong>{invoiceSuperman}</strong>.
              Lanjutkan ke menu Input DO untuk menerbitkan Delivery Order per termin.
            </CardContent>
          </Card>
        )}

        <div className="flex flex-wrap gap-3">
          {!isInvoiceLocked && (
            <>
              <Button
                type="button"
                disabled={actionsBusy || !canEdit()}
                className="gap-2"
                onClick={() => void onSaveOnly()}
              >
                {actionsBusy ? <Loader2 size={14} className="animate-spin" /> : <Save size={14} />}
                {saveOnlyLabel}
              </Button>
              {showSupermanSaveOption && (
                <Button
                  type="button"
                  variant="secondary"
                  disabled={actionsBusy}
                  className="gap-2"
                  onClick={() => void onSaveAndSuperman()}
                >
                  {supermanRunning ? <Loader2 size={14} className="animate-spin" /> : <Send size={14} />}
                  Catat Pembayaran dan Buat Deklarasi Superman
                </Button>
              )}
            </>
          )}
          <Button type="button" variant="outline" onClick={handleReset} disabled={!canEdit()} className="gap-2">
            <RotateCcw size={14} /> Reset
          </Button>
        </div>
      </form>

      <SupermanCaptchaDialog
        open={captchaOpen}
        onOpenChange={setCaptchaOpen}
        onVerified={() => {
          addNotification('Login Superman berhasil. Melanjutkan pembuatan SPPn...', 'success')
          if (selectedInvoice && (pendingSupermanRef.current || isInvoiceFullyPaid)) {
            void runSupermanForInvoice(selectedInvoice)
          }
        }}
      />

      <SupermanProgressDialog
        open={progressOpen}
        noInvoice={supermanInvoice || selectedInvoice || undefined}
        percent={percent}
        stage={stage}
        running={supermanRunning && !failed && !partial}
        failed={failed}
        failedMessage={failedMessage}
        partial={partial}
        recoverable={recoverable}
        recoverLoading={recoverLoading}
        onCancel={() => {
          cancelledRef.current = true
          closeSupermanProgress()
          setSupermanRunning(false)
        }}
        onClose={closeSupermanProgress}
        onRecover={handleRecoverSuperman}
        onRetry={() => {
          const noInvoice = supermanInvoice || selectedInvoice
          closeSupermanProgress()
          if (noInvoice) void startSupermanFlow(noInvoice)
        }}
      />
    </div>
  )
}