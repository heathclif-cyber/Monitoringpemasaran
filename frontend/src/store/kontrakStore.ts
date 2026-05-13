import { create } from 'zustand'
import { client } from '@/lib/client'
import type { Kontrak, KontrakInput } from '@/types'

interface KontrakStore {
  data: Kontrak[]
  current: Kontrak | null
  isLoading: boolean
  fetch: () => Promise<void>
  fetchOne: (no: string) => Promise<Kontrak | null>
  save: (input: KontrakInput) => Promise<Kontrak>
  remove: (no: string) => Promise<void>
}

export const useKontrakStore = create<KontrakStore>((set, get) => ({
  data: [],
  current: null,
  isLoading: false,

  fetch: async () => {
    set({ isLoading: true })
    try {
      const data = await client.get<Kontrak[]>('/api/kontrak?limit=1000')
      set({ data })
    } catch (err) {
      console.error('[kontrakStore.fetch]', err)
    } finally {
      set({ isLoading: false })
    }
  },

  fetchOne: async (no: string) => {
    try {
      const data = await client.get<Kontrak>(`/api/kontrak/${encodeURIComponent(no)}`)
      set({ current: data })
      return data
    } catch (err) {
      console.error('[kontrakStore.fetchOne]', err)
      return null
    }
  },

  save: async (input: KontrakInput) => {
    const data = await client.post<Kontrak>('/api/kontrak', input)
    await get().fetch()
    return data
  },

  remove: async (no: string) => {
    await client.delete(`/api/kontrak/${encodeURIComponent(no)}`)
    await get().fetch()
  },
}))
