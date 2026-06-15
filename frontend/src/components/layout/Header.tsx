import { useLocation } from 'react-router-dom'
import { getPageMeta } from '@/lib/pageMeta'
import { ThemeToggle } from '@/components/common/ThemeToggle'

export function Header() {
  const location = useLocation()
  const meta = getPageMeta(location.pathname)

  return (
    <header
      className="fixed top-0 right-0 z-40 flex h-14 items-center justify-between border-b border-border bg-card/95 backdrop-blur-sm px-6"
      style={{ left: 'var(--sidebar-width, 240px)' }}
    >
      <div className="min-w-0">
        {meta.breadcrumb && (
          <p className="text-[11px] font-medium text-muted-foreground truncate">{meta.breadcrumb}</p>
        )}
        <h2 className="text-[15px] font-semibold text-foreground leading-tight truncate">{meta.title}</h2>
      </div>
      <div className="flex items-center gap-2">
        <ThemeToggle />
        <kbd className="hidden sm:inline-flex h-7 items-center gap-1 rounded-md border border-border bg-muted px-2 text-[11px] font-medium text-muted-foreground">
          <span className="text-xs">⌘</span>K
        </kbd>
      </div>
    </header>
  )
}