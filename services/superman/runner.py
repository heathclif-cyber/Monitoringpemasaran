"""Jalankan otomasi Superman — dipanggil dari API atau CLI."""

from __future__ import annotations

import json
import os
import re
import threading
from dataclasses import asdict
from pathlib import Path
from typing import Any

from services.superman.auth import (
    SupermanCaptchaError,
    SupermanCaptchaRequired,
    ensure_session,
    is_session_valid,
    open_authenticated_context,
)
from services.superman.captcha_challenge import (
    refresh_captcha_challenge,
    start_captcha_challenge,
    verify_captcha_challenge,
)
from services.superman.config import SupermanConfig
from services.superman.documents import (
    resolve_support_doc_from_do,
    resolve_support_doc_from_invoice,
    resolve_support_doc_from_pembayaran,
)
from services.superman.filler import fill_sppn_draft, submit_sppn_draft
from services.superman.payload import (
    build_payload_from_do,
    build_payload_from_invoice,
    build_payload_from_pembayaran,
)
from services.superman.preflight import validate_deklarasi_ready
from services.superman.persist import (
    assert_do_not_submitted,
    assert_invoice_not_submitted,
    assert_pembayaran_not_submitted,
    format_superman_ref,
    get_do_superman,
    get_invoice_superman,
    get_pembayaran_superman,
    save_superman_to_do,
    save_superman_to_invoice,
    save_superman_to_pembayaran,
)
from services.superman.progress import (
    ProgressCallback,
    complete_job,
    create_job,
    fail_job,
    find_active_job_for_invoice,
    find_latest_job_for_invoice,
    get_job,
    make_progress_callback,
    update_job,
)


class SupermanNotConfiguredError(RuntimeError):
    pass


class SupermanSessionError(RuntimeError):
    pass


def is_configured() -> bool:
    has_user = bool(os.getenv("SUPERMAN_USER", "").strip())
    has_password = bool(
        os.getenv("SUPERMAN_PASSWORD", "").strip() or os.getenv("SUPERMAN_PASSWORD_B64", "").strip()
    )
    return has_user and has_password


def _api_config() -> SupermanConfig:
    if not is_configured():
        raise SupermanNotConfiguredError(
            "Superman belum dikonfigurasi. Set SUPERMAN_USER dan SUPERMAN_PASSWORD di environment."
        )
    data = asdict(SupermanConfig.from_env())
    data["headless"] = True
    data["slow_mo_ms"] = 0
    return SupermanConfig(**data)


def get_status() -> dict[str, Any]:
    from services.superman.sync_executor import run_playwright_sync

    cfg = SupermanConfig.from_env()
    state = Path(cfg.state_path)
    session_valid = (
        run_playwright_sync(is_session_valid, cfg, state) if state.is_file() else False
    )
    using_b64 = bool(os.getenv("SUPERMAN_PASSWORD_B64", "").strip())
    return {
        "configured": is_configured(),
        "session_exists": state.is_file(),
        "session_valid": session_valid,
        "session_path": str(state),
        "base_url": cfg.base_url.rstrip("/"),
        "headless": cfg.headless,
        "credential_hint": {
            "username": cfg.username,
            "password_length": len(cfg.password),
            "password_from_b64": using_b64,
        },
        "captcha_hint": (
            None
            if session_valid
            else "Jika OCR gagal: jalankan `python scripts/superman_login.py --manual` lokal, "
            "lalu salin file session ke Railway (SUPERMAN_STATE_PATH + volume)."
        ),
    }


def resolve_no_invoice(
    *,
    no_invoice: str | None = None,
    no_pembayaran: str | None = None,
    no_do: str | None = None,
) -> str:
    if no_invoice and no_invoice.strip():
        return no_invoice.strip()
    if no_pembayaran and no_pembayaran.strip():
        import models
        from database import SessionLocal

        db = SessionLocal()
        try:
            pay = db.query(models.Pembayaran).filter(
                models.Pembayaran.no_pembayaran == no_pembayaran.strip()
            ).first()
            if pay and pay.no_invoice:
                return pay.no_invoice
        finally:
            db.close()
    if no_do and no_do.strip():
        import models
        from database import SessionLocal

        db = SessionLocal()
        try:
            do = db.query(models.DeliveryOrder).filter(
                models.DeliveryOrder.no_do == no_do.strip()
            ).first()
            if do and do.no_invoice:
                return do.no_invoice
        finally:
            db.close()
    raise ValueError("no_invoice wajib diisi")


def resolve_no_pembayaran(
    *,
    no_pembayaran: str | None = None,
    no_do: str | None = None,
) -> str:
    if no_pembayaran and no_pembayaran.strip():
        return no_pembayaran.strip()
    if no_do and no_do.strip():
        import models
        from database import SessionLocal

        db = SessionLocal()
        try:
            do = db.query(models.DeliveryOrder).filter(
                models.DeliveryOrder.no_do == no_do.strip()
            ).first()
            if do and do.no_pembayaran:
                return do.no_pembayaran
        finally:
            db.close()
        raise ValueError(
            f"DO {no_do} belum terhubung ke pembayaran. Buat pembayaran terlebih dahulu."
        )
    raise ValueError("no_pembayaran wajib diisi")


