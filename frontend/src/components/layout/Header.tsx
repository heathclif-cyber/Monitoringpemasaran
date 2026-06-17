import { useLocation, useNavigate } from 'react-router-dom'
import { LogOut } from 'lucide-react'
import { getPageMeta } from '@/lib/pageMeta'
import { ThemeToggle } from '@/components/common/ThemeToggle'
import { Button } from '@/components/ui/button'
import { useAuthStore } from '@/store/authStore'

const ROLE_LABELS: Record<string, string> = { admin: 'Admin', staff: 'Staff', tamu: 'Tamu' }

export function Header() {
  const location = useLocation()
  const navigate = useNavigate()
  const meta = getPageMeta(location.pathname)
  const user = useAuthStore((s) => s.user)
  const logout = useAuthStore((s) => s.logout)

  const handleLogout = () => {
    logout()
    navigate('/login', { replace: true })
  }

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
        {user && (
          <div className="flex items-center gap-2 ml-1 pl-3 border-l border-border">
            <div className="text-right hidden sm:block">
              <p className="text-[12px] font-medium text-foreground leading-tight">{user.nama_lengkap}</p>
              <p className="text-[10px] text-muted-foreground">{ROLE_LABELS[user.role] ?? user.role}</p>
            </div>
            <Button
              variant="ghost"
              size="icon"
              className="h-8 w-8 text-muted-foreground hover:text-foreground"
              title="Keluar"
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
