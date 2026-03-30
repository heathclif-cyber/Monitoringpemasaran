import os

file_path = "services/generator_word.py"
with open(file_path, "r", encoding="utf-8") as f:
    lines = f.readlines()

new_content = []
for line in lines:
    if line.startswith("def generate_do_docx"):
        break
    new_content.append(line)

new_func = """def generate_do_docx(do) -> io.BytesIO:
    doc = Document()
    sec = doc.sections[0]
    sec.left_margin   = Cm(1.5)
    sec.right_margin  = Cm(1.5)
    sec.top_margin    = Cm(1.5)
    sec.bottom_margin = Cm(1.5)

    inv = do.invoice
    k   = inv.kontrak

    # Create ONE giant table for the entire Delivery Order
    tbl = doc.add_table(rows=7, cols=7)
    tbl.style = 'Table Grid'
    
    # 7 columns with precise widths totaling 18.0 cm
    CW7 = [3.5, 3.0, 2.5, 1.5, 3.5, 2.0, 2.0]
    
    # helper functions
    def _cw(cell, cm):
        tc = cell._tc
        pr = tc.get_or_add_tcPr()
        old = pr.find(qn('w:tcW'))
        if old is not None: pr.remove(old)
        w = OxmlElement('w:tcW')
        w.set(qn('w:w'), str(int(cm * 567)))
        w.set(qn('w:type'), 'dxa')
        pr.append(w)

    def _p0(cell, align=WD_ALIGN_PARAGRAPH.LEFT):
        cell.text = "" 
        p = cell.paragraphs[0]
        p.alignment = align
        p.paragraph_format.space_after = Pt(0)
        p.paragraph_format.space_before = Pt(0)
        return p

    def _va(cell, val='center'):
        tc = cell._tc; pr = tc.get_or_add_tcPr()
        v = pr.find(qn('w:vAlign'))
        if v is None: v = OxmlElement('w:vAlign'); pr.append(v)
        v.set(qn('w:val'), val)

    # Force widths on all cells before merging
    for row in tbl.rows:
        for i, c in enumerate(row.cells):
            _cw(c, CW7[i])
            
    # --- MERGES ---
    tbl.cell(0,0).merge(tbl.cell(1,3))  # Row 0 & 1: Header (Company)
    tbl.cell(0,4).merge(tbl.cell(1,4))  # Row 0 & 1: Header (DELIVERY ORDER)
    tbl.cell(0,5).merge(tbl.cell(0,6))  # Row 0: No.
    tbl.cell(1,5).merge(tbl.cell(1,6))  # Row 1: Tanggal
    tbl.cell(2,0).merge(tbl.cell(2,6))  # Row 2: Kepada / Alamat
    tbl.cell(3,0).merge(tbl.cell(3,6))  # Row 3: INFO
    tbl.cell(6,0).merge(tbl.cell(6,6))  # Row 6: Catatan

    c_comp = tbl.cell(0,0)
    c_do   = tbl.cell(0,4)
    c_no   = tbl.cell(0,5)
    c_tgl  = tbl.cell(1,5)
    c_addr = tbl.cell(2,0)
    c_info = tbl.cell(3,0)
    c_cat  = tbl.cell(6,0)

    # 1. Company
    p_comp = _p0(c_comp, WD_ALIGN_PARAGRAPH.CENTER)
    _va(c_comp, 'center')
    _run(p_comp, 'PT PERKEBUNAN NUSANTARA I\\n', bold=True, size=11)
    _run(p_comp, 'REGIONAL 8\\n', bold=True, size=11)
    _run(p_comp, 'Jalan Urip Sumoharjo No 72-76, Kota Makassar', size=10)

    # 2. "DELIVERY ORDER"
    p_do = _p0(c_do, WD_ALIGN_PARAGRAPH.CENTER)
    _va(c_do, 'center')
    _run(p_do, 'DELIVERY ORDER', bold=True, size=11)

    # 3. No.
    p_no = _p0(c_no, WD_ALIGN_PARAGRAPH.LEFT)
    p_no.paragraph_format.left_indent = Pt(6)
    p_no.paragraph_format.space_before = Pt(3)
    _va(c_no, 'top')
    _run(p_no, 'No.\\n', bold=True, size=10)
    _run(p_no, _s(do.no_do), size=10)

    # 4. Tanggal
    p_tgl = _p0(c_tgl, WD_ALIGN_PARAGRAPH.LEFT)
    p_tgl.paragraph_format.left_indent = Pt(6)
    p_tgl.paragraph_format.space_before = Pt(3)
    _va(c_tgl, 'top')
    _run(p_tgl, 'Tanggal\\n', bold=True, size=10)
    d = do.tanggal_do
    tgl_str = f"{d.day}/{d.month}/{d.year}" if d else '-'
    _run(p_tgl, tgl_str, size=10)

    # 5. Kepada & Alamat Unit
    p_addr = _p0(c_addr, WD_ALIGN_PARAGRAPH.LEFT)
    p_addr.paragraph_format.left_indent = Pt(3)
    p_addr.paragraph_format.space_before = Pt(3)
    p_addr.paragraph_format.space_after = Pt(3)
    _va(c_addr, 'center')
    p_addr.paragraph_format.tab_stops.add_tab_stop(Cm(2.2))
    _run(p_addr, f"Kepada\\t: Manajer Unit {_s(do.kepada_unit)}\\n", size=10)
    _run(p_addr, f"Alamat\\t: {_s(do.alamat_unit)}", size=10)

    # 6. Atas penyerahan...
    p_info = _p0(c_info, WD_ALIGN_PARAGRAPH.LEFT)
    p_info.paragraph_format.left_indent = Pt(3)
    p_info.paragraph_format.space_before = Pt(3)
    p_info.paragraph_format.space_after = Pt(3)
    _va(c_info, 'top')
    p_info.paragraph_format.tab_stops.add_tab_stop(Cm(2.2))
    p_info.paragraph_format.tab_stops.add_tab_stop(Cm(10.0))
    _run(p_info, 'Atas penyerahan D.O. harap diserahkan barang-barang tersebut di bawah ini:\\n', size=10)
    _run(p_info, f"Kepada\\t: {_s(k.pembeli)}\\n", size=10)
    _run(p_info, f"Jenis Barang\\t: {_s(k.komoditi)}\\tTahun panen: {_s(k.tahun_panen)}", size=10)

    # 7. Header Row
    headers = ['Kebun', 'Jenis\\nProduk/Mutu', 'Banyaknya\\nBale/Karung', 'No.\\nKav./\\nChop', 'No. Kontrak', 'Berat Kotor/\\nBersih (Kg)', 'Levering']
    for i, h in enumerate(headers):
        c = tbl.cell(4, i)
        p = _p0(c, WD_ALIGN_PARAGRAPH.CENTER)
        p.paragraph_format.space_before = Pt(3)
        p.paragraph_format.space_after = Pt(3)
        _va(c, 'center')
        _run(p, h, bold=True, size=10)

    # 8. Data Row
    vol_str = '{:,.0f}'.format(k.volume or 0).replace(',', '.') if (k.volume and k.volume > 0) else '-'
    bale_str = str(int(k.banyaknya_bale_karung)) if (k.banyaknya_bale_karung and k.banyaknya_bale_karung > 0) else '-'

    data = [
        _s(k.kebun_produsen),
        _s(k.deskripsi_produk or k.komoditi),
        bale_str,
        _s(k.no_kav_chop, '-'),
        _s(k.no_kontrak),
        vol_str,
        _s(k.levering, '-')
    ]

    for i, val in enumerate(data):
        c = tbl.cell(5, i)
        _va(c, 'top')
        p = _p0(c, WD_ALIGN_PARAGRAPH.LEFT if i == 4 else WD_ALIGN_PARAGRAPH.CENTER)
        p.paragraph_format.space_before = Pt(4)
        _run(p, val, size=10)
        if i == 0:
            _run(p, '\\n\\n\\n\\n\\n\\n\\n\\n\\n\\n\\n\\n\\n\\n\\n\\n\\n\\n', size=10)

    # 9. Catatan
    p_cat = _p0(c_cat, WD_ALIGN_PARAGRAPH.LEFT)
    p_cat.paragraph_format.left_indent = Pt(3)
    p_cat.paragraph_format.space_before = Pt(3)
    _va(c_cat, 'top')
    _run(p_cat, 'CATATAN :\\n', bold=True, size=10)
    _run(p_cat, _s(k.catatan, ''), size=10)
    _run(p_cat, '\\n\\n', size=10)

    buf = io.BytesIO()
    doc.save(buf)
    buf.seek(0)
    return buf
"""

new_content.append(new_func)
with open(file_path, "w", encoding="utf-8") as f:
    f.writelines(new_content)
print("Updated successfully")
