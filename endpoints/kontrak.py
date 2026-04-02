from fastapi import APIRouter, Depends, HTTPException
from fastapi.responses import StreamingResponse, HTMLResponse
from sqlalchemy.orm import Session
from datetime import timedelta
from typing import List
import math
from decimal import Decimal

import models
import schemas
from database import get_db
from services.utils import terbilang_rupiah

router = APIRouter(prefix="/api/kontrak", tags=["Kontrak"])


@router.post("", response_model=schemas.KontrakOut)
def create_kontrak(kontrak: schemas.KontrakCreate, db: Session = Depends(get_db)):
    db_kontrak = db.query(models.Kontrak).filter(models.Kontrak.no_kontrak == kontrak.no_kontrak).first()

    # Calculate fields using Decimal for precision
    vol = kontrak.volume or Decimal('0.00')
    hrg = kontrak.harga_satuan or Decimal('0.00')
    prm = kontrak.premi or Decimal('0.00')
    
    pokok = (vol * hrg) + prm
    nominal_ppn = Decimal('0.00')
    
    if kontrak.is_ppn:
        ppn_p = kontrak.ppn_persen or Decimal('0.00')
        nominal_ppn = pokok * (ppn_p / Decimal('100.00'))
        
    nilai_transaksi = pokok + nominal_ppn
    jatuh_tempo_pembayaran = kontrak.tanggal_kontrak + timedelta(days=kontrak.lama_pembayaran_hari)
    terbilang = terbilang_rupiah(int(nilai_transaksi))

    if db_kontrak:
        for key, value in kontrak.model_dump().items():
            setattr(db_kontrak, key, value)
        db_kontrak.nilai_transaksi = nilai_transaksi
        db_kontrak.nominal_ppn = nominal_ppn
        db_kontrak.jatuh_tempo_pembayaran = jatuh_tempo_pembayaran
        db_kontrak.terbilang = terbilang
        db.commit()
        db.refresh(db_kontrak)
        return db_kontrak
    else:
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


@router.get("", response_model=List[schemas.KontrakOut])
def get_kontraks(skip: int = 0, limit: int = 100, db: Session = Depends(get_db)):
    return db.query(models.Kontrak).offset(skip).limit(limit).all()


@router.get("/export")
def export_kontrak_docx(no_kontrak: str, db: Session = Depends(get_db)):
    from services.generator_word import generate_contract_docx
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


