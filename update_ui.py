import re

with open('templates/index.html', 'r', encoding='utf-8') as f:
    html = f.read()

# Replace Invoice Grid
new_invoice_form = '''                        <div class="grid grid-cols-1 lg:grid-cols-2 gap-6">
                            <!-- Kolom 1 -->
                            <div class="space-y-3">
                                <h3 class="text-xs font-semibold text-brand-600 uppercase tracking-wider mb-2">Data Dokumen</h3>
                                
                                <div class="relative">
                                    <label class="block text-xs font-medium text-slate-700 mb-1">Pilih No Kontrak *</label>
                                    <select id="i_no_kontrak" required class="form-input border-brand-300 focus:border-brand-500 focus:ring-brand-500" onchange="fetchKontrakForInvoice()">
                                        <option value="">-- Pilih Kontrak --</option>
                                    </select>
                                    <p class="text-xs text-slate-400 mt-1">Pilih kontrak untuk load data referensi.</p>
                                </div>
                                
                                <div>
                                    <label class="block text-xs font-medium text-slate-700 mb-1">No Invoice *</label>
                                    <input type="text" id="i_no_invoice" required class="form-input" placeholder="INV-2026-0001">
                                </div>
                                
                                <div class="grid grid-cols-2 gap-2">
                                    <div>
                                        <label class="block text-xs font-medium text-slate-700 mb-1">Tgl Transaksi *</label>
                                        <input type="date" id="i_tanggal_transaksi" required class="form-input">
                                    </div>
                                    <div>
                                        <label class="block text-xs font-medium text-slate-700 mb-1">PPh 22 (%)</label>
                                        <input type="text" inputmode="decimal" id="i_pph_22" class="form-input" value="0">
                                    </div>
                                </div>
                            </div>
                            
                            <!-- Kolom 2: Summary -->
                            <div class="space-y-3">
                                <h3 class="text-xs font-semibold text-brand-600 uppercase tracking-wider mb-2">Data Riwayat Kontrak</h3>
                                <div class="bg-brand-50 rounded-lg p-4 border border-brand-100 space-y-1.5">
                                    <div class="flex justify-between text-xs"><span class="text-slate-600">Pembeli:</span><span class="font-medium text-slate-800 text-right" id="i_lbl_pembeli">-</span></div>
                                    <div class="flex justify-between text-xs"><span class="text-slate-600">Komoditi:</span><span class="font-medium text-slate-800 text-right" id="i_lbl_komoditi">-</span></div>
                                    <div class="flex justify-between text-xs"><span class="text-slate-600">Vol/Harga:</span><span class="font-medium text-slate-800 text-right" id="i_lbl_vol_harga">-</span></div>
                                    <div class="flex justify-between text-xs"><span class="text-slate-600">Ketentuan:</span><span class="font-medium text-slate-800 text-right" id="i_lbl_ketentuan">-</span></div>
                                    <div class="flex justify-between text-xs"><span class="text-slate-600">Nilai Transaksi:</span><span class="font-medium text-slate-800 text-right" id="i_lbl_nilai">-</span></div>
                                    <div class="flex justify-between text-xs"><span class="text-slate-600">PPN:</span><span class="font-medium text-slate-800 text-right" id="i_lbl_ppn">-</span></div>
                                    
                                    <div class="flex justify-between text-xs mt-3 pt-3 border-t border-brand-200">
                                        <span class="text-slate-700 font-bold uppercase tracking-wide">Estimasi Pembayaran:</span>
                                        <span class="font-bold text-brand-700 text-sm" id="i_lbl_total">Rp 0</span>
                                    </div>
                                </div>
                            </div>
                        </div>'''

html = re.sub(
    r'<div class="grid grid-cols-1 md:grid-cols-2 gap-8">.*?<div class="mt-6 pt-4 border-t border-slate-100 flex justify-end gap-3">',
    new_invoice_form + '\n                        <div class="mt-6 pt-4 border-t border-slate-100 flex justify-end gap-3">',
    html,
    flags=re.DOTALL
)

