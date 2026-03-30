from fastapi import APIRouter, Depends, HTTPException
from fastapi.responses import StreamingResponse
from sqlalchemy.orm import Session
from typing import List

import models
import schemas
from database import get_db

router = APIRouter(prefix="/api/do", tags=["Delivery Order"])


@router.post("", response_model=schemas.DeliveryOrderOut)
def create_do(do: schemas.DeliveryOrderCreate, db: Session = Depends(get_db)):
    db_invoice = db.query(models.Invoice).filter(models.Invoice.no_invoice == do.no_invoice).first()
    if not db_invoice:
        raise HTTPException(status_code=404, detail="Invoice not found")

    # Calculate fields
    selisih = db_invoice.jumlah_pembayaran - (do.nominal_transfer or 0.0)

    db_do = db.query(models.DeliveryOrder).filter(models.DeliveryOrder.no_do == do.no_do).first()
    if db_do:
        for key, value in do.model_dump().items():
            setattr(db_do, key, value)
        db_do.selisih = selisih
        db.commit()
        db.refresh(db_do)
        return db_do
    else:
        new_do = models.DeliveryOrder(
            **do.model_dump(),
            selisih=selisih
        )
        db.add(new_do)
        db.commit()
        db.refresh(new_do)
        return new_do


@router.get("", response_model=List[schemas.DeliveryOrderOut])
def get_dos(skip: int = 0, limit: int = 100, db: Session = Depends(get_db)):
    return db.query(models.DeliveryOrder).offset(skip).limit(limit).all()


@router.get("/export")
def export_do_docx(no_do: str, db: Session = Depends(get_db)):
    from services.generator_word import generate_do_docx
    db_do = db.query(models.DeliveryOrder).filter(models.DeliveryOrder.no_do == no_do).first()
    if not db_do:
        raise HTTPException(status_code=404, detail="DO not found")
    buf = generate_do_docx(db_do)
    safe_name = no_do.replace('/', '_').replace(' ', '_')
    return StreamingResponse(
        buf,
        media_type="application/vnd.openxmlformats-officedocument.wordprocessingml.document",
        headers={"Content-Disposition": f'attachment; filename="DO_{safe_name}.docx"'}
    )


@router.get("/{no_do:path}", response_model=schemas.DeliveryOrderOut)
def get_do(no_do: str, db: Session = Depends(get_db)):
    db_do = db.query(models.DeliveryOrder).filter(models.DeliveryOrder.no_do == no_do).first()
    if not db_do:
        raise HTTPException(status_code=404, detail="DO not found")
    return db_do
@router.delete("/{no_do:path}")
def delete_do(no_do: str, db: Session = Depends(get_db)):
    db_do = db.query(models.DeliveryOrder).filter(models.DeliveryOrder.no_do == no_do).first()
    if not db_do:
        raise HTTPException(status_code=404, detail="DO not found")
    
    db.delete(db_do)
    db.commit()
    return {"success": True, "message": "DO deleted successfully"}
