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
        ref = payload.referensi or payload.no_invoice or "-"
        _fill_input(page, "#kwitansi_spp", payload.mitra_pembeli)
        _fill_input(page, "#referensi_spp", ref)
        _fill_input(page, "#referensi_sppn", ref)
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
        _fill_input(page, "#kwitansi_sppn", payload.mitra_pembeli)
        if page.locator("#faktur_pajak_sppn_1").count():
            _fill_input(page, "#faktur_pajak_sppn_1", "-")
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
    page.locator(f"#nominal_sppb_{isi_index}_1").dispatch_event("change")
    _assert_sppb_line_item_ready(page, isi_index, item.gl_code, item.nominal)


def _assert_sppb_line_item_ready(page: Page, isi_index: int, gl_code: str, nominal: int) -> None:
    gl_val = page.locator(f"#sap_gl_sppb_id_{isi_index}").input_value(timeout=2000)
    if not gl_val:
        raise RuntimeError(f"GL {gl_code} belum terpilih di baris SPPb {isi_index}")
    nominal_val = page.locator(f"#nominal_sppb_{isi_index}_1").input_value(timeout=2000)
    if _parse_id_number(nominal_val) <= 0:
        raise RuntimeError(f"Nominal baris SPPb {isi_index} belum terisi")
    if _parse_id_number(nominal_val) != int(nominal):
        page.fill(f"#nominal_sppb_{isi_index}_1", str(nominal))
        page.locator(f"#nominal_sppb_{isi_index}_1").dispatch_event("keyup")
        page.locator(f"#nominal_sppb_{isi_index}_1").dispatch_event("change")
    uraian_val = page.evaluate(
        """(editorId) => {
            if (window.CKEDITOR && CKEDITOR.instances[editorId]) {
                const text = CKEDITOR.instances[editorId].getData().replace(/<[^>]+>/g, '').trim();
                if (text) return text;
            }
            const el = document.getElementById(editorId);
            return (el && el.value ? el.value : '').trim();
        }""",
        f"ckeditor_{isi_index}_1",
    )
    if not uraian_val:
        raise RuntimeError(f"Uraian baris SPPb {isi_index} belum terisi")


def _diagnose_form_state(page: Page) -> dict[str, object]:
    """Snapshot form — jangan panggil validateForm (memicu dialog urutan async)."""
    return page.evaluate(
        """() => {
            const out = {
                swal: '',
                invalid_fields: [],
                simpan_disabled: null,
            };
            document
                .querySelectorAll('.has-error input, .has-error select, .is-invalid, .error')
                .forEach((el) => {
                    const id = el.id || el.name || el.tagName;
                    if (id) out.invalid_fields.push(String(id).slice(0, 80));
                });
            const swal = document.querySelector('.swal2-popup.swal2-show')
                || [...document.querySelectorAll('.swal2-popup')].find((el) => {
                    const style = window.getComputedStyle(el);
                    return style.display !== 'none' && style.visibility !== 'hidden';
                });
            if (swal) out.swal = (swal.innerText || '').trim().slice(0, 500);
            const btn = document.querySelector('#simpan');
            out.simpan_disabled = btn ? !!btn.disabled : null;
            return out;
        }"""
    )


