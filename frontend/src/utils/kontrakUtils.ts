export const TAX_RATE_PPN_DEFAULT = 11.0
export const TAX_RATE_PPH_DEFAULT = 0.25

export function isPayungBA(tipeAlur?: string | null): boolean {
  return String(tipeAlur || 'STANDAR').toUpperCase() === 'PAYUNG_BA'
}

export interface PricingResult {
  pokok: number
  nominalPpn: number
  nominalPph: number
  nilaiTransaksi: number
  totalTagihan: number
}

/** Bulat ke sen (2 desimal). Tampilan UI (formatCurrency) yang membulatkan ke rupiah. */
function asMoney(value: number): number {
  return Math.round((value + Number.EPSILON) * 100) / 100
}

export function calculateKontrakPricing(
  volume: number,
  hargaSatuan: number,
  premi: number,
  isPpn: string,
  ppnPersen: number,
  isPph: string,
  pphPersen: number,
): PricingResult {
  // Hitungan penuh dulu, baru simpan sen — jangan Math.round ke rupiah utuh di tengah.
  const pokokRaw = volume * hargaSatuan + premi
  const nominalPpnRaw = isPpn === 'true' ? pokokRaw * (ppnPersen / 100) : 0
  const nominalPphRaw = isPph === 'true' ? pokokRaw * (pphPersen / 100) : 0
  const pokok = asMoney(pokokRaw)
  const nominalPpn = asMoney(nominalPpnRaw)
  const nominalPph = asMoney(nominalPphRaw)
  const nilaiTransaksi = asMoney(pokok + nominalPpn)
  const totalTagihan = asMoney(nilaiTransaksi - nominalPph)

  return { pokok, nominalPpn, nominalPph, nilaiTransaksi, totalTagihan }
}

export function calculateJatuhTempo(tanggalKontrak: string, lamaBayarHari: number): string {
  if (!tanggalKontrak) return ''
  const d = new Date(tanggalKontrak)
  d.setDate(d.getDate() + (lamaBayarHari || 15))
  return d.toISOString().split('T')[0]
}

export function generateSyaratSyarat(lamaBayarHari: number, ambilHari: number): string {
  const lama = lamaBayarHari || 15
  const ambil = ambilHari || 15
  return [
    `a. Pembayaran dilaksanakan selambat-lambatnya ${lama} hari kalender setelah ditandatanganinya Kontrak penjualan`,
    `b. Penyerahan barang dilaksanakan setelah diterima bukti transfer pembayaran`,
    `c. Pengambilan barang selambat-lambatnya ${ambil} hari kalender dari batas akhir tanggal pembayaran`,
    `d. Biaya-biaya yang terkait dengan administrasi Bank menjadi beban pembeli`,
  ].join('\n')
}

export const DEFAULT_SYARAT =
  'a. Pembayaran dilaksanakan selambat-lambatnya 15 hari kalender setelah ditandatanganinya Kontrak penjualan\nb. Penyerahan barang dilaksanakan setelah diterima bukti transfer pembayaran\nc. Pengambilan barang selambat-lambatnya 15 hari kalender dari batas akhir tanggal pembayaran\nd. Biaya-biaya yang terkait dengan administrasi Bank menjadi beban pembeli'

export const DEFAULT_KETENTUAN =
  'Mengacu kepada tata Cara dan Ketentuan Penjualan Komoditi Perkebunan PT Perkebunan Nusantara III (Persero)'

export const DEFAULT_PEMILIK_KOMODITAS = 'PT Perkebunan Nusantara I Regional 8'

export const DEFAULT_PENJUAL =
  'PT Perkebunan Nusantara I Regional 8\nJalan Urip Sumoharjo No. 72-76, Kota Makassar'

export const MATERIAL_OPTIONS = [
  'TBS (TANDAN BUAH SEGAR)',
  'Lump',
  'TH BR CR 3X',
  'TH BR CR 3X HITAM',
  'GULA GAPOKTAN',
  'Gula Kemasan 50 KG Milik PG',
  'KELAPA KUPAS',
  'KELAPA BUTIR',
  'Kopra',
  'SAPI PEJANTAN AFKIR',
  'CPO',
] as const

export type UnitRow = {
  nama_unit: string
  volume: number
  komoditi: string
  jenis_komoditi: string
  satuan: string
  tahun_panen: string
  deskripsi_produk: string
}

export function materialOptionsForUnit(jenisKomoditi: string, extra: string[] = []): string[] {
  const merged = new Set<string>([...MATERIAL_OPTIONS, ...extra])
  if (jenisKomoditi?.trim()) merged.add(jenisKomoditi.trim())
  return [...merged].sort((a, b) => a.localeCompare(b, 'id'))
}

export function syncKontrakFieldsFromUnits(
  units: UnitRow[],
  payungMode: boolean,
): Partial<{
  komoditi: string
  jenis_komoditi: string
  satuan: string
  tahun_panen: string
  deskripsi_produk: string
  volume: number
  kebun_produsen: string
}> {
  const valid = units.filter((u) => u.nama_unit.trim())
  if (valid.length === 0) return {}

  const first = valid[0]
  const patch: ReturnType<typeof syncKontrakFieldsFromUnits> = {}

  if (first.komoditi) patch.komoditi = first.komoditi
  if (first.jenis_komoditi) patch.jenis_komoditi = first.jenis_komoditi
  if (first.satuan) patch.satuan = first.satuan
  if (first.tahun_panen) patch.tahun_panen = first.tahun_panen
  if (first.deskripsi_produk) patch.deskripsi_produk = first.deskripsi_produk
  patch.kebun_produsen = valid.map((u) => u.nama_unit).join(', ')

  if (!payungMode) {
    const withVol = valid.filter((u) => (u.volume || 0) > 0)
    if (withVol.length > 0 && withVol.length === valid.length) {
      patch.volume = withVol.reduce((s, u) => s + (u.volume || 0), 0)
    }
  }

  return patch
}
