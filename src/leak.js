import Chart from 'chart.js/auto';
import { t, getLang } from './i18n.js';

// 설정 정보 로드
const PTA_CFG = window.PTA_CONFIG || {};
const DOMAIN_API_BASE = (PTA_CFG.API_DOMAIN || '') + '/api/domain';
const INSTANCE_API_BASE = (PTA_CFG.API_DOMAIN || '') + '/api/instance';
const API_BASE = (PTA_CFG.API_DOMAIN || '') + '/api/dbmetrics';
const TOKEN = PTA_CFG.TOKEN || '';

// 전역 변수
let heapChartInstance = null;
let domainTree = [];
let currentSelectedPath = [];
let periodDays = 90; // Default 90 days
let selectedInstanceId = '';

// DOM 요소
const instanceSelect = document.getElementById('instanceSelect');
const periodSelect = document.getElementById('periodSelect');
const loadingOverlay = document.getElementById('loadingOverlay');
const simulatedWarningBanner = document.getElementById('simulatedWarningBanner');

// KPI 요약 카드 DOM
const uptimeValue = document.getElementById('uptimeValue');
const slopeValue = document.getElementById('slopeValue');
const daysToOomValue = document.getElementById('daysToOomValue');
const restartStatusValue = document.getElementById('restartStatusValue');
const recommendationList = document.getElementById('recommendationList');

// Chart.js 스타일 설정
Chart.defaults.font.family = '"Pretendard JP Variable", "Pretendard JP", sans-serif';
Chart.defaults.color = "#64748b";

// 초기화
document.addEventListener('DOMContentLoaded', async () => {
  if (!TOKEN || !PTA_CFG.BASE_URL) {
    alert('설정 정보(Token)가 부족합니다.');
    return;
  }

  // 1. 도메인 트리 로드
  await loadDomainTree();

  // 2. 필터 연동
  instanceSelect.addEventListener('change', (e) => {
    selectedInstanceId = e.target.value;
    loadData();
  });

  periodSelect.addEventListener('change', (e) => {
    periodDays = parseInt(e.target.value);
    loadData();
  });
});

function formatDateParam(date, isEnd = false) {
  const y = date.getFullYear();
  const m = String(date.getMonth() + 1).padStart(2, '0');
  const d = String(date.getDate()).padStart(2, '0');
  const h = isEnd ? '24' : '00';
  return `${y}${m}${d}${h}`;
}

async function fetchMetricData(domainId, targetId, targetType, startTime, endTime, intervalMinute, metrics) {
  if (!domainId) return [];

  let endpoint;
  if (!targetId) {
    endpoint = `${API_BASE}/domain`;
  } else {
    endpoint = targetType === 'instance' ? `${API_BASE}/instance` : `${API_BASE}/business`;
  }

  const url = new URL(endpoint, window.location.origin);
  url.searchParams.append('token', TOKEN);
  url.searchParams.append('domain_id', domainId);

  if (targetId) {
    if (targetType === 'instance') {
      url.searchParams.append('instance_id', targetId);
    } else {
      url.searchParams.append('business_id', targetId);
    }
  }
  url.searchParams.append('time_pattern', 'yyyyMMddHH');
  url.searchParams.append('start_time', startTime);
  url.searchParams.append('end_time', endTime);
  url.searchParams.append('interval_minute', intervalMinute);
  url.searchParams.append('metrics', metrics);

  const response = await fetch(url.toString(), {
    method: 'GET',
    headers: { 'Accept': 'application/json' }
  });

  if (!response.ok) throw new Error(`HTTP Error: ${response.status}`);
  const data = await response.json();
  return data.result || [];
}

// 도메인 트리 조회 및 초기 선택
async function loadDomainTree() {
  const url = `${DOMAIN_API_BASE}?token=${TOKEN}`;
  try {
    const response = await fetch(url);
    if (!response.ok) throw new Error('Domain API load failed');
    const data = await response.json();
    domainTree = data.result || [];

    // 최초 도메인 강제 선택
    const firstDomain = findFirstDomain(domainTree);
    if (firstDomain) {
      updateSelectedPath(firstDomain.path);
    }
  } catch (error) {
    console.warn('도메인 API 호출 실패. Mock 트리를 설정합니다.');
    domainTree = [
      {
        id: 'group_1', name: 'Jennifer Production Group', type: 'group',
        children: [
          { id: '1001', name: 'Commerce Main WAS', type: 'domain' },
          { id: '1002', name: 'Order Processing WAS', type: 'domain' }
        ]
      }
    ];
    const firstDomain = findFirstDomain(domainTree);
    if (firstDomain) {
      updateSelectedPath(firstDomain.path);
    }
  }
}

