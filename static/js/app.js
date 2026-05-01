// ============================================================
// app.js — Global Helpers, Navigation, Formatting, Dropdowns
// ============================================================

let lastSavedKontrakId = null;

// --- Helpers ---
const formatRupiah = (number) => {
    if (number === null || number === undefined || isNaN(number)) return 'Rp0,00';
    return new Intl.NumberFormat('id-ID', { style: 'currency', currency: 'IDR', minimumFractionDigits: 2, maximumFractionDigits: 2 }).format(number);
};

const showNotification = (message, type = 'success') => {
    const container = document.getElementById('notification-container');
    if (!container) return;
    const toast = document.createElement('div');
    toast.className = `toast ${type} show`;
    toast.innerText = message;
    container.appendChild(toast);

    setTimeout(() => {
        toast.classList.remove('show');
        setTimeout(() => toast.remove(), 300);
    }, 3000);
};
window.showToast = showNotification;

const MONTHS_ID = ['', 'Januari', 'Februari', 'Maret', 'April', 'Mei', 'Juni', 'Juli', 'Agustus', 'September', 'Oktober', 'November', 'Desember'];

function fmtRpLocal(v) {
    if (v === null || v === undefined || isNaN(v)) return '0,00';
    return Number(v).toLocaleString('id-ID', { minimumFractionDigits: 2, maximumFractionDigits: 2 });
}
function fmtRpFull(v) {
    if (v === null || v === undefined || isNaN(v)) return 'Rp0,00';
    return 'Rp' + Number(v).toLocaleString('id-ID', { minimumFractionDigits: 2, maximumFractionDigits: 2 });
}
function parseLocaleFloat(str) {
    if (!str) return 0;
    // Replace comma with dot for parseFloat if it looks like Indonesian decimal
    // But be careful: if they use dots for thousands, we should remove them first
    // Typical Indo: 1.234.567,89 -> 1234567.89
    // If they just type "123,45" -> 123.45
    let clean = String(str).replace(/\s/g, '');
    if (clean.includes(',') && clean.includes('.')) {
        // Has both, assume . is thousands and , is decimal
        clean = clean.replace(/\./g, '').replace(',', '.');
    } else if (clean.includes(',')) {
        // Has only comma, assume it's decimal
        clean = clean.replace(',', '.');
    }
    return parseFloat(clean) || 0;
}
function safe(v, fb = '-') { return (v && String(v).trim()) ? String(v).trim() : fb; }
function fmtDateLocal(dateStr) {
    if (!dateStr) return '____ __________ ____';
    const [y, m, d] = dateStr.split('-');
    return `${parseInt(d)} ${MONTHS_ID[parseInt(m)]} ${y}`;
}
function getVal(id) {
    let el = document.getElementById(id);
    return el ? el.value : null;
}

// --- UI Navigation ---
function switchTab(tabId, el) {
    document.querySelectorAll('.page-section').forEach(section => section.classList.remove('active'));
    document.querySelectorAll('.nav-item').forEach(item => item.classList.remove('active'));

    const section = document.getElementById(tabId);
    if (section) section.classList.add('active');

    // Update Page Title
    const titMap = {
        'dashboard': 'Dashboard Overview',
        'kontrak-form': 'Otomasi Kontrak (Word)',
        'invoice-form': 'Otomasi Invoice (Word)',
        'do-form': 'Otomasi Delivery Order',
        'laporan': 'Rekapitulasi Laporan Terintegrasi',
        'bypass-form': 'Input Data Bypass Laporan',
        'list-data': 'Daftar Dokumen Tersimpan',
        'repo-kontrak': 'Repository — Kontrak Penjualan',
        'repo-invoice': 'Repository — Arsip Invoice',
        'repo-do': 'Repository — Delivery Order'
    };
    if (titMap[tabId]) document.getElementById('page-title').innerText = titMap[tabId];

    if (el) {
        el.classList.add('active');
    } else {
        document.querySelectorAll('.nav-item').forEach(item => {
            if (item.getAttribute('onclick') && item.getAttribute('onclick').includes(tabId)) {
                item.classList.add('active');
            }
        });
    }

    if (tabId === 'dashboard') {
        if (window.fetchDashboardData) fetchDashboardData();
    } else if (tabId === 'list-data' || tabId === 'repo-kontrak' || tabId === 'repo-invoice' || tabId === 'repo-do') {
        if (window.fetchListData) fetchListData();
    } else if (tabId === 'laporan') {
        if (window.fetchLaporanData) fetchLaporanData();
    }
}