def preview_deklarasi(
    *,
    no_invoice: str | None = None,
    no_pembayaran: str | None = None,
    no_do: str | None = None,
) -> dict[str, Any]:
    ref = resolve_no_invoice(
        no_invoice=no_invoice,
        no_pembayaran=no_pembayaran,
        no_do=no_do,
    )
    payload = build_payload_from_invoice(ref)
    supports = resolve_support_doc_from_invoice(ref)
    data = payload.to_dict()
    data["support_docs"] = [
        {"path": str(doc.path), "source": doc.describe()} for doc in supports
    ]
    return data


def _normalize_match_text(value: Any) -> str:
    return str(value or "").strip().lower()


def _todo_row_blob(row: dict[str, Any]) -> str:
    return json.dumps(row, ensure_ascii=False).lower()


_TENDER_CODE_RE = re.compile(r"(?:add-)?tender[/-](\d{4})", re.I)
_PAY_TENDER_RE = re.compile(r"pay-(?:add-)?tender-(\d{4})", re.I)


def _append_todo_ref(refs: list[str], value: str) -> None:
    n = _normalize_match_text(value)
    if not n or n in refs:
        return
    refs.append(n)
    if n.startswith("add-"):
        short = n[4:]
        if short not in refs:
            refs.append(short)
    for pattern in (_TENDER_CODE_RE, _PAY_TENDER_RE):
        match = pattern.search(n)
        if not match:
            continue
        code = match.group(1)
        for frag in (code, f"tender/{code}", f"add-tender/{code}"):
            if frag not in refs:
                refs.append(frag)


def _collect_todo_match_refs(
    *,
    no_pembayaran: str = "",
    no_do: str = "",
    referensi: str = "",
    no_invoice: str = "",
    no_kontrak: str = "",
) -> list[str]:
    """Kandidat teks untuk cocokkan baris To Do — invoice/referensi diutamakan."""
    refs: list[str] = []
    for raw in (referensi, no_invoice, no_kontrak, no_pembayaran, no_do):
        _append_todo_ref(refs, raw)
    return refs


def _todo_row_id(row: dict[str, Any]) -> str:
    for key in ("sppn_id", "spp_id", "id"):
        val = row.get(key)
        if val is not None and str(val).strip():
            return str(val).strip()
    sppn = str(row.get("sppn_no") or "").strip()
    sppb = str(row.get("sppb_no") or "").strip()
    if sppn or sppb:
        return f"{sppn}|{sppb}"
    return json.dumps(row, sort_keys=True, ensure_ascii=False)


def _fetch_todo_rows(page, base_url: str) -> list[dict[str, Any]]:
    resp = page.request.get(f"{base_url.rstrip('/')}/sppd/getTodo")
    if not resp.ok:
        return []
    return [row for row in (resp.json().get("data") or []) if isinstance(row, dict)]


def _snapshot_todo_ids(page, base_url: str) -> set[str]:
    return {_todo_row_id(row) for row in _fetch_todo_rows(page, base_url)}


