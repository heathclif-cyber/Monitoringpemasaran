"""Canonical sales events. Cash dates never replace pickup dates."""
from collections import defaultdict
from datetime import date

import models
from services.ba_utils import ba_effective_harga, calculate_ba_pokok
from services.pembayaran_utils import pembayaran_paid_total, payment_balance, effective_pelunasan

COMPLETED = {"Selesai", "Ter-invoice"}
MONTHS = ["", "Januari", "Februari", "Maret", "April", "Mei", "Juni", "Juli", "Agustus", "September", "Oktober", "November", "Desember"]


def duplicate_ba_refs(bas):
    groups = defaultdict(list)
    for ba in bas:
        if ba.status in COMPLETED:
            groups[(ba.no_kontrak, ba.tanggal_ba, ba.nama_unit, float(ba.volume_ba or 0),
                    round(float(ba.harga_satuan or 0), 6))].append(ba.no_ba)
    return {ref: refs for refs in groups.values() if len(refs) > 1 for ref in refs}


def set_period(row, event_date, kind, key):
    raw = event_date.isoformat() if event_date else ""
    row.update(Row_ID=key, Row_Type=kind, Report_Date=raw, Raw_Date=raw,
               Raw_Bulan_Buku=raw, Bulan_Buku=f"{event_date.month:02d}-{MONTHS[event_date.month]}" if event_date else "")
    return row


