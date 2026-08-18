import { create } from 'zustand'
import { client } from '@/lib/client'
import type { PiutangResponse } from '@/types'

interface PiutangStore {
  data: PiutangResponse | null
  isLoading: boolean
  fetch: () => Promise<void>
}

export const usePiutangStore = create<PiutangStore>((set) => ({
  data: null,
  isLoading: false,

  fetch: async () => {
    set({ isLoading: true })
    try {
      const data = await client.get<PiutangResponse>('/api/piutang')
      set({ data })
    } catch (err) {
      console.error('[piutangStore.fetch]', err)
    } finally {
      set({ isLoading: false })
    }
  },
}))
