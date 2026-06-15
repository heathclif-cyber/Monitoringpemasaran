import { Outlet, useLocation } from 'react-router-dom'
import { Sidebar } from './Sidebar'
import { Header } from './Header'
import { getPageMeta } from '@/lib/pageMeta'
import { PageTransition } from '@/components/common/PageTransition'

export function AppLayout() {
  const location = useLocation()
  const meta = getPageMeta(location.pathname)
  const isWidePage = location.pathname === '/laporan'

  return (
    <div className="min-h-screen bg-background">
      <Sidebar />
      <Header />
      <main
        className="min-h-screen pt-14 transition-[margin-left] duration-200"
        style={{ marginLeft: 'var(--sidebar-width, 240px)' }}
      >
        <div className={isWidePage ? 'w-full px-4 py-5 lg:px-8 lg:py-6' : 'mx-auto max-w-[1600px] p-5 lg:p-6'}>
          {meta.description && (
            <p className="text-sm text-muted-foreground mb-5 -mt-1">{meta.description}</p>
          )}
          <PageTransition>
            <Outlet />
          </PageTransition>
        </div>
      </main>
    </div>
  )
}