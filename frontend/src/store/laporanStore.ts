import { create } from 'zustand'
import { client } from '@/lib/client'
import type { LaporanRow, BypassInput, SupermanDeklarasiResult } from '@/types'

export function supermanLabelFromResult(result: SupermanDeklarasiResult): string | null {
  const saved = (result.superman_saved || '').trim()
  if (saved) return saved
  const parts = [result.sppb_no, result.sppn_no]
    .map((p) => (p == null ? '' : String(p).trim()))
    .filter(Boolean)
  return parts.length > 0 ? parts.join(' + ') : null
}

interface LaporanStore {
  rows: LaporanRow[]
  isLoading: boolean
  fetch: (opts?: { fresh?: boolean; silent?: boolean }) => Promise<void>
  patchRow: (noDo: string, patch: Partial<LaporanRow>) => void
  updateSapField: (noDo: string, field: string, value: string) => Promise<void>
  createBypass: (input: BypassInput) => Promise<void>
  updateBypass: (id: number, input: BypassInput) => Promise<void>
  deleteBypass: (id: number) => Promise<void>
}

export const useLaporanStore = create<LaporanStore>((set, get) => ({
  rows: [],
  isLoading: false,

  fetch: async (opts) => {
    if (!opts?.silent) set({ isLoading: true })
    try {
      const path = opts?.fresh ? '/api/laporan?fresh=1' : '/api/laporan'
      const data = await client.get<LaporanRow[]>(path)
      set({ rows: data })
    } catch (err) {
      console.error('[laporanStore.fetch]', err)
    } finally {
      if (!opts?.silent) set({ isLoading: false })
    }
  },

  patchRow: (noDo, patch) => {
    set((state) => ({
      rows: state.rows.map((row) => (row.No_DO === noDo ? { ...row, ...patch } : row)),
    }))
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
