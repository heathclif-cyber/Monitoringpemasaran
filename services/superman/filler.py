from __future__ import annotations

import logging
import os
import re
import shutil
import tempfile
from collections.abc import Callable
from datetime import datetime
from pathlib import Path

from playwright.sync_api import Page

from services.superman.config import SupermanConfig

ProgressCallback = Callable[[int, str], None]
from services.superman.payload import DeklarasiPayload, LineItem, SppbLineItem
from services.superman.select2_helpers import (
    pick_cash_flow,
    pick_cash_flow_sppb,
    pick_gl,
    pick_gl_sppb,
    pick_profit_center,
    pick_profit_center_sppb,
)

TAMBAH_URL = "/spp/tambah"
logger = logging.getLogger("superman.filler")


def _wait_loaded(page: Page) -> None:
    page.wait_for_function("() => !document.body.innerText.includes('LOADING')", timeout=90000)
    page.wait_for_timeout(800)


def _select_form(page: Page, cfg: SupermanConfig, jenis_form: str) -> None:
    page.select_option('select[name="flow_id"]', cfg.flow_id)
    page.wait_for_timeout(400)
    page.select_option("#jenis_spp", "vendor")
    page.wait_for_timeout(400)
    page.select_option("#jenis_form", jenis_form)
    page.wait_for_timeout(1200)
    page.select_option("#sumber_dana", "1")
    page.wait_for_timeout(800)


def _set_readonly_input(page: Page, selector: str, value: str) -> None:
    page.evaluate(
        """([sel, val]) => {
            const el = document.querySelector(sel);
            if (!el) return;
            el.removeAttribute('readonly');
            el.value = val;
            el.dispatchEvent(new Event('input', { bubbles: true }));
            el.dispatchEvent(new Event('change', { bubbles: true }));
        }""",
        [selector, value],
    )


def _fill_input(page: Page, selector: str, value: str) -> None:
    page.evaluate(
        """([sel, val]) => {
            const el = document.querySelector(sel);
            if (!el) return;
            el.removeAttribute('readonly');
            el.value = val;
            el.dispatchEvent(new Event('input', { bubbles: true }));
            el.dispatchEvent(new Event('change', { bubbles: true }));
            if (window.jQuery) window.jQuery(el).trigger('input').trigger('change');
        }""",
        [selector, value],
    )


def _fill_shared_informasi(page: Page, payload: DeklarasiPayload, cfg: SupermanConfig) -> None:
    if payload.jenis_form == "sppb_sppn":
        _fill_input(page, "#kwitansi_spp", payload.mitra_pembeli)
        _fill_input(page, "#referensi_spp", payload.referensi or payload.no_invoice or "-")
        _fill_input(page, "#berita_acara_sppb", payload.ba_au58 or payload.no_pembayaran or payload.no_do or "-")
        _fill_input(page, "#sp_opl_sppb", payload.no_kontrak or "-")
        _fill_input(page, "#sp_opl_sppn", payload.no_kontrak or "-")
        _fill_input(page, "#au58_sppn", payload.ba_au58 or payload.no_pembayaran or payload.no_do or "-")
        page.select_option("#bagian_sppb", cfg.bagian)
        page.select_option("#bagian_sppn", cfg.bagian)
        if payload.tanggal_transfer:
            _set_readonly_input(page, "#tanggal_sppb", payload.tanggal_transfer)
            _set_readonly_input(page, "#tanggal_sppn", payload.tanggal_transfer)
        page.evaluate(
            """([kppName]) => {
                const metode = document.querySelector('#metode_pembayaran_sppb');
                if (metode) {
                    metode.value = 'tidak_transfer';
                    metode.dispatchEvent(new Event('change', { bubbles: true }));
                    if (window.jQuery) jQuery(metode).trigger('change');
                }
                const catatan = document.querySelector('#alasan_tidak_transfer');
                if (catatan) {
                    catatan.value = `Setoran PPh ke ${kppName}`;
                    catatan.dispatchEvent(new Event('input', { bubbles: true }));
                }
            }""",
            [payload.kpp_recipient],
        )
        page.wait_for_timeout(800)
        page.fill("#nama_diterima_sppn_input", "tertanggu")
        page.fill("#alamat_diterima_sppn_input", "tertanggu")
        return

    _fill_input(page, "#kwitansi_sppn", payload.mitra_pembeli)
    _fill_input(page, "#referensi_sppn", payload.referensi or payload.no_invoice or "-")
    _fill_input(page, "#au58_sppn", payload.ba_au58 or payload.no_pembayaran or payload.no_do or "-")
    _fill_input(page, "#sp_opl_sppn", payload.no_kontrak or "-")
    page.select_option("#bagian_sppn", cfg.bagian)
    if payload.tanggal_transfer:
        _set_readonly_input(page, "#tanggal_sppn", payload.tanggal_transfer)
    _fill_input(page, "#nama_diterima_sppn_input", "tertanggu")
    _fill_input(page, "#alamat_diterima_sppn_input", "tertanggu")
    if page.locator("#faktur_pajak_sppn_1").count():
        _fill_input(page, "#faktur_pajak_sppn_1", "-")


