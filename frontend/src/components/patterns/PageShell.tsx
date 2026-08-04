import { cn } from '@/lib/utils'

const WIDTH: Record<NonNullable<PageShellProps['width']>, string> = {
  default: 'w-full',
  narrow: 'max-w-5xl',
  wide: 'max-w-[1600px] w-full',
  full: 'w-full max-w-none',
}

export interface PageShellProps {
  children: React.ReactNode
  className?: string
  /** default = ikut parent; narrow = form/ops unit; wide = data padat; full = full bleed */
  width?: 'default' | 'narrow' | 'wide' | 'full'
  /** Vertical gap between sections */
  density?: 'default' | 'compact'
}

/**
 * Standar wrapper konten halaman.
 * @see docs/architecture/DESIGN_SYSTEM.md §4.1
 */
export function PageShell({
  children,
  className,
  width = 'default',
  density = 'default',
}: PageShellProps) {
  return (
    <div
      className={cn(
        WIDTH[width],
        density === 'compact' ? 'space-y-3' : 'space-y-4',
        className,
      )}
    >
      {children}
    </div>
  )
}