def _score_todo_row(
    row: dict[str, Any],
    *,
    no_do: str,
    no_pembayaran: str = "",
    no_invoice: str = "",
    referensi: str = "",
    no_kontrak: str,
    mitra_pembeli: str,
    total_sppn: int,
    expect_sppb: bool,
    pph_nominal: int = 0,
    tanggal_transfer: str = "",
) -> int:
    blob = _todo_row_blob(row)
    score = 0
    match_refs = _collect_todo_match_refs(
        no_pembayaran=no_pembayaran,
        no_do=no_do,
        referensi=referensi,
        no_invoice=no_invoice,
        no_kontrak=no_kontrak,
    )
    ref_n = match_refs[0] if match_refs else ""
    no_do_n = _normalize_match_text(no_do)
    no_kontrak_n = _normalize_match_text(no_kontrak)
    mitra_n = _normalize_match_text(mitra_pembeli)

    for idx, candidate in enumerate(match_refs):
        if candidate in blob:
            score += 1000 - min(idx * 15, 120)
            break
    if no_do_n and no_do_n in blob and no_do_n not in match_refs:
        score += 500

    for field in (
        "berita_acara",
        "au58",
        "au58_sppn",
        "au58_sppb",
        "no_ba",
        "ba_au58",
        "berita_acara_sppb",
        "berita_acara_sppn",
        "referensi",
        "referensi_sppn",
        "referensi_sppb",
        "sp_opl",
        "sp_opl_sppb",
        "sp_opl_sppn",
        "kwitansi",
        "kwitansi_sppn",
        "keterangan",
        "uraian",
        "sppn_uraian",
        "sppn_uraian2",
        "nomor",
        "nomor_spp",
        "no_spp",
    ):
        val = _normalize_match_text(row.get(field))
        matched_ref = False
        for idx, candidate in enumerate(match_refs):
            if val and (candidate == val or candidate in val or val in candidate):
                score += 800 - min(idx * 10, 80)
                matched_ref = True
                break
        if not matched_ref and no_do_n and val and (no_do_n == val or no_do_n in val or val in no_do_n):
            score += 400

    if no_kontrak_n and no_kontrak_n in blob:
        score += 100

    if mitra_n and mitra_n in blob:
        score += 20

    if row.get("sppn_no"):
        score += 5
    if expect_sppb:
        if row.get("sppb_no"):
            score += 5

    amount_matched = False
    sppn_amount_matched = False
    sppb_amount_matched = False
    for amount_field in ("sppn_jumlah", "total", "jumlah", "nominal"):
        raw = row.get(amount_field)
        if raw is None:
            continue
        try:
            amount = int(round(float(raw)))
        except (TypeError, ValueError):
            continue
        if total_sppn > 0 and abs(amount - total_sppn) <= 1:
            score += 30
            sppn_amount_matched = True
            amount_matched = True
            break
    if expect_sppb and pph_nominal > 0:
        for amount_field in ("sppb_total", "sppb_jumlah", "total_sppb"):
            raw = row.get(amount_field)
            if raw is None:
                continue
            try:
                amount = int(round(float(raw)))
            except (TypeError, ValueError):
                continue
            if abs(amount - pph_nominal) <= 1:
                score += 30
                sppb_amount_matched = True
                amount_matched = True
                break
    if sppn_amount_matched and sppb_amount_matched:
        score += 40

    def _norm_date_key(value: str) -> str:
        text = _normalize_match_text(value)
        if not text:
            return ""
        if len(text) >= 10 and text[4] == "-" and text[7] == "-":
            return text[:10]
        if len(text) >= 10 and text[2] == "-" and text[5] == "-":
            d, m, y = text.split("-", 2)
            return f"{y}-{m}-{d}"[:10]
        if "/" in text:
            parts = text.split("/")
            if len(parts) == 3 and len(parts[2]) == 4:
                return f"{parts[2]}-{parts[1].zfill(2)}-{parts[0].zfill(2)}"
        return text

    tanggal_matched = False
    tanggal_key = _norm_date_key(tanggal_transfer)
    for date_field in ("sppn_tanggal", "tanggal", "tanggal_sppn", "tanggal_sppb"):
        row_key = _norm_date_key(str(row.get(date_field) or ""))
        if tanggal_key and row_key and tanggal_key == row_key:
            score += 25
            tanggal_matched = True
            break

    if amount_matched and mitra_n and mitra_n in blob:
        score += 25

    # Jangan nol-kan match kuat (referensi/kontrak/nominal) hanya karena format tanggal beda.
    has_strong_ref = any(r in blob for r in match_refs)
    has_kontrak = bool(no_kontrak_n and no_kontrak_n in blob)
    if (
        tanggal_key
        and not tanggal_matched
        and score < 800
        and not has_strong_ref
        and not has_kontrak
        and not amount_matched
    ):
        return 0

    return score


_SPPN_NO_RE = re.compile(
    r"((?:R\d+/R\d+D/SPPn/|\d+(?:\.\d+)?/SPPn/)[^\s\"'<>]+)",
    re.I,
)
_SPPB_NO_RE = re.compile(
    r"((?:R\d+/R\d+D/SPPb/|\d+(?:\.\d+)?/SPP[BG]/)[^\s\"'<>]+)",
    re.I,
)


def _extract_numbers_from_blob(text: str) -> tuple[str | None, str | None]:
    if not text:
        return None, None
    sppb_m = _SPPB_NO_RE.search(text)
    sppn_m = _SPPN_NO_RE.search(text)
    return (
        sppb_m.group(1) if sppb_m else None,
        sppn_m.group(1) if sppn_m else None,
    )


def _extract_numbers_from_page(page) -> tuple[str | None, str | None]:
    try:
        url = page.url or ""
        body = page.content()
    except Exception:
        return None, None
    return _extract_numbers_from_blob(f"{url}\n{body}")