def _set_ckeditor(page: Page, editor_id: str, text: str) -> None:
    page.evaluate(
        """([editorId, value]) => {
            if (window.CKEDITOR && CKEDITOR.instances[editorId]) {
                const inst = CKEDITOR.instances[editorId];
                inst.setData(value);
                inst.updateElement();
                return;
            }
            const el = document.getElementById(editorId);
            if (el) {
                el.value = value;
                el.dispatchEvent(new Event('input', { bubbles: true }));
                el.dispatchEvent(new Event('change', { bubbles: true }));
            }
        }""",
        [editor_id, text],
    )


def _parse_id_number(value: str) -> int:
    digits = re.sub(r"[^\d]", "", value or "")
    return int(digits or 0)


def _count_uploaded_docs(page: Page, input_selector: str) -> int:
    """Hitung file terlampir di widget bootstrap-fileinput Superman."""
    return int(
        page.evaluate(
            """(sel) => {
                const input = document.querySelector(sel);
                if (!input) return 0;
                const files = input.files ? input.files.length : 0;
                const root = input.closest('.file-input');
                const previews = root
                    ? root.querySelectorAll('.file-preview-thumbnails .file-preview-frame').length
                    : 0;
                return Math.max(files, previews);
            }""",
            input_selector,
        )
        or 0
    )


def _read_input_file_count(page: Page, input_selector: str) -> int:
    """Baca jumlah file di input asli — jangan picu event change Superman (jQuery .val() error)."""
    return int(
        page.evaluate(
            """(sel) => {
                const input = document.querySelector(sel);
                return input && input.files ? input.files.length : 0;
            }""",
            input_selector,
        )
        or 0
    )


def _prepare_unique_upload_paths(paths: list[str]) -> tuple[list[str], tempfile.TemporaryDirectory | None]:
    """Salin file dengan nama duplikat agar Superman tidak menimpa upload sebelumnya."""
    seen: dict[str, int] = {}
    for raw in paths:
        key = Path(raw).name.lower()
        seen[key] = seen.get(key, 0) + 1

    if all(count == 1 for count in seen.values()):
        return paths, None

    tmp = tempfile.TemporaryDirectory(prefix="superman_docs_")
    out: list[str] = []
    used: dict[str, int] = {}
    for raw in paths:
        src = Path(raw)
        key = src.name.lower()
        if used.get(key, 0) == 0:
            used[key] = 1
            out.append(str(src))
            continue
        used[key] = used.get(key, 0) + 1
        dest = Path(tmp.name) / f"{used[key]}_{src.name}"
        shutil.copy2(src, dest)
        out.append(str(dest))
    return out, tmp


def _assert_line_item_ready(page: Page, isi_index: int, gl_code: str, nominal: int) -> None:
    gl_val = page.locator(f"#sap_gl_sppn_id_{isi_index}").input_value(timeout=2000)
    if not gl_val:
        raise RuntimeError(f"GL {gl_code} belum terpilih di baris SPPn {isi_index}")
    nominal_val = page.locator(f"#nominal_sppn_{isi_index}_1").input_value(timeout=2000)
    if _parse_id_number(nominal_val) <= 0:
        raise RuntimeError(f"Nominal baris SPPn {isi_index} belum terisi")
    if _parse_id_number(nominal_val) != int(nominal):
        page.fill(f"#nominal_sppn_{isi_index}_1", str(nominal))
        page.locator(f"#nominal_sppn_{isi_index}_1").dispatch_event("keyup")
        page.locator(f"#nominal_sppn_{isi_index}_1").dispatch_event("change")
    uraian_val = page.evaluate(
        """(editorId) => {
            if (window.CKEDITOR && CKEDITOR.instances[editorId]) {
                const text = CKEDITOR.instances[editorId].getData().replace(/<[^>]+>/g, '').trim();
                if (text) return text;
            }
            const el = document.getElementById(editorId);
            return (el && el.value ? el.value : '').trim();
        }""",
        f"ckeditors_{isi_index}_1",
    )
    if not uraian_val:
        raise RuntimeError(f"Uraian baris SPPn {isi_index} belum terisi")


