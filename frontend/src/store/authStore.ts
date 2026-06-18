import { create } from 'zustand'
import type { User } from '@/types'

const TOKEN_KEY = 'auth_token'
const USER_KEY = 'auth_user'

function readToken(): string | null {
  try { return localStorage.getItem(TOKEN_KEY) } catch { return null }
}

function readUser(): User | null {
  try {
    const raw = localStorage.getItem(USER_KEY)
    return raw ? (JSON.parse(raw) as User) : null
  } catch { return null }
}

interface AuthStore {
  token: string | null
  user: User | null
  setAuth: (token: string, user: User) => void
  logout: () => void
  canEdit: () => boolean
  isAdmin: () => boolean
}

export const useAuthStore = create<AuthStore>((set, get) => ({
  token: readToken(),
  user: readUser(),

  setAuth: (token, user) => {
    try {
      localStorage.setItem(TOKEN_KEY, token)
      localStorage.setItem(USER_KEY, JSON.stringify(user))
    } catch { /* ignore */ }
    set({ token, user })
  },

  logout: () => {
    try {
      localStorage.removeItem(TOKEN_KEY)
      localStorage.removeItem(USER_KEY)
    } catch { /* ignore */ }
    set({ token: null, user: null })
  },

  canEdit: () => {
    const role = get().user?.role
    return role === 'admin' || role === 'staff'
  },

  isAdmin: () => get().user?.role === 'admin',
}))

/** Subscribe ke perubahan role user — jangan pakai s.canEdit() di selector. */
export const useCanEdit = () =>
  useAuthStore((s) => s.user?.role === 'admin' || s.user?.role === 'staff')

export const useIsTamu = () => useAuthStore((s) => s.user?.role === 'tamu')
