import Chart from 'chart.js/auto';
import { config } from './config.js';

// Global variables
const API_BASE = (config.API_DOMAIN || '') + '/api/dbmetrics';
const DOMAIN_API_BASE = (config.API_DOMAIN || '') + '/api/domain';
const INSTANCE_API_BASE = (config.API_DOMAIN || '') + '/api/instance';
const TOKEN = config.TOKEN;

const MONTH_COLORS = [
  '#f87171', '#fb923c', '#fbbf24', '#a3e635', '#4ade80', '#34d399',
  '#2dd4bf', '#60a5fa', '#818cf8', '#a78bfa', '#e879f9', '#fb7185'
];

// Store chart instances
let mainChartInstance = null;
let currentChartType = 'line';
let showMA = true;
let yearlyData = {
  service_time: [],
  service_rate: [],
  concurrent_user: [],
  service_count: [],
  sys_cpu: [],
  heap_usage: [],
  max_sys_cpu: []
};

let currentMetric = 'service_time';

// Chart Selection State
let selectedStartMonth = null;
let selectedEndMonth = null;
let isSelecting = false;
let dragStartX = null;
let dragCurrentX = null;
let activeSelectionBoundary = 'end'; // 'start' or 'end'

// Global metric thresholds for heatmaps (persisted across period selections)
let metricThresholds = {};
let overallYThresholds = {};

// DOM Elements
const domainSelect = document.getElementById('domainSelect');
const instanceSelect = document.getElementById('instanceSelect');
const metricsToggle = document.getElementById('metricsToggle');
const btnSysCpu = document.getElementById('btnSysCpu');
const btnHeapUsage = document.getElementById('btnHeapUsage');

// Configure Chart.js global defaults
Chart.defaults.font.family = '"Pretendard JP", sans-serif';
Chart.defaults.color = "#64748b";
Chart.defaults.scale.grid.color = "#f1f5f9";
Chart.defaults.plugins.tooltip.backgroundColor = "rgba(30, 41, 59, 0.9)";
Chart.defaults.plugins.tooltip.padding = 10;
Chart.defaults.plugins.tooltip.cornerRadius = 4;

document.addEventListener('DOMContentLoaded', async () => {
  // Initial load: Load domains first, then data
  const domainsLoaded = await loadDomains();

  // Even if domains failed to load (CORS/Network error), try to load data (which will trigger mock data fallback)
  loadData();

  function updateSummaryCardsDisabledState() {
    const isInstanceSelected = !!instanceSelect.value;
    const cpuCard = document.getElementById('avgSysCpu').closest('.summary-card');
    const memCard = document.getElementById('avgHeapUsage').closest('.summary-card');

    if (cpuCard && memCard) {
      if (isInstanceSelected) {
        cpuCard.classList.remove('disabled');
        memCard.classList.remove('disabled');
      } else {
        cpuCard.classList.add('disabled');
        memCard.classList.add('disabled');
      }
    }
  }

  updateSummaryCardsDisabledState();

  // Bind events
  domainSelect.addEventListener('change', async (e) => {
    // Attempt to load instances whenever a domain is selected
    if (e.target.value) {
      await loadInstances(e.target.value);
    }
    updateSummaryCardsDisabledState();
    loadData(); // Auto-fetch data when domain changes
  });

  // Bind metric toggle buttons
  document.querySelectorAll('.metric-btn').forEach(btn => {
    btn.addEventListener('click', (e) => {
      document.querySelectorAll('.metric-btn').forEach(b => b.classList.remove('active'));
      const targetBtn = e.currentTarget;
      targetBtn.classList.add('active');
      currentMetric = targetBtn.dataset.metric;

      const metricData = yearlyData[currentMetric];
      if (metricData && metricData.length > 0) {
        const metricDisplayName = targetBtn.textContent;
        updateChart('mainChart', metricDisplayName, metricData, '#22c55e', mainChartInstance, (instance) => {
          mainChartInstance = instance;
        });

        // Update summary cards for the selected range if exists
        handleChartSelectionChanged();
      }
    });
  });

  instanceSelect.addEventListener('change', () => {
    const isInstanceSelected = !!instanceSelect.value;
    if (isInstanceSelected) {
      btnSysCpu.classList.remove('hidden');
      btnHeapUsage.classList.remove('hidden');
    } else {
      btnSysCpu.classList.add('hidden');
      btnHeapUsage.classList.add('hidden');

      // If active metric is hidden, switch to response time
      if (currentMetric === 'sys_cpu' || currentMetric === 'heap_usage') {
        const defaultBtn = document.querySelector('.metric-btn[data-metric="service_time"]');
        if (defaultBtn) defaultBtn.click();
      }
    }
    updateSummaryCardsDisabledState();
    loadData(); // Auto-fetch data when instance changes
  });

  // Bind chart type toggles
  document.querySelectorAll('.type-btn').forEach(btn => {
    btn.addEventListener('click', (e) => {
      document.querySelectorAll('.type-btn').forEach(b => b.classList.remove('active'));
      const targetBtn = e.currentTarget;
      targetBtn.classList.add('active');
      currentChartType = targetBtn.dataset.type;

      const metricData = yearlyData[currentMetric];
      if (metricData && metricData.length > 0) {
        const metricDisplayName = document.querySelector(`.metric-btn[data-metric="${currentMetric}"]`).textContent;
        updateChart('mainChart', metricDisplayName, metricData, '#22c55e', mainChartInstance, (instance) => {
          mainChartInstance = instance;
        });
      }
    });
  });

  // Bind MA toggle buttons
  document.querySelectorAll('.toggle-btn').forEach(btn => {
    btn.addEventListener('click', (e) => {
      document.querySelectorAll('.toggle-btn').forEach(b => b.classList.remove('active'));
      const targetBtn = e.currentTarget;
      targetBtn.classList.add('active');
      showMA = targetBtn.dataset.ma === 'on';

      // Refresh chart with current metric
      const activeBtn = document.querySelector('.metric-btn.active');
      if (activeBtn) activeBtn.click();
    });
  });

  // Bind resize event to re-align stats
  window.addEventListener('resize', () => {
    const curMetricData = yearlyData[currentMetric] || [];
    if (mainChartInstance && curMetricData.length > 0) {
      const labels = curMetricData.map(item => parseDateString(item.time));
      updateChartStatsGrid(labels, mainChartInstance);
    }
  });
});

