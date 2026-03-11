import Chart from 'chart.js/auto';

// Global variables
const API_BASE = '/api/dbmetrics';
const DOMAIN_API_BASE = '/api/domain';
const INSTANCE_API_BASE = '/api/instance';
const TOKEN = 'd5HJuONXNZf';

const MONTH_COLORS = [
  '#f87171', '#fb923c', '#fbbf24', '#a3e635', '#4ade80', '#34d399',
  '#2dd4bf', '#60a5fa', '#818cf8', '#a78bfa', '#e879f9', '#fb7185'
];

// Store chart instances
let mainChartInstance = null;
let currentChartType = 'line';
let currentMetricData = [];

// DOM Elements
const domainSelect = document.getElementById('domainSelect');
const instanceSelect = document.getElementById('instanceSelect');
const metricsSelect = document.getElementById('metricsSelect');
const searchBtn = document.getElementById('searchBtn');

// Configure Chart.js global defaults
Chart.defaults.font.family = "'Inter', sans-serif";
Chart.defaults.color = "#64748b";
Chart.defaults.scale.grid.color = "#f1f5f9";
Chart.defaults.plugins.tooltip.backgroundColor = "rgba(30, 41, 59, 0.9)";
Chart.defaults.plugins.tooltip.padding = 10;
Chart.defaults.plugins.tooltip.cornerRadius = 4;

document.addEventListener('DOMContentLoaded', async () => {
  // Load domains first
  await loadDomains();

  // Initial load
  loadData();

  // Bind events
  searchBtn.addEventListener('click', loadData);
  domainSelect.addEventListener('change', async (e) => {
    await loadInstances(e.target.value);
    // Optionally trigger search automatically when domain changes:
    // loadData();
  });

  // Bind chart type toggles
  document.querySelectorAll('.type-btn').forEach(btn => {
    btn.addEventListener('click', (e) => {
      document.querySelectorAll('.type-btn').forEach(b => b.classList.remove('active'));
      const targetBtn = e.currentTarget;
      targetBtn.classList.add('active');
      currentChartType = targetBtn.dataset.type;

      if (currentMetricData.length > 0) {
        const metricsName = metricsSelect.options[metricsSelect.selectedIndex].text;
        updateChart('mainChart', metricsName, currentMetricData, '#22c55e', mainChartInstance, (instance) => {
          mainChartInstance = instance;
        });
      }
    });
  });

  // Bind resize event to re-align stats
  window.addEventListener('resize', () => {
    if (mainChartInstance && currentMetricData.length > 0) {
      const labels = currentMetricData.map(item => parseDateString(item.time));
      updateChartStatsGrid(labels, mainChartInstance);
    }
  });
});

async function loadDomains() {
  try {
    const url = new URL(DOMAIN_API_BASE, window.location.origin);
    url.searchParams.append('token', TOKEN);

    const response = await fetch(url.toString(), {
      method: 'GET',
      headers: { 'Accept': 'application/json' }
    });

    if (!response.ok) throw new Error(`HTTP Error: ${response.status}`);

    const data = await response.json();
    let domains = data.result || [];

    // Sort by domainId ascending
    domains.sort((a, b) => a.domainId - b.domainId);

    // Clear and populate select box
    domainSelect.innerHTML = '';
    domains.forEach(domain => {
      const option = document.createElement('option');
      option.value = domain.domainId;
      option.textContent = domain.name;
      domainSelect.appendChild(option);
    });

  } catch (error) {
    console.error('Failed to load domains:', error);
    domainSelect.innerHTML = '<option value="1000">기본 도메인(로드 실패)</option>';
  }

  // Load instances for the initially selected domain
  if (domainSelect.value) {
    await loadInstances(domainSelect.value);
  }
}

