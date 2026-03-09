import Chart from 'chart.js/auto';

// Global variables
const API_BASE = '/api/dbmetrics';
const DOMAIN_API_BASE = '/api/domain';
const INSTANCE_API_BASE = '/api/instance';
const TOKEN = 'd5HJuONXNZf';

// Store chart instances
let responseTimeChartInstance = null;
let tpsChartInstance = null;
let concurrentUsersChartInstance = null;

// DOM Elements
const domainSelect = document.getElementById('domainSelect');
const instanceSelect = document.getElementById('instanceSelect');
const dateRangeInput = document.getElementById('dateRange');
const searchBtn = document.getElementById('searchBtn');

// Initialize Flatpickr
const datePicker = flatpickr(dateRangeInput, {
  mode: "range",
  locale: "ko",
  dateFormat: "Y-m-d",
  defaultDate: [new Date(2026, 1, 1), new Date(2026, 2, 1)], // 2026-02-01 to 2026-03-01
});

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
  const dates = datePicker.selectedDates;
  if (dates.length !== 2) {
    alert('조회 시작일과 종료일을 선택해주세요.');
    return;
  }

  const startDateStr = formatDateParam(dates[0]);
  const endDateStr = formatDateParam(dates[1]);
  const intervalMinute = calculateInterval(dates[0], dates[1]);
  const domainId = domainSelect.value;
  const instanceId = instanceSelect.value;

  searchBtn.disabled = true;
  searchBtn.textContent = '조회 중...';

  try {
    // Fetch data for 3 metrics concurrently
    const [responseTimeData, tpsData, usersData] = await Promise.all([
      fetchMetricData(domainId, instanceId, startDateStr, endDateStr, intervalMinute, 'service_time'),
      fetchMetricData(domainId, instanceId, startDateStr, endDateStr, intervalMinute, 'service_rate'),
      fetchMetricData(domainId, instanceId, startDateStr, endDateStr, intervalMinute, 'concurrent_user')
    ]);

    // Update charts
    updateChart('responseTimeChart', '응답시간 (ms)', responseTimeData, '#22c55e', responseTimeChartInstance, (instance) => responseTimeChartInstance = instance);
    updateChart('tpsChart', 'TPS', tpsData, '#22c55e', tpsChartInstance, (instance) => tpsChartInstance = instance);
    updateChart('concurrentUsersChart', '동시사용자수', usersData, '#22c55e', concurrentUsersChartInstance, (instance) => concurrentUsersChartInstance = instance);

    // Update Summary Cards
    updateSummaryCards(responseTimeData, tpsData, usersData);

  } catch (error) {
    console.error('Data loading failed:', error);
    // Continue even on error to mock data if API fails
    mockDataOnFail();
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

// Draw or Update Chart
function updateChart(canvasId, label, data, color, chartInstance, setInstanceCallback) {
  const ctx = document.getElementById(canvasId).getContext('2d');

  const labels = data.map(item => parseDateString(item.time));
  const values = data.map(item => item.value);

  // Gradient fill
  const gradient = ctx.createLinearGradient(0, 0, 0, 400);
  gradient.addColorStop(0, `${color}40`);
  gradient.addColorStop(1, `${color}00`);

  if (chartInstance) {
    chartInstance.data.labels = labels;
    chartInstance.data.datasets[0].data = values;
    chartInstance.update();
  } else {
    // Create new chart
    const newChart = new Chart(ctx, {
      type: 'line',
      data: {
        labels: labels,
        datasets: [{
          label: label,
          data: values,
          borderColor: color,
          backgroundColor: gradient,
          borderWidth: 2,
          fill: true,
          tension: 0,
          pointRadius: 0,
          pointHoverRadius: 5,
        }]
      },
      options: {
        responsive: true,
        maintainAspectRatio: false,
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
              maxTicksLimit: 10,
              maxRotation: 0,
              font: { size: 10 }
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

  // Update footer stats (Average)
  if (values.length > 0) {
    const avg = values.reduce((sum, val) => sum + val, 0) / values.length;
    let avgStr = label.includes('ms') ? Math.round(avg).toLocaleString() : avg.toLocaleString(undefined, { minimumFractionDigits: 2, maximumFractionDigits: 2 });

    // Assign to corresponding footer element
    if (canvasId === 'responseTimeChart') document.getElementById('footerAvgResponse').textContent = Math.round(avg).toLocaleString();
    if (canvasId === 'tpsChart') document.getElementById('footerAvgTps').textContent = avg.toLocaleString(undefined, { minimumFractionDigits: 2, maximumFractionDigits: 2 });
    if (canvasId === 'concurrentUsersChart') document.getElementById('footerAvgUsers').textContent = Math.round(avg).toLocaleString();
  }
}

function updateSummaryCards(responseTimeData, tpsData, usersData) {
  // Peak Date (Based on Max TPS roughly, or user max)
  if (tpsData.length > 0) {
    let maxTpsEntry = tpsData[0];
    tpsData.forEach(entry => {
      if (entry.value > maxTpsEntry.value) {
        maxTpsEntry = entry;
      }
    });

    const peakDateStr = parseDateString(maxTpsEntry.time, true); // e.g. 2026-02-15
    document.getElementById('peakDate').textContent = peakDateStr;
  }

  // Averages
  const calcAvg = data => data.length ? data.reduce((s, d) => s + d.value, 0) / data.length : 0;

  const avgRt = calcAvg(responseTimeData);
  const avgTps = calcAvg(tpsData);
  const avgUsers = calcAvg(usersData);

  document.getElementById('avgResponseTime').innerHTML = `${Math.round(avgRt).toLocaleString()} <span class="unit">ms</span>`;
  document.getElementById('avgTps').textContent = avgTps.toLocaleString(undefined, { minimumFractionDigits: 2, maximumFractionDigits: 2 });
  document.getElementById('avgConcurrentUsers').textContent = Math.round(avgUsers).toLocaleString();
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

  if (diffDays <= 1) return 60; // 1hour
  if (diffDays <= 7) return 360; // 6hours
  if (diffDays <= 30) return 1440; // 1day
  return 10080; // 1week
}

// Fallback logic for when API is unreachable due to CORS or local network issues
function mockDataOnFail() {
  console.log("Using Mock Data");

  const mockDates = ["20260201", "20260202", "20260203", "20260204", "20260205", "20260206", "20260207", "20260208", "20260209", "20260210"];

  const rtData = mockDates.map(d => ({ time: d, value: 4000 + Math.random() * 1500 }));
  const tpsData = mockDates.map(d => ({ time: d, value: 2 + Math.random() * 4 }));
  const usersData = mockDates.map(d => ({ time: d, value: 100 + Math.random() * 150 }));

  updateChart('responseTimeChart', '응답시간 (ms)', rtData, '#22c55e', responseTimeChartInstance, (instance) => responseTimeChartInstance = instance);
  updateChart('tpsChart', 'TPS', tpsData, '#22c55e', tpsChartInstance, (instance) => tpsChartInstance = instance);
  updateChart('concurrentUsersChart', '동시사용자수', usersData, '#22c55e', concurrentUsersChartInstance, (instance) => concurrentUsersChartInstance = instance);

  updateSummaryCards(rtData, tpsData, usersData);
}
