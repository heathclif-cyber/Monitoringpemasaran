from __future__ import annotations

from dataclasses import dataclass, asdict
from typing import Any

from database import SessionLocal
from api.r_laporan import _build_laporan_rows
from services.superman.komoditi_map import (
    CF_PENDAPATAN_ID,
    CF_PPH_ID,
    CF_PPN_ID,
    GL_PPH,
    GL_PPN,
    KPP_RECIPIENT_NAME,
    PROFIT_CENTER_SEARCH,
    SAP_CUSTOMER,
    resolve_gl_pendapatan,
)


def _to_superman_date(raw: str) -> str:
    if not raw:
        return ""
    parts = raw.split("-")
    if len(parts) == 3 and len(parts[0]) == 4:
        y, m, d = parts
        return f"{d}-{m}-{y}"
    return raw


def _fmt_volume(value: float) -> str:
    if abs(value - round(value)) < 0.001:
        return f"{int(round(value)):,}".replace(",", ".")
    text = f"{value:,.3f}".replace(",", "X").replace(".", ",").replace("X", ".")
    return text


def _month_name(bulan_buku: str, raw_date: str) -> str:
    if bulan_buku and "-" in bulan_buku:
        return bulan_buku.split("-", 1)[1]
    if raw_date:
        try:
            month_idx = int(raw_date.split("-")[1])
            names = [
                "",
                "Januari",
                "Februari",
                "Maret",
                "April",
                "Mei",
                "Juni",
                "Juli",
                "Agustus",
                "September",
                "Oktober",
                "November",
                "Desember",
            ]
            if 1 <= month_idx <= 12:
                return names[month_idx]
        except (ValueError, IndexError):
            pass
    return bulan_buku or ""


def _format_periode(_komoditi: str, bulan_buku: str, raw_date: str) -> str:
    month = _month_name(bulan_buku, raw_date)
    year = raw_date[:4] if raw_date and len(raw_date) >= 4 else ""
    if month and year:
        return f"{month} {year}"
    if month:
        return f"bulan {month}"
    return ""


def _build_uraian_pokok(
    *,
    komoditi: str,
    produk: str,
    volume: float,
    satuan: str,
    pembeli: str,
    periode: str,
    no_kontrak: str,
) -> str:
    vol = _fmt_volume(volume)
    label = (produk or komoditi or "Komoditi").strip()
    base = (
        f"Penerimaan Pembayaran Penjualan {label} sebanyak {vol} {satuan} "
        f"oleh {pembeli}"
    )
    if periode:
        return f"{base} {periode}".strip()
    if no_kontrak:
        return f"{base} {no_kontrak}".strip()
    return base


@dataclass
class LineItem:
    gl_code: str
    sap_customer: str
    profit_center_search: str
    cash_flow: str
    uraian: str
    nominal: int


@dataclass
class SppbLineItem:
    gl_code: str
    profit_center_search: str
    cash_flow: str
    uraian: str
    nominal: int


@dataclass
class DeklarasiPayload:
    no_do: str
    no_pembayaran: str
    no_invoice: str
    no_kontrak: str
    no_ba: str
    ba_au58: str
    mitra_pembeli: str
    tanggal_transfer: str
    dpp_pokok: int
    pajak_ppn: int
    pph_nominal: int
    pph_persen: float
    jumlah_transfer: int
    volume_do: float
    satuan: str
    komoditi: str
    deskripsi_produk: str
    bulan_buku: str
    uraian_pokok: str
    uraian_ppn: str
    uraian_pph: str
    referensi: str
    kontrak_sap: str
    so_sap: str
    do_sap: str
    billing_sap: str
    gl_pendapatan: str
    gl_ppn: str
    gl_pph: str
    jenis_form: str
    kpp_recipient: str
    line_items: list[LineItem]
    sppb_item: SppbLineItem | None = None

    def to_dict(self) -> dict[str, Any]:
        data = asdict(self)
        data["line_items"] = [asdict(li) for li in self.line_items]
        if self.sppb_item:
            data["sppb_item"] = asdict(self.sppb_item)
        return data