async function loadInstances(domainId) {
  try {
    const url = new URL(INSTANCE_API_BASE, window.location.origin);
    url.searchParams.append('token', TOKEN);
    url.searchParams.append('domain_id', domainId);

    const response = await fetch(url.toString(), {
      method: 'GET',
      headers: { 'Accept': 'application/json' }
    });

    if (!response.ok) throw new Error(`HTTP Error: ${response.status}`);

    const data = await response.json();
    let instances = data.result || [];

    // Sort by instanceId ascending
    instances.sort((a, b) => a.instanceId - b.instanceId);

    // Clear and populate select box
    instanceSelect.innerHTML = '<option value="">전체 (도메인 단위조회)</option>';
    instances.forEach(instance => {
      const option = document.createElement('option');
      option.value = instance.instanceId;
      option.textContent = instance.name;
      instanceSelect.appendChild(option);
    });

  } catch (error) {
    console.error(`Failed to load instances for domain ${domainId}:`, error);
    instanceSelect.innerHTML = '<option value="">전체 (도메인 단위조회)</option>';
  }
}

async function loadData() {
  const domainId = domainSelect.value;
  const instanceId = instanceSelect.value;
  const metrics = metricsSelect.value;
  const metricsName = metricsSelect.options[metricsSelect.selectedIndex].text;

  searchBtn.disabled = true;
  searchBtn.textContent = '조회 중...';

  try {
    const today = new Date();
    const fetchPromises = [];

    // 1년을 12개의 단위로 (월별 분할) 조회 - 최대 31일 제한 우회 및 일별 데이터(1440분) 지정
    for (let i = 11; i >= 0; i--) {
      const monthStart = new Date(today.getFullYear(), today.getMonth() - i, 1);
      const monthEnd = new Date(today.getFullYear(), today.getMonth() - i + 1, 0);
      fetchPromises.push(
        fetchMetricData(domainId, instanceId, formatDateParam(monthStart), formatDateParam(monthEnd), 1440, metrics)
          .catch(err => {
            console.warn(`Failed to fetch partially for ${formatDateParam(monthStart)}`, err);
            return []; // 부분 실패 시 빈 배열 처리로 무시
          })
      );
    }

    const results = await Promise.all(fetchPromises);

    // 병합 및 시간순 정렬
    let metricData = [];
    results.forEach(res => { metricData.push(...res); });
    metricData.sort((a, b) => String(a.time).localeCompare(String(b.time)));

    // 중복된 지표 시간 제거
    const uniqueData = [];
    const timeSet = new Set();
    metricData.forEach(item => {
      if (!timeSet.has(item.time)) {
        timeSet.add(item.time);
        uniqueData.push(item);
      }
    });

    currentMetricData = uniqueData; // Save for toggle

    // Update UI Elements for Chart
    document.getElementById('chartTitle').textContent = metricsName;

    // Update main chart
    updateChart('mainChart', metricsName, currentMetricData, '#22c55e', mainChartInstance, (instance) => {
      mainChartInstance = instance;
    });

    // Update Summary Cards
    updateSummaryCardsPartial(metrics, currentMetricData);

  } catch (error) {
    console.error('Data loading failed:', error);
    mockDataOnFailPartial(metrics, metricsName);
  } finally {
    searchBtn.disabled = false;
    searchBtn.textContent = '조회';
  }
}

async function fetchMetricData(domainId, instanceId, startTime, endTime, intervalMinute, metrics) {
  const endpoint = instanceId ? `${API_BASE}/instance` : `${API_BASE}/domain`;
  const url = new URL(endpoint, window.location.origin);

  // Construct params
  url.searchParams.append('token', TOKEN);
  url.searchParams.append('domain_id', domainId);
  if (instanceId) {
    url.searchParams.append('instance_id', instanceId);
  }
  url.searchParams.append('time_pattern', 'yyyyMMdd');
  url.searchParams.append('start_time', startTime);
  url.searchParams.append('end_time', endTime);
  url.searchParams.append('interval_minute', intervalMinute);
  url.searchParams.append('metrics', metrics);

  try {
    const response = await fetch(url.toString(), {
      method: 'GET',
      headers: {
        'Accept': 'application/json'
      }
    });

    if (!response.ok) {
      throw new Error(`HTTP Error: ${response.status}`);
    }

    const data = await response.json();
    return data.result || [];
  } catch (error) {
    console.warn(`API fetch for ${metrics} failed. Fallback to mock data.`, error);
    throw error;
  }
}

