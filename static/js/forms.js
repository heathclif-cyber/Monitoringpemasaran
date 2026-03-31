// ============================================================
// forms.js — All form logic: Kontrak, Invoice, DO
//   Includes: auto-load, submit handlers, live previews
// ============================================================

// --- Kontrak Live Preview helpers ---
const TD_LBL = `style="font-weight:600;white-space:nowrap;padding:1px 8px 1px 0;vertical-align:top;font-family:Arial,sans-serif;font-size:9pt"`;
const TD_COL = `style="padding:1px 6px 1px 0;vertical-align:top;font-family:Arial,sans-serif;font-size:9pt"`;
const TD_VAL = `style="padding:1px 0;vertical-align:top;font-family:Arial,sans-serif;font-size:9pt"`;
const TD_LBL2 = `style="font-weight:600;white-space:nowrap;padding:1px 4px 1px 12px;vertical-align:top;font-family:Arial,sans-serif;font-size:9pt"`;

function rowS(lbl, val, boldVal = false) {
    const v = boldVal ? `<strong>${val}</strong>` : val;
    return `<tr><td ${TD_LBL}>${lbl}</td><td ${TD_COL}>:</td><td ${TD_VAL} colspan="4">${v}</td></tr>`;
}
function rowD(l1, v1, l2, v2) {
    return `<tr>
      <td ${TD_LBL}>${l1}</td><td ${TD_COL}>:</td><td ${TD_VAL}>${v1}</td>
      <td ${TD_LBL2}>${l2}</td><td ${TD_COL}>:</td><td ${TD_VAL}>${v2}</td>
    </tr>`;
}

// ==== AUTO LOAD UNTUK EDIT ====
async function autoLoadKontrak() {
    const no = document.getElementById('k_no_kontrak').value;
    if (!no) return;
    try {
        const res = await fetch('/api/kontrak/' + encodeURIComponent(no));
        if (!res.ok) return;
        const data = await res.json();
        const fields = ['tanggal_kontrak', 'lokasi', 'pemilik_komoditas', 'penjual', 'pembeli', 'nama_direktur', 'alamat_pembeli', 'komoditi', 'jenis_komoditi', 'deskripsi_produk', 'tahun_panen', 'kebun_produsen', 'volume', 'satuan', 'harga_satuan', 'ppn_persen', 'premi', 'mutu', 'packaging', 'simbol', 'chop', 'pack_qty', 'banyak_bale', 'kondisi_penyerahan', 'waktu_penyerahan', 'levering', 'pelabuhan_muat', 'lama_pembayaran_hari', 'penyerahan_hari', 'pembayaran_metode', 'pembayaran_cara', 'pembayaran_bank'];
        fields.forEach(f => {
            const el = document.getElementById('k_' + f);
            if (el && data[f] !== undefined) el.value = data[f];
        });
        showToast("Mode Edit: Data kontrak " + no + " berhasil dimuat.", "info");
        calculateKontrakPreview();
        buildLivePreview();
    } catch (e) { }
}

async function autoLoadInvoice() {
    const no = document.getElementById('i_no_invoice').value;
    if (!no) return;
    try {
        const res = await fetch('/api/invoice/' + encodeURIComponent(no));
        if (!res.ok) return;
        const data = await res.json();
        document.getElementById('i_no_kontrak').value = data.no_kontrak;
        document.getElementById('i_tanggal_transaksi').value = data.tanggal_transaksi;
        document.getElementById('i_pph_22').value = data.pph_22_persen;
        await fetchKontrakForInvoice();
        document.getElementById('i_no_invoice').value = no; // Restore ID after fetchKontrakForInvoice overwrites it
        showToast("Mode Edit: Data invoice " + no + " berhasil dimuat.", "info");
        buildInvoicePreview();
    } catch (e) { }
}

