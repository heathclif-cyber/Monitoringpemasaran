import { useLocation } from 'react-router-dom'
import { Bell } from 'lucide-react'
import { Button } from '@/components/ui/button'

const SIDEBAR_WIDTH = '--sidebar-width' as const

const TITLE_MAP: Record<string, string> = {
  '/': 'Dashboard Overview',
  '/kontrak': 'Otomasi Kontrak (Word)',
  '/invoice': 'Otomasi Invoice (Word)',
  '/delivery-order': 'Otomasi Delivery Order',
  '/laporan': 'Rekapitulasi Laporan Terintegrasi',
  '/bypass': 'Input Data Bypass Laporan',
  '/repo/kontrak': 'Repository — Kontrak Penjualan',
  '/repo/invoice': 'Repository — Arsip Invoice',
  '/repo/do': 'Repository — Delivery Order',
}

export function Header() {
  const location = useLocation()
  const title = TITLE_MAP[location.pathname] || 'Dashboard Overview'

  return (
    <header
      className="fixed top-0 right-0 h-14 bg-white border-b border-slate-200 z-40 flex items-center justify-between px-6"
      style={{ left: 'var(--sidebar-width, 224px)' }}
    >
      <h2 className="text-[15px] font-semibold text-slate-900">{title}</h2>
      <div className="flex items-center gap-4">
        <button className="relative text-slate-500 hover:text-slate-700 transition-colors focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-ring rounded-md">
          <Bell size={16} />
        </button>
        <Button variant="outline" size="sm" className="gap-2">
          <div className="w-5 h-5 rounded-sm bg-brand-50 flex items-center justify-center text-brand-600">
            <span className="text-[10px] font-bold">A</span>
          </div>
          Profile
        </Button>
      </div>
    </header>
  )
}