def _coalesce_spp_numbers(
    *,
    store_sppb: str | None,
    store_sppn: str | None,
    match: dict[str, Any] | None,
    store_body: Any,
) -> tuple[str | None, str | None]:
    sppb_no = store_sppb
    sppn_no = store_sppn

    if match:
        sppb_no = (
            match.get("sppb_no")
            or match.get("no_sppb")
            or match.get("nomor_sppb")
            or sppb_no
        )
        sppn_no = (
            match.get("sppn_no")
            or match.get("no_sppn")
            or match.get("nomor_sppn")
            or sppn_no
        )
        blob_sppb, blob_sppn = _extract_numbers_from_blob(_todo_row_blob(match))
        sppb_no = sppb_no or blob_sppb
        sppn_no = sppn_no or blob_sppn

    if store_body is not None and (not sppb_no or not sppn_no):
        body_sppb, body_sppn = _extract_numbers_from_store(store_body)
        sppb_no = sppb_no or body_sppb
        sppn_no = sppn_no or body_sppn

    if not sppb_no or not sppn_no:
        combined = json.dumps(
            {"store": store_body, "match": match},
            ensure_ascii=False,
            default=str,
        )
        blob_sppb, blob_sppn = _extract_numbers_from_blob(combined)
        sppb_no = sppb_no or blob_sppb
        sppn_no = sppn_no or blob_sppn

    return (
        str(sppb_no).strip() if sppb_no else None,
        str(sppn_no).strip() if sppn_no else None,
    )


def _extract_numbers_from_store(body: Any) -> tuple[str | None, str | None]:
    """Ambil nomor SPPn/SPPb dari response POST /spp/store."""

    def walk(node: Any) -> tuple[str | None, str | None]:
        sppb_no: str | None = None
        sppn_no: str | None = None
        if isinstance(node, dict):
            for key, value in node.items():
                key_l = str(key).lower()
                if value and isinstance(value, (str, int, float)):
                    text = str(value).strip()
                    if not text:
                        continue
                    if key_l in {"sppb_no", "no_sppb", "nomor_sppb", "no_sppb_draft"}:
                        sppb_no = text
                    elif key_l in {
                        "sppn_no",
                        "no_sppn",
                        "nomor_sppn",
                        "nomor",
                        "no_spp",
                        "no_sppn_draft",
                        "nomor_draft",
                    }:
                        if (
                            "sppn" in text.lower()
                            or key_l != "nomor"
                            or "/sppn/" in text.lower()
                        ):
                            sppn_no = text
                    elif key_l in {"message", "msg", "info"} and isinstance(text, str):
                        blob_sppb, blob_sppn = _extract_numbers_from_blob(text)
                        sppb_no = sppb_no or blob_sppb
                        sppn_no = sppn_no or blob_sppn
                child_sppb, child_sppn = walk(value)
                sppb_no = sppb_no or child_sppb
                sppn_no = sppn_no or child_sppn
        elif isinstance(node, list):
            for item in node:
                child_sppb, child_sppn = walk(item)
                sppb_no = sppb_no or child_sppb
                sppn_no = sppn_no or child_sppn
        return sppb_no, sppn_no

    if isinstance(body, str):
        text = body.strip()
        if not text:
            return None, None
        try:
            body = json.loads(text)
        except json.JSONDecodeError:
            import re

            sppn_m = _SPPN_NO_RE.search(text)
            sppb_m = _SPPB_NO_RE.search(text)
            return (
                sppb_m.group(1) if sppb_m else None,
                sppn_m.group(1) if sppn_m else None,
            )
    return walk(body)


def _score_all_todo_rows(
    rows: list[Any],
    payload,
    *,
    expect_sppb: bool,
) -> list[tuple[int, dict[str, Any]]]:
    total_sppn = int(payload.dpp_pokok or 0) + int(payload.pajak_ppn or 0)
    scored: list[tuple[int, dict[str, Any]]] = []
    for row in rows:
        if not isinstance(row, dict):
            continue
        score = _score_todo_row(
            row,
            no_do=payload.no_do,
            no_pembayaran=payload.no_pembayaran,
            no_invoice=payload.no_invoice,
            referensi=payload.referensi,
            no_kontrak=payload.no_kontrak,
            mitra_pembeli=payload.mitra_pembeli,
            total_sppn=total_sppn,
            expect_sppb=expect_sppb,
            pph_nominal=int(payload.pph_nominal or 0),
            tanggal_transfer=payload.tanggal_transfer,
        )
        if score > 0:
            scored.append((score, row))
    scored.sort(
        key=lambda item: (
            item[0],
            int(item[1].get("sppn_id") or item[1].get("spp_id") or 0),
        ),
        reverse=True,
    )
    return scored


def _score_todo_row_for_payload(row: dict[str, Any], payload, *, expect_sppb: bool) -> int:
    total_sppn = int(payload.dpp_pokok or 0) + int(payload.pajak_ppn or 0)
    return _score_todo_row(
        row,
        no_do=payload.no_do,
        no_pembayaran=payload.no_pembayaran,
        no_invoice=payload.no_invoice,
        referensi=payload.referensi,
        no_kontrak=payload.no_kontrak,
        mitra_pembeli=payload.mitra_pembeli,
        total_sppn=total_sppn,
        expect_sppb=expect_sppb,
        pph_nominal=int(payload.pph_nominal or 0),
        tanggal_transfer=payload.tanggal_transfer,
    )