function switchTabDirect(tabId) {
    document.querySelectorAll('.page-section').forEach(el => el.classList.remove('active'));
    document.querySelectorAll('.nav-item').forEach(el => el.classList.remove('active'));
    const section = document.getElementById(tabId);
    if (section) section.classList.add('active');
}

// --- Dynamic Dropdowns ---
async function populateDropdowns() {
    try {
        const resK = await fetch('/api/kontrak?limit=1000');
        const kData = await resK.json();
        const selK = document.getElementById('i_no_kontrak');
        selK.innerHTML = '<option value="">-- Pilih Kontrak --</option>';
        document.getElementById('kontrak-list').innerHTML = '';
        kData.forEach(k => {
            const opt = document.createElement('option');
            opt.value = k.no_kontrak;
            opt.text = k.no_kontrak + ' - ' + (k.pembeli ? k.pembeli.split('\n')[0] : '');
            selK.appendChild(opt);
            const optD = document.createElement('option'); optD.value = k.no_kontrak; document.getElementById('kontrak-list').appendChild(optD);
        });

        const resI = await fetch('/api/invoice?limit=1000');
        const iData = await resI.json();
        const selI = document.getElementById('d_no_invoice');
        selI.innerHTML = '<option value="">-- Pilih Invoice --</option>';
        document.getElementById('invoice-list').innerHTML = '';
        iData.forEach(i => {
            const opt = document.createElement('option');
            opt.value = i.no_invoice;
            opt.text = i.no_invoice;
            selI.appendChild(opt);
            const optD = document.createElement('option'); optD.value = i.no_invoice; document.getElementById('invoice-list').appendChild(optD);
        });

        const resD = await fetch('/api/do?limit=1000');
        const dData = await resD.json();
        document.getElementById('do-list').innerHTML = '';
        dData.forEach(d => { const opt = document.createElement('option'); opt.value = d.no_do; document.getElementById('do-list').appendChild(opt); });
    } catch (err) { console.error("Error populating dropdowns", err); }
}

// --- List Data ---
let rawListData = { kontrak: [], invoice: [], do: [] };

async function fetchListData() {
    try {
        const [resK, resI, resD] = await Promise.all([
            fetch('/api/kontrak'),
            fetch('/api/invoice'),
            fetch('/api/do')
        ]);
        rawListData.kontrak = await resK.json();
        rawListData.invoice = await resI.json();
        rawListData.do = await resD.json();
        
        populateListDataFilters();
        applyRepoKontrakFilters();
        applyRepoInvoiceFilters();
        applyRepoDOFilters();
    } catch (err) {
        console.error(err);
    }
}

