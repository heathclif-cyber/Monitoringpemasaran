import { create } from 'zustand'
import { client } from '@/lib/client'
import type { Pembayaran, PembayaranInput, Invoice, Kontrak } from '@/types'

interface PembayaranStore {
  data: Pembayaran[]
  current: Pembayaran | null
  currentInvoice: Invoice | null
  currentKontrak: Kontrak | null
  isLoading: boolean
  fetch: () => Promise<void>
  fetchOne: (no: string) => Promise<Pembayaran | null>
  fetchByInvoice: (noInvoice: string) => Promise<Pembayaran[]>
  fetchAvailableForDO: () => Promise<Pembayaran[]>
  fetchInvoiceContext: (noInvoice: string) => Promise<void>
  save: (input: PembayaranInput) => Promise<Pembayaran>
  remove: (no: string) => Promise<void>
}

export const usePembayaranStore = create<PembayaranStore>((set, get) => ({
  data: [],
  current: null,
  currentInvoice: null,
  currentKontrak: null,
  isLoading: false,

  fetch: async () => {
    set({ isLoading: true })
    try {
      const data = await client.get<Pembayaran[]>('/api/pembayaran?limit=1000')
      set({ data })
    } catch (err) {
      console.error('[pembayaranStore.fetch]', err)
    } finally {
      set({ isLoading: false })
    }
  },

  fetchOne: async (no: string) => {
    try {
      const data = await client.get<Pembayaran>(`/api/pembayaran/${encodeURIComponent(no)}`)
      set({ current: data })
      if (data.no_invoice) {
        await get().fetchInvoiceContext(data.no_invoice)
      }
      return data
    } catch (err) {
      console.error('[pembayaranStore.fetchOne]', err)
      return null
    }
  },

  fetchByInvoice: async (noInvoice: string) => {
    try {
      return await client.get<Pembayaran[]>(
        `/api/pembayaran?no_invoice=${encodeURIComponent(noInvoice)}&limit=1000`,
      )
    } catch (err) {
      console.error('[pembayaranStore.fetchByInvoice]', err)
      return []
    }
  },

  fetchAvailableForDO: async () => {
    try {
      return await client.get<Pembayaran[]>(
        '/api/pembayaran?belum_do=true&sudah_superman=true&limit=1000',
      )
    } catch (err) {
      console.error('[pembayaranStore.fetchAvailableForDO]', err)
      return []
    }
  },

  fetchInvoiceContext: async (noInvoice: string) => {
    try {
      const invoice = await client.get<Invoice>(`/api/invoice/${encodeURIComponent(noInvoice)}`)
      set({ currentInvoice: invoice })
      if (invoice.no_kontrak) {
        const kontrak = await client.get<Kontrak>(`/api/kontrak/${encodeURIComponent(invoice.no_kontrak)}`)
        set({ currentKontrak: kontrak })
      }
    } catch (err) {
      console.error('[pembayaranStore.fetchInvoiceContext]', err)
    }
  },

  save: async (input: PembayaranInput) => {
    const data = await client.post<Pembayaran>('/api/pembayaran', input)
    await get().fetch()
    return data
  },

  remove: async (no: string) => {
    await client.delete(`/api/pembayaran/${encodeURIComponent(no)}`)
    await get().fetch()
  },
}))