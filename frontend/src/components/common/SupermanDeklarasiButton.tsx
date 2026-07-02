import { useRef, useState } from 'react'
import { CheckCircle2, ExternalLink, Loader2, Send } from 'lucide-react'
import { Button } from '@/components/ui/button'
import { ConfirmDialog } from '@/components/common/ConfirmDialog'
import { SupermanCaptchaDialog } from '@/components/common/SupermanCaptchaDialog'
import { SupermanProgressDialog } from '@/components/common/SupermanProgressDialog'
import { useAppStore } from '@/store/appStore'
import { useAuthStore } from '@/store/authStore'
import { ApiError, client, isSupermanSessionError } from '@/lib/client'
import { cn } from '@/lib/utils'
import {
  checkSupermanDocsReady,
  extractJobIdFromConflict,
  isSupermanSessionMessage,
  pollSupermanJob,
  recoverSupermanFromTodo,
} from '@/utils/supermanUtils'
import type {
  SupermanDeklarasiJobStart,
  SupermanDeklarasiResult,
  SupermanStatus,
} from '@/types'

interface SupermanDeklarasiButtonProps {
  noInvoice?: string
  noPembayaran?: string
  noDo?: string
  existingSuperman?: string | null
  docsReady?: boolean
  compact?: boolean
  disabled?: boolean
  className?: string
  onSuccess?: (result: SupermanDeklarasiResult) => void | Promise<void>
}

