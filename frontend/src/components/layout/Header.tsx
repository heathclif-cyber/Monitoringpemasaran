import { useLocation, useNavigate } from 'react-router-dom'
import { LogOut, Menu } from 'lucide-react'
import { getPageMeta } from '@/lib/pageMeta'
import { ThemeToggle } from '@/components/common/ThemeToggle'
import { Button } from '@/components/ui/button'
import { useAuthStore } from '@/store/authStore'
import { useAppStore } from '@/store/appStore'

const ROLE_LABELS: Record<string, string> = { admin: 'Admin', staff: 'Staff', tamu: 'Tamu' }

export function Header() {
  const location = useLocation()
  const navigate = useNavigate()
  const meta = getPageMeta(location.pathname)
  const user = useAuthStore((s) => s.user)
  const logout = useAuthStore((s) => s.logout)
  const openMobileNav = useAppStore((s) => s.openMobileNav)

  const handleLogout = () => {
    logout()
    navigate('/login', { replace: true })
  }

  return (
    <header
      className="fixed top-0 right-0 left-0 z-40 flex h-14 items-center justify-between border-b border-border bg-card/95 px-4 backdrop-blur-sm sm:px-5 lg:left-[var(--sidebar-width)] lg:px-6"
    >
      <div className="flex min-w-0 items-center gap-2">
        <Button
          variant="ghost"
          size="icon"
          className="h-8 w-8 shrink-0 lg:hidden"
          onClick={openMobileNav}
          aria-label="Buka navigasi"
        >
          <Menu size={18} />
        </Button>
        <div className="min-w-0">
          {meta.breadcrumb && (
            <p className="truncate text-xs font-medium text-muted-foreground">{meta.breadcrumb}</p>
          )}
          <p className="truncate text-sm font-semibold leading-tight text-foreground">{meta.title}</p>
        </div>
      </div>
      <div className="flex items-center gap-2">
        <ThemeToggle />
        <kbd className="hidden sm:inline-flex h-7 items-center gap-1 rounded-md border border-border bg-muted px-2 text-[11px] font-medium text-muted-foreground">
          <span className="text-xs">⌘</span>K
        </kbd>
        {user && (
          <div className="flex items-center gap-2 ml-1 pl-3 border-l border-border">
            <div className="text-right hidden sm:block">
              <p className="text-[12px] font-medium text-foreground leading-tight">{user.nama_lengkap}</p>
              <p className="text-[10px] text-muted-foreground">{user.jabatan ?? ROLE_LABELS[user.role] ?? user.role}</p>
            </div>
            <span className="hidden h-8 w-8 items-center justify-center rounded-full bg-primary/10 text-xs font-semibold text-primary sm:inline-flex" aria-hidden="true">
              {user.nama_lengkap.slice(0, 1).toUpperCase()}
            </span>
            <Button
              variant="ghost"
              size="icon"
              className="h-8 w-8 text-muted-foreground hover:text-foreground"
              title="Keluar"
              aria-label="Keluar dari aplikasi"
              onClick={handleLogout}
            >
              <LogOut size={15} />
            </Button>
          </div>
        )}
      </div>
    </header>
  )
}
