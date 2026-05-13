import { create } from 'zustand'
import { client } from '@/lib/client'
import type { LaporanRow, BypassInput, SapUpdateInput } from '@/types'

interface LaporanStore {
  rows: LaporanRow[]
  isLoading: boolean
  fetch: () => Promise<void>
  updateSapField: (noDo: string, field: string, value: string) => Promise<void>
  createBypass: (input: BypassInput) => Promise<void>
  updateBypass: (id: number, input: BypassInput) => Promise<void>
  deleteBypass: (id: number) => Promise<void>
}

export const useLaporanStore = create<LaporanStore>((set, get) => ({
  rows: [],
  isLoading: false,

  fetch: async () => {
    set({ isLoading: true })
    try {
      const data = await client.get<LaporanRow[]>('/api/laporan')
      set({ rows: data })
    } catch (err) {
      console.error('[laporanStore.fetch]', err)
    } finally {
      set({ isLoading: false })
    }
  },

  updateSapField: async (noDo: string, field: string, value: string) => {
    try {
      await client.put('/api/laporan/update-sap', {
        No_DO: noDo,
        [field]: value,
      })
    } catch (err) {
      console.error('[laporanStore.updateSapField]', err)
      throw err
    }
  },

  createBypass: async (input: BypassInput) => {
    await client.post('/api/laporan/create-bypass', input)
    await get().fetch()
  },

  updateBypass: async (id: number, input: BypassInput) => {
    await client.put('/api/laporan/update-bypass', { ...input, id })
    await get().fetch()
  },

  deleteBypass: async (id: number) => {
    await client.delete(`/api/laporan/bypass/${id}`)
    await get().fetch()
  },
}))
