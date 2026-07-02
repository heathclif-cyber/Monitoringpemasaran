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
import { client } from '@/lib/client'
import { cn, formatCurrency } from '@/lib/utils'
import { fetchInvoiceDocRequirements, formatInvoiceSelectLabel } from '@/utils/invoiceUtils'
import {
  effectivePelunasan,
  paymentProgressPercent,
  pphOnNetTransfer,
} from '@/utils/pembayaranUtils'
import type {
  Pembayaran,
  PembayaranInput,
  SupermanDeklarasiJobStart,
  SupermanDeklarasiProgress,
  SupermanDeklarasiResult,
  SupermanDocRequirement,
  SupermanStatus,
} from '@/types'

const POLL_INTERVAL_MS = 1000

function sleep(ms: number) {
  return new Promise((resolve) => setTimeout(resolve, ms))
}

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
    String(isPphDisetor || 'false').toLowerCase() === 'true'
      ? pphOnNetTransfer(Number(nominalTransfer) || 0, currentKontrak)
      : 0

  const totalAfterSave = existingTotal + effectiveCurrent
  const sisaPembayaran = Math.max(0, invoiceTotal - existingTotal)
  const sisaAfterSave = Math.max(0, invoiceTotal - totalAfterSave)
  const progressPct = paymentProgressPercent(existingTotal, invoiceTotal)
  const afterThisPct = paymentProgressPercent(totalAfterSave, invoiceTotal)
  const willCompleteInvoice = invoiceTotal > 0 && totalAfterSave >= invoiceTotal - 0.5
  const isInvoiceFullyPaid = invoiceTotal > 0 && paidTotalAll >= invoiceTotal - 0.5
  const isInvoiceLocked = Boolean(invoiceSuperman)

  const pollJob = async (jobId: string): Promise<SupermanDeklarasiResult> => {
    while (!cancelledRef.current) {
      const progress = await client.get<SupermanDeklarasiProgress>(
        `/api/superman/deklarasi/progress?job_id=${encodeURIComponent(jobId)}`,
      )
      setPercent(progress.percent)
      setStage(progress.stage)
      if (progress.status === 'completed' && progress.result) {
        setPercent(100)
        setStage('Selesai')
        return progress.result
      }
      if (progress.status === 'failed') {
        throw new Error(progress.error || 'Gagal membuat SPPn di Superman')
      }
      await sleep(POLL_INTERVAL_MS)
    }
    throw new Error('Proses dibatalkan')
  }

  const runSupermanForInvoice = async (noInvoice: string) => {
    cancelledRef.current = false
    setSupermanRunning(true)
    setPercent(0)
    setStage('Memulai...')
    setProgressOpen(true)

    try {
      const params = new URLSearchParams({ no_invoice: noInvoice })
      const start = await client.post<SupermanDeklarasiJobStart>(
        `/api/superman/deklarasi/start?${params.toString()}`,
      )
      const result = await pollJob(start.job_id)
      const label = (result.superman_saved || '').trim()
      if (label) {
        addNotification(`Superman: ${label} masuk To Do List`, 'success')
      } else {
        addNotification(result.message || 'Deklarasi Superman selesai', 'success')
      }
      if (result.superman_url) {
        window.open(result.superman_url, '_blank', 'noopener,noreferrer')
      }
      await fetchInvoiceContext(noInvoice)
      const updated = await pembayaranStore.fetchByInvoice(noInvoice)
      setInvoicePembayaran(updated)
      await pembayaranStore.fetch()
    } catch (err) {
      const message = err instanceof Error ? err.message : 'Gagal membuat SPPn di Superman'
      if (message.includes('captcha') || message.includes('Session Superman')) {
        setProgressOpen(false)
        setCaptchaOpen(true)
        return
      }
      addNotification(message, 'error')
    } finally {
      setSupermanRunning(false)
      setProgressOpen(false)
      pendingSupermanRef.current = false
    }
  }

  const startSupermanFlow = async (noInvoice: string) => {
    let fresh: Awaited<ReturnType<typeof fetchDocRequirements>>
    try {
      fresh = await fetchDocRequirements(noInvoice)
    } catch (err) {
      addNotification(
        err instanceof Error ? err.message : 'Gagal memuat status dokumen pendukung',
        'error',
      )
      return
    }
    if (!fresh.ready) {
      const missing = fresh.requirements
        .filter((r) => r.required !== false && !r.uploaded)
        .map((r) => r.label.replace(' (opsional)', ''))
        .join(', ')
      addNotification(
        missing
          ? `Dokumen wajib belum lengkap: ${missing}`
          : 'Upload dokumen wajib terlebih dahulu sebelum membuat SPPn Superman.',
        'warning',
      )
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
      const payload: PembayaranInput = {
        no_invoice: data.no_invoice,
        tanggal_pembayaran: data.tanggal_pembayaran,
        nominal_transfer: data.nominal_transfer,
        is_pph_disetor: data.is_pph_disetor,
      }
      if (savedNo && isExisting) {
        payload.no_pembayaran = savedNo
      }

      if (triggerSuperman) {
        let fresh: Awaited<ReturnType<typeof fetchDocRequirements>>
        try {
          fresh = await fetchDocRequirements(data.no_invoice)
        } catch (err) {
          addNotification(
            err instanceof Error ? err.message : 'Gagal memuat status dokumen pendukung',
            'error',
          )
          return
        }
        if (!fresh.ready) {
          const missing = fresh.requirements
            .filter((r) => r.required !== false && !r.uploaded)
            .map((r) => r.label.replace(' (opsional)', ''))
            .join(', ')
          addNotification(
            missing
              ? `Dokumen wajib belum lengkap: ${missing}`
              : 'Upload dokumen wajib terlebih dahulu sebelum membuat SPPn Superman.',
            'warning',
          )
          return
        }
      }

      const saved = await pembayaranStore.save(payload)
      setIsExisting(true)
      setSavedNo(saved.no_pembayaran)
      addNotification('Pembayaran berhasil disimpan', 'success')
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
                {!invoiceSuperman && (
                  <p className="text-xs text-slate-400 mt-1">
                    Catat pembayaran dulu. Superman dibuat terpisah setelah invoice lunas dan dokumen wajib lengkap.
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
                Wajib: Kontrak, Invoice, dan Rekening Koran Penerimaan. Ketiga file ini dilampirkan ke Superman. Kuitansi opsional.
              </p>
            </CardHeader>
            <CardContent className="space-y-4">
              <div className="grid grid-cols-1 md:grid-cols-2 xl:grid-cols-4 gap-3">
                {currentKontrak?.no_kontrak && (
                  <DocumentUpload
                    entityType="kontrak"
                    entityId={currentKontrak.no_kontrak}
                    docType="kontrak"
                    onUploaded={handleDocumentUploaded}
                  />
                )}
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
                  {selectedInvoice && sisaPembayaran > 0 && (
                    <p className="text-xs text-slate-500 mt-1">Sisa tersedia: {formatCurrency(sisaPembayaran)}</p>
                  )}
                  {currentPphAddon > 0 && (
                    <p className="text-xs text-emerald-700 mt-1">
                      + PPh disetor: {formatCurrency(currentPphAddon)} → pelunasan efektif{' '}
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
                  {currentKontrak?.is_pph === 'true' && String(isPphDisetor || 'false') !== 'true' && (
                    <p className="text-xs text-amber-700 mt-1">
                      Jika pembeli memotong PPh, pilih <strong>Sudah</strong> agar pelunasan dihitung lengkap
                      dan menu Superman muncul.
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
                    <span className="text-slate-500">Sisa:</span>
                    <span className="font-medium">{formatCurrency(Math.max(0, invoiceTotal - paidTotalAll))}</span>
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
                      {sisaAfterSave > 0.5 && afterThisPct < 100 && (
                        <> · sisa {formatCurrency(sisaAfterSave)}</>
                      )}
                    </p>
                  </div>
                  {invoicePembayaran.length > 0 && (
                    <div className="border-t pt-3">
                      <p className="text-xs font-semibold text-slate-600 mb-2">Riwayat Termin</p>
                      <div className="space-y-1">
                        {invoicePembayaran.map((p) => (
                          <button
                            key={p.no_pembayaran}
                            type="button"
                            onClick={() => loadPembayaran(p.no_pembayaran)}
                            className={cn(
                              'w-full flex justify-between text-xs px-2 py-1 rounded hover:bg-slate-100',
                              savedNo === p.no_pembayaran && 'bg-slate-100 font-medium',
                            )}
                          >
                            <span className="text-slate-600 font-mono">{p.no_pembayaran}</span>
                            <span>{formatCurrency(p.nominal_transfer)}</span>
                          </button>
                        ))}
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

        {docsReady && !willCompleteInvoice && !isInvoiceFullyPaid && !invoiceSuperman && selectedInvoice && (
          <Card>
            <CardContent className="py-4 text-sm text-amber-800">
              Dokumen sudah lengkap, tetapi invoice belum lunas
              {sisaAfterSave > 0.5 && <> (sisa {formatCurrency(sisaAfterSave)})</>}.
              {currentKontrak?.is_pph === 'true' && String(isPphDisetor || 'false') !== 'true' && (
                <> Jika transfer sudah termasuk pemotongan PPh pembeli, ubah <strong>PPh Disetor</strong> ke{' '}
                <strong>Sudah</strong>.</>
              )}
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
                disabled={!docsReady || supermanRunning || !canEdit()}
                onClick={() => startSupermanFlow(selectedInvoice)}
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
                  disabled={actionsBusy || !docsReady}
                  className="gap-2"
                  onClick={() => void onSaveAndSuperman()}
                  title={!docsReady ? 'Upload dokumen wajib terlebih dahulu' : undefined}
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
        noInvoice={selectedInvoice || undefined}
        percent={percent}
        stage={stage}
      />
    </div>
  )
}