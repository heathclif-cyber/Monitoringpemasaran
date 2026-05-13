import { create } from 'zustand'
import type { Notification, NotificationType } from '@/types'
import { client } from '@/lib/client'

let nextId = 0

interface AppStore {
  notifications: Notification[]
  availableUnits: string[]
  availableKomoditas: string[]
  availableYears: number[]
  addNotification: (message: string, type: NotificationType) => void
  removeNotification: (id: string) => void
  fetchDropdownData: () => Promise<void>
}

export const useAppStore = create<AppStore>((set, get) => ({
  notifications: [],
  availableUnits: [],
  availableKomoditas: [],
  availableYears: [2025, 2026, 2027],

  addNotification: (message: string, type: NotificationType = 'success') => {
    const id = String(++nextId)
    set((state) => ({
      notifications: [...state.notifications, { id, message, type }],
    }))
    setTimeout(() => {
      get().removeNotification(id)
    }, 3500)
  },

  removeNotification: (id: string) => {
    set((state) => ({
      notifications: state.notifications.filter((n) => n.id !== id),
    }))
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
