from fastapi import FastAPI, Depends, HTTPException, Request
from fastapi.responses import StreamingResponse
from fastapi.staticfiles import StaticFiles
from fastapi.templating import Jinja2Templates
from sqlalchemy.orm import Session
from sqlalchemy import func
from datetime import timedelta
import math
from typing import List

import models
import schemas
from database import engine, get_db
from utils import terbilang_rupiah

models.Base.metadata.create_all(bind=engine)

app = FastAPI(title="Project Blueprint API")

import os
os.makedirs("static/css", exist_ok=True)
os.makedirs("static/js", exist_ok=True)
os.makedirs("templates", exist_ok=True)

app.mount("/static", StaticFiles(directory="static"), name="static")
templates = Jinja2Templates(directory="templates")

@app.get("/")
def read_root(request: Request):
    return templates.TemplateResponse(request=request, name="index.html")

# --- KONTRAK API ---
@app.post("/api/kontrak", response_model=schemas.KontrakOut)
def create_kontrak(kontrak: schemas.KontrakCreate, db: Session = Depends(get_db)):
    db_kontrak = db.query(models.Kontrak).filter(models.Kontrak.no_kontrak == kontrak.no_kontrak).first()
    if db_kontrak:
        raise HTTPException(status_code=400, detail="Nomor Kontrak already exists")
    
    # Calculate fields
    nilai_transaksi = ((kontrak.volume or 0.0) * (kontrak.harga_satuan or 0.0)) + (kontrak.premi or 0.0)
    nominal_ppn = nilai_transaksi * ((kontrak.ppn_persen or 0.0) / 100)
    jatuh_tempo_pembayaran = kontrak.tanggal_kontrak + timedelta(days=kontrak.lama_pembayaran_hari or 0)
    terbilang = terbilang_rupiah(math.floor(nilai_transaksi))
    
    new_kontrak = models.Kontrak(
        **kontrak.model_dump(),
        nilai_transaksi=nilai_transaksi,
        nominal_ppn=nominal_ppn,
        jatuh_tempo_pembayaran=jatuh_tempo_pembayaran,
        terbilang=terbilang
    )
    db.add(new_kontrak)
    db.commit()
    db.refresh(new_kontrak)
    return new_kontrak

@app.get("/api/kontrak", response_model=List[schemas.KontrakOut])
def get_kontraks(skip: int = 0, limit: int = 100, db: Session = Depends(get_db)):
    return db.query(models.Kontrak).offset(skip).limit(limit).all()

@app.get("/api/kontrak/{no_kontrak}", response_model=schemas.KontrakOut)
def get_kontrak(no_kontrak: str, db: Session = Depends(get_db)):
    db_kontrak = db.query(models.Kontrak).filter(models.Kontrak.no_kontrak == no_kontrak).first()
    if not db_kontrak:
         raise HTTPException(status_code=404, detail="Kontrak not found")
    return db_kontrak

@app.get("/api/kontrak/export")
def export_kontrak_docx(no_kontrak: str, db: Session = Depends(get_db)):
    from word_generator import generate_contract_docx
    db_kontrak = db.query(models.Kontrak).filter(models.Kontrak.no_kontrak == no_kontrak).first()
    if not db_kontrak:
        raise HTTPException(status_code=404, detail="Kontrak not found")
    buf = generate_contract_docx(db_kontrak)
    safe_name = no_kontrak.replace('/', '_').replace(' ', '_')
    return StreamingResponse(
        buf,
        media_type="application/vnd.openxmlformats-officedocument.wordprocessingml.document",
        headers={"Content-Disposition": f'attachment; filename="Kontrak_{safe_name}.docx"'}
    )

