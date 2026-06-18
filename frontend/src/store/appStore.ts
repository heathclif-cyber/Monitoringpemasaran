import { create } from 'zustand'
import type { Notification, NotificationType } from '@/types'
import { client } from '@/lib/client'
import { applyTheme, readTheme, type Theme } from '@/lib/theme'

let nextId = 0

const NOTIFICATION_DURATION_MS: Record<NotificationType, number> = {
  error: 30_000,
  warning: 30_000,
  info: 12_000,
  success: 8_000,
}

interface AppStore {
  notifications: Notification[]
  availableUnits: string[]
  availableKomoditas: string[]
  availableYears: number[]
  sidebarCollapsed: boolean
  theme: Theme
  addNotification: (message: string, type: NotificationType) => void
  removeNotification: (id: string) => void
  toggleSidebar: () => void
  toggleTheme: () => void
  fetchDropdownData: () => Promise<void>
}

const SIDEBAR_KEY = 'sidebar-collapsed'

function readSidebarCollapsed(): boolean {
  try {
    return localStorage.getItem(SIDEBAR_KEY) === 'true'
  } catch {
    return false
  }
}

export const useAppStore = create<AppStore>((set, get) => ({
  notifications: [],
  availableUnits: [],
  availableKomoditas: [],
  availableYears: [2025, 2026, 2027],
  sidebarCollapsed: readSidebarCollapsed(),
  theme: readTheme(),

  addNotification: (message: string, type: NotificationType = 'success') => {
    const id = String(++nextId)
    set((state) => ({
      notifications: [...state.notifications, { id, message, type }],
    }))
    setTimeout(() => {
      get().removeNotification(id)
    }, NOTIFICATION_DURATION_MS[type])
  },

  removeNotification: (id: string) => {
    set((state) => ({
      notifications: state.notifications.filter((n) => n.id !== id),
    }))
  },

  toggleSidebar: () => {
    const next = !get().sidebarCollapsed
    try {
      localStorage.setItem(SIDEBAR_KEY, String(next))
    } catch { /* ignore */ }
    set({ sidebarCollapsed: next })
  },

  toggleTheme: () => {
    const next: Theme = get().theme === 'dark' ? 'light' : 'dark'
    applyTheme(next)
    set({ theme: next })
  },

  fetchDropdownData: async () => {
    try {
      const data = await client.get<{
        available_units: string[]
        available_komoditas: string[]
        available_years: number[]
      }>('/api/dashboard?year=2026&unit=ALL&komoditi=ALL')
      set({
        availableUnits: data.available_units || [],
        availableKomoditas: data.available_komoditas || [],
        availableYears: data.available_years?.length ? data.available_years : [2025, 2026, 2027],
      })
    } catch (err) {
      console.error('[appStore.fetchDropdownData]', err)
    }
  },
}))
