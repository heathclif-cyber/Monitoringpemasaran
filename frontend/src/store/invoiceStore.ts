import { create } from 'zustand'
import { client } from '@/lib/client'
import type { Invoice, InvoiceInput, Kontrak } from '@/types'

interface InvoiceStore {
  data: Invoice[]
  current: Invoice | null
  currentKontrak: Kontrak | null
  isLoading: boolean
  fetch: () => Promise<void>
  fetchOne: (no: string) => Promise<Invoice | null>
  fetchKontrakForInvoice: (noKontrak: string) => Promise<Kontrak | null>
  save: (input: InvoiceInput) => Promise<Invoice>
  remove: (no: string) => Promise<void>
}

export const useInvoiceStore = create<InvoiceStore>((set, get) => ({
  data: [],
  current: null,
  currentKontrak: null,
  isLoading: false,

  fetch: async () => {
    set({ isLoading: true })
    try {
      const data = await client.get<Invoice[]>('/api/invoice?limit=1000')
      set({ data })
    } catch (err) {
      console.error('[invoiceStore.fetch]', err)
    } finally {
      set({ isLoading: false })
    }
  },

  fetchOne: async (no: string) => {
    try {
      const data = await client.get<Invoice>(`/api/invoice/${encodeURIComponent(no)}`)
      set({ current: data })
      if (data.no_kontrak) {
        get().fetchKontrakForInvoice(data.no_kontrak)
      }
      return data
    } catch (err) {
      console.error('[invoiceStore.fetchOne]', err)
      return null
    }
  },

  fetchKontrakForInvoice: async (noKontrak: string) => {
    try {
      const data = await client.get<Kontrak>(`/api/kontrak/${encodeURIComponent(noKontrak)}`)
      set({ currentKontrak: data })
      return data
    } catch (err) {
      console.error('[invoiceStore.fetchKontrakForInvoice]', err)
      return null
    }
  },

  save: async (input: InvoiceInput) => {
    const data = await client.post<Invoice>('/api/invoice', input)
    await get().fetch()
    return data
  },

  remove: async (no: string) => {
    await client.delete(`/api/invoice/${encodeURIComponent(no)}`)
    await get().fetch()
  },
}))
