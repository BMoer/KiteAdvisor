/**
 * Kite Size Optimizer — UI Controller & Charts
 * Branded for LakeUnited (www.lakeunited.com)
 */

let windChart = null;
let monthlyChart = null;

// Kite card color palette
const KITE_COLORS = [
    { bg: 'rgba(8, 145, 178, 0.15)', border: '#0891b2', fill: 'rgba(8, 145, 178, 0.3)' },
    { bg: 'rgba(217, 70, 239, 0.15)', border: '#d946ef', fill: 'rgba(217, 70, 239, 0.3)' },
    { bg: 'rgba(245, 158, 11, 0.15)', border: '#f59e0b', fill: 'rgba(245, 158, 11, 0.3)' },
    { bg: 'rgba(34, 197, 94, 0.15)', border: '#22c55e', fill: 'rgba(34, 197, 94, 0.3)' },
    { bg: 'rgba(239, 68, 68, 0.15)', border: '#ef4444', fill: 'rgba(239, 68, 68, 0.3)' }
];

document.addEventListener('DOMContentLoaded', function () {
    // Slider displays
    const weightSlider = document.getElementById('weight-slider');
    const heightSlider = document.getElementById('height-slider');
    const kiteCountSlider = document.getElementById('kite-count-slider');

    weightSlider.addEventListener('input', () => {
        document.getElementById('weight-display').textContent = weightSlider.value + ' kg';
    });
    heightSlider.addEventListener('input', () => {
        document.getElementById('height-display').textContent = heightSlider.value + ' cm';
    });
    kiteCountSlider.addEventListener('input', () => {
        document.getElementById('kite-count-display').textContent = kiteCountSlider.value;
    });

    // Spot selection — update description
    const spotSelect = document.getElementById('spot-select');
    spotSelect.addEventListener('change', updateSpotDescription);
    updateSpotDescription();

    // Optimize button
    document.getElementById('optimize-btn').addEventListener('click', runOptimization);
});

function updateSpotDescription() {
    const spotKey = document.getElementById('spot-select').value;
    const spot = SPOTS[spotKey];
    const descEl = document.getElementById('spot-description');
    if (spot && descEl) {
        descEl.textContent = spot.flag + ' ' + spot.description;
    }
}

function runOptimization() {
    const weight = parseInt(document.getElementById('weight-slider').value);
    const skill = document.getElementById('skill-select').value;
    const style = document.getElementById('style-select').value;
    const spotKey = document.getElementById('spot-select').value;
    const numKites = parseInt(document.getElementById('kite-count-slider').value);

    // Show loading state
    const btn = document.getElementById('optimize-btn');
    const originalText = btn.textContent;
    btn.textContent = 'Berechne...';
    btn.disabled = true;

    // Small delay so UI updates before heavy computation
    setTimeout(() => {
        const result = optimizeKiteSizes(numKites, weight, skill, style, spotKey);
        displayResults(result, weight, skill, style, spotKey);
        btn.textContent = originalText;
        btn.disabled = false;
    }, 50);
}

function displayResults(result, weight, skill, style, spotKey) {
    const resultsSection = document.getElementById('results-section');
    resultsSection.classList.remove('hidden');

    // Spot info
    const spot = SPOTS[spotKey];
    document.getElementById('result-spot-name').textContent = spot.name + ' ' + spot.flag;

    // Coverage percentage
    const coveragePct = ((result.totalRideableDays / 365) * 100).toFixed(1);

    // Kite size cards
    const container = document.getElementById('kite-sizes');
    container.innerHTML = '';
    result.kiteSizes.forEach((size, i) => {
        const range = result.windRanges[i];
        const color = KITE_COLORS[i % KITE_COLORS.length];
        const card = document.createElement('div');
        card.className = 'kite-card';
        card.style.borderColor = color.border;
        card.style.background = color.bg;
        card.innerHTML =
            '<div class="kite-size-number">' + size + '<span class="kite-unit">m\u00b2</span></div>' +
            '<div class="kite-wind-range">' +
            '<span class="range-icon">\u{1F4A8}</span> ' +
            range.min + '\u2013' + range.max + ' Knoten' +
            '</div>';
        container.appendChild(card);
    });

    // Stats
    document.getElementById('total-days').textContent = result.totalRideableDays;
    document.getElementById('coverage-pct').textContent = coveragePct + '%';

    // Charts
    renderWindChart(result, spotKey);
    renderMonthlyChart(result);

    // Monthly detail table
    renderMonthlyTable(result);

    // Scroll to results
    setTimeout(() => {
        resultsSection.scrollIntoView({ behavior: 'smooth', block: 'start' });
    }, 100);
}