async function autoLoadDO() {
    const no = document.getElementById('d_no_do').value;
    if (!no) return;
    try {
        const res = await fetch('/api/do/' + encodeURIComponent(no));
        if (!res.ok) return;
        const data = await res.json();
        document.getElementById('d_no_invoice').value = data.no_invoice;
        document.getElementById('d_tanggal_do').value = data.tanggal_do;
        document.getElementById('d_kepada_unit').value = data.kepada_unit;
        document.getElementById('d_tanggal_pembayaran').value = data.tanggal_pembayaran;
        document.getElementById('d_nominal_transfer').value = data.nominal_transfer;
        await fetchInvoiceForDO();
        document.getElementById('d_no_do').value = no; // Restore ID after fetchInvoiceForDO overwrites it
        showToast("Mode Edit: Data DO " + no + " berhasil dimuat.", "info");
        buildDOPreview();
    } catch (e) { }
}

// ==== KONTRAK LIVE PREVIEW ====
function buildLivePreview() {
    const g = id => { const el = document.getElementById(id); return el ? el.value : ''; };

    const noKontrak = g('k_no_kontrak');
    const tgl = g('k_tanggal_kontrak');
    const lokasi = safe(g('k_lokasi'), 'Makassar');
    const pemilik = safe(g('k_pemilik_komoditas'), 'PT Perkebunan Nusantara I Regional 8');
    const pjlRaw = safe(g('k_penjual'), 'PT Perkebunan Nusantara I Regional 8');
    const pjlLines = pjlRaw.split('\n');
    const pjlNama = pjlLines[0];
    const pjlAddr = pjlLines[1] || 'Jalan Urip Sumoharjo No. 72-76, Kota Makassar';
    const pblNama = safe(g('k_pembeli'), '[Nama Pembeli]');
    const pblAddr = safe(g('k_alamat_pembeli'), '');
    const noReff = safe(g('k_no_reff'));
    const alamatPbl = pblAddr !== '-' ? pblAddr : '';

    const komoditi = safe(g('k_komoditi'));
    const jenisKom = safe(g('k_jenis_komoditi'));
    const packaging = safe(g('k_packaging'));
    const simbol = safe(g('k_simbol'));
    const deskripsi = safe(g('k_deskripsi_produk'));
    const mutu = safe(g('k_mutu'));
    const kebun = safe(g('k_kebun_produsen'));
    const pelab = safe(g('k_pelabuhan_muat'));
    const satuan = safe(g('k_satuan'), 'Unit');
    const vol = parseFloat(g('k_volume')) || 0;
    const harga = parseFloat(g('k_harga_satuan')) || 0;
    const premi = parseFloat(g('k_premi')) || 0;
    const ppnPct = parseFloat(g('k_ppn_persen')) || 11;

    const nilai = (vol * harga) + premi;
    const nominalPpn = nilai * (ppnPct / 100);

    const volStr = vol > 0 ? vol.toLocaleString('id-ID') + ' ' + satuan : '-';
    const hrgStr = harga > 0 ? fmtRpFull(harga) + ' per ' + satuan : '-';
    const prmiStr = premi > 0 ? fmtRpLocal(premi) : '-';

    const kondisi = safe(g('k_kondisi_penyerahan'));
    const waktu = safe(g('k_waktu_penyerahan'));
    const lamaByr = parseInt(g('k_lama_pembayaran_hari')) || 15;
    const ambilHari = parseInt(g('k_penyerahan_hari')) || 15;
    const metode = safe(g('k_pembayaran_metode'), 'Tunai');
    const cara = safe(g('k_pembayaran_cara'), 'Transfer');
    const bank = safe(g('k_pembayaran_bank'), 'Bank Rakyat Indonesia');
    const atasNama = 'PT Perkebunan Nusantara I Regional 8';
    const rekNo = 'No. 0050-01-005356-30-0';

    const SYARAT_DEF = [
        `Pembayaran dilaksanakan selambat-lambatnya ${lamaByr} hari kalender setelah ditandatanganinya Kontrak penjualan`,
        'Penyerahan barang dilaksanakan setelah diterima bukti transfer pembayaran',
        `Pengambilan barang selambat-lambatnya ${ambilHari} hari kalender dari batas akhir tanggal pembayaran`,
        'Biaya-biaya yang terkait dengan administrasi Bank menjadi beban pembeli',
    ];

    const dasar = 'Mengacu kepada tata Cara dan Ketentuan Penjualan Komoditi Perkebunan PT Perkebunan Nusantara III (Persero)';
    const jumlahStr = fmtRpFull(nilai);

    const html = `
    <div style="font-family:'Arial',sans-serif;font-size:9pt;color:#000;padding:14px;background:white">
      <h2 style="text-align:center;margin:0 0 2px;font-size:11pt;text-decoration:underline;"><strong>KONTRAK PENJUALAN</strong></h2>
      <p style="text-align:center;margin:2px 0 0;font-size:9pt">Nomor : ${safe(noKontrak, '[No Kontrak]')}</p>
      <p style="text-align:center;margin:2px 0 16px;font-size:9pt">Bid Offer Nomor : -</p>
      
      <table style="width:100%;border-collapse:collapse;font-size:9pt;">
        ${rowS('Pemilik Komoditas', pemilik, true)}
        <tr><td ${TD_LBL}>Penjual</td><td ${TD_COL}>:</td><td ${TD_VAL} colspan="4"><strong>${pjlNama}</strong><br>${pjlAddr}</td></tr>
        <tr><td ${TD_LBL}>Pembeli</td><td ${TD_COL}>:</td><td ${TD_VAL} colspan="4"><strong>${pblNama}</strong><br>${alamatPbl}</td></tr>
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
        
        <tr>
          <td ${TD_LBL}>Pembayaran</td>
          <td ${TD_COL}>:</td>
          <td ${TD_VAL}>
            <table style="width:100%;font-size:9pt;border-collapse:collapse;">
                <tr><td style="width:70px">Metode</td><td style="width:10px">:</td><td>${metode}</td></tr>
                <tr><td>Nama Bank</td><td>:</td><td>${bank}</td></tr>
                <tr><td>Atas Nama</td><td>:</td><td>${atasNama}</td></tr>
                <tr><td>Rek No.</td><td>:</td><td>${rekNo}</td></tr>
            </table>
          </td>
          <td ${TD_LBL2} style="padding-top:2px;">
            Cara<br>Pembayaran<br><br>Jatuh Tempo<br>Pembayaran
          </td>
          <td ${TD_COL} style="padding-top:2px;"><br>:<br><br><br>:</td>
          <td ${TD_VAL} style="padding-top:2px;"><br>${cara}<br><br><br>Maks. ${lamaByr} Hari</td>
        </tr>
        
        ${rowS('Waktu Penyerahan', waktu)}
        <tr>
          <td ${TD_LBL}>Syarat - Syarat Lain</td>
          <td ${TD_COL}>:</td>
          <td ${TD_VAL} colspan="4">
            <ol type="a" style="margin:0;padding-left:14px;">
              ${SYARAT_DEF.map(s => '<li>' + s + '</li>').join('')}
            </ol>
          </td>
        </tr>
        ${rowS('Dasar Ketentuan', dasar)}
        ${rowS('Jumlah (Pokok)', jumlahStr)}
        ${rowS('Catatan', '-')}
      </table>
      
      <p style="text-align:right;margin:24px 0 10px;font-size:9pt;">${lokasi}, ${fmtDateLocal(tgl)}</p>
      <div style="display:flex;justify-content:space-between;margin-top:20px;font-size:9pt;font-weight:600;text-align:center;">
        <div style="width:40%">Persetujuan Pembeli</div>
        <div style="width:40%">PT Perkebunan Nusantara I Regional 8</div>
      </div>
    </div>
    `;

    const panel = document.getElementById('kontrak-preview-panel');
    if (panel) panel.innerHTML = html;

    const elNilai = document.getElementById('k_preview_nilai');
    const elPpn = document.getElementById('k_preview_ppn');
    if (elNilai) elNilai.innerText = fmtRpFull(nilai);
    if (elPpn) elPpn.innerText = fmtRpFull(nominalPpn);
}