def _prepare_form_before_save(page: Page, *, combined_form: bool) -> dict[str, object]:
    if combined_form:
        page.locator('a[href="#tab-informasi-sppb"]').click(force=True)
        page.wait_for_timeout(500)
        page.evaluate(
            "() => { if (typeof bandingkan_dpp_sisa === 'function') bandingkan_dpp_sisa(); }"
        )
        page.wait_for_timeout(400)
    page.locator('a[href="#tab-informasi-sppn"]').click(force=True)
    page.wait_for_timeout(500)
    page.evaluate(
        "() => { if (typeof bandingkan_dpp_sisa === 'function') bandingkan_dpp_sisa(); }"
    )
    page.wait_for_timeout(400)
    return _diagnose_form_state(page)


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
        sppb_uploaded = _wait_uploaded_docs(page, "#dokumen_pendukung_sppb", len(paths))
        if sppb_uploaded < len(paths):
            shot = _screenshot_debug(page, "upload_sppb_failed")
            hint = f" Screenshot: {shot}" if shot else ""
            raise RuntimeError(
                f"Dokumen pendukung SPPb belum terlampir ({sppb_uploaded}/{len(paths)} file). "
                f"Upload ulang dokumen di Input Pembayaran.{hint}"
            )
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
    if combined:
        referensi_val = (
            page.locator("#referensi_sppn").input_value(timeout=2000).strip()
            or page.locator("#referensi_spp").input_value(timeout=2000).strip()
        )
        kwitansi_sel = "#kwitansi_spp"
    else:
        referensi_val = page.locator("#referensi_sppn").input_value(timeout=2000).strip()
        kwitansi_sel = "#kwitansi_sppn"
    if not referensi_val:
        raise RuntimeError("Field Referensi SPPn kosong — gagal mengisi nomor invoice")
    kwitansi_val = page.locator(kwitansi_sel).input_value(timeout=2000).strip()
    if not kwitansi_val:
        raise RuntimeError("Field Kwitansi kosong — gagal mengisi nama pembeli")
    page.evaluate("() => { if (typeof bandingkan_dpp_sisa === 'function') bandingkan_dpp_sisa(); }")
    page.wait_for_timeout(500)


def _swal_visible(page: Page):
    return page.locator(".swal2-popup.swal2-show, .swal2-popup:visible").first


def _swal_text(page: Page) -> str:
    popup = _swal_visible(page)
    if popup.count() == 0:
        return ""
    try:
        return popup.inner_text().strip()
    except Exception:
        return ""


def _swal_is_loading(page: Page) -> bool:
    popup = _swal_visible(page)
    if popup.count() == 0:
        return False
    text = _swal_text(page).lower()
    return bool(
        popup.locator(".swal2-loading").count()
        or "mengecek urutan" in text
        or "mohon tunggu" in text
    )


def _click_swal_button_js(page: Page, *, print_after: bool = False) -> bool:
    return bool(
        page.evaluate(
            """(printAfter) => {
                const popup = document.querySelector('.swal2-popup.swal2-show')
                    || [...document.querySelectorAll('.swal2-popup')].find((el) => {
                        const style = window.getComputedStyle(el);
                        return style.display !== 'none' && style.visibility !== 'hidden';
                    });
                if (!popup) return false;
                const text = (popup.innerText || '').toLowerCase();
                if (
                    popup.querySelector('.swal2-loading')
                    || text.includes('mengecek urutan')
                    || text.includes('mohon tunggu')
                ) {
                    return false;
                }
                if (printAfter) {
                    const confirm = popup.querySelector('.swal2-confirm');
                    if (confirm) {
                        confirm.click();
                        return true;
                    }
                    return false;
                }
                const deny = popup.querySelector('.swal2-deny');
                if (deny) {
                    deny.click();
                    return true;
                }
                const simpanSaja = [...popup.querySelectorAll('button')].find((btn) =>
                    (btn.innerText || '').toLowerCase().includes('simpan saja'),
                );
                if (simpanSaja) {
                    simpanSaja.click();
                    return true;
                }
                const confirm = popup.querySelector('.swal2-confirm');
                if (confirm) {
                    confirm.click();
                    return true;
                }
                return false;
            }""",
            print_after,
        )
    )


def _click_swal_action(page: Page, *, print_after: bool = False) -> bool:
    popup = _swal_visible(page)
    if popup.count() == 0:
        return False
    text = _swal_text(page)
    lower = text.lower()
    _raise_swal_validation_error(text)
    if _swal_is_loading(page):
        return False
    if _click_swal_button_js(page, print_after=print_after):
        page.wait_for_timeout(800)
        return True
    if (
        "anomali" in lower
        or "menyimpan dan mencetak" in lower
        or "simpan saja" in lower
        or "info urutan" in lower
    ):
        try:
            if print_after:
                popup.locator(".swal2-confirm, button:has-text('Simpan dan Cetak')").first.click(
                    force=True, timeout=5000, no_wait_after=True
                )
            else:
                deny = popup.locator(".swal2-deny, button:has-text('Simpan Saja')")
                if deny.count():
                    deny.first.click(force=True, timeout=5000, no_wait_after=True)
                else:
                    popup.locator(".swal2-confirm").first.click(
                        force=True, timeout=5000, no_wait_after=True
                    )
            page.wait_for_timeout(800)
            return True
        except Exception:
            return _click_swal_button_js(page, print_after=print_after)
    confirm = popup.locator(".swal2-confirm")
    if confirm.count():
        try:
            confirm.first.click(force=True, timeout=5000, no_wait_after=True)
            page.wait_for_timeout(800)
            return True
        except Exception:
            return _click_swal_button_js(page, print_after=print_after)
    return False