def _find_new_todo_match(
    page,
    base_url: str,
    payload,
    *,
    expect_sppb: bool,
    before_ids: set[str],
    retries: int = 10,
    delay_ms: int = 2000,
) -> dict[str, Any] | None:
    """Prioritaskan baris To Do yang baru muncul setelah simpan draft.

    Baris baru tanpa bukti konten (nominal/referensi/kontrak) tidak boleh
    diadopsi — nomor urut Superman dipakai bersama satu regional, jadi baris
    baru bisa saja SPP milik user lain yang kebetulan tersimpan di window
    yang sama (kasus invoice 0353: SPPb/29 + SPPn/71 milik op_divisi).
    """
    best: dict[str, Any] | None = None
    best_score = 0

    for _attempt in range(retries):
        rows = _fetch_todo_rows(page, base_url)
        new_rows = [row for row in rows if _todo_row_id(row) not in before_ids]
        for row in new_rows:
            base = _score_todo_row_for_payload(row, payload, expect_sppb=expect_sppb)
            if base < 30:
                continue
            score = base + 250
            if score > best_score:
                best_score = score
                best = row
        if best_score >= 120:
            return best
        if _attempt < retries - 1:
            page.wait_for_timeout(delay_ms)

    if best_score >= 60:
        return best
    return None


def _find_todo_match(
    page,
    base_url: str,
    payload,
    *,
    expect_sppb: bool,
    before_ids: set[str] | None = None,
    retries: int = 12,
    delay_ms: int = 2000,
) -> dict[str, Any] | None:
    best: dict[str, Any] | None = None
    best_score = 0

    for _attempt in range(retries):
        rows = _fetch_todo_rows(page, base_url)
        for row in rows:
            score = _score_todo_row_for_payload(row, payload, expect_sppb=expect_sppb)
            if score > best_score:
                best_score = score
                best = row
        if best_score >= 800:
            return best
        if _attempt < retries - 1:
            page.wait_for_timeout(delay_ms)

    if before_ids:
        fresh = _find_new_todo_match(
            page,
            base_url,
            payload,
            expect_sppb=expect_sppb,
            before_ids=before_ids,
            retries=6,
            delay_ms=delay_ms,
        )
        if fresh:
            return fresh

    if best_score >= 70:
        return best
    return None


def recover_superman_from_todo(
    *,
    no_invoice: str | None = None,
    no_pembayaran: str | None = None,
    no_do: str | None = None,
    force: bool = False,
) -> dict[str, Any]:
    """Cari nomor SPPn/SPPb di To Do List lalu simpan ke kolom invoice."""
    ref = resolve_no_invoice(
        no_invoice=no_invoice,
        no_pembayaran=no_pembayaran,
        no_do=no_do,
    )
    existing = get_invoice_superman(ref)
    if existing and not force:
        return {
            "ok": True,
            "no_invoice": ref,
            "superman_saved": existing,
            "message": "Sudah tersimpan sebelumnya.",
            "recovered": False,
        }

    cfg = _api_config()
    ensure_session(cfg)
    payload = build_payload_from_invoice(ref)
    expect_sppb = payload.pph_nominal > 0
    match: dict[str, Any] | None = None
    best_score = 0
    inspect: dict[str, Any] = {}

    pw, browser, context = open_authenticated_context(cfg)
    try:
        page = context.new_page()
        match = _find_todo_match(
            page,
            cfg.base_url,
            payload,
            expect_sppb=expect_sppb,
            retries=18,
            delay_ms=2000,
        )
        rows = _fetch_todo_rows(page, cfg.base_url)
        scored = _score_all_todo_rows(rows, payload, expect_sppb=expect_sppb)
        best_score = scored[0][0] if scored else 0
        if match:
            best_score = max(
                best_score,
                _score_todo_row_for_payload(match, payload, expect_sppb=expect_sppb),
            )
        sppb_no, sppn_no = _coalesce_spp_numbers(
            store_sppb=None,
            store_sppn=None,
            match=match,
            store_body=None,
        )
        inspect = {
            "no_invoice": ref,
            "todo_rows": len(rows),
            "top_scores": [
                {
                    "score": score,
                    "sppn_no": row.get("sppn_no"),
                    "sppb_no": row.get("sppb_no"),
                    "sppn_id": row.get("sppn_id") or row.get("spp_id"),
                }
                for score, row in scored[:5]
            ],
            "row_samples": [
                {
                    "sppn_id": row.get("sppn_id") or row.get("spp_id"),
                    "sppn_no": row.get("sppn_no"),
                    "sppb_no": row.get("sppb_no"),
                    "sppn_jumlah": row.get("sppn_jumlah"),
                    "referensi": row.get("referensi") or row.get("referensi_sppn"),
                    "berita_acara": row.get("berita_acara") or row.get("berita_acara_sppb"),
                    "sp_opl": row.get("sp_opl") or row.get("sp_opl_sppn"),
                }
                for row in rows[:8]
            ],
            "coalesce": {"sppb_no": sppb_no, "sppn_no": sppn_no},
        }
    finally:
        context.close()
        browser.close()
        pw.stop()

    if not match or best_score < 70 or not (sppb_no or sppn_no):
        return {
            "ok": False,
            "no_invoice": ref,
            "message": "Tidak menemukan SPPn/SPPb yang cocok di To Do List Superman.",
            "inspect": inspect,
            "best_score": best_score,
        }

    saved = save_superman_to_invoice(ref, sppb_no, sppn_no)
    return {
        "ok": bool(saved),
        "no_invoice": ref,
        "sppb_no": sppb_no,
        "sppn_no": sppn_no,
        "superman_saved": saved,
        "best_score": best_score,
        "recovered": True,
        "message": f"Nomor Superman dipulihkan dari To Do List: {saved}" if saved else "Gagal menyimpan",
    }


