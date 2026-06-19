from __future__ import annotations

from collections.abc import Callable
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


def _fill_shared_informasi(page: Page, payload: DeklarasiPayload, cfg: SupermanConfig) -> None:
    if payload.jenis_form == "sppb_sppn":
        page.fill("#kwitansi_spp", payload.mitra_pembeli)
        page.fill("#referensi_spp", payload.referensi or "-")
        page.fill("#berita_acara_sppb", payload.ba_au58 or payload.no_do or "-")
        page.fill("#sp_opl_sppb", payload.no_kontrak or "-")
        page.fill("#sp_opl_sppn", payload.no_kontrak or "-")
        page.fill("#au58_sppn", payload.ba_au58 or payload.no_do or "-")
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

    page.fill("#kwitansi_sppn", payload.mitra_pembeli)
    page.fill("#referensi_sppn", payload.referensi or "-")
    page.fill("#au58_sppn", payload.ba_au58 or payload.no_do or "-")
    page.fill("#sp_opl_sppn", payload.no_kontrak or "-")
    page.select_option("#bagian_sppn", cfg.bagian)
    if payload.tanggal_transfer:
        _set_readonly_input(page, "#tanggal_sppn", payload.tanggal_transfer)
    page.fill("#nama_diterima_sppn_input", "tertanggu")
    page.fill("#alamat_diterima_sppn_input", "tertanggu")


def _set_ckeditor(page: Page, editor_id: str, text: str) -> None:
    page.evaluate(
        """([editorId, value]) => {
            if (window.CKEDITOR && CKEDITOR.instances[editorId]) {
                CKEDITOR.instances[editorId].setData(value);
                return;
            }
            const el = document.getElementById(editorId);
            if (el) {
                el.value = value;
                el.dispatchEvent(new Event('input', { bubbles: true }));
            }
        }""",
        [editor_id, text],
    )


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


def _upload_support_docs(page: Page, support_doc: Path, *, combined: bool) -> None:
    if combined:
        page.locator('a[href="#tab-informasi-sppb"]').click(force=True)
        page.wait_for_timeout(500)
        page.set_input_files("#dokumen_pendukung_sppb", str(support_doc))
        page.locator('a[href="#tab-informasi-sppn"]').click(force=True)
        page.wait_for_timeout(500)
        page.set_input_files("#dokumen_pendukung_sppn", str(support_doc))
    else:
        page.locator('a[href="#tab-informasi-sppn"]').click(force=True)
        page.wait_for_timeout(600)
        page.set_input_files("#dokumen_pendukung_sppn", str(support_doc))

    page.evaluate(
        """() => {
            ['#dokumen_pendukung_sppb', '#dokumen_pendukung_sppn'].forEach((sel) => {
                const input = document.querySelector(sel);
                if (!input) return;
                input.dispatchEvent(new Event('change', { bubbles: true }));
            });
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
    support_doc: Path | None = None,
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

    if support_doc and support_doc.exists():
        report(45, "Mengunggah dokumen pendukung")
        _upload_support_docs(page, support_doc, combined=combined)

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
    page.evaluate("() => { if (typeof bandingkan_dpp_sisa === 'function') bandingkan_dpp_sisa(); }")
    page.wait_for_timeout(500)


def _swal_visible(page: Page):
    return page.locator(".swal2-popup.swal2-show, .swal2-popup:visible").first


def _dismiss_swal_dialogs(page: Page, *, print_after: bool = False) -> None:
    for _ in range(12):
        popup = _swal_visible(page)
        try:
            popup.wait_for(state="visible", timeout=5000)
        except Exception:
            return

        text = popup.inner_text()
        lower = text.lower()
        if "belum terisi" in lower:
            raise RuntimeError(f"Validasi Superman gagal: {text.strip()}")

        if popup.locator(".swal2-loading").count():
            page.wait_for_timeout(800)
            continue

        if "anomali" in lower or "menyimpan dan mencetak" in lower or "simpan saja" in lower:
            if print_after:
                popup.locator(".swal2-confirm, button:has-text('Simpan dan Cetak')").first.click()
            else:
                deny = popup.locator(".swal2-deny, button:has-text('Simpan Saja')")
                if deny.count():
                    deny.first.click()
                else:
                    popup.locator(".swal2-confirm").first.click()
        else:
            confirm = popup.locator(".swal2-confirm")
            if confirm.count():
                confirm.first.click()
            else:
                return
        page.wait_for_timeout(1000)


def submit_sppn_draft(
    page: Page,
    *,
    print_after: bool = False,
    on_progress: ProgressCallback | None = None,
) -> dict | list | str | None:
    if on_progress:
        on_progress(88, "Menyimpan draft ke Superman")
    simpan = page.locator("#simpan, button:has-text('Simpan')").first
    simpan.wait_for(state="visible", timeout=10000)
    page.wait_for_function(
        "() => { const b = document.querySelector('#simpan'); return b && !b.disabled; }",
        timeout=30000,
    )

    store_body: dict | list | str | None = None
    with page.expect_response(
        lambda resp: "/spp/store" in resp.url and resp.request.method == "POST",
        timeout=120000,
    ) as resp_info:
        simpan.click()
        _dismiss_swal_dialogs(page, print_after=print_after)
        try:
            store_body = resp_info.value.json()
        except Exception:
            try:
                store_body = resp_info.value.text()
            except Exception:
                store_body = None

    page.wait_for_load_state("networkidle", timeout=120000)
    return store_body


def pause_for_review(page: Page, message: str) -> None:
    print(message)
    if not page.context.browser:
        return
    try:
        input("Tekan Enter setelah cek form / upload dokumen ... ")
    except EOFError:
        page.wait_for_timeout(30000)