# Replace DO Grid
new_do_form = '''                        <div class="grid grid-cols-1 lg:grid-cols-2 gap-6">
                            <!-- Kolom 1 -->
                            <div class="space-y-3">
                                <h3 class="text-xs font-semibold text-purple-600 uppercase tracking-wider mb-2">Data Dokumen DO</h3>
                                
                                <div class="relative">
                                    <label class="block text-xs font-medium text-purple-700 mb-1">Pilih No Invoice *</label>
                                    <select id="d_no_invoice" required class="form-input border-purple-300 focus:border-purple-500 focus:ring-purple-500" onchange="fetchInvoiceForDO()">
                                        <option value="">-- Pilih Invoice --</option>
                                    </select>
                                    <p class="text-xs text-slate-400 mt-1">Pilih invoice untuk load data referensi.</p>
                                </div>
                                
                                <div class="grid grid-cols-2 gap-2">
                                    <div>
                                        <label class="block text-xs font-medium text-slate-700 mb-1">No Delivery Order *</label>
                                        <input type="text" id="d_no_do" required class="form-input" placeholder="DO-2026-0001">
                                    </div>
                                    <div>
                                        <label class="block text-xs font-medium text-slate-700 mb-1">Tanggal DO *</label>
                                        <input type="date" id="d_tanggal_do" required class="form-input">
                                    </div>
                                </div>
                                
                                <div>
                                    <label class="block text-xs font-medium text-slate-700 mb-1">Kepada Unit</label>
                                    <input type="text" id="d_kepada_unit" class="form-input" placeholder="Kebun Pabrik Kelapa Sawit">
                                </div>
                                
                                <div class="grid grid-cols-2 gap-2">
                                    <div>
                                        <label class="block text-xs font-medium text-slate-700 mb-1">Tgl Pembayaran Invoice</label>
                                        <input type="date" id="d_tanggal_pembayaran" class="form-input">
                                    </div>
                                    <div>
                                        <label class="block text-xs font-medium text-slate-700 mb-1">Nominal Transfer (Rp)</label>
                                        <input type="text" inputmode="decimal" id="d_nominal_transfer" class="form-input" value="0">
                                    </div>
                                </div>
                            </div>
                            
                            <!-- Kolom 2: Summary -->
                            <div class="space-y-3">
                                <h3 class="text-xs font-semibold text-purple-600 uppercase tracking-wider mb-2">Riwayat Terkait</h3>
                                <div class="bg-purple-50 rounded-lg p-4 border border-purple-100 space-y-1.5">
                                    <div class="flex justify-between text-xs"><span class="text-slate-600">No Kontrak:</span><span class="font-medium text-slate-800 text-right" id="d_lbl_kontrak">-</span></div>
                                    <div class="flex justify-between text-xs"><span class="text-slate-600">Barang/Vol:</span><span class="font-medium text-slate-800 text-right" id="d_lbl_barang">-</span></div>
                                    <div class="flex justify-between text-xs"><span class="text-slate-600">Levering:</span><span class="font-medium text-slate-800 text-right" id="d_lbl_levering">-</span></div>
                                    <div class="flex justify-between text-xs"><span class="text-slate-600">Tgl Invoice:</span><span class="font-medium text-slate-800 text-right" id="d_lbl_tgl">-</span></div>
                                    
                                    <div class="flex justify-between text-xs mt-3 pt-3 border-t border-purple-200">
                                        <span class="text-slate-700 font-bold uppercase tracking-wide">Jumlah Tagihan (Sisa):</span>
                                        <span class="font-bold text-purple-700 text-sm" id="d_lbl_tagihan">Rp 0</span>
                                    </div>
                                </div>
                            </div>
                        </div>'''

html = re.sub(
    r'<div class="grid grid-cols-1 md:grid-cols-2 gap-8">.*?<div class="mt-6 pt-4 border-t border-slate-100 flex justify-end gap-3">',
    new_do_form + '\n                        <div class="mt-6 pt-4 border-t border-slate-100 flex justify-end gap-3">',
    html,
    flags=re.DOTALL
)

with open('templates/index.html', 'w', encoding='utf-8') as f:
    f.write(html)