def inspect_superman_todo(
    *,
    no_invoice: str | None = None,
    no_pembayaran: str | None = None,
    no_do: str | None = None,
    limit: int = 8,
) -> dict[str, Any]:
    """Baca To Do List Superman untuk debug / recovery nomor SPPn."""
    ref = resolve_no_invoice(
        no_invoice=no_invoice,
        no_pembayaran=no_pembayaran,
        no_do=no_do,
    )
    cfg = _api_config()
    ensure_session(cfg)
    payload = build_payload_from_invoice(ref)
    expect_sppb = payload.pph_nominal > 0

    pw, browser, context = open_authenticated_context(cfg)
    try:
        page = context.new_page()
        rows = _fetch_todo_rows(page, cfg.base_url)
        scored = _score_all_todo_rows(rows, payload, expect_sppb=expect_sppb)
        ref_candidates = _collect_todo_match_refs(
            referensi=payload.referensi,
            no_invoice=payload.no_invoice,
            no_kontrak=payload.no_kontrak,
            no_pembayaran=payload.no_pembayaran,
            no_do=payload.no_do,
        )
        hits = [
            row
            for row in rows
            if any(candidate in _todo_row_blob(row) for candidate in ref_candidates)
        ]
        match = _find_todo_match(
            page,
            cfg.base_url,
            payload,
            expect_sppb=expect_sppb,
            retries=6,
            delay_ms=1500,
        )
        best = match or (scored[0][1] if scored else None)
        sppb_no, sppn_no = _coalesce_spp_numbers(
            store_sppb=None,
            store_sppn=None,
            match=best,
            store_body=None,
        )
        return {
            "no_invoice": ref,
            "todo_rows": len(rows),
            "direct_blob_hits": len(hits),
            "match_refs": ref_candidates[:8],
            "top_scores": [
                {
                    "score": score,
                    "sppn_no": row.get("sppn_no"),
                    "sppb_no": row.get("sppb_no"),
                    "sppn_id": row.get("sppn_id") or row.get("spp_id"),
                    "keys": list(row.keys()),
                    "row": row,
                }
                for score, row in scored[:limit]
            ],
            "row_samples": [
                {
                    "sppn_id": row.get("sppn_id") or row.get("spp_id"),
                    "sppn_no": row.get("sppn_no"),
                    "sppb_no": row.get("sppb_no"),
                    "sppn_jumlah": row.get("sppn_jumlah"),
                    "referensi": row.get("referensi") or row.get("referensi_sppn"),
                    "berita_acara": row.get("berita_acara") or row.get("berita_acara_sppb"),
                    "sp_opl": row.get("sp_opl") or row.get("sp_opl_sppn"),
                }
                for row in rows[:limit]
            ],
            "coalesce": {"sppb_no": sppb_no, "sppn_no": sppn_no},
        }
    finally:
        context.close()
        browser.close()
        pw.stop()


def request_captcha() -> dict[str, Any]:
    from services.superman.sync_executor import run_playwright_sync

    return run_playwright_sync(start_captcha_challenge, _api_config())


def refresh_captcha(challenge_id: str) -> dict[str, Any]:
    from services.superman.sync_executor import run_playwright_sync

    return run_playwright_sync(refresh_captcha_challenge, challenge_id.strip())


def verify_captcha(challenge_id: str, answer: str) -> dict[str, Any]:
    from services.superman.sync_executor import run_playwright_sync

    return run_playwright_sync(
        verify_captcha_challenge, challenge_id.strip(), answer.strip()
    )


