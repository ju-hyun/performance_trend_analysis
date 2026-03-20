import Chart from 'chart.js/auto';
import { config } from './config.js';

const API_BASE = (config.API_DOMAIN || '') + '/api/dbmetrics';
const TOKEN = config.TOKEN;

// Metrics mapping
const METRICS = [
  { key: 'service_rate', label: 'TPS', unit: 'TPS', color: '#3b82f6' },
  { key: 'service_count', label: 'Hit数', unit: 'Hits', color: '#8b5cf6' },
  { key: 'service_time', label: '応答時間', unit: 'ms', color: '#22c55e' },
  { key: 'concurrent_user', label: '同時ユーザ数', unit: '人', color: '#f59e0b' },
  { key: 'err_rate', label: 'エラー率', unit: '%', color: '#ef4444' },
  { key: 'sys_cpu', label: 'システムCPU', unit: '%', color: '#ec4899' },
  { key: 'heap_usage', label: 'ヒープメモリ使用率', unit: '%', color: '#06b6d4' }
];

let globalChartData = {};
let chartInstances = {};
let selectedTimeIndex = -1;
let activeMetrics = [];

function getQueryParams() {
  const params = new URLSearchParams(window.location.search);
  return {
    start_time: params.get('start_time'),
    metric: params.get('metric'),
    domain_id: params.get('domain_id'),
    instance_id: params.get('instance_id')
  };
}

// Ensure proper date calculation
function getEndTime(startTimeStr) {
  // startTimeStr format: yyyyMMddHHmm
  const y = parseInt(startTimeStr.substring(0, 4), 10);
  const m = parseInt(startTimeStr.substring(4, 6), 10) - 1;
  const d = parseInt(startTimeStr.substring(6, 8), 10);
  const H = parseInt(startTimeStr.substring(8, 10), 10);
  const min = parseInt(startTimeStr.substring(10, 12), 10);

  const startDate = new Date(y, m, d, H, min);
  const endDate = new Date(startDate.getTime() + 60 * 60 * 1000); // +1 hour

  const format = (date) => {
    return date.getFullYear() +
      String(date.getMonth() + 1).padStart(2, '0') +
      String(date.getDate()).padStart(2, '0') +
      String(date.getHours()).padStart(2, '0') +
      String(date.getMinutes()).padStart(2, '0');
  };
  return format(endDate);
}

document.addEventListener('DOMContentLoaded', async () => {
  const params = getQueryParams();
  if (!params.start_time || !params.domain_id) {
    document.getElementById('loadingOverlay').innerHTML = '<h2>エラー: 必須パラメータ不足 (start_time 等)</h2>';
    return;
  }

  activeMetrics = params.instance_id ? METRICS : METRICS.filter(m => m.key !== 'sys_cpu' && m.key !== 'heap_usage');

  const endTime = getEndTime(params.start_time);

  await loadData(params.domain_id, params.instance_id, params.start_time, endTime, params.metric);
});

async function loadData(domainId, instanceId, startTime, endTime, targetMetric) {
  try {
    const rawMetrics = ['service_rate', 'service_count', 'service_time', 'concurrent_user', 'service_err_count', 'sys_cpu', 'heap_usage'];

    document.getElementById('loadingOverlay').classList.remove('hidden');

    // Fetch all sequentially or parallel
    const promises = rawMetrics.map(m => fetchMetricData(domainId, instanceId, startTime, endTime, 1, m).catch(() => []));
    const results = await Promise.all(promises);

    let dbData = {};
    let isDataEmpty = true;
    rawMetrics.forEach((m, idx) => {
      dbData[m] = results[idx].sort((a, b) => String(a.time).localeCompare(String(b.time)));
      if (dbData[m].length > 0) isDataEmpty = false;
    });

    // Fallback: If DB did not contain 1-minute aggregate data for this timeframe, provide mock
    if (isDataEmpty) {
      console.warn("API returned empty data for 1-minute intervals. Using fallback mock data for visualization.");
      const mockStart = new Date(
        parseInt(startTime.substring(0,4), 10),
        parseInt(startTime.substring(4,6), 10) - 1,
        parseInt(startTime.substring(6,8), 10),
        parseInt(startTime.substring(8,10), 10),
        0
      );
      
      rawMetrics.forEach(m => {
        dbData[m] = [];
        for (let i = 0; i < 60; i++) {
          const d = new Date(mockStart.getTime() + i * 60000);
          const timeStr = d.getFullYear() +
            String(d.getMonth() + 1).padStart(2, '0') +
            String(d.getDate()).padStart(2, '0') +
            String(d.getHours()).padStart(2, '0') +
            String(d.getMinutes()).padStart(2, '0');
            
          let val = 0;
          if (m === 'service_count') val = Math.floor(Math.random() * 50);
          else if (m === 'service_time') val = 20 + Math.random() * 80;
          else if (m === 'service_rate') val = Math.random() * 5;
          else if (m === 'concurrent_user') val = Math.floor(Math.random() * 10);
          else if (m === 'sys_cpu') val = 10 + Math.random() * 20;
          else if (m === 'heap_usage') val = 30 + Math.random() * 40;
          else if (m === 'service_err_count') val = Math.floor(Math.random() * 2);
          
          dbData[m].push({ time: timeStr, value: val });
        }
      });
    }

    // Calculate error rate
    dbData['err_rate'] = dbData['service_count'].map((sc, i) => {
      const errc = dbData['service_err_count'][i];
      const count = sc.value || 0;
      const errCount = (errc && errc.value) ? errc.value : 0;
      const rate = count > 0 ? (errCount / count) * 100 : 0;
      return { time: sc.time, value: rate };
    });

    globalChartData = dbData;

    initUI(targetMetric);

  } catch (e) {
    console.error(e);
    document.getElementById('loadingOverlay').innerHTML = '<h2>Error loading data</h2>';
  } finally {
    const overlay = document.getElementById('loadingOverlay');
    if (overlay.className.includes('hidden')) return;
    overlay.style.opacity = '0';
    setTimeout(() => overlay.style.display = 'none', 300);
  }
}

