import { useState } from 'react'
import { NavLink, useLocation } from 'react-router-dom'
import {
  LayoutDashboard,
  FileText,
  Receipt,
  Truck,
  Table,
  Zap,
  Archive,
  ChevronDown,
  PanelLeftClose,
  PanelLeft,
  CloudUpload,
  ClipboardList,
  Boxes,
  Users,
} from 'lucide-react'
import { cn } from '@/lib/utils'
import { useAppStore } from '@/store/appStore'
import { useAuthStore } from '@/store/authStore'
import { Button } from '@/components/ui/button'

interface NavItemDef {
  label: string
  to?: string
  icon: React.ReactNode
  children?: { label: string; to: string }[]
}

const navItems: NavItemDef[] = [
  { label: 'Dashboard', to: '/', icon: <LayoutDashboard size={16} /> },
  { label: 'Buat Kontrak', to: '/kontrak', icon: <FileText size={16} /> },
  { label: 'Cetak Invoice', to: '/invoice', icon: <Receipt size={16} /> },
  { label: 'Delivery Order', to: '/delivery-order', icon: <Truck size={16} /> },
  { label: 'Berita Acara', to: '/berita-acara', icon: <ClipboardList size={16} /> },
  { label: 'Upload Dokumen', to: '/upload', icon: <CloudUpload size={16} /> },
  { label: 'Input Stok', to: '/stok', icon: <Boxes size={16} /> },
  { label: 'Laporan Digital', to: '/laporan', icon: <Table size={16} /> },
  { label: 'Input Bypass', to: '/bypass', icon: <Zap size={16} /> },
  {
    label: 'Repository',
    icon: <Archive size={16} />,
    children: [
      { label: 'Kontrak', to: '/repo/kontrak' },
      { label: 'Invoice', to: '/repo/invoice' },
      { label: 'Delivery Order', to: '/repo/do' },
    ],
  },
]

function NavParent({
  item,
  defaultOpen,
  collapsed,
}: {
  item: NavItemDef
  defaultOpen: boolean
  collapsed: boolean
}) {
  const [open, setOpen] = useState(defaultOpen)
  const location = useLocation()
  const hasActiveChild = item.children?.some((c) => location.pathname === c.to)

  if (collapsed) {
    return (
      <div className="px-2">
        <div
          title={item.label}
          className={cn(
            'flex h-9 w-9 items-center justify-center rounded-md mx-auto transition-colors',
            hasActiveChild ? 'bg-primary/10 text-primary' : 'text-muted-foreground hover:bg-muted hover:text-foreground',
          )}
        >
          {item.icon}
        </div>
      </div>
    )
  }

  return (
    <div>
      <button
        type="button"
        onClick={() => setOpen(!open)}
        className={cn(
          'flex items-center w-full py-2 px-3 mx-2 rounded-md text-[13px] font-medium transition-colors',
          hasActiveChild
            ? 'text-foreground bg-muted'
            : 'text-muted-foreground hover:text-foreground hover:bg-muted/60',
        )}
      >
        <span className="w-5 flex justify-center shrink-0 opacity-80">{item.icon}</span>
        <span className="ml-2.5 truncate">{item.label}</span>
        <ChevronDown
          size={12}
          className={cn('ml-auto opacity-50 shrink-0 transition-transform duration-200', open && 'rotate-180')}
        />
      </button>
      <div className={cn('overflow-hidden transition-all duration-200', open ? 'max-h-60' : 'max-h-0')}>
        {item.children?.map((child) => (
          <NavLink
            key={child.to}
            to={child.to}
            className={({ isActive }) =>
              cn(
                'flex items-center py-1.5 pl-9 pr-3 mx-2 my-0.5 rounded-md text-[13px] font-medium transition-colors',
                isActive
                  ? 'bg-primary/10 text-primary font-semibold'
                  : 'text-muted-foreground hover:text-foreground hover:bg-muted/60',
              )
            }
          >
            {child.label}
          </NavLink>
        ))}
      </div>
    </div>
  )
}

