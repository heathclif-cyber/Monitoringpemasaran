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
} from 'lucide-react'
import { cn } from '@/lib/utils'

interface NavItemDef {
  label: string
  to?: string
  icon: React.ReactNode
  children?: { label: string; to: string }[]
}

const navItems: NavItemDef[] = [
  { label: 'Dashboard', to: '/', icon: <LayoutDashboard size={15} /> },
  { label: 'Buat Kontrak', to: '/kontrak', icon: <FileText size={15} /> },
  { label: 'Cetak Invoice', to: '/invoice', icon: <Receipt size={15} /> },
  { label: 'Delivery Order', to: '/delivery-order', icon: <Truck size={15} /> },
  { label: 'Laporan Digital', to: '/laporan', icon: <Table size={15} /> },
  { label: 'Input Bypass', to: '/bypass', icon: <Zap size={15} /> },
  {
    label: 'Repository',
    icon: <Archive size={15} />,
    children: [
      { label: 'Kontrak', to: '/repo/kontrak' },
      { label: 'Invoice', to: '/repo/invoice' },
      { label: 'Delivery Order', to: '/repo/do' },
    ],
  },
]

function NavParent({ item, defaultOpen }: { item: NavItemDef; defaultOpen: boolean }) {
  const [open, setOpen] = useState(defaultOpen)
  const location = useLocation()
  const hasActiveChild = item.children?.some((c) => location.pathname === c.to)

  return (
    <div>
      <button
        onClick={() => setOpen(!open)}
        className={cn(
          'flex items-center w-full py-1.5 px-3 mx-3 rounded-md text-[13px] font-medium transition-colors',
          'text-white/80 hover:text-white hover:bg-white/10',
          hasActiveChild && 'text-white font-semibold bg-white/10',
        )}
      >
        <span className="w-6 flex justify-center opacity-70 shrink-0">{item.icon}</span>
        <span className="ml-2">{item.label}</span>
        <ChevronDown size={12} className={cn('ml-1.5 opacity-50 shrink-0 transition-transform duration-200', open && 'rotate-180')} />
      </button>
      <div className={cn('overflow-hidden transition-all duration-200', open ? 'max-h-60' : 'max-h-0')}>
        {item.children?.map((child) => (
          <NavLink
            key={child.to}
            to={child.to}
            className={({ isActive }) =>
              cn(
                'flex items-center py-1.5 pl-8 pr-3 mx-3 my-0.5 rounded-md text-[12.5px] font-medium transition-colors',
                isActive
                  ? 'bg-white/15 text-white font-semibold border-l-[3px] border-white ml-1'
                  : 'text-white/60 hover:text-white hover:bg-white/10',
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
  const sidebarWidth = '224px'

  return (
    <>
      <style>{`:root { --sidebar-width: ${sidebarWidth}; }`}</style>
      <aside
        className="fixed top-0 left-0 h-screen z-50 flex flex-col overflow-hidden"
        style={{
          width: 'var(--sidebar-width, 224px)',
          background: 'linear-gradient(180deg, #059669 0%, #065f46 50%, #064e3b 100%)',
        }}
      >
        {/* Logo */}
        <div className="px-5 h-[56px] flex items-center gap-3 border-b border-white/10 shrink-0">
          <div className="w-7 h-7 rounded-md bg-white/20 flex items-center justify-center text-white">
            <FileText size={14} />
          </div>
          <div>
            <h1 className="font-bold text-white text-sm leading-tight">PTPN I</h1>
            <p className="text-[10px] text-white/60 font-medium">Regional 8</p>
          </div>
        </div>

        {/* Navigation */}
        <nav className="flex-1 overflow-y-auto py-4">
          <p className="px-5 text-[11px] font-semibold text-white/40 uppercase tracking-wider mb-2">
            Main Menu
          </p>
          <ul className="space-y-0.5">
            {navItems.map((item) => {
              if (item.children) {
                return (
                  <li key={item.label}>
                    <NavParent
                      item={item}
                      defaultOpen={item.children.some((c) => location.pathname === c.to)}
                    />
                  </li>
                )
              }
              return (
                <li key={item.to}>
                  <NavLink
                    to={item.to!}
                    end={item.to === '/'}
                    className={({ isActive }) =>
                      cn(
                        'flex items-center gap-2 py-1.5 px-3 mx-3 rounded-md text-[13px] font-medium transition-colors',
                        isActive
                          ? 'bg-white/15 text-white font-semibold border-l-[3px] border-white ml-1'
                          : 'text-white/70 hover:text-white hover:bg-white/10',
                      )
                    }
                  >
                    <span className={cn('w-6 flex justify-center', location.pathname === item.to ? 'text-white' : 'opacity-60')}>
                      {item.icon}
                    </span>
                    <span>{item.label}</span>
                  </NavLink>
                </li>
              )
            })}
          </ul>
        </nav>

        {/* Footer */}
        <div className="p-4 border-t border-white/10 shrink-0">
          <div className="flex items-center gap-3">
            <div className="w-8 h-8 rounded-full bg-white/20 flex items-center justify-center text-xs font-semibold text-white">
              A
            </div>
            <div className="flex-1 min-w-0">
              <p className="text-[13px] font-semibold text-white truncate">Administrator</p>
              <p className="text-[11px] text-white/50 truncate">PTPN I Reg 8</p>
            </div>
          </div>
        </div>
      </aside>
    </>
  )
}
