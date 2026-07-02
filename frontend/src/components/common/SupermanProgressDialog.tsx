import { AlertTriangle, Loader2, RotateCcw, X } from 'lucide-react'
import { Button } from '@/components/ui/button'
import {
  Dialog,
  DialogContent,
  DialogDescription,
  DialogFooter,
  DialogHeader,
  DialogTitle,
} from '@/components/ui/dialog'
import { cn } from '@/lib/utils'

interface SupermanProgressDialogProps {
  open: boolean
  noInvoice?: string
  noPembayaran?: string
  percent: number
  stage: string
  running?: boolean
  failed?: boolean
  failedMessage?: string
  partial?: boolean
  recoverLoading?: boolean
  onCancel?: () => void
  onClose?: () => void
  onRecover?: () => void
  onRetry?: () => void
}

export function SupermanProgressDialog({
  open,
  noInvoice,
  noPembayaran,
  percent,
  stage,
  running = true,
  failed = false,
  failedMessage,
  partial = false,
  recoverLoading = false,
  onCancel,
  onClose,
  onRecover,
  onRetry,
}: SupermanProgressDialogProps) {
  const refLabel = noInvoice || noPembayaran || '-'
  const clamped = Math.max(0, Math.min(100, percent))
  const dismissible = failed || partial
  const showRecover = partial && Boolean(noInvoice) && Boolean(onRecover)
  const showRetry = failed && Boolean(noInvoice) && Boolean(onRetry)

  const handleOpenChange = (next: boolean) => {
    if (!next && dismissible) {
      onClose?.()
    }
  }

  return (
    <Dialog open={open} onOpenChange={handleOpenChange}>
      <DialogContent
        className="sm:max-w-md"
        onPointerDownOutside={(e) => {
          if (!dismissible) e.preventDefault()
        }}
        onEscapeKeyDown={(e) => {
          if (!dismissible) e.preventDefault()
        }}
      >
        <DialogHeader>
          <DialogTitle className="flex items-center gap-2">
            {running && !failed && !partial ? (
              <Loader2 className="h-4 w-4 animate-spin" />
            ) : (
              <AlertTriangle className="h-4 w-4 text-amber-500" />
            )}
            {failed ? 'Gagal Membuat SPPn' : partial ? 'SPPn Sebagian Berhasil' : 'Membuat SPPn Superman'}
          </DialogTitle>
          <DialogDescription>
            Invoice {refLabel}
            {running && !failed && !partial
              ? ' — mohon tunggu, proses berjalan di server (~1–2 menit).'
              : failed
                ? ` — ${failedMessage || 'Proses gagal.'}`
                : partial
                  ? ' — draft masuk To Do List, namun nomor belum tersimpan otomatis.'
                  : ''}
          </DialogDescription>
        </DialogHeader>

        <div className="space-y-2">
          <div className="h-2 w-full overflow-hidden rounded-full bg-muted">
            <div
              className={cn(
                'h-full transition-all duration-300',
                failed ? 'bg-destructive' : partial ? 'bg-amber-500' : 'bg-primary',
              )}
              style={{ width: `${clamped}%` }}
            />
          </div>
          <p className="text-sm text-muted-foreground">{stage}</p>
          <p className="text-xs text-muted-foreground text-right">{clamped}%</p>
        </div>

        {(running || failed || partial) && (
          <DialogFooter className="gap-2 sm:gap-2">
            {running && !failed && !partial && onCancel && (
              <Button type="button" variant="outline" size="sm" onClick={onCancel}>
                <X className="h-3.5 w-3.5 mr-1" />
                Batalkan
              </Button>
            )}
            {showRetry && (
              <Button type="button" size="sm" onClick={onRetry}>
                Coba Lagi
              </Button>
            )}
            {showRecover && (
              <Button
                type="button"
                variant="secondary"
                size="sm"
                disabled={recoverLoading}
                onClick={onRecover}
              >
                {recoverLoading ? (
                  <Loader2 className="h-3.5 w-3.5 mr-1 animate-spin" />
                ) : (
                  <RotateCcw className="h-3.5 w-3.5 mr-1" />
                )}
                Pulihkan dari To Do
              </Button>
            )}
            {dismissible && onClose && (
              <Button type="button" variant="outline" size="sm" onClick={onClose}>
                Tutup
              </Button>
            )}
          </DialogFooter>
        )}
      </DialogContent>
    </Dialog>
  )
}