function calculateKontrakPreview() { buildLivePreview(); }

// ==== KONTRAK SUBMIT ====
async function handleKontrakSubmit(e) {
    e.preventDefault();
    const btn = document.getElementById('btn-submit-kontrak');
    const original = btn.innerHTML;
    btn.disabled = true;
    btn.innerHTML = '<i class="fas fa-circle-notch fa-spin mr-2"></i> Memproses...';

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
        pembayaran_bank: getVal('k_pembayaran_bank'),
        penyerahan_hari: parseInt(getVal('k_penyerahan_hari')) || 0,
        syarat_syarat: `a. Pembayaran dilaksanakan selambat-lambatnya ${parseInt(getVal('k_lama_pembayaran_hari')) || 15} hari kalender setelah ditandatanganinya Kontrak penjualan\nb. Penyerahan barang dilaksanakan setelah diterima bukti transfer pembayaran\nc. Pengambilan barang selambat-lambatnya ${parseInt(getVal('k_penyerahan_hari')) || 15} hari kalender dari batas akhir tanggal pembayaran\nd. Biaya-biaya yang terkait dengan administrasi Bank menjadi beban pembeli`
    };

    try {
        const res = await fetch('/api/kontrak', {
            method: 'POST',
            headers: { 'Content-Type': 'application/json' },
            body: JSON.stringify(payload)
        });

        if (!res.ok) {
            let msg = "Gagal menyimpan kontrak.";
            try {
                const errData = await res.json();
                msg = errData.message || msg;
            } catch (e) { }
            throw new Error(msg);
        }

        showToast("Kontrak " + payload.no_kontrak + " berhasil disimpan!", "success");
        lastSavedKontrakId = payload.no_kontrak;
        populateDropdowns();
        calculateKontrakPreview();
        loadKontrakPreview(payload.no_kontrak);
    } catch (err) {
        showToast(err.message, 'error');
    } finally {
        btn.disabled = false;
        btn.innerHTML = original;
    }
}

