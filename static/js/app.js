// ============================================================
// app.js — Global Helpers, Navigation, Formatting, Dropdowns
// ============================================================

let lastSavedKontrakId = null;

// --- Helpers ---
const formatRupiah = (number) => {
    return new Intl.NumberFormat('id-ID', { style: 'currency', currency: 'IDR', minimumFractionDigits: 0 }).format(number);
};

const showNotification = (message, type = 'success') => {
    const container = document.getElementById('notification-container');
    const toast = document.createElement('div');
    toast.className = `toast ${type} show`;
    toast.innerText = message;
    container.appendChild(toast);

    setTimeout(() => {
        toast.classList.remove('show');
        setTimeout(() => toast.remove(), 300);
    }, 3000);
};

const MONTHS_ID = ['', 'Januari', 'Februari', 'Maret', 'April', 'Mei', 'Juni', 'Juli', 'Agustus', 'September', 'Oktober', 'November', 'Desember'];

function fmtRpLocal(v) {
    if (!v || isNaN(v)) return '-';
    return 'Rp' + Number(v).toLocaleString('id-ID', { minimumFractionDigits: 0 });
}
function fmtRpFull(v) {
    if (!v || isNaN(v)) return 'Rp0';
    return 'Rp' + Number(v).toLocaleString('id-ID', { minimumFractionDigits: 0 });
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
async function fetchListData() {
    try {
        let res = await fetch('/api/kontrak');
        let data = await res.json();
        let tbody = document.getElementById('table-kontrak');
        tbody.innerHTML = '';
        if (data.length === 0) {
            tbody.innerHTML = '<tr><td colspan="6" class="text-center py-6 text-slate-400 text-sm">Belum ada data kontrak</td></tr>';
        }
        data.forEach(item => {
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
                        <button onclick="loadKontrakPreview('${item.no_kontrak}'); switchTabDirect('kontrak-form');" class="p-2 text-teal-600 hover:bg-teal-50 rounded-lg transition-colors tooltip" title="Preview Form"><i class="fas fa-eye"></i></button>
                        <a href="/api/kontrak/export?no_kontrak=${encodeURIComponent(item.no_kontrak)}" target="_blank" class="p-2 text-blue-600 hover:bg-blue-50 rounded-lg transition-colors tooltip" title="Download Word"><i class="fas fa-file-word"></i></a>
                    </div>
                </td>
            `;
            tbody.appendChild(tr);
        });

        res = await fetch('/api/invoice');
        data = await res.json();
        tbody = document.getElementById('table-invoice');
        tbody.innerHTML = '';
        data.forEach(item => {
            let tr = document.createElement('tr');
            tr.className = 'hover:bg-slate-50 transition-colors group border-b border-slate-100 last:border-0';
            tr.innerHTML = `
                <td class="py-4 px-6 font-medium text-slate-800 whitespace-nowrap sticky left-0 bg-white z-10">${item.no_invoice}</td>
                <td class="py-4 px-6 text-slate-600 whitespace-nowrap">${item.no_kontrak}</td>
                <td class="py-4 px-6 text-slate-600 whitespace-nowrap">${fmtDateLocal(item.tanggal_transaksi)}</td>
                <td class="py-4 px-6 font-bold text-slate-800 text-right whitespace-nowrap">${fmtRpFull(item.jumlah_pembayaran)}</td>
                <td class="py-4 px-6">
                    <div class="flex gap-2 justify-center opacity-0 group-hover:opacity-100 transition-opacity">
                        <a href="/api/invoice/export?no_invoice=${encodeURIComponent(item.no_invoice)}" target="_blank" class="p-2 text-purple-600 hover:bg-purple-50 rounded-lg transition-colors tooltip" title="Download Word"><i class="fas fa-file-word"></i></a>
                    </div>
                </td>
            `;
            tbody.appendChild(tr);
        });

        res = await fetch('/api/do');
        data = await res.json();
        tbody = document.getElementById('table-do');
        tbody.innerHTML = '';
        data.forEach(item => {
            let tr = document.createElement('tr');
            tr.className = 'hover:bg-slate-50 transition-colors group border-b border-slate-100 last:border-0';
            tr.innerHTML = `
                <td class="py-4 px-6 font-medium text-slate-800 whitespace-nowrap sticky left-0 bg-white z-10">${item.no_do}</td>
                <td class="py-4 px-6 text-slate-600 whitespace-nowrap">${item.no_invoice}</td>
                <td class="py-4 px-6 text-slate-600 whitespace-nowrap">${fmtDateLocal(item.tanggal_do)}</td>
                <td class="py-4 px-6 text-slate-700 font-medium">${safe(item.kepada_unit)}</td>
                <td class="py-4 px-6">
                    <div class="flex gap-2 justify-center opacity-0 group-hover:opacity-100 transition-opacity">
                        <a href="/api/do/export?no_do=${encodeURIComponent(item.no_do)}" target="_blank" class="p-2 text-blue-600 hover:bg-blue-50 rounded-lg transition-colors tooltip" title="Download Word"><i class="fas fa-file-word"></i></a>
                    </div>
                </td>
            `;
            tbody.appendChild(tr);
        });
    } catch (err) {
        console.error(err);
    }
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
