import type { Kontrak } from '@/types'
import { safe } from '@/lib/utils'
import { terbilangRupiah } from '@/utils/terbilang'
import { calculateKontrakPricing, calculateJatuhTempo, DEFAULT_PENJUAL, DEFAULT_PEMILIK_KOMODITAS } from '@/utils/kontrakUtils'

interface KontrakPreviewProps {
  data: Partial<Kontrak>
}

// Exact replica of forms.js buildLivePreview() format
export function KontrakPreview({ data }: KontrakPreviewProps) {
  const {
    no_kontrak, tanggal_kontrak, lokasi,
    penjual, pembeli, nama_direktur, alamat_pembeli,
    pemilik_komoditas, no_reff,
    komoditi, jenis_komoditi, satuan, tahun_panen,
    kebun_produsen, simbol, packaging, deskripsi_produk, mutu, pelabuhan_muat,
    volume, harga_satuan, premi,
    is_ppn, ppn_persen, is_pph, pph_persen,
    chop, pack_qty, banyaknya_bale_karung,
    kondisi_penyerahan, waktu_penyerahan,
    lama_pembayaran_hari, levering,
    pembayaran_metode, pembayaran_cara, pembayaran_bank,
  } = data

  const pricing = calculateKontrakPricing(
    volume || 0, harga_satuan || 0, premi || 0,
    is_ppn || 'true', ppn_persen || 11,
    is_pph || 'false', pph_persen || 0,
  )

  const pjlRaw = penjual || DEFAULT_PENJUAL
  const pjlLines = pjlRaw.split('\n')
  const pjlNama = pjlLines[0]
  const pjlAddr = pjlLines[1] || 'Jalan Urip Sumoharjo No. 72-76, Kota Makassar'

  const pblNama = pembeli || '[Nama Pembeli]'
  const alamatPbl = alamat_pembeli || ''

  const pemilik = pemilik_komoditas || DEFAULT_PEMILIK_KOMODITAS
  const lok = lokasi || 'Makassar'

  const lamaByr = lama_pembayaran_hari || 15
  const syaratDef = [
    `Pembayaran dilaksanakan selambat-lambatnya ${lamaByr} hari kalender setelah ditandatanganinya Kontrak penjualan`,
    'Penyerahan barang dilaksanakan setelah diterima bukti transfer pembayaran',
    `Pengambilan barang selambat-lambatnya ${lamaByr} hari kalender dari batas akhir tanggal pembayaran`,
    'Biaya-biaya yang terkait dengan administrasi Bank menjadi beban pembeli',
  ]

  const dasar = 'Mengacu kepada tata Cara dan Ketentuan Penjualan Komoditi Perkebunan PT Perkebunan Nusantara III (Persero)'

  const tdLbl: React.CSSProperties = { fontWeight: 600, whiteSpace: 'nowrap', padding: '1px 8px 1px 0', verticalAlign: 'top', fontFamily: 'Arial, sans-serif', fontSize: '9pt' }
  const tdCol: React.CSSProperties = { padding: '1px 6px 1px 0', verticalAlign: 'top', fontFamily: 'Arial, sans-serif', fontSize: '9pt' }
  const tdVal: React.CSSProperties = { padding: '1px 0', verticalAlign: 'top', fontFamily: 'Arial, sans-serif', fontSize: '9pt' }
  const tdLbl2: React.CSSProperties = { fontWeight: 600, whiteSpace: 'nowrap', padding: '1px 4px 1px 12px', verticalAlign: 'top', fontFamily: 'Arial, sans-serif', fontSize: '9pt' }

  const RowS = ({ label, value, bold }: { label: string; value: string; bold?: boolean }) => (
    <tr>
      <td style={tdLbl}>{label}</td>
      <td style={tdCol}>:</td>
      <td style={tdVal} colSpan={4}>{bold ? <strong>{value}</strong> : value}</td>
    </tr>
  )

  const RowD = ({ l1, v1, l2, v2 }: { l1: string; v1: string; l2: string; v2: string }) => (
    <tr>
      <td style={tdLbl}>{l1}</td><td style={tdCol}>:</td><td style={tdVal}>{v1}</td>
      <td style={tdLbl2}>{l2}</td><td style={tdCol}>:</td><td style={tdVal}>{v2}</td>
    </tr>
  )

  const fmtRpLocal = (v: number) => v ? Number(v).toLocaleString('id-ID', { minimumFractionDigits: 2, maximumFractionDigits: 2 }) : '0,00'
  const fmtRpFull = (v: number) => 'Rp' + fmtRpLocal(v)
  const fmtVol = (v: number, s: string) => v > 0 ? Number(v).toLocaleString('id-ID', { minimumFractionDigits: 2, maximumFractionDigits: 2 }) + ' ' + (s || 'Unit') : '-'
  const fmtHarga = (v: number, s: string) => v > 0 ? fmtRpFull(v) + ' per ' + (s || 'Unit') : '-'
  const fmtDateLocal = (dateStr?: string) => {
    if (!dateStr) return '____ __________ ____'
    const [y, m, d] = dateStr.split('-')
    const months = ['', 'Januari', 'Februari', 'Maret', 'April', 'Mei', 'Juni', 'Juli', 'Agustus', 'September', 'Oktober', 'November', 'Desember']
    return `${parseInt(d)} ${months[parseInt(m)]} ${y}`
  }

  const isPpn = is_ppn !== 'false'
  const isPph = is_pph === 'true'

  return (
    <div style={{ fontFamily: 'Arial, sans-serif', fontSize: '9pt', color: '#000', padding: '14px', background: 'white' }}>
      <h2 style={{ textAlign: 'center', margin: '0 0 2px', fontSize: '11pt', textDecoration: 'underline' }}>
        <strong>KONTRAK PENJUALAN</strong>
      </h2>
      <p style={{ textAlign: 'center', margin: '2px 0 0', fontSize: '9pt' }}>
        Nomor : {safe(no_kontrak, '[No Kontrak]')}
      </p>
      <p style={{ textAlign: 'center', margin: '2px 0 16px', fontSize: '9pt' }}>
        Bid Offer Nomor : -
      </p>

      <table style={{ width: '100%', borderCollapse: 'collapse', fontSize: '9pt' }}>
        <tbody>
          <RowS label="Pemilik Komoditas" value={pemilik} bold />
          <tr>
            <td style={tdLbl}>Penjual</td><td style={tdCol}>:</td>
            <td style={tdVal} colSpan={4}><strong>{pjlNama}</strong><br />{pjlAddr}</td>
          </tr>
          <tr>
            <td style={tdLbl}>Pembeli</td><td style={tdCol}>:</td>
            <td style={tdVal} colSpan={4}><strong>{pblNama}</strong>{alamatPbl ? <><br />{alamatPbl}</> : null}</td>
          </tr>
          <RowS label="No. Referensi" value={safe(no_reff)} />
          <RowD l1="Komoditi" v1={safe(komoditi)} l2="Jenis Komoditi" v2={safe(jenis_komoditi)} />
          <RowD l1="Packaging" v1={safe(packaging)} l2="Symbol" v2={safe(simbol)} />
          <RowS label="Deskripsi Produk" value={safe(deskripsi_produk)} />
          <RowS label="Mutu" value={safe(mutu)} />
          <RowS label="Produsen" value={safe(kebun_produsen)} />
          <RowS label="Pelabuhan Muat" value={safe(pelabuhan_muat)} />
          <RowS label="Volume" value={fmtVol(volume || 0, satuan || 'Unit')} />
          <RowD l1="Harga Satuan" v1={fmtHarga(harga_satuan || 0, satuan || 'Unit')} l2="Premi" v2={premi && premi > 0 ? fmtRpLocal(premi) : '-'} />
          <RowS label="PPN" value={isPpn ? `Tarif Efektif ${ppn_persen || 11}%` : 'Non-PPN (Bebas PPN)'} />
          <RowS label="Kondisi Penyerahan" value={safe(kondisi_penyerahan)} />

          {/* Payment section */}
          <tr>
            <td style={tdLbl}>Pembayaran</td>
            <td style={tdCol}>:</td>
            <td style={tdVal}>
              <table style={{ width: '100%', fontSize: '9pt', borderCollapse: 'collapse' }}>
                <tbody>
                  <tr><td style={{ width: '70px' }}>Metode</td><td style={{ width: '10px' }}>:</td><td>{safe(pembayaran_metode, 'Tunai')}</td></tr>
                  <tr><td>Nama Bank</td><td>:</td><td>{safe(pembayaran_bank, 'Bank Rakyat Indonesia')}</td></tr>
                  <tr><td>Atas Nama</td><td>:</td><td>PT Perkebunan Nusantara I Regional 8</td></tr>
                  <tr><td>Rek No.</td><td>:</td><td>No. 0050-01-005356-30-0</td></tr>
                </tbody>
              </table>
            </td>
            <td style={{ ...tdLbl2, paddingTop: '2px' }}>
              Cara<br />Pembayaran<br /><br />Jatuh Tempo<br />Pembayaran
            </td>
            <td style={{ ...tdCol, paddingTop: '2px' }}><br />:<br /><br /><br />:</td>
            <td style={{ ...tdVal, paddingTop: '2px' }}>
              <br />{safe(pembayaran_cara, 'Transfer')}<br /><br /><br />Maks. {lamaByr} Hari
            </td>
          </tr>

          <RowS label="Waktu Penyerahan" value={safe(waktu_penyerahan)} />

          <tr>
            <td style={tdLbl}>Syarat - Syarat Lain</td>
            <td style={tdCol}>:</td>
            <td style={tdVal} colSpan={4}>
              <ol type="a" style={{ margin: 0, paddingLeft: '14px' }}>
                {syaratDef.map((s, i) => <li key={i}>{s}</li>)}
              </ol>
            </td>
          </tr>

          <RowS label="Dasar Ketentuan" value={dasar} />
          <RowS label="Jumlah (Pokok)" value={fmtRpFull(pricing.pokok)} />
          {isPph && <RowS label="PPh" value={`Potongan PPh 22 (${pph_persen || 0}%) : -${fmtRpLocal(pricing.nominalPph)}`} />}
          {isPph && <RowS label="Total Tagihan" value={fmtRpFull(pricing.totalTagihan)} bold />}
          <RowS label="Catatan" value="-" />
        </tbody>
      </table>

      <p style={{ textAlign: 'right', margin: '24px 0 10px', fontSize: '9pt' }}>
        {lok}, {fmtDateLocal(tanggal_kontrak)}
      </p>
      <div style={{ marginTop: '24px', fontSize: '9pt', fontWeight: 600, textAlign: 'left' }}>
        <div>Persetujuan Pembeli</div>
      </div>
    </div>
  )
}