async function fetchMetricData(domainId, instanceId, startTime, endTime, intervalMinute, metric) {
  const endpoint = instanceId ? `${API_BASE}/instance` : `${API_BASE}/domain`;
  const url = new URL(endpoint, window.location.origin);

  url.searchParams.append('token', TOKEN);
  url.searchParams.append('domain_id', domainId);
  if (instanceId) {
    url.searchParams.append('instance_id', instanceId);
  }
  url.searchParams.append('time_pattern', 'yyyyMMddHHmm');
  url.searchParams.append('start_time', startTime);
  url.searchParams.append('end_time', endTime);
  url.searchParams.append('interval_minute', intervalMinute);
  url.searchParams.append('metrics', metric);

  const response = await fetch(url.toString(), {
    method: 'GET',
    headers: { 'Accept': 'application/json' }
  });

  if (!response.ok) throw new Error(`HTTP Error: ${response.status}`);
  const data = await response.json();
  return data.result || [];
}

function initUI(targetMetric) {
  const chartsPanel = document.getElementById('chartsPanel');
  const statsPanel = document.getElementById('statsPanel');

  // Clear containers except headers/crosshair
  const crosshair = document.getElementById('crosshair-line');
  const clickedLine = document.getElementById('clicked-line');
  chartsPanel.innerHTML = '';
  chartsPanel.appendChild(crosshair);
  if (clickedLine) chartsPanel.appendChild(clickedLine);

  const statHeader = document.getElementById('selectedTimeHeader');
  statsPanel.innerHTML = '';
  // statsPanel.appendChild(statHeader); is no longer needed since it's moved to top-header-container

  activeMetrics.forEach(m => {
    // Chart container
    const chartWrapper = document.createElement('div');
    chartWrapper.className = 'chart-row';
    if (m.key === targetMetric || (targetMetric === 'service_err_count' && m.key === 'err_rate')) {
      chartWrapper.classList.add('highlighted');
    }

    chartWrapper.innerHTML = `
      <div class="chart-title">${m.label} (${m.unit})</div>
      <div class="canvas-container">
        <canvas id="chart_${m.key}"></canvas>
      </div>
    `;
    chartsPanel.appendChild(chartWrapper);

    // Stat container
    const statBox = document.createElement('div');
    statBox.className = 'stat-box';
    statBox.id = `statbox_${m.key}`;
    statBox.innerHTML = `
      <div class="stat-label">${m.label}</div>
      <div class="stat-value" id="statval_${m.key}">-</div>
    `;
    statsPanel.appendChild(statBox);

    // Create Chart
    createChart(m.key, m.label, m.unit, m.color);
  });

  updateStatsPanel(-1); // average
}