def build_payload_from_do(no_do: str) -> DeklarasiPayload:
    db = SessionLocal()
    try:
        rows = _build_laporan_rows(db)
    finally:
        db.close()

    row = next((r for r in rows if r.get("No_DO") == no_do), None)
    if not row:
        raise ValueError(f"DO tidak ditemukan di laporan: {no_do}")

    produk = row.get("Deskripsi_Produk") or row.get("Komoditi") or "Komoditi"
    volume = float(row.get("Jumlah_DO") or 0)
    satuan = row.get("Satuan") or "Kg"
    pembeli = row.get("Mitra_Pembeli") or ""
    bulan = row.get("Bulan_Buku") or ""
    raw_date = row.get("Raw_Date") or ""
    no_kontrak = row.get("No_Kontrak") or ""
    komoditi = row.get("Komoditi") or ""

    periode = _format_periode(komoditi, bulan, raw_date)
    uraian_pokok = _build_uraian_pokok(
        komoditi=komoditi,
        produk=produk,
        volume=volume,
        satuan=satuan,
        pembeli=pembeli,
        periode=periode,
        no_kontrak=no_kontrak,
    )
    uraian_ppn = f"PPN 11% atas Kontrak {no_kontrak}".strip()

    dpp = int(round(float(row.get("DPP_Pokok") or row.get("Pendapatan_Pokok") or 0)))
    ppn = int(round(float(row.get("Pajak_PPN") or 0)))
    pph = int(round(float(row.get("PPh_Nominal") or 0)))
    pph_persen = 0.0
    if dpp > 0 and pph > 0:
        pph_persen = round(pph / dpp * 100, 4)
    uraian_pph = f"PPh atas kontrak {no_kontrak}".strip()
    jenis_form = "sppb_sppn" if pph > 0 else "sppn"
    gl_pendapatan = resolve_gl_pendapatan(komoditi, produk)
    sppb_item = None
    if pph > 0:
        sppb_item = SppbLineItem(
            gl_code=GL_PPH,
            profit_center_search=PROFIT_CENTER_SEARCH,
            cash_flow=CF_PPH_ID,
            uraian=uraian_pph,
            nominal=pph,
        )

    line_items: list[LineItem] = []
    if dpp > 0:
        line_items.append(
            LineItem(
                gl_code=gl_pendapatan,
                sap_customer=SAP_CUSTOMER,
                profit_center_search=PROFIT_CENTER_SEARCH,
                cash_flow=CF_PENDAPATAN_ID,
                uraian=uraian_pokok,
                nominal=dpp,
            )
        )
    if ppn > 0:
        line_items.append(
            LineItem(
                gl_code=GL_PPN,
                sap_customer=SAP_CUSTOMER,
                profit_center_search=PROFIT_CENTER_SEARCH,
                cash_flow=CF_PPN_ID,
                uraian=uraian_ppn,
                nominal=ppn,
            )
        )

    no_pay = row.get("No_Pembayaran") or no_do
    return DeklarasiPayload(
        no_do=no_do,
        no_pembayaran=no_pay,
        no_invoice=row.get("No_Invoice") or "",
        no_kontrak=no_kontrak,
        no_ba=row.get("No_BA") or "",
        ba_au58=no_pay,
        mitra_pembeli=pembeli,
        tanggal_transfer=_to_superman_date(raw_date),
        dpp_pokok=dpp,
        pajak_ppn=ppn,
        pph_nominal=pph,
        pph_persen=pph_persen,
        jumlah_transfer=int(round(float(row.get("Jumlah_Transfer") or 0))),
        volume_do=volume,
        satuan=satuan,
        komoditi=komoditi,
        deskripsi_produk=produk,
        bulan_buku=bulan,
        uraian_pokok=uraian_pokok,
        uraian_ppn=uraian_ppn,
        uraian_pph=uraian_pph,
        referensi="-",
        kontrak_sap=row.get("Kontrak_SAP") or "",
        so_sap=row.get("SO_SAP") or "",
        do_sap=row.get("DO_SAP") or "",
        billing_sap=row.get("Billing") or "",
        gl_pendapatan=gl_pendapatan,
        gl_ppn=GL_PPN,
        gl_pph=GL_PPH,
        jenis_form=jenis_form,
        kpp_recipient=KPP_RECIPIENT_NAME,
        line_items=line_items,
        sppb_item=sppb_item,
    )


