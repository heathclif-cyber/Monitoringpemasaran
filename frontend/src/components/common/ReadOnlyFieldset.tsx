import type { ReactNode } from 'react'
import { useAuthStore } from '@/store/authStore'
import { cn } from '@/lib/utils'

interface ReadOnlyFieldsetProps {
  children: ReactNode
  className?: string
}

/** Nonaktifkan seluruh kontrol form untuk akun tamu (lihat saja). */
export function ReadOnlyFieldset({ children, className }: ReadOnlyFieldsetProps) {
  const canEdit = useAuthStore((s) => s.canEdit())
  return (
    <fieldset disabled={!canEdit} className={cn('border-0 p-0 m-0 min-w-0', className)}>
      {children}
    </fieldset>
  )
}