function findFirstDomain(nodes, path = []) {
  for (let node of nodes) {
    const currentPath = [...path, { id: node.id, name: node.name, type: node.type }];
    if (node.type === 'domain') {
      return { domainId: node.id, path: currentPath };
    }
    if (node.type === 'group' && node.children) {
      const found = findFirstDomain(node.children, currentPath);
      if (found) return found;
    }
  }
  return null;
}

function updateSelectedPath(path) {
  currentSelectedPath = path;
  renderHierarchicalSelector();
  const lastItem = path[path.length - 1];
  if (lastItem && lastItem.type === 'domain') {
    loadInstances(lastItem.id);
  }
}

async function loadInstances(domainId) {
  const url = `${INSTANCE_API_BASE}?token=${TOKEN}&domain_id=${domainId}`;
  try {
    const response = await fetch(url);
    if (!response.ok) throw new Error('Instance API load failed');
    const data = await response.json();
    const instances = data.result || [];
    instances.sort((a, b) => a.instanceId - b.instanceId);

    instanceSelect.innerHTML = '';
    instances.forEach(ins => {
      const opt = document.createElement('option');
      opt.value = ins.instanceId;
      opt.textContent = ins.name;
      instanceSelect.appendChild(opt);
    });
  } catch (error) {
    // Mock Instances
    const mockInstances = [
      { instanceId: '1', name: `Instance-${domainId}-1 (AP Server)` },
      { instanceId: '2', name: `Instance-${domainId}-2 (Batch Server)` }
    ];
    instanceSelect.innerHTML = '';
    mockInstances.forEach(ins => {
      const opt = document.createElement('option');
      opt.value = ins.instanceId;
      opt.textContent = ins.name;
      instanceSelect.appendChild(opt);
    });
  }

  selectedInstanceId = instanceSelect.value;
  loadData();
}

// 팝오버 생성 및 경로 렌더링
function renderHierarchicalSelector() {
  const container = document.getElementById('breadcrumbContainer');
  if (!container) return;
  container.innerHTML = '';

  currentSelectedPath.forEach((item, index) => {
    if (index > 0) {
      const sep = document.createElement('div');
      sep.className = 'breadcrumb-separator';
      sep.textContent = '>';
      container.appendChild(sep);
    }

    const breadcrumb = document.createElement('div');
    breadcrumb.className = 'breadcrumb-item';

    const icon = document.createElement('span');
    icon.innerHTML = `<svg xmlns="http://www.w3.org/2000/svg" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round"><polygon points="12 2 2 7 12 12 22 7 12 2"></polygon><polyline points="2 17 12 22 22 17"></polyline><polyline points="2 12 12 17 22 12"></polyline></svg>`;

    const text = document.createElement('span');
    text.textContent = item.name;

    breadcrumb.appendChild(icon);
    breadcrumb.appendChild(text);

    if (item.type === 'group' || index === currentSelectedPath.length - 1) {
      const arrow = document.createElement('span');
      arrow.style.marginLeft = '4px';
      arrow.style.fontSize = '0.7rem';
      arrow.textContent = '▼';
      breadcrumb.appendChild(arrow);
    }

    breadcrumb.addEventListener('click', (e) => {
      e.stopPropagation();
      
      const oldPopover = document.getElementById('hierarchicalSelectorPopup');
      if (oldPopover) {
        const wasOpenForThis = oldPopover.dataset.breadcrumbIndex === String(index);
        oldPopover.remove();
        if (wasOpenForThis) return;
      }

      let levelItems = domainTree;
      const basePath = currentSelectedPath.slice(0, index);
      for (let i = 0; i < index; i++) {
        const found = levelItems.find(n => n.name === currentSelectedPath[i].name);
        if (found) levelItems = found.children;
      }

      const popover = createPopover(levelItems, (selectedPath) => {
        const finalPath = [...basePath, ...selectedPath];
        const lastSelected = finalPath[finalPath.length - 1];

        if (lastSelected.type === 'domain') {
          updateSelectedPath(finalPath);
        } else {
          let targetNode = domainTree;
          for (let i = 0; i < finalPath.length; i++) {
            const found = targetNode.find(n => n.name === finalPath[i].name);
            if (found) targetNode = (found.type === 'group') ? found.children : [found];
          }
          const firstInGroup = findFirstDomain(targetNode, finalPath);
          if (firstInGroup) {
            updateSelectedPath(firstInGroup.path);
          }
        }
      }, 0);

      popover.id = 'hierarchicalSelectorPopup';
      popover.dataset.breadcrumbIndex = String(index);
      popover.style.position = 'absolute';
      
      const rect = breadcrumb.getBoundingClientRect();
      popover.style.top = `${rect.bottom + window.scrollY + 6}px`;
      popover.style.left = `${rect.left + window.scrollX}px`;

      document.body.appendChild(popover);
      setTimeout(() => popover.classList.add('active'), 0);
    });

    container.appendChild(breadcrumb);
  });
}

