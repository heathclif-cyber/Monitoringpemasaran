import { create } from 'zustand'
import { client } from '@/lib/client'
import type { StokInput, StokLedgerEntry, StokSaldo } from '@/types'

interface StokStore {
  entries: StokLedgerEntry[]
  saldos: StokSaldo[]
  materials: string[]
  units: string[]
  isLoading: boolean
  fetchAll: () => Promise<void>
  fetchSaldo: () => Promise<void>
  createMasuk: (input: StokInput) => Promise<void>
  updateEntry: (id: number, input: Partial<StokInput>) => Promise<void>
  deleteEntry: (id: number) => Promise<void>
}

export const useStokStore = create<StokStore>((set, get) => ({
  entries: [],
  saldos: [],
  materials: [],
  units: [],
  isLoading: false,

  fetchAll: async () => {
    set({ isLoading: true })
    try {
      const [entries, saldos, materials, units] = await Promise.all([
        client.get<StokLedgerEntry[]>('/api/stok?limit=200'),
        client.get<StokSaldo[]>('/api/stok/saldo'),
        client.get<string[]>('/api/stok/materials'),
        client.get<string[]>('/api/stok/units'),
      ])
      set({ entries, saldos, materials, units })
    } catch (err) {
      console.error('[stokStore.fetchAll]', err)
    } finally {
      set({ isLoading: false })
    }
  },

  fetchSaldo: async () => {
    try {
      const saldos = await client.get<StokSaldo[]>('/api/stok/saldo')
      set({ saldos })
    } catch (err) {
      console.error('[stokStore.fetchSaldo]', err)
    }
  },

  createMasuk: async (input: StokInput) => {
    await client.post('/api/stok', input)
    await get().fetchAll()
  },

  updateEntry: async (id: number, input: Partial<StokInput>) => {
    await client.put(`/api/stok/${id}`, input)
    await get().fetchAll()
  },

  deleteEntry: async (id: number) => {
    await client.delete(`/api/stok/${id}`)
    await get().fetchAll()
  },
}))