function populateListDataFilters() {
    // Helper: populate a select by ID if it exists
    function fillSelect(id, options, defaultLabel) {
        const el = document.getElementById(id);
        if (!el) return;
        const cur = el.value;
        el.innerHTML = `<option value="ALL">${defaultLabel}</option>`;
        options.forEach(o => el.add(new Option(o.label, o.value)));
        if ([...el.options].some(o => o.value === cur)) el.value = cur;
    }

    // Collect sets
    const units = new Set();
    const pembelis = new Set();
    const komoditis = new Set();
    const monthMap = {};

    const addMonth = (dateStr) => {
        if (!dateStr || dateStr === '-') return;
        const [y, m] = dateStr.split('-');
        if (y && m) monthMap[`${y}-${m}`] = `${MONTHS_ID[parseInt(m)]} ${y}`;
    };

    rawListData.kontrak.forEach(k => {
        if (k.kebun_produsen && k.kebun_produsen !== '-') units.add(k.kebun_produsen);
        if (k.pembeli && k.pembeli !== '-') pembelis.add(k.pembeli.split('\n')[0].trim());
        if (k.komoditi && k.komoditi !== '-') komoditis.add(k.komoditi);
        addMonth(k.tanggal_kontrak);
    });
    rawListData.invoice.forEach(i => addMonth(i.tanggal_transaksi));
    rawListData.do.forEach(d => {
        if (d.kepada_unit && d.kepada_unit !== '-') units.add(d.kepada_unit);
        addMonth(d.tanggal_do);
    });

    const monthOpts = Object.keys(monthMap).sort().reverse().map(k => ({ label: monthMap[k], value: k }));
    const unitOpts = [...units].sort().map(u => ({ label: u, value: u }));
    const pembeliOpts = [...pembelis].sort().map(p => ({ label: p, value: p }));
    const komoditiOpts = [...komoditis].sort().map(k => ({ label: k, value: k }));

    // Populate all filter dropdowns across all repo sections
    ['rk-bulan', 'ri-bulan', 'rd-bulan'].forEach(id => fillSelect(id, monthOpts, 'Semua Bulan'));
    ['rk-unit',  'rd-unit'            ].forEach(id => fillSelect(id, unitOpts,   'Semua Unit'));
    ['rk-pembeli'                      ].forEach(id => fillSelect(id, pembeliOpts,'Semua Pembeli'));
    ['rk-sort',  'ri-sort',  'rd-sort' ].forEach(id => fillSelect(id, [
        { label: 'Terbaru ke Terlama', value: 'DESC' },
        { label: 'Terlama ke Terbaru', value: 'ASC'  }
    ], 'Terbaru ke Terlama'));
    // Invoice-specific: kontrak list
    const kontrakOpts = rawListData.kontrak.map(k => ({ label: k.no_kontrak, value: k.no_kontrak }));
    ['ri-kontrak'].forEach(id => fillSelect(id, kontrakOpts, 'Semua Kontrak'));
    // DO-specific: invoice list
    const invoiceOpts = rawListData.invoice.map(i => ({ label: i.no_invoice, value: i.no_invoice }));
    ['rd-invoice'].forEach(id => fillSelect(id, invoiceOpts, 'Semua Invoice'));
}

// Backward compat shim for old _list_data.html filters (if still rendered)
function applyListDataFilters() {
    applyRepoKontrakFilters();
    applyRepoInvoiceFilters();
    applyRepoDOFilters();
}