def normalize_sales_rows(db, legacy_rows, build_row):
    """Keep existing metadata fields; replace amounts/periods with source facts.

    BA is one sales event, DO without completed BA is explicitly provisional.
    A payment is attached once on the same event date, otherwise a cash-only
    event makes every cash receipt visible, including receipts without a DO.
    """
    bas = db.query(models.BeritaAcara).all()
    invoices = db.query(models.Invoice).all()
    dos = db.query(models.DeliveryOrder).all()
    contracts = {k.no_kontrak: k for k in db.query(models.Kontrak).all()}
    inv_by_no = {i.no_invoice: i for i in invoices}
    do_by_no = {d.no_do: d for d in dos}
    completed = [b for b in bas if b.status in COMPLETED and float(b.volume_ba or 0) > 0]
    duplicates = duplicate_ba_refs(bas)
    invoice_bas, do_bas = defaultdict(list), defaultdict(list)
    ba_context = {}
    for ba in completed:
        inv = next((i for i in invoices if i.no_ba == ba.no_ba), None)
        do = do_by_no.get(ba.no_do) if ba.no_do else next((d for d in dos if d.no_ba == ba.no_ba), None)
        if not inv and do:
            inv = inv_by_no.get(do.no_invoice)
        if not inv:
            inv = next((i for i in invoices if i.no_kontrak == ba.no_ba), None)
        ba_context[ba.no_ba] = (inv, do)
        if inv:
            invoice_bas[inv.no_invoice].append(ba)
            # Payung BA may be inherited by several partial DOs, one event only.
            for candidate in inv.delivery_orders:
                if candidate.no_ba == ba.no_ba:
                    do_bas[candidate.no_do].append(ba)
        if do:
            do_bas[do.no_do].append(ba)

    def clean(row):
        row = dict(row)
        row["Volume_DO_Dokumen"] = float(row.get("Jumlah_DO") or 0)
        row.update(Jumlah_Transfer=0, Pelunasan=0, Tanggal_Transfer="", No_Pembayaran="",
                   Pendapatan_Pokok=0, Pendapatan_Setelah_PPN=0, DPP_Pokok=0,
                   Pajak_PPN=0, PPh_Nominal=0, Jumlah_DO=0, Volume_Pengambilan=None,
                   No_BA="", Tanggal_BA="", Reporting_Warnings=[])
        return row

    def balance(row, inv):
        if not inv:
            row.update(Sisa_Pembayaran=0, Kewajiban_Pembayaran=0, Outstanding_Pengambilan=0,
                       Volume_DO_Invoice=0, Volume_Pengambilan_Invoice=0)
            return
        issued = sum(float(d.volume_do or 0) for d in inv.delivery_orders)
        picked = sum(float(b.volume_ba or 0) for b in invoice_bas[inv.no_invoice])
        paid = pembayaran_paid_total(inv.pembayaran, inv.kontrak)
        shortfall, surplus = payment_balance(paid, inv.jumlah_pembayaran)
        row.update(Sisa_Pembayaran=round(shortfall), Kewajiban_Pembayaran=float(inv.jumlah_pembayaran or 0),
                   Outstanding_Pengambilan=max(0, issued - picked), Volume_DO_Invoice=issued,
                   Volume_Pengambilan_Invoice=picked, Kelebihan_Pembayaran=round(surplus))
        if issued > 0 and picked > issued + 0.5:
            row["Reporting_Warnings"].append("Volume BA melebihi DO terbit; periksa alur payung/tautan")

    def sales_value(row, contract, volume, harga=None):
        pokok = round(calculate_ba_pokok(contract, volume, harga))
        ppn = float(contract.ppn_persen or 0) if str(contract.is_ppn).lower() == "true" else 0
        pph = float(contract.pph_persen or 0) if str(contract.is_pph).lower() == "true" else 0
        row.update(Pendapatan_Pokok=pokok, DPP_Pokok=pokok, Pajak_PPN=round(pokok * ppn / 100),
                   Pendapatan_Setelah_PPN=pokok + round(pokok * ppn / 100),
                   PPh_Nominal=round(pokok * pph / 100), PPN_Persen=ppn, PPh_Persen=pph,
                   Jumlah_DO=volume)

    output = []
    for ba in completed:
        k = contracts.get(ba.no_kontrak)
        if not k:
            continue
        inv, do = ba_context[ba.no_ba]
        row = clean(build_row(k, inv, do))
        row.update(No_Kontrak=k.no_kontrak, No_BA=ba.no_ba, Tanggal_BA=ba.tanggal_ba.isoformat(),
                   Unit=ba.nama_unit or row["Unit"], Komoditi=ba.komoditi or k.komoditi or "",
                   Deskripsi_Produk=ba.deskripsi or row["Deskripsi_Produk"],
                   Harga_Satuan=ba_effective_harga(ba, k), Volume_Pengambilan=float(ba.volume_ba or 0),
                   Rencana_Pengambilan=ba.tanggal_ba.isoformat())
        if not inv:
            row.update(Volume_Invoice=0, Jumlah_Invoice=0, No_Invoice="", No_DO="")
        sales_value(row, k, float(ba.volume_ba or 0), ba_effective_harga(ba, k))
        balance(row, inv)
        if ba.no_ba in duplicates:
            row["Reporting_Warnings"].append("BA berpotensi ganda: " + ", ".join(duplicates[ba.no_ba]))
        if inv and inv.no_kontrak != k.no_kontrak:
            row["Reporting_Warnings"].append("Referensi kontrak lama berbeda dari kontrak BA; perlu rekonsiliasi")
        output.append(set_period(row, ba.tanggal_ba, "REALISASI", "BA:" + ba.no_ba))

    for original in legacy_rows:
        if str(original.get("No_DO") or "").startswith("BYPASS-"):
            row = dict(original)
            row["Reporting_Warnings"] = []
            row["Volume_Pengambilan"] = float(row.get("Jumlah_DO") or 0)
            output.append(set_period(row, date.fromisoformat(row["Raw_Date"]), "BYPASS", row["No_DO"]))
            continue
        inv = inv_by_no.get(original["No_Invoice"])
        do = do_by_no.get(original["No_DO"])
        k = contracts.get(original["No_Kontrak"])
        if not k or (do and do_bas[do.no_do]) or (not do and inv and invoice_bas[inv.no_invoice]):
            continue
        # Legacy alias contracts whose BA already owns the sales event.
        if k.no_kontrak in ba_context:
            continue
        row = clean(original)
        balance(row, inv)
        if do:
            sales_value(row, k, float(do.volume_do or 0))
            row["Rencana_Pengambilan"] = do.rencana_pengambilan.isoformat() if do.rencana_pengambilan else ""
            if not do.rencana_pengambilan:
                row["Reporting_Warnings"].append("Belum ada BA atau rencana pengambilan; periode penjualan belum tersedia")
            output.append(set_period(row, do.rencana_pengambilan, "RENCANA", "DO:" + do.no_do))
        else:
            row["Rencana_Pengambilan"] = ""
            event_date = inv.tanggal_transaksi if inv else k.tanggal_kontrak
            output.append(set_period(row, event_date, "INVOICE" if inv else "KONTRAK",
                                     "INV:" + inv.no_invoice if inv else "K:" + k.no_kontrak))

    # Cash facts are independent of DO existence and of sales realization.
    for inv in invoices:
        k = inv.kontrak
        if not k:
            continue
        for pay in inv.pembayaran:
            raw = pay.tanggal_pembayaran.isoformat()
            row = next((r for r in output if r["No_Invoice"] == inv.no_invoice
                        and r["Report_Date"] == raw and r["Row_Type"] != "PEMBAYARAN"), None)
            if row is None:
                row = clean(build_row(k, inv, None))
                balance(row, inv)
                row["Rencana_Pengambilan"] = ""
                output.append(set_period(row, pay.tanggal_pembayaran, "PEMBAYARAN", "PAY:" + pay.no_pembayaran))
            row["Jumlah_Transfer"] += float(pay.nominal_transfer or 0)
            row["Pelunasan"] += effective_pelunasan(pay.nominal_transfer, pay.is_pph_disetor, k)
            row["Tanggal_Transfer"] = pay.tanggal_pembayaran.strftime("%d/%m/%Y")
            row["No_Pembayaran"] = pay.no_pembayaran
            row["PPh_Setor"] = pay.is_pph_disetor or "false"
    return sorted(output, key=lambda r: (r["Report_Date"], r["Row_ID"]))
