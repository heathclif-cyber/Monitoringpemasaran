import { Outlet, useLocation } from 'react-router-dom'
import { Sidebar } from './Sidebar'
import { Header } from './Header'
import { PageTransition } from '@/components/common/PageTransition'

export function AppLayout() {
  const location = useLocation()
  const isWidePage = location.pathname === '/laporan'

  return (
    <div className="min-h-screen bg-background">
      <Sidebar />
      <Header />
      <main
        className="min-h-screen pt-14 transition-[margin-left] duration-200 lg:ml-[var(--sidebar-width)]"
      >
        <div className={isWidePage ? 'w-full px-4 py-4 sm:px-5 lg:px-8 lg:py-6' : 'mx-auto max-w-[1600px] p-4 sm:p-5 lg:p-6'}>
          <PageTransition>
            <Outlet />
          </PageTransition>
        </div>
      </main>
    </div>
  )
}