// ---- Repo Kontrak Filter & Render ----
function applyRepoKontrakFilters() {
    const gv = id => { const el = document.getElementById(id); return el ? el.value : 'ALL'; };
    const bulan   = gv('rk-bulan');
    const unit    = gv('rk-unit');
    const pembeli = gv('rk-pembeli');
    const sort    = gv('rk-sort') === 'ALL' ? 'DESC' : gv('rk-sort');
    const query   = ((document.getElementById('rk-search') || {}).value || '').toLowerCase();

    let data = rawListData.kontrak.filter(k => {
        if (bulan   !== 'ALL' && (!k.tanggal_kontrak || !k.tanggal_kontrak.startsWith(bulan))) return false;
        if (unit    !== 'ALL' && k.kebun_produsen !== unit) return false;
        if (pembeli !== 'ALL' && (!k.pembeli || !k.pembeli.includes(pembeli))) return false;
        if (query && !(k.no_kontrak+' '+k.pembeli+' '+k.komoditi).toLowerCase().includes(query)) return false;
        return true;
    });
    data.sort((a,b) => { const ta=new Date(a.tanggal_kontrak||0).getTime(), tb=new Date(b.tanggal_kontrak||0).getTime(); return sort==='DESC'?tb-ta:ta-tb; });

    const tbody = document.getElementById('table-kontrak');
    if (!tbody) return;
    tbody.innerHTML = '';
    if (data.length === 0) { tbody.innerHTML = '<tr><td colspan="6" class="text-center py-8 text-slate-400 text-sm">Belum ada data kontrak</td></tr>'; return; }
    data.forEach(item => {
        const tr = document.createElement('tr');
        tr.className = 'hover:bg-slate-50 transition-colors group border-b border-slate-100 last:border-0';
        tr.innerHTML = `
            <td class="py-3 px-4 font-medium text-slate-800 whitespace-nowrap">${item.no_kontrak}</td>
            <td class="py-3 px-4 text-slate-600 whitespace-nowrap">${fmtDateLocal(item.tanggal_kontrak)}</td>
            <td class="py-3 px-4 text-slate-700 font-medium">${safe(item.pembeli).split('\n')[0]}</td>
            <td class="py-3 px-4 whitespace-nowrap"><span class="inline-flex items-center px-2.5 py-1 rounded-full text-xs font-semibold bg-emerald-50 text-emerald-700 border border-emerald-200">${safe(item.komoditi)}</span></td>
            <td class="py-3 px-4 font-bold text-slate-800 text-right whitespace-nowrap">${fmtRpFull(item.nilai_transaksi)}</td>
            <td class="py-3 px-4">
                <div class="flex gap-2 justify-center opacity-0 group-hover:opacity-100 transition-opacity">
                    <button onclick="editDoc('kontrak','${item.no_kontrak}')" class="p-2 text-teal-600 hover:bg-teal-50 rounded-lg" title="Edit"><i class="fas fa-edit"></i></button>
                    <a href="/api/kontrak/export?no_kontrak=${encodeURIComponent(item.no_kontrak)}" target="_blank" class="p-2 text-blue-600 hover:bg-blue-50 rounded-lg" title="Download"><i class="fas fa-file-word"></i></a>
                    <button onclick="deleteContract('${item.no_kontrak}')" class="p-2 text-red-500 hover:bg-red-50 rounded-lg" title="Hapus"><i class="fas fa-trash"></i></button>
                </div>
            </td>`;
        tbody.appendChild(tr);
    });
}

// ---- Repo Invoice Filter & Render ----
function applyRepoInvoiceFilters() {
    const gv = id => { const el = document.getElementById(id); return el ? el.value : 'ALL'; };
    const bulan = gv('ri-bulan');
    const sort  = gv('ri-sort') === 'ALL' ? 'DESC' : gv('ri-sort');
    const query = ((document.getElementById('ri-search') || {}).value || '').toLowerCase();

    let data = rawListData.invoice.filter(i => {
        if (bulan !== 'ALL' && (!i.tanggal_transaksi || !i.tanggal_transaksi.startsWith(bulan))) return false;
        if (query && !(i.no_invoice+' '+i.no_kontrak).toLowerCase().includes(query)) return false;
        return true;
    });
    data.sort((a,b) => { const ta=new Date(a.tanggal_transaksi||0).getTime(), tb=new Date(b.tanggal_transaksi||0).getTime(); return sort==='DESC'?tb-ta:ta-tb; });

    const tbody = document.getElementById('table-invoice');
    if (!tbody) return;
    tbody.innerHTML = '';
    if (data.length === 0) { tbody.innerHTML = '<tr><td colspan="5" class="text-center py-8 text-slate-400 text-sm">Belum ada data invoice</td></tr>'; return; }
    data.forEach(item => {
        const tr = document.createElement('tr');
        tr.className = 'hover:bg-slate-50 transition-colors group border-b border-slate-100 last:border-0';
        tr.innerHTML = `
            <td class="py-3 px-4 font-medium text-slate-800 whitespace-nowrap">${item.no_invoice}</td>
            <td class="py-3 px-4 text-slate-600 whitespace-nowrap">${item.no_kontrak}</td>
            <td class="py-3 px-4 text-slate-600 whitespace-nowrap">${fmtDateLocal(item.tanggal_transaksi)}</td>
            <td class="py-3 px-4 font-bold text-slate-800 text-right whitespace-nowrap">${fmtRpFull(item.jumlah_pembayaran)}</td>
            <td class="py-3 px-4">
                <div class="flex gap-2 justify-center opacity-0 group-hover:opacity-100 transition-opacity">
                    <button onclick="editDoc('invoice','${item.no_invoice}')" class="p-2 text-purple-600 hover:bg-purple-50 rounded-lg" title="Edit"><i class="fas fa-edit"></i></button>
                    <a href="/api/invoice/export?no_invoice=${encodeURIComponent(item.no_invoice)}" target="_blank" class="p-2 text-purple-600 hover:bg-purple-50 rounded-lg" title="Download"><i class="fas fa-file-word"></i></a>
                    <button onclick="deleteInvoice('${item.no_invoice}')" class="p-2 text-red-500 hover:bg-red-50 rounded-lg" title="Hapus"><i class="fas fa-trash"></i></button>
                </div>
            </td>`;
        tbody.appendChild(tr);
    });
}