// ==== KONTRAK PREVIEW & EXPORT ====
async function loadKontrakPreview(noKontrak) {
    const panel = document.getElementById('kontrak-preview-panel');
    const btn = document.getElementById('btn-export-preview');
    if (!panel) return;
    panel.innerHTML = '<div class="flex items-center justify-center h-40"><span class="text-slate-400 text-sm animate-pulse">Memuat preview...</span></div>';
    try {
        const res = await fetch(`/api/kontrak/preview?no_kontrak=${encodeURIComponent(noKontrak)}`);
        if (!res.ok) throw new Error('Preview gagal dimuat');
        const html = await res.text();
        panel.innerHTML = '<div class="p-2">' + html + '</div>';
        btn.classList.remove('hidden');
        btn.setAttribute('data-no', noKontrak);
    } catch (e) {
        panel.innerHTML = `<div class="p-4 text-red-500 text-sm">Gagal memuat preview: ${e.message}</div>`;
    }
}

function exportKontrakFromPreview() {
    const btn = document.getElementById('btn-export-preview');
    const noKontrak = btn.getAttribute('data-no');
    if (!noKontrak) { showToast('Simpan kontrak terlebih dahulu', 'error'); return; }
    window.open(`/api/kontrak/export?no_kontrak=${encodeURIComponent(noKontrak)}`, '_blank');
}

// ==== INVOICE ====
async function fetchKontrakForInvoice() {
    const noKontrak = document.getElementById('i_no_kontrak').value;
    if (!noKontrak) return;

    try {
        const res = await fetch(`/api/kontrak/${noKontrak}`);
        if (!res.ok) throw new Error("Kontrak tidak ditemukan");

        const data = await res.json();
        window.currentInvoiceKontrak = data;

        document.getElementById('i_lbl_pembeli').innerText = data.pembeli ? data.pembeli.split('\n')[0] : '-';
        document.getElementById('i_lbl_komoditi').innerText = data.komoditi || '-';
        document.getElementById('i_lbl_vol_harga').innerText = `${data.volume} x ${formatRupiah(data.harga_satuan)}`;
        document.getElementById('i_lbl_ketentuan').innerText = data.kondisi_penyerahan || '-';
        document.getElementById('i_lbl_nilai').innerText = formatRupiah(data.nilai_transaksi);
        document.getElementById('i_lbl_ppn').innerText = formatRupiah(data.nominal_ppn);

        const estTotal = data.nilai_transaksi + data.nominal_ppn;
        document.getElementById('i_lbl_total').innerText = formatRupiah(estTotal);

        document.getElementById('i_no_invoice').value = data.no_kontrak;
        buildInvoicePreview();
    } catch (err) {
        showToast(err.message, 'error');
        window.currentInvoiceKontrak = null;
        document.getElementById('i_lbl_pembeli').innerText = '-';
        document.getElementById('i_lbl_komoditi').innerText = '-';
        document.getElementById('i_lbl_vol_harga').innerText = '-';
        document.getElementById('i_lbl_ketentuan').innerText = '-';
        document.getElementById('i_lbl_nilai').innerText = '-';
        document.getElementById('i_lbl_ppn').innerText = '-';
        document.getElementById('i_lbl_total').innerText = 'Rp 0';
        buildInvoicePreview();
    }
}