function renderWindChart(result, spotKey) {
    const ctx = document.getElementById('wind-chart').getContext('2d');
    const distribution = computeYearlyWindDistribution(spotKey);
    const maxKnots = 45;

    // Prepare data
    const labels = distribution.map(d => d.knots);
    const windDays = distribution.map(d => d.daysPerYear);
    const coveredDays = distribution.map((d, i) => result.coverageByKnot[i] || 0);
    const uncoveredDays = distribution.map((d, i) => d.daysPerYear - (result.coverageByKnot[i] || 0));

    if (windChart) windChart.destroy();

    windChart = new Chart(ctx, {
        type: 'bar',
        data: {
            labels: labels,
            datasets: [
                {
                    label: 'Fahrbare Tage',
                    data: coveredDays,
                    backgroundColor: 'rgba(8, 145, 178, 0.7)',
                    borderColor: '#0891b2',
                    borderWidth: 1,
                    borderRadius: 2
                },
                {
                    label: 'Nicht abgedeckt',
                    data: uncoveredDays,
                    backgroundColor: 'rgba(203, 213, 225, 0.5)',
                    borderColor: '#cbd5e1',
                    borderWidth: 1,
                    borderRadius: 2
                }
            ]
        },
        options: {
            responsive: true,
            maintainAspectRatio: false,
            plugins: {
                legend: {
                    position: 'top',
                    labels: { font: { size: 12 }, usePointStyle: true, padding: 16 }
                },
                tooltip: {
                    callbacks: {
                        title: function (items) { return items[0].label + ' Knoten'; },
                        label: function (item) {
                            return item.dataset.label + ': ' + item.raw.toFixed(1) + ' Tage/Jahr';
                        }
                    }
                },
                // Kite range annotations via custom plugin
                kiteRanges: {
                    ranges: result.windRanges,
                    sizes: result.kiteSizes,
                    colors: KITE_COLORS
                }
            },
            scales: {
                x: {
                    stacked: true,
                    title: { display: true, text: 'Windgeschwindigkeit (Knoten)', font: { size: 13 } },
                    ticks: {
                        callback: function (val) { return val % 5 === 0 ? val : ''; },
                        maxRotation: 0
                    },
                    grid: { display: false }
                },
                y: {
                    stacked: true,
                    title: { display: true, text: 'Tage pro Jahr', font: { size: 13 } },
                    grid: { color: 'rgba(0,0,0,0.06)' }
                }
            }
        },
        plugins: [kiteRangePlugin]
    });
}

