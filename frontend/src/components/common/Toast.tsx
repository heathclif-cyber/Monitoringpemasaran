import { useAppStore } from '@/store/appStore'
import { cn } from '@/lib/utils'
import { CheckCircle, XCircle, AlertTriangle, Info, X } from 'lucide-react'

const ICON_MAP = {
  success: CheckCircle,
  error: XCircle,
  warning: AlertTriangle,
  info: Info,
}

const COLOR_MAP = {
  success: 'border-l-green-500 bg-green-50',
  error: 'border-l-red-500 bg-red-50',
  warning: 'border-l-amber-500 bg-amber-50',
  info: 'border-l-blue-500 bg-blue-50',
}

const ICON_COLOR_MAP = {
  success: 'text-green-500',
  error: 'text-red-500',
  warning: 'text-amber-500',
  info: 'text-blue-500',
}

export function Toast() {
  const notifications = useAppStore((s) => s.notifications)
  const removeNotification = useAppStore((s) => s.removeNotification)

  return (
    <div className="fixed top-4 right-4 z-[100] flex flex-col gap-2 pointer-events-none">
      {notifications.map((n) => {
        const Icon = ICON_MAP[n.type]
        return (
          <div
            key={n.id}
            className={cn(
              'min-w-[280px] max-w-md px-4 py-3 rounded-lg bg-card shadow-lg border border-border flex items-start gap-3 pointer-events-auto',
              COLOR_MAP[n.type],
            )}
          >
            <Icon size={15} className={cn('shrink-0', ICON_COLOR_MAP[n.type])} />
            <span className="text-sm font-medium text-foreground flex-1 break-words">{n.message}</span>
            <button
              type="button"
              onClick={() => removeNotification(n.id)}
              className="text-slate-400 hover:text-slate-600 shrink-0"
              aria-label="Tutup notifikasi"
            >
              <X size={14} />
            </button>
          </div>
        )
      })}
    </div>
  )
}