@app.get("/api/kontrak/preview")
def preview_kontrak(no_kontrak: str, db: Session = Depends(get_db)):
    """Return a lightweight HTML fragment for the live preview panel."""
    from fastapi.responses import HTMLResponse
    db_kontrak = db.query(models.Kontrak).filter(models.Kontrak.no_kontrak == no_kontrak).first()
    if not db_kontrak:
        raise HTTPException(status_code=404, detail="Kontrak not found")
    k = db_kontrak

    def fmt_rp(v): return 'Rp{:,.0f}'.format(v or 0).replace(',', '.')
    def s(v, fb='-'): return str(v).strip() if v else fb

    vol = k.volume or 0
    harga = k.harga_satuan or 0
    premi = k.premi or 0
    ppn_pct = k.ppn_persen or 0
    satuan = s(k.satuan, 'Unit')
    nilai = (vol * harga) + premi
    ppn_nom = nilai * (ppn_pct / 100)
    tgl = k.tanggal_kontrak
    months = ['','Januari','Februari','Maret','April','Mei','Juni','Juli','Agustus','September','Oktober','November','Desember']
    tgl_str = f"{tgl.day} {months[tgl.month]} {tgl.year}" if tgl else '-'
    syarat_rows = ''.join(f'<li style="margin-bottom:2px">{ln}</li>' for ln in s(k.syarat_syarat,'').split('\n') if ln.strip())

    def row(label, val):
        return f'<tr><td style="font-weight:600;white-space:nowrap;padding:3px 8px 3px 0">{label}</td><td style="padding:3px 6px 3px 0">:</td><td style="padding:3px 0">{val}</td></tr>'

    html = f'''
    <div style="font-family:'Times New Roman',serif;font-size:10pt;color:#111;padding:8px">
      <h2 style="text-align:center;margin:0 0 2px;font-size:13pt">KONTRAK PENJUALAN</h2>
      <p style="text-align:center;margin:2px 0;font-size:10pt">Nomor : {s(k.no_kontrak)}</p>
      <p style="text-align:center;margin:2px 0 10px;font-size:10pt">Bid Offer Nomor : {s(k.bid_offer_nomor)}</p>
      <hr style="border:1px solid #333;margin-bottom:8px">
      <table style="width:100%;border-collapse:collapse;font-size:10pt">
        {row('Pemilik Komoditas', s(k.pemilik_komoditas))}
        {row('Penjual', s(k.penjual).replace(chr(10),'<br>'))}
        {row('Pembeli', s(k.pembeli).replace(chr(10),'<br>'))}
        {row('No. Referensi', s(k.no_reff))}
        <tr><td colspan="3" style="padding:4px 0;font-weight:700;background:#d9e1f2;padding-left:4px">I. SPESIFIKASI BARANG</td></tr>
        {row('Komoditi', s(k.komoditi))}
        {row('Jenis Komoditi', s(k.jenis_komoditi))}
        {row('Volume', f'{vol:,.0f}'.replace(",",".") + " " + satuan)}
        {row('Harga Satuan', fmt_rp(harga) + " / " + satuan)}
        {row('Premi', fmt_rp(premi) if premi else "-")}
        {row('PPN', f'Tarif Efektif {ppn_pct}%')}
        {row('Nilai Transaksi', "<strong>" + fmt_rp(nilai) + "</strong>")}
        {row('Nominal PPN', fmt_rp(ppn_nom))}
        {row('Kondisi Penyerahan', s(k.kondisi_penyerahan))}
        {row('Waktu Penyerahan', s(k.waktu_penyerahan))}
        <tr><td colspan="3" style="padding:4px 0;font-weight:700;background:#d9e1f2;padding-left:4px">II. PEMBAYARAN</td></tr>
        {row('Metode / Cara', s(k.pembayaran_metode) + ' / ' + s(k.pembayaran_cara))}
        {row('Nama Bank', s(k.pembayaran_bank))}
        {row('Jatuh Tempo', f'Maks. {k.lama_pembayaran_hari or 15} Hari')}
      </table>
      <p style="margin:6px 0 2px;font-weight:700">Syarat-Syarat Lain:</p>
      <ol style="margin:0 0 8px;padding-left:16px;font-size:9.5pt">{syarat_rows}</ol>
      <hr style="border:1px solid #333;margin:8px 0">
      <p style="font-weight:700;font-size:10pt">{row('Jumlah (Pokok)', "<strong>" + fmt_rp(nilai) + "</strong>")}</p>
      <p style="text-align:right;margin-top:12px;font-size:9.5pt">{s(k.lokasi,'Makassar')}, {tgl_str}</p>
    </div>'''
    return HTMLResponse(content=html)

@app.post("/api/invoice", response_model=schemas.InvoiceOut)
def create_invoice(invoice: schemas.InvoiceCreate, db: Session = Depends(get_db)):
    db_invoice = db.query(models.Invoice).filter(models.Invoice.no_invoice == invoice.no_invoice).first()
    if db_invoice:
        raise HTTPException(status_code=400, detail="Nomor Invoice already exists")
    
    db_kontrak = db.query(models.Kontrak).filter(models.Kontrak.no_kontrak == invoice.no_kontrak).first()
    if not db_kontrak:
        raise HTTPException(status_code=404, detail="Kontrak not found")
        
    # Calculate fields
    jumlah_pembayaran = db_kontrak.nilai_transaksi + db_kontrak.nominal_ppn + (db_kontrak.nilai_transaksi * ((invoice.pph_22_persen or 0.0) / 100))
    terbilang_invoice = terbilang_rupiah(math.floor(jumlah_pembayaran))
    
    new_invoice = models.Invoice(
        **invoice.model_dump(),
        jumlah_pembayaran=jumlah_pembayaran,
        terbilang_invoice=terbilang_invoice
    )
    db.add(new_invoice)
    db.commit()
    db.refresh(new_invoice)
    return new_invoice