def submit_deklarasi_invoice(
    no_invoice: str,
    on_progress: ProgressCallback | None = None,
) -> dict[str, Any]:
    no_invoice = no_invoice.strip()
    assert_invoice_not_submitted(no_invoice)

    report = on_progress or (lambda _percent, _stage: None)

    report(5, "Memuat data invoice dan dokumen")
    validate_deklarasi_ready(no_invoice)
    cfg = _api_config()

    report(10, "Memvalidasi session Superman")
    ensure_session(cfg)

    payload = build_payload_from_invoice(no_invoice)
    supports = resolve_support_doc_from_invoice(no_invoice)

    report(20, "Membuka browser Superman")
    store_sppb: str | None = None
    store_sppn: str | None = None
    store_body: Any = None
    match: dict[str, Any] | None = None
    todo_debug: list[dict[str, Any]] = []
    store_debug: dict[str, Any] = {}
    new_todo_ids: list[str] = []
    before_todo_ids: set[str] = set()
    expect_sppb = payload.pph_nominal > 0
    pw, browser, context = open_authenticated_context(cfg)
    try:
        page = context.new_page()
        fill_sppn_draft(
            page,
            cfg,
            payload,
            support_docs=[doc.path for doc in supports],
            on_progress=on_progress,
        )
        before_todo_ids = _snapshot_todo_ids(page, cfg.base_url)
        store_body = submit_sppn_draft(
            page,
            on_progress=on_progress,
            combined_form=payload.jenis_form == "sppb_sppn",
            store_debug=store_debug,
        )
        if store_body is None:
            report(90, "Respons simpan kosong — memverifikasi To Do List")
        report(95, "Memverifikasi To Do List")
        store_sppb, store_sppn = _extract_numbers_from_store(store_body)
        match = _find_todo_match(
            page,
            cfg.base_url,
            payload,
            expect_sppb=expect_sppb,
            before_ids=before_todo_ids,
            retries=18,
            delay_ms=2000,
        )
        if not (store_sppb or store_sppn) and not match:
            page_sppb, page_sppn = _extract_numbers_from_page(page)
            store_sppb = store_sppb or page_sppb
            store_sppn = store_sppn or page_sppn
        after_rows = _fetch_todo_rows(page, cfg.base_url)
        new_todo_ids = [
            _todo_row_id(row)
            for row in after_rows
            if _todo_row_id(row) not in before_todo_ids
        ]
        for score, row in _score_all_todo_rows(
            after_rows, payload, expect_sppb=expect_sppb
        )[:5]:
            todo_debug.append(
                {
                    "score": score,
                    "sppn_no": row.get("sppn_no"),
                    "sppb_no": row.get("sppb_no"),
                    "sppn_id": row.get("sppn_id") or row.get("spp_id"),
                }
            )
    finally:
        context.close()
        browser.close()
        pw.stop()

    result: dict[str, Any] = {
        "ok": False,
        "no_invoice": no_invoice,
        "no_pembayaran": payload.no_pembayaran,
        "no_do": payload.no_do,
        "no_kontrak": payload.no_kontrak,
        "jenis_form": payload.jenis_form,
        "pph_nominal": payload.pph_nominal,
        "total_sppn": payload.dpp_pokok + payload.pajak_ppn,
        "support_docs": [doc.describe() for doc in supports],
        "superman_url": f"{cfg.base_url.rstrip('/')}/sppd#tab-to-do-list-petugas",
        "message": "Draft SPPn/SPPb berhasil masuk To Do List Superman.",
    }
    sppb_no, sppn_no = _coalesce_spp_numbers(
        store_sppb=store_sppb,
        store_sppn=store_sppn,
        match=match,
        store_body=store_body,
    )
    if match:
        result.update(
            {
                "sppb_no": sppb_no,
                "sppn_no": sppn_no,
                "sppb_total": match.get("sppb_total"),
                "sppn_jumlah": match.get("sppn_jumlah"),
                "tanggal": match.get("tanggal"),
                "spp_id": match.get("spp_id"),
                "todo_matched": True,
            }
        )
    elif sppb_no or sppn_no:
        result.update({"sppb_no": sppb_no, "sppn_no": sppn_no, "todo_matched": False})

    saved = save_superman_to_invoice(no_invoice, sppb_no, sppn_no)
    if saved:
        result["superman_saved"] = saved
        result["ok"] = True
    elif sppb_no or sppn_no:
        result["partial"] = True
        result["ok"] = False
        result["message"] = (
            f"Draft SPPn/SPPb berhasil, namun nomor belum tersimpan otomatis ke invoice. "
            f"Salin manual atau gunakan Pulihkan dari To Do: {format_superman_ref(sppb_no, sppn_no)}"
        )
    else:
        recoverable = bool(match) or bool(new_todo_ids) or any(
            item.get("score", 0) >= 70 for item in todo_debug
        )
        result["partial"] = True
        result["ok"] = False
        result["recoverable"] = recoverable
        if store_body is None and not new_todo_ids:
            network_failures = store_debug.get("request_failures")
            invalid_fields = (store_debug.get("form_before_save") or {}).get("invalid_fields")
            if network_failures and not invalid_fields:
                result["message"] = (
                    "Gagal menyimpan draft — koneksi ke server Superman terputus/tidak merespons "
                    f"(bukan soal isian form). Detail: {network_failures[0]}. Coba lagi beberapa saat."
                )
            else:
                result["message"] = (
                    "Gagal menyimpan draft ke Superman (respons simpan kosong). "
                    "Cek validasi form di Superman atau coba lagi."
                )
        elif recoverable:
            result["message"] = (
                "Draft SPPn/SPPb kemungkinan masuk To Do List, namun nomor belum terdeteksi. "
                "Coba Pulihkan dari To Do List."
            )
        else:
            result["message"] = (
                "Gagal mendapatkan nomor SPPn/SPPb dari Superman. "
                "Cek To Do List manual atau coba deklarasi ulang."
            )
        result["extract_debug"] = {
            "store_extract": {"sppb": store_sppb, "sppn": store_sppn},
            "store_body_preview": json.dumps(store_body, ensure_ascii=False, default=str)[:2500]
            if store_body is not None
            else None,
            "store_debug": store_debug,
            "todo_top": todo_debug,
            "match_found": match is not None,
            "new_todo_ids": new_todo_ids,
            "todo_rows_before": len(before_todo_ids),
        }

    report(100, "Selesai")
    return result


