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

    return DeklarasiPayload(
        no_do=no_do,
        no_invoice=row.get("No_Invoice") or "",
        no_kontrak=no_kontrak,
        no_ba=row.get("No_BA") or "",
        ba_au58=no_do,
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