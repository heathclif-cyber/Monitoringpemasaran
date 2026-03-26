import re

with open('static/js/app.js', 'r', encoding='utf-8') as f:
    js = f.read()

new_js = """
// ==== DYNAMIC DROPDOWNS ====
async function populateDropdowns() {
    try {
        const resK = await fetch('/api/kontrak?limit=1000');
        const kData = await resK.json();
        const selK = document.getElementById('i_no_kontrak');
        selK.innerHTML = '<option value="">-- Pilih Kontrak --</option>';
        kData.forEach(k => {
            const opt = document.createElement('option');
            opt.value = k.no_kontrak;
            opt.text = k.no_kontrak + ' - ' + (k.pembeli ? k.pembeli.split('\\n')[0] : '');
            selK.appendChild(opt);
        });
        
        const resI = await fetch('/api/invoice?limit=1000');
        const iData = await resI.json();
        const selI = document.getElementById('d_no_invoice');
        selI.innerHTML = '<option value="">-- Pilih Invoice --</option>';
        iData.forEach(i => {
            const opt = document.createElement('option');
            opt.value = i.no_invoice;
            opt.text = i.no_invoice;
            selI.appendChild(opt);
        });
    } catch(err) { console.error("Error populating dropdowns", err); }
}

// ==== PREVIEWS ====
function buildInvoicePreview() {
    const noInv = document.getElementById('i_no_invoice').value || '[No Invoice]';
    const noK = document.getElementById('i_no_kontrak').value || '[No Kontrak]';
    const tgl = document.getElementById('i_tanggal_transaksi').value || '';
    const pph = parseFloat(document.getElementById('i_pph_22').value) || 0;
    
    const pembeli = document.getElementById('i_lbl_pembeli').innerText;
    const komoditi = document.getElementById('i_lbl_komoditi').innerText;
    const volHrg = document.getElementById('i_lbl_vol_harga').innerText;
    const est = document.getElementById('i_lbl_total').innerText;

    const html = `
    <div style="padding:10px;">
        <h3 style="text-align:center; font-weight:bold; font-size:14pt; margin-bottom:10px;">INVOICE</h3>
        <p><strong>No Invoice:</strong> ${noInv}</p>
        <p><strong>No Kontrak:</strong> ${noK}</p>
        <p><strong>Tanggal:</strong> ${fmtDateLocal(tgl)}</p>
        <hr style="margin: 10px 0; border:1px solid #ddd;">
        <p><strong>Kepada:</strong> ${pembeli}</p>
        <p><strong>Barang:</strong> ${komoditi}</p>
        <p><strong>Detail:</strong> ${volHrg}</p>
        <p><strong>PPh 22:</strong> ${pph}%</p>
        <hr style="margin: 10px 0; border:1px solid #ddd;">
        <p style="text-align:right; font-size:12pt;"><strong>Total Tagihan:</strong> <span style="color:#d97706; font-weight:bold;">${est}</span></p>
    </div>
    `;
    const panel = document.getElementById('invoice-preview-panel');
    if(panel) panel.innerHTML = html;
}

function buildDOPreview() {
    const noDo = document.getElementById('d_no_do').value || '[No DO]';
    const noInv = document.getElementById('d_no_invoice').value || '[No Invoice]';
    const tgl = document.getElementById('d_tanggal_do').value || '';
    const tglBayar = document.getElementById('d_tanggal_pembayaran').value || '';
    const unit = document.getElementById('d_kepada_unit').value || '-';
    
    const kontrak = document.getElementById('d_lbl_kontrak').innerText;
    const brg = document.getElementById('d_lbl_barang').innerText;
    const sisa = document.getElementById('d_lbl_tagihan').innerText;
    const nominal = document.getElementById('d_nominal_transfer').value || 0;

    const html = `
    <div style="padding:10px;">
        <h3 style="text-align:center; font-weight:bold; font-size:14pt; margin-bottom:10px;">DELIVERY ORDER</h3>
        <p><strong>No DO:</strong> ${noDo}</p>
        <p><strong>No Invoice:</strong> ${noInv} <br><span style="font-size:9pt; color:#666;">(Kontrak: ${kontrak})</span></p>
        <p><strong>Tanggal DO:</strong> ${fmtDateLocal(tgl)}</p>
        <p><strong>Unit Tujuan:</strong> ${unit}</p>
        <hr style="margin: 10px 0; border:1px solid #ddd;">
        <p><strong>Barang:</strong> ${brg}</p>
        <p><strong>Tgl Pembayaran:</strong> ${tglBayar ? fmtDateLocal(tglBayar) : '-'}</p>
        <p><strong>Transfer Terbayar:</strong> ${fmtRpLocal(nominal)}</p>
        <p><strong>Tagihan Asal:</strong> ${sisa}</p>
        <hr style="margin: 10px 0; border:1px solid #ddd;">
        <p style="text-align:center; margin-top:30px;">( TTD Petugas )</p>
    </div>
    `;
    const panel = document.getElementById('do-preview-panel');
    if(panel) panel.innerHTML = html;
}
"""

js = js.replace('// Init\ndocument.addEventListener("DOMContentLoaded", () => {', new_js + '\n// Init\ndocument.addEventListener("DOMContentLoaded", () => {')

js = js.replace("document.getElementById('d_tanggal_do').value = today;", "document.getElementById('d_tanggal_do').value = today;\n    populateDropdowns();")

listeners = """
    const invFields = ['i_no_kontrak', 'i_no_invoice', 'i_tanggal_transaksi', 'i_pph_22'];
    invFields.forEach(id => {
        const el = document.getElementById(id);
        if(el) el.addEventListener('input', buildInvoicePreview);
        if(el) el.addEventListener('change', buildInvoicePreview);
    });
    
    const doFields = ['d_no_invoice', 'd_no_do', 'd_tanggal_do', 'd_kepada_unit', 'd_tanggal_pembayaran', 'd_nominal_transfer'];
    doFields.forEach(id => {
        const el = document.getElementById(id);
        if(el) el.addEventListener('input', buildDOPreview);
        if(el) el.addEventListener('change', buildDOPreview);
    });
"""
js = js.replace("buildLivePreview();\n    fetchDashboardData();", "buildLivePreview();\n    fetchDashboardData();\n" + listeners)

js = js.replace(
    "nominal_transfer: parseFloat(document.getElementById('d_nominal_transfer').value) || 0,",
    "nominal_transfer: parseFloat(document.getElementById('d_nominal_transfer').value) || 0,\n        tanggal_pembayaran: document.getElementById('d_tanggal_pembayaran').value || null,"
)

js = js.replace(
    "document.getElementById('i_no_invoice').value = \"INV-\" + data.no_kontrak;",
    "document.getElementById('i_no_invoice').value = \"INV-\" + data.no_kontrak;\n        buildInvoicePreview();"
)

js = js.replace(
    "document.getElementById('d_no_do').value = \"DO-\" + invoiceData.no_invoice.replace(\"INV-\", \"\");",
    "document.getElementById('d_no_do').value = \"DO-\" + invoiceData.no_invoice.replace(\"INV-\", \"\");\n        buildDOPreview();"
)

with open('static/js/app.js', 'w', encoding='utf-8') as f:
    f.write(js)