def _fill_isi_sppn_block(page: Page, isi_index: int, item: LineItem) -> None:
    pick_gl(page, isi_index, item.gl_code)
    pick_profit_center(page, isi_index, item.profit_center_search)
    pick_cash_flow(page, isi_index, item.cash_flow)

    editor_id = f"ckeditors_{isi_index}_1"
    _set_ckeditor(page, editor_id, item.uraian)
    page.locator(f"#{editor_id}").fill(item.uraian)
    page.select_option(
        f"#pilih_pajak_sppn_{isi_index}_1",
        f"tanpa_pajak_sppn_{isi_index}_1",
        force=True,
    )
    page.fill(f"#nominal_sppn_{isi_index}_1", str(item.nominal))
    page.locator(f"#nominal_sppn_{isi_index}_1").dispatch_event("keyup")
    page.locator(f"#nominal_sppn_{isi_index}_1").dispatch_event("change")
    _assert_line_item_ready(page, isi_index, item.gl_code, item.nominal)


def _fill_isi_sppb_block(page: Page, isi_index: int, item: SppbLineItem) -> None:
    pick_gl_sppb(page, isi_index, item.gl_code)
    pick_profit_center_sppb(page, isi_index, item.profit_center_search)
    pick_cash_flow_sppb(page, isi_index, item.cash_flow)

    editor_id = f"ckeditor_{isi_index}_1"
    _set_ckeditor(page, editor_id, item.uraian)
    page.locator(f"#{editor_id}").fill(item.uraian)
    page.select_option(
        f"#pilih_pajak_sppb_{isi_index}_1",
        f"tanpa_pajak_sppb_{isi_index}_1",
        force=True,
    )
    page.fill(f"#nominal_sppb_{isi_index}_1", str(item.nominal))
    page.locator(f"#nominal_sppb_{isi_index}_1").dispatch_event("keyup")


def _upload_files_to_input(page: Page, input_selector: str, paths: list[str]) -> None:
    """Upload dokumen ke input file Superman (bootstrap-fileinput, multiple)."""
    page.wait_for_selector(input_selector, state="attached", timeout=15000)
    locator = page.locator(input_selector)
    upload_paths, tmp = _prepare_unique_upload_paths(paths)
    try:
        expected = len(upload_paths)
        locator.set_input_files(upload_paths)
        page.wait_for_timeout(800)
        for _ in range(30):
            if _count_uploaded_docs(page, input_selector) >= expected:
                return
            page.wait_for_timeout(1000)
        final = _count_uploaded_docs(page, input_selector)
        if final < expected:
            logger.warning(
                "Upload dokumen ke %s: daftar %s/%s (%s)",
                input_selector,
                final,
                expected,
                ", ".join(Path(p).name for p in upload_paths),
            )
    finally:
        if tmp is not None:
            tmp.cleanup()


def _screenshot_debug(page: Page, label: str) -> str | None:
    try:
        debug_dir = Path(os.getenv("SUPERMAN_DEBUG_DIR", "/tmp/superman_debug"))
        debug_dir.mkdir(parents=True, exist_ok=True)
        ts = datetime.now().strftime("%Y%m%d_%H%M%S")
        path = debug_dir / f"{label}_{ts}.png"
        page.screenshot(path=str(path), full_page=True)
        return str(path)
    except Exception:
        return None


def _wait_doc_list_dom(page: Page, *, timeout_ms: int = 15000) -> None:
    selectors = [
        "#dokumen_pendukung_sppn",
        "#dokumen_pendukung_sppb",
        ".file-preview-thumbnails",
    ]
    for selector in selectors:
        try:
            page.wait_for_selector(selector, state="attached", timeout=timeout_ms)
            return
        except Exception:
            continue


def _wait_uploaded_docs(page: Page, input_selector: str, expected: int, *, timeout_ms: int = 90000) -> int:
    elapsed = 0
    step = 1000
    uploaded = 0
    while elapsed <= timeout_ms:
        uploaded = _count_uploaded_docs(page, input_selector)
        if uploaded >= expected:
            return uploaded
        page.wait_for_timeout(step)
        elapsed += step
    return uploaded