const monthBoundaryPlugin = {
  id: 'monthBoundary',
  afterEvent(chart, args) {
    const event = args.event;
    if (event.type === 'mousemove') {
      const xPixel = event.x;
      const xAxis = chart.scales.x;
      const value = xAxis.getValueForPixel(xPixel);
      let index = Math.round(value);

      if (chart.data.labels && chart.data.labels.length > 0) {
        const maxIndex = chart.data.labels.length - 1;
        if (index < 0) index = 0;
        if (index > maxIndex) index = maxIndex;

        const hoveredMonth = chart.data.labels[index].split('/')[0];
        if (chart.hoveredMonth !== hoveredMonth) {
          chart.hoveredMonth = hoveredMonth;
          args.changed = true;
        }
      }
    } else if (event.type === 'mouseout') {
      if (chart.hoveredMonth !== null) {
        chart.hoveredMonth = null;
        args.changed = true;
      }
    }
  },
  beforeDraw(chart) {
    const { ctx, chartArea, scales: { x } } = chart;
    const labels = chart.data.labels;
    if (!labels || labels.length === 0) return;

    const getBoundaryX = (i) => (x.getPixelForValue(i - 1) + x.getPixelForValue(i)) / 2;

    const boundaries = [];
    const monthZones = {};

    let currentMonth = labels[0].split('/')[0];
    let startX = chartArea.left;

    for (let i = 1; i < labels.length; i++) {
      const month = labels[i].split('/')[0];
      if (month !== currentMonth) {
        const lineX = getBoundaryX(i);
        boundaries.push(lineX);
        monthZones[currentMonth] = { startX: startX, endX: lineX, month: currentMonth };
        currentMonth = month;
        startX = lineX;
      }
    }
    monthZones[currentMonth] = { startX: startX, endX: chartArea.right, month: currentMonth };

    // Draw Hover Highlight
    if (chart.hoveredMonth && monthZones[chart.hoveredMonth]) {
      const zone = monthZones[chart.hoveredMonth];
      ctx.save();
      const monthIdx = (parseInt(chart.hoveredMonth, 10) - 1) % 12;
      ctx.fillStyle = MONTH_COLORS[monthIdx] + '26'; // 15% opacity hex
      ctx.fillRect(zone.startX, chartArea.top, zone.endX - zone.startX, chartArea.bottom - chartArea.top);
      ctx.restore();
    }

    // Draw Dotted Boundaries
    ctx.save();
    ctx.beginPath();
    ctx.lineWidth = 1;
    ctx.strokeStyle = 'rgba(148, 163, 184, 0.4)'; // lighter line color
    ctx.setLineDash([2, 2]); // shorter dash and gap
    boundaries.forEach(lineX => {
      ctx.moveTo(lineX, chartArea.top);
      ctx.lineTo(lineX, chartArea.bottom);
    });
    ctx.stroke();
    ctx.restore();
  },
  afterDraw(chart) {
    // Stats are now rendered in HTML section instead of canvas
  }
};

