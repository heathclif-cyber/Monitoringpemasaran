from fastapi import APIRouter, Depends, HTTPException
from fastapi.responses import StreamingResponse, HTMLResponse
from sqlalchemy.orm import Session, joinedload
from datetime import timedelta
from typing import List
import math

import models
import schemas
from database import get_db
from services.auth import require_write
from services.utils import terbilang_rupiah
from services.cache import api_cache
from services.ba_utils import is_payung_ba
from services.money_utils import as_money

router = APIRouter(prefix="/api/kontrak", tags=["Kontrak"])


@router.post("", response_model=schemas.KontrakOut)
def create_kontrak(kontrak: schemas.KontrakCreate, db: Session = Depends(get_db), _: models.User = Depends(require_write)):
    db_kontrak = db.query(models.Kontrak).filter(models.Kontrak.no_kontrak == kontrak.no_kontrak).first()

    units_input = kontrak.units or []
    kontrak_data = kontrak.model_dump(exclude={'units'})
    kontrak_data['status'] = 'Active'
    payung = is_payung_ba(kontrak)

    if payung:
        kontrak_data['volume'] = 0.0
        kontrak_data['premi'] = 0.0
        kontrak_data['harga_satuan'] = 0.0
        volume_for_calc = 0.0
        pokok = 0.0
        nominal_ppn = 0.0
        nilai_transaksi = 0.0
    else:
        # Jika semua unit memiliki volume > 0, derive volume kontrak dari sum unit
        units_with_vol = [u for u in units_input if (u.volume or 0) > 0]
        if units_with_vol and len(units_with_vol) == len(units_input) and units_input:
            derived_volume = sum(u.volume or 0.0 for u in units_input)
            kontrak_data['volume'] = derived_volume
            volume_for_calc = derived_volume
        else:
            volume_for_calc = kontrak.volume or 0.0

        # Hitung desimal penuh dulu; simpan sen (2 desimal). Tampilan UI membulatkan.
        pokok_raw = (volume_for_calc * (kontrak.harga_satuan or 0.0)) + (kontrak.premi or 0.0)
        nominal_ppn_raw = 0.0
        if str(kontrak.is_ppn).lower() == 'true':
            nominal_ppn_raw = pokok_raw * ((kontrak.ppn_persen or 0.0) / 100)
        pokok = as_money(pokok_raw)
        nominal_ppn = as_money(nominal_ppn_raw)
        nilai_transaksi = as_money(pokok_raw + nominal_ppn_raw)

    jatuh_tempo_pembayaran = kontrak.tanggal_kontrak + timedelta(days=kontrak.lama_pembayaran_hari or 0)
    # Terbilang dari nilai tampilan (bulat); DB tetap desimal.
    terbilang = terbilang_rupiah(math.floor(nilai_transaksi + 1e-9))

    if db_kontrak:
        for key, value in kontrak_data.items():
            setattr(db_kontrak, key, value)
        db_kontrak.nilai_transaksi = nilai_transaksi
        db_kontrak.nominal_ppn = nominal_ppn
        db_kontrak.jatuh_tempo_pembayaran = jatuh_tempo_pembayaran
        db_kontrak.terbilang = terbilang
    else:
        db_kontrak = models.Kontrak(
            **kontrak_data,
            nilai_transaksi=nilai_transaksi,
            nominal_ppn=nominal_ppn,
            jatuh_tempo_pembayaran=jatuh_tempo_pembayaran,
            terbilang=terbilang
        )
        db.add(db_kontrak)

    db.flush()

    # Replace units
    db.query(models.KontrakUnit).filter(models.KontrakUnit.no_kontrak == kontrak.no_kontrak).delete()
    for i, unit in enumerate(units_input):
        unit_volume = 0.0 if payung else (unit.volume or 0.0)
        db.add(models.KontrakUnit(
            no_kontrak=kontrak.no_kontrak,
            nama_unit=unit.nama_unit,
            urutan=i,
            volume=unit_volume,
            komoditi=unit.komoditi,
            jenis_komoditi=unit.jenis_komoditi,
            satuan=unit.satuan,
            tahun_panen=unit.tahun_panen,
            deskripsi_produk=unit.deskripsi_produk,
        ))

    # Sync kontrak-level fields dari unit pertama
    if units_input:
        first = units_input[0]
        if first.komoditi is not None:
            db_kontrak.komoditi = first.komoditi
        if first.jenis_komoditi is not None:
            db_kontrak.jenis_komoditi = first.jenis_komoditi
            if not first.deskripsi_produk:
                db_kontrak.deskripsi_produk = first.jenis_komoditi
        if first.satuan is not None:
            db_kontrak.satuan = first.satuan
        if first.tahun_panen is not None:
            db_kontrak.tahun_panen = first.tahun_panen
        if first.deskripsi_produk is not None:
            db_kontrak.deskripsi_produk = first.deskripsi_produk
        db_kontrak.kebun_produsen = ", ".join(u.nama_unit for u in units_input if u.nama_unit)

    db.commit()
    api_cache.invalidate_reporting()
    db.refresh(db_kontrak)
    return db_kontrak


