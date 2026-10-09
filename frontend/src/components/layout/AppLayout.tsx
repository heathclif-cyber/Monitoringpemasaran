import { Outlet, useLocation } from 'react-router-dom'
import { Sidebar } from './Sidebar'
import { Header } from './Header'
import { PageTransition } from '@/components/common/PageTransition'

export function AppLayout() {
  const location = useLocation()
  const isWidePage = location.pathname === '/laporan'

  return (
    <div className="min-h-screen bg-gray-50/80">
      <Sidebar />
      <Header />
      <main
        className="min-h-screen pt-14 transition-[margin-left] duration-200 lg:ml-[var(--sidebar-width)]"
      >
        <div className={isWidePage ? 'w-full p-5' : 'mx-auto max-w-[1600px] p-5'}>
          {import.meta.env.VITE_ISOLATED_PREVIEW === 'true' && (
            <div role="status" className="mb-4 rounded-md border bg-muted px-3 py-2 text-xs text-muted-foreground">
              Preview lokal · database salinan terpisah. Perubahan di sini tidak masuk ke produksi atau SAP.
            </div>
          )}
          <PageTransition>
            <Outlet />
          </PageTransition>
        </div>
      </main>
    </div>
  )
}
