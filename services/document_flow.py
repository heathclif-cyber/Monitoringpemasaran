"""Read-only document graph using explicit links, including BA-first umbrella sales."""
import models
from services.sales_reporting import COMPLETED, duplicate_ba_refs
from services.pembayaran_utils import pembayaran_paid_total, payment_balance
from services.ba_utils import ba_effective_harga


def build_document_flow(db, contract):
    invoices = list(contract.invoices)
    bas = db.query(models.BeritaAcara).filter(
        (models.BeritaAcara.no_kontrak == contract.no_kontrak) |
        (models.BeritaAcara.no_ba == contract.no_kontrak)
    ).all()
    duplicates = duplicate_ba_refs(bas)
    payung = str(contract.tipe_alur or "STANDAR").upper() == "PAYUNG_BA"
    nodes, edges, warnings = [], [], []

    def node(kind, number, when, status, volume=0, amount=0, unit_price=None):
        key = kind + ":" + number
        nodes.append(dict(id=key, kind=kind, number=number, date=when.isoformat() if when else None,
                          status=status, volume=float(volume or 0), amount=float(amount or 0),
                          unit_price=float(unit_price) if unit_price is not None else None))
        return key

    def edge(source, target):
        if source and target and (source, target) not in {(e['source'], e['target']) for e in edges}:
            edges.append(dict(source=source, target=target))

    root = node("KONTRAK", contract.no_kontrak, contract.tanggal_kontrak, "Payung" if payung else "Normal", contract.volume, contract.nilai_transaksi,
                unit_price=None if payung else contract.harga_satuan)
    if not payung and float(contract.volume or 0) > 0 and sum(float(i.volume or 0) for i in invoices) > float(contract.volume or 0) + 0.5:
        warnings.append("Total volume invoice melebihi kontrak; periksa data lama")
    ba_keys = {}
    for ba in bas:
        ba_keys[ba.no_ba] = node("BA", ba.no_ba, ba.tanggal_ba, ba.status, ba.volume_ba,
                               unit_price=ba_effective_harga(ba, contract))
        if payung:
            edge(root, ba_keys[ba.no_ba])
        if ba.no_ba in duplicates:
            warnings.append("BA berpotensi ganda: " + ", ".join(duplicates[ba.no_ba]))
        if ba.no_kontrak != contract.no_kontrak:
            warnings.append("BA mengacu kontrak payung lain; kontrak ini referensi lama")

    for inv in invoices:
        shortfall, _ = payment_balance(pembayaran_paid_total(inv.pembayaran, contract), inv.jumlah_pembayaran)
        price = ba_effective_harga(inv.berita_acara, contract) if payung and inv.berita_acara else (None if payung else contract.harga_satuan)
        inv_key = node("INVOICE", inv.no_invoice, inv.tanggal_transaksi, "Kurang bayar" if shortfall else "Transfer cukup", inv.volume, inv.jumlah_pembayaran, unit_price=price)
        edge(ba_keys.get(inv.no_ba) if payung else root, inv_key)
        if payung and inv.no_ba not in ba_keys:
            edge(root, inv_key)
            warnings.append("Invoice payung belum memiliki referensi BA yang sesuai: " + inv.no_invoice)
        for pay in inv.pembayaran:
            pay_key = node("PEMBAYARAN", pay.no_pembayaran, pay.tanggal_pembayaran,
                           "PPh ditandai setor" if pay.is_pph_disetor == "true" else "Transfer tercatat", amount=pay.nominal_transfer)
            edge(inv_key, pay_key)
        for do in inv.delivery_orders:
            do_key = node("DO", do.no_do, do.tanggal_do, "Terbit", do.volume_do, unit_price=price)
            pay_key = "PEMBAYARAN:" + do.no_pembayaran if do.no_pembayaran else None
            edge(pay_key or inv_key, do_key)
            related = [b for b in bas if b.no_do == do.no_do or b.no_ba == do.no_ba]
            if not payung:
                for ba in related:
                    edge(do_key, ba_keys[ba.no_ba])
            if not any(b.status in COMPLETED for b in related):
                warnings.append("DO belum memiliki BA realisasi: " + do.no_do)
    # Show standalone/Draft BA without pretending they have a DO/invoice.
    targets = {e['target'] for e in edges}
    for ba in bas:
        if ba_keys[ba.no_ba] not in targets:
            edge(root, ba_keys[ba.no_ba])
            warnings.append("BA belum terhubung ke DO: " + ba.no_ba)
        if payung and ba.status in COMPLETED and not any(i.no_ba == ba.no_ba for i in invoices):
            warnings.append("BA realisasi menunggu invoice: " + ba.no_ba)
    return dict(mode="PAYUNG_BA" if payung else "STANDAR", nodes=nodes, edges=edges, warnings=sorted(set(warnings)))
