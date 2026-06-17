from pydantic import BaseModel
from typing import Optional, List
from datetime import date, datetime


# --- Auth ---
class LoginRequest(BaseModel):
    username: str
    password: str

class TokenResponse(BaseModel):
    access_token: str
    token_type: str = "bearer"
    user: "UserOut"

class UserOut(BaseModel):
    id: int
    username: str
    nama_lengkap: str
    jabatan: Optional[str] = None
    role: str
    is_active: bool

    class Config:
        from_attributes = True

class UserCreate(BaseModel):
    username: str
    password: str
    nama_lengkap: str
    jabatan: Optional[str] = None
    role: str = "staff"

class UserUpdate(BaseModel):
    nama_lengkap: Optional[str] = None
    jabatan: Optional[str] = None
    role: Optional[str] = None
    is_active: Optional[bool] = None

class PasswordReset(BaseModel):
    new_password: str

TokenResponse.model_rebuild()

class KontrakUnitInput(BaseModel):
    nama_unit: str
    volume: Optional[float] = 0.0
    komoditi: Optional[str] = None
    jenis_komoditi: Optional[str] = None
    satuan: Optional[str] = None
    tahun_panen: Optional[str] = None
    deskripsi_produk: Optional[str] = None

class KontrakUnitOut(BaseModel):
    id: int
    no_kontrak: str
    nama_unit: str
    urutan: int
    volume: float = 0.0
    komoditi: Optional[str] = None
    jenis_komoditi: Optional[str] = None
    satuan: Optional[str] = None
    tahun_panen: Optional[str] = None
    deskripsi_produk: Optional[str] = None

    class Config:
        from_attributes = True


class KontrakBase(BaseModel):
    no_kontrak: str
    tanggal_kontrak: date
    status: Optional[str] = "Active"
    pembeli: Optional[str] = None
    nama_direktur: Optional[str] = None
    alamat_pembeli: Optional[str] = None
    
    komoditi: Optional[str] = None
    jenis_komoditi: Optional[str] = None
    satuan: Optional[str] = None
    tahun_panen: Optional[str] = None
    kebun_produsen: Optional[str] = None
    simbol: Optional[str] = None
    packaging: Optional[str] = None
    deskripsi_produk: Optional[str] = None
    mutu: Optional[str] = None
    pelabuhan_muat: Optional[str] = None
    
    volume: Optional[float] = 0.0
    harga_satuan: Optional[float] = 0.0
    premi: Optional[float] = 0.0
    is_ppn: Optional[str] = "true"
    ppn_persen: Optional[float] = 11.0
    
    is_pph: Optional[str] = "false"
    pph_persen: Optional[float] = 0.25
    
    alamat_produksi: Optional[str] = None
    chop: Optional[str] = None
    pack_qty: Optional[float] = 0.0
    banyaknya_bale_karung: Optional[float] = 0.0
    no_kav_chop: Optional[str] = None
    
    kondisi_penyerahan: Optional[str] = None
    waktu_penyerahan: Optional[str] = None
    penyerahan_hari: Optional[int] = 0
    lama_pembayaran_hari: Optional[int] = 0
    levering: Optional[str] = None
    catatan: Optional[str] = None
    no_reff: Optional[str] = None
    bid_offer_nomor: Optional[str] = "-"
    pemilik_komoditas: Optional[str] = "PT Perkebunan Nusantara I Regional 8"
    penjual: Optional[str] = "PT Perkebunan Nusantara I Regional 8\nJalan Urip Sumoharjo No. 72-76, Kota Makassar"
    pembayaran_metode: Optional[str] = "Tunai"
    pembayaran_cara: Optional[str] = "Transfer"
    pembayaran_bank: Optional[str] = "Bank Rakyat Indonesia"
    pembayaran_atas_nama: Optional[str] = "PT Perkebunan Nusantara I Regional 8"
    pembayaran_rek_no: Optional[str] = "No. 0050-01-005356-30-0"
    syarat_syarat: Optional[str] = "a. Pembayaran dilaksanakan selambat-lambatnya 15 hari kalender setelah ditandatanganinya Kontrak penjualan\nb. Penyerahan barang dilaksanakan setelah diterima bukti transfer pembayaran\nc. Pengambilan barang selambat-lambatnya 15 hari kalender dari batas akhir tanggal pembayaran\nd. Biaya-biaya yang terkait dengan administrasi Bank menjadi beban pembeli"
    dasar_ketentuan: Optional[str] = "Mengacu kepada tata Cara dan Ketentuan Penjualan Komoditi Perkebunan PT Perkebunan Nusantara III (Persero)"
    lokasi: Optional[str] = "Makassar"
    tipe_alur: Optional[str] = "STANDAR"