async function handleInvoiceSubmit(e) {
    e.preventDefault();
    const btn = e.target.querySelector('button[type="submit"]');
    const original = btn.innerHTML;
    btn.disabled = true;
    btn.innerHTML = '<i class="fas fa-circle-notch fa-spin mr-2"></i> Memproses...';
    
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

        if (!res.ok) {
            let msg = "Gagal menyimpan invoice.";
            try {
                const errData = await res.json();
                msg = errData.message || msg;
            } catch (e) { }
            throw new Error(msg);
        }

        showToast("Invoice " + payload.no_invoice + " berhasil diterbitkan!", "success");
        populateDropdowns();
    } catch (err) {
        showToast(err.message, 'error');
    } finally {
        btn.disabled = false;
        btn.innerHTML = original;
    }
}

// ==== INVOICE PREVIEW ====
function buildInvoicePreview() {
    const noInv = document.getElementById('i_no_invoice').value || '[No Invoice]';
    const noK = document.getElementById('i_no_kontrak').value || '[No Kontrak]';
    const tgl = document.getElementById('i_tanggal_transaksi').value || '';
    const pph = parseFloat(document.getElementById('i_pph_22').value) || 0;

    let k = window.currentInvoiceKontrak || {};

    const vol = parseFloat(k.volume) || 0;
    const hrg = parseFloat(k.harga_satuan) || 0;
    const nilai = (vol * hrg) + (parseFloat(k.premi) || 0);
    const ppnPct = parseFloat(k.ppn_persen) || 11;
    const nomPpn = nilai * (ppnPct / 100);
    const estTotal = nilai + nomPpn;

    const lamaStr = k.lama_pembayaran_hari ? (k.lama_pembayaran_hari + ' hari') : '-';

    const tableStyle = 'width:100%; border-collapse:collapse; font-size:9pt; font-family:"Calibri", Arial, sans-serif; color:#000; border:1px solid #000; background-color:#fff;';
    const tdStyle = 'border:1px solid #000; padding:4px 6px; vertical-align:top;';
    const thStyle = 'border:1px solid #000; padding:4px 6px; vertical-align:middle; text-align:center; font-weight:bold;';

    const pbl = k.pembeli ? k.pembeli.replace(/\n/g, '<br>') : '[Nama Pembeli]';

    const html = `
    <div style="padding:10px; max-width:800px; overflow-x:auto;">
        <table style="${tableStyle}">
            <tr>
                <td style="${tdStyle}" colspan="5" rowspan="4">
                    <strong>Kepada Yth:</strong><br>
                    <strong>${pbl}</strong><br>
                    Di –<br>
                    &nbsp;&nbsp;&nbsp;&nbsp;Tempat
                </td>
                <td style="${tdStyle} text-align:center; vertical-align:middle; font-size:16pt;" colspan="5">
                    <strong>Proforma Invoice</strong>
                </td>
            </tr>
            <tr>
                <td style="${tdStyle}" colspan="5"><strong>Proforma Invoice No:</strong><br>${noInv}</td>
            </tr>
            <tr>
                <td style="${tdStyle}" colspan="5"><strong>Kontrak No:</strong><br>${noK}</td>
            </tr>
            <tr>
                <td style="${tdStyle}" colspan="5"><strong>No. Ref Pembeli:</strong><br>${k.no_reff || '-'}</td>
            </tr>
            <tr>
                <td style="${tdStyle}" colspan="5"><strong>Produsen:</strong><br>${k.kebun_produsen || '-'}</td>
                <td style="${tdStyle}" colspan="5"><strong>Tanggal:</strong><br>${tgl || '-'}</td>
            </tr>
            <tr>
                <td style="${tdStyle}" colspan="5" rowspan="3">
                    <strong>Deskripsi Produk:</strong><br>
                    <strong>${k.komoditi || '-'}</strong>
                </td>
                <td style="${tdStyle}" colspan="5"><strong>Tanggal Jatuh Tempo:</strong><br>${lamaStr}</td>
            </tr>
            <tr>
                <td style="${tdStyle}" colspan="5"><strong>Mutu:</strong><br>${k.mutu || '-'}</td>
            </tr>
            <tr>
                <td style="${tdStyle}" colspan="5"><strong>PPN:</strong></td>
            </tr>
            <tr>
                <td style="${tdStyle}" colspan="5"><strong>Kondisi Penyerahan:</strong><br>${k.kondisi_penyerahan || '-'}</td>
                <td style="${tdStyle}" colspan="5"><strong>Pelabuhan Muat:</strong><br>${k.pelabuhan_muat || '-'}</td>
            </tr>
            <tr>
                <td style="${tdStyle} text-align:center;" colspan="10">Untuk dan atas nama PT Perkebunan Nusantara I, harap dilakukan pembayaran atas penyerahan:</td>
            </tr>
            <tr>
                <td style="${thStyle}">No.<br>Reff</td>
                <td style="${thStyle}">Jenis<br>Komoditi</td>
                <td style="${thStyle}">Packaging</td>
                <td style="${thStyle}">Chop</td>
                <td style="${thStyle}">Symbol/<br>Kebun</td>
                <td style="${thStyle}">Pack<br>Qty</td>
                <td style="${thStyle}">Volume<br>(Kg)</td>
                <td style="${thStyle}">Harga<br>(IDR)</td>
                <td style="${thStyle}" colspan="2">Nilai Rupiah</td>
            </tr>
            <tr>
                <td style="${tdStyle}">-</td>
                <td style="${tdStyle}">${k.komoditi || '-'}</td>
                <td style="${tdStyle}">${k.packaging || '-'}</td>
                <td style="${tdStyle}">-</td>
                <td style="${tdStyle}">${k.simbol || '-'}</td>
                <td style="${tdStyle}">-</td>
                <td style="${tdStyle} text-align:right;">${vol > 0 ? vol.toLocaleString('id-ID') : '-'}</td>
                <td style="${tdStyle} text-align:right;">${hrg > 0 ? hrg.toLocaleString('id-ID', {minimumFractionDigits:2, maximumFractionDigits:2}) : '-'}</td>
                <td style="${tdStyle} border-right:none;">Rp</td>
                <td style="${tdStyle} text-align:right; border-left:none;">${nilai > 0 ? nilai.toLocaleString('id-ID') : '-'}</td>
            </tr>
            <tr>
                <td style="${tdStyle} text-align:right;" colspan="8"><strong>PPN</strong></td>
                <td style="${tdStyle} border-right:none;">Rp</td>
                <td style="${tdStyle} text-align:right; border-left:none;"><strong>${nomPpn > 0 ? nomPpn.toLocaleString('id-ID') : '-'}</strong></td>
            </tr>
            <tr>
                <td style="${tdStyle} text-align:right;" colspan="8"><strong>Jumlah Pembayaran</strong></td>
                <td style="${tdStyle} border-right:none;">Rp</td>
                <td style="${tdStyle} text-align:right; border-left:none;">${estTotal > 0 ? estTotal.toLocaleString('id-ID') : '-'}</td>
            </tr>
            <tr>
                <td style="${tdStyle}" colspan="10">
                    <strong>Terbilang:</strong><br>
                    <i>${k.terbilang || '-'} Rupiah</i>
                </td>
            </tr>
            <tr>
                <td style="${tdStyle}" colspan="10">
                    <strong>Transfer Ke:</strong><br>
                    ${k.pembayaran_atas_nama || 'PT Perkebunan Nusantara I Regional 8'} ${k.pembayaran_bank || 'Bank Rakyat Indonesia'}<br>
                    No. Rekening: ${k.pembayaran_rek_no || '0050-01-005356-30-0'}
                </td>
            </tr>
        </table>
    </div>
    `;

    const panel = document.getElementById('invoice-preview-panel');
    if (panel) panel.innerHTML = html;
}