def _upload_support_docs(page: Page, support_docs: list[Path], *, combined: bool) -> None:
    missing = [path for path in support_docs if not path.exists()]
    paths = [str(path) for path in support_docs if path.exists()]
    if missing:
        labels = ", ".join(path.name for path in missing)
        raise RuntimeError(
            f"File dokumen tidak ditemukan di server: {labels}. "
            "Upload ulang Kontrak, Invoice, dan Rekening Koran di menu Input Pembayaran."
        )
    if not paths:
        raise RuntimeError(
            "Dokumen pendukung Superman kosong. "
            "Upload Kontrak, Invoice, dan Rekening Koran terlebih dahulu."
        )

    if combined:
        page.locator('a[href="#tab-informasi-sppb"]').click(force=True)
        page.wait_for_timeout(500)
        _upload_files_to_input(page, "#dokumen_pendukung_sppb", paths)
        page.locator('a[href="#tab-informasi-sppn"]').click(force=True)
        page.wait_for_timeout(500)
        _upload_files_to_input(page, "#dokumen_pendukung_sppn", paths)
    else:
        page.locator('a[href="#tab-informasi-sppn"]').click(force=True)
        page.wait_for_timeout(600)
        _upload_files_to_input(page, "#dokumen_pendukung_sppn", paths)

    _wait_doc_list_dom(page)
    uploaded = _wait_uploaded_docs(page, "#dokumen_pendukung_sppn", len(paths))
    if uploaded < len(paths):
        names = ", ".join(Path(p).name for p in paths)
        shot = _screenshot_debug(page, "upload_docs_failed")
        hint = f" Screenshot: {shot}" if shot else ""
        raise RuntimeError(
            f"Dokumen pendukung Superman belum terlampir ({uploaded}/{len(paths)} file). "
            f"File: {names}. "
            "Pastikan Kontrak, Invoice, dan Rekening Koran berbeda/valid, lalu upload ulang di aplikasi "
            f"dan jalankan deklarasi sekali lagi.{hint}"
        )

    page.evaluate(
        """() => {
            if (typeof bandingkan_dpp_sisa === 'function') {
                bandingkan_dpp_sisa();
            }
        }"""
    )
    page.wait_for_timeout(800)


def fill_sppn_draft(
    page: Page,
    cfg: SupermanConfig,
    payload: DeklarasiPayload,
    *,
    support_docs: list[Path] | None = None,
    on_progress: ProgressCallback | None = None,
) -> None:
    def report(percent: int, stage: str) -> None:
        if on_progress:
            on_progress(percent, stage)

    report(25, "Membuka form SPPn di Superman")
    page.goto(cfg.base_url.rstrip("/") + TAMBAH_URL, wait_until="networkidle", timeout=90000)
    _wait_loaded(page)
    combined = payload.jenis_form == "sppb_sppn"

    report(35, "Mengisi informasi umum")
    _select_form(page, cfg, payload.jenis_form)
    _fill_shared_informasi(page, payload, cfg)

    if support_docs:
        report(45, "Mengunggah dokumen pendukung")
        _upload_support_docs(page, support_docs, combined=combined)

    if combined and payload.sppb_item:
        report(55, "Mengisi baris SPPb (PPh)")
        page.locator('a[href="#tab-isi-sppb"]').click(force=True)
        page.wait_for_timeout(1000)
        _fill_isi_sppb_block(page, 1, payload.sppb_item)

    page.locator('a[href="#tab-isi-sppn"]').click(force=True)
    page.wait_for_timeout(1000)

    total_lines = max(len(payload.line_items), 1)
    for idx, item in enumerate(payload.line_items, start=1):
        line_pct = 60 + int((idx / total_lines) * 20)
        report(line_pct, f"Mengisi baris SPPn ({idx}/{total_lines})")
        if idx > 1:
            page.locator('button[onclick="tambah_isi_sppn()"]').click()
            page.wait_for_timeout(1200)
        _fill_isi_sppn_block(page, idx, item)

    report(82, "Memvalidasi isian form")
    if support_docs:
        _upload_support_docs(page, support_docs, combined=combined)

    page.locator('a[href="#tab-informasi-sppn"]').click(force=True)
    page.wait_for_timeout(600)
    referensi_val = page.locator("#referensi_sppn").input_value(timeout=2000).strip()
    if not referensi_val:
        raise RuntimeError("Field Referensi SPPn kosong — gagal mengisi nomor invoice")
    kwitansi_val = page.locator("#kwitansi_sppn").input_value(timeout=2000).strip()
    if not kwitansi_val:
        raise RuntimeError("Field Kwitansi SPPn kosong — gagal mengisi nama pembeli")
    page.evaluate("() => { if (typeof bandingkan_dpp_sisa === 'function') bandingkan_dpp_sisa(); }")
    page.wait_for_timeout(500)


def _swal_visible(page: Page):
    return page.locator(".swal2-popup.swal2-show, .swal2-popup:visible").first


