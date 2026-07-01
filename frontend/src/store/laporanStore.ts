import { create } from 'zustand'
import { client } from '@/lib/client'
import type { LaporanRow, BypassInput, SupermanDeklarasiResult } from '@/types'

export function matchLaporanRow(row: LaporanRow, key: LaporanRowKey): boolean {
  if (key.noDo) return row.No_DO === key.noDo
  if (key.noInvoice) return !row.No_DO && row.No_Invoice === key.noInvoice
  return false
}

/** Kunci penyimpanan SAP: DO jika ada, selain itu invoice (aturan invoice-first). */
export function laporanRowKey(row: LaporanRow): LaporanRowKey {
  const noDo = (row.No_DO || '').trim()
  if (noDo.startsWith('BYPASS-') || noDo) {
    return { noDo, noInvoice: '' }
  }
  return { noDo: '', noInvoice: (row.No_Invoice || '').trim() }
}

/** SAP bisa diisi setelah invoice dibuat — DO tidak wajib. */
export function canSaveSapFields(row: LaporanRow): boolean {
  if ((row.No_DO || '').startsWith('BYPASS-')) return true
  if ((row.No_DO || '').trim()) return true
  const inv = (row.No_Invoice || '').trim()
  return !!inv && inv !== '-'
}

export function isInvoiceOnlySapRow(row: LaporanRow): boolean {
  return canSaveSapFields(row) && !(row.No_DO || '').trim()
}

export function supermanLabelFromResult(result: SupermanDeklarasiResult): string | null {
  const saved = (result.superman_saved || '').trim()
  if (saved) return saved
  const parts = [result.sppb_no, result.sppn_no]
    .map((p) => (p == null ? '' : String(p).trim()))
    .filter(Boolean)
  return parts.length > 0 ? parts.join(' + ') : null
}

export interface LaporanRowKey {
  noDo: string
  noInvoice: string
}

interface LaporanStore {
  rows: LaporanRow[]
  isLoading: boolean
  fetch: (opts?: { fresh?: boolean; silent?: boolean }) => Promise<void>
  patchRow: (key: LaporanRowKey, patch: Partial<LaporanRow>) => void
  updateSapField: (key: LaporanRowKey, field: string, value: string) => Promise<void>
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

  patchRow: (key, patch) => {
    set((state) => ({
      rows: state.rows.map((row) => (
        matchLaporanRow(row, key) ? { ...row, ...patch } : row
      )),
    }))
  },

  updateSapField: async (key, field, value) => {
    const body: Record<string, string> = { [field]: value }
    if (key.noDo) body.No_DO = key.noDo
    else if (key.noInvoice) body.No_Invoice = key.noInvoice
    else throw new Error('No. DO atau Invoice diperlukan')

    try {
      const result = await client.put<{ success: boolean; message?: string }>(
        '/api/laporan/update-sap',
        body,
      )
      if (!result.success) {
        throw new Error(result.message || 'Gagal menyimpan data SAP')
      }
      if (!key.noDo && key.noInvoice) {
        await get().fetch({ fresh: true, silent: true })
      }
      try {
        const { useDashboardStore } = await import('@/store/dashboardStore')
        await useDashboardStore.getState().fetch()
      } catch {
        /* dashboard optional refresh */
      }
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