def submit_deklarasi_pembayaran(
    no_pembayaran: str,
    on_progress: ProgressCallback | None = None,
) -> dict[str, Any]:
    no_invoice = resolve_no_invoice(no_pembayaran=no_pembayaran.strip())
    return submit_deklarasi_invoice(no_invoice, on_progress=on_progress)


def submit_deklarasi(no_do: str, on_progress: ProgressCallback | None = None) -> dict[str, Any]:
    no_invoice = resolve_no_invoice(no_do=no_do)
    return submit_deklarasi_invoice(no_invoice, on_progress=on_progress)


def _run_deklarasi_job(job_id: str, no_invoice: str) -> None:
    try:
        result = submit_deklarasi_invoice(
            no_invoice,
            on_progress=make_progress_callback(job_id),
        )
        complete_job(job_id, result)
    except Exception as exc:
        try:
            recovered = recover_superman_from_todo(no_invoice=no_invoice)
            if recovered.get("ok") and recovered.get("superman_saved"):
                complete_job(
                    job_id,
                    {
                        "ok": True,
                        "no_invoice": no_invoice,
                        "superman_saved": recovered["superman_saved"],
                        "sppb_no": recovered.get("sppb_no"),
                        "sppn_no": recovered.get("sppn_no"),
                        "recovered": True,
                        "message": (
                            "Deklarasi bermasalah di tahap simpan, namun nomor berhasil "
                            f"dipulihkan dari To Do List: {recovered['superman_saved']}"
                        ),
                        "warning": str(exc),
                    },
                )
                return
        except Exception:
            pass
        fail_job(job_id, str(exc), debug={"no_invoice": no_invoice, "exc_type": type(exc).__name__})


def start_deklarasi_job(
    *,
    no_invoice: str | None = None,
    no_pembayaran: str | None = None,
    no_do: str | None = None,
) -> dict[str, Any]:
    ref = resolve_no_invoice(
        no_invoice=no_invoice,
        no_pembayaran=no_pembayaran,
        no_do=no_do,
    )
    assert_invoice_not_submitted(ref)
    validate_deklarasi_ready(ref)
    active = find_active_job_for_invoice(ref)
    if active:
        raise ValueError(
            f"Job deklarasi untuk invoice {ref} masih berjalan (job_id={active.job_id}). "
            "Tunggu selesai atau coba lagi nanti."
        )
    cfg = _api_config()
    # Jangan buka Playwright di request HTTP — cukup cek file sesi ada.
    # Validasi live + login dilakukan di thread job (_run_deklarasi_job).
    if not Path(cfg.state_path).is_file():
        raise SupermanCaptchaRequired(
            "Session Superman belum aktif. Isi captcha login Superman terlebih dahulu."
        )
    job_id = create_job(ref, no_pembayaran=(no_pembayaran or "").strip())
    update_job(job_id, 0, "Memulai proses...")
    thread = threading.Thread(target=_run_deklarasi_job, args=(job_id, ref), daemon=True)
    thread.start()
    return {"job_id": job_id, "no_invoice": ref, "no_pembayaran": (no_pembayaran or "").strip()}


def get_deklarasi_progress(
    job_id: str | None = None,
    *,
    no_invoice: str | None = None,
) -> dict[str, Any]:
    job = None
    if job_id:
        job = get_job(job_id.strip())
    if not job and no_invoice:
        job = find_latest_job_for_invoice(no_invoice.strip())
    if not job:
        raise ValueError(
            "Job deklarasi tidak ditemukan atau sudah kedaluwarsa. "
            "Tutup dialog dan klik 'Buat Deklarasi Superman' lagi."
        )
    payload: dict[str, Any] = {
        "job_id": job.job_id,
        "no_invoice": job.no_invoice,
        "no_pembayaran": job.no_pembayaran,
        "status": job.status,
        "percent": job.percent,
        "stage": job.stage,
    }
    if job.status == "completed" and job.result:
        payload["result"] = job.result
    if job.status == "failed" and job.error:
        payload["error"] = job.error
    return payload