function createPopover(items, onSelect, level = 0, currentLevelPath = []) {
  const popover = document.createElement('div');
  popover.className = 'selector-popover';
  if (level > 0) popover.classList.add('submenu');

  items.forEach(item => {
    const el = document.createElement('div');
    el.className = 'popover-item';
    if (item.children && item.children.length > 0) el.classList.add('has-children');

    const itemPath = [...currentLevelPath, { id: item.id, name: item.name, type: item.type }];

    el.innerHTML = `
      <div class="popover-item-content">
        <span class="popover-item-icon">
          <svg xmlns="http://www.w3.org/2000/svg" width="14" height="14" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round"><polygon points="12 2 2 7 12 12 22 7 12 2"></polygon><polyline points="2 17 12 22 22 17"></polyline><polyline points="2 12 12 17 22 12"></polyline></svg>
        </span>
        <span>${item.name}</span>
      </div>
    `;

    el.addEventListener('click', (e) => {
      e.stopPropagation();
      onSelect(itemPath);
      const rootPopover = document.getElementById('hierarchicalSelectorPopup');
      if (rootPopover) rootPopover.remove();
    });

    if (item.type === 'group' && item.children && item.children.length > 0) {
      let submenu = null;
      const showSubmenu = () => {
        if (!submenu) {
          submenu = createPopover(item.children, onSelect, level + 1, itemPath);
          el.appendChild(submenu);
        }
        submenu.classList.add('active');
        submenu.style.position = 'absolute';
        submenu.style.left = '100.2%';
        submenu.style.top = '-6px';
      };
      const hideSubmenu = () => { if (submenu) submenu.classList.remove('active'); };
      el.addEventListener('mouseenter', showSubmenu);
      el.addEventListener('mouseleave', hideSubmenu);
    }
    popover.appendChild(el);
  });

  if (level === 0) {
    const closeHandler = (e) => {
      if (!popover.contains(e.target) && !e.target.closest('.breadcrumb-item')) {
        popover.classList.remove('active');
        setTimeout(() => {
          if (popover.parentNode) popover.remove();
        }, 200);
        document.removeEventListener('click', closeHandler);
      }
    };
    document.addEventListener('click', closeHandler);
  }
  return popover;
}