// ---- Repo DO Filter & Render ----
function applyRepoDOFilters() {
    const gv = id => { const el = document.getElementById(id); return el ? el.value : 'ALL'; };
    const bulan = gv('rd-bulan');
    const unit  = gv('rd-unit');
    const sort  = gv('rd-sort') === 'ALL' ? 'DESC' : gv('rd-sort');
    const query = ((document.getElementById('rd-search') || {}).value || '').toLowerCase();

    let data = rawListData.do.filter(d => {
        if (bulan !== 'ALL' && (!d.tanggal_do || !d.tanggal_do.startsWith(bulan))) return false;
        if (unit  !== 'ALL' && d.kepada_unit !== unit) return false;
        if (query && !(d.no_do+' '+d.no_invoice+' '+d.kepada_unit).toLowerCase().includes(query)) return false;
        return true;
    });
    data.sort((a,b) => { const ta=new Date(a.tanggal_do||0).getTime(), tb=new Date(b.tanggal_do||0).getTime(); return sort==='DESC'?tb-ta:ta-tb; });

    const tbody = document.getElementById('table-do');
    if (!tbody) return;
    tbody.innerHTML = '';
    if (data.length === 0) { tbody.innerHTML = '<tr><td colspan="5" class="text-center py-8 text-slate-400 text-sm">Belum ada data DO</td></tr>'; return; }
    data.forEach(item => {
        const tr = document.createElement('tr');
        tr.className = 'hover:bg-slate-50 transition-colors group border-b border-slate-100 last:border-0';
        tr.innerHTML = `
            <td class="py-3 px-4 font-medium text-slate-800 whitespace-nowrap">${item.no_do}</td>
            <td class="py-3 px-4 text-slate-600 whitespace-nowrap">${item.no_invoice}</td>
            <td class="py-3 px-4 text-slate-600 whitespace-nowrap">${fmtDateLocal(item.tanggal_do)}</td>
            <td class="py-3 px-4 text-slate-700 font-medium">${safe(item.kepada_unit)}</td>
            <td class="py-3 px-4">
                <div class="flex gap-2 justify-center opacity-0 group-hover:opacity-100 transition-opacity">
                    <button onclick="editDoc('do','${item.no_do}')" class="p-2 text-blue-600 hover:bg-blue-50 rounded-lg" title="Edit"><i class="fas fa-edit"></i></button>
                    <a href="/api/do/export?no_do=${encodeURIComponent(item.no_do)}" target="_blank" class="p-2 text-blue-600 hover:bg-blue-50 rounded-lg" title="Download"><i class="fas fa-file-word"></i></a>
                    <button onclick="deleteDO('${item.no_do}')" class="p-2 text-red-500 hover:bg-red-50 rounded-lg" title="Hapus"><i class="fas fa-trash"></i></button>
                </div>
            </td>`;
        tbody.appendChild(tr);
    });
}

