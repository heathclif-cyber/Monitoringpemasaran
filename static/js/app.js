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
        'list-data': 'Daftar Dokumen Tersimpan'
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
    } else if (tabId === 'list-data') {
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
        applyListDataFilters();
    } catch (err) {
        console.error(err);
    }
}

function populateListDataFilters() {
    const selBulan = document.getElementById('filter-list-bulan');
    const selUnit = document.getElementById('filter-list-unit');
    const selPembeli = document.getElementById('filter-list-pembeli');
    const selKomoditi = document.getElementById('filter-list-komoditi');

    if (!selBulan) return; // Wait if not in DOM

    // Collect sets
    const units = new Set();
    const pembelis = new Set();
    const komoditis = new Set();
    const monthMap = {}; // "YYYY-MM" -> "Bulan YYYY"

    const addMonth = (dateStr) => {
        if (!dateStr || dateStr === '-') return;
        const [y, m, d] = dateStr.split('-');
        if (y && m) {
            const key = `${y}-${m}`;
            monthMap[key] = `${MONTHS_ID[parseInt(m)]} ${y}`;
        }
    };

    rawListData.kontrak.forEach(k => {
        if (k.kebun_produsen && k.kebun_produsen !== '-') units.add(k.kebun_produsen);
        if (k.pembeli && k.pembeli !== '-') pembelis.add(k.pembeli.split('\n')[0].trim());
        if (k.komoditi && k.komoditi !== '-') komoditis.add(k.komoditi);
        addMonth(k.tanggal_kontrak);
    });

    rawListData.invoice.forEach(i => {
        addMonth(i.tanggal_transaksi);
    });

    rawListData.do.forEach(d => {
        if (d.kepada_unit && d.kepada_unit !== '-') units.add(d.kepada_unit);
        addMonth(d.tanggal_do);
    });

    // Save current values
    const curBulan = selBulan.value;
    const curUnit = selUnit.value;
    const curPembeli = selPembeli.value;
    const curKomoditi = selKomoditi.value;

    // Reset options
    selBulan.innerHTML = '<option value="ALL">Semua Bulan</option>';
    selUnit.innerHTML = '<option value="ALL">Semua Unit</option>';
    selPembeli.innerHTML = '<option value="ALL">Semua Pembeli</option>';
    selKomoditi.innerHTML = '<option value="ALL">Semua Komoditi</option>';

    // Build options
    Object.keys(monthMap).sort().reverse().forEach(m => selBulan.add(new Option(monthMap[m], m)));
    [...units].sort().forEach(u => selUnit.add(new Option(u, u)));
    [...pembelis].sort().forEach(p => selPembeli.add(new Option(p, p)));
    [...komoditis].sort().forEach(k => selKomoditi.add(new Option(k, k)));

    // Restore values
    if ([...selBulan.options].some(o => o.value === curBulan)) selBulan.value = curBulan;
    if ([...selUnit.options].some(o => o.value === curUnit)) selUnit.value = curUnit;
    if ([...selPembeli.options].some(o => o.value === curPembeli)) selPembeli.value = curPembeli;
    if ([...selKomoditi.options].some(o => o.value === curKomoditi)) selKomoditi.value = curKomoditi;
}