def build_payload_from_pembayaran(no_pembayaran: str) -> DeklarasiPayload:
    from sqlalchemy.orm import joinedload

    import models
    from services.ba_utils import is_payung_ba

    db = SessionLocal()
    try:
        pay = (
            db.query(models.Pembayaran)
            .options(
                joinedload(models.Pembayaran.delivery_order),
                joinedload(models.Pembayaran.invoice).joinedload(models.Invoice.kontrak).joinedload(models.Kontrak.units),
                joinedload(models.Pembayaran.invoice).joinedload(models.Invoice.berita_acara),
            )
            .filter(models.Pembayaran.no_pembayaran == no_pembayaran.strip())
            .first()
        )
        if not pay:
            raise ValueError(f"Pembayaran tidak ditemukan: {no_pembayaran}")

        invoice = pay.invoice
        if not invoice:
            raise ValueError(f"Invoice tidak ditemukan untuk pembayaran: {no_pembayaran}")
        kontrak = invoice.kontrak
        if not kontrak:
            raise ValueError(f"Kontrak tidak ditemukan untuk pembayaran: {no_pembayaran}")

        nominal = float(pay.nominal_transfer or 0)
        inv_gross = float(invoice.jumlah_pembayaran or 0)
        pay_ratio = (nominal / inv_gross) if inv_gross > 0 else 1.0

        kontrak_volume = float(kontrak.volume or 0)
        volume_for_calc = kontrak_volume
        if is_payung_ba(kontrak):
            ba = invoice.berita_acara
            if ba:
                volume_for_calc = float(ba.volume_ba or 0)
        elif invoice.nama_unit and kontrak.units:
            unit = next((u for u in kontrak.units if u.nama_unit == invoice.nama_unit), None)
            if unit and (unit.volume or 0) > 0:
                volume_for_calc = float(unit.volume)

        harga = float(kontrak.harga_satuan or 0)
        premi = float(kontrak.premi or 0)
        is_ppn = str(getattr(kontrak, "is_ppn", "true")).lower() == "true"
        ppn_rate = float(getattr(kontrak, "ppn_persen", 0) or 0) / 100
        is_pph = str(getattr(kontrak, "is_pph", "false")).lower() == "true"
        pph_rate = float(getattr(kontrak, "pph_persen", 0) or 0) / 100

        pokok_full = (kontrak_volume * harga) + premi
        ppn_full = pokok_full * ppn_rate if is_ppn else 0.0
        nilai_unit_penuh = inv_gross if inv_gross > 0 else (pokok_full + ppn_full)

        if nilai_unit_penuh > 0 and volume_for_calc > 0 and nominal > 0:
            volume_do = (nominal / nilai_unit_penuh) * volume_for_calc
        else:
            volume_do = volume_for_calc * pay_ratio

        if inv_gross > 0:
            if is_ppn and ppn_rate > 0:
                pokok_inv = inv_gross / (1 + ppn_rate)
                ppn_inv = inv_gross - pokok_inv
            else:
                pokok_inv = inv_gross
                ppn_inv = 0.0
            pph_inv = pokok_inv * pph_rate if is_pph else 0.0
            pokok_pay = pokok_inv * pay_ratio
            ppn_pay = ppn_inv * pay_ratio
            pph_pay = pph_inv * pay_ratio
        else:
            pokok_pay = pokok_full * pay_ratio
            ppn_pay = ppn_full * pay_ratio
            pph_pay = pokok_pay * pph_rate if is_pph else 0.0

        dpp = int(round(pokok_pay))
        ppn = int(round(ppn_pay))
        pph = int(round(pph_pay))

        produk = (
            (invoice.nama_unit and kontrak.units
             and next((u.jenis_komoditi or u.komoditi for u in kontrak.units if u.nama_unit == invoice.nama_unit), None))
            or kontrak.jenis_komoditi
            or kontrak.deskripsi_produk
            or kontrak.komoditi
            or "Komoditi"
        )
        komoditi = kontrak.komoditi or ""
        satuan = kontrak.satuan or "Kg"
        pembeli = kontrak.pembeli or ""
        no_kontrak = kontrak.no_kontrak or ""
        ba_ref = invoice.berita_acara
        ba_date = ba_ref.tanggal_ba if ba_ref else None
        ba_buku = ba_ref.bulan_buku if ba_ref else None
        raw_date = pay.tanggal_pembayaran.isoformat() if pay.tanggal_pembayaran else ""
        bulan = ""
        if ba_buku:
            bulan = _month_name("", ba_buku.isoformat())
        elif raw_date:
            bulan = _month_name("", raw_date)

        periode = _format_periode(komoditi, bulan, raw_date)
        uraian_pokok = _build_uraian_pokok(
            komoditi=komoditi,
            produk=produk,
            volume=volume_do,
            satuan=satuan,
            pembeli=pembeli.split("\n")[0] if pembeli else "",
            periode=periode,
            no_kontrak=no_kontrak,
        )
        uraian_ppn = f"PPN 11% atas Kontrak {no_kontrak}".strip()
        uraian_pph = f"PPh atas kontrak {no_kontrak}".strip()
        pph_persen = round(pph / dpp * 100, 4) if dpp > 0 and pph > 0 else 0.0
        jenis_form = "sppb_sppn" if pph > 0 else "sppn"
        gl_pendapatan = resolve_gl_pendapatan(komoditi, produk)

        sppb_item = None
        if pph > 0:
            sppb_item = SppbLineItem(
                gl_code=GL_PPH,
                profit_center_search=PROFIT_CENTER_SEARCH,
                cash_flow=CF_PPH_ID,
                uraian=uraian_pph,
                nominal=pph,
            )

        line_items: list[LineItem] = []
        if dpp > 0:
            line_items.append(
                LineItem(
                    gl_code=gl_pendapatan,
                    sap_customer=SAP_CUSTOMER,
                    profit_center_search=PROFIT_CENTER_SEARCH,
                    cash_flow=CF_PENDAPATAN_ID,
                    uraian=uraian_pokok,
                    nominal=dpp,
                )
            )
        if ppn > 0:
            line_items.append(
                LineItem(
                    gl_code=GL_PPN,
                    sap_customer=SAP_CUSTOMER,
                    profit_center_search=PROFIT_CENTER_SEARCH,
                    cash_flow=CF_PPN_ID,
                    uraian=uraian_ppn,
                    nominal=ppn,
                )
            )

        linked_do = pay.delivery_order
        inv_superman_ref = invoice.no_invoice
        return DeklarasiPayload(
            no_do=linked_do.no_do if linked_do else "",
            no_pembayaran=no_pembayaran,
            no_invoice=invoice.no_invoice,
            no_kontrak=no_kontrak,
            no_ba=(ba_ref.no_ba if ba_ref else "") or (invoice.no_ba or ""),
            ba_au58=inv_superman_ref,
            mitra_pembeli=pembeli.split("\n")[0] if pembeli else "",
            tanggal_transfer=_to_superman_date(raw_date),
            dpp_pokok=dpp,
            pajak_ppn=ppn,
            pph_nominal=pph,
            pph_persen=pph_persen,
            jumlah_transfer=int(round(nominal)),
            volume_do=volume_do,
            satuan=satuan,
            komoditi=komoditi,
            deskripsi_produk=produk,
            bulan_buku=bulan,
            uraian_pokok=uraian_pokok,
            uraian_ppn=uraian_ppn,
            uraian_pph=uraian_pph,
            referensi=inv_superman_ref,
            kontrak_sap=linked_do.kontrak_sap if linked_do else "",
            so_sap=linked_do.so_sap if linked_do else "",
            do_sap=linked_do.do_sap if linked_do else "",
            billing_sap=linked_do.billing_sap if linked_do else "",
            gl_pendapatan=gl_pendapatan,
            gl_ppn=GL_PPN,
            gl_pph=GL_PPH,
            jenis_form=jenis_form,
            kpp_recipient=KPP_RECIPIENT_NAME,
            line_items=line_items,
            sppb_item=sppb_item,
        )
    finally:
        db.close()


