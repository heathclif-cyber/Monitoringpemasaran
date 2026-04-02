from pydantic import BaseModel, ConfigDict
from typing import Optional
from datetime import date
from decimal import Decimal

class KontrakBase(BaseModel):
    no_kontrak: str
    tanggal_kontrak: date
    status: str = "Draft"
    pembeli: str | None = None
    nama_direktur: str | None = None
    alamat_pembeli: str | None = None
    
    komoditi: str | None = None
    jenis_komoditi: str | None = None
    satuan: str | None = None
    tahun_panen: str | None = None
    kebun_produsen: str | None = None
    simbol: str | None = None
    packaging: str | None = None
    deskripsi_produk: str | None = None
    mutu: str | None = None
    pelabuhan_muat: str | None = None
    
    volume: Decimal = Decimal('0.00')
    harga_satuan: Decimal = Decimal('0.00')
    premi: Decimal = Decimal('0.00')
    is_ppn: bool = True
    ppn_persen: Decimal = Decimal('11.00')
    
    is_pph: bool = False
    pph_persen: Decimal = Decimal('0.00')
    
    alamat_produksi: str | None = None
    chop: str | None = None
    pack_qty: Decimal = Decimal('0.00')
    banyaknya_bale_karung: Decimal = Decimal('0.00')
    no_kav_chop: str | None = None
    
    kondisi_penyerahan: str | None = None
    waktu_penyerahan: str | None = None
    penyerahan_hari: int = 0
    lama_pembayaran_hari: int = 0
    levering: str | None = None
    catatan: str | None = None
    no_reff: str | None = None
    bid_offer_nomor: str = "-"
    pemilik_komoditas: str = "PT Perkebunan Nusantara I Regional 8"
    penjual: str = "PT Perkebunan Nusantara I Regional 8\nJalan Urip Sumoharjo No. 72-76, Kota Makassar"
    pembayaran_metode: str = "Tunai"
    pembayaran_cara: str = "Transfer"
    pembayaran_bank: str = "Bank Rakyat Indonesia"
    pembayaran_atas_nama: str = "PT Perkebunan Nusantara I Regional 8"
    pembayaran_rek_no: str = "No. 0050-01-005356-30-0"
    syarat_syarat: str = "a. Pembayaran dilaksanakan selambat-lambatnya 15 hari kalender setelah ditandatanganinya Kontrak penjualan\nb. Penyerahan barang dilaksanakan setelah diterima bukti transfer pembayaran\nc. Pengambilan barang selambat-lambatnya 15 hari kalender dari batas akhir tanggal pembayaran\nd. Biaya-biaya yang terkait dengan administrasi Bank menjadi beban pembeli"
    dasar_ketentuan: str = "Mengacu kepada tata Cara dan Ketentuan Penjualan Komoditi Perkebunan PT Perkebunan Nusantara III (Persero)"
    lokasi: str = "Makassar"

class KontrakCreate(KontrakBase):
    pass

class KontrakOut(KontrakBase):
    nilai_transaksi: Decimal
    nominal_ppn: Decimal
    jatuh_tempo_pembayaran: date | None = None
    terbilang: str | None = None

    model_config = ConfigDict(from_attributes=True)

class InvoiceBase(BaseModel):
    no_invoice: str
    no_kontrak: str
    tanggal_transaksi: date
    status_invoice: str = "Unpaid"
    pph_22_persen: Decimal = Decimal('0.00')

class InvoiceCreate(InvoiceBase):
    pass

class InvoiceOut(InvoiceBase):
    jumlah_pembayaran: Decimal
    terbilang_invoice: str | None = None

    model_config = ConfigDict(from_attributes=True)

class DeliveryOrderBase(BaseModel):
    no_do: str
    no_invoice: str
    tanggal_do: date
    kepada_unit: str | None = None
    alamat_unit: str | None = None
    tanggal_pembayaran: date | None = None
    nominal_transfer: Decimal = Decimal('0.00')
    is_pph_disetor: bool = False

class DeliveryOrderCreate(DeliveryOrderBase):
    pass

class DeliveryOrderOut(DeliveryOrderBase):
    selisih: Decimal
    volume_do: Decimal = Decimal('0.00')

    model_config = ConfigDict(from_attributes=True)