export function SupermanDeklarasiButton({
  noInvoice,
  noPembayaran = '',
  noDo,
  existingSuperman,
  docsReady = true,
  compact = false,
  disabled = false,
  className,
  onSuccess,
}: SupermanDeklarasiButtonProps) {
  const { addNotification } = useAppStore()
  const canEdit = useAuthStore((s) => s.canEdit)
  const [open, setOpen] = useState(false)
  const [captchaOpen, setCaptchaOpen] = useState(false)
  const [progressOpen, setProgressOpen] = useState(false)
  const [loading, setLoading] = useState(false)
  const [recoverLoading, setRecoverLoading] = useState(false)
  const [percent, setPercent] = useState(0)
  const [stage, setStage] = useState('Memulai...')
  const [failed, setFailed] = useState(false)
  const [partial, setPartial] = useState(false)
  const [failedMessage, setFailedMessage] = useState('')
  const [lastInvoice, setLastInvoice] = useState<string | undefined>(noInvoice)
  const cancelledRef = useRef(false)

  const savedLabel = (existingSuperman || '').trim()

  const resetProgressState = () => {
    setFailed(false)
    setPartial(false)
    setFailedMessage('')
    setPercent(0)
    setStage('Memulai...')
  }

  const closeProgress = () => {
    setProgressOpen(false)
    resetProgressState()
  }

  const showResult = async (res: SupermanDeklarasiResult) => {
    const parts = [
      res.sppn_no ? `SPPn ${res.sppn_no}` : null,
      res.sppb_no ? `SPPb ${res.sppb_no}` : null,
    ].filter(Boolean)

    if (res.recovered || (res.ok && res.superman_saved)) {
      addNotification(`Superman: ${res.superman_saved || parts.join(' + ')}`, 'success')
      if (res.superman_url) {
        window.open(res.superman_url, '_blank', 'noopener,noreferrer')
      }
      setOpen(false)
      closeProgress()
      try {
        await onSuccess?.(res)
      } catch (err) {
        console.error('[SupermanDeklarasiButton.onSuccess]', err)
      }
      return
    }

    if (res.partial || (!res.ok && parts.length)) {
      setPartial(true)
      setStage(res.message || 'Nomor Superman belum tersimpan otomatis')
      setPercent(100)
      addNotification(
        parts.length
          ? `Superman: ${parts.join(' + ')} dibuat, namun nomor belum tersimpan. Gunakan Pulihkan dari To Do.`
          : res.message,
        'warning',
      )
      return
    }

    if (parts.length && !res.superman_saved) {
      setPartial(true)
      setStage(res.message)
      setPercent(100)
      addNotification(
        `Superman: ${parts.join(' + ')} dibuat, tetapi nomor belum tersimpan ke kolom Superman. Salin manual.`,
        'warning',
      )
      return
    }

    addNotification(
      parts.length
        ? `Superman: ${parts.join(' + ')} masuk To Do List`
        : res.message,
      'success',
    )
    if (res.superman_url) {
      window.open(res.superman_url, '_blank', 'noopener,noreferrer')
    }
    setOpen(false)
    closeProgress()
    try {
      await onSuccess?.(res)
    } catch (err) {
      console.error('[SupermanDeklarasiButton.onSuccess]', err)
    }
  }

  const runDeklarasi = async () => {
    const invoiceRef = noInvoice || lastInvoice
    if (invoiceRef) {
      try {
        const docCheck = await checkSupermanDocsReady(invoiceRef)
        if (!docCheck.ready) {
          addNotification(docCheck.message, 'warning')
          return
        }
      } catch (err) {
        addNotification(
          err instanceof Error ? err.message : 'Gagal memuat status dokumen pendukung',
          'error',
        )
        return
      }
    } else if (noPembayaran) {
      try {
        const res = await client.get<{ ready: boolean; requirements: { required?: boolean; uploaded?: boolean; upload_hint?: string; label: string }[] }>(
          `/api/superman/doc-requirements?no_pembayaran=${encodeURIComponent(noPembayaran)}`,
        )
        if (!res.ready) {
          const missing = res.requirements
            .filter((r) => r.required !== false && !r.uploaded)
            .map((r) => r.upload_hint || r.label)
            .join('; ')
          addNotification(
            missing
              ? `Dokumen wajib belum lengkap: ${missing}`
              : 'Upload dokumen wajib terlebih dahulu sebelum membuat SPPn Superman.',
            'warning',
          )
          return
        }
      } catch (err) {
        addNotification(
          err instanceof Error ? err.message : 'Gagal memuat status dokumen pendukung',
          'error',
        )
        return
      }
    }

    cancelledRef.current = false
    setLoading(true)
    resetProgressState()
    setProgressOpen(true)
    setOpen(false)

    try {
      const params = new URLSearchParams()
      if (noInvoice) params.set('no_invoice', noInvoice)
      else if (noPembayaran) params.set('no_pembayaran', noPembayaran)
      if (noDo) params.set('no_do', noDo)
      let jobId: string
      const invoiceRef = noInvoice || ''
      try {
        const start = await client.post<SupermanDeklarasiJobStart>(
          `/api/superman/deklarasi/start?${params.toString()}`,
        )
        setLastInvoice(start.no_invoice || noInvoice)
        jobId = start.job_id
      } catch (startErr: unknown) {
        const detail = startErr instanceof ApiError ? startErr.message : ''
        const resumeId =
          startErr instanceof ApiError && startErr.status === 409
            ? extractJobIdFromConflict(detail)
            : null
        if (!resumeId) throw startErr
        jobId = resumeId
        addNotification('Melanjutkan job Superman yang masih berjalan...', 'info')
      }
      const result = await pollSupermanJob(jobId, {
        noInvoice: invoiceRef || undefined,
        isCancelled: () => cancelledRef.current,
        onProgress: (p, s) => {
          setPercent(p)
          setStage(s)
        },
      })
      await showResult(result)
    } catch (err) {
      const message = err instanceof Error ? err.message : 'Gagal membuat SPPn di Superman'
      if (isSupermanSessionError(err) || isSupermanSessionMessage(message)) {
        closeProgress()
        setCaptchaOpen(true)
        return
      }
      setFailed(true)
      setFailedMessage(message)
      setStage(message)
      addNotification(message, 'error')
    } finally {
      setLoading(false)
    }
  }

  const handleRecover = async () => {
    const invoiceRef = lastInvoice || noInvoice
    if (!invoiceRef) return
    setRecoverLoading(true)
    try {
      const res = await recoverSupermanFromTodo(invoiceRef)
      if (res.ok && res.superman_saved) {
        addNotification(`Nomor Superman dipulihkan: ${res.superman_saved}`, 'success')
        closeProgress()
        setOpen(false)
        await onSuccess?.({
          ok: true,
          no_invoice: invoiceRef,
          no_kontrak: '',
          jenis_form: '',
          pph_nominal: 0,
          total_sppn: 0,
          support_doc: '',
          superman_url: '',
          message: res.message || 'Dipulihkan dari To Do List',
          superman_saved: res.superman_saved,
        })
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

  const handleConfirm = async () => {
    setLoading(true)
    try {
      const status = await client.get<SupermanStatus>('/api/superman/status')
      if (!status.session_valid) {
        setOpen(false)
        setCaptchaOpen(true)
        return
      }
      await runDeklarasi()
    } catch (err) {
      if (isSupermanSessionError(err)) {
        setOpen(false)
        setCaptchaOpen(true)
        return
      }
      addNotification(
        err instanceof Error ? err.message : 'Gagal memeriksa session Superman',
        'error',
      )
    } finally {
      setLoading(false)
    }
  }

  const handleCaptchaVerified = () => {
    addNotification('Login Superman berhasil. Melanjutkan pembuatan SPPn...', 'success')
    void runDeklarasi()
  }

  if (!canEdit()) return null

  if (savedLabel) {
    if (compact) {
      return (
        <span
          className={cn('inline-flex items-center gap-1 text-[11px] text-emerald-700 dark:text-emerald-400', className)}
          title={`Sudah dibuat: ${savedLabel}`}
        >
          <CheckCircle2 size={12} />
          Sudah SPPn
        </span>
      )
    }
    return (
      <div className={cn('inline-flex items-center gap-2 text-sm text-emerald-700 dark:text-emerald-400', className)}>
        <CheckCircle2 size={14} />
        <span>Sudah dibuat: {savedLabel}</span>
      </div>
    )
  }

  return (
    <>
      <Button
        type="button"
        variant={compact ? 'outline' : 'secondary'}
        size={compact ? 'sm' : 'default'}
        className={cn(compact ? 'h-8 text-xs gap-1.5' : 'gap-2', className)}
        disabled={disabled || loading || !(noInvoice || noPembayaran)}
        onClick={() => setOpen(true)}
      >
        {loading ? <Loader2 size={compact ? 12 : 14} className="animate-spin" /> : <Send size={compact ? 12 : 14} />}
        {compact ? 'SPPn Superman' : 'Buat SPPn Superman'}
        {!compact && <ExternalLink size={12} className="opacity-60" />}
      </Button>

      <ConfirmDialog
        open={open}
        onOpenChange={setOpen}
        title="Buat SPPn di Superman"
        description={`Draft masuk To Do List Superman untuk invoice ${noInvoice || noPembayaran}. Nomor invoice dipakai sebagai referensi Superman (AU58). Wajib upload Kontrak, Invoice, dan Rekening Koran Penerimaan; kuitansi opsional. Jika kontrak kena PPh, sistem otomatis membuat SPPb + SPPn.`}
        confirmLabel={loading ? 'Memproses...' : 'Buat di Superman'}
        isLoading={loading}
        onConfirm={handleConfirm}
      />

      <SupermanCaptchaDialog
        open={captchaOpen}
        onOpenChange={setCaptchaOpen}
        onVerified={handleCaptchaVerified}
      />

      <SupermanProgressDialog
        open={progressOpen}
        noInvoice={lastInvoice || noInvoice}
        noPembayaran={noPembayaran}
        percent={percent}
        stage={stage}
        running={loading && !failed && !partial}
        failed={failed}
        failedMessage={failedMessage}
        partial={partial}
        recoverLoading={recoverLoading}
        onCancel={() => {
          cancelledRef.current = true
          closeProgress()
          setLoading(false)
        }}
        onClose={closeProgress}
        onRecover={handleRecover}
      />
    </>
  )
}