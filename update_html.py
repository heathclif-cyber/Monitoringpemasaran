import re

with open('templates/index.html', 'r', encoding='utf-8') as f:
    html = f.read()

# Replace invoice-form layout
html = html.replace(
    '<section id=\"invoice-form\" class=\"page-section max-w-4xl mx-auto\">\n                <div class=\"glass-panel p-8\">',
    '<section id=\"invoice-form\" class=\"page-section max-w-full mx-auto\">\n                <div class=\"flex gap-6 items-start\">\n                    <div class=\"flex-1 glass-panel p-6 min-w-0\">'
)

# replace the invoice search with select
html = re.sub(
    r'<input type=\"text\" id=\"i_no_kontrak\".*?<button type=\"button\" onclick=\"fetchKontrakForInvoice\(\)\".*?</div>\s*<p class=\"text-xs text-slate-400 mt-1\".*?</p>',
    '''<select id=\"i_no_kontrak\" required class=\"form-input border-brand-300 focus:border-brand-500 focus:ring-brand-500\" onchange=\"fetchKontrakForInvoice(); buildInvoicePreview();\">
                                        <option value=\"\">-- Pilih Kontrak --</option>
                                    </select>
                                    <p class=\"text-xs text-slate-400 mt-1\">Pilih kontrak untuk load data referensi.</p>''',
    html,
    flags=re.DOTALL
)

# replace invoice end with preview panel
html = re.sub(
    r'<button type=\"submit\" class=\"px-6 py-2\.5 rounded-lg bg-emerald-600.*?</button>\s*</div>\s*</form>\s*</div>\s*</section>',
    '''<button type=\"submit\" class=\"px-6 py-2.5 rounded-lg bg-emerald-600 hover:bg-emerald-700 text-white font-medium shadow-sm transition-colors flex items-center gap-2\">
                                <i class=\"fas fa-file-invoice\"></i> Buat Invoice
                            </button>
                        </div>
                    </form>
                    </div>
                    <!-- INVOICE PREVIEW PANEL -->
                    <div class=\"w-[420px] shrink-0 sticky top-0\">
                        <div class=\"glass-panel overflow-hidden\">
                            <div class=\"bg-slate-700 px-4 py-3 flex items-center justify-between\">
                                <div class=\"flex items-center gap-2\">
                                    <i class=\"fas fa-file-invoice text-blue-300 text-sm\"></i>
                                    <span class=\"text-white text-sm font-medium\">Preview Invoice</span>
                                </div>
                            </div>
                            <div id=\"invoice-preview-panel\" class=\"overflow-auto bg-white p-6\" style=\"max-height:80vh; font-family:'Times New Roman', serif; color:#000;\">
                                <div class=\"flex flex-col items-center justify-center h-64 text-slate-400\">
                                    <i class=\"fas fa-file-invoice text-4xl mb-3 text-slate-300\"></i>
                                    <p class=\"text-sm\">Isi form untuk melihat preview</p>
                                </div>
                            </div>
                        </div>
                    </div>
                </div>
            </section>''',
    html,
    flags=re.DOTALL
)


# DO layout
html = html.replace(
    '<section id=\"do-form\" class=\"page-section max-w-4xl mx-auto\">\n                <div class=\"glass-panel p-8\">',
    '<section id=\"do-form\" class=\"page-section max-w-full mx-auto\">\n                <div class=\"flex gap-6 items-start\">\n                    <div class=\"flex-1 glass-panel p-6 min-w-0\">'
)

# DO search to select
html = re.sub(
    r'<input type=\"text\" id=\"d_no_invoice\".*?<button type=\"button\" onclick=\"fetchInvoiceForDO\(\)\".*?</div>\s*<p class=\"text-xs text-slate-400 mt-1\".*?</p>',
    '''<select id=\"d_no_invoice\" required class=\"form-input border-purple-300 focus:border-purple-500 focus:ring-purple-500\" onchange=\"fetchInvoiceForDO(); buildDOPreview();\">
                                        <option value=\"\">-- Pilih Invoice --</option>
                                    </select>
                                    <p class=\"text-xs text-slate-400 mt-1\">Pilih invoice untuk load data referensi.</p>''',
    html,
    flags=re.DOTALL
)

# Add DO tanggal pembayaran handling
html = html.replace(
    '<div>\n                                    <label class=\"block text-sm font-medium text-slate-700 mb-1\">Nominal Transfer Pembeli (Rp)</label>',
    '<div>\n                                    <label class=\"block text-sm font-medium text-slate-700 mb-1\">Tanggal Pembayaran Invoice</label>\n                                    <input type=\"date\" id=\"d_tanggal_pembayaran\" class=\"form-input\" oninput=\"buildDOPreview()\">\n                                </div>\n                                <div>\n                                    <label class=\"block text-sm font-medium text-slate-700 mb-1\">Nominal Transfer Pembeli (Rp)</label>'
)

# DO end and preview panel
html = re.sub(
    r'<button type=\"submit\" class=\"px-6 py-2\.5 rounded-lg bg-purple-600.*?</button>\s*</div>\s*</form>\s*</div>\s*</section>',
    '''<button type=\"submit\" class=\"px-6 py-2.5 rounded-lg bg-purple-600 hover:bg-purple-700 text-white font-medium shadow-sm transition-colors flex items-center gap-2\">
                                <i class=\"fas fa-truck-fast\"></i> Terbitkan DO
                            </button>
                        </div>
                    </form>
                    </div>
                    <!-- DO PREVIEW PANEL -->
                    <div class=\"w-[420px] shrink-0 sticky top-0\">
                        <div class=\"glass-panel overflow-hidden\">
                            <div class=\"bg-slate-700 px-4 py-3 flex items-center justify-between\">
                                <div class=\"flex items-center gap-2\">
                                    <i class=\"fas fa-truck text-blue-300 text-sm\"></i>
                                    <span class=\"text-white text-sm font-medium\">Preview DO</span>
                                </div>
                            </div>
                            <div id=\"do-preview-panel\" class=\"overflow-auto bg-white p-6\" style=\"max-height:80vh; font-family:'Times New Roman', serif; color:#000;\">
                                <div class=\"flex flex-col items-center justify-center h-64 text-slate-400\">
                                    <i class=\"fas fa-truck text-4xl mb-3 text-slate-300\"></i>
                                    <p class=\"text-sm\">Isi form untuk melihat preview</p>
                                </div>
                            </div>
                        </div>
                    </div>
                </div>
            </section>''',
    html,
    flags=re.DOTALL
)

with open('templates/index.html', 'w', encoding='utf-8') as f:
    f.write(html)
