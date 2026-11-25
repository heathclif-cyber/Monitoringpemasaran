import { create } from 'zustand'
import { client } from '@/lib/client'
import type { HargaBulananResponse } from '@/types'

interface HargaStore {
  data: HargaBulananResponse | null
  isLoading: boolean
  error: string | null
  fetchHarga: (bulan?: number) => Promise<void>
}

export const useHargaStore = create<HargaStore>((set) => ({
  data: null,
  isLoading: false,
  error: null,

  fetchHarga: async (bulan = 12) => {
    set({ isLoading: true, error: null })
    try {
      const data = await client.get<HargaBulananResponse>(`/api/laporan/harga-bulanan?bulan=${bulan}`)
      set({ data })
    } catch (err) {
      console.error('[hargaStore.fetchHarga]', err)
      set({ error: err instanceof Error ? err.message : 'Gagal memuat data harga' })
    } finally {
      set({ isLoading: false })
    }
  },
}))
