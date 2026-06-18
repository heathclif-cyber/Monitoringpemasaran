import { useEffect, useState } from 'react'
import { Loader2, RefreshCw } from 'lucide-react'
import {
  Dialog,
  DialogContent,
  DialogDescription,
  DialogFooter,
  DialogHeader,
  DialogTitle,
} from '@/components/ui/dialog'
import { Button } from '@/components/ui/button'
import { Input } from '@/components/ui/input'
import { Label } from '@/components/ui/label'
import { client } from '@/lib/client'
import type { SupermanCaptchaChallenge, SupermanCaptchaVerifyResult } from '@/types'

interface SupermanCaptchaDialogProps {
  open: boolean
  onOpenChange: (open: boolean) => void
  onVerified: () => void
}

export function SupermanCaptchaDialog({
  open,
  onOpenChange,
  onVerified,
}: SupermanCaptchaDialogProps) {
  const [loading, setLoading] = useState(false)
  const [refreshing, setRefreshing] = useState(false)
  const [submitting, setSubmitting] = useState(false)
  const [answer, setAnswer] = useState('')
  const [error, setError] = useState<string | null>(null)
  const [challenge, setChallenge] = useState<SupermanCaptchaChallenge | null>(null)

  const loadCaptcha = async (challengeId?: string) => {
    if (challengeId) {
      setRefreshing(true)
      try {
        const res = await client.post<SupermanCaptchaChallenge>(
          `/api/superman/captcha/refresh?challenge_id=${encodeURIComponent(challengeId)}`,
        )
        setChallenge(res)
        setAnswer('')
        setError(null)
      } catch (err) {
        setError(err instanceof Error ? err.message : 'Gagal memuat ulang captcha')
        setChallenge(null)
      } finally {
        setRefreshing(false)
      }
      return
    }

    setLoading(true)
    setError(null)
    try {
      const res = await client.get<SupermanCaptchaChallenge>('/api/superman/captcha')
      setChallenge(res)
      setAnswer('')
    } catch (err) {
      setError(err instanceof Error ? err.message : 'Gagal memuat captcha Superman')
      setChallenge(null)
    } finally {
      setLoading(false)
    }
  }

  useEffect(() => {
    if (open) {
      void loadCaptcha()
    } else {
      setChallenge(null)
      setAnswer('')
      setError(null)
    }
  }, [open])

  const handleVerify = async () => {
    if (!challenge || !answer.trim()) return
    setSubmitting(true)
    setError(null)
    try {
      const res = await client.post<SupermanCaptchaVerifyResult>('/api/superman/captcha/verify', {
        challenge_id: challenge.challenge_id,
        answer: answer.trim(),
      })
      if (!res.ok) {
        setError(res.error || 'Captcha salah')
        if (res.challenge_id && res.image_base64) {
          setChallenge({
            challenge_id: res.challenge_id,
            image_base64: res.image_base64,
            mime_type: res.mime_type || 'image/png',
          })
        }
        setAnswer('')
        return
      }
      onVerified()
      onOpenChange(false)
    } catch (err) {
      setError(err instanceof Error ? err.message : 'Gagal verifikasi captcha')
    } finally {
      setSubmitting(false)
    }
  }

  const imageSrc = challenge
    ? `data:${challenge.mime_type};base64,${challenge.image_base64}`
    : null

  return (
    <Dialog open={open} onOpenChange={onOpenChange}>
      <DialogContent className="sm:max-w-md">
        <DialogHeader>
          <DialogTitle>Login Superman</DialogTitle>
          <DialogDescription>
            Selesaikan hitungan pada gambar captcha di bawah. Masukkan <strong>hasil angka saja</strong>
            {' '}(contoh: 3+5 → 8), tanpa tanda plus/minus.
          </DialogDescription>
        </DialogHeader>

        <div className="space-y-4">
          <div className="flex min-h-[72px] items-center justify-center rounded-md border bg-muted/40 p-3">
            {loading ? (
              <Loader2 className="h-6 w-6 animate-spin text-muted-foreground" />
            ) : imageSrc ? (
              <img
                src={imageSrc}
                alt="Captcha login Superman"
                className="max-h-20 rounded border bg-white"
              />
            ) : (
              <span className="text-sm text-muted-foreground">Captcha tidak tersedia</span>
            )}
          </div>

          <div className="space-y-2">
            <Label htmlFor="superman-captcha-answer">Jawaban captcha</Label>
            <Input
              id="superman-captcha-answer"
              inputMode="text"
              placeholder="Hasil hitungan, contoh: 8"
              value={answer}
              onChange={(e) => setAnswer(e.target.value)}
              disabled={submitting || loading || !challenge}
              onKeyDown={(e) => {
                if (e.key === 'Enter') void handleVerify()
              }}
            />
          </div>

          {error && <p className="text-sm text-destructive">{error}</p>}
        </div>

        <DialogFooter className="gap-2 sm:gap-0">
          <Button
            type="button"
            variant="outline"
            onClick={() => void loadCaptcha(challenge?.challenge_id)}
            disabled={!challenge || loading || refreshing || submitting}
          >
            {refreshing ? (
              <Loader2 className="mr-2 h-4 w-4 animate-spin" />
            ) : (
              <RefreshCw className="mr-2 h-4 w-4" />
            )}
            Gambar baru
          </Button>
          <Button
            type="button"
            onClick={() => void handleVerify()}
            disabled={!challenge || !answer.trim() || loading || submitting}
          >
            {submitting ? (
              <>
                <Loader2 className="mr-2 h-4 w-4 animate-spin" />
                Memverifikasi...
              </>
            ) : (
              'Lanjutkan'
            )}
          </Button>
        </DialogFooter>
      </DialogContent>
    </Dialog>
  )
}