@router.get("", response_model=List[schemas.KontrakOut])
def get_kontraks(skip: int = 0, limit: int = 100, db: Session = Depends(get_db)):
    return (
        db.query(models.Kontrak)
        .options(joinedload(models.Kontrak.units))
        .offset(skip)
        .limit(limit)
        .all()
    )


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

    payung = is_payung_ba(k)
    vol = 0 if payung else (k.volume or 0)
    harga = k.harga_satuan or 0
    premi = 0 if payung else (k.premi or 0)
    ppn_pct = k.ppn_persen or 0
    satuan = s(k.satuan, 'Unit')
    pokok = (vol * harga) + premi
    ppn_nom = 0.0
    if str(getattr(k, 'is_ppn', 'true')).lower() == 'true':
        ppn_nom = pokok * (ppn_pct / 100)
    total_nilai = pokok + ppn_nom
    vol_label = 'Sesuai Berita Acara' if payung else f'{vol:,.0f}'.replace(",",".") + " " + satuan
    harga_label = 'Sesuai harga pasar / Berita Acara' if payung else fmt_rp(harga) + " per " + satuan
    jml_label = 'Sesuai Berita Acara' if payung else fmt_rp(total_nilai)
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

    # Build produsen/unit row — tampilkan multi-material jika ada unit dengan info material
    units_db = getattr(k, 'units', None) or []
    if units_db:
        unit_parts = []
        for u in units_db:
            u_text = f"<strong>{u.nama_unit}</strong>"
            mat = getattr(u, 'komoditi', None)
            if mat:
                u_text += f" — {mat}"
                jm = getattr(u, 'jenis_komoditi', None)
                if jm:
                    u_text += f" ({jm})"
            vol_u = u.volume or 0
            if vol_u > 0:
                sat_u = getattr(u, 'satuan', None) or s(k.satuan, 'Unit')
                u_text += f" ({vol_u:,.0f} {sat_u})"
            unit_parts.append(u_text)
        produsen_html = '<br>'.join(unit_parts)
    else:
        produsen_html = s(k.kebun_produsen)

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
        {row('Deskripsi Produk', s(k.jenis_komoditi or k.deskripsi_produk))}
        {row('Mutu', s(k.mutu))}
        {row('Produsen / Unit', produsen_html)}
        {row('Pelabuhan Muat', s(k.pelabuhan_muat))}
        {row('Volume', vol_label)}
        {rowD('Harga Satuan', harga_label, 'Premi', fmt_rp(premi) if premi else "-")}
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
        {row('Jumlah Pembayaran', jml_label)}
        {row('Catatan', '-')}
      </table>
      
      <p style="text-align:right;margin:24px 0 10px;font-size:9pt;">{s(k.lokasi,'Makassar')}, {tgl_str}</p>
      <div style="margin-top:24px;font-size:9pt;font-weight:600;text-align:left;">
        <div>Persetujuan Pembeli</div>
      </div>
    </div>'''

    return HTMLResponse(content=html)


@router.get("/trace")
def get_kontrak_trace(no_kontrak: str, db: Session = Depends(get_db)):
    from sqlalchemy.orm import joinedload
    k = db.query(models.Kontrak).options(
        joinedload(models.Kontrak.invoices).joinedload(models.Invoice.pembayaran).joinedload(models.Pembayaran.delivery_order),
        joinedload(models.Kontrak.invoices).joinedload(models.Invoice.delivery_orders),
    ).filter(models.Kontrak.no_kontrak == no_kontrak).first()

    if not k:
        raise HTTPException(status_code=404, detail="Kontrak not found")

    k_vol = float(k.volume or 0)
    k_nilai = float(k.nilai_transaksi or 0)

    total_do_nominal = 0.0
    total_do_volume = 0.0
    invoices_data = []

    for inv in k.invoices:
        kewajiban = float(inv.jumlah_pembayaran or 0)
        dos_data = []
        pembayaran_data = []
        inv_terbayar = 0.0

        for pay in inv.pembayaran:
            pay_nominal = float(pay.nominal_transfer or 0)
            inv_terbayar += pay_nominal
            total_do_nominal += pay_nominal
            linked_do = pay.delivery_order
            pembayaran_data.append({
                "no_pembayaran": pay.no_pembayaran,
                "tanggal_pembayaran": pay.tanggal_pembayaran.isoformat() if pay.tanggal_pembayaran else None,
                "nominal_transfer": pay_nominal,
                "selisih": float(pay.selisih or 0),
                "is_pph_disetor": pay.is_pph_disetor or "false",
                "no_do": linked_do.no_do if linked_do else None,
                "status_do": "Sudah DO" if linked_do else "Menunggu DO",
            })

        for do in inv.delivery_orders:
            do_nominal = float(do.nominal_transfer or 0)
            do_vol = float(do.volume_do or 0)
            total_do_volume += do_vol
            dos_data.append({
                "no_do": do.no_do,
                "no_pembayaran": do.no_pembayaran,
                "tanggal_do": do.tanggal_do.isoformat() if do.tanggal_do else None,
                "tanggal_pembayaran": do.tanggal_pembayaran.isoformat() if do.tanggal_pembayaran else None,
                "rencana_pengambilan": do.rencana_pengambilan.isoformat() if do.rencana_pengambilan else None,
                "kepada_unit": do.kepada_unit,
                "nominal_transfer": do_nominal,
                "volume_do": do_vol,
                "selisih": float(do.selisih or 0),
                "is_pph_disetor": do.is_pph_disetor or "false",
            })

        inv_sisa = round(kewajiban - inv_terbayar)
        if inv_sisa <= 0:
            pay_status = "LUNAS"
        elif inv_terbayar > 0:
            pay_status = "SEBAGIAN"
        else:
            pay_status = "BELUM"

        invoices_data.append({
            "no_invoice": inv.no_invoice,
            "tanggal_transaksi": inv.tanggal_transaksi.isoformat() if inv.tanggal_transaksi else None,
            "nama_unit": inv.nama_unit,
            "jumlah_pembayaran": float(inv.jumlah_pembayaran or 0),
            "kewajiban": kewajiban,
            "total_terbayar": inv_terbayar,
            "sisa_pembayaran": inv_sisa,
            "persen_terbayar": round((inv_terbayar / kewajiban * 100) if kewajiban > 0 else 0, 1),
            "payment_status": pay_status,
            "jumlah_record_pembayaran": len(pembayaran_data),
            "jumlah_do": len(dos_data),
            "pembayaran": pembayaran_data,
            "delivery_orders": dos_data,
        })

    sisa_bayar = round(k_nilai - total_do_nominal)
    sisa_vol = round(k_vol - total_do_volume)
    persen_bayar = round((total_do_nominal / k_nilai * 100) if k_nilai > 0 else 0, 1)
    persen_vol = round((total_do_volume / k_vol * 100) if k_vol > 0 else 0, 1)

    if sisa_bayar <= 0:
        overall_status = "LUNAS"
    elif total_do_nominal > 0:
        overall_status = "SEBAGIAN"
    else:
        overall_status = "BELUM"

    return {
        "no_kontrak": k.no_kontrak,
        "tanggal_kontrak": k.tanggal_kontrak.isoformat() if k.tanggal_kontrak else None,
        "jatuh_tempo_pembayaran": k.jatuh_tempo_pembayaran.isoformat() if k.jatuh_tempo_pembayaran else None,
        "pembeli": k.pembeli,
        "komoditi": k.komoditi,
        "satuan": k.satuan,
        "nilai_transaksi": k_nilai,
        "volume": k_vol,
        "kebun_produsen": k.kebun_produsen,
        "summary": {
            "total_nilai": k_nilai,
            "total_terbayar": total_do_nominal,
            "sisa_pembayaran": sisa_bayar,
            "persen_terbayar": persen_bayar,
            "total_volume": k_vol,
            "total_volume_do": total_do_volume,
            "sisa_volume": sisa_vol,
            "persen_volume": persen_vol,
            "jumlah_invoice": len(invoices_data),
            "jumlah_do": sum(d["jumlah_do"] for d in invoices_data),
            "overall_status": overall_status,
        },
        "invoices": invoices_data,
    }


@router.get("/{no_kontrak:path}", response_model=schemas.KontrakOut)
def get_kontrak(no_kontrak: str, db: Session = Depends(get_db)):
    db_kontrak = (
        db.query(models.Kontrak)
        .options(joinedload(models.Kontrak.units))
        .filter(models.Kontrak.no_kontrak == no_kontrak)
        .first()
    )
    if not db_kontrak:
        raise HTTPException(status_code=404, detail="Kontrak not found")
    return db_kontrak
@router.delete("/{no_kontrak:path}")
def delete_kontrak(no_kontrak: str, db: Session = Depends(get_db), _: models.User = Depends(require_write)):
    db_kontrak = db.query(models.Kontrak).filter(models.Kontrak.no_kontrak == no_kontrak).first()
    if not db_kontrak:
        raise HTTPException(status_code=404, detail="Kontrak not found")
    
    db.delete(db_kontrak)
    db.commit()
    api_cache.invalidate_reporting()
    return {"success": True, "message": "Kontrak deleted successfully"}
