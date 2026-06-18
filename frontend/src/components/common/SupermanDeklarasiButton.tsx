import { useState } from 'react'
import { ExternalLink, Loader2, Send } from 'lucide-react'
import { Button } from '@/components/ui/button'
import { ConfirmDialog } from '@/components/common/ConfirmDialog'
import { SupermanCaptchaDialog } from '@/components/common/SupermanCaptchaDialog'
import { useAppStore } from '@/store/appStore'
import { useAuthStore } from '@/store/authStore'
import { client } from '@/lib/client'
import { cn } from '@/lib/utils'
import type { SupermanDeklarasiResult, SupermanStatus } from '@/types'

interface SupermanDeklarasiButtonProps {
  noDo: string
  compact?: boolean
  disabled?: boolean
  className?: string
}

export function SupermanDeklarasiButton({
  noDo,
  compact = false,
  disabled = false,
  className,
}: SupermanDeklarasiButtonProps) {
  const { addNotification } = useAppStore()
  const canEdit = useAuthStore((s) => s.canEdit)
  const [open, setOpen] = useState(false)
  const [captchaOpen, setCaptchaOpen] = useState(false)
  const [loading, setLoading] = useState(false)

  const runDeklarasi = async () => {
    setLoading(true)
    try {
      const res = await client.post<SupermanDeklarasiResult>(
        `/api/superman/deklarasi?no_do=${encodeURIComponent(noDo)}`,
      )
      const parts = [
        res.sppn_no ? `SPPn ${res.sppn_no}` : null,
        res.sppb_no ? `SPPb ${res.sppb_no}` : null,
      ].filter(Boolean)
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
    } catch (err) {
      const message = err instanceof Error ? err.message : 'Gagal membuat SPPn di Superman'
      if (message.includes('captcha') || message.includes('Session Superman')) {
        setCaptchaOpen(true)
        return
      }
      addNotification(message, 'error')
    } finally {
      setLoading(false)
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

  return (
    <>
      <Button
        type="button"
        variant={compact ? 'outline' : 'secondary'}
        size={compact ? 'sm' : 'default'}
        className={cn(compact ? 'h-8 text-xs gap-1.5' : 'gap-2', className)}
        disabled={disabled || loading || !noDo}
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
        description={`Draft masuk To Do List Superman untuk DO ${noDo}. Pastikan dokumen kontrak/BA sudah di-upload. Jika ada PPh, sistem otomatis membuat SPPb + SPPn.`}
        confirmLabel={loading ? 'Memproses...' : 'Buat di Superman'}
        isLoading={loading}
        onConfirm={handleConfirm}
      />

      <SupermanCaptchaDialog
        open={captchaOpen}
        onOpenChange={setCaptchaOpen}
        onVerified={handleCaptchaVerified}
      />
    </>
  )
}