// 데이터 로드 및 분석 실행
async function loadData() {
  if (loadingOverlay) loadingOverlay.classList.remove('hidden');

  const domainId = currentSelectedPath[currentSelectedPath.length - 1]?.id;
  const instanceId = selectedInstanceId;

  // 기본 세팅
  const totalPoints = periodDays;
  const dates = [];
  const now = new Date();
  for (let i = totalPoints - 1; i >= 0; i--) {
    const d = new Date();
    d.setDate(now.getDate() - i);
    dates.push(d.toLocaleDateString(getLang() === 'ko' ? 'ko-KR' : 'ja-JP', { month: 'short', day: 'numeric' }));
  }

  let realDataFetched = false;
  let rawHeapFootprints = [];
  let maxHeap = 4096;
  let unit = 'MB';
  let uptimeDays = 12;

  // 1. OpenAPI 연동 시도
  if (domainId && instanceId) {
    const today = new Date();
    const prior = new Date();
    prior.setDate(today.getDate() - periodDays);

    const startTimeStr = formatDateParam(prior, false);
    const endTimeStr = formatDateParam(today, true);

    try {
      const data = await fetchMetricData(domainId, instanceId, 'instance', startTimeStr, endTimeStr, 60, 'heap_usage');
      
      if (data && data.length > 5) {
        // 일별 그룹핑하여 GC 직후 최저점(Minimum) 추출
        const dayGroups = {};
        data.forEach(item => {
          const dayStr = item.time.substring(0, 8); // yyyyMMdd
          if (!dayGroups[dayStr]) dayGroups[dayStr] = [];
          dayGroups[dayStr].push(item.value);
        });

        const sortedDays = Object.keys(dayGroups).sort();
        const dailyMins = sortedDays.map(day => Math.min(...dayGroups[day]));

        if (dailyMins.length > 5) {
          rawHeapFootprints = dailyMins;
          
          // 실 데이터 날짜 축으로 교체
          dates.length = 0;
          sortedDays.forEach(dayStr => {
            const y = parseInt(dayStr.substring(0, 4));
            const m = parseInt(dayStr.substring(4, 6)) - 1;
            const d = parseInt(dayStr.substring(6, 8));
            const dateObj = new Date(y, m, d);
            dates.push(dateObj.toLocaleDateString(getLang() === 'ko' ? 'ko-KR' : 'ja-JP', { month: 'short', day: 'numeric' }));
          });

          // 단위 판독 (% vs MB)
          const maxVal = Math.max(...rawHeapFootprints);
          if (maxVal <= 100) {
            unit = '%';
            maxHeap = 100;
          } else {
            unit = 'MB';
            maxHeap = Math.pow(2, Math.ceil(Math.log2(maxVal))) || 4096;
          }

          uptimeDays = dailyMins.length;
          realDataFetched = true;
          console.log(`[Leak Auditor] Loaded ${dailyMins.length} days of real heap telemetry. Unit: ${unit}`);
        }
      }
    } catch (err) {
      console.warn('[Leak Auditor] Failed to load real heap metrics. Falling back to simulator.', err);
    }
  }

  // 2. 가상 시뮬레이션 폴백
  if (!realDataFetched) {
    let leakRate = 0.8;
    let initBaseline = 980;
    uptimeDays = 12;
    
    if (selectedInstanceId && selectedInstanceId.endsWith('1')) {
      leakRate = 4.8;
      initBaseline = 1120;
      uptimeDays = 82;
    } else if (selectedInstanceId && selectedInstanceId.endsWith('2')) {
      leakRate = 22.5;
      initBaseline = 850;
      uptimeDays = 142;
    }

    unit = 'MB';
    maxHeap = 4096;
    rawHeapFootprints = [];

    for (let i = 0; i < totalPoints; i++) {
      const progressDays = uptimeDays - (totalPoints - 1) + i;
      let postGcMin = initBaseline + (progressDays * leakRate);
      postGcMin += (Math.sin(i / 3) * 15) + (Math.cos(i / 1.5) * 5);
      postGcMin = Math.min(maxHeap - 50, postGcMin);
      rawHeapFootprints.push(Math.round(postGcMin));
    }
  }

  if (simulatedWarningBanner) {
    if (realDataFetched) {
      simulatedWarningBanner.classList.add('hidden');
    } else {
      simulatedWarningBanner.classList.remove('hidden');
    }
  }

  // 3. 선형 회귀 분석
  const n = rawHeapFootprints.length;
  const xValues = Array.from({ length: n }, (_, i) => i);
  const yValues = rawHeapFootprints;
  
  let sumX = 0, sumY = 0, sumXY = 0, sumXX = 0;
  for (let i = 0; i < n; i++) {
    sumX += xValues[i];
    sumY += yValues[i];
    sumXY += xValues[i] * yValues[i];
    sumXX += xValues[i] * xValues[i];
  }
  const slope = (n * sumXY - sumX * sumY) / (n * sumXX - sumX * sumX);
  const intercept = (sumY - slope * sumX) / n;

  const trendHeapLine = [];
  for (let i = 0; i < n; i++) {
    trendHeapLine.push(Math.round(slope * i + intercept));
  }

  const currentBaseline = rawHeapFootprints[rawHeapFootprints.length - 1];
  const remainingMemory = maxHeap - currentBaseline;
  let daysToOom = Math.round(remainingMemory / slope);
  
  if (slope <= 0.05) {
    daysToOom = Infinity;
  }

  // 4. 상태 및 추천 목록 갱신
  let statusText = t('leak.statusHealthy');
  let statusClass = 'healthy';
  if (daysToOom < 30) {
    statusText = t('leak.statusDanger');
    statusClass = 'danger';
  } else if (daysToOom < 100) {
    statusText = t('leak.statusWarning');
    statusClass = 'warning';
  }

  uptimeValue.textContent = `${uptimeDays} Days`;
  slopeValue.textContent = `${slope.toFixed(2)} ${unit}/Day`;
  daysToOomValue.textContent = isFinite(daysToOom) ? `${daysToOom} Days` : '∞ (Stable)';
  
  restartStatusValue.innerHTML = `<span class="status-badge ${statusClass}">${statusText}</span>`;

  updateRecommendations(statusClass, daysToOom, slope, maxHeap, currentBaseline, unit);
  renderChart(dates, rawHeapFootprints, trendHeapLine, maxHeap, unit);

  if (loadingOverlay) loadingOverlay.classList.add('hidden');
}