// --- Init ---
document.addEventListener("DOMContentLoaded", () => {
    const today = new Date().toISOString().split('T')[0];
    document.getElementById('k_tanggal_kontrak').value = today;
    document.getElementById('i_tanggal_transaksi').value = today;
    document.getElementById('d_tanggal_do').value = today;
    populateDropdowns();

    // Wire up live preview for Kontrak form
    const kontrakFieldIds = [
        'k_no_kontrak', 'k_tanggal_kontrak', 'k_lokasi', 'k_pemilik_komoditas',
        'k_penjual', 'k_pembeli', 'k_nama_direktur', 'k_alamat_pembeli',
        'k_komoditi', 'k_jenis_komoditi', 'k_deskripsi_produk', 'k_tahun_panen',
        'k_kebun_produsen', 'k_volume', 'k_satuan', 'k_harga_satuan', 'k_ppn_persen',
        'k_premi', 'k_mutu', 'k_packaging', 'k_simbol', 'k_chop', 'k_pack_qty', 'k_banyak_bale',
        'k_kondisi_penyerahan', 'k_waktu_penyerahan', 'k_levering', 'k_pelabuhan_muat',
        'k_lama_pembayaran_hari', 'k_penyerahan_hari', 'k_pembayaran_metode', 'k_pembayaran_cara', 'k_pembayaran_bank'
    ];
    kontrakFieldIds.forEach(id => {
        const el = document.getElementById(id);
        if (el) el.addEventListener('input', buildLivePreview);
    });

    buildLivePreview();
    fetchDashboardData();

    const invFields = ['i_no_kontrak', 'i_no_invoice', 'i_tanggal_transaksi', 'i_pph_22'];
    invFields.forEach(id => {
        const el = document.getElementById(id);
        if (el) el.addEventListener('input', buildInvoicePreview);
        if (el) el.addEventListener('change', buildInvoicePreview);
    });

    const doFields = ['d_no_invoice', 'd_no_do', 'd_tanggal_do', 'd_kepada_unit', 'd_tanggal_pembayaran', 'd_nominal_transfer'];
    doFields.forEach(id => {
        const el = document.getElementById(id);
        if (el) el.addEventListener('input', buildDOPreview);
        if (el) el.addEventListener('change', buildDOPreview);
    });
});

async function editDoc(type, id) {
    if (type === 'kontrak') {
        switchTab('kontrak-form');
        document.getElementById('k_no_kontrak').value = id;
        if (window.autoLoadKontrak) await autoLoadKontrak();
        if (window.loadKontrakPreview) await loadKontrakPreview(id);
    } else if (type === 'invoice') {
        switchTab('invoice-form');
        document.getElementById('i_no_invoice').value = id;
        if (window.autoLoadInvoice) await autoLoadInvoice();
    } else if (type === 'do') {
        switchTab('do-form');
        document.getElementById('d_no_do').value = id;
        if (window.autoLoadDO) await autoLoadDO();
    }
}
async function deleteContract(no) {
    if (!confirm('Hapus kontrak ' + no + '? Semua data invoice dan DO terkait juga akan terhapus.')) return;
    try {
        const res = await fetch('/api/kontrak/' + encodeURIComponent(no), { method: 'DELETE' });
        if (res.ok) { showNotification('Kontrak dihapus'); fetchListData(); populateDropdowns(); if(window.fetchLaporanData) fetchLaporanData(); }
    } catch (e) { showNotification('Gagal menghapus', 'error'); }
}
async function deleteInvoice(no) {
    if (!confirm('Hapus invoice ' + no + '? Data DO terkait juga akan terhapus.')) return;
    try {
        const res = await fetch('/api/invoice/' + encodeURIComponent(no), { method: 'DELETE' });
        if (res.ok) { showNotification('Invoice dihapus'); fetchListData(); populateDropdowns(); if(window.fetchLaporanData) fetchLaporanData(); }
    } catch (e) { showNotification('Gagal menghapus', 'error'); }
}
async function deleteDO(no) {
    if (!confirm('Hapus DO ' + no + '?')) return;
    try {
        const res = await fetch('/api/do/' + encodeURIComponent(no), { method: 'DELETE' });
        if (res.ok) { showNotification('DO dihapus'); fetchListData(); populateDropdowns(); if(window.fetchLaporanData) fetchLaporanData(); }
    } catch (e) { showNotification('Gagal menghapus', 'error'); }
}