// ==== DELIVERY ORDER ====
async function fetchInvoiceForDO() {
    const noInvoice = document.getElementById('d_no_invoice').value;
    if (!noInvoice) return;

    try {
        const res = await fetch(`/api/invoice/${noInvoice}`);
        if (!res.ok) throw new Error("Invoice tidak ditemukan");

        const invoiceData = await res.json();

        let kData = {};
        try {
            const kRes = await fetch(`/api/kontrak/${invoiceData.no_kontrak}`);
            if (kRes.ok) kData = await kRes.json();
        } catch (e) { }

        window.currentDOKontrak = kData;

        document.getElementById('d_lbl_kontrak').innerText = invoiceData.no_kontrak || '-';
        document.getElementById('d_lbl_pembeli').innerText = (kData.pembeli ? kData.pembeli.split('\n')[0] : '-');
        document.getElementById('d_lbl_komoditi').innerText = (kData.komoditi ? kData.komoditi : '-');
        document.getElementById('d_lbl_volume').innerText = (kData.volume || 0) + ' ' + (kData.satuan || '');
        document.getElementById('d_lbl_total').innerText = formatRupiah(invoiceData.jumlah_pembayaran);

        document.getElementById('d_no_do').value = invoiceData.no_invoice.replace("INV-", "");
        buildDOPreview();
    } catch (err) {
        showToast(err.message, 'error');
        window.currentDOKontrak = null;
        document.getElementById('d_lbl_kontrak').innerText = '-';
        document.getElementById('d_lbl_pembeli').innerText = '-';
        document.getElementById('d_lbl_komoditi').innerText = '-';
        document.getElementById('d_lbl_volume').innerText = '-';
        document.getElementById('d_lbl_total').innerText = 'Rp 0';
    }
}