def build_payload_from_invoice(no_invoice: str) -> DeklarasiPayload:
    from sqlalchemy.orm import joinedload

    import models
    from services.ba_utils import is_payung_ba

    db = SessionLocal()
    try:
        invoice = (
            db.query(models.Invoice)
            .options(
                joinedload(models.Invoice.kontrak).joinedload(models.Kontrak.units),
                joinedload(models.Invoice.berita_acara),
                joinedload(models.Invoice.pembayaran),
            )
            .filter(models.Invoice.no_invoice == no_invoice.strip())
            .first()
        )
        if not invoice:
            raise ValueError(f"Invoice tidak ditemukan: {no_invoice}")

        kontrak = invoice.kontrak
        if not kontrak:
            raise ValueError(f"Kontrak tidak ditemukan untuk invoice: {no_invoice}")

        inv_gross = float(invoice.jumlah_pembayaran or 0)
        if inv_gross <= 0:
            raise ValueError(f"Jumlah pembayaran invoice {no_invoice} belum valid")

        pay_rows = sorted(
            invoice.pembayaran or [],
            key=lambda p: (p.tanggal_pembayaran or "", p.no_pembayaran or ""),
        )
        pay_total = sum(float(p.nominal_transfer or 0) for p in pay_rows)
        if pay_total + 0.5 < inv_gross:
            raise ValueError(
                f"Invoice {no_invoice} belum lunas. "
                f"Total pembayaran: Rp {pay_total:,.0f}, kewajiban: Rp {inv_gross:,.0f}"
            )

        latest_pay = pay_rows[-1] if pay_rows else None
        nominal = inv_gross
        pay_ratio = 1.0

        kontrak_volume = float(kontrak.volume or 0)
        volume_for_calc = kontrak_volume
        if is_payung_ba(kontrak):
            ba = invoice.berita_acara
            if ba:
                volume_for_calc = float(ba.volume_ba or 0)
        elif invoice.nama_unit and kontrak.units:
            unit = next((u for u in kontrak.units if u.nama_unit == invoice.nama_unit), None)
            if unit and (unit.volume or 0) > 0:
                volume_for_calc = float(unit.volume)

        harga = float(kontrak.harga_satuan or 0)
        premi = float(kontrak.premi or 0)
        is_ppn = str(getattr(kontrak, "is_ppn", "true")).lower() == "true"
        ppn_rate = float(getattr(kontrak, "ppn_persen", 0) or 0) / 100
        is_pph = str(getattr(kontrak, "is_pph", "false")).lower() == "true"
        pph_rate = float(getattr(kontrak, "pph_persen", 0) or 0) / 100

        pokok_full = (kontrak_volume * harga) + premi
        ppn_full = pokok_full * ppn_rate if is_ppn else 0.0
        nilai_unit_penuh = inv_gross if inv_gross > 0 else (pokok_full + ppn_full)

        if nilai_unit_penuh > 0 and volume_for_calc > 0:
            volume_do = volume_for_calc
        else:
            volume_do = volume_for_calc * pay_ratio

        if is_ppn and ppn_rate > 0:
            pokok_inv = inv_gross / (1 + ppn_rate)
            ppn_inv = inv_gross - pokok_inv
        else:
            pokok_inv = inv_gross
            ppn_inv = 0.0
        pph_inv = pokok_inv * pph_rate if is_pph else 0.0
        pokok_pay = pokok_inv
        ppn_pay = ppn_inv
        pph_pay = pph_inv

        dpp = int(round(pokok_pay))
        ppn = int(round(ppn_pay))
        pph = int(round(pph_pay))

        produk = (
            (invoice.nama_unit and kontrak.units
             and next((u.jenis_komoditi or u.komoditi for u in kontrak.units if u.nama_unit == invoice.nama_unit), None))
            or kontrak.jenis_komoditi
            or kontrak.deskripsi_produk
            or kontrak.komoditi
            or "Komoditi"
        )
        komoditi = kontrak.komoditi or ""
        satuan = kontrak.satuan or "Kg"
        pembeli = kontrak.pembeli or ""
        no_kontrak = kontrak.no_kontrak or ""
        ba_ref = invoice.berita_acara
        ba_buku = ba_ref.bulan_buku if ba_ref else None
        raw_date = ""
        if latest_pay and latest_pay.tanggal_pembayaran:
            raw_date = latest_pay.tanggal_pembayaran.isoformat()
        elif invoice.tanggal_transaksi:
            raw_date = invoice.tanggal_transaksi.isoformat()

        bulan = ""
        if ba_buku:
            bulan = _month_name("", ba_buku.isoformat())
        elif raw_date:
            bulan = _month_name("", raw_date)

        periode = _format_periode(komoditi, bulan, raw_date)
        uraian_pokok = _build_uraian_pokok(
            komoditi=komoditi,
            produk=produk,
            volume=volume_do,
            satuan=satuan,
            pembeli=pembeli.split("\n")[0] if pembeli else "",
            periode=periode,
            no_kontrak=no_kontrak,
        )
        uraian_ppn = f"PPN 11% atas Kontrak {no_kontrak}".strip()
        uraian_pph = f"PPh atas kontrak {no_kontrak}".strip()
        pph_persen = round(pph / dpp * 100, 4) if dpp > 0 and pph > 0 else 0.0
        jenis_form = "sppb_sppn" if pph > 0 else "sppn"
        gl_pendapatan = resolve_gl_pendapatan(komoditi, produk)

        sppb_item = None
        if pph > 0:
            sppb_item = SppbLineItem(
                gl_code=GL_PPH,
                profit_center_search=PROFIT_CENTER_SEARCH,
                cash_flow=CF_PPH_ID,
                uraian=uraian_pph,
                nominal=pph,
            )

        line_items: list[LineItem] = []
        if dpp > 0:
            line_items.append(
                LineItem(
                    gl_code=gl_pendapatan,
                    sap_customer=SAP_CUSTOMER,
                    profit_center_search=PROFIT_CENTER_SEARCH,
                    cash_flow=CF_PENDAPATAN_ID,
                    uraian=uraian_pokok,
                    nominal=dpp,
                )
            )
        if ppn > 0:
            line_items.append(
                LineItem(
                    gl_code=GL_PPN,
                    sap_customer=SAP_CUSTOMER,
                    profit_center_search=PROFIT_CENTER_SEARCH,
                    cash_flow=CF_PPN_ID,
                    uraian=uraian_ppn,
                    nominal=ppn,
                )
            )

        no_inv = invoice.no_invoice
        return DeklarasiPayload(
            no_do="",
            no_pembayaran=pay_rows[-1].no_pembayaran if pay_rows else "",
            no_invoice=no_inv,
            no_kontrak=no_kontrak,
            no_ba=(ba_ref.no_ba if ba_ref else "") or (invoice.no_ba or ""),
            ba_au58=no_inv,
            mitra_pembeli=pembeli.split("\n")[0] if pembeli else "",
            tanggal_transfer=_to_superman_date(raw_date),
            dpp_pokok=dpp,
            pajak_ppn=ppn,
            pph_nominal=pph,
            pph_persen=pph_persen,
            jumlah_transfer=int(round(nominal)),
            volume_do=volume_do,
            satuan=satuan,
            komoditi=komoditi,
            deskripsi_produk=produk,
            bulan_buku=bulan,
            uraian_pokok=uraian_pokok,
            uraian_ppn=uraian_ppn,
            uraian_pph=uraian_pph,
            referensi=no_inv,
            kontrak_sap="",
            so_sap="",
            do_sap="",
            billing_sap="",
            gl_pendapatan=gl_pendapatan,
            gl_ppn=GL_PPN,
            gl_pph=GL_PPH,
            jenis_form=jenis_form,
            kpp_recipient=KPP_RECIPIENT_NAME,
            line_items=line_items,
            sppb_item=sppb_item,
        )
    finally:
        db.close()