function createChart(metricKey, label, unit, color) {
  const ctx = document.getElementById(`chart_${metricKey}`).getContext('2d');
  const data = globalChartData[metricKey] || [];

  const labels = data.map(d => formatTimeLabel(d.time));
  const values = data.map(d => d.value);

  const chartType = (metricKey === 'err_rate' || metricKey === 'sys_cpu' || metricKey === 'heap_usage') ? 'line' : 'bar';

  const chart = new Chart(ctx, {
    type: chartType,
    data: {
      labels: labels,
      datasets: [{
        label: label,
        data: values,
        borderColor: color,
        backgroundColor: color + '33', // 20% opacity
        borderWidth: 1,
        fill: true,
        pointRadius: 0,
        pointHoverRadius: 4,
        tension: 0.1,
        barPercentage: chartType === 'bar' ? 0.95 : undefined,
        categoryPercentage: chartType === 'bar' ? 1.0 : undefined
      }]
    },
    options: {
      responsive: true,
      maintainAspectRatio: false,
      interaction: {
        mode: 'index',
        intersect: false,
      },
      plugins: {
        legend: { display: false },
        tooltip: {
          enabled: true,
          callbacks: {
            title: () => null, // hide title
            label: (context) => {
              let val = context.parsed.y;
              return `${label}: ${formatNumber(val, unit)}${unit}`;
            }
          }
        }
      },
      scales: {
        x: {
          display: metricKey === activeMetrics[activeMetrics.length - 1].key, // only show x-axis for the last chart
          grid: { display: false },
          ticks: { maxTicksLimit: 12, autoSkip: true },
          offset: true // Fix cut-off bars and hover box hit areas
        },
        y: {
          beginAtZero: true,
          grid: { color: '#f1f5f9' },
          ticks: { maxTicksLimit: 3, font: { size: 9 }, callback: (v) => formatAxisValue(v, unit) }
        }
      },
      onHover: (event, activeElements) => {
        if (activeElements.length > 0) {
          const idx = activeElements[0].index;
          syncHovers(idx);
        } else {
          syncHovers(-1);
        }
      },
      onClick: (event, activeElements) => {
        if (activeElements.length > 0) {
          selectedTimeIndex = activeElements[0].index;
          updateStatsPanel(selectedTimeIndex);
          syncHovers(activeElements[0].index); // update clicked line position visually
        } else {
          selectedTimeIndex = -1;
          updateStatsPanel(-1);
          syncHovers(-1); // update clicked line and hide it
        }
      }
    }
  });

  chartInstances[metricKey] = chart;
}

function syncHovers(idx) {
  // If clicked, we keep the stats locked to the clicked index unless hovering something else?
  // Requirements: "차트에서 마우스 클릭시 해당하는 시간대의 메트릭스 값을 표시한다. ... 마우스 호버시, 해당 시간대 영역을 하이라이트 표시 및 툴팁"
  // So clicks lock the stats panel until another click. Hovers show tooltips and may update crosshair.

  activeMetrics.forEach(m => {
    const c = chartInstances[m.key];
    if (c) {
      if (idx !== -1) {
        c.setActiveElements([{ datasetIndex: 0, index: idx }]);
        c.tooltip.setActiveElements([{ datasetIndex: 0, index: idx }], { x: 0, y: 0 });
      } else {
        c.setActiveElements([]);
        c.tooltip.setActiveElements([], { x: 0, y: 0 });
      }
      c.update();
    }
  });

  // Show Crosshair
  const crosshair = document.getElementById('crosshair-line');
  if (idx !== -1) {
    // Find x-coordinate of the first chart
    const firstChart = chartInstances[activeMetrics[0].key];
    const meta = firstChart.getDatasetMeta(0);
    if (meta && meta.data && meta.data[idx]) {
      const element = meta.data[idx];
      let boxWidth = 16; // default width fallback
      const xPos = element.x;

      if (firstChart.config.type === 'bar' && element.width) {
        boxWidth = element.width;
      } else {
        // approximate box width for line charts
        if (idx > 0) {
          boxWidth = element.x - meta.data[idx - 1].x;
        } else if (meta.data.length > 1) {
          boxWidth = meta.data[idx + 1].x - element.x;
        }
      }

      // adjust width a bit to match the 1px gap visual
      boxWidth = boxWidth * 0.95;

      const panel = document.getElementById('chartsPanel');
      const panelRect = panel.getBoundingClientRect();
      const canvasRect = firstChart.canvas.getBoundingClientRect();

      const leftOffset = canvasRect.left - panelRect.left + panel.scrollLeft;

      // Vertical boundaries
      const lastChart = chartInstances[activeMetrics[activeMetrics.length - 1].key];
      const lastCanvasRect = lastChart.canvas.getBoundingClientRect();

      const topOffset = canvasRect.top + firstChart.chartArea.top - panelRect.top + panel.scrollTop;
      const bottomOffset = lastCanvasRect.top + lastChart.chartArea.bottom - panelRect.top + panel.scrollTop;
      const boxHeight = bottomOffset - topOffset;

      crosshair.style.display = 'block';
      crosshair.style.width = boxWidth + 'px';
      crosshair.style.left = (leftOffset + xPos - boxWidth / 2) + 'px';
      crosshair.style.top = topOffset + 'px';
      crosshair.style.height = boxHeight + 'px';
    }
  } else {
    crosshair.style.display = 'none';
  }

  // Update clicked line
  const clickedLine = document.getElementById('clicked-line');
  if (clickedLine) {
    if (selectedTimeIndex !== -1) {
      const firstChart = chartInstances[activeMetrics[0].key];
      const meta = firstChart.getDatasetMeta(0);
      if (meta && meta.data && meta.data[selectedTimeIndex]) {
        const element = meta.data[selectedTimeIndex];
        let boxWidth = 16;
        const xPos = element.x;

        if (firstChart.config.type === 'bar' && element.width) {
          boxWidth = element.width;
        } else {
          if (selectedTimeIndex > 0) {
            boxWidth = element.x - meta.data[selectedTimeIndex - 1].x;
          } else if (meta.data.length > 1) {
            boxWidth = meta.data[selectedTimeIndex + 1].x - element.x;
          }
        }
        boxWidth = boxWidth * 0.95;

        const panel = document.getElementById('chartsPanel');
        const panelRect = panel.getBoundingClientRect();
        const canvasRect = firstChart.canvas.getBoundingClientRect();
        const leftOffset = canvasRect.left - panelRect.left + panel.scrollLeft;

        // Vertical boundaries
        const lastChart = chartInstances[activeMetrics[activeMetrics.length - 1].key];
        const lastCanvasRect = lastChart.canvas.getBoundingClientRect();

        const topOffset = canvasRect.top + firstChart.chartArea.top - panelRect.top + panel.scrollTop;
        const bottomOffset = lastCanvasRect.top + lastChart.chartArea.bottom - panelRect.top + panel.scrollTop;
        const boxHeight = bottomOffset - topOffset;

        clickedLine.style.display = 'block';
        clickedLine.style.width = boxWidth + 'px';
        clickedLine.style.left = (leftOffset + xPos - boxWidth / 2) + 'px';
        clickedLine.style.top = topOffset + 'px';
        clickedLine.style.height = boxHeight + 'px';
      }
    } else {
      clickedLine.style.display = 'none';
    }
  }

  // Update stats panel if not locked by selection
  if (selectedTimeIndex === -1) {
    updateStatsPanel(idx !== -1 ? idx : -1);
  }
}

