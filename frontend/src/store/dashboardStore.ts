import { create } from 'zustand'
import { client } from '@/lib/client'
import type { DashboardResponse, DashboardFilters } from '@/types'

interface DashboardStore {
  data: DashboardResponse | null
  filters: DashboardFilters
  isLoading: boolean
  fetch: () => Promise<void>
  setFilters: (filters: Partial<DashboardFilters>) => void
}

export const useDashboardStore = create<DashboardStore>((set, get) => ({
  data: null,
  filters: {
    year: new Date().getFullYear(),
    unit: 'ALL',
    komoditi: 'ALL',
  },
  isLoading: false,

  fetch: async () => {
    set({ isLoading: true })
    try {
      const { year, unit, komoditi } = get().filters
      const params = new URLSearchParams({
        year: String(year),
        unit,
        komoditi,
      })
      const data = await client.get<DashboardResponse & { error?: string }>(`/api/dashboard?${params}`)
      if (data && typeof data === 'object' && 'error' in data && data.error) {
        throw new Error(data.error)
      }
      if (!data?.summary || !data?.charts) {
        throw new Error('Format data dashboard tidak valid')
      }
      set({ data })
    } catch (err) {
      console.error('[dashboardStore.fetch]', err)
      set({ data: null })
      throw err
    } finally {
      set({ isLoading: false })
    }
  },

  setFilters: (partial) => {
    set((state) => ({ filters: { ...state.filters, ...partial } }))
  },
}))
