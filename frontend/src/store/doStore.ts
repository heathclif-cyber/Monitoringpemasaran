import { create } from 'zustand'
import { client } from '@/lib/client'
import type { DeliveryOrder, DeliveryOrderInput, Invoice, Kontrak } from '@/types'

interface DOStore {
  data: DeliveryOrder[]
  current: DeliveryOrder | null
  currentInvoice: Invoice | null
  currentKontrak: Kontrak | null
  isLoading: boolean
  fetch: () => Promise<void>
  fetchOne: (no: string) => Promise<DeliveryOrder | null>
  fetchInvoiceForDO: (noInvoice: string) => Promise<void>
  save: (input: DeliveryOrderInput) => Promise<DeliveryOrder>
  remove: (no: string) => Promise<void>
}

export const useDOStore = create<DOStore>((set, get) => ({
  data: [],
  current: null,
  currentInvoice: null,
  currentKontrak: null,
  isLoading: false,

  fetch: async () => {
    set({ isLoading: true })
    try {
      const data = await client.get<DeliveryOrder[]>('/api/do?limit=1000')
      set({ data })
    } catch (err) {
      console.error('[doStore.fetch]', err)
    } finally {
      set({ isLoading: false })
    }
  },

  fetchOne: async (no: string) => {
    try {
      const data = await client.get<DeliveryOrder>(`/api/do/${encodeURIComponent(no)}`)
      set({ current: data })
      if (data.no_invoice) {
        get().fetchInvoiceForDO(data.no_invoice)
      }
      return data
    } catch (err) {
      console.error('[doStore.fetchOne]', err)
      return null
    }
  },

  fetchInvoiceForDO: async (noInvoice: string) => {
    try {
      const invoice = await client.get<Invoice>(`/api/invoice/${encodeURIComponent(noInvoice)}`)
      set({ currentInvoice: invoice })
      if (invoice.no_kontrak) {
        const kontrak = await client.get<Kontrak>(`/api/kontrak/${encodeURIComponent(invoice.no_kontrak)}`)
        set({ currentKontrak: kontrak })
      }
    } catch (err) {
      console.error('[doStore.fetchInvoiceForDO]', err)
    }
  },

  save: async (input: DeliveryOrderInput) => {
    const data = await client.post<DeliveryOrder>('/api/do', input)
    await get().fetch()
    return data
  },

  remove: async (no: string) => {
    await client.delete(`/api/do/${encodeURIComponent(no)}`)
    await get().fetch()
  },
}))
