import sys
import re

with open("templates/index.html", "r", encoding="utf-8") as f:
    html = f.read()

# Replace k_no_kontrak
html = html.replace(
    '<input type="text" id="k_no_kontrak" required class="form-input"',
    '<input type="text" id="k_no_kontrak" list="kontrak-list" required class="form-input" onchange="autoLoadKontrak()" autocomplete="off"'
)
html = html.replace(
    '<p class="text-xs text-slate-400 mt-1">Masukkan ID unik</p>',
    '<p class="text-xs text-slate-400 mt-1">Masukkan ID unik kontrak baru atau pilih untuk edit</p>\n<datalist id="kontrak-list"></datalist>'
)

# And for invoice: i_no_invoice
html = html.replace(
    '<input type="text" id="i_no_invoice" required class="form-input"',
    '<input type="text" id="i_no_invoice" list="invoice-list" required class="form-input" onchange="autoLoadInvoice()" autocomplete="off"'
)
# Add datalist
html = html.replace(
    '<input type="text" id="i_no_invoice" list="invoice-list" required class="form-input" onchange="autoLoadInvoice()" autocomplete="off" placeholder="INV-2026-0001">\n                                </div>',
    '<input type="text" id="i_no_invoice" list="invoice-list" required class="form-input" onchange="autoLoadInvoice()" autocomplete="off" placeholder="INV-2026-0001">\n<datalist id="invoice-list"></datalist>\n                                </div>'
)

# And for DO: d_no_do
html = html.replace(
    '<input type="text" id="d_no_do" required class="form-input"',
    '<input type="text" id="d_no_do" list="do-list" required class="form-input" onchange="autoLoadDO()" autocomplete="off"'
)
# Add datalist
html = html.replace(
    '<input type="text" id="d_no_do" list="do-list" required class="form-input" onchange="autoLoadDO()" autocomplete="off" placeholder="DO-2026-0001">\n                                    </div>',
    '<input type="text" id="d_no_do" list="do-list" required class="form-input" onchange="autoLoadDO()" autocomplete="off" placeholder="DO-2026-0001">\n<datalist id="do-list"></datalist>\n                                    </div>'
)

with open("templates/index.html", "w", encoding="utf-8") as f:
    f.write(html)

with open("static/js/app.js", "r", encoding="utf-8") as f:
    app_js = f.read()

app_js = app_js.replace("selK.innerHTML = '<option value=\"\">-- Pilih Kontrak --</option>';", "selK.innerHTML = '<option value=\"\">-- Pilih Kontrak --</option>';\n        document.getElementById('kontrak-list').innerHTML = '';")

app_js = app_js.replace(
    "selK.appendChild(opt);\n        });",
    "selK.appendChild(opt);\n            const optD = document.createElement('option'); optD.value = k.no_kontrak; document.getElementById('kontrak-list').appendChild(optD);\n        });"
)

app_js = app_js.replace("selI.innerHTML = '<option value=\"\">-- Pilih Invoice --</option>';", "selI.innerHTML = '<option value=\"\">-- Pilih Invoice --</option>';\n        document.getElementById('invoice-list').innerHTML = '';")

app_js = app_js.replace(
    "selI.appendChild(opt);\n        });",
    "selI.appendChild(opt);\n            const optD = document.createElement('option'); optD.value = i.no_invoice; document.getElementById('invoice-list').appendChild(optD);\n        });\n        // Additional fetch for DOs\n        const resD = await fetch('/api/do?limit=1000');\n        const dData = await resD.json();\n        document.getElementById('do-list').innerHTML = '';\n        dData.forEach(d => { const opt = document.createElement('option'); opt.value = d.no_do; document.getElementById('do-list').appendChild(opt); });"
)

# Add auto load functions
# autoLoadKontrak -> fetch /api/kontrak/xxx
# autoLoadInvoice -> fetch /api/invoice/xxx
# autoLoadDO -> fetch /api/do/xxx

autoload_code = """
// ==== AUTO LOAD UNTUK EDIT ====
async function autoLoadKontrak() {
    const no = document.getElementById('k_no_kontrak').value;
    if(!no) return;
    try {
        const res = await fetch('/api/kontrak/' + encodeURIComponent(no));
        if(!res.ok) return; // not found, means creating new
        const data = await res.json();
        
        // Populate fields
        const fields = ['tanggal_kontrak','lokasi','pemilik_komoditas','penjual','pembeli','nama_direktur','alamat_pembeli','komoditi','jenis_komoditi','deskripsi_produk','tahun_panen','kebun_produsen','volume','satuan','harga_satuan','ppn_persen','premi','mutu','packaging','simbol','chop','pack_qty','banyak_bale','kondisi_penyerahan','waktu_penyerahan','levering','pelabuhan_muat','lama_pembayaran_hari','penyerahan_hari','pembayaran_metode','pembayaran_cara','pembayaran_bank'];
        fields.forEach(f => {
            const el = document.getElementById('k_' + f);
            if(el && data[f] !== undefined) el.value = data[f];
        });
        showToast("Mode Edit: Data kontrak " + no + " berhasil dimuat.", "info");
        buildLivePreview();
        calculateKontrakPreview();
    } catch(e) {}
}

async function autoLoadInvoice() {
    const no = document.getElementById('i_no_invoice').value;
    if(!no) return;
    try {
        const res = await fetch('/api/invoice/' + encodeURIComponent(no));
        if(!res.ok) return;
        const data = await res.json();
        
        document.getElementById('i_no_kontrak').value = data.no_kontrak;
        document.getElementById('i_tanggal_transaksi').value = data.tanggal_transaksi;
        document.getElementById('i_pph_22').value = data.pph_22_persen;
        
        await fetchKontrakForInvoice();
        showToast("Mode Edit: Data invoice " + no + " berhasil dimuat.", "info");
    } catch(e) {}
}

async function autoLoadDO() {
    const no = document.getElementById('d_no_do').value;
    if(!no) return;
    try {
        const res = await fetch('/api/do/' + encodeURIComponent(no));
        if(!res.ok) return;
        const data = await res.json();
        
        document.getElementById('d_no_invoice').value = data.no_invoice;
        document.getElementById('d_tanggal_do').value = data.tanggal_do;
        document.getElementById('d_kepada_unit').value = data.kepada_unit;
        document.getElementById('d_tanggal_pembayaran').value = data.tanggal_pembayaran;
        document.getElementById('d_nominal_transfer').value = data.nominal_transfer;
        
        await fetchInvoiceForDO();
        showToast("Mode Edit: Data DO " + no + " berhasil dimuat.", "info");
    } catch(e) {}
}
"""

app_js = app_js.replace("// ==== DASHBOARD ====", autoload_code + "\n// ==== DASHBOARD ====")

with open("static/js/app.js", "w", encoding="utf-8") as f:
    f.write(app_js)