/** Custom Chart.js plugin to draw kite range bands on the wind chart */
const kiteRangePlugin = {
    id: 'kiteRanges',
    afterDraw: function (chart) {
        const opts = chart.options.plugins.kiteRanges;
        if (!opts) return;
        const { ranges, sizes, colors } = opts;
        const ctx = chart.ctx;
        const xAxis = chart.scales.x;
        const yAxis = chart.scales.y;
        const top = yAxis.top;

        ranges.forEach((range, i) => {
            const color = colors[i % colors.length];
            const xStart = xAxis.getPixelForValue(range.min);
            const xEnd = xAxis.getPixelForValue(range.max);
            const labelY = top - 8 - i * 18;

            // Draw bracket line at top
            ctx.save();
            ctx.strokeStyle = color.border;
            ctx.lineWidth = 2.5;
            ctx.beginPath();
            ctx.moveTo(xStart, labelY + 4);
            ctx.lineTo(xStart, labelY);
            ctx.lineTo(xEnd, labelY);
            ctx.lineTo(xEnd, labelY + 4);
            ctx.stroke();

            // Label
            ctx.fillStyle = color.border;
            ctx.font = 'bold 11px system-ui, sans-serif';
            ctx.textAlign = 'center';
            ctx.fillText(sizes[i] + 'm\u00b2', (xStart + xEnd) / 2, labelY - 3);
            ctx.restore();
        });
    }
};

function renderMonthlyChart(result) {
    const ctx = document.getElementById('monthly-chart').getContext('2d');

    if (monthlyChart) monthlyChart.destroy();

    monthlyChart = new Chart(ctx, {
        type: 'bar',
        data: {
            labels: MONTH_NAMES_DE,
            datasets: [
                {
                    label: 'Fahrbare Tage',
                    data: result.monthlyRideableDays,
                    backgroundColor: result.monthlyRideableDays.map(d => {
                        const ratio = d / 31;
                        if (ratio > 0.5) return 'rgba(8, 145, 178, 0.8)';
                        if (ratio > 0.3) return 'rgba(8, 145, 178, 0.6)';
                        return 'rgba(8, 145, 178, 0.35)';
                    }),
                    borderColor: '#0891b2',
                    borderWidth: 1,
                    borderRadius: 4
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
                        label: function (item) {
                            const days = item.raw;
                            const total = DAYS_IN_MONTH[item.dataIndex];
                            const pct = ((days / total) * 100).toFixed(0);
                            return days.toFixed(1) + ' von ' + total + ' Tagen (' + pct + '%)';
                        }
                    }
                }
            },
            scales: {
                x: {
                    grid: { display: false }
                },
                y: {
                    title: { display: true, text: 'Fahrbare Tage', font: { size: 13 } },
                    grid: { color: 'rgba(0,0,0,0.06)' },
                    suggestedMax: 31
                }
            }
        }
    });
}

function renderMonthlyTable(result) {
    const tbody = document.getElementById('monthly-table-body');
    tbody.innerHTML = '';

    let totalRideable = 0;
    let totalDays = 0;

    for (let m = 0; m < 12; m++) {
        const rideable = result.monthlyRideableDays[m];
        const total = DAYS_IN_MONTH[m];
        const pct = ((rideable / total) * 100).toFixed(0);
        totalRideable += rideable;
        totalDays += total;

        const tr = document.createElement('tr');
        const barWidth = Math.round((rideable / 31) * 100);

        tr.innerHTML =
            '<td>' + MONTH_NAMES_FULL_DE[m] + '</td>' +
            '<td class="text-right">' + rideable.toFixed(1) + '</td>' +
            '<td class="text-right">' + total + '</td>' +
            '<td class="text-right">' + pct + '%</td>' +
            '<td><div class="mini-bar"><div class="mini-bar-fill" style="width:' + barWidth + '%"></div></div></td>';

        tbody.appendChild(tr);
    }

    // Footer row
    const tfoot = document.getElementById('monthly-table-foot');
    tfoot.innerHTML = '';
    const tr = document.createElement('tr');
    const totalPct = ((totalRideable / totalDays) * 100).toFixed(0);
    tr.innerHTML =
        '<td><strong>Gesamt</strong></td>' +
        '<td class="text-right"><strong>' + Math.round(totalRideable) + '</strong></td>' +
        '<td class="text-right"><strong>' + totalDays + '</strong></td>' +
        '<td class="text-right"><strong>' + totalPct + '%</strong></td>' +
        '<td></td>';
    tfoot.appendChild(tr);
}