// Draw or Update Chart
function updateChart(canvasId, label, data, color, chartInstance, setInstanceCallback) {
  const ctx = document.getElementById(canvasId).getContext('2d');

  const labels = data.map(item => parseDateString(item.time));
  const values = data.map(item => item.value);

  const getMonthColor = (chartCtx, defaultColor, alpha = '80') => {
    if (!chartCtx || !chartCtx.chart || !chartCtx.chart.data || !chartCtx.chart.data.labels) return defaultColor;
    const lbls = chartCtx.chart.data.labels;
    const dataIdx = chartCtx.p0DataIndex !== undefined ? chartCtx.p0DataIndex : chartCtx.dataIndex;
    if (dataIdx === undefined) return defaultColor;
    const lbl = lbls[dataIdx];
    if (!lbl) return defaultColor;
    const mStr = lbl.split('/')[0];
    const idx = (parseInt(mStr, 10) - 1) % 12;
    return (MONTH_COLORS[idx] || defaultColor) + (alpha === '' ? '' : alpha);
  };

  // Compute month-by-month averages BEFORE creating/updating chart so afterDraw has data
  calculateMonthlyAverages(data, label);

  if (chartInstance && chartInstance.config.type !== currentChartType) {
    chartInstance.destroy();
    chartInstance = null;
  }

  if (chartInstance) {
    chartInstance.data.labels = labels;
    chartInstance.data.datasets[0].data = values;
    chartInstance.update();
  } else {
    // Create new chart
    const datasetConfig = {
      label: label,
      data: values,
      borderWidth: 2,
    };

    if (currentChartType === 'line') {
      datasetConfig.fill = true;
      datasetConfig.tension = 0;
      datasetConfig.pointRadius = 0;
      datasetConfig.pointHoverRadius = 5;
      datasetConfig.segment = {
        borderColor: ctx => getMonthColor(ctx, color, ''),
        backgroundColor: ctx => getMonthColor(ctx, color, '80')
      };
    } else { // bar
      datasetConfig.backgroundColor = ctx => getMonthColor(ctx, color, '80');
      datasetConfig.borderColor = ctx => getMonthColor(ctx, color, '');
    }

    const newChart = new Chart(ctx, {
      type: currentChartType,
      data: {
        labels: labels,
        datasets: [datasetConfig]
      },
      plugins: [monthBoundaryPlugin],
      options: {
        responsive: true,
        maintainAspectRatio: false,
        layout: {
          padding: {
            bottom: 10
          }
        },
        interaction: {
          intersect: false,
          mode: 'index',
        },
        plugins: {
          legend: {
            display: false
          },
          tooltip: {
            callbacks: {
              label: function (context) {
                let label = context.dataset.label || '';
                if (label) {
                  label += ': ';
                }
                if (context.parsed.y !== null) {
                  label += new Intl.NumberFormat().format(context.parsed.y);
                }
                return label;
              }
            }
          }
        },
        scales: {
          x: {
            border: { display: false },
            grid: { display: false },
            ticks: {
              maxRotation: 0,
              autoSkip: false,
              font: { size: 10 },
              callback: function (value, index, values) {
                const label = this.getLabelForValue(value);
                if (label && label.endsWith('/15')) {
                  return label;
                }
                return null;
              }
            }
          },
          y: {
            border: { display: false },
            beginAtZero: true,
            ticks: {
              maxTicksLimit: 6,
              callback: function (value) {
                if (value >= 1000) {
                  return (value / 1000).toFixed(0) + 'k';
                }
                return value;
              },
              font: { size: 10 }
            }
          }
        }
      }
    });
    setInstanceCallback(newChart);
  }
}

let monthlyAveragesCache = {};
let currentMetricLabelCache = '';

function calculateMonthlyAverages(data, label) {
  currentMetricLabelCache = label;
  monthlyAveragesCache = {};

  const monthData = {};
  const today = new Date();
  const todayStr = today.getFullYear() + 
                   String(today.getMonth() + 1).padStart(2, '0') + 
                   String(today.getDate()).padStart(2, '0');

  // Group data by month, but ONLY up to today for the current month/future
  data.forEach(item => {
    if (item.time > todayStr) return; // Future data (zeros) should not be averaged
    if (item.value === 0 || item.value === null || item.value === undefined) return; // Exclude 0 or missing values

    const lbl = parseDateString(item.time);
    const month = lbl.split('/')[0];
    if (!monthData[month]) monthData[month] = [];
    monthData[month].push(item.value);
  });

  // Since data is chronologically sorted, identify the order of months
  const monthsInOrder = [];
  let lastM = null;
  data.forEach(item => {
    const lbl = parseDateString(item.time);
    if (typeof lbl !== 'string') return;
    
    const m = lbl.split('/')[0];
    if (m !== lastM) {
      monthsInOrder.push(m);
      lastM = m;
    }
  });

  // Calculate avg per month and set up prev month references
  monthsInOrder.forEach((m, idx) => {
    if (!monthData[m] || monthData[m].length === 0) {
      // If no valid data for this month, skip or set zero
      monthlyAveragesCache[m] = { avg: 0, prevAvgMonth: idx > 0 ? monthsInOrder[idx - 1] : null };
      return;
    }
    
    const arr = monthData[m];
    const avg = arr.reduce((acc, v) => acc + v, 0) / arr.length;
    
    monthlyAveragesCache[m] = {
      avg: avg,
      prevAvgMonth: idx > 0 ? monthsInOrder[idx - 1] : null
    };
  });

  // Compute MoM rates
  monthsInOrder.forEach((m, idx) => {
    const d = monthlyAveragesCache[m];
    if (!d) return;

    if (d.prevAvgMonth && monthlyAveragesCache[d.prevAvgMonth]) {
      let prevAvg;
      const isLastMonth = (idx === monthsInOrder.length - 1);

      if (isLastMonth) {
        // Like-for-like comparison: 
        // Compare current month's count of valid days with the same count from the start of the previous month.
        const currentMonthData = monthData[m] || [];
        const currentMonthCount = currentMonthData.length;
        const prevMonthData = monthData[d.prevAvgMonth] || [];
        
        if (currentMonthCount > 0 && prevMonthData.length > 0) {
          const prevMonthSlice = prevMonthData.slice(0, currentMonthCount);
          prevAvg = prevMonthSlice.reduce((acc, v) => acc + v, 0) / (prevMonthSlice.length || 1);
        } else {
          prevAvg = monthlyAveragesCache[d.prevAvgMonth].avg;
        }
      } else {
        prevAvg = monthlyAveragesCache[d.prevAvgMonth].avg;
      }

      if (prevAvg > 0) {
        d.rate = ((d.avg - prevAvg) / prevAvg) * 100;
      } else {
        d.rate = 0;
      }
    } else {
      d.rate = null;
    }
  });

  // Use the sorted order for the grid update too
  const labels = data.map(item => parseDateString(item.time));
  updateChartStatsGrid(labels, mainChartInstance);
}

