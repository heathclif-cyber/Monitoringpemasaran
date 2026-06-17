import { Navigate, Outlet } from 'react-router-dom'
import { useAuthStore } from '@/store/authStore'

interface Props {
  requireAdmin?: boolean
}

export function ProtectedRoute({ requireAdmin = false }: Props) {
  const token = useAuthStore((s) => s.token)
  const user = useAuthStore((s) => s.user)

  if (!token || !user) {
    return <Navigate to="/login" replace />
  }

  if (requireAdmin && user.role !== 'admin') {
    return <Navigate to="/" replace />
  }

  return <Outlet />
}