def _dismiss_swal_dialogs(
    page: Page,
    *,
    print_after: bool = False,
    timeout_ms: int = 180000,
) -> None:
    """Tunggu cek anomali + konfirmasi simpan Superman, lalu klik Simpan Saja."""
    elapsed = 0
    step = 1000
    idle_no_popup = 0

    while elapsed <= timeout_ms:
        popup = _swal_visible(page)
        if popup.count() == 0:
            idle_no_popup += 1
            if idle_no_popup >= 4:
                return
            page.wait_for_timeout(step)
            elapsed += step
            continue

        idle_no_popup = 0
        text = popup.inner_text()
        lower = text.lower()
        if "belum terisi" in lower or "belum lengkap" in lower:
            details = popup.locator(".swal2-html-container li").all_inner_texts()
            lines = [ln.strip() for ln in text.splitlines() if ln.strip()]
            short = next(
                (
                    ln
                    for ln in lines
                    if "belum terisi" in ln.lower()
                    or "belum lengkap" in ln.lower()
                    or "wajib" in ln.lower()
                ),
                lines[0] if lines else "",
            )
            if details:
                short = f"{short} — {', '.join(details[:5])}"
            elif not short or len(short) > 240:
                short = "Ada field wajib di form Superman yang belum terisi."
            raise RuntimeError(f"Validasi Superman gagal: {short}")

        if (
            popup.locator(".swal2-loading").count()
            or "mengecek urutan" in lower
            or "mohon tunggu" in lower
        ):
            page.wait_for_timeout(step)
            elapsed += step
            continue

        if (
            "anomali" in lower
            or "menyimpan dan mencetak" in lower
            or "simpan saja" in lower
            or "info urutan" in lower
        ):
            if print_after:
                popup.locator(".swal2-confirm, button:has-text('Simpan dan Cetak')").first.click()
            else:
                deny = popup.locator(".swal2-deny, button:has-text('Simpan Saja')")
                if deny.count():
                    deny.first.click()
                else:
                    popup.locator(".swal2-confirm").first.click()
            page.wait_for_timeout(1500)
            elapsed += step
            continue

        confirm = popup.locator(".swal2-confirm")
        if confirm.count():
            confirm.first.click()
            page.wait_for_timeout(1500)
            elapsed += step
            continue

        page.wait_for_timeout(step)
        elapsed += step


def submit_sppn_draft(
    page: Page,
    *,
    print_after: bool = False,
    on_progress: ProgressCallback | None = None,
) -> dict | list | str | None:
    if on_progress:
        on_progress(88, "Menyimpan draft ke Superman")

    for sel in ("#dokumen_pendukung_sppn", "#dokumen_pendukung_sppb"):
        if page.locator(sel).count():
            attached = _count_uploaded_docs(page, sel)
            if attached == 0:
                logger.warning("Input %s tidak punya file sebelum simpan", sel)

    simpan = page.locator("#simpan, button:has-text('Simpan')").first
    simpan.wait_for(state="visible", timeout=10000)
    page.wait_for_function(
        "() => { const b = document.querySelector('#simpan'); return b && !b.disabled; }",
        timeout=30000,
    )

    store_body: dict | list | str | None = None
    try:
        with page.expect_response(
            lambda resp: "/spp/store" in resp.url and resp.request.method == "POST",
            timeout=300000,
        ) as resp_info:
            simpan.click()
            _dismiss_swal_dialogs(page, print_after=print_after, timeout_ms=240000)
            try:
                store_body = resp_info.value.json()
            except Exception:
                try:
                    store_body = resp_info.value.text()
                except Exception:
                    store_body = None
    except Exception as exc:
        logger.warning("Respons /spp/store tidak tertangkap: %s", exc)

    page.wait_for_load_state("networkidle", timeout=120000)

    if store_body is None:
        shot = _screenshot_debug(page, "spp_store_empty")
        logger.warning(
            "Superman tidak mengembalikan respons /spp/store — akan cek To Do List. screenshot=%s",
            shot,
        )
        return None

    if isinstance(store_body, dict):
        success = store_body.get("success")
        status = str(store_body.get("status") or "").lower()
        if success is False or status in {"error", "failed", "fail"}:
            msg = (
                store_body.get("message")
                or store_body.get("msg")
                or store_body.get("error")
                or str(store_body)
            )
            shot = _screenshot_debug(page, "spp_store_error")
            hint = f" Screenshot: {shot}" if shot else ""
            raise RuntimeError(f"Gagal menyimpan draft Superman: {msg}{hint}")

    return store_body


def pause_for_review(page: Page, message: str) -> None:
    print(message)
    if not page.context.browser:
        return
    try:
        input("Tekan Enter setelah cek form / upload dokumen ... ")
    except EOFError:
        page.wait_for_timeout(30000)