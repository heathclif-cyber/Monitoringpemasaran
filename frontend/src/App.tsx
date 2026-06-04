import { lazy, Suspense } from 'react'
import { Routes, Route } from 'react-router-dom'
import { AppLayout } from '@/components/layout/AppLayout'
import { LoadingSkeleton } from '@/components/common/LoadingSkeleton'
import { Toast } from '@/components/common/Toast'

const Dashboard = lazy(() => import('@/pages/Dashboard'))
const KontrakPage = lazy(() => import('@/pages/KontrakPage'))
const InvoicePage = lazy(() => import('@/pages/InvoicePage'))
const DOPage = lazy(() => import('@/pages/DOPage'))
const LaporanPage = lazy(() => import('@/pages/LaporanPage'))
const BypassPage = lazy(() => import('@/pages/BypassPage'))
const RepoKontrak = lazy(() => import('@/pages/RepoKontrak'))
const RepoInvoice = lazy(() => import('@/pages/RepoInvoice'))
const RepoDO = lazy(() => import('@/pages/RepoDO'))
const TraceKontrak = lazy(() => import('@/pages/TraceKontrak'))

export default function App() {
  return (
    <Suspense fallback={<div className="p-5"><LoadingSkeleton rows={4} /></div>}>
      <Routes>
        <Route element={<AppLayout />}>
          <Route path="/" element={<Dashboard />} />
          <Route path="/kontrak" element={<KontrakPage />} />
          <Route path="/invoice" element={<InvoicePage />} />
          <Route path="/delivery-order" element={<DOPage />} />
          <Route path="/laporan" element={<LaporanPage />} />
          <Route path="/bypass" element={<BypassPage />} />
          <Route path="/repo/kontrak" element={<RepoKontrak />} />
          <Route path="/repo/invoice" element={<RepoInvoice />} />
          <Route path="/repo/do" element={<RepoDO />} />
          <Route path="/kontrak-trace" element={<TraceKontrak />} />
        </Route>
      </Routes>
      <Toast />
    </Suspense>
  )
}