function updateRecommendations(statusClass, daysToOom, slope, maxHeap, currentBaseline, unit) {
  recommendationList.innerHTML = '';
  
  const recommendations = [];
  const currentLang = getLang();

  if (statusClass === 'danger') {
    if (currentLang === 'ko') {
      recommendations.push(`<strong>CRITICAL</strong>: 힙 사용량이 최대 임계치(${maxHeap}${unit})의 ${((currentBaseline/maxHeap)*100).toFixed(0)}%에 도달했습니다. 예상 OOM 시점이 ${daysToOom}일 이내로 임박했습니다.`);
      recommendations.push(`<strong>즉시 조치</strong>: 이번 주말 야간 점검 시 해당 인스턴스의 Graceful Restart(정기 재기동)를 수행하십시오.`);
      recommendations.push(`<strong>상세 진단 필요</strong>: GC 로그 파일 분석을 수행하여 Memory Leak(예: 누적된 Map 객체, 제거되지 않은 스레드 로컬) 코드가 배포되었는지 확인하십시오.`);
    } else if (currentLang === 'ja') {
      recommendations.push(`<strong>CRITICAL</strong>: ヒープ使用量が最大制限値(${maxHeap}${unit})の ${((currentBaseline/maxHeap)*100).toFixed(0)}%に達しています。予測OOMまで残り ${daysToOom}日です。`);
      recommendations.push(`<strong>即時推奨</strong>: 今週末の夜間メンテナンス時に当該インスタンスのGraceful Restartを実行してください。`);
      recommendations.push(`<strong>詳細分析</strong>: メモリリーク（解放されていないMap、ThreadLocal等）コードの混入がないか、ヒープダンプおよびGCログを確認してください。`);
    } else {
      recommendations.push(`<strong>CRITICAL</strong>: Heap footprint reached ${((currentBaseline/maxHeap)*100).toFixed(0)}% of Max Limit(${maxHeap}${unit}). Forecasted OOM within ${daysToOom} days.`);
      recommendations.push(`<strong>Immediate Action</strong>: Schedule a Graceful Restart of this instance during the upcoming weekend maintenance window.`);
      recommendations.push(`<strong>Root Cause Audit</strong>: Trigger heap dumps and analyze GC log files for memory leaks (e.g., unremoved ThreadLocals, static caches).`);
    }
  } else if (statusClass === 'warning') {
    if (currentLang === 'ko') {
      recommendations.push(`<strong>WARNING</strong>: 미세한 메모리 누수(${slope.toFixed(2)} ${unit}/Day)가 관측됩니다. OOM 예상 한계점까지 약 ${daysToOom}일의 여유가 있습니다.`);
      recommendations.push(`<strong>예방 수칙</strong>: 30일 이내에 시스템 정기 배포가 없다면, 정기 재기동 정책(예: 60일 주기 자동 재기동)을 스케줄링하십시오.`);
      recommendations.push(`<strong>모니터링 강화</strong>: 임계 영역 힙 증가 추세를 매주 확인하십시오.`);
    } else if (currentLang === 'ja') {
      recommendations.push(`<strong>WARNING</strong>: 微小なメモリリーク(${slope.toFixed(2)} ${unit}/Day)が観測されています。OOM予測限界点まであと約 ${daysToOom}日です。`);
      recommendations.push(`<strong>予防保守</strong>: 今後30日以内にシステムデプロイ予定がない場合は、定期再起動スケジュール（例：60日周期自動再起動）を設定してください。`);
      recommendations.push(`<strong>監視強化</strong>: ヒープの毎週の増加傾向をトラッキングしてください。`);
    } else {
      recommendations.push(`<strong>WARNING</strong>: Micro memory leak detected (${slope.toFixed(2)} ${unit}/Day). Residual time before OOM is approximately ${daysToOom} days.`);
      recommendations.push(`<strong>Prevention Rule</strong>: If no release deployment is scheduled within 30 days, set up a rolling restart schedule (e.g., 60-day auto-restart).`);
      recommendations.push(`<strong>Enhanced Monitor</strong>: Watch weekly heap trends in the monitoring dashboard.`);
    }
  } else {
    if (currentLang === 'ko') {
      recommendations.push(`<strong>HEALTHY</strong>: 메모리 누수 경향이 관측되지 않거나 지극히 정상 범위(${slope.toFixed(2)} ${unit}/Day) 내에 있습니다.`);
      recommendations.push(`현재 시스템은 매우 안정적이며, 100일 이상 무정지 기동 시에도 OOM 위험성이 없습니다. 추가적인 예방적 재기동 조치는 불필요합니다.`);
    } else if (currentLang === 'ja') {
      recommendations.push(`<strong>HEALTHY</strong>: メモリリーク傾向は検出されないか、正常な範囲内(${slope.toFixed(2)} ${unit}/Day)です。`);
      recommendations.push(`システムは非常に安定しており、100日以上の連続運転においてもOOMの危険性はありません。追加の予防再起動は不要です。`);
    } else {
      recommendations.push(`<strong>HEALTHY</strong>: No memory leak trend detected. Slope is within normal bounds (${slope.toFixed(2)} ${unit}/Day).`);
      recommendations.push(`The system is highly stabilized. Uptime of 100+ days presents no memory contention. Proactive restart is not required.`);
    }
  }

  recommendations.forEach(text => {
    const li = document.createElement('li');
    li.innerHTML = text;
    recommendationList.appendChild(li);
  });
}

