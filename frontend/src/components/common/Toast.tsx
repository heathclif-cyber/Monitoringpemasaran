import { useAppStore } from '@/store/appStore'
import { cn } from '@/lib/utils'
import { CheckCircle, XCircle, AlertTriangle, Info } from 'lucide-react'

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

  return (
    <div className="fixed top-6 right-6 z-[100] flex flex-col gap-3 pointer-events-none">
      {notifications.map((n) => {
        const Icon = ICON_MAP[n.type]
        return (
          <div
            key={n.id}
            className={cn(
              'min-w-[320px] px-5 py-4 rounded-2xl bg-white shadow-xl border-l-[6px] flex items-center gap-3 pointer-events-auto animate-in slide-in-from-right-full',
              COLOR_MAP[n.type],
            )}
          >
            <Icon size={16} className={cn('shrink-0', ICON_COLOR_MAP[n.type])} />
            <span className="text-sm font-semibold text-slate-800">{n.message}</span>
          </div>
        )
      })}
    </div>
  )
}
