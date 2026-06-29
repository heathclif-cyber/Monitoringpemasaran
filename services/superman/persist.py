"""Simpan nomor SPPn/SPPb Superman ke invoice (dan sinkron ke pembayaran/DO terkait)."""

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


def get_invoice_superman(no_invoice: str) -> str | None:
    db = SessionLocal()
    try:
        inv = db.query(models.Invoice).filter(
            models.Invoice.no_invoice == no_invoice.strip()
        ).first()
        if not inv:
            return None
        value = (inv.superman or "").strip()
        return value or None
    finally:
        db.close()


def get_pembayaran_superman(no_pembayaran: str) -> str | None:
    db = SessionLocal()
    try:
        pay = db.query(models.Pembayaran).filter(
            models.Pembayaran.no_pembayaran == no_pembayaran.strip()
        ).first()
        if not pay:
            return None
        if pay.invoice and (pay.invoice.superman or "").strip():
            return pay.invoice.superman.strip()
        value = (pay.superman or "").strip()
        return value or None
    finally:
        db.close()


def get_do_superman(no_do: str) -> str | None:
    db = SessionLocal()
    try:
        do = db.query(models.DeliveryOrder).filter(
            models.DeliveryOrder.no_do == no_do.strip()
        ).first()
        if not do:
            return None
        if do.invoice and (do.invoice.superman or "").strip():
            return do.invoice.superman.strip()
        if do.no_pembayaran:
            pay_superman = get_pembayaran_superman(do.no_pembayaran)
            if pay_superman:
                return pay_superman
        value = (do.superman or "").strip()
        return value or None
    finally:
        db.close()


def assert_invoice_not_submitted(no_invoice: str) -> None:
    existing = get_invoice_superman(no_invoice)
    if existing:
        raise ValueError(
            f"Invoice {no_invoice} sudah pernah dibuatkan SPPn/SPPb di Superman: {existing}. "
            "Tidak dapat membuat duplikat."
        )


def assert_pembayaran_not_submitted(no_pembayaran: str) -> None:
    db = SessionLocal()
    try:
        pay = db.query(models.Pembayaran).filter(
            models.Pembayaran.no_pembayaran == no_pembayaran.strip()
        ).first()
        if pay and pay.no_invoice:
            assert_invoice_not_submitted(pay.no_invoice)
            return
    finally:
        db.close()
    existing = get_pembayaran_superman(no_pembayaran)
    if existing:
        raise ValueError(
            f"Pembayaran {no_pembayaran} sudah pernah dibuatkan SPPn/SPPb di Superman: {existing}. "
            "Tidak dapat membuat duplikat."
        )


def assert_do_not_submitted(no_do: str) -> None:
    db = SessionLocal()
    try:
        do = db.query(models.DeliveryOrder).filter(
            models.DeliveryOrder.no_do == no_do.strip()
        ).first()
        if do and do.no_invoice:
            assert_invoice_not_submitted(do.no_invoice)
            return
        if do and do.no_pembayaran:
            assert_pembayaran_not_submitted(do.no_pembayaran)
            return
    finally:
        db.close()
    existing = get_do_superman(no_do)
    if existing:
        raise ValueError(
            f"DO {no_do} sudah pernah dibuatkan SPPn/SPPb di Superman: {existing}. "
            "Tidak dapat membuat duplikat."
        )


def _sync_superman_to_related(db, no_invoice: str, label: str) -> None:
    pays = db.query(models.Pembayaran).filter(
        models.Pembayaran.no_invoice == no_invoice
    ).all()
    for pay in pays:
        pay.superman = label

    dos = db.query(models.DeliveryOrder).filter(
        models.DeliveryOrder.no_invoice == no_invoice
    ).all()
    for do in dos:
        do.superman = label


def save_superman_to_invoice(
    no_invoice: str,
    sppb_no: str | None,
    sppn_no: str | None,
) -> str | None:
    label = format_superman_ref(sppb_no, sppn_no)
    if not label:
        return None

    db = SessionLocal()
    try:
        inv = db.query(models.Invoice).filter(
            models.Invoice.no_invoice == no_invoice.strip()
        ).first()
        if not inv:
            raise ValueError(f"Invoice tidak ditemukan: {no_invoice}")
        inv.superman = label
        _sync_superman_to_related(db, inv.no_invoice, label)
        db.commit()
    finally:
        db.close()

    api_cache.invalidate_reporting()
    return label


def save_superman_to_pembayaran(
    no_pembayaran: str,
    sppb_no: str | None,
    sppn_no: str | None,
) -> str | None:
    db = SessionLocal()
    try:
        pay = db.query(models.Pembayaran).filter(
            models.Pembayaran.no_pembayaran == no_pembayaran.strip()
        ).first()
        if not pay or not pay.no_invoice:
            raise ValueError(f"Pembayaran tidak ditemukan: {no_pembayaran}")
        no_invoice = pay.no_invoice
    finally:
        db.close()
    return save_superman_to_invoice(no_invoice, sppb_no, sppn_no)


def save_superman_to_do(no_do: str, sppb_no: str | None, sppn_no: str | None) -> str | None:
    db = SessionLocal()
    try:
        do = db.query(models.DeliveryOrder).filter(
            models.DeliveryOrder.no_do == no_do.strip()
        ).first()
        if not do:
            raise ValueError(f"DO tidak ditemukan: {no_do}")
        if do.no_invoice:
            return save_superman_to_invoice(do.no_invoice, sppb_no, sppn_no)
        if do.no_pembayaran:
            return save_superman_to_pembayaran(do.no_pembayaran, sppb_no, sppn_no)
    finally:
        db.close()

    label = format_superman_ref(sppb_no, sppn_no)
    if not label:
        return None

    db = SessionLocal()
    try:
        do = db.query(models.DeliveryOrder).filter(
            models.DeliveryOrder.no_do == no_do.strip()
        ).first()
        if not do:
            raise ValueError(f"DO tidak ditemukan: {no_do}")
        do.superman = label
        db.commit()
    finally:
        db.close()

    api_cache.invalidate_reporting()
    return label