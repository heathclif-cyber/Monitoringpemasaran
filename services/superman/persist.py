"""Simpan nomor SPPn/SPPb Superman ke kolom delivery_order.superman."""

from __future__ import annotations

import models
from database import SessionLocal
from services.cache import api_cache


def format_superman_ref(sppb_no: str | None, sppn_no: str | None) -> str:
    parts: list[str] = []
    if sppb_no and str(sppb_no).strip():
        parts.append(str(sppb_no).strip())
    if sppn_no and str(sppn_no).strip():
        parts.append(str(sppn_no).strip())
    return " + ".join(parts)


def get_do_superman(no_do: str) -> str | None:
    db = SessionLocal()
    try:
        do = db.query(models.DeliveryOrder).filter(models.DeliveryOrder.no_do == no_do.strip()).first()
        if not do:
            return None
        value = (do.superman or "").strip()
        return value or None
    finally:
        db.close()


def assert_do_not_submitted(no_do: str) -> None:
    existing = get_do_superman(no_do)
    if existing:
        raise ValueError(
            f"DO {no_do} sudah pernah dibuatkan SPPn/SPPb di Superman: {existing}. "
            "Tidak dapat membuat duplikat."
        )


def save_superman_to_do(no_do: str, sppb_no: str | None, sppn_no: str | None) -> str | None:
    label = format_superman_ref(sppb_no, sppn_no)
    if not label:
        return None

    db = SessionLocal()
    try:
        do = db.query(models.DeliveryOrder).filter(models.DeliveryOrder.no_do == no_do.strip()).first()
        if not do:
            raise ValueError(f"DO tidak ditemukan: {no_do}")
        do.superman = label
        db.commit()
    finally:
        db.close()

    api_cache.invalidate_reporting()
    return label