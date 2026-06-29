import { Loader2 } from 'lucide-react'
import {
  Dialog,
  DialogContent,
  DialogDescription,
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
}

export function SupermanProgressDialog({
  open,
  noInvoice,
  noPembayaran,
  percent,
  stage,
}: SupermanProgressDialogProps) {
  const refLabel = noInvoice || noPembayaran || '-'
  const clamped = Math.max(0, Math.min(100, percent))

  return (
    <Dialog open={open} onOpenChange={() => {}}>
      <DialogContent
        className="sm:max-w-md"
        onPointerDownOutside={(e) => e.preventDefault()}
        onEscapeKeyDown={(e) => e.preventDefault()}
      >
        <DialogHeader>
          <DialogTitle className="flex items-center gap-2">
            <Loader2 className="h-4 w-4 animate-spin" />
            Membuat SPPn Superman
          </DialogTitle>
          <DialogDescription>
            Invoice {refLabel} — mohon tunggu, proses berjalan di server (~1–2 menit).
          </DialogDescription>
        </DialogHeader>
        <div className="space-y-2">
          <div className="h-2 w-full overflow-hidden rounded-full bg-muted">
            <div
              className={cn('h-full bg-primary transition-all duration-300')}
              style={{ width: `${clamped}%` }}
            />
          </div>
          <p className="text-sm text-muted-foreground">{stage}</p>
          <p className="text-xs text-muted-foreground text-right">{clamped}%</p>
        </div>
      </DialogContent>
    </Dialog>
  )
}