async function handleDOSubmit(e) {
    e.preventDefault();
    const btn = document.getElementById('btn-submit-do') || e.target.querySelector('button[type="submit"]');
    const original = btn.innerHTML;
    btn.disabled = true;
    btn.innerHTML = '<i class="fas fa-circle-notch fa-spin mr-2"></i> Memproses...';

    const payload = {
        no_do: document.getElementById('d_no_do').value,
        no_invoice: document.getElementById('d_no_invoice').value,
        tanggal_do: document.getElementById('d_tanggal_do').value,
        kepada_unit: document.getElementById('d_kepada_unit').value,
        nominal_transfer: parseFloat(document.getElementById('d_nominal_transfer').value) || 0,
        tanggal_pembayaran: document.getElementById('d_tanggal_pembayaran').value || null,
    };

    try {
        const res = await fetch('/api/do', {
            method: 'POST',
            headers: { 'Content-Type': 'application/json' },
            body: JSON.stringify(payload)
        });

        if (!res.ok) {
            let msg = "Gagal menyimpan Delivery Order.";
            try {
                const errData = await res.json();
                msg = errData.message || msg;
            } catch (e) { }
            throw new Error(msg);
        }

        showToast("Delivery Order " + payload.no_do + " berhasil diterbitkan!", "success");
    } catch (err) {
        showToast(err.message, 'error');
    } finally {
        btn.disabled = false;
        btn.innerHTML = original;
    }
}

