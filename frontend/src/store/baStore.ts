import { create } from 'zustand'
import { client } from '@/lib/client'
import type { BeritaAcara, BeritaAcaraInput, BAAvailable } from '@/types'

interface BAStore {
  data: BeritaAcara[]
  available: BAAvailable[]
  isLoading: boolean
  fetch: (noKontrak?: string) => Promise<void>
  fetchAvailable: (noKontrak: string) => Promise<BAAvailable[]>
  fetchOne: (noBa: string) => Promise<BeritaAcara | null>
  save: (input: BeritaAcaraInput) => Promise<BeritaAcara>
  remove: (noBa: string) => Promise<void>
}

export const useBAStore = create<BAStore>((set, get) => ({
  data: [],
  available: [],
  isLoading: false,

  fetch: async (noKontrak?: string) => {
    set({ isLoading: true })
    try {
      const qs = noKontrak ? `?no_kontrak=${encodeURIComponent(noKontrak)}&limit=500` : '?limit=500'
      const data = await client.get<BeritaAcara[]>(`/api/ba${qs}`)
      set({ data })
    } catch (err) {
      console.error('[baStore.fetch]', err)
    } finally {
      set({ isLoading: false })
    }
  },

  fetchAvailable: async (noKontrak: string) => {
    set({ available: [] })
    try {
      const data = await client.get<BAAvailable[]>(
        `/api/ba/available?no_kontrak=${encodeURIComponent(noKontrak)}`,
      )
      set({ available: data })
      return data
    } catch (err) {
      console.error('[baStore.fetchAvailable]', err)
      set({ available: [] })
      return []
    }
  },

  fetchOne: async (noBa: string) => {
    try {
      return await client.get<BeritaAcara>(`/api/ba/${encodeURIComponent(noBa)}`)
    } catch (err) {
      console.error('[baStore.fetchOne]', err)
      return null
    }
  },

  save: async (input: BeritaAcaraInput) => {
    const data = await client.post<BeritaAcara>('/api/ba', input)
    await get().fetch(input.no_kontrak)
    return data
  },

  remove: async (noBa: string) => {
    await client.delete(`/api/ba/${encodeURIComponent(noBa)}`)
    await get().fetch()
  },
}))