export function Sidebar() {
  const location = useLocation()
  const collapsed = useAppStore((s) => s.sidebarCollapsed)
  const toggleSidebar = useAppStore((s) => s.toggleSidebar)
  const isAdmin = useAuthStore((s) => s.isAdmin)
  const user = useAuthStore((s) => s.user)
  const sidebarWidth = collapsed ? '64px' : '240px'

  return (
    <>
      <style>{`:root { --sidebar-width: ${sidebarWidth}; }`}</style>
      <aside
        className="fixed top-0 left-0 z-50 flex h-screen flex-col border-r border-border bg-card transition-[width] duration-200"
        style={{ width: 'var(--sidebar-width, 240px)' }}
      >
        <div className="flex h-14 items-center gap-2.5 border-b border-border px-3 shrink-0">
          <div className="flex h-8 w-8 shrink-0 items-center justify-center rounded-lg bg-primary text-primary-foreground">
            <FileText size={15} />
          </div>
          {!collapsed && (
            <div className="min-w-0 flex-1">
              <h1 className="text-sm font-semibold text-foreground leading-tight truncate">PTPN I</h1>
              <p className="text-[11px] text-muted-foreground font-medium">Regional 8</p>
            </div>
          )}
        </div>

        <nav className="flex-1 overflow-y-auto py-3">
          {!collapsed && (
            <p className="px-4 mb-2 text-[11px] font-medium text-muted-foreground">Menu</p>
          )}
          <ul className="space-y-0.5">
            {navItems.map((item) => {
              if (item.children) {
                return (
                  <li key={item.label}>
                    <NavParent
                      item={item}
                      defaultOpen={item.children.some((c) => location.pathname === c.to)}
                      collapsed={collapsed}
                    />
                  </li>
                )
              }
              return (
                <li key={item.to}>
                  <NavLink
                    to={item.to!}
                    end={item.to === '/'}
                    title={collapsed ? item.label : undefined}
                    className={({ isActive }) =>
                      cn(
                        'flex items-center rounded-md text-[13px] font-medium transition-colors',
                        collapsed ? 'mx-2 h-9 w-9 justify-center' : 'gap-2.5 py-2 px-3 mx-2',
                        isActive
                          ? 'bg-primary/10 text-primary font-semibold'
                          : 'text-muted-foreground hover:text-foreground hover:bg-muted/60',
                      )
                    }
                  >
                    <span className={cn('flex justify-center shrink-0', collapsed ? '' : 'w-5')}>
                      {item.icon}
                    </span>
                    {!collapsed && <span className="truncate">{item.label}</span>}
                  </NavLink>
                </li>
              )
            })}
          </ul>
        </nav>

        {/* Menu admin */}
        {isAdmin() && (
          <div className="px-2 pb-1">
            {!collapsed && (
              <p className="px-2 mb-1 text-[11px] font-medium text-muted-foreground">Admin</p>
            )}
            <NavLink
              to="/users"
              title={collapsed ? 'Kelola User' : undefined}
              className={({ isActive }) =>
                cn(
                  'flex items-center rounded-md text-[13px] font-medium transition-colors',
                  collapsed ? 'mx-0 h-9 w-9 justify-center' : 'gap-2.5 py-2 px-3',
                  isActive
                    ? 'bg-primary/10 text-primary font-semibold'
                    : 'text-muted-foreground hover:text-foreground hover:bg-muted/60',
                )
              }
            >
              <span className={cn('flex justify-center shrink-0', collapsed ? '' : 'w-5')}>
                <Users size={16} />
              </span>
              {!collapsed && <span className="truncate">Kelola User</span>}
            </NavLink>
          </div>
        )}

        {/* Badge tamu */}
        {!collapsed && user?.role === 'tamu' && (
          <div className="px-4 pb-2">
            <div className="rounded-md bg-muted px-3 py-2 text-[11px] text-muted-foreground text-center">
              Mode <strong>Tamu</strong> — hanya bisa lihat
            </div>
          </div>
        )}

        <div className="border-t border-border p-2 shrink-0">
          <Button
            variant="ghost"
            size={collapsed ? 'icon' : 'sm'}
            onClick={toggleSidebar}
            className={cn('w-full text-muted-foreground hover:text-foreground', collapsed && 'h-9 w-9')}
            title={collapsed ? 'Perluas sidebar' : 'Ciutkan sidebar'}
          >
            {collapsed ? (
              <PanelLeft size={16} />
            ) : (
              <>
                <PanelLeftClose size={16} />
                <span className="ml-2">Ciutkan</span>
              </>
            )}
          </Button>
        </div>
      </aside>
    </>
  )
}