// ==== DO PREVIEW ====
function buildDOPreview() {
    const noDo = document.getElementById('d_no_do').value || '[No DO]';
    const noInv = document.getElementById('d_no_invoice').value || '[No Invoice]';
    const tgl = document.getElementById('d_tanggal_do').value || '';
    const unit = document.getElementById('d_kepada_unit').value || '-';

    const k = window.currentDOKontrak || {};

    const tableStyle = 'width:100%; border-collapse:collapse; font-size:9pt; font-family:"Calibri", Arial, sans-serif; color:#000; border:1px solid #000; background-color:#fff;';
    const tdStyle = 'border:1px solid #000; padding:6px; vertical-align:top;';
    const tdCenter = 'border:1px solid #000; padding:6px; vertical-align:top; text-align:center;';
    const thStyle = 'border:1px solid #000; padding:6px; vertical-align:middle; text-align:center; font-weight:bold;';

    const pembeli = k.pembeli ? k.pembeli.split('\\n')[0] : '-';
    // tgl is YYYY-MM-DD from input type=date.
    const tglDoStr = tgl ? tgl.split('-').reverse().join('/') : '-'; 
    
    const volStr = k.volume ? Number(k.volume).toLocaleString('id-ID') : '-';
    const baleStr = k.banyaknya_bale_karung ? Number(k.banyaknya_bale_karung) : '-';

    const html = `
    <div style="padding:10px; max-width:800px; overflow-x:auto;">
        <table style="${tableStyle}">
            <tr>
                <td style="${tdCenter} width:40%;" colspan="3">
                    <strong>PT PERKEBUNAN NUSANTARA I</strong><br>
                    <strong>REGIONAL 8</strong><br>
                    <span style="font-size:8pt">Jalan Urip Sumoharjo No 72-76, Kota Makassar</span>
                </td>
                <td style="${tdCenter} vertical-align:middle; font-size:11pt; width:30%;" colspan="2">
                    <strong>DELIVERY ORDER</strong>
                </td>
                <td style="${tdStyle} width:30%;" colspan="2">
                    <strong>No.</strong><br>${noDo}<br><br>
                    <strong>Tanggal</strong><br>${tglDoStr}
                </td>
            </tr>
            <tr>
                <td style="${tdStyle}" colspan="7">
                    <table style="width:100%; border:none; padding:0; margin:0; font-size:9pt;">
                        <tr><td style="width:70px;">Kepada</td><td style="width:10px;">:</td><td>Manajer Unit ${unit}</td></tr>
                        <tr><td>Alamat</td><td>:</td><td>-</td></tr>
                    </table>
                </td>
            </tr>
            <tr>
                <td style="${tdStyle}" colspan="7">
                    Atas penyerahan D.O. harap diserahkan barang-barang tersebut di bawah ini:<br>
                    <table style="width:100%; border:none; padding:0; margin:0; margin-top:4px; font-size:9pt;">
                        <tr><td style="width:100px;">Kepada</td><td style="width:10px;">:</td><td>${pembeli}</td></tr>
                        <tr><td>Jenis Barang</td><td>:</td><td>${k.komoditi || '-'} <span style="display:inline-block; width:100px;"></span> Tahun panen: ${k.tahun_panen || '-'}</td></tr>
                    </table>
                </td>
            </tr>
            <tr>
                <td style="${thStyle}">Kebun</td>
                <td style="${thStyle}">Jenis<br>Produk/Mutu</td>
                <td style="${thStyle}">Banyaknya<br>Bale/Karung</td>
                <td style="${thStyle}">No.<br>Kav./Chop</td>
                <td style="${thStyle}">No. Kontrak</td>
                <td style="${thStyle}">Berat Kotor/<br>Bersih (Kg)</td>
                <td style="${thStyle}">Levering</td>
            </tr>
            <tr>
                <td style="${tdCenter} height:100px;">${k.kebun_produsen || '-'}</td>
                <td style="${tdCenter}">${k.deskripsi_produk || k.komoditi || '-'}</td>
                <td style="${tdCenter}">${baleStr}</td>
                <td style="${tdCenter}">${k.no_kav_chop || '-'}</td>
                <td style="${tdStyle}">${k.no_kontrak || '-'}</td>
                <td style="${tdCenter}">${volStr}</td>
                <td style="${tdCenter}">${k.levering || '-'}</td>
            </tr>
            <tr>
                <td style="${tdStyle}" colspan="7">
                    <strong>CATATAN :</strong><br><br>
                    ${k.catatan && k.catatan !== '-' ? k.catatan : ''}<br><br>
                </td>
            </tr>
        </table>
    </div>
    `;

    const panel = document.getElementById('do-preview-panel');
    if (panel) panel.innerHTML = html;
}
