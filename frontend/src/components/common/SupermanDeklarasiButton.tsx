import { useRef, useState } from 'react'
import { CheckCircle2, ExternalLink, Loader2, Send } from 'lucide-react'
import { Button } from '@/components/ui/button'
import { ConfirmDialog } from '@/components/common/ConfirmDialog'
import { SupermanCaptchaDialog } from '@/components/common/SupermanCaptchaDialog'
import { SupermanProgressDialog } from '@/components/common/SupermanProgressDialog'
import { useAppStore } from '@/store/appStore'
import { useAuthStore } from '@/store/authStore'
import { client } from '@/lib/client'
import { cn } from '@/lib/utils'
import type {
  SupermanDeklarasiJobStart,
  SupermanDeklarasiProgress,
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

const POLL_INTERVAL_MS = 1000

function sleep(ms: number) {
  return new Promise((resolve) => setTimeout(resolve, ms))
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
  const [percent, setPercent] = useState(0)
  const [stage, setStage] = useState('Memulai...')
  const cancelledRef = useRef(false)

  const savedLabel = (existingSuperman || '').trim()

  const showResult = async (res: SupermanDeklarasiResult) => {
    const parts = [
      res.sppn_no ? `SPPn ${res.sppn_no}` : null,
      res.sppb_no ? `SPPb ${res.sppb_no}` : null,
    ].filter(Boolean)
    if (parts.length && !res.superman_saved) {
      addNotification(
        `Superman: ${parts.join(' + ')} dibuat, tetapi nomor belum tersimpan ke kolom Superman. Salin manual.`,
        'warning',
      )
    } else {
      addNotification(
        parts.length
          ? `Superman: ${parts.join(' + ')} masuk To Do List`
          : res.message,
        'success',
      )
    }
    if (res.superman_url) {
      window.open(res.superman_url, '_blank', 'noopener,noreferrer')
    }
    setOpen(false)
    try {
      await onSuccess?.(res)
    } catch (err) {
      console.error('[SupermanDeklarasiButton.onSuccess]', err)
    }
  }

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

  const runDeklarasi = async () => {
    cancelledRef.current = false
    setLoading(true)
    setPercent(0)
    setStage('Memulai...')
    setProgressOpen(true)
    setOpen(false)

    try {
      const params = new URLSearchParams()
      if (noInvoice) params.set('no_invoice', noInvoice)
      else if (noPembayaran) params.set('no_pembayaran', noPembayaran)
      if (noDo) params.set('no_do', noDo)
      const start = await client.post<SupermanDeklarasiJobStart>(
        `/api/superman/deklarasi/start?${params.toString()}`,
      )
      const result = await pollJob(start.job_id)
      await showResult(result)
    } catch (err) {
      const message = err instanceof Error ? err.message : 'Gagal membuat SPPn di Superman'
      if (message.includes('captcha') || message.includes('Session Superman')) {
        setProgressOpen(false)
        setCaptchaOpen(true)
        return
      }
      addNotification(message, 'error')
    } finally {
      setLoading(false)
      setProgressOpen(false)
    }
  }

  const handleConfirm = async () => {
    if (!docsReady) {
      addNotification('Upload dokumen wajib terlebih dahulu sebelum membuat SPPn Superman.', 'warning')
      return
    }
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
        disabled={disabled || loading || !(noInvoice || noPembayaran) || !docsReady}
        title={!docsReady ? 'Upload dokumen wajib terlebih dahulu' : undefined}
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
        noInvoice={noInvoice}
        noPembayaran={noPembayaran}
        percent={percent}
        stage={stage}
      />
    </>
  )
}