class KontrakCreate(KontrakBase):
    units: Optional[List[KontrakUnitInput]] = []

class KontrakOut(KontrakBase):
    nilai_transaksi: float
    nominal_ppn: float
    jatuh_tempo_pembayaran: Optional[date]
    terbilang: Optional[str]
    units: List[KontrakUnitOut] = []

    class Config:
        from_attributes = True

class InvoiceBase(BaseModel):
    no_invoice: str
    no_kontrak: str
    tanggal_transaksi: date
    status_invoice: Optional[str] = "Unpaid"
    pph_22_persen: Optional[float] = 0.0
    jumlah_pembayaran: Optional[float] = None  # None = auto (full/unit value), set value = partial
    nama_unit: Optional[str] = None  # unit yang di-invoice; None = invoice kontrak keseluruhan
    no_ba: Optional[str] = None  # wajib untuk kontrak PAYUNG_BA

class InvoiceCreate(InvoiceBase):
    pass

class InvoiceOut(InvoiceBase):
    jumlah_pembayaran: float
    terbilang_invoice: Optional[str]
    nama_unit: Optional[str] = None
    no_ba: Optional[str] = None

    class Config:
        from_attributes = True

class DeliveryOrderBase(BaseModel):
    no_do: str
    no_invoice: str
    tanggal_do: date
    kepada_unit: Optional[str] = None
    alamat_unit: Optional[str] = None
    tanggal_pembayaran: Optional[date] = None
    nominal_transfer: Optional[float] = 0.0
    is_pph_disetor: Optional[str] = "false"
    rencana_pengambilan: Optional[date] = None
    no_ba: Optional[str] = None

class DeliveryOrderCreate(DeliveryOrderBase):
    pass

class DeliveryOrderOut(DeliveryOrderBase):
    selisih: float
    volume_do: Optional[float] = 0.0

    class Config:
        from_attributes = True


class BeritaAcaraBase(BaseModel):
    no_ba: str
    no_kontrak: str
    tanggal_ba: date
    volume_ba: float = 0.0
    nama_unit: Optional[str] = None
    komoditi: Optional[str] = None
    deskripsi: Optional[str] = None
    link_berita_acara: Optional[str] = None
    status: Optional[str] = "Draft"


class BeritaAcaraCreate(BeritaAcaraBase):
    pass


class BeritaAcaraOut(BeritaAcaraBase):
    class Config:
        from_attributes = True


class DocumentUploadOut(BaseModel):
    id: int
    entity_type: str
    entity_id: str
    doc_type: str
    file_name: str
    storage_path: Optional[str] = None
    web_url: str
    uploaded_at: Optional[datetime] = None

    class Config:
        from_attributes = True


class DocumentSlotOut(BaseModel):
    doc_type: str
    label: str
    uploaded: bool
    file_name: Optional[str] = None
    web_url: Optional[str] = None
    uploaded_at: Optional[datetime] = None
    document_id: Optional[int] = None


class DocumentCompletenessSummary(BaseModel):
    total: int
    uploaded: int
    missing: int


class DocumentCompletenessOut(BaseModel):
    entity_type: str
    entity_id: str
    display_label: str
    sublabel: Optional[str] = None
    slots: List[DocumentSlotOut]
    summary: DocumentCompletenessSummary
    related: List["DocumentCompletenessOut"] = []


class DocumentReferenceOut(BaseModel):
    entity_type: str
    entity_id: str
    label: str
    sublabel: Optional[str] = None


class DocumentSummaryRow(BaseModel):
    entity_type: str
    entity_id: str
    display_label: str
    sublabel: Optional[str] = None
    total: int
    uploaded: int
    missing: int
    slots: List[DocumentSlotOut]


DocumentCompletenessOut.model_rebuild()