@app.get("/api/invoice", response_model=List[schemas.InvoiceOut])
def get_invoices(skip: int = 0, limit: int = 100, db: Session = Depends(get_db)):
    return db.query(models.Invoice).offset(skip).limit(limit).all()

@app.get("/api/invoice/{no_invoice}", response_model=schemas.InvoiceOut)
def get_invoice(no_invoice: str, db: Session = Depends(get_db)):
    db_invoice = db.query(models.Invoice).filter(models.Invoice.no_invoice == no_invoice).first()
    if not db_invoice:
         raise HTTPException(status_code=404, detail="Invoice not found")
    return db_invoice

# --- DELIVERY ORDER API ---
@app.post("/api/do", response_model=schemas.DeliveryOrderOut)
def create_do(do: schemas.DeliveryOrderCreate, db: Session = Depends(get_db)):
    db_do = db.query(models.DeliveryOrder).filter(models.DeliveryOrder.no_do == do.no_do).first()
    if db_do:
        raise HTTPException(status_code=400, detail="Nomor DO already exists")
    
    db_invoice = db.query(models.Invoice).filter(models.Invoice.no_invoice == do.no_invoice).first()
    if not db_invoice:
        raise HTTPException(status_code=404, detail="Invoice not found")
        
    # Calculate fields
    selisih = db_invoice.jumlah_pembayaran - (do.nominal_transfer or 0.0)
    
    new_do = models.DeliveryOrder(
        **do.model_dump(),
        selisih=selisih
    )
    db.add(new_do)
    db.commit()
    db.refresh(new_do)
    return new_do

@app.get("/api/do", response_model=List[schemas.DeliveryOrderOut])
def get_dos(skip: int = 0, limit: int = 100, db: Session = Depends(get_db)):
    return db.query(models.DeliveryOrder).offset(skip).limit(limit).all()

@app.get("/api/do/{no_do}", response_model=schemas.DeliveryOrderOut)
def get_do(no_do: str, db: Session = Depends(get_db)):
    db_do = db.query(models.DeliveryOrder).filter(models.DeliveryOrder.no_do == no_do).first()
    if not db_do:
         raise HTTPException(status_code=404, detail="DO not found")
    return db_do

# --- DASHBOARD API ---
@app.get("/api/dashboard")
def get_dashboard_data(db: Session = Depends(get_db)):
    total_kontrak = db.query(func.count(models.Kontrak.no_kontrak)).scalar() or 0
    total_invoice = db.query(func.count(models.Invoice.no_invoice)).scalar() or 0
    total_do = db.query(func.count(models.DeliveryOrder.no_do)).scalar() or 0
    total_nilai_transaksi = db.query(func.sum(models.Kontrak.nilai_transaksi)).scalar() or 0.0
    
    komoditas_data = db.query(
        models.Kontrak.komoditi, 
        func.sum(models.Kontrak.volume).label("total_volume")
    ).group_by(models.Kontrak.komoditi).all()
    
    komoditas_labels = [row.komoditi or "Unknown" for row in komoditas_data]
    komoditas_values = [row.total_volume for row in komoditas_data]
    
    tren_data = db.query(
        func.strftime("%Y-%m", models.Kontrak.tanggal_kontrak).label("bulan"),
        func.sum(models.Kontrak.nilai_transaksi).label("total_nilai")
    ).group_by(
        func.strftime("%Y-%m", models.Kontrak.tanggal_kontrak)
    ).order_by("bulan").all()
    
    tren_labels = [row.bulan for row in tren_data if row.bulan]
    tren_values = [row.total_nilai for row in tren_data if row.bulan]
    
    return {
        "summary": {
            "total_kontrak": total_kontrak,
            "total_invoice": total_invoice,
            "total_do": total_do,
            "total_nilai_transaksi": total_nilai_transaksi
        },
        "charts": {
            "komoditas": {
                "labels": komoditas_labels,
                "values": komoditas_values
            },
            "tren": {
                "labels": tren_labels,
                "values": tren_values
            }
        }
    }
