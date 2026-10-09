import { create } from 'zustand'
import { client } from '@/lib/client'
import type { TaxResponse, TaxStore } from '@/types'

export const useTaxStore = create<TaxStore>((set, get) => ({
  data: null, loading: false, error: null,
  fetch: async () => {
    set({ loading: true, error: null })
    try { set({ data: await client.get<TaxResponse>('/api/pajak/v1') }) }
    catch (error) { set({ error: error instanceof Error ? error.message : 'Gagal memuat pajak' }) }
    finally { set({ loading: false }) }
  },
  saveProfile: async (body) => { await client.put('/api/pajak/v1/profile', body); await get().fetch() },
  saveDecision: async (body) => { await client.put('/api/pajak/v1/decision', body); await get().fetch() },
}))