function updateChartStatsGrid(labels, chart) {
  const avgWrapper = document.getElementById('statsAvgValues');
  const rateWrapper = document.getElementById('statsRateValues');
  if (!avgWrapper || !rateWrapper || !chart) return;

  avgWrapper.innerHTML = '';
  rateWrapper.innerHTML = '';

  const { chartArea, scales: { x } } = chart;
  if (!chartArea) return;

  // Re-calculate month zones to get exact center positions
  const monthZones = [];
  let currentMonth = labels[0].split('/')[0];
  let startIdx = 0;

  for (let i = 1; i < labels.length; i++) {
    const month = labels[i].split('/')[0];
    if (month !== currentMonth) {
      const startX = x.getPixelForValue(startIdx);
      const endX = x.getPixelForValue(i - 1);
      monthZones.push({ month: currentMonth, centerX: (startX + endX) / 2 });
      currentMonth = month;
      startIdx = i;
    }
  }
  const startXLast = x.getPixelForValue(startIdx);
  const endXLast = x.getPixelForValue(labels.length - 1);
  monthZones.push({ month: currentMonth, centerX: (startXLast + endXLast) / 2 });

  monthZones.forEach(zone => {
    const d = monthlyAveragesCache[zone.month];
    if (!d) return;

    // Calculate relative left based on wrapper (which starts from ChartArea.left offset ideally, 
    // but here wrapper starts after 60px label + 1.25rem padding-left)
    // Wrapper's absolute left = stats-row.padding-left(20px) + stats-label.width(60px) = 80px
    // ChartArea.left is usually around 40-60px.
    // Let's use getBoundingClientRect for perfect precision or just offset it.
    
    const wrapperRect = avgWrapper.getBoundingClientRect();
    const chartRect = chart.canvas.getBoundingClientRect();
    const xOffset = zone.centerX + (chartRect.left - wrapperRect.left);

    // Avg Item
    const avgItem = document.createElement('div');
    avgItem.className = 'stat-item';
    avgItem.style.left = `${xOffset}px`;
    
    let avgText;
    const metricLabel = currentMetricLabelCache || '';
    if (metricLabel.includes('응답시간') || metricLabel.includes('Response Time')) {
      avgText = Math.round(d.avg).toLocaleString();
    } else if (metricLabel.includes('TPS')) {
      avgText = d.avg.toFixed(2);
    } else {
      avgText = Math.round(d.avg).toLocaleString();
    }
    avgItem.textContent = avgText;
    avgWrapper.appendChild(avgItem);

    // Rate Item
    const rateItem = document.createElement('div');
    rateItem.className = 'stat-item';
    rateItem.style.left = `${xOffset}px`;
    if (d.rate !== null) {
      const rateAbs = Math.abs(d.rate).toFixed(1);
      if (d.rate > 0) {
        rateItem.textContent = `+${rateAbs}%`;
        rateItem.classList.add('rate-up');
      } else if (d.rate < 0) {
        rateItem.textContent = `-${rateAbs}%`;
        rateItem.classList.add('rate-down');
      } else {
        rateItem.textContent = '0%';
        rateItem.classList.add('rate-none');
      }
    } else {
      rateItem.textContent = '-';
      rateItem.classList.add('rate-none');
    }
    rateWrapper.appendChild(rateItem);
  });
}

