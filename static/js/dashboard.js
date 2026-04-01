// ============================================================
// dashboard.js — Chart rendering & data fetching
// ============================================================

let trendChartInstance = null;
let commodityChartInstance = null;
let unitChartInstance = null;
let volumeChartInstance = null;
Chart.register(ChartDataLabels);
Chart.defaults.set('plugins.datalabels', { display: false });

async function fetchDashboardData() {
    const yearSelect = document.getElementById('dash-year-filter');
    const unitSelect = document.getElementById('dash-unit-filter');
    const komoditiSelect = document.getElementById('dash-komoditi-filter');
    
    const year = yearSelect ? yearSelect.value : new Date().getFullYear();
    const unit = unitSelect ? encodeURIComponent(unitSelect.value) : 'ALL';
    const komoditi = komoditiSelect ? encodeURIComponent(komoditiSelect.value) : 'ALL';

    // Update year label badge
    const yearLabel = document.getElementById('dash-year-label');
    if (yearLabel) {
        let labelText = year;
        if (unit !== 'ALL') labelText += ' - ' + decodeURIComponent(unit);
        if (komoditi !== 'ALL') labelText += ' - ' + decodeURIComponent(komoditi);
        yearLabel.innerText = labelText;
    }

    try {
        const res = await fetch(`/api/dashboard?year=${year}&unit=${unit}&komoditi=${komoditi}`);
        const data = await res.json();

        // --- Update Summary Cards ---
        document.getElementById('dash-nilai-transaksi').innerText = formatRupiah(data.summary.total_nilai_transaksi);
        document.getElementById('dash-cash-in').innerText = formatRupiah(data.summary.total_cash_in);
        document.getElementById('dash-volume-realisasi').innerText = data.summary.total_volume_realisasi.toLocaleString('id-ID', { minimumFractionDigits: 0, maximumFractionDigits: 2 }) + ' Kg';
        document.getElementById('dash-invoice-count').innerText = data.summary.total_invoice;
        document.getElementById('dash-do-count').innerText = data.summary.total_do;

        // --- Update SAP Stats (Missing counts) ---
        if (data.summary.sap_stats) {
            const updateStat = (id, count) => {
                const el = document.getElementById(id);
                if (el) {
                    el.innerText = count || 0;
                    if (count > 0) {
                        el.classList.remove('text-slate-400');
                        el.classList.add('text-rose-600');
                    } else {
                        el.classList.remove('text-rose-600');
                        el.classList.add('text-slate-400');
                    }
                }
            };
            updateStat('dash-sap-kontrak', data.summary.sap_stats.missing_kontrak);
            updateStat('dash-sap-so', data.summary.sap_stats.missing_so);
            updateStat('dash-sap-do', data.summary.sap_stats.missing_do);
            updateStat('dash-sap-billing', data.summary.sap_stats.missing_billing);
        }

        // Populasi dropdown tahun dari data available_years
        if (data.available_years && yearSelect) {
            const currentVal = yearSelect.value;
            const existingOpts = new Set([...yearSelect.options].map(o => o.value));
            data.available_years.forEach(y => {
                if (!existingOpts.has(String(y))) {
                    const opt = document.createElement('option');
                    opt.value = y;
                    opt.text = y;
                    yearSelect.appendChild(opt);
                }
            });
            yearSelect.value = currentVal;
        }

        // Populasi dropdown unit
        if (data.available_units && unitSelect) {
            const currentUnit = unitSelect.value;
            const existingOpts = new Set([...unitSelect.options].map(o => o.value));
            data.available_units.forEach(u => {
                if (!existingOpts.has(u)) {
                    const opt = document.createElement('option');
                    opt.value = u;
                    opt.text = u;
                    unitSelect.appendChild(opt);
                }
            });
            unitSelect.value = currentUnit || 'ALL';
        }

        // Populasi dropdown komoditas
        if (data.available_komoditas && komoditiSelect) {
            const currentKomoditi = komoditiSelect.value;
            const existingOpts = new Set([...komoditiSelect.options].map(o => o.value));
            data.available_komoditas.forEach(k => {
                if (!existingOpts.has(k)) {
                    const opt = document.createElement('option');
                    opt.value = k;
                    opt.text = k;
                    komoditiSelect.appendChild(opt);
                }
            });
            komoditiSelect.value = currentKomoditi || 'ALL';
        }

        // --- Tren Chart (3 lines: Kontrak + Invoice + Cash In) ---
        const ctxTrend = document.getElementById('trendChart').getContext('2d');
        if (trendChartInstance) trendChartInstance.destroy();
        trendChartInstance = new Chart(ctxTrend, {
            type: 'line',
            data: {
                labels: data.charts.bulanan.labels,
                datasets: [
                    {
                        label: 'Nilai Kontrak',
                        data: data.charts.bulanan.pendapatan,
                        borderColor: '#6366f1',
                        backgroundColor: 'rgba(99, 102, 241, 0.07)',
                        borderWidth: 2.5,
                        tension: 0.35,
                        fill: true,
                        pointBackgroundColor: '#fff',
                        pointBorderColor: '#6366f1',
                        pointRadius: 3.5,
                        pointHoverRadius: 6,
                    },
                    {
                        label: 'Nilai Invoice',
                        data: data.charts.bulanan.invoice,
                        borderColor: '#10b981',
                        backgroundColor: 'rgba(16, 185, 129, 0.05)',
                        borderWidth: 2.5,
                        tension: 0.35,
                        fill: false,
                        pointBackgroundColor: '#fff',
                        pointBorderColor: '#10b981',
                        pointRadius: 3.5,
                        pointHoverRadius: 6,
                    },
                    {
                        label: 'Cash In',
                        data: data.charts.bulanan.cashin,
                        borderColor: '#f59e0b',
                        backgroundColor: 'rgba(245, 158, 11, 0.04)',
                        borderWidth: 2,
                        borderDash: [5, 3],
                        tension: 0.35,
                        fill: false,
                        pointBackgroundColor: '#fff',
                        pointBorderColor: '#f59e0b',
                        pointRadius: 3,
                        pointHoverRadius: 5,
                    }
                ]
            },
            options: {
                responsive: true,
                maintainAspectRatio: false,
                plugins: {
                    legend: { display: false },
                    tooltip: {
                        callbacks: {
                            label: (ctx) => ` ${ctx.dataset.label}: ${formatRupiah(ctx.raw)}`
                        }
                    }
                },
                scales: {
                    y: {
                        beginAtZero: true,
                        grid: { color: 'rgba(0,0,0,0.04)', borderDash: [4, 4] },
                        ticks: {
                            callback: (val) => {
                                if (val >= 1_000_000_000) return 'Rp' + (val / 1_000_000_000).toFixed(1) + 'M';
                                if (val >= 1_000_000) return 'Rp' + (val / 1_000_000).toFixed(0) + 'jt';
                                return 'Rp' + val;
                            },
                            font: { size: 10 }
                        }
                    },
                    x: {
                        grid: { display: false },
                        ticks: { font: { size: 10 } }
                    }
                }
            }
        });

        // --- Bar Chart: Pendapatan per Unit Produksi ---
        const ctxUnit = document.getElementById('unitChart').getContext('2d');
        if (unitChartInstance) unitChartInstance.destroy();

        const barColors = ['#3b82f6', '#8b5cf6', '#f59e0b', '#ef4444', '#10b981', '#06b6d4'];
        unitChartInstance = new Chart(ctxUnit, {
            type: 'bar',
            data: {
                labels: data.charts.unit.labels,
                datasets: [{
                    label: 'Realisasi (IDR)',
                    data: data.charts.unit.values,
                    backgroundColor: barColors.slice(0, data.charts.unit.labels.length),
                    borderRadius: 6,
                    borderSkipped: false,
                }]
            },
            options: {
                responsive: true,
                maintainAspectRatio: false,
                plugins: {
                    legend: { display: false },
                    tooltip: {
                        callbacks: {
                            label: (ctx) => ` ${formatRupiah(ctx.raw)}`
                        }
                    }
                },
                scales: {
                    y: {
                        beginAtZero: true,
                        grid: { color: 'rgba(0,0,0,0.04)', borderDash: [4, 4] },
                        ticks: {
                            callback: (val) => {
                                if (val >= 1_000_000_000) return (val / 1_000_000_000).toFixed(1) + 'M';
                                if (val >= 1_000_000) return (val / 1_000_000).toFixed(0) + 'jt';
                                return val;
                            },
                            font: { size: 10 }
                        }
                    },
                    x: {
                        grid: { display: false },
                        ticks: {
                            font: { size: 9 },
                            maxRotation: 30,
                        }
                    }
                }
            }
        });

        // --- Bar Chart: Volume Penjualan Bulanan ---
        const ctxVol = document.getElementById('volumeChart').getContext('2d');
        if (volumeChartInstance) volumeChartInstance.destroy();
        volumeChartInstance = new Chart(ctxVol, {
            type: 'bar',
            data: {
                labels: data.charts.bulanan.labels,
                datasets: [{
                    label: 'Volume Realisasi (Kg)',
                    data: data.charts.bulanan.volume,
                    backgroundColor: '#f97316', // Orange
                    borderRadius: 6,
                }]
            },
            options: {
                responsive: true,
                maintainAspectRatio: false,
                plugins: {
                    legend: { display: false },
                    tooltip: {
                        callbacks: {
                            label: (ctx) => ` ${ctx.raw.toLocaleString('id-ID', { minimumFractionDigits: 0, maximumFractionDigits: 2 })} unit/Kg`
                        }
                    }
                },
                scales: {
                    y: {
                        beginAtZero: true,
                        ticks: {
                            callback: (val) => {
                                if (val >= 1000000) return (val/1000000).toFixed(1) + 'jt';
                                if (val >= 1000) return (val/1000).toFixed(0) + 'rb';
                                return val;
                            }
                        }
                    }
                }
            }
        });

        // --- Pie Chart: Portofolio Komoditas ---
        const ctxCom = document.getElementById('commodityChart').getContext('2d');
        if (commodityChartInstance) commodityChartInstance.destroy();
        
        const komValues = data.charts.komoditas.values;
        const komTotal = komValues.reduce((a, b) => a + (b || 0), 0);
        
        const chartColors = ['#10b981', '#3b82f6', '#f59e0b', '#8b5cf6', '#64748b', '#ef4444'];
        commodityChartInstance = new Chart(ctxCom, {
            type: 'pie',
            plugins: [ChartDataLabels],
            data: {
                labels: data.charts.komoditas.labels,
                datasets: [{
                    data: komValues,
                    backgroundColor: chartColors.slice(0, data.charts.komoditas.labels.length),
                    borderWidth: 2,
                    borderColor: '#fff',
                    hoverOffset: 15,
                }]
            },
            options: {
                responsive: true,
                maintainAspectRatio: false,
                layout: {
                    padding: { top: 10, bottom: 10 }
                },
                plugins: {
                    legend: {
                        position: 'bottom',
                        labels: { 
                            boxWidth: 8, 
                            font: { size: 10, weight: '600', family: 'Inter' }, 
                            padding: 15,
                            usePointStyle: true,
                            generateLabels: function(chart) {
                                const data = chart.data;
                                if (data.labels.length && data.datasets.length) {
                                    return data.labels.map(function(label, i) {
                                        const value = data.datasets[0].data[i];
                                        const percentage = komTotal > 0 ? ((value / komTotal) * 100).toFixed(1) : 0;
                                        return {
                                            text: `${label} (${percentage}%)`,
                                            fillStyle: data.datasets[0].backgroundColor[i],
                                            strokeStyle: data.datasets[0].borderColor,
                                            lineWidth: data.datasets[0].borderWidth,
                                            hidden: isNaN(data.datasets[0].data[i]) || chart.getDatasetMeta(0).data[i].hidden,
                                            index: i
                                        };
                                    });
                                }
                                return [];
                            }
                        }
                    },
                    tooltip: {
                        backgroundColor: 'rgba(255, 255, 255, 0.95)',
                        titleColor: '#1e293b',
                        bodyColor: '#475569',
                        borderColor: '#e2e8f0',
                        borderWidth: 1,
                        padding: 12,
                        boxPadding: 6,
                        usePointStyle: true,
                        callbacks: {
                            label: (ctx) => {
                                const value = ctx.raw;
                                const percentage = komTotal > 0 ? ((value / komTotal) * 100).toFixed(1) : 0;
                                return ` ${ctx.label}: ${formatRupiah(value)} (${percentage}%)`;
                            }
                        }
                    },
                    datalabels: {
                        color: '#fff',
                        font: { weight: 'bold', size: 11 },
                        formatter: (value, ctx) => {
                            const percent = komTotal > 0 ? ((value / komTotal) * 100).toFixed(0) : 0;
                            return percent > 5 ? percent + '%' : ''; // Only show if > 5% to avoid clutter
                        },
                        textShadowBlur: 4,
                        textShadowColor: 'rgba(0,0,0,0.5)',
                        display: 'auto'
                    }
                }
            }
        });

        // --- Monthly Breakdown Table (Kontrak | Invoice | Cash In | Selisih) ---
        const monthlyTbody = document.getElementById('monthly-breakdown-body');
        monthlyTbody.innerHTML = '';

        const pendapatanArr = data.charts.bulanan.pendapatan;
        const invoiceArr    = data.charts.bulanan.invoice || [];
        const cashinArr     = data.charts.bulanan.cashin;

        data.charts.bulanan.labels.forEach((label, i) => {
            const pend  = pendapatanArr[i] || 0;
            const inv   = invoiceArr[i]    || 0;
            const cash  = cashinArr[i]     || 0;
            const selisih = inv - cash;

            // Skip fully empty rows
            if (pend === 0 && inv === 0 && cash === 0) {
                const tr = document.createElement('tr');
                tr.className = 'border-b border-slate-50 text-xs text-slate-300';
                tr.innerHTML = `
                    <td class="py-2 px-3 font-medium">${label}</td>
                    <td class="py-2 px-3 text-right">-</td>
                    <td class="py-2 px-3 text-right">-</td>
                    <td class="py-2 px-3 text-right">-</td>
                    <td class="py-2 px-3 text-right">-</td>
                `;
                monthlyTbody.appendChild(tr);
                return;
            }

            const selisihClass = selisih <= 0 ? 'text-emerald-600' : 'text-amber-600';
            const selisihLabel = selisih === 0 ? 'Lunas' : (selisih < 0 ? formatRupiah(Math.abs(selisih)) : formatRupiah(selisih));

            const tr = document.createElement('tr');
            tr.className = 'border-b border-slate-50 hover:bg-slate-50/60 transition-colors';
            tr.innerHTML = `
                <td class="py-2.5 px-3 font-semibold text-slate-700 text-xs">${label}</td>
                <td class="py-2.5 px-3 text-right font-medium text-indigo-700 text-xs">${pend > 0 ? formatRupiah(pend) : '-'}</td>
                <td class="py-2.5 px-3 text-right font-bold text-slate-800 text-xs">${inv > 0 ? formatRupiah(inv) : '-'}</td>
                <td class="py-2.5 px-3 text-right font-bold text-emerald-700 text-xs">${cash > 0 ? formatRupiah(cash) : '-'}</td>
                <td class="py-2.5 px-3 text-right font-bold ${selisihClass} text-xs">
                    ${inv > 0 ? selisihLabel : '-'}
                </td>
            `;
            monthlyTbody.appendChild(tr);
        });

        // Total row
        const totalPend   = pendapatanArr.reduce((a, b) => a + b, 0);
        const totalInv    = invoiceArr.reduce((a, b) => a + b, 0);
        const totalCash   = cashinArr.reduce((a, b) => a + b, 0);
        const totalSelisih = totalInv - totalCash;
        const trTotal = document.createElement('tr');
        trTotal.className = 'bg-slate-50 font-bold border-t-2 border-slate-200';
        trTotal.innerHTML = `
            <td class="py-3 px-3 text-xs text-slate-700 font-bold uppercase tracking-wide">TOTAL</td>
            <td class="py-3 px-3 text-right text-xs text-indigo-700">${formatRupiah(totalPend)}</td>
            <td class="py-3 px-3 text-right text-xs text-slate-800">${formatRupiah(totalInv)}</td>
            <td class="py-3 px-3 text-right text-xs text-emerald-700">${formatRupiah(totalCash)}</td>
            <td class="py-3 px-3 text-right text-xs ${totalSelisih <= 0 ? 'text-emerald-600' : 'text-amber-600'}">${formatRupiah(Math.abs(totalSelisih))}</td>
        `;
        monthlyTbody.appendChild(trTotal);

    } catch (err) {
        console.error("Dashboard fetchDashboardData error:", err);
    }
}
