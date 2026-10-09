"""Explicit BA pickup links; umbrella BA remains the invoice's origin."""
from sqlalchemy import text
import models


def ensure_schema(engine):
    with engine.begin() as connection:
        connection.execute(text("ALTER TABLE berita_acara ADD COLUMN IF NOT EXISTS no_do VARCHAR REFERENCES delivery_order(no_do)"))
        connection.execute(text("CREATE INDEX IF NOT EXISTS ix_berita_acara_no_do ON berita_acara(no_do)"))


def linked_pickup_bas(db, no_do, exclude_no_ba=None):
    do = db.query(models.DeliveryOrder).filter_by(no_do=no_do).first()
    refs = db.query(models.BeritaAcara).filter(models.BeritaAcara.no_do == no_do).all()
    if do and do.no_ba:
        legacy = db.query(models.BeritaAcara).filter_by(no_ba=do.no_ba).first()
        if legacy and legacy.no_ba not in {b.no_ba for b in refs}:
            refs.append(legacy)
    return [b for b in refs if b.no_ba != exclude_no_ba]


def resolve_pickup_do(db, contract, no_do, volume, exclude_no_ba=None, required=False):
    candidates = (db.query(models.DeliveryOrder).join(models.Invoice)
                  .filter(models.Invoice.no_kontrak == contract.no_kontrak).all())
    if no_do:
        candidate = next((do for do in candidates if do.no_do == no_do), None)
        if not candidate:
            raise ValueError("DO tidak ditemukan atau tidak sesuai kontrak BA")
    else:
        eligible = []
        for do in candidates:
            used = sum(float(b.volume_ba or 0) for b in linked_pickup_bas(db, do.no_do, exclude_no_ba))
            if float(do.volume_do or 0) - used + 1e-6 >= volume:
                eligible.append(do)
        candidate = eligible[0] if len(eligible) == 1 else None
    if candidate is None:
        if required:
            raise ValueError("Pilih DO pengambilan; belum ada DO yang sesuai atau terdapat beberapa pilihan")
        return None
    # Serialize saves against the DO so simultaneous BA cannot exceed its volume.
    db.query(models.DeliveryOrder).filter_by(no_do=candidate.no_do).with_for_update().first()
    used = sum(float(b.volume_ba or 0) for b in linked_pickup_bas(db, candidate.no_do, exclude_no_ba))
    if used + volume > float(candidate.volume_do or 0) + 1e-6:
        raise ValueError("Total volume BA melebihi volume DO yang dipilih")
    return candidate


def backfill_unambiguous_links(db):
    """Only add references; never turn drafts into actual pickup."""
    changes = []
    for ba in db.query(models.BeritaAcara).filter(models.BeritaAcara.no_do.is_(None)).all():
        contract = ba.kontrak
        if not contract or str(contract.tipe_alur or "STANDAR").upper() != "STANDAR":
            continue
        explicit = db.query(models.DeliveryOrder).filter_by(no_ba=ba.no_ba).all()
        candidates = explicit or (db.query(models.DeliveryOrder).join(models.Invoice)
                                 .filter(models.Invoice.no_kontrak == ba.no_kontrak).all())
        if len(candidates) != 1:
            continue
        do = candidates[0]
        # Matching full volume is required for historical inferred links.
        if not explicit and abs(float(do.volume_do or 0) - float(ba.volume_ba or 0)) > 1e-6:
            continue
        if linked_pickup_bas(db, do.no_do, ba.no_ba):
            continue
        ba.no_do = do.no_do
        changes.append(ba.no_ba)
    return changes


def reconcile_orphan_invoice_status(db):
    """Clear stale invoice markers, not pickup confirmation or Draft status."""
    changes = []
    for ba in db.query(models.BeritaAcara).filter_by(status="Ter-invoice").all():
        invoice = db.query(models.Invoice).filter(
            (models.Invoice.no_ba == ba.no_ba) | (models.Invoice.no_kontrak == ba.no_ba)
        ).first()
        if invoice is None:
            ba.status = "Selesai"
            changes.append(ba.no_ba)
    return changes