function renderChart(dates, rawData, trendData, maxHeap, unit) {
  const ctx = document.getElementById('heapLeakChart').getContext('2d');
  
  if (heapChartInstance) {
    heapChartInstance.destroy();
  }

  heapChartInstance = new Chart(ctx, {
    type: 'line',
    data: {
      labels: dates,
      datasets: [
        {
          label: t('metric.heap_usage') + ' (Post-GC Min)',
          data: rawData,
          borderColor: '#1e3a8a',
          backgroundColor: 'rgba(30, 58, 138, 0.05)',
          borderWidth: 2,
          pointRadius: 3,
          pointHoverRadius: 5,
          tension: 0.1,
          fill: true
        },
        {
          label: 'Leak Trend Line (Linear Regression)',
          data: trendData,
          borderColor: '#ef4444',
          borderWidth: 1.5,
          borderDash: [5, 5],
          pointRadius: 0,
          fill: false
        }
      ]
    },
    options: {
      responsive: true,
      maintainAspectRatio: false,
      interaction: {
        mode: 'index',
        intersect: false
      },
      plugins: {
        legend: {
          position: 'top',
          labels: {
            boxWidth: 12,
            font: { size: 11 }
          }
        },
        tooltip: {
          callbacks: {
            label: (context) => {
              return ` ${context.dataset.label}: ${context.raw} ${unit}`;
            }
          }
        }
      },
      scales: {
        x: {
          grid: { display: false }
        },
        y: {
          title: {
            display: true,
            text: `Memory (${unit})`,
            font: { weight: 'bold' }
          },
          min: 0,
          max: maxHeap + (unit === '%' ? 10 : 200),
          grid: {
            color: '#e2e8f0'
          }
        }
      }
    }
  });
}