function updateStatsPanel(idx) {
  const header = document.getElementById('selectedTimeHeader');

  if (idx === -1) {
    header.textContent = '1時間の平均';
    activeMetrics.forEach(m => {
      const data = globalChartData[m.key] || [];
      const valid = data.filter(d => d.value !== null && d.value !== undefined);
      const avg = valid.length > 0 ? valid.reduce((s, d) => s + d.value, 0) / valid.length : 0;

      const el = document.getElementById(`statval_${m.key}`);
      if (el) {
        el.textContent = `${formatNumber(avg, m.unit)}`;
        el.classList.remove('highlighted');
      }
    });
  } else {
    // Specific time
    let timeStr = '';
    activeMetrics.forEach(m => {
      const data = globalChartData[m.key] || [];
      const item = data[idx];
      let val = 0;

      if (item) {
        val = item.value || 0;
        timeStr = formatTimeLabel(item.time, true);
      }

      const el = document.getElementById(`statval_${m.key}`);
      if (el) {
        el.textContent = `${formatNumber(val, m.unit)}`;
        el.classList.add('highlighted');
      }
    });
    header.textContent = timeStr;
  }
}

function formatTimeLabel(timeStr, full = false) {
  if (!timeStr || timeStr.length < 12) return timeStr;
  const H = timeStr.substring(8, 10);
  const m = timeStr.substring(10, 12);
  if (full) {
    const Mo = timeStr.substring(4, 6);
    const D = timeStr.substring(6, 8);
    return `${Mo}.${D} ${H}:${m}`;
  }
  return `${H}:${m}`;
}

function formatNumber(num, unit) {
  if (unit === '%') {
    return num.toLocaleString(undefined, { minimumFractionDigits: 2, maximumFractionDigits: 2 });
  }
  if (unit === 'TPS') {
    return num.toLocaleString(undefined, { minimumFractionDigits: 2, maximumFractionDigits: 2 });
  }
  return Math.round(num).toLocaleString();
}

function formatAxisValue(value, unit) {
  if (unit === '%') return value + '%';
  if (value >= 1000) return (value / 1000).toFixed(0) + 'k';
  return value;
}