function updateFooterHoverStats(monthStr) {
  // No longer used for DOM footer - stats are rendered directly in chart canvas
}

function updateSummaryCardsPartial(metrics, data) {
  // Averages
  const calcAvg = data => data.length ? data.reduce((s, d) => s + d.value, 0) / data.length : 0;
  const avg = calcAvg(data);

  // Peak Date (Based on Max selected metric)
  if (data.length > 0) {
    let maxEntry = data[0];
    data.forEach(entry => {
      if (entry.value > maxEntry.value) maxEntry = entry;
    });
    document.getElementById('peakDate').textContent = parseDateString(maxEntry.time, true);
  } else {
    document.getElementById('peakDate').textContent = '-';
  }

  // Reset all to 0 or - first
  document.getElementById('avgResponseTime').innerHTML = `0 <span class="unit">ms</span>`;
  document.getElementById('avgTps').textContent = '0';
  document.getElementById('avgConcurrentUsers').textContent = '0';

  if (metrics === 'service_time') {
    document.getElementById('avgResponseTime').innerHTML = `${Math.round(avg).toLocaleString()} <span class="unit">ms</span>`;
  } else if (metrics === 'service_rate') {
    document.getElementById('avgTps').textContent = avg.toLocaleString(undefined, { minimumFractionDigits: 2, maximumFractionDigits: 2 });
  } else if (metrics === 'concurrent_user') {
    document.getElementById('avgConcurrentUsers').textContent = Math.round(avg).toLocaleString();
  }
}

// Utilities
function formatDateParam(date) {
  const y = date.getFullYear();
  const m = String(date.getMonth() + 1).padStart(2, '0');
  const d = String(date.getDate()).padStart(2, '0');
  return `${y}${m}${d}`;
}

function parseDateString(dateStr, full = false) {
  if (!dateStr || dateStr.length < 8) return dateStr;
  const y = dateStr.substring(0, 4);
  const m = dateStr.substring(4, 6);
  const d = dateStr.substring(6, 8);
  if (full) return `${y}-${m}-${d}`;
  return `${m}/${d}`;
}

function calculateInterval(startDate, endDate) {
  const diffTime = Math.abs(endDate - startDate);
  const diffDays = Math.ceil(diffTime / (1000 * 60 * 60 * 24));

  if (diffDays <= 1) return 5; // 1day
  if (diffDays <= 7) return 60; // 1week
  if (diffDays <= 30) return 180; // 1month
  return 1440; // over 1month
}

// Fallback logic for when API is unreachable due to CORS or local network issues
function mockDataOnFailPartial(metrics, metricsName) {
  console.log("Using Mock Data");

  const mockDates = ["20260201", "20260202", "20260203", "20260204", "20260205", "20260206", "20260207", "20260208", "20260209", "20260210"];

  let mockData = [];
  if (metrics === 'service_time') {
    mockData = mockDates.map(d => ({ time: d, value: 4000 + Math.random() * 1500 }));
  } else if (metrics === 'service_rate') {
    mockData = mockDates.map(d => ({ time: d, value: 2 + Math.random() * 4 }));
  } else {
    mockData = mockDates.map(d => ({ time: d, value: 100 + Math.random() * 150 }));
  }

  document.getElementById('chartTitle').textContent = metricsName;

  currentMetricData = mockData; // Save for toggle logic

  updateChart('mainChart', metricsName, mockData, '#22c55e', mainChartInstance, (instance) => mainChartInstance = instance);
  updateSummaryCardsPartial(metrics, mockData);
}
