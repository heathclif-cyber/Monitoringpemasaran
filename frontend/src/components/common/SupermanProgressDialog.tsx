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
  noDo: string
  percent: number
  stage: string
}

export function SupermanProgressDialog({
  open,
  noDo,
  percent,
  stage,
}: SupermanProgressDialogProps) {
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
            DO {noDo} — mohon tunggu, proses berjalan di server (~1–2 menit).
          </DialogDescription>
        </DialogHeader>

        <div className="space-y-3 pt-2">
          <div className="flex items-center justify-between text-sm">
            <span className="text-muted-foreground">{stage}</span>
            <span className="font-semibold tabular-nums">{clamped}%</span>
          </div>
          <div className="h-3 w-full overflow-hidden rounded-full bg-muted">
            <div
              className={cn(
                'h-full rounded-full bg-primary transition-all duration-500 ease-out',
                clamped >= 100 && 'bg-emerald-500',
              )}
              style={{ width: `${clamped}%` }}
            />
          </div>
        </div>
      </DialogContent>
    </Dialog>
  )
}