def _trigger_store_after_urutan(page: Page) -> None:
    """Picu POST /spp/store setelah dialog urutan — hindari navigasi penuh."""
    page.evaluate(
        """() => {
            const status = document.getElementById('status_btn');
            if (status) status.value = '0';
            const deny = document.querySelector('.swal2-deny');
            if (deny) {
                deny.click();
                return;
            }
            const simpanSaja = [...document.querySelectorAll('.swal2-popup button')].find((btn) =>
                (btn.innerText || '').toLowerCase().includes('simpan saja'),
            );
            if (simpanSaja) {
                simpanSaja.click();
                return;
            }
            if (typeof simpan_spp === 'function') simpan_spp();
        }"""
    )


def _post_store_via_fetch(page: Page) -> dict[str, object] | None:
    """Fallback: kirim FormData ke /spp/store via fetch (tanpa navigasi halaman)."""
    try:
        result = page.evaluate(
            """async () => {
                const form = document.getElementById('form_spp');
                if (!form) return { ok: false, reason: 'form_spp tidak ada' };
                const status = document.getElementById('status_btn');
                if (status) status.value = '0';
                const body = new FormData(form);
                const token = document.querySelector('meta[name=csrf-token]')?.content
                    || document.querySelector('input[name=_token]')?.value
                    || '';
                const headers = {};
                if (token) headers['X-CSRF-TOKEN'] = token;
                const resp = await fetch('/spp/store', {
                    method: 'POST',
                    body,
                    headers,
                    credentials: 'same-origin',
                });
                const text = await resp.text();
                try {
                    return { ok: resp.ok, status: resp.status, json: JSON.parse(text) };
                } catch (err) {
                    return { ok: resp.ok, status: resp.status, text: text.slice(0, 5000) };
                }
            }"""
        )
    except Exception as exc:
        return {"ok": False, "reason": str(exc)}
    if not isinstance(result, dict):
        return None
    if result.get("json") is not None:
        return result["json"]  # type: ignore[return-value]
    if result.get("ok"):
        return result
    return result


_SPPN_NO_RE = re.compile(
    r"((?:R\d+/R\d+D/SPPn/|\d+(?:\.\d+)?/SPPn/)[^\s\"'<>]+)",
    re.I,
)
_SPPB_NO_RE = re.compile(
    r"((?:R\d+/R\d+D/SPPb/|\d+(?:\.\d+)?/SPP[BG]/)[^\s\"'<>]+)",
    re.I,
)


def _is_store_post_response(resp) -> bool:
    if resp.request.method != "POST":
        return False
    url = (resp.url or "").lower()
    return (
        "/spp/store" in url
        or ("/sppd/" in url and "store" in url)
        or ("/spp/" in url and url.rstrip("/").endswith("/store"))
    )


def _extract_numbers_from_page_content(page: Page) -> tuple[str | None, str | None]:
    try:
        blob = f"{page.url or ''}\n{page.content()}"
    except Exception:
        return None, None
    sppb_m = _SPPB_NO_RE.search(blob)
    sppn_m = _SPPN_NO_RE.search(blob)
    return (
        sppb_m.group(1) if sppb_m else None,
        sppn_m.group(1) if sppn_m else None,
    )


def _parse_store_response(resp) -> dict | list | str | None:
    try:
        return resp.json()
    except Exception:
        try:
            return resp.text()
        except Exception:
            return None


def _raise_swal_validation_error(text: str) -> None:
    lower = text.lower()
    if "belum terisi" not in lower and "belum lengkap" not in lower:
        return
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
    if not short or len(short) > 240:
        short = "Ada field wajib di form Superman yang belum terisi."
    raise RuntimeError(f"Validasi Superman gagal: {short}")


