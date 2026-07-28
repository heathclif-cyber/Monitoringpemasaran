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
import type {
  SupermanCaptchaChallenge,
  SupermanCaptchaVerifyResult,
  SupermanConnectivity,
} from '@/types'

interface SupermanCaptchaDialogProps {
  open: boolean
  onOpenChange: (open: boolean) => void
  onVerified: () => void
}

const AGENT_HINT =
  'Jalankan di PC (bukan di server Railway):\n\n' +
  'python scripts/superman/commands/agent.py watch --api https://monitoringpemasaran-production.up.railway.app --username <user_app> --password <pass>\n\n' +
  'Atau double-click: scripts/superman/Mulai-Superman-Agent.bat\n\n' +
  'Biarkan jendela itu terbuka, lalu di web klik lagi «Buat Deklarasi Superman». ' +
  'Captcha & Playwright jalan di PC Anda — app tetap di Railway.'

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
  const [networkBlocked, setNetworkBlocked] = useState(false)
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
        setNetworkBlocked(false)
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
    setNetworkBlocked(false)
    setChallenge(null)
    try {
      // Cek dulu: Railway bisa hubungi portal? Hindari spin 50s di captcha.
      try {
        const conn = await client.get<SupermanConnectivity>('/api/superman/debug/connectivity')
        if (!conn.ok) {
          setNetworkBlocked(true)
          setError(
            conn.hint ||
              `Portal Superman tidak terjangkau dari Railway` +
                (conn.error_type ? ` (${conn.error_type})` : '') +
                '. Captcha di server tidak bisa ditampilkan.',
          )
          return
        }
      } catch {
        // Endpoint connectivity belum ada di deploy lama — lanjut captcha.
      }

      const res = await client.get<SupermanCaptchaChallenge>('/api/superman/captcha')
      setChallenge(res)
      setAnswer('')
      setNetworkBlocked(false)
    } catch (err) {
      const message = err instanceof Error ? err.message : 'Gagal memuat captcha Superman'
      const lower = message.toLowerCase()
      const isNet =
        lower.includes('connecttimeout') ||
        lower.includes('timeout') ||
        lower.includes('jaringan') ||
        lower.includes('railway') ||
        lower.includes('tidak dapat memuat') ||
        lower.includes('tidak bisa dimuat')
      setNetworkBlocked(isNet)
      setError(message)
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
      setNetworkBlocked(false)
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
        let message = res.error || 'Captcha salah'
        if (res.failure_kind === 'credentials' && res.credential_hint) {
          const { username, password_length } = res.credential_hint
          message += ` Server membaca username "${username}" dan password ${password_length} karakter. Periksa SUPERMAN_USER / SUPERMAN_PASSWORD di Railway (jika password ada simbol @, pakai SUPERMAN_PASSWORD_B64).`
        }
        setError(message)
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
            {networkBlocked
              ? 'Captcha di Railway tidak tersedia saat ini karena server app tidak bisa membuka portal Superman.'
              : (
                <>
                  Selesaikan hitungan pada gambar captcha di bawah. Masukkan{' '}
                  <strong>hasil angka saja</strong>
                  {' '}(contoh: 3+5 → 8), tanpa tanda plus/minus.
                </>
              )}
          </DialogDescription>
        </DialogHeader>

        <div className="space-y-4">
          {!networkBlocked && (
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
          )}

          {networkBlocked && (
            <div className="rounded-md border border-amber-200 bg-amber-50 px-3 py-3 text-sm text-amber-950 space-y-2">
              <p className="font-medium">Solusi yang berhasil: agent di PC Anda</p>
              <pre className="whitespace-pre-wrap rounded bg-white/80 p-2 text-[11px] leading-relaxed text-slate-800 border">
                {AGENT_HINT}
              </pre>
              <p className="text-xs text-amber-900/90">
                Mengulang captcha di web tidak akan berhasil sampai jaringan Railway→Superman pulih.
              </p>
            </div>
          )}

          {!networkBlocked && (
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
          )}

          {error && !networkBlocked && <p className="text-sm text-destructive">{error}</p>}
          {error && networkBlocked && (
            <p className="text-xs text-muted-foreground break-words">{error}</p>
          )}
        </div>

        <DialogFooter className="gap-2 sm:gap-0">
          {networkBlocked ? (
            <>
              <Button type="button" variant="outline" onClick={() => void loadCaptcha()} disabled={loading}>
                {loading ? <Loader2 className="mr-2 h-4 w-4 animate-spin" /> : <RefreshCw className="mr-2 h-4 w-4" />}
                Cek lagi jaringan
              </Button>
              <Button type="button" onClick={() => onOpenChange(false)}>
                Tutup
              </Button>
            </>
          ) : (
            <>
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
            </>
          )}
        </DialogFooter>
      </DialogContent>
    </Dialog>
  )
}
