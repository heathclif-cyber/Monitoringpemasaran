import { useEffect } from 'react'
import { Navigate, Outlet } from 'react-router-dom'
import { client } from '@/lib/client'
import { useAuthStore } from '@/store/authStore'
import type { User } from '@/types'

interface Props {
  requireAdmin?: boolean
}

export function ProtectedRoute({ requireAdmin = false }: Props) {
  const token = useAuthStore((s) => s.token)
  const user = useAuthStore((s) => s.user)
  const setAuth = useAuthStore((s) => s.setAuth)
  const logout = useAuthStore((s) => s.logout)

  useEffect(() => {
    if (!token) return
    client.get<User>('/api/auth/me')
      .then((me) => setAuth(token, me))
      .catch(() => logout())
  }, [token, setAuth, logout])

  if (!token || !user) {
    return <Navigate to="/login" replace />
  }

  if (requireAdmin && user.role !== 'admin') {
    return <Navigate to="/" replace />
  }

  return <Outlet />
}
