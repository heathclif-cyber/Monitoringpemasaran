from fastapi import APIRouter, Depends, HTTPException, Query
from fastapi.responses import StreamingResponse, HTMLResponse
from sqlalchemy.orm import Session
from datetime import timedelta
from typing import List
import math, mammoth

import models
import schemas
from database import get_db
from services.auth import require_write
from services.utils import terbilang_rupiah

router = APIRouter(prefix="/api/kontrak", tags=["Kontrak"])


@router.post("", response_model=schemas.KontrakOut)
def create_kontrak(kontrak: schemas.KontrakCreate, db: Session = Depends(get_db), _: models.User = Depends(require_write)):
    db_kontrak = db.query(models.Kontrak).filter(models.Kontrak.no_kontrak == kontrak.no_kontrak).first()

    # Calculate fields
    nilai_transaksi = ((kontrak.volume or 0.0) * (kontrak.harga_satuan or 0.0)) + (kontrak.premi or 0.0)
    nominal_ppn = nilai_transaksi * ((kontrak.ppn_persen or 0.0) / 100)
    jatuh_tempo_pembayaran = kontrak.tanggal_kontrak + timedelta(days=kontrak.lama_pembayaran_hari or 0)
    terbilang = terbilang_rupiah(math.floor(nilai_transaksi))

    if db_kontrak:
        for key, value in kontrak.model_dump().items():
            setattr(db_kontrak, key, value)
        db_kontrak.nilai_transaksi = nilai_transaksi
        db_kontrak.nominal_ppn = nominal_ppn
        db_kontrak.jatuh_tempo_pembayaran = jatuh_tempo_pembayaran
        db_kontrak.terbilang = terbilang
        db.flush()  # write kontrak first so child queries see updated values

        # ── Cascade: recalculate all linked Invoices & their DOs ──────────────
        pokok = nilai_transaksi  # (vol * harga) + premi
        ppn_val = 0.0
        if str(kontrak.is_ppn or 'true').lower() == 'true':
            ppn_val = pokok * ((kontrak.ppn_persen or 0.0) / 100)
        new_jumlah = pokok + ppn_val

        for inv in db_kontrak.invoices:
            inv.jumlah_pembayaran = new_jumlah
            inv.terbilang_invoice = terbilang_rupiah(math.floor(new_jumlah))

            # Recalculate each DO: volume_do = (nominal_transfer / new_jumlah) * new_volume
            new_vol = float(kontrak.volume or 0)
            for do in inv.delivery_orders:
                nominal = float(do.nominal_transfer or 0)
                if new_jumlah > 0 and new_vol > 0:
                    do.volume_do = round((nominal / new_jumlah) * new_vol)
                else:
                    do.volume_do = new_vol
                do.selisih = new_jumlah - nominal
        # ─────────────────────────────────────────────────────────────────────

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


@router.get("/preview", response_class=HTMLResponse)
def preview_kontrak_html(no_kontrak: str, db: Session = Depends(get_db)):
    from services.generator_word import generate_contract_docx
    db_kontrak = db.query(models.Kontrak).filter(models.Kontrak.no_kontrak == no_kontrak).first()
    if not db_kontrak:
        raise HTTPException(status_code=404, detail="Kontrak not found")
    buf = generate_contract_docx(db_kontrak)
    buf.seek(0)
    result = mammoth.convert_to_html(buf)
    return result.value


@router.get("/{no_kontrak:path}", response_model=schemas.KontrakOut)
def get_kontrak(no_kontrak: str, db: Session = Depends(get_db)):
    db_kontrak = db.query(models.Kontrak).filter(models.Kontrak.no_kontrak == no_kontrak).first()
    if not db_kontrak:
        raise HTTPException(status_code=404, detail="Kontrak not found")
    return db_kontrak