async function loadDomains() {
  const url = new URL(DOMAIN_API_BASE, window.location.origin);
  url.searchParams.append('token', TOKEN);
  const urlString = url.toString();

  try {
    const response = await fetch(urlString, {
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

    // Load instances for the initially selected domain
    if (domainSelect.value) {
      await loadInstances(domainSelect.value);
    }
    return true;

  } catch (error) {
    console.error('Failed to load domains. URL:', urlString, '\nError:', error);
    if (error.name === 'TypeError') {
      console.warn('Network error or CORS issue suspected. Check if the API server is reachable or if the request is being blocked.');
    }

    // Fallback to mock domains
    const mockDomains = [
      { domainId: '1000', name: 'Sample Domain A (Mock)' },
      { domainId: '1001', name: 'Sample Domain B (Mock)' }
    ];

    domainSelect.innerHTML = '';
    mockDomains.forEach(domain => {
      const option = document.createElement('option');
      option.value = domain.domainId;
      option.textContent = domain.name;
      domainSelect.appendChild(option);
    });

    if (domainSelect.value) {
      await loadInstances(domainSelect.value);
    }
    return false;
  }
}

async function loadInstances(domainId) {
  if (!domainId) {
    instanceSelect.innerHTML = '<option value="">전체 (도메인 단위조회)</option>';
    return;
  }

  const url = new URL(INSTANCE_API_BASE, window.location.origin);
  url.searchParams.append('token', TOKEN);
  url.searchParams.append('domain_id', domainId);
  const urlString = url.toString();

  try {
    const response = await fetch(urlString, {
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
    console.error(`Failed to load instances for domain ${domainId}. URL: ${urlString}`, error);

    // Fallback to mock instances
    const mockInstances = [
      { instanceId: '1', name: `Instance-${domainId}-1` },
      { instanceId: '2', name: `Instance-${domainId}-2` }
    ];

    instanceSelect.innerHTML = '<option value="">전체 (도메인 단위조회)</option>';
    mockInstances.forEach(instance => {
      const option = document.createElement('option');
      option.value = instance.instanceId;
      option.textContent = instance.name;
      instanceSelect.appendChild(option);
    });
  }
}

async function loadData() {
  const domainId = domainSelect.value;
  const instanceId = instanceSelect.value;


  // Reset thresholds when a new primary search is performed
  metricThresholds = {};
  overallYThresholds = {};

  try {
    const today = new Date();

    // Main Chart & Summary Metrics: 1년을 12개의 단위로 (월별 분할) 조회 - 최대 31일 제한 우회 및 일별 데이터(1440분) 지정
    const metricsToFetch = Array.from(new Set([currentMetric, 'service_time', 'service_rate', 'concurrent_user', 'service_count', 'sys_cpu', 'heap_usage', 'max_sys_cpu']));
    const fetchPromisesMap = {};
    metricsToFetch.forEach(m => fetchPromisesMap[m] = []);

    for (let i = 11; i >= 0; i--) {
      const monthStart = new Date(today.getFullYear(), today.getMonth() - i, 1);
      // API end_time is exclusive, so use the 1st day of the next month instead of the 0th day (last day of current month)
      const monthEnd = new Date(today.getFullYear(), today.getMonth() - i + 1, 1);

      metricsToFetch.forEach(m => {
        fetchPromisesMap[m].push(
          fetchMetricData(domainId, instanceId, formatDateParam(monthStart), formatDateParam(monthEnd), 1440, m)
            .catch(err => {
              console.warn(`Failed to fetch partially for ${formatDateParam(monthStart)} metric ${m}`, err);
              return [];
            })
        );
      });
    }

    const results = {};
    for (const m of metricsToFetch) {
      results[m] = await Promise.all(fetchPromisesMap[m]);
    }

    // 병합 및 시간순 정렬 및 중복 제거
    const processResults = (resArray) => {
      let metricData = [];
      resArray.forEach(res => { metricData.push(...res); });
      metricData.sort((a, b) => String(a.time).localeCompare(String(b.time)));

      const uniqueData = [];
      const timeSet = new Set();
      metricData.forEach(item => {
        if (!timeSet.has(item.time)) {
          timeSet.add(item.time);
          uniqueData.push(item);
        }
      });
      return uniqueData;
    };

    metricsToFetch.forEach(m => {
      yearlyData[m] = processResults(results[m]);
    });

    // Update UI Elements for Chart
    const activeBtn = document.querySelector(`.metric-btn[data-metric="${currentMetric}"]`);
    const metricDisplayName = activeBtn ? activeBtn.textContent : '응답시간';

    // Update main chart
    updateChart('mainChart', metricDisplayName, yearlyData[currentMetric], '#22c55e', mainChartInstance, (instance) => {
      mainChartInstance = instance;
    });

    // Reset selection state and update text on full load
    selectedStartMonth = null;
    selectedEndMonth = null;
    const rangeDisplay = document.getElementById('selectedRangeDisplay');
    if (rangeDisplay) rangeDisplay.textContent = '전체 (1년)';

    // Update Summary Cards
    const curData = yearlyData[currentMetric] || [];
    updateSummaryCardsPartial(0, curData.length - 1);

    // Heatmaps Data Fetching
    // We can rely on the selection changed handler to load heatmaps for the default 1-year view
    await handleChartSelectionChanged();

  } catch (error) {
    console.error('Data loading failed:', error);
    mockDataOnFailPartial();
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
    console.warn(`API fetch for ${metrics} failed. URL: ${url.toString()}`, error);
    if (error.name === 'TypeError') {
      console.warn('Network error or CORS issue. If this is a local development environment, ensure the proxy is correctly configured.');
    }
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
    ctx.stroke();
    ctx.restore();
  },
  afterDraw(chart) {
    // Stats are now rendered in HTML section instead of canvas
    const curMetricData = yearlyData[currentMetric] || [];
    if (chart.data.labels && curMetricData.length > 0) {
      updateChartStatsGrid(chart.data.labels, chart);
    }
  }
};

const selectionRangePlugin = {
  id: 'selectionRange',
  afterEvent(chart, args) {
    const event = args.event;
    if (event.type === 'mousedown') {
      isSelecting = true;
      dragStartX = event.x;
      dragCurrentX = event.x;
      args.changed = true;
    } else if (event.type === 'mousemove' && isSelecting) {
      dragCurrentX = event.x;
      args.changed = true;
    } else if (event.type === 'mouseup' || (event.type === 'mouseout' && isSelecting)) {
      if (isSelecting) {
        isSelecting = false;

        // Calculate selected range based on pixel coordinates
        if (Math.abs(dragCurrentX - dragStartX) > 10) {
          // Drag selection
          const xAxis = chart.scales.x;
          let val1 = xAxis.getValueForPixel(dragStartX);
          let val2 = xAxis.getValueForPixel(dragCurrentX);

          if (val1 > val2) {
            const temp = val1;
            val1 = val2;
            val2 = temp;
          }

          let idx1 = Math.round(val1);
          let idx2 = Math.round(val2);

          const maxIndex = chart.data.labels.length - 1;
          idx1 = Math.max(0, Math.min(idx1, maxIndex));
          idx2 = Math.max(0, Math.min(idx2, maxIndex));

          selectedStartMonth = chart.data.labels[idx1].split('/')[0];
          selectedEndMonth = chart.data.labels[idx2].split('/')[0];

          // Set active boundary based on drag direction
          activeSelectionBoundary = (dragCurrentX < dragStartX) ? 'start' : 'end';

          // Trigger data update
          handleChartSelectionChanged();
        } else {
          // Click selection (single month or clear)
          const xAxis = chart.scales.x;
          let idx = Math.round(xAxis.getValueForPixel(event.x));
          const maxIndex = chart.data.labels.length - 1;

          if (idx >= 0 && idx <= maxIndex) {
            const clickedMonth = chart.data.labels[idx].split('/')[0];

            // Toggle off if clicking the already selected exactly
            if (selectedStartMonth === clickedMonth && selectedEndMonth === clickedMonth) {
              selectedStartMonth = null;
              selectedEndMonth = null;
              activeSelectionBoundary = 'end';
            } else {
              selectedStartMonth = clickedMonth;
              selectedEndMonth = clickedMonth;
              activeSelectionBoundary = 'end';
            }
            // Trigger data update
            handleChartSelectionChanged();
          }
        }

        args.changed = true;
      }
    }
  },
  beforeDraw(chart) {
    const { ctx, chartArea, scales: { x } } = chart;
    const labels = chart.data.labels;
    if (!labels || labels.length === 0) return;

    // Draw active drag selection box
    if (isSelecting && dragStartX !== null && dragCurrentX !== null) {
      ctx.save();
      ctx.fillStyle = 'rgba(59, 130, 246, 0.2)'; // Blue tint for selection box
      const start = Math.min(dragStartX, dragCurrentX);
      const width = Math.abs(dragCurrentX - dragStartX);
      ctx.fillRect(start, chartArea.top, width, chartArea.bottom - chartArea.top);
      ctx.restore();
    }

    // Draw finalized selected months highlighting
    if (!isSelecting && selectedStartMonth && selectedEndMonth) {
      // Find start and end pixels for the selected months bounds
      let startPixel = null;
      let endPixel = null;

      const getBoundaryX = (i) => {
        if (i === 0) return chartArea.left;
        if (i >= labels.length) return chartArea.right;
        return (x.getPixelForValue(i - 1) + x.getPixelForValue(i)) / 2;
      };

      let currentMonth = labels[0].split('/')[0];
      let tStartIdx = 0;

      for (let i = 1; i <= labels.length; i++) {
        const month = i < labels.length ? labels[i].split('/')[0] : null;
        if (month !== currentMonth) {
          if (currentMonth === selectedStartMonth) {
            startPixel = getBoundaryX(tStartIdx);
          }
          if (currentMonth === selectedEndMonth) {
            endPixel = getBoundaryX(i);
          }
          currentMonth = month;
          tStartIdx = i;
        }
      }

      // Ensure start and end are ordered correctly in case of crossed year boundaries
      if (startPixel !== null && endPixel !== null) {
        if (startPixel > endPixel) {
          const temp = startPixel;
          startPixel = endPixel;
          endPixel = temp;
        }
        ctx.save();
        ctx.fillStyle = 'rgba(59, 130, 246, 0.15)'; // Blue tint for selected range
        ctx.fillRect(startPixel, chartArea.top, endPixel - startPixel, chartArea.bottom - chartArea.top);
        ctx.strokeStyle = '#3b82f6';
        ctx.lineWidth = 1;
        ctx.strokeRect(startPixel, chartArea.top, endPixel - startPixel, chartArea.bottom - chartArea.top);
        ctx.restore();
      }
    }
  }
};

// Draw or Update Chart
// Helper to calculate Simple Moving Average
function calculateSMA(data, period) {
  const result = [];
  for (let i = 0; i < data.length; i++) {
    if (i < period - 1) {
      result.push(null);
    } else {
      let sum = 0;
      for (let j = 0; j < period; j++) {
        sum += data[i - j] || 0;
      }
      result.push(sum / period);
    }
  }
  return result;
}

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

  const datasets = [];

  // Primary Dataset
  const primaryDataset = {
    label: label,
    data: values,
    borderWidth: 2,
  };

  if (currentChartType === 'line') {
    primaryDataset.fill = true;
    primaryDataset.tension = 0;
    primaryDataset.pointRadius = 0;
    primaryDataset.pointHoverRadius = 5;
    primaryDataset.segment = {
      borderColor: ctx => getMonthColor(ctx, color, showMA ? '4d' : ''), // Increased border alpha (0.15 -> 0.3)
      backgroundColor: ctx => getMonthColor(ctx, color, showMA ? '26' : '66') // Increased fill alpha (0.08 -> 0.15)
    };
  } else { // bar
    primaryDataset.backgroundColor = ctx => getMonthColor(ctx, color, showMA ? '26' : '66');
    primaryDataset.borderColor = ctx => getMonthColor(ctx, color, showMA ? '4d' : '');
  }
  datasets.push(primaryDataset);

  // Handle System CPU dual line (Avg + Max) - Force combo chart for visibility
  if (currentMetric === 'sys_cpu' && yearlyData['max_sys_cpu'].length > 0) {
    // 1. Re-adjust Primary (Avg) style for CPU
    primaryDataset.label = '평균 CPU';
    primaryDataset.order = 2; // Behind max line

    // 2. Add Max CPU as a forced Line
    const maxCpuData = yearlyData['max_sys_cpu'].map(item => item.value);
    const maxDataset = {
      label: '최대 CPU',
      type: 'line', // Always line
      data: maxCpuData,
      borderWidth: 2,
      borderColor: '#ef9eaba1', // Rose Red
      backgroundColor: 'transparent',
      pointRadius: 0,
      tension: 0.4, // Smooth curve
      order: 1 // In front
    };
    datasets.push(maxDataset);
  }

  // Add 7-day and 30-day Moving Averages only if enabled
  if (showMA) {
    const ma7Data = calculateSMA(values, 7);
    const ma30Data = calculateSMA(values, 30);

    datasets.push({
      label: '7일 이동평균',
      type: 'line',
      data: ma7Data,
      borderColor: '#ff4d00', // More vibrant orange-red for better visibility
      borderWidth: 1.5,
      pointRadius: 0,
      fill: false,
      tension: 0.3,
      borderDash: [1, 1], // Optional: dashed line for MA
      order: 0, // Top-most
      pointStyle: 'line' // Ensure legend shows as line
    });

    datasets.push({
      label: '30일 이동평균',
      type: 'line',
      data: ma30Data,
      borderColor: '#682cf3ff', // Violet
      borderWidth: 1.5,
      pointRadius: 0,
      fill: false,
      tension: 0.3,
      order: 0,
      pointStyle: 'line' // Ensure legend shows as line
    });
  }

  if (chartInstance && chartInstance.config.type !== currentChartType) {
    chartInstance.destroy();
    chartInstance = null;
  }

  if (chartInstance) {
    chartInstance.data.labels = labels;
    chartInstance.data.datasets = datasets;
    chartInstance.update();
  } else {
    // Create new chart
    const newChart = new Chart(ctx, {
      type: currentChartType,
      data: {
        labels: labels,
        datasets: datasets
      },
      plugins: [monthBoundaryPlugin, selectionRangePlugin],
      options: {
        events: ['mousemove', 'mouseout', 'click', 'touchstart', 'touchmove', 'mousedown', 'mouseup'], // Required to capture drag start/end
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
            display: true,
            position: 'top',
            align: 'end',
            labels: {
              boxWidth: 20,
              padding: 10,
              font: { size: 10 },
              usePointStyle: true,
              filter: function(item, chart) {
                // Filter out the primary metric and Max CPU from the legend
                return item.text.includes('이동평균');
              }
            }
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


// Selection Change Handler
async function handleChartSelectionChanged() {
  const rangeDisplay = document.getElementById('selectedRangeDisplay');
  const metrics = currentMetric;
  const domainId = domainSelect.value;
  const instanceId = instanceSelect.value;

  const currentMetricData = yearlyData[currentMetric] || [];
  let startIdx = -1;
  let endIdx = -1;

  if (!selectedStartMonth || !selectedEndMonth) {
    rangeDisplay.textContent = '전체 (1년)';
    // Reset to full data
    updateSummaryCardsPartial(0, currentMetricData.length - 1);

    // Fetch full data bounds from currentMetricData
    if (currentMetricData && currentMetricData.length > 0) {
      const startStr = currentMetricData[0].time;
      const endStr = currentMetricData[currentMetricData.length - 1].time;

      const formatYMDLocal = (str) => {
        const y = str.substring(0, 4);
        const m = str.substring(4, 6);
        const d = str.substring(6, 8);
        return `${y}.${m}.${d}`;
      };
      rangeDisplay.innerHTML = `${formatYMDLocal(startStr)} <span style="color: var(--text-secondary); margin: 0 4px; font-weight: 500;">-</span> ${formatYMDLocal(endStr)}`;

      const sYear = parseInt(startStr.substring(0, 4), 10);
      const sMonth = parseInt(startStr.substring(4, 6), 10) - 1;
      const sDay = parseInt(startStr.substring(6, 8), 10);

      const eYear = parseInt(endStr.substring(0, 4), 10);
      const eMonth = parseInt(endStr.substring(4, 6), 10) - 1;
      const eDay = parseInt(endStr.substring(6, 8), 10);

      const exactStartDate = new Date(sYear, sMonth, sDay);
      const exactEndDate = new Date(eYear, eMonth, eDay);

      await reloadHeatmaps(domainId, instanceId, exactStartDate, exactEndDate);
    }
    return;
  }

  // Because selectedStartMonth/EndMonth could be out of order in the UI drag (already sorted in plugin)
  let tStartMonth = selectedStartMonth;
  let tEndMonth = selectedEndMonth;

  // Use the already declared currentMetricData

  // Find first occurrence of start month
  const labels = currentMetricData.map(item => parseDateString(item.time));

  // Find first occurrence of start month
  for (let i = 0; i < labels.length; i++) {
    if (labels[i].startsWith(tStartMonth + '/')) {
      startIdx = i;
      break;
    }
  }

  // Find last occurrence of end month
  for (let i = labels.length - 1; i >= 0; i--) {
    if (labels[i].startsWith(tEndMonth + '/')) {
      endIdx = i;
      break;
    }
  }

  if (startIdx !== -1 && endIdx !== -1) {
    if (startIdx > endIdx) {
      const temp = startIdx;
      startIdx = endIdx;
      endIdx = temp;

      const tTemp = tStartMonth;
      tStartMonth = tEndMonth;
      tEndMonth = tTemp;
    }

    // 1. Update Display Text
    const startStr = currentMetricData[startIdx].time.substring(0, 8); // yyyymmdd
    const endStr = currentMetricData[endIdx].time.substring(0, 8);

    const formatYMDLocal = (str) => {
      const y = str.substring(0, 4);
      const m = str.substring(4, 6);
      const d = str.substring(6, 8);
      return `${y}.${m}.${d}`;
    };
    rangeDisplay.innerHTML = `${formatYMDLocal(startStr)} <span style="color: var(--text-secondary); margin: 0 4px; font-weight: 500;">-</span> ${formatYMDLocal(endStr)}`;

    // 2. Filter data for Summary Cards
    updateSummaryCardsPartial(startIdx, endIdx);

    // 3. Reload Heatmaps with Precise Date Range
    // Create actual Date objects for the start and end of the exact data bounds
    const sYear = parseInt(startStr.substring(0, 4), 10);
    const sMonth = parseInt(startStr.substring(4, 6), 10) - 1;
    const sDay = parseInt(startStr.substring(6, 8), 10);

    const eYear = parseInt(endStr.substring(0, 4), 10);
    const eMonth = parseInt(endStr.substring(4, 6), 10) - 1;
    const eDay = parseInt(endStr.substring(6, 8), 10);

    const exactStartDate = new Date(sYear, sMonth, sDay);
    const exactEndDate = new Date(eYear, eMonth, eDay);

    await reloadHeatmaps(domainId, instanceId, exactStartDate, exactEndDate);
  }
}

async function reloadHeatmaps(domainId, instanceId, startDate, endDate) {
  try {
    const fetchEndDate = new Date(endDate);
    fetchEndDate.setDate(fetchEndDate.getDate() + 1);

    const timePromises = [];
    const countPromises = [];

    let currentStart = new Date(startDate);
    while (currentStart < fetchEndDate) {
      let currentEnd = new Date(currentStart);
      currentEnd.setDate(currentEnd.getDate() + 30); // 30-day chunks to bypass 31-day API limit
      if (currentEnd > fetchEndDate) {
        currentEnd = new Date(fetchEndDate);
      }

      const chunkStartStr = formatDateParam(currentStart);
      const chunkEndStr = formatDateParam(currentEnd);

      // Determine what metric to fetch for heatmap value
      // Overall heatmap always uses Hit수 (service_count) on Y-axis
      // Day x Hour heatmap uses the selected metric on Z-axis (color)
      const metricToFetch = currentMetric === 'service_count' ? 'service_time' : currentMetric;

      timePromises.push(
        fetchMetricData(domainId, instanceId, chunkStartStr, chunkEndStr, 60, metricToFetch)
          .catch(err => { console.warn(`Heatmap ${metricToFetch} chunk failed`, err); return []; })
      );
      countPromises.push(
        fetchMetricData(domainId, instanceId, chunkStartStr, chunkEndStr, 60, 'service_count')
          .catch(err => { console.warn("Heatmap service_count chunk failed", err); return []; })
      );

      currentStart = currentEnd;
    }

    const timeResults = await Promise.all(timePromises);
    const countResults = await Promise.all(countPromises);

    let heatmapTimeData = [];
    timeResults.forEach(res => heatmapTimeData.push(...res));
    heatmapTimeData.sort((a, b) => String(a.time).localeCompare(String(b.time)));

    let heatmapCountData = [];
    countResults.forEach(res => heatmapCountData.push(...res));
    heatmapCountData.sort((a, b) => String(a.time).localeCompare(String(b.time)));

    const combinedHeatmapData = heatmapTimeData.map((timeItem, idx) => {
      const countItem = heatmapCountData[idx];
      return {
        time: timeItem.time,
        value: timeItem.value, // This is currentMetric value (or service_time if Hit수 is selected)
        count: countItem ? countItem.value : 0
      };
    });

    const isHitSelected = (currentMetric === 'service_count');
    renderDayHourHeatmap(combinedHeatmapData, isHitSelected, currentMetric);
    renderOverallHeatmap(combinedHeatmapData, isHitSelected, currentMetric);
  } catch (error) {
    console.error("Heatmaps reloading failed:", error);
  }
}

function renderDayHourHeatmap(data, isHitSelected, metric) {
  const container = document.getElementById('dayHourHeatmap');
  if (!container) return;

  if (!data || data.length === 0) {
    container.innerHTML = '<div class="heatmap-placeholder">데이터가 없습니다.</div>';
    return;
  }

  const days = ['Sun', 'Mon', 'Tue', 'Wed', 'Thu', 'Fri', 'Sat'];
  const hours = Array.from({ length: 24 }, (_, i) => String(i).padStart(2, '0'));

  // Group data by day and hour
  // dayHourMap[dayIndex][hourIndex] = { sum: 0, count: 0 }
  const dayHourMap = Array.from({ length: 7 }, () => Array.from({ length: 24 }, () => ({ sum: 0, count: 0 })));

  // Group items by date, then map each date's items to hours 0..23 in order
  const groupedByDate = {};
  data.forEach(item => {
    const dateKey = String(item.time).substring(0, 8);
    if (!groupedByDate[dateKey]) groupedByDate[dateKey] = [];
    groupedByDate[dateKey].push(item);
  });

  Object.entries(groupedByDate).forEach(([dateKey, items]) => {
    const year = parseInt(dateKey.substring(0, 4));
    const month = parseInt(dateKey.substring(4, 6)) - 1;
    const day = parseInt(dateKey.substring(6, 8));
    const date = new Date(year, month, day);
    const dayIdx = date.getDay();

    // Map each item in order to hour 0, 1, 2, ...
    // API returns 24 items per day in chronological order
    items.forEach((item, posInDay) => {
      const hour = posInDay % 24;
      if (item.count > 0) {
        dayHourMap[dayIdx][hour].sum += item.value;
        dayHourMap[dayIdx][hour].count++;
      }
    });
  });

  // Calculate average for each day-hour slot
  const allAverages = [];
  dayHourMap.forEach(day => {
    day.forEach(hour => {
      if (hour.count > 0) {
        allAverages.push(hour.sum / hour.count);
      }
    });
  });

  // Calculate dynamic thresholds if not already stored for the current metric
  let goodThreshold, warningThreshold;

  if (metricThresholds[metric]) {
    goodThreshold = metricThresholds[metric].good;
    warningThreshold = metricThresholds[metric].warning;
  } else {
    // Default fallback
    goodThreshold = 100;
    warningThreshold = 300;

    if (allAverages.length > 0) {
      allAverages.sort((a, b) => a - b);
      const percentile = (arr, p) => {
        if (arr.length === 0) return 0;
        if (typeof p !== 'number') throw new TypeError('p must be a number');
        if (p <= 0) return arr[0];
        if (p >= 1) return arr[arr.length - 1];
        const index = (arr.length - 1) * p;
        const lower = Math.floor(index);
        const upper = lower + 1;
        const weight = index % 1;
        if (upper >= arr.length) return arr[lower];
        return arr[lower] * (1 - weight) + arr[upper] * weight;
      };

      const q1 = percentile(allAverages, 0.25);
      const q3 = percentile(allAverages, 0.75);
      const iqr = q3 - q1;

      goodThreshold = q3;
      warningThreshold = q3 + (1.5 * iqr);

      // Cache these thresholds so they persist during chart selections (filtering period)
      metricThresholds[metric] = { good: goodThreshold, warning: warningThreshold };
    }
  }

  // Update Legend with calculated thresholds
  const legendGoodText = document.getElementById('legendGoodText');
  const legendWarningText = document.getElementById('legendWarningText');
  const legendDangerText = document.getElementById('legendDangerText');

  if (legendGoodText && legendWarningText && legendDangerText) {
    const unit = isHitSelected ? 'ms' : getMetricUnit(metric);
    if (allAverages.length > 0) {
      const formatThreshold = (val) => val.toLocaleString(undefined, { minimumFractionDigits: 2, maximumFractionDigits: 2 });
      legendGoodText.innerHTML = `양호 <span style="font-size: 0.65rem; color: #94a3b8; margin-left: 2px;">(≤ ${formatThreshold(goodThreshold)}${unit})</span>`;
      legendWarningText.innerHTML = `주의 <span style="font-size: 0.65rem; color: #94a3b8; margin-left: 2px;">(≤ ${formatThreshold(warningThreshold)}${unit})</span>`;
      legendDangerText.innerHTML = `나쁨 <span style="font-size: 0.65rem; color: #94a3b8; margin-left: 2px;">(> ${formatThreshold(warningThreshold)}${unit})</span>`;
    } else {
      legendGoodText.textContent = '양호';
      legendWarningText.textContent = '주의';
      legendDangerText.textContent = '나쁨';
    }
  }

  let html = '<table class="heatmap-table">';
  html += '<thead><tr><th></th>';
  hours.forEach(h => {
    html += `<th>${h}</th>`;
  });
  html += '</tr></thead><tbody>';

  days.forEach((day, dIdx) => {
    html += `<tr><td class="cell-label">${day}</td>`;
    hours.forEach((h, hIdx) => {
      const cell = dayHourMap[dIdx][parseInt(h)];
      const avg = cell.count > 0 ? cell.sum / cell.count : 0;

      // Interpolate colors based on value
      // 0: Light background, Low: Green, Mid: Yellow, High: Red
      let bgColor = 'rgba(0, 0, 0, 0.05)'; // Default for no data in light theme
      if (cell.count > 0) {
        // Create a custom scale:
        // 0 -> #dcfce7 (Very Light Green)
        // goodThreshold -> #22c55e (Green - 양호)
        // warningThreshold -> #facc15 (Yellow - 주의)
        // Max -> #ef4444 (Red - 나쁨)

        const maxVal = Math.max(warningThreshold * 1.5, avg); // Ensure red is reached
        const colorScale = d3.scaleLinear()
          .domain([0, goodThreshold, warningThreshold, maxVal])
          .range(['#dcfce7', '#22c55e', '#facc15', '#ef4444'])
          .clamp(true);

        bgColor = colorScale(avg);
      }

      const unit = isHitSelected ? 'ms' : getMetricUnit(metric);
      const formattedAvg = avg.toLocaleString(undefined, { minimumFractionDigits: 2, maximumFractionDigits: 2 });
      const tooltipText = cell.count > 0 ? `${day} ${h}:00<br/>Avg: ${formattedAvg}${unit}` : 'No data';
      html += `<td style="background-color: ${bgColor}" 
                onmouseover="showHeatmapTooltip(event, '${tooltipText}')" 
                onmouseout="hideHeatmapTooltip()">
              </td>`;
    });
    html += '</tr>';
  });
  html += '</tbody></table>';

  container.innerHTML = html;
}

function renderOverallHeatmap(data, isHitSelected, metric) {
  const container = document.getElementById('overallHeatmap');
  if (!container) return;

  if (!data || data.length === 0) {
    container.innerHTML = '<div class="heatmap-placeholder">데이터가 없습니다.</div>';
    return;
  }

  // 1. Filter data: only items with count > 0 to find meaningful distributions
  const validData = data.filter(d => d.count > 0);
  if (validData.length === 0) {
    container.innerHTML = '<div class="heatmap-placeholder">유효한 데이터가 없습니다.</div>';
    return;
  }

  container.innerHTML = ''; // Clear previous

  // 2. Calculate Medians (Central Axes)
  // X-axis (Hits) is always dynamic based on current data
  const counts = validData.map(d => d.count).sort((a, b) => a - b);
  const d3Median = (arr) => {
    const mid = Math.floor(arr.length / 2);
    return arr.length % 2 !== 0 ? arr[mid] : (arr[mid - 1] + arr[mid]) / 2;
  };
  const medianX = d3Median(counts); // X is now Hits
  const maxX = Math.max(...counts, 1);

  // Y-axis (Metric Value) is fixed based on 1-year data
  let medianY, maxY;
  if (overallYThresholds[metric]) {
    medianY = overallYThresholds[metric].median;
    maxY = overallYThresholds[metric].max;
  } else {
    const times = validData.map(d => d.value).sort((a, b) => a - b);
    medianY = d3Median(times);
    maxY = Math.max(...times, 100);
    // Cache for this metric
    overallYThresholds[metric] = { median: medianY, max: maxY };
  }

  // 3. Setup SVG Canvas
  const margin = { top: 20, right: 20, bottom: 40, left: 50 };
  const containerWidth = container.clientWidth || 500;
  const containerHeight = Math.max(container.clientHeight, 350) || 350;

  const width = containerWidth - margin.left - margin.right;
  const height = containerHeight - margin.top - margin.bottom;

  const svg = d3.select(container)
    .append("svg")
    .attr("width", containerWidth)
    .attr("height", containerHeight)
    .append("g")
    .attr("transform", `translate(${margin.left},${margin.top})`);

  // 4. Scales mapping (0 -> Median -> Max) to (0 -> Width/2 -> Width)
  // Swapped: X is now Hits, Y is now Metric Value
  const xScale = d3.scaleLinear()
    .domain([0, medianX, maxX]) // medianX is counts (dynamic)
    .range([0, width / 2, width])
    .clamp(true);

  const yScale = d3.scaleLinear()
    .domain([0, medianY, maxY]) // medianY is metric value (fixed)
    .range([height, height / 2, 0])
    .clamp(true);

  // 5. Hexbin configuration
  const radius = 12;
  const hexbin = d3.hexbin()
    .x(d => xScale(d.count))
    .y(d => yScale(d.value))
    .radius(radius)
    .extent([[0, 0], [width, height]]);

  const bins = hexbin(validData);
  const maxBinLength = d3.max(bins, d => d.length);

  // Define a color scale mapping density to green opacity
  // Non-linear mapping using square root for better contrast with sparse data, but using a darker base.
  const colorScale = d3.scaleSequential(
    (t) => `rgba(34, 197, 94, ${Math.min(0.3 + (Math.pow(t, 0.4) * 0.7), 1)})`
  ).domain([1, maxBinLength || 1]);

  // 6. Draw the 4-Quadrant Axes (Centered on Median)
  svg.append("line")
    .attr("x1", width / 2)
    .attr("x2", width / 2)
    .attr("y1", 0)
    .attr("y2", height)
    .attr("class", "quadrant-axis");

  svg.append("line")
    .attr("x1", 0)
    .attr("x2", width)
    .attr("y1", height / 2)
    .attr("y2", height / 2)
    .attr("class", "quadrant-axis");

  // 7. Render Hexagons
  svg.append("g")
    .attr("class", "hexagon-group")
    .selectAll("path")
    .data(bins)
    .join("path")
    .attr("d", hexbin.hexagon())
    .attr("transform", d => `translate(${d.x},${d.y})`)
    .attr("fill", d => colorScale(d.length))
    .attr("stroke", "white")
    .attr("stroke-width", "0.5")
    .on("mouseover", function (event, d) {
      d3.select(this).attr("stroke", "#333").attr("stroke-width", "1.5");
      // Find min ~ max ranges of the bin for the tooltip
      const minTime = d3.min(d, p => p.value); // Changed from p.responseTime to p.value
      const maxTime = d3.max(d, p => p.value); // Changed from p.responseTime to p.value
      const minCount = d3.min(d, p => p.count);
      const maxCount = d3.max(d, p => p.count);

      const formatVal = (v) => Number.isInteger(v) ? v.toString() : v.toFixed(2);
      const timeRange = minTime === maxTime ? formatVal(minTime) : `${formatVal(minTime)} ~ ${formatVal(maxTime)}`;
      const countRange = minCount === maxCount ? formatVal(minCount) : `${formatVal(minCount)} ~ ${formatVal(maxCount)}`;

      const unit = isHitSelected ? 'ms' : getMetricUnit(metric);
      const labelName = isHitSelected ? 'Res.Time' : 'Value';
      const tooltipText = `Hits: ${countRange}<br/>${labelName}: ${timeRange} ${unit}<br/>Points: ${d.length}`;
      showHeatmapTooltip(event, tooltipText);
    })
    .on("mouseout", function () {
      d3.select(this).attr("stroke", "white").attr("stroke-width", "0.5");
      hideHeatmapTooltip();
    });

  // 8. Minimalist Labels (Only Medians)
  const formatNum = (num) => {
    if (num >= 1000) return (num / 1000).toFixed(1).replace('.0', '') + 'k';
    // If it's not an integer, show 2 decimal places. Otherwise show as is.
    return Number.isInteger(num) ? num.toString() : num.toFixed(2);
  };

  // X-Axis Median Label (Hits)
  svg.append("text")
    .attr("x", width / 2)
    .attr("y", height + 25)
    .attr("class", "quadrant-label")
    .attr("text-anchor", "middle")
    .text(formatNum(medianX) + ' Hits');

  // Y-Axis Median Label (Value)
  const unit = isHitSelected ? 'ms' : getMetricUnit(metric);
  svg.append("text")
    .attr("x", -10)
    .attr("y", height / 2)
    .attr("class", "quadrant-label")
    .attr("text-anchor", "end")
    .attr("alignment-baseline", "middle")
    .text(formatNum(medianY) + unit);

  // Update Footer Label (External to SVG)
  const labelY = document.getElementById('overallHeatmapLabelY');
  if (labelY) {
    const metricDisplayName = isHitSelected ? '응답시간' : document.querySelector(`.metric-btn[data-metric="${metric}"]`).textContent;
    labelY.textContent = `${metricDisplayName} (${unit})`;
  }
}

// Ensure a single global tooltip exists
let globalHeatmapTooltip = document.getElementById('globalHeatmapTooltip');
if (!globalHeatmapTooltip) {
  globalHeatmapTooltip = document.createElement('div');
  globalHeatmapTooltip.id = 'globalHeatmapTooltip';
  globalHeatmapTooltip.className = 'heatmap-tooltip';
  document.body.appendChild(globalHeatmapTooltip);
}

window.showHeatmapTooltip = function (event, text) {
  if (!globalHeatmapTooltip) return;

  globalHeatmapTooltip.innerHTML = text;
  globalHeatmapTooltip.style.display = 'block';

  const x = event.pageX + 15;
  const y = event.pageY + 15;

  globalHeatmapTooltip.style.left = x + 'px';
  globalHeatmapTooltip.style.top = y + 'px';
};

window.hideHeatmapTooltip = function () {
  if (globalHeatmapTooltip) globalHeatmapTooltip.style.display = 'none';
};

function updateFooterHoverStats(monthStr) {
  // No longer used for DOM footer - stats are rendered directly in chart canvas
}

function updateSummaryCardsPartial(startIdx, endIdx) {
  if (startIdx < 0 || endIdx < 0 || yearlyData['service_time'].length === 0) {
    document.getElementById('peakDate').textContent = '-';
    document.getElementById('avgResponseTime').innerHTML = `0 <span class="unit">ms</span>`;
    document.getElementById('avgTps').textContent = '0';
    document.getElementById('avgConcurrentUsers').textContent = '0';
    document.getElementById('avgHits').textContent = '0';
    return;
  }

  const today = new Date();
  const todayStr = today.getFullYear() +
    String(today.getMonth() + 1).padStart(2, '0') +
    String(today.getDate()).padStart(2, '0');

  const calcAvg = data => {
    const validData = data.filter(d =>
      d.time <= todayStr &&
      d.value !== 0 && d.value !== null && d.value !== undefined
    );
    return validData.length ? validData.reduce((s, d) => s + d.value, 0) / validData.length : 0;
  };

  const sliceData = (metricKey) => {
    // If the selected metric (e.g. main chart) has different length than the rest, fallback to full length of that metric
    const arr = yearlyData[metricKey];
    if (!arr || arr.length === 0) return [];
    // Ensure bounds
    const s = Math.max(0, startIdx);
    const e = Math.min(arr.length - 1, endIdx);
    return arr.slice(s, e + 1);
  };

  const stData = sliceData('service_time');
  const srData = sliceData('service_rate');
  const cuData = sliceData('concurrent_user');
  const scData = sliceData('service_count');
  const sysCpuData = sliceData('sys_cpu');
  const maxSysCpuData = sliceData('max_sys_cpu');
  const heapUsageData = sliceData('heap_usage');

  // Peak Date (Based on currently selected metric)
  const currentData = sliceData(currentMetric);
  if (currentData.length > 0) {
    let maxEntry = currentData[0];
    currentData.forEach(entry => {
      if (entry.value > maxEntry.value) maxEntry = entry;
    });
    document.getElementById('peakDate').textContent = parseDateString(maxEntry.time, true);
  } else {
    document.getElementById('peakDate').textContent = '-';
  }

  const avgST = calcAvg(stData);
  const avgSR = calcAvg(srData);
  const avgCU = calcAvg(cuData);
  const avgSC = calcAvg(scData);
  const avgSysCpu = calcAvg(sysCpuData);
  const avgMaxSysCpu = calcAvg(maxSysCpuData);
  const avgHeapUsage = calcAvg(heapUsageData);

  document.getElementById('avgResponseTime').innerHTML = `${Math.round(avgST).toLocaleString()} <span class="unit">ms</span>`;
  document.getElementById('avgTps').textContent = avgSR.toLocaleString(undefined, { minimumFractionDigits: 2, maximumFractionDigits: 2 });
  document.getElementById('avgConcurrentUsers').textContent = Math.round(avgCU).toLocaleString();
  document.getElementById('avgHits').textContent = Math.round(avgSC).toLocaleString();
  const isInstanceSelected = !!(document.getElementById('instanceSelect').value);
  document.getElementById('avgSysCpu').textContent = isInstanceSelected ? `${Math.round(avgSysCpu)}%` : '-';
  document.getElementById('avgHeapUsage').textContent = isInstanceSelected ? `${Math.round(avgHeapUsage)}%` : '-';
}

// Utilities
function formatDateParam(date) {
  const y = date.getFullYear();
  const m = String(date.getMonth() + 1).padStart(2, '0');
  const d = String(date.getDate()).padStart(2, '0');
  return `${y}${m}${d}`;
}

function getMetricUnit(metric) {
  switch (metric) {
    case 'service_time': return 'ms';
    case 'service_rate': return 'TPS';
    case 'concurrent_user': return '명';
    case 'service_count': return 'Hits';
    case 'sys_cpu':
    case 'max_sys_cpu':
    case 'heap_usage': return '%';
    default: return '';
  }
}


// Keyboard Navigation for Chart Selection
window.addEventListener('keydown', (e) => {
  if (e.key !== 'ArrowLeft' && e.key !== 'ArrowRight') return;
  if (!mainChartInstance || !selectedStartMonth || !selectedEndMonth) return;

  const labels = mainChartInstance.data.labels;
  if (!labels || labels.length === 0) return;

  // Get unique months in order
  const uniqueMonths = [];
  labels.forEach(lbl => {
    const m = lbl.split('/')[0];
    if (!uniqueMonths.includes(m)) uniqueMonths.push(m);
  });

  let startIdx = uniqueMonths.indexOf(selectedStartMonth);
  let endIdx = uniqueMonths.indexOf(selectedEndMonth);

  if (startIdx === -1 || endIdx === -1) return;

  // Swap if needed to ensure normalized range
  if (startIdx > endIdx) {
    [startIdx, endIdx] = [endIdx, startIdx];
  }

  const shift = e.key === 'ArrowLeft' ? -1 : 1;

  if (e.shiftKey) {
    if (e.key === 'ArrowLeft') {
      if (activeSelectionBoundary === 'start') {
        const newStartIdx = startIdx - 1;
        if (newStartIdx >= 0) {
          selectedStartMonth = uniqueMonths[newStartIdx];
        } else return;
      } else {
        // activeSelectionBoundary === 'end'
        if (startIdx === endIdx) {
          // Switch to start and move left
          const newStartIdx = startIdx - 1;
          if (newStartIdx >= 0) {
            selectedStartMonth = uniqueMonths[newStartIdx];
            activeSelectionBoundary = 'start';
          } else return;
        } else {
          const newEndIdx = endIdx - 1;
          selectedEndMonth = uniqueMonths[newEndIdx];
        }
      }
    } else {
      // ArrowRight
      if (activeSelectionBoundary === 'end') {
        const newEndIdx = endIdx + 1;
        if (newEndIdx < uniqueMonths.length) {
          selectedEndMonth = uniqueMonths[newEndIdx];
        } else return;
      } else {
        // activeSelectionBoundary === 'start'
        if (startIdx === endIdx) {
          // Switch to end and move right
          const newEndIdx = endIdx + 1;
          if (newEndIdx < uniqueMonths.length) {
            selectedEndMonth = uniqueMonths[newEndIdx];
            activeSelectionBoundary = 'end';
          } else return;
        } else {
          const newStartIdx = startIdx + 1;
          selectedStartMonth = uniqueMonths[newStartIdx];
        }
      }
    }
    handleChartSelectionChanged();
    mainChartInstance.update();
  } else {
    // Shift the entire range
    const newStartIdx = startIdx + shift;
    const newEndIdx = endIdx + shift;
    if (newStartIdx >= 0 && newEndIdx < uniqueMonths.length) {
      selectedStartMonth = uniqueMonths[newStartIdx];
      selectedEndMonth = uniqueMonths[newEndIdx];
      handleChartSelectionChanged();
      mainChartInstance.update();
    }
  }
});

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
function mockDataOnFailPartial() {
  console.log("Using Mock Data (1 Year)");

  // Generate 365 days of mock data
  const mockDates = [];
  const startYearDate = new Date();
  startYearDate.setFullYear(startYearDate.getFullYear() - 1);

  for (let i = 0; i < 365; i++) {
    const d = new Date(startYearDate.getTime() + i * 24 * 3600000);
    const dateStr = d.getFullYear() +
      String(d.getMonth() + 1).padStart(2, '0') +
      String(d.getDate()).padStart(2, '0');
    mockDates.push(dateStr);
  }

  yearlyData['service_time'] = mockDates.map(d => ({ time: d, value: 3000 + Math.random() * 2000 }));
  yearlyData['service_rate'] = mockDates.map(d => ({ time: d, value: 2 + Math.random() * 5 }));
  yearlyData['concurrent_user'] = mockDates.map(d => ({ time: d, value: 100 + Math.random() * 200 }));
  yearlyData['service_count'] = mockDates.map(d => ({ time: d, value: 5000 + Math.random() * 15000 }));
  yearlyData['sys_cpu'] = mockDates.map(d => ({ time: d, value: 10 + Math.random() * 25 }));
  yearlyData['max_sys_cpu'] = mockDates.map(d => ({ time: d, value: 40 + Math.random() * 50 }));
  yearlyData['heap_usage'] = mockDates.map(d => ({ time: d, value: 30 + Math.random() * 40 }));

  // Update main chart
  const activeBtn = document.querySelector(`.metric-btn[data-metric="${currentMetric}"]`);
  const metricDisplayName = activeBtn ? activeBtn.textContent : '응답시간';

  updateChart('mainChart', metricDisplayName, yearlyData[currentMetric], '#22c55e', mainChartInstance, (instance) => {
    mainChartInstance = instance;
  });
  updateSummaryCardsPartial(0, yearlyData['service_time'].length - 1);

  // Mock Heatmap Data (last 30 days)
  const heatmapMockData = [];
  const start = new Date();
  start.setDate(start.getDate() - 30);
  for (let i = 0; i < 30 * 24; i++) {
    const d = new Date(start.getTime() + i * 3600000);
    const timeStr = d.getFullYear() +
      String(d.getMonth() + 1).padStart(2, '0') +
      String(d.getDate()).padStart(2, '0') +
      String(d.getHours()).padStart(2, '0') + "00";
    heatmapMockData.push({
      time: timeStr,
      responseTime: 50 + Math.random() * 400,
      count: Math.floor(Math.random() * 1000)
    });
  }
  renderDayHourHeatmap(heatmapMockData);
  renderOverallHeatmap(heatmapMockData);
}
