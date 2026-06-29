import { lazy, Suspense } from 'react'
import { Routes, Route } from 'react-router-dom'
import { AppLayout } from '@/components/layout/AppLayout'
import { LoadingSkeleton } from '@/components/common/LoadingSkeleton'
import { Toast } from '@/components/common/Toast'
import { CommandPalette } from '@/components/common/CommandPalette'
import { ProtectedRoute } from '@/components/auth/ProtectedRoute'

const LoginPage = lazy(() => import('@/pages/LoginPage'))
const Dashboard = lazy(() => import('@/pages/Dashboard'))
const KontrakPage = lazy(() => import('@/pages/KontrakPage'))
const InvoicePage = lazy(() => import('@/pages/InvoicePage'))
const PembayaranPage = lazy(() => import('@/pages/PembayaranPage'))
const DOPage = lazy(() => import('@/pages/DOPage'))
const LaporanPage = lazy(() => import('@/pages/LaporanPage'))
const BypassPage = lazy(() => import('@/pages/BypassPage'))
const BAPage = lazy(() => import('@/pages/BAPage'))
const RepoKontrak = lazy(() => import('@/pages/RepoKontrak'))
const RepoInvoice = lazy(() => import('@/pages/RepoInvoice'))
const RepoPembayaran = lazy(() => import('@/pages/RepoPembayaran'))
const RepoDO = lazy(() => import('@/pages/RepoDO'))
const TraceKontrak = lazy(() => import('@/pages/TraceKontrak'))
const UploadPage = lazy(() => import('@/pages/UploadPage'))
const StokPage = lazy(() => import('@/pages/StokPage'))
const UsersPage = lazy(() => import('@/pages/UsersPage'))

export default function App() {
  return (
    <Suspense fallback={<div className="p-5"><LoadingSkeleton rows={4} /></div>}>
      <Routes>
        {/* Publik */}
        <Route path="/login" element={<LoginPage />} />

        {/* Semua user yang sudah login */}
        <Route element={<ProtectedRoute />}>
          <Route element={<AppLayout />}>
            <Route path="/" element={<Dashboard />} />
            <Route path="/kontrak" element={<KontrakPage />} />
            <Route path="/invoice" element={<InvoicePage />} />
            <Route path="/pembayaran" element={<PembayaranPage />} />
            <Route path="/delivery-order" element={<DOPage />} />
            <Route path="/laporan" element={<LaporanPage />} />
            <Route path="/bypass" element={<BypassPage />} />
            <Route path="/berita-acara" element={<BAPage />} />
            <Route path="/upload" element={<UploadPage />} />
            <Route path="/stok" element={<StokPage />} />
            <Route path="/repo/kontrak" element={<RepoKontrak />} />
            <Route path="/repo/invoice" element={<RepoInvoice />} />
            <Route path="/repo/pembayaran" element={<RepoPembayaran />} />
            <Route path="/repo/do" element={<RepoDO />} />
            <Route path="/kontrak-trace" element={<TraceKontrak />} />

            {/* Admin only */}
            <Route element={<ProtectedRoute requireAdmin />}>
              <Route path="/users" element={<UsersPage />} />
            </Route>
          </Route>
        </Route>
      </Routes>
      <Toast />
      <CommandPalette />
    </Suspense>
  )
}