def _handle_swal_popup(page: Page, *, print_after: bool = False) -> str:
    """Satu langkah tangani popup Superman. Return: none|waiting|acted."""
    if _swal_visible(page).count() == 0:
        return "none"
    if _swal_is_loading(page):
        return "waiting"
    try:
        if _click_swal_action(page, print_after=print_after):
            return "acted"
    except Exception as exc:
        logger.warning("Klik dialog Swal gagal (%s) — coba JS", exc)
        if _click_swal_button_js(page, print_after=print_after):
            return "acted"
    return "waiting"


def _install_swal_auto_confirm(page: Page, *, print_after: bool = False) -> None:
    """Auto-klik dialog Swal (Simpan Saja) — headless sering tidak selesai sendiri."""
    page.evaluate(
        """(printAfter) => {
            if (!window.Swal || window.__swalPatched) return;
            window.__swalPatched = true;
            const clickPopup = () => {
                const popup = document.querySelector('.swal2-popup.swal2-show')
                    || [...document.querySelectorAll('.swal2-popup')].find((el) => {
                        const style = window.getComputedStyle(el);
                        return style.display !== 'none' && style.visibility !== 'hidden';
                    });
                if (!popup) return;
                const text = (popup.innerText || '').toLowerCase();
                if (text.includes('belum terisi') || text.includes('belum lengkap')) return;
                if (popup.querySelector('.swal2-loading') || text.includes('mengecek urutan') || text.includes('mohon tunggu')) return;
                if (printAfter) {
                    const c = popup.querySelector('.swal2-confirm, button.swal2-confirm');
                    if (c) c.click();
                    return;
                }
                const deny = popup.querySelector('.swal2-deny');
                if (deny) { deny.click(); return; }
                const buttons = [...popup.querySelectorAll('button')];
                const simpanSaja = buttons.find(b => (b.innerText || '').toLowerCase().includes('simpan saja'));
                if (simpanSaja) { simpanSaja.click(); return; }
                const confirm = popup.querySelector('.swal2-confirm');
                if (confirm) confirm.click();
            };
            const orig = window.Swal.fire.bind(window.Swal);
            window.Swal.fire = function() {
                const result = orig.apply(this, arguments);
                setTimeout(clickPopup, 400);
                setTimeout(clickPopup, 1200);
                setTimeout(clickPopup, 2500);
                return result;
            };
            window.__swalClickInterval = setInterval(clickPopup, 900);
            setTimeout(() => clearInterval(window.__swalClickInterval), 180000);
        }""",
        print_after,
    )


