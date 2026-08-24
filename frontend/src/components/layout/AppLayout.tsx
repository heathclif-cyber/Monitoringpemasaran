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
          <PageTransition>
            <Outlet />
          </PageTransition>
        </div>
      </main>
    </div>
  )
}
