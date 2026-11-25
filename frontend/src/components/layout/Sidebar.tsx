import { useEffect, useRef, useState } from 'react'
import { NavLink, useLocation } from 'react-router-dom'
import {
  LayoutDashboard,
  FileText,
  Receipt,
  Banknote,
  Truck,
  Table,
  Zap,
  Archive,
  ChevronDown,
  PanelLeftClose,
  PanelLeft,
  X,
  CloudUpload,
  ClipboardList,
  ClipboardCheck,
  Boxes,
  Users,
  Wallet,
  LineChart,
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

interface NavGroupDef {
  group: string
  items: NavItemDef[]
}

const navGroups: NavGroupDef[] = [
  {
    group: 'Utama',
    items: [
      { label: 'Dashboard', to: '/', icon: <LayoutDashboard size={16} /> },
    ],
  },
  {
    group: 'Transaksi Penjualan',
    items: [
      { label: 'Buat Kontrak', to: '/kontrak', icon: <FileText size={16} /> },
      { label: 'Cetak Invoice', to: '/invoice', icon: <Receipt size={16} /> },
      { label: 'Pembayaran', to: '/pembayaran', icon: <Banknote size={16} /> },
      { label: 'Delivery Order', to: '/delivery-order', icon: <Truck size={16} /> },
      { label: 'BA Pengambilan', to: '/berita-acara', icon: <ClipboardList size={16} /> },
    ],
  },
  {
    group: 'Dokumen & Gudang',
    items: [
      { label: 'Dokumen', to: '/upload', icon: <CloudUpload size={16} /> },
      { label: 'Dokumen Unit', to: '/dokumen-unit', icon: <ClipboardCheck size={16} /> },
      { label: 'Persediaan', to: '/stok', icon: <Boxes size={16} /> },
    ],
  },
  {
    group: 'Laporan & Arsip',
    items: [
      { label: 'Laporan Digital', to: '/laporan', icon: <Table size={16} /> },
      { label: 'Tren Harga', to: '/tren-harga', icon: <LineChart size={16} /> },
      { label: 'Monitoring Piutang', to: '/piutang', icon: <Wallet size={16} /> },
      { label: 'Input Bypass', to: '/bypass', icon: <Zap size={16} /> },
      {
        label: 'Repository',
        icon: <Archive size={16} />,
        children: [
          { label: 'Kontrak', to: '/repo/kontrak' },
          { label: 'Invoice', to: '/repo/invoice' },
          { label: 'Pembayaran', to: '/repo/pembayaran' },
          { label: 'Delivery Order', to: '/repo/do' },
          { label: 'Trace Kontrak', to: '/kontrak-trace' },
        ],
      },
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
  const [flyoutOpen, setFlyoutOpen] = useState(false)
  const flyoutRef = useRef<HTMLDivElement>(null)
  const location = useLocation()
  const hasActiveChild = item.children?.some((c) => location.pathname === c.to)

  useEffect(() => {
    setFlyoutOpen(false)
  }, [location.pathname, collapsed])

  useEffect(() => {
    if (!flyoutOpen) return
    const handleClickOutside = (e: MouseEvent) => {
      if (flyoutRef.current && !flyoutRef.current.contains(e.target as Node)) {
        setFlyoutOpen(false)
      }
    }
    document.addEventListener('mousedown', handleClickOutside)
    return () => document.removeEventListener('mousedown', handleClickOutside)
  }, [flyoutOpen])

  if (collapsed) {
    return (
      <div ref={flyoutRef} className="relative px-2">
        <button
          type="button"
          title={item.label}
          aria-label={item.label}
          aria-expanded={flyoutOpen}
          onClick={() => setFlyoutOpen((v) => !v)}
          className={cn(
            'flex h-9 w-9 items-center justify-center rounded-md mx-auto transition-colors',
            hasActiveChild || flyoutOpen
              ? 'bg-white/15 text-white border-l-2 border-white'
              : 'text-blue-200 hover:bg-white/10 hover:text-white',
          )}
        >
          {item.icon}
        </button>
        {flyoutOpen && (
          <div className="fixed left-[68px] bottom-16 z-50 w-44 rounded-lg border border-border bg-card p-1.5 shadow-lg">
            <p className="px-2.5 py-1 text-[11px] font-semibold text-muted-foreground border-b border-border/60 mb-1">
              {item.label}
            </p>
            {item.children?.map((child) => (
              <NavLink
                key={child.to}
                to={child.to}
                onClick={() => setFlyoutOpen(false)}
                className={({ isActive }) =>
                  cn(
                    'flex items-center rounded-md px-2.5 py-1.5 text-xs font-medium transition-colors',
                    isActive
                      ? 'bg-primary text-primary-foreground font-semibold'
                      : 'text-foreground hover:bg-muted',
                  )
                }
              >
                {child.label}
              </NavLink>
            ))}
          </div>
        )}
      </div>
    )
  }

  return (
    <div>
      <button
        type="button"
        onClick={() => setOpen(!open)}
        className={cn(
          'flex items-center w-[calc(100%-16px)] py-2 px-3 mx-2 rounded-md text-[13px] font-medium transition-colors',
          hasActiveChild
            ? 'bg-white/15 text-white border-l-2 border-white pl-[10px]'
            : 'text-blue-200 hover:bg-white/10 hover:text-white border-l-2 border-transparent pl-[10px]',
        )}
      >
        <span className="w-5 flex justify-center shrink-0 opacity-80">{item.icon}</span>
        <span className="ml-2.5 truncate">{item.label}</span>
        <ChevronDown
          size={12}
          className={cn('ml-auto opacity-60 shrink-0 transition-transform duration-200', open && 'rotate-180')}
        />
      </button>
      <div className={cn('overflow-hidden transition-all duration-200', open ? 'max-h-72' : 'max-h-0')}>
        {item.children?.map((child) => (
          <NavLink
            key={child.to}
            to={child.to}
            className={({ isActive }) =>
              cn(
                'flex items-center py-1.5 pl-9 pr-3 mx-2 my-0.5 rounded-md text-[13px] font-medium transition-colors',
                isActive
                  ? 'bg-white/15 text-white font-semibold'
                  : 'text-blue-200/90 hover:bg-white/10 hover:text-white',
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
  const mobileNavOpen = useAppStore((s) => s.mobileNavOpen)
  const closeMobileNav = useAppStore((s) => s.closeMobileNav)
  const isAdmin = useAuthStore((s) => s.isAdmin)
  const user = useAuthStore((s) => s.user)
  const compact = collapsed && !mobileNavOpen
  const sidebarWidth = collapsed ? '64px' : '224px'

  useEffect(() => {
    closeMobileNav()
  }, [location.pathname, closeMobileNav])

  return (
    <>
      <style>{`:root { --sidebar-width: ${sidebarWidth}; }`}</style>
      {mobileNavOpen ? (
        <button
          type="button"
          className="fixed inset-0 z-40 cursor-default bg-foreground/20 lg:hidden"
          aria-label="Tutup navigasi"
          onClick={closeMobileNav}
        />
      ) : null}
      <aside
        className={cn(
          'fixed top-0 left-0 z-50 flex h-screen w-72 -translate-x-full flex-col bg-gradient-to-b from-[#1a4f73] to-[#0f3352] shadow-lg transition-[transform,width] duration-200 lg:w-[var(--sidebar-width)] lg:translate-x-0',
          mobileNavOpen && 'translate-x-0',
        )}
      >
        <div className="flex h-14 items-center gap-2.5 border-b border-white/10 px-4 shrink-0">
          <div className="flex h-8 w-8 shrink-0 items-center justify-center rounded-lg bg-white/15 text-white">
            <FileText size={15} />
          </div>
          {!compact && (
            <div className="min-w-0 flex-1">
              <h1 className="text-sm font-bold text-white leading-tight truncate">PTPN I</h1>
              <p className="text-[11px] text-blue-200 font-medium">Regional 8</p>
            </div>
          )}
          <Button
            variant="ghost"
            size="icon"
            onClick={closeMobileNav}
            className="ml-auto h-8 w-8 text-blue-100 hover:bg-white/10 hover:text-white lg:hidden"
            aria-label="Tutup navigasi"
          >
            <X size={16} />
          </Button>
        </div>

        <nav className="flex-1 overflow-y-auto py-3 space-y-3">
          {navGroups.map((group, gi) => (
            <div key={group.group}>
              {!compact ? (
                <p className="px-4 mb-1 text-[10px] font-semibold uppercase tracking-wider text-blue-300/80">
                  {group.group}
                </p>
              ) : gi > 0 ? (
                <div className="mx-3 my-2 border-t border-white/10" />
              ) : null}
              <ul className="space-y-0.5">
                {group.items.map((item) => {
                  if (item.children) {
                    return (
                      <li key={item.label}>
                        <NavParent
                          item={item}
                          defaultOpen={item.children.some((c) => location.pathname === c.to)}
                          collapsed={compact}
                        />
                      </li>
                    )
                  }
                  return (
                    <li key={item.to}>
                      <NavLink
                        to={item.to!}
                        end={item.to === '/'}
                        title={compact ? item.label : undefined}
                        className={({ isActive }) =>
                          cn(
                            'flex items-center rounded-md text-[13px] font-medium transition-colors',
                            compact ? 'mx-auto h-9 w-9 justify-center' : 'gap-2.5 py-1.5 px-3 mx-2',
                            isActive
                              ? 'bg-white/15 text-white font-semibold border-l-2 border-white'
                              : 'text-blue-200 hover:text-white hover:bg-white/10 border-l-2 border-transparent',
                          )
                        }
                      >
                        <span className={cn('flex justify-center shrink-0', compact ? '' : 'w-5')}>
                          {item.icon}
                        </span>
                        {!compact && <span className="truncate">{item.label}</span>}
                      </NavLink>
                    </li>
                  )
                })}
              </ul>
            </div>
          ))}
        </nav>

        {/* Menu admin */}
        {isAdmin() && (
          <div className="px-2 pb-1">
            {!compact && (
              <p className="px-2 mb-1 text-[10px] font-semibold uppercase tracking-wider text-blue-300/80">Admin</p>
            )}
            <NavLink
              to="/users"
              title={compact ? 'Kelola User' : undefined}
              className={({ isActive }) =>
                cn(
                  'flex items-center rounded-md text-[13px] font-medium transition-colors',
                  compact ? 'mx-auto h-9 w-9 justify-center' : 'gap-2.5 py-1.5 px-3',
                  isActive
                  ? 'bg-white/15 text-white font-semibold border-l-2 border-white'
                  : 'text-blue-200 hover:text-white hover:bg-white/10 border-l-2 border-transparent',
                )
              }
            >
              <span className={cn('flex justify-center shrink-0', compact ? '' : 'w-5')}>
                <Users size={16} />
              </span>
              {!compact && <span className="truncate">Kelola User</span>}
            </NavLink>
          </div>
        )}

        {/* Badge tamu */}
        {!compact && user?.role === 'tamu' && (
          <div className="px-4 pb-2">
            <div className="rounded-md bg-white/10 px-3 py-2 text-[11px] text-blue-100 text-center">
              Mode <strong>Tamu</strong> — hanya lihat & unduh
            </div>
          </div>
        )}

        <div className="border-t border-white/10 p-2 shrink-0">
          <Button
            variant="ghost"
            size={compact ? 'icon' : 'sm'}
            onClick={toggleSidebar}
            className={cn('hidden w-full text-blue-200 hover:bg-white/10 hover:text-white lg:inline-flex', compact && 'h-9 w-9')}
            title={compact ? 'Perluas sidebar' : 'Ciutkan sidebar'}
          >
            {compact ? (
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
