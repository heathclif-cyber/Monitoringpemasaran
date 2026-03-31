from sqlalchemy import Column, Integer, String, Float, Date, ForeignKey
from sqlalchemy.orm import relationship
from database import Base

class Kontrak(Base):
    __tablename__ = "kontrak"
    
    no_kontrak = Column(String, primary_key=True, index=True)
    tanggal_kontrak = Column(Date, nullable=False)
    status = Column(String, default="Draft")
    pembeli = Column(String)
    nama_direktur = Column(String)
    alamat_pembeli = Column(String)
    
    komoditi = Column(String)
    jenis_komoditi = Column(String)
    satuan = Column(String)
    tahun_panen = Column(String)
    kebun_produsen = Column(String)
    simbol = Column(String)
    packaging = Column(String)
    deskripsi_produk = Column(String)
    mutu = Column(String)
    pelabuhan_muat = Column(String)
    
    volume = Column(Float, default=0.0)
    harga_satuan = Column(Float, default=0.0)
    premi = Column(Float, default=0.0)
    ppn_persen = Column(Float, default=11.0)
    
    is_pph = Column(String, default="false") # using String for boolean ease across sqlite/postgres
    pph_persen = Column(Float, default=0.0)
    
    alamat_produksi = Column(String)
    chop = Column(String)
    pack_qty = Column(Float, default=0.0)
    banyaknya_bale_karung = Column(Float, default=0.0)
    no_kav_chop = Column(String)
    
    kondisi_penyerahan = Column(String)
    waktu_penyerahan = Column(String)
    penyerahan_hari = Column(Integer, default=0)
    lama_pembayaran_hari = Column(Integer, default=0)
    levering = Column(String)
    catatan = Column(String)
    no_reff = Column(String)
    bid_offer_nomor = Column(String, default="-")
    pemilik_komoditas = Column(String, default="PT Perkebunan Nusantara I Regional 8")
    penjual = Column(String, default="PT Perkebunan Nusantara I Regional 8\nJalan Urip Sumoharjo No. 72-76, Kota Makassar")
    pembayaran_metode = Column(String, default="Tunai")
    pembayaran_cara = Column(String, default="Transfer")
    pembayaran_bank = Column(String, default="Bank Rakyat Indonesia")
    pembayaran_atas_nama = Column(String, default="PT Perkebunan Nusantara I Regional 8")
    pembayaran_rek_no = Column(String, default="No. 0050-01-005356-30-0")
    syarat_syarat = Column(String, default="a. Pembayaran dilaksanakan selambat-lambatnya 15 hari kalender setelah ditandatanganinya Kontrak penjualan\nb. Penyerahan barang dilaksanakan setelah diterima bukti transfer pembayaran\nc. Pengambilan barang selambat-lambatnya 15 hari kalender dari batas akhir tanggal pembayaran\nd. Biaya-biaya yang terkait dengan administrasi Bank menjadi beban pembeli")
    dasar_ketentuan = Column(String, default="Mengacu kepada tata Cara dan Ketentuan Penjualan Komoditi Perkebunan PT Perkebunan Nusantara III (Persero)")
    lokasi = Column(String, default="Makassar")
    
    # Calculated Fields
    nilai_transaksi = Column(Float, default=0.0)
    nominal_ppn = Column(Float, default=0.0)
    jatuh_tempo_pembayaran = Column(Date)
    terbilang = Column(String)
    
    invoices = relationship("Invoice", back_populates="kontrak", cascade="all, delete-orphan")

class Invoice(Base):
    __tablename__ = "invoice"
    
    no_invoice = Column(String, primary_key=True, index=True)
    no_kontrak = Column(String, ForeignKey("kontrak.no_kontrak"))
    tanggal_transaksi = Column(Date, nullable=False)
    status_invoice = Column(String, default="Unpaid")
    pph_22_persen = Column(Float, default=0.0)
    
    # Calculated Fields
    jumlah_pembayaran = Column(Float, default=0.0)
    terbilang_invoice = Column(String)
    
    kontrak = relationship("Kontrak", back_populates="invoices")
    delivery_orders = relationship("DeliveryOrder", back_populates="invoice", cascade="all, delete-orphan")

class DeliveryOrder(Base):
    __tablename__ = "delivery_order"
    
    no_do = Column(String, primary_key=True, index=True)
    no_invoice = Column(String, ForeignKey("invoice.no_invoice"))
    tanggal_do = Column(Date, nullable=False)
    kepada_unit = Column(String)
    alamat_unit = Column(String)
    tanggal_pembayaran = Column(Date, nullable=True)
    nominal_transfer = Column(Float, default=0.0)
    is_pph_disetor = Column(String, default="false")
    
    # New SAP Fields
    superman = Column(String, nullable=True)
    kontrak_sap = Column(String, nullable=True)
    so_sap = Column(String, nullable=True)
    do_sap = Column(String, nullable=True)
    billing_sap = Column(String, nullable=True)
    
    # Calculated Fields
    selisih = Column(Float, default=0.0)
    volume_do = Column(Float, default=0.0)
    
    invoice = relationship("Invoice", back_populates="delivery_orders")

class LaporanBypass(Base):
    __tablename__ = "laporan_bypass"
    
    id = Column(Integer, primary_key=True, index=True)
    unit = Column(String)
    komoditi = Column(String)
    tanggal = Column(Date, nullable=False)
    nominal = Column(Float, default=0.0)
    pembeli = Column(String)
    deskripsi = Column(String)
    volume = Column(Float, default=0.0)
    satuan = Column(String, default="Kg")
    
    # Optional SAP fields
    superman = Column(String, nullable=True)
    kontrak_sap = Column(String, nullable=True)
    so_sap = Column(String, nullable=True)
    do_sap = Column(String, nullable=True)
    billing_sap = Column(String, nullable=True)