@router.get("/preview")
def preview_kontrak(no_kontrak: str, db: Session = Depends(get_db)):
    """Return a lightweight HTML fragment for the live preview panel."""
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
    pokok = (vol * harga) + premi
    ppn_nom = 0.0
    if str(getattr(k, 'is_ppn', 'true')).lower() == 'true':
        ppn_nom = pokok * (ppn_pct / 100)
    total_nilai = pokok + ppn_nom
    tgl = k.tanggal_kontrak
    months = ['', 'Januari', 'Februari', 'Maret', 'April', 'Mei', 'Juni', 'Juli', 'Agustus', 'September', 'Oktober', 'November', 'Desember']
    tgl_str = f"{tgl.day} {months[tgl.month]} {tgl.year}" if tgl else '-'
    syarat_rows = ''.join(f'<li style="margin-bottom:2px">{ln}</li>' for ln in s(k.syarat_syarat, '').split('\n') if ln.strip())

    TD_LBL = 'style="font-weight:600;white-space:nowrap;padding:1px 8px 1px 0;vertical-align:top;"'
    TD_COL = 'style="padding:1px 6px 1px 0;vertical-align:top;"'
    TD_VAL = 'style="padding:1px 0;vertical-align:top;"'
    TD_LBL2 = 'style="font-weight:600;white-space:nowrap;padding:1px 4px 1px 12px;vertical-align:top;"'

    def row(label, val):
        return f'<tr><td {TD_LBL}>{label}</td><td {TD_COL}>:</td><td {TD_VAL} colspan="4">{val}</td></tr>'

    def rowD(l1, v1, l2, v2):
        return f'<tr><td {TD_LBL}>{l1}</td><td {TD_COL}>:</td><td {TD_VAL}>{v1}</td><td {TD_LBL2}>{l2}</td><td {TD_COL}>:</td><td {TD_VAL}>{v2}</td></tr>'

    syarat_rows = ''.join(f'<li>{ln}</li>' for ln in s(k.syarat_syarat, '').split('\n') if ln.strip())

    html = f'''
    <div style="font-family:'Arial',sans-serif;font-size:9pt;color:#000;padding:14px;background:white">
      <h2 style="text-align:center;margin:0 0 2px;font-size:11pt;text-decoration:underline;"><strong>KONTRAK PENJUALAN</strong></h2>
      <p style="text-align:center;margin:2px 0 0;font-size:9pt">Nomor : {s(k.no_kontrak)}</p>
      <p style="text-align:center;margin:2px 0 16px;font-size:9pt">Bid Offer Nomor : {s(k.bid_offer_nomor)}</p>
      
      <table style="width:100%;border-collapse:collapse;font-size:9pt;">
        {row('Pemilik Komoditas', "<strong>" + s(k.pemilik_komoditas) + "</strong>")}
        <tr><td {TD_LBL}>Penjual</td><td {TD_COL}>:</td><td {TD_VAL} colspan="4"><strong>{s(k.penjual).replace(chr(10), '<br>')}</strong></td></tr>
        <tr><td {TD_LBL}>Pembeli</td><td {TD_COL}>:</td><td {TD_VAL} colspan="4"><strong>{s(k.pembeli).replace(chr(10), '<br>')}</strong><br>{s(k.alamat_pembeli,"")}</td></tr>
        {row('No. Referensi', s(k.no_reff))}
        {rowD('Komoditi', s(k.komoditi), 'Jenis Komoditi', s(k.jenis_komoditi))}
        {rowD('Packaging', s(k.packaging), 'Symbol', s(k.simbol))}
        {row('Deskripsi Produk', s(k.deskripsi_produk))}
        {row('Mutu', s(k.mutu))}
        {row('Produsen', s(k.kebun_produsen))}
        {row('Pelabuhan Muat', s(k.pelabuhan_muat))}
        {row('Volume', f'{vol:,.0f}'.replace(",",".") + " " + satuan)}
        {rowD('Harga Satuan', fmt_rp(harga) + " per " + satuan, 'Premi', fmt_rp(premi) if premi else "-")}
        {row('PPN', f'Tarif Efektif {ppn_pct}%')}
        {row('Kondisi Penyerahan', s(k.kondisi_penyerahan))}
        
        <tr>
          <td {TD_LBL}>Pembayaran</td>
          <td {TD_COL}>:</td>
          <td {TD_VAL}>
            <table style="width:100%;font-size:9pt;border-collapse:collapse;">
                <tr><td style="width:70px">Metode</td><td style="width:10px">:</td><td>{s(k.pembayaran_metode)}</td></tr>
                <tr><td>Nama Bank</td><td>:</td><td>{s(k.pembayaran_bank)}</td></tr>
                <tr><td>Atas Nama</td><td>:</td><td>PT Perkebunan Nusantara I Regional 8</td></tr>
                <tr><td>Rek No.</td><td>:</td><td>No. 0050-01-005356-30-0</td></tr>
            </table>
          </td>
          <td {TD_LBL2} style="padding-top:2px;">
            Cara<br>Pembayaran<br><br>Jatuh Tempo<br>Pembayaran
          </td>
          <td {TD_COL} style="padding-top:2px;"><br>:<br><br><br>:</td>
          <td {TD_VAL} style="padding-top:2px;"><br>{s(k.pembayaran_cara)}<br><br><br>Maks. {k.lama_pembayaran_hari or 15} Hari</td>
        </tr>
        
        {row('Waktu Penyerahan', s(k.waktu_penyerahan))}
        <tr>
          <td {TD_LBL}>Syarat - Syarat Lain</td>
          <td {TD_COL}>:</td>
          <td {TD_VAL} colspan="4">
            <ol type="a" style="margin:0;padding-left:14px;">
              {syarat_rows}
            </ol>
          </td>
        </tr>
        {row('Dasar Ketentuan', s(k.dasar_ketentuan, "Mengacu kepada tata Cara dan Ketentuan Penjualan Komoditi Perkebunan PT Perkebunan Nusantara III (Persero)"))}
        {row('Jumlah Pembayaran', fmt_rp(total_nilai))}
        {row('Catatan', '-')}
      </table>
      
      <p style="text-align:right;margin:24px 0 10px;font-size:9pt;">{s(k.lokasi,'Makassar')}, {tgl_str}</p>
      <div style="margin-top:24px;font-size:9pt;font-weight:600;text-align:left;">
        <div>Persetujuan Pembeli</div>
      </div>
    </div>'''

    return HTMLResponse(content=html)


@router.get("/{no_kontrak:path}", response_model=schemas.KontrakOut)
def get_kontrak(no_kontrak: str, db: Session = Depends(get_db)):
    db_kontrak = db.query(models.Kontrak).filter(models.Kontrak.no_kontrak == no_kontrak).first()
    if not db_kontrak:
        raise HTTPException(status_code=404, detail="Kontrak not found")
    return db_kontrak
@router.delete("/{no_kontrak:path}")
def delete_kontrak(no_kontrak: str, db: Session = Depends(get_db)):
    db_kontrak = db.query(models.Kontrak).filter(models.Kontrak.no_kontrak == no_kontrak).first()
    if not db_kontrak:
        raise HTTPException(status_code=404, detail="Kontrak not found")
    
    db.delete(db_kontrak)
    db.commit()
    return {"success": True, "message": "Kontrak deleted successfully"}