def _progress_heartbeat(
    on_progress: ProgressCallback | None,
    elapsed_ms: int,
    *,
    base_percent: int,
    message: str,
    last_tick: dict[str, int],
) -> None:
    if not on_progress:
        return
    tick = elapsed_ms // 5000
    if tick == last_tick.get("v"):
        return
    last_tick["v"] = tick
    secs = elapsed_ms // 1000
    pct = min(94, base_percent + elapsed_ms // 12000)
    on_progress(pct, f"{message} ({secs} detik)")


def _wait_for_store_post(
    page: Page,
    *,
    timeout_ms: int = 150000,
    print_after: bool = False,
    on_progress: ProgressCallback | None = None,
    progress_message: str = "Menunggu respons simpan Superman",
    base_percent: int = 89,
) -> dict | list | str | None:
    captured: dict[str, object | None] = {"resp": None}

    def _on_response(resp) -> None:
        if _is_store_post_response(resp):
            captured["resp"] = resp

    page.on("response", _on_response)
    elapsed = 0
    step = 500
    last_tick: dict[str, int] = {"v": -1}
    try:
        while elapsed <= timeout_ms:
            if captured["resp"] is not None:
                return _parse_store_response(captured["resp"])

            try:
                _handle_swal_popup(page, print_after=print_after)
            except RuntimeError:
                raise

            _progress_heartbeat(
                on_progress,
                elapsed,
                base_percent=base_percent,
                message=progress_message,
                last_tick=last_tick,
            )

            page.wait_for_timeout(step)
            elapsed += step
        return None
    finally:
        page.remove_listener("response", _on_response)


def _recover_form_before_retry(page: Page) -> None:
    try:
        for sel in (".swal2-cancel", ".swal2-close", "button:has-text('Tutup')"):
            btn = page.locator(sel)
            if btn.count():
                btn.first.click(timeout=1500)
                page.wait_for_timeout(400)
                break
    except Exception:
        pass
    for tab in ('a[href="#tab-informasi-sppn"]', 'a[href="#tab-isi-sppn"]', 'a[href="#tab-informasi-sppb"]'):
        try:
            page.locator(tab).click(force=True, timeout=2000)
            page.wait_for_timeout(400)
            break
        except Exception:
            continue


def _trigger_simpan_via_js(
    page: Page,
    *,
    print_after: bool = False,
    skip_validate: bool = False,
) -> dict[str, object]:
    status_val = "1" if print_after else "0"
    return page.evaluate(
        """([statusVal, skipValidate]) => {
            const btn = document.querySelector('#simpan');
            if (!btn) return { ok: false, reason: 'tombol #simpan tidak ada' };
            const status = document.getElementById('status_btn');
            if (status) status.value = statusVal;
            if (typeof simpan_spp === 'function') {
                try {
                    simpan_spp();
                    return { ok: true, method: 'simpan_spp', disabled: !!btn.disabled };
                } catch (err) {
                    return { ok: false, reason: err?.message || 'simpan_spp error', disabled: !!btn.disabled };
                }
            }
            btn.click();
            return { ok: true, method: 'btn.click', disabled: !!btn.disabled };
        }""",
        [status_val, skip_validate],
    )


def _trigger_simpan_via_playwright(
    page: Page,
    *,
    print_after: bool = False,
) -> dict[str, object]:
    status_val = "1" if print_after else "0"
    page.evaluate(
        """(statusVal) => {
            const status = document.getElementById('status_btn');
            if (status) status.value = statusVal;
        }""",
        status_val,
    )
    btn = page.locator("#simpan, button:has-text('Simpan')").first
    if btn.count() == 0:
        return {"ok": False, "reason": "tombol #simpan tidak ada"}
    disabled = btn.is_disabled()
    if disabled:
        return {"ok": False, "reason": "tombol #simpan disabled", "disabled": True}
    btn.scroll_into_view_if_needed(timeout=3000)
    btn.click(force=True, timeout=10000, no_wait_after=True)
    return {"ok": True, "method": "playwright_click", "disabled": False}


def _trigger_form_submit(
    page: Page,
    *,
    print_after: bool = False,
    skip_validate: bool = False,
) -> None:
    status_val = "1" if print_after else "0"
    page.evaluate(
        """([statusVal, skipValidate]) => {
            const fakeEvent = { preventDefault() {} };
            if (!skipValidate && typeof validateForm === 'function' && !validateForm(fakeEvent)) {
                throw new Error('validateForm gagal');
            }
            const status = document.getElementById('status_btn');
            if (status) status.value = statusVal;
            if (typeof simpan_spp === 'function') {
                simpan_spp();
                return;
            }
            const form = document.getElementById('form_spp');
            if (form) form.submit();
        }""",
        [status_val, skip_validate],
    )


_URUTAN_CHECK_TIMEOUT_MS = 90_000


def _submit_and_wait_store(
    page: Page,
    *,
    print_after: bool = False,
    on_progress: ProgressCallback | None = None,
    timeout_ms: int = 60000,
    progress_message: str,
    base_percent: int,
    use_simpan_click: bool = False,
    simpan=None,
    skip_validate: bool = False,
    store_debug: dict[str, object] | None = None,
) -> dict | list | str | None:
    captured: dict[str, object | None] = {"resp": None}
    seen_posts: list[str] = []
    last_swal = ""
    dialog_msgs: list[str] = []

    def _on_dialog(dialog) -> None:
        try:
            dialog_msgs.append(dialog.message[:300])
        except Exception:
            pass
        try:
            dialog.accept()
        except Exception:
            pass

    def _on_response(resp) -> None:
        if resp.request.method == "POST":
            seen_posts.append(resp.url)
            if len(seen_posts) > 40:
                del seen_posts[:-40]
        if _is_store_post_response(resp):
            captured["resp"] = resp

    page.on("dialog", _on_dialog)
    page.on("response", _on_response)
    try:
        trigger = _trigger_simpan_via_playwright(page, print_after=print_after)
        if store_debug is not None:
            store_debug["trigger"] = trigger
        if not trigger.get("ok"):
            trigger = _trigger_simpan_via_js(
                page,
                print_after=print_after,
                skip_validate=True,
            )
            if store_debug is not None:
                store_debug["trigger_fallback"] = trigger
        if not trigger.get("ok"):
            raise RuntimeError(
                f"Gagal memicu simpan Superman: {trigger.get('reason') or trigger}"
            )

        elapsed = 0
        step = 500
        last_tick: dict[str, int] = {"v": -1}
        loading_seen = False
        loading_since: int | None = None
        while elapsed <= timeout_ms:
            if captured["resp"] is not None:
                return _parse_store_response(captured["resp"])
            swal_now = _swal_text(page)
            if swal_now:
                last_swal = swal_now[:500]
            if _swal_is_loading(page):
                loading_seen = True
                if loading_since is None:
                    loading_since = elapsed
                elif elapsed - loading_since >= _URUTAN_CHECK_TIMEOUT_MS:
                    if store_debug is not None:
                        store_debug["last_swal"] = last_swal
                        store_debug["loading_seen"] = True
                        store_debug["urutan_check_timeout"] = True
                    raise RuntimeError(
                        "Superman tidak merespons pengecekan urutan nomor dalam "
                        f"{_URUTAN_CHECK_TIMEOUT_MS // 1000} detik (normalnya selesai < 1 menit). "
                        "Ini biasanya menandakan gangguan di sisi Superman — coba deklarasi ulang "
                        "beberapa saat lagi atau cek manual di portal Superman."
                    )
            else:
                loading_since = None
                if loading_seen:
                    swal_now_lower = (swal_now or "").lower()
                    if "simpan saja" in swal_now_lower or "info urutan" in swal_now_lower:
                        _trigger_store_after_urutan(page)
                    else:
                        _click_swal_action(page, print_after=print_after)
            try:
                _handle_swal_popup(page, print_after=print_after)
            except RuntimeError:
                raise
            _progress_heartbeat(
                on_progress,
                elapsed,
                base_percent=base_percent,
                message=progress_message,
                last_tick=last_tick,
            )
            if "chrome-error://" in (page.url or ""):
                if store_debug is not None:
                    store_debug["chrome_error_seen"] = True
                try:
                    page.go_back(wait_until="domcontentloaded", timeout=8000)
                except Exception:
                    pass
            elif (
                loading_seen
                and captured["resp"] is None
                and "simpan saja" in (swal_now or "").lower()
                and elapsed > 5000
                and elapsed % 10000 < step
            ):
                _trigger_store_after_urutan(page)
            page.wait_for_timeout(step)
            elapsed += step
        if store_debug is not None:
            store_debug["seen_post_urls"] = seen_posts[-20:]
            store_debug["last_swal"] = last_swal
            store_debug["loading_seen"] = loading_seen
            store_debug["page_url"] = page.url
            store_debug["dialog_msgs"] = dialog_msgs[-5:]
            if captured["resp"] is None and loading_seen:
                fetch_body = _post_store_via_fetch(page)
                store_debug["fetch_store_attempt"] = fetch_body
                if fetch_body is not None and (
                    fetch_body.get("success") is not False
                    if isinstance(fetch_body, dict)
                    else True
                ):
                    return fetch_body
        return None
    finally:
        page.remove_listener("response", _on_response)
        page.remove_listener("dialog", _on_dialog)


def submit_sppn_draft(
    page: Page,
    *,
    print_after: bool = False,
    on_progress: ProgressCallback | None = None,
    combined_form: bool = False,
    store_debug: dict[str, object] | None = None,
) -> dict | list | str | None:
    def report(percent: int, stage: str) -> None:
        if on_progress:
            on_progress(percent, stage)

    report(88, "Menyiapkan simpan draft")

    sppn_files = _count_uploaded_docs(page, "#dokumen_pendukung_sppn")
    if sppn_files == 0:
        raise RuntimeError(
            "Dokumen pendukung SPPn tidak terlampir di form Superman sebelum simpan. "
            "Coba upload ulang dokumen di Input Pembayaran."
        )
    if combined_form and page.locator("#dokumen_pendukung_sppb").count():
        sppb_files = _count_uploaded_docs(page, "#dokumen_pendukung_sppb")
        if sppb_files == 0:
            raise RuntimeError(
                "Dokumen pendukung SPPb tidak terlampir di form Superman sebelum simpan. "
                "Coba upload ulang dokumen di Input Pembayaran."
            )

    simpan = page.locator("#simpan, button:has-text('Simpan')").first
    simpan.wait_for(state="visible", timeout=10000)
    page.wait_for_function(
        "() => { const b = document.querySelector('#simpan'); return b && !b.disabled; }",
        timeout=30000,
    )
    _install_swal_auto_confirm(page, print_after=print_after)
    page.evaluate(
        """() => {
            const form = document.getElementById('form_spp');
            if (!form || form.__submitGuard) return;
            form.__submitGuard = true;
            form.addEventListener('submit', (event) => {
                event.preventDefault();
                event.stopPropagation();
            }, true);
        }"""
    )

    store_timeout_ms = 420_000 if combined_form else 180_000
    store_body: dict | list | str | None = None
    debug: dict[str, object] = store_debug if store_debug is not None else {}
    wait_msg = (
        "Menunggu urutan & respons simpan Superman"
        if combined_form
        else "Menunggu respons simpan Superman"
    )

    debug["form_before_save"] = _prepare_form_before_save(page, combined_form=combined_form)

    report(89, "Mengirim draft ke Superman")
    try:
        store_body = _submit_and_wait_store(
            page,
            print_after=print_after,
            on_progress=on_progress,
            timeout_ms=store_timeout_ms,
            progress_message=wait_msg,
            base_percent=89,
            use_simpan_click=True,
            store_debug=debug,
        )
    except RuntimeError:
        raise

    if store_body is None:
        has_simpan = bool(
            page.evaluate("() => !!document.querySelector('#simpan')")
        )
        debug["page_url_before_retry"] = page.url
        if not has_simpan:
            debug["retry_skipped"] = "tombol #simpan tidak ada — lanjut cek To Do"
            logger.warning(
                "Lewati retry simpan: #simpan tidak ada di %s",
                page.url,
            )
        else:
            report(90, "Mencoba ulang simpan draft")
            _recover_form_before_retry(page)
            retry_timeout_ms = store_timeout_ms if combined_form else 60_000
            retry_msg = (
                "Menunggu dialog simpan Superman (percobaan 2)"
                if combined_form
                else "Menunggu dialog simpan Superman"
            )
            try:
                store_body = _submit_and_wait_store(
                    page,
                    print_after=print_after,
                    on_progress=on_progress,
                    timeout_ms=retry_timeout_ms,
                    progress_message=retry_msg,
                    base_percent=90,
                    use_simpan_click=True,
                    skip_validate=True,
                    store_debug=debug,
                )
            except RuntimeError as exc:
                debug["retry_error"] = str(exc)
                logger.warning("Retry simpan draft gagal (%s)", exc)
            except Exception as exc:
                debug["retry_error"] = str(exc)
                logger.warning("Retry simpan draft gagal (%s)", exc)

    try:
        page.wait_for_load_state("domcontentloaded", timeout=15000)
    except Exception:
        pass

    if store_body is None:
        page_sppb, page_sppn = _extract_numbers_from_page_content(page)
        if page_sppb or page_sppn:
            store_body = {
                "success": True,
                "sppb_no": page_sppb,
                "sppn_no": page_sppn,
                "message": "Nomor diekstrak dari halaman Superman",
            }
        else:
            shot = _screenshot_debug(page, "spp_store_empty")
            logger.warning(
                "Superman tidak mengembalikan respons /spp/store — screenshot=%s",
                shot,
            )
            report(93, "Respons simpan kosong — cek To Do List")
            return None

    report(95, "Draft tersimpan — verifikasi nomor")
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