function applyListDataFilters() {
    const selBulan = document.getElementById('filter-list-bulan');
    if (!selBulan) return;

    const query = document.getElementById('search-list-data').value.toLowerCase();
    const bulan = selBulan.value;
    const unit = document.getElementById('filter-list-unit').value;
    const pembeli = document.getElementById('filter-list-pembeli').value;
    const komoditi = document.getElementById('filter-list-komoditi').value;
    const sort = document.getElementById('filter-list-sort').value;

    // Lookups for cross-referencing
    const kontrakMap = {};
    rawListData.kontrak.forEach(k => { kontrakMap[k.no_kontrak] = k; });
    
    const invoiceMap = {};
    rawListData.invoice.forEach(i => { invoiceMap[i.no_invoice] = i; });

    // Filter Kontrak
    const fKontrak = rawListData.kontrak.filter(k => {
        let match = true;
        if (bulan !== 'ALL' && (!k.tanggal_kontrak || !k.tanggal_kontrak.startsWith(bulan))) match = false;
        if (unit !== 'ALL' && k.kebun_produsen !== unit) match = false;
        if (pembeli !== 'ALL' && (!k.pembeli || !k.pembeli.includes(pembeli))) match = false;
        if (komoditi !== 'ALL' && k.komoditi !== komoditi) match = false;
        if (query) {
            const txt = (k.no_kontrak + ' ' + k.pembeli + ' ' + k.komoditi).toLowerCase();
            if (!txt.includes(query)) match = false;
        }
        return match;
    });

    // Filter Invoice
    const fInvoice = rawListData.invoice.filter(i => {
        const k = kontrakMap[i.no_kontrak] || {};
        let match = true;
        if (bulan !== 'ALL' && (!i.tanggal_transaksi || !i.tanggal_transaksi.startsWith(bulan))) match = false;
        if (unit !== 'ALL' && k.kebun_produsen !== unit) match = false;
        if (pembeli !== 'ALL' && (!k.pembeli || !k.pembeli.includes(pembeli))) match = false;
        if (komoditi !== 'ALL' && k.komoditi !== komoditi) match = false;
        if (query) {
            const txt = (i.no_invoice + ' ' + i.no_kontrak).toLowerCase();
            if (!txt.includes(query)) match = false;
        }
        return match;
    });

    // Filter DO
    const fDo = rawListData.do.filter(d => {
        const i = invoiceMap[d.no_invoice] || {};
        const k = kontrakMap[i.no_kontrak] || {};
        let match = true;
        if (bulan !== 'ALL' && (!d.tanggal_do || !d.tanggal_do.startsWith(bulan))) match = false;
        if (unit !== 'ALL' && d.kepada_unit !== unit && k.kebun_produsen !== unit) match = false;
        if (pembeli !== 'ALL' && (!k.pembeli || !k.pembeli.includes(pembeli))) match = false;
        if (komoditi !== 'ALL' && k.komoditi !== komoditi) match = false;
        if (query) {
            const txt = (d.no_do + ' ' + d.no_invoice + ' ' + d.kepada_unit).toLowerCase();
            if (!txt.includes(query)) match = false;
        }
        return match;
    });

    // Sorting
    const sortByDate = (arr, dateField) => {
        return arr.sort((a, b) => {
            const ta = new Date(a[dateField] || 0).getTime();
            const tb = new Date(b[dateField] || 0).getTime();
            return sort === 'DESC' ? tb - ta : ta - tb;
        });
    };

    sortByDate(fKontrak, 'tanggal_kontrak');
    sortByDate(fInvoice, 'tanggal_transaksi');
    sortByDate(fDo, 'tanggal_do');

    renderListData(fKontrak, fInvoice, fDo);
}

function renderListData(kontraks, invoices, dos) {
    // 1. Render Kontrak
    let tbody = document.getElementById('table-kontrak');
    tbody.innerHTML = '';
    if (kontraks.length === 0) {
        tbody.innerHTML = '<tr><td colspan="6" class="text-center py-6 text-slate-400 text-sm">Belum ada data kontrak yang memfilter</td></tr>';
    }
    kontraks.forEach(item => {
        let tr = document.createElement('tr');
        tr.className = 'hover:bg-slate-50 transition-colors group border-b border-slate-100 last:border-0';
        tr.innerHTML = `
            <td class="py-4 px-6 font-medium text-slate-800 whitespace-nowrap sticky left-0 bg-white z-10">${item.no_kontrak}</td>
            <td class="py-4 px-6 text-slate-600 whitespace-nowrap">${fmtDateLocal(item.tanggal_kontrak)}</td>
            <td class="py-4 px-6 text-slate-700 font-medium">${safe(item.pembeli).split('\n')[0]}</td>
            <td class="py-4 px-6 text-slate-600 whitespace-nowrap">
                <span class="inline-flex items-center px-2.5 py-1 rounded-full text-xs font-semibold bg-emerald-50 text-emerald-700 border border-emerald-200">
                  ${safe(item.komoditi)}
                </span>
            </td>
            <td class="py-4 px-6 font-bold text-slate-800 text-right whitespace-nowrap">${fmtRpFull(item.nilai_transaksi)}</td>
            <td class="py-4 px-6">
                <div class="flex gap-2 justify-center opacity-0 group-hover:opacity-100 transition-opacity">
                    <button onclick="editDoc('kontrak', '${item.no_kontrak}')" class="p-2 text-teal-600 hover:bg-teal-50 rounded-lg transition-colors tooltip" title="Edit / View"><i class="fas fa-edit"></i></button>
                    <a href="/api/kontrak/export?no_kontrak=${encodeURIComponent(item.no_kontrak)}" target="_blank" class="p-2 text-blue-600 hover:bg-blue-50 rounded-lg transition-colors tooltip" title="Download Word"><i class="fas fa-file-word"></i></a>
                    <button onclick="deleteContract('${item.no_kontrak}')" class="p-2 text-red-500 hover:bg-red-50 rounded-lg transition-colors tooltip" title="Hapus Kontrak"><i class="fas fa-trash"></i></button>
                </div>
            </td>
        `;
        tbody.appendChild(tr);
    });

    // 2. Render Invoice
    tbody = document.getElementById('table-invoice');
    tbody.innerHTML = '';
    if (invoices.length === 0) {
        tbody.innerHTML = '<tr><td colspan="5" class="text-center py-6 text-slate-400 text-sm">Belum ada data invoice yang memfilter</td></tr>';
    }
    invoices.forEach(item => {
        let tr = document.createElement('tr');
        tr.className = 'hover:bg-slate-50 transition-colors group border-b border-slate-100 last:border-0';
        tr.innerHTML = `
            <td class="py-4 px-6 font-medium text-slate-800 whitespace-nowrap sticky left-0 bg-white z-10">${item.no_invoice}</td>
            <td class="py-4 px-6 text-slate-600 whitespace-nowrap">${item.no_kontrak}</td>
            <td class="py-4 px-6 text-slate-600 whitespace-nowrap">${fmtDateLocal(item.tanggal_transaksi)}</td>
            <td class="py-4 px-6 font-bold text-slate-800 text-right whitespace-nowrap">${fmtRpFull(item.jumlah_pembayaran)}</td>
            <td class="py-4 px-6">
                <div class="flex gap-2 justify-center opacity-0 group-hover:opacity-100 transition-opacity">
                    <button onclick="editDoc('invoice', '${item.no_invoice}')" class="p-2 text-purple-600 hover:bg-purple-50 rounded-lg transition-colors tooltip" title="Edit / View"><i class="fas fa-edit"></i></button>
                    <a href="/api/invoice/export?no_invoice=${encodeURIComponent(item.no_invoice)}" target="_blank" class="p-2 text-purple-600 hover:bg-purple-50 rounded-lg transition-colors tooltip" title="Download Word"><i class="fas fa-file-word"></i></a>
                    <button onclick="deleteInvoice('${item.no_invoice}')" class="p-2 text-red-500 hover:bg-red-50 rounded-lg transition-colors tooltip" title="Hapus Invoice"><i class="fas fa-trash"></i></button>
                </div>
            </td>
        `;
        tbody.appendChild(tr);
    });

    // 3. Render DO
    tbody = document.getElementById('table-do');
    tbody.innerHTML = '';
    if (dos.length === 0) {
        tbody.innerHTML = '<tr><td colspan="5" class="text-center py-6 text-slate-400 text-sm">Belum ada data DO yang memfilter</td></tr>';
    }
    dos.forEach(item => {
        let tr = document.createElement('tr');
        tr.className = 'hover:bg-slate-50 transition-colors group border-b border-slate-100 last:border-0';
        tr.innerHTML = `
            <td class="py-4 px-6 font-medium text-slate-800 whitespace-nowrap sticky left-0 bg-white z-10">${item.no_do}</td>
            <td class="py-4 px-6 text-slate-600 whitespace-nowrap">${item.no_invoice}</td>
            <td class="py-4 px-6 text-slate-600 whitespace-nowrap">${fmtDateLocal(item.tanggal_do)}</td>
            <td class="py-4 px-6 text-slate-700 font-medium">${safe(item.kepada_unit)}</td>
            <td class="py-4 px-6 text-center">
                <div class="flex gap-2 justify-center opacity-0 group-hover:opacity-100 transition-opacity">
                    <button onclick="editDoc('do', '${item.no_do}')" class="p-2 text-blue-600 hover:bg-blue-50 rounded-lg transition-colors tooltip" title="Edit / View"><i class="fas fa-edit"></i></button>
                    <a href="/api/do/export?no_do=${encodeURIComponent(item.no_do)}" target="_blank" class="p-2 text-blue-600 hover:bg-blue-50 rounded-lg transition-colors tooltip" title="Download Word"><i class="fas fa-file-word"></i></a>
                    <button onclick="deleteDO('${item.no_do}')" class="p-2 text-red-500 hover:bg-red-50 rounded-lg transition-colors tooltip" title="Hapus DO"><i class="fas fa-trash"></i></button>
                </div>
            </td>
        `;
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
