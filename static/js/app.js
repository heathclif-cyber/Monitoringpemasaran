let trendChartInstance = null;
let commodityChartInstance = null;
let lastSavedKontrakId = null;  // track last saved kontrak for preview & export

// Helpers
const formatRupiah = (number) => {
    return new Intl.NumberFormat('id-ID', { style: 'currency', currency: 'IDR', minimumFractionDigits: 0 }).format(number);
};

const showToast = (message, type = 'success') => {
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

// UI Navigation
function switchTab(tabId) {
    document.querySelectorAll('.page-section').forEach(el => el.classList.remove('active'));
    document.querySelectorAll('.nav-item').forEach(el => el.classList.remove('active'));
    
    document.getElementById(tabId).classList.add('active');
    event.currentTarget.classList.add('active');
    
    if(tabId === 'dashboard') {
        fetchDashboardData();
    } else if (tabId === 'list-data') {
        fetchListData();
    }
}

// ==== DASHBOARD ====
async function fetchDashboardData() {
    try {
        const res = await fetch('/api/dashboard');
        const data = await res.json();
        
        // Update cards
        document.getElementById('dash-nilai-transaksi').innerText = formatRupiah(data.summary.total_nilai_transaksi);
        document.getElementById('dash-kontrak-count').innerText = data.summary.total_kontrak;
        document.getElementById('dash-invoice-count').innerText = data.summary.total_invoice;
        document.getElementById('dash-do-count').innerText = data.summary.total_do;
        
        // Render Trend Chart
        const ctxTrend = document.getElementById('trendChart').getContext('2d');
        if(trendChartInstance) trendChartInstance.destroy();
        
        trendChartInstance = new Chart(ctxTrend, {
            type: 'line',
            data: {
                labels: data.charts.tren.labels.length > 0 ? data.charts.tren.labels : ['No Data'],
                datasets: [{
                    label: 'Nilai Transaksi',
                    data: data.charts.tren.values.length > 0 ? data.charts.tren.values : [0],
                    borderColor: '#10b981',
                    backgroundColor: 'rgba(16, 185, 129, 0.1)',
                    borderWidth: 2,
                    tension: 0.4,
                    fill: true
                }]
            },
            options: { responsive: true, maintainAspectRatio: false }
        });

        // Render Commodity Chart (Bar)
        const ctxCom = document.getElementById('commodityChart').getContext('2d');
        if(commodityChartInstance) commodityChartInstance.destroy();
        
        commodityChartInstance = new Chart(ctxCom, {
            type: 'doughnut',
            data: {
                labels: data.charts.komoditas.labels.length > 0 ? data.charts.komoditas.labels : ['No Data'],
                datasets: [{
                    data: data.charts.komoditas.values.length > 0 ? data.charts.komoditas.values : [1],
                    backgroundColor: ['#10b981', '#3b82f6', '#f59e0b', '#8b5cf6', '#64748b']
                }]
            },
            options: { responsive: true, maintainAspectRatio: false, plugins: { legend: { position: 'bottom' } } }
        });
        
    } catch(err) {
        console.error("Dashboard error:", err);
    }
}

// ==== LIST DATA ====
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
            tr.className = 'border-b hover:bg-slate-50';
            tr.innerHTML = `
                <td class="py-3 px-4 font-medium text-slate-800">${item.no_kontrak}</td>
                <td class="py-3 px-4">${item.tanggal_kontrak}</td>
                <td class="py-3 px-4">${(item.pembeli || '-').split('\\n')[0]}</td>
                <td class="py-3 px-4">${item.komoditi || '-'}</td>
                <td class="py-3 px-4 font-medium">${formatRupiah(item.nilai_transaksi)}</td>
                <td class="py-3 px-4">
                    <div class="flex gap-2">
                        <button onclick="loadKontrakPreview('${item.no_kontrak}'); switchTabDirect('kontrak-form');" class="text-teal-600 hover:underline text-xs flex items-center gap-1"><i class="fas fa-eye"></i> Preview</button>
                        <a href="/api/kontrak/export?no_kontrak=${encodeURIComponent(item.no_kontrak)}" target="_blank" class="text-blue-600 hover:underline text-xs flex items-center gap-1"><i class="fas fa-file-word"></i> .docx</a>
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
            tr.className = 'border-b hover:bg-slate-50';
            tr.innerHTML = `
                <td class="py-3 px-4">${item.no_invoice}</td>
                <td class="py-3 px-4">${item.no_kontrak}</td>
                <td class="py-3 px-4">${item.tanggal_transaksi}</td>
                <td class="py-3 px-4 font-medium text-slate-800">${formatRupiah(item.jumlah_pembayaran)}</td>
            `;
            tbody.appendChild(tr);
        });
    } catch(err) {
        console.error(err);
    }
}

// ==== KONTRAK LIVE PREVIEW (CLIENT-SIDE, NO SAVE NEEDED) ====
const MONTHS_ID = ['','Januari','Februari','Maret','April','Mei','Juni','Juli','Agustus','September','Oktober','November','Desember'];

function fmtRpLocal(v) {
    if (!v || isNaN(v)) return '-';
    return 'Rp' + Number(v).toLocaleString('id-ID', {minimumFractionDigits: 0});
}
function fmtRpFull(v) {
    if (!v || isNaN(v)) return 'Rp0';
    return 'Rp' + Number(v).toLocaleString('id-ID', {minimumFractionDigits: 0});
}
function safe(v, fb = '-') { return (v && String(v).trim()) ? String(v).trim() : fb; }
function fmtDateLocal(dateStr) {
    if (!dateStr) return '____ __________ ____';
    const [y, m, d] = dateStr.split('-');
    return `${parseInt(d)} ${MONTHS_ID[parseInt(m)]} ${y}`;
}

const TD_LBL  = `style="font-weight:600;white-space:nowrap;padding:1px 8px 1px 0;vertical-align:top;font-family:Calibri,sans-serif;font-size:10pt"`;
const TD_COL  = `style="padding:1px 6px 1px 0;vertical-align:top;font-family:Calibri,sans-serif;font-size:10pt"`;
const TD_VAL  = `style="padding:1px 0;vertical-align:top;font-family:Calibri,sans-serif;font-size:10pt"`;
const TD_LBL2 = `style="font-weight:600;white-space:nowrap;padding:1px 8px 1px 16px;vertical-align:top;font-family:Calibri,sans-serif;font-size:10pt"`;

function rowS(lbl, val, boldVal=false) {
    const v = boldVal ? `<strong>${val}</strong>` : val;
    return `<tr><td ${TD_LBL}>${lbl}</td><td ${TD_COL}>:</td><td ${TD_VAL} colspan="4">${v}</td></tr>`;
}
function rowD(l1, v1, l2, v2) {
    return `<tr>
      <td ${TD_LBL}>${l1}</td><td ${TD_COL}>:</td><td ${TD_VAL}>${v1}</td>
      <td ${TD_LBL2}>${l2}</td><td ${TD_COL}>:</td><td ${TD_VAL}>${v2}</td>
    </tr>`;
}

function buildLivePreview() {
    const g = id => { const el = document.getElementById(id); return el ? el.value : ''; };

    const noKontrak = g('k_no_kontrak');
    const tgl       = g('k_tanggal_kontrak');
    const lokasi    = safe(g('k_lokasi'), 'Makassar');
    const pemilik   = safe(g('k_pemilik_komoditas'), 'PT Perkebunan Nusantara I Regional 8');
    const pjlRaw    = safe(g('k_penjual'), 'PT Perkebunan Nusantara I Regional 8');
    const pjlLines  = pjlRaw.split('\n');
    const pjlNama   = pjlLines[0];
    const pjlAddr   = pjlLines[1] || 'Jalan Urip Sumoharjo No. 72-76, Kota Makassar';
    const pblNama   = safe(g('k_pembeli'), '[Nama Pembeli]');
    const pblAddr   = safe(g('k_alamat_pembeli'), '');
    const noReff    = safe(g('k_no_reff'));
    const alamatPbl = pblAddr !== '-' ? pblAddr : '';

    const komoditi  = safe(g('k_komoditi'));
    const jenisKom  = safe(g('k_jenis_komoditi'));
    const packaging = safe(g('k_packaging'));
    const simbol    = safe(g('k_simbol'));
    const deskripsi = safe(g('k_deskripsi_produk'));
    const mutu      = safe(g('k_mutu'));
    const kebun     = safe(g('k_kebun_produsen'));
    const pelab     = safe(g('k_pelabuhan_muat'));
    const satuan    = safe(g('k_satuan'), 'Unit');
    const vol       = parseFloat(g('k_volume')) || 0;
    const harga     = parseFloat(g('k_harga_satuan')) || 0;
    const premi     = parseFloat(g('k_premi')) || 0;
    const ppnPct    = parseFloat(g('k_ppn_persen')) || 11;

    const nilai      = (vol * harga) + premi;
    const nominalPpn = nilai * (ppnPct / 100);

    const volStr   = vol   > 0 ? vol.toLocaleString('id-ID') + ' ' + satuan : '-';
    const hrgStr   = harga > 0 ? fmtRpFull(harga) + ' per ' + satuan : '-';
    const prmiStr  = premi > 0 ? fmtRpLocal(premi) : '-';

    const kondisi  = safe(g('k_kondisi_penyerahan'));
    const waktu    = safe(g('k_waktu_penyerahan'));
    const lamaByr  = parseInt(g('k_lama_pembayaran_hari')) || 15;
    const metode   = safe(g('k_pembayaran_metode'), 'Tunai');
    const cara     = safe(g('k_pembayaran_cara'), 'Transfer');
    const bank     = safe(g('k_pembayaran_bank'), 'Bank Rakyat Indonesia');
    const atasNama = 'PT Perkebunan Nusantara I Regional 8';
    const rekNo    = 'No. 0050-01-005356-30-0';

    const SYARAT_DEF = [
        'Pembayaran dilaksanakan selambat-lambatnya 15 hari kalender setelah ditandatanganinya Kontrak penjualan',
        'Penyerahan barang dilaksanakan setelah diterima bukti transfer pembayaran',
        'Pengambilan barang selambat-lambatnya 15 hari kalender dari batas akhir tanggal pembayaran',
        'Biaya-biaya yang terkait dengan administrasi Bank menjadi beban pembeli',
    ];

    const dasar = 'Mengacu kepada tata Cara dan Ketentuan Penjualan Komoditi Perkebunan PT Perkebunan Nusantara III (Persero)';
    const jumlahStr = fmtRpFull(nilai);

    const pembayaranBlock = `
      <tr>
        <td ${TD_LBL} rowspan="4">Pembayaran</td>
        <td ${TD_COL} rowspan="4">:</td>
        <td ${TD_VAL}><strong>Metode</strong>&nbsp;&nbsp;&nbsp;:&nbsp;&nbsp;&nbsp;${metode}</td>
        <td ${TD_LBL2}>Cara<br>Pembayaran</td><td ${TD_COL}>:</td><td ${TD_VAL}>${cara}</td>
      </tr>
      <tr>
        <td ${TD_VAL}><strong>Nama Bank</strong>&nbsp;&nbsp;&nbsp;:&nbsp;&nbsp;&nbsp;${bank}</td>
        <td ${TD_LBL2}>Jatuh Tempo<br>Pembayaran</td><td ${TD_COL}>:</td><td ${TD_VAL}>Maksimal ${lamaByr} Hari Kalender</td>
      </tr>
      <tr>
        <td ${TD_VAL} colspan="4"><strong>Atas Nama</strong>&nbsp;&nbsp;&nbsp;:&nbsp;&nbsp;&nbsp;${atasNama}</td>
      </tr>
      <tr>
        <td ${TD_VAL} colspan="4"><strong>Rek No.</strong>&nbsp;&nbsp;&nbsp;&nbsp;&nbsp;&nbsp;:&nbsp;&nbsp;&nbsp;${rekNo}</td>
      </tr>`;

    const html = `
    <div style="font-family:Calibri,sans-serif;font-size:10pt;color:#000;padding:14px;background:white">
      <p style="text-align:center;margin:0 0 1px;font-size:11pt;font-weight:700;text-decoration:underline">KONTRAK PENJUALAN</p>
      <p style="text-align:center;margin:1px 0;font-size:10pt">Nomor : ${safe(noKontrak, '[No Kontrak]')}</p>
      <p style="text-align:center;margin:1px 0 10px;font-size:10pt">Bid Offer Nomor : </p>
      <table style="width:100%;border-collapse:collapse;font-size:10pt;font-family:Calibri,sans-serif">
        ${rowS('Pemilik Komoditas', pemilik, true)}
        <tr><td ${TD_LBL}>Penjual</td><td ${TD_COL}>:</td><td ${TD_VAL} colspan="4"><strong>${pjlNama}</strong><br>${pjlAddr}</td></tr>
        <tr><td ${TD_LBL}>Pembeli</td><td ${TD_COL}>:</td><td ${TD_VAL} colspan="4"><strong>${pblNama}</strong>${alamatPbl ? '<br>'+alamatPbl : ''}</td></tr>
        ${rowS('No. Referensi', noReff)}
        ${rowD('Komoditi', komoditi, 'Jenis Komoditi', jenisKom)}
        ${rowD('Packaging', packaging, 'Symbol', simbol)}
        ${rowS('Deskripsi Produk', deskripsi)}
        ${rowS('Mutu', mutu)}
        ${rowS('Produsen', kebun)}
        ${rowS('Pelabuhan Muat', pelab)}
        ${rowS('Volume', volStr)}
        ${rowD('Harga Satuan', hrgStr, 'Premi', prmiStr)}
        ${rowS('PPN', 'Tarif Efektif ' + ppnPct + '%')}
        ${rowS('Kondisi Penyerahan', kondisi)}
        ${pembayaranBlock}
        ${rowS('Waktu Penyerahan', waktu)}
        <tr><td ${TD_LBL} style="vertical-align:top;font-weight:600;font-family:Calibri,sans-serif;padding:1px 8px 1px 0">Syarat - Syarat Lain</td><td ${TD_COL}>:</td>
          <td ${TD_VAL} colspan="4">${SYARAT_DEF.map((s,i)=>`${String.fromCharCode(97+i)}.&nbsp;&nbsp;${s}`).join('<br>')}</td>
        </tr>
        ${rowS('Dasar Ketentuan', dasar)}
        ${rowS('Jumlah (Pokok)', jumlahStr)}
      </table>
      <p style="text-align:right;margin-top:14px;font-size:10pt;font-family:Calibri,sans-serif">${lokasi}, ${fmtDateLocal(tgl)}</p>
      <table style="width:100%;font-size:10pt;margin-top:4px;font-family:Calibri,sans-serif">
        <tr>
          <td style="width:50%;font-weight:700">Persetujuan Pembeli</td>
          <td style="width:50%;text-align:center;font-weight:700">PT Perkebunan Nusantara I Regional 8,</td>
        </tr>
        <tr><td style="height:52px"></td><td></td></tr>
        <tr>
          <td>(________________________)</td>
          <td style="text-align:center">(Pejabat Berwenang)</td>
        </tr>
      </table>
    </div>`;

    const panel = document.getElementById('kontrak-preview-panel');
    if (panel) panel.innerHTML = html;

    const elNilai = document.getElementById('k_preview_nilai');
    const elPpn   = document.getElementById('k_preview_ppn');
    if (elNilai) elNilai.innerText = fmtRpFull(nilai);
    if (elPpn)   elPpn.innerText   = fmtRpFull(nominalPpn);
}

function calculateKontrakPreview() { buildLivePreview(); }

function getVal(id) {
    let el = document.getElementById(id);
    return el ? el.value : null;
}

async function handleKontrakSubmit(e) {
    e.preventDefault();
    
    const payload = {
        no_kontrak: getVal('k_no_kontrak'),
        tanggal_kontrak: getVal('k_tanggal_kontrak'),
        status: getVal('k_status'),
        lokasi: getVal('k_lokasi'),
        pembeli: getVal('k_pembeli'),
        nama_direktur: getVal('k_nama_direktur'),
        alamat_pembeli: getVal('k_alamat_pembeli'),
        penjual: getVal('k_penjual'),
        pemilik_komoditas: getVal('k_pemilik_komoditas'),
        
        komoditi: getVal('k_komoditi'),
        jenis_komoditi: getVal('k_jenis_komoditi'),
        deskripsi_produk: getVal('k_deskripsi_produk'),
        tahun_panen: getVal('k_tahun_panen'),
        kebun_produsen: getVal('k_kebun_produsen'),
        volume: parseFloat(getVal('k_volume')) || 0,
        satuan: getVal('k_satuan'),
        harga_satuan: parseFloat(getVal('k_harga_satuan')) || 0,
        ppn_persen: parseFloat(getVal('k_ppn_persen')) || 0,
        premi: parseFloat(getVal('k_premi')) || 0,
        
        mutu: getVal('k_mutu'),
        packaging: getVal('k_packaging'),
        simbol: getVal('k_simbol'),
        chop: getVal('k_chop'),
        no_kav_chop: getVal('k_no_kav_chop'),
        pack_qty: parseFloat(getVal('k_pack_qty')) || 0,
        banyaknya_bale_karung: parseFloat(getVal('k_banyak_bale')) || 0,
        
        kondisi_penyerahan: getVal('k_kondisi_penyerahan'),
        waktu_penyerahan: getVal('k_waktu_penyerahan'),
        levering: getVal('k_levering'),
        pelabuhan_muat: getVal('k_pelabuhan_muat'),
        lama_pembayaran_hari: parseInt(getVal('k_lama_pembayaran_hari')) || 0,
        
        pembayaran_metode: getVal('k_pembayaran_metode'),
        pembayaran_cara: getVal('k_pembayaran_cara'),
        pembayaran_bank: getVal('k_pembayaran_bank')
    };
    
    try {
        const res = await fetch('/api/kontrak', {
            method: 'POST',
            headers: { 'Content-Type': 'application/json' },
            body: JSON.stringify(payload)
        });
        
        if(!res.ok) {
            let msg = "Gagal menyimpan kontrak.";
            try { 
                const errData = await res.json(); 
                if (Array.isArray(errData.detail)) msg += " " + errData.detail.map(e => e.loc[e.loc.length-1] + ': ' + e.msg).join(', ');
                else msg += " " + (errData.detail || ""); 
            } catch(e) {}
            throw new Error(msg);
        }
        
        showToast("Kontrak berhasil disimpan!");
        lastSavedKontrakId = payload.no_kontrak;
        document.getElementById('formCreateKontrak').reset();
        calculateKontrakPreview();
        // Load preview panel
        loadKontrakPreview(payload.no_kontrak);
    } catch (err) {
        showToast(err.message, 'error');
    }
}

// ==== KONTRAK PREVIEW & EXPORT ====
async function loadKontrakPreview(noKontrak) {
    const panel = document.getElementById('kontrak-preview-panel');
    const btn   = document.getElementById('btn-export-preview');
    if (!panel) return;
    panel.innerHTML = '<div class="flex items-center justify-center h-40"><span class="text-slate-400 text-sm animate-pulse">Memuat preview...</span></div>';
    try {
        const res = await fetch(`/api/kontrak/preview?no_kontrak=${encodeURIComponent(noKontrak)}`);
        if (!res.ok) throw new Error('Preview gagal dimuat');
        const html = await res.text();
        panel.innerHTML = '<div class="p-2">' + html + '</div>';
        btn.classList.remove('hidden');
        btn.setAttribute('data-no', noKontrak);
    } catch(e) {
        panel.innerHTML = `<div class="p-4 text-red-500 text-sm">Gagal memuat preview: ${e.message}</div>`;
    }
}

function exportKontrakFromPreview() {
    const btn = document.getElementById('btn-export-preview');
    const noKontrak = btn.getAttribute('data-no');
    if (!noKontrak) { showToast('Simpan kontrak terlebih dahulu', 'error'); return; }
    window.open(`/api/kontrak/export?no_kontrak=${encodeURIComponent(noKontrak)}`, '_blank');
}

function switchTabDirect(tabId) {
    document.querySelectorAll('.page-section').forEach(el => el.classList.remove('active'));
    document.querySelectorAll('.nav-item').forEach(el => el.classList.remove('active'));
    const section = document.getElementById(tabId);
    if (section) section.classList.add('active');
}

// ==== INVOICE ====
async function fetchKontrakForInvoice() {
    const noKontrak = document.getElementById('i_no_kontrak').value;
    if(!noKontrak) return;
    
    try {
        const res = await fetch(`/api/kontrak/${noKontrak}`);
        if(!res.ok) throw new Error("Kontrak tidak ditemukan");
        
        const data = await res.json();
        document.getElementById('i_lbl_pembeli').innerText = data.pembeli.split('\\n')[0] || '-';
        document.getElementById('i_lbl_komoditi').innerText = data.komoditi || '-';
        document.getElementById('i_lbl_vol_harga').innerText = `${data.volume} x ${formatRupiah(data.harga_satuan)}`;
        document.getElementById('i_lbl_ketentuan').innerText = data.kondisi_penyerahan || '-';
        document.getElementById('i_lbl_nilai').innerText = formatRupiah(data.nilai_transaksi);
        document.getElementById('i_lbl_ppn').innerText = formatRupiah(data.nominal_ppn);
        
        const estTotal = data.nilai_transaksi + data.nominal_ppn;
        document.getElementById('i_lbl_total').innerText = formatRupiah(estTotal);
        
        document.getElementById('i_no_invoice').value = "INV-" + data.no_kontrak;
    } catch(err) {
        showToast(err.message, 'error');
        document.getElementById('i_lbl_pembeli').innerText = '-';
        document.getElementById('i_lbl_komoditi').innerText = '-';
        document.getElementById('i_lbl_vol_harga').innerText = '-';
        document.getElementById('i_lbl_ketentuan').innerText = '-';
        document.getElementById('i_lbl_nilai').innerText = '-';
        document.getElementById('i_lbl_ppn').innerText = '-';
        document.getElementById('i_lbl_total').innerText = 'Rp 0';
    }
}

async function handleInvoiceSubmit(e) {
    e.preventDefault();
    const payload = {
        no_invoice: document.getElementById('i_no_invoice').value,
        no_kontrak: document.getElementById('i_no_kontrak').value,
        tanggal_transaksi: document.getElementById('i_tanggal_transaksi').value,
        pph_22_persen: parseFloat(document.getElementById('i_pph_22').value) || 0,
    };
    
    try {
        const res = await fetch('/api/invoice', {
            method: 'POST',
            headers: { 'Content-Type': 'application/json' },
            body: JSON.stringify(payload)
        });
        
        if(!res.ok) {
            let msg = "Gagal menyimpan invoice.";
            try { 
                const errData = await res.json(); 
                if (Array.isArray(errData.detail)) msg += " " + errData.detail.map(e => e.loc[e.loc.length-1] + ': ' + e.msg).join(', ');
                else msg += " " + (errData.detail || ""); 
            } catch(e) {}
            throw new Error(msg);
        }
        
        showToast("Invoice berhasil diterbitkan!");
        document.getElementById('formCreateInvoice').reset();
    } catch (err) {
        showToast(err.message, 'error');
    }
}

// ==== DELIVERY ORDER ====
async function fetchInvoiceForDO() {
    const noInvoice = document.getElementById('d_no_invoice').value;
    if(!noInvoice) return;
    
    try {
        const res = await fetch(`/api/invoice/${noInvoice}`);
        if(!res.ok) throw new Error("Invoice tidak ditemukan");
        
        const invoiceData = await res.json();
        
        // Fetch original kontract to get Levering/Barang details
        let kData = {};
        try {
            const kRes = await fetch(`/api/kontrak/${invoiceData.no_kontrak}`);
            if(kRes.ok) kData = await kRes.json();
        } catch(e) {}
        
        document.getElementById('d_lbl_kontrak').innerText = invoiceData.no_kontrak || '-';
        document.getElementById('d_lbl_barang').innerText = (kData.komoditi ? kData.komoditi : '') + ' / ' + (kData.volume ? kData.volume : '');
        document.getElementById('d_lbl_levering').innerText = kData.levering || '-';
        document.getElementById('d_lbl_tgl').innerText = invoiceData.tanggal_transaksi || '-';
        document.getElementById('d_lbl_tagihan').innerText = formatRupiah(invoiceData.jumlah_pembayaran);
        
        document.getElementById('d_no_do').value = "DO-" + invoiceData.no_invoice.replace("INV-", "");
    } catch(err) {
        showToast(err.message, 'error');
        document.getElementById('d_lbl_kontrak').innerText = '-';
        document.getElementById('d_lbl_barang').innerText = '-';
        document.getElementById('d_lbl_levering').innerText = '-';
        document.getElementById('d_lbl_tgl').innerText = '-';
        document.getElementById('d_lbl_tagihan').innerText = 'Rp 0';
    }
}

async function handleDOSubmit(e) {
    e.preventDefault();
    const payload = {
        no_do: document.getElementById('d_no_do').value,
        no_invoice: document.getElementById('d_no_invoice').value,
        tanggal_do: document.getElementById('d_tanggal_do').value,
        kepada_unit: document.getElementById('d_kepada_unit').value,
        nominal_transfer: parseFloat(document.getElementById('d_nominal_transfer').value) || 0,
    };
    
    try {
        const res = await fetch('/api/do', {
            method: 'POST',
            headers: { 'Content-Type': 'application/json' },
            body: JSON.stringify(payload)
        });
        
        if(!res.ok) {
            let msg = "Gagal menyimpan Delivery Order.";
            try { 
                const errData = await res.json(); 
                if (Array.isArray(errData.detail)) msg += " " + errData.detail.map(e => e.loc[e.loc.length-1] + ': ' + e.msg).join(', ');
                else msg += " " + (errData.detail || ""); 
            } catch(e) {}
            throw new Error(msg);
        }
        
        showToast("Delivery Order berhasil diterbitkan!");
        document.getElementById('formCreateDO').reset();
    } catch (err) {
        showToast(err.message, 'error');
    }
}

// Init
document.addEventListener("DOMContentLoaded", () => {
    const today = new Date().toISOString().split('T')[0];
    document.getElementById('k_tanggal_kontrak').value = today;
    document.getElementById('i_tanggal_transaksi').value = today;
    document.getElementById('d_tanggal_do').value = today;

    // Wire up live preview — any change in Kontrak form immediately updates the preview
    const kontrakFieldIds = [
        'k_no_kontrak','k_tanggal_kontrak','k_lokasi','k_pemilik_komoditas',
        'k_penjual','k_pembeli','k_nama_direktur','k_alamat_pembeli',
        'k_komoditi','k_jenis_komoditi','k_deskripsi_produk','k_tahun_panen',
        'k_kebun_produsen','k_volume','k_satuan','k_harga_satuan','k_ppn_persen',
        'k_premi','k_mutu','k_packaging','k_simbol','k_chop','k_pack_qty','k_banyak_bale',
        'k_kondisi_penyerahan','k_waktu_penyerahan','k_levering','k_pelabuhan_muat',
        'k_lama_pembayaran_hari','k_pembayaran_metode','k_pembayaran_cara','k_pembayaran_bank'
    ];
    kontrakFieldIds.forEach(id => {
        const el = document.getElementById(id);
        if (el) el.addEventListener('input', buildLivePreview);
    });

    // Show blank template preview immediately on load
    buildLivePreview();
    fetchDashboardData();
});
