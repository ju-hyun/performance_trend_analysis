import Chart from 'chart.js/auto';
import { t, getLang } from './i18n.js';

// 설정 정보 로드
const PTA_CFG = window.PTA_CONFIG || {};
const DOMAIN_API_BASE = (PTA_CFG.API_DOMAIN || '') + '/api/domain';
const API_BASE = (PTA_CFG.API_DOMAIN || '') + '/api/dbmetrics';
const TOKEN = PTA_CFG.TOKEN || '';

// 전역 변수
let driftChartInstance = null;
let domainTree = [];
let currentSelectedPath = [];
let periodADate = new Date();
let periodBDate = new Date();

// DOM 요소
const baselinePicker = document.getElementById('baselinePicker');
const comparePicker = document.getElementById('comparePicker');
const loadingOverlay = document.getElementById('loadingOverlay');
const simulatedWarningBanner = document.getElementById('simulatedWarningBanner');

// KPI 요약 카드 DOM
const avgDriftValue = document.getElementById('avgDriftValue');
const p95DriftValue = document.getElementById('p95DriftValue');
const shiftAmountValue = document.getElementById('shiftAmountValue');
const driftStatusValue = document.getElementById('driftStatusValue');
const driftCauseList = document.getElementById('driftCauseList');

// Chart.js 스타일 설정
Chart.defaults.font.family = '"Pretendard JP Variable", "Pretendard JP", sans-serif';
Chart.defaults.color = "#64748b";

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

function estimateLogNormalParams(data) {
  if (!data || data.length === 0) {
    return null;
  }

  const values = data.map(item => item.value).filter(val => val > 0);
  if (values.length === 0) {
    return null;
  }

  const logs = values.map(val => Math.log(val));
  const mu = logs.reduce((sum, val) => sum + val, 0) / logs.length;
  
  let variance = 0.2;
  if (logs.length > 1) {
    variance = logs.reduce((sum, val) => sum + Math.pow(val - mu, 2), 0) / (logs.length - 1);
  }
  if (isNaN(variance) || variance <= 0) {
    variance = 0.2;
  }
  let sigma = Math.sqrt(variance);
  
  if (sigma < 0.15) sigma = 0.15;
  if (sigma > 0.8) sigma = 0.8;

  return { mu, sigma };
}

// 초기화
document.addEventListener('DOMContentLoaded', async () => {
  // 1. 기본 날짜 설정 (Period A: 30일 전, Period B: 오늘)
  const today = new Date();
  const prior = new Date();
  prior.setDate(today.getDate() - 30);
  
  periodADate = prior;
  periodBDate = today;

  // 2. Flatpickr 초기화
  const currentLang = getLang();
  flatpickr(baselinePicker, {
    locale: currentLang === 'ko' ? 'ko' : currentLang === 'en' ? 'default' : 'ja',
    dateFormat: "Y-m-d",
    defaultDate: periodADate,
    onChange: (selectedDates) => {
      if (selectedDates.length > 0) {
        periodADate = selectedDates[0];
        loadData();
      }
    }
  });

  flatpickr(comparePicker, {
    locale: currentLang === 'ko' ? 'ko' : currentLang === 'en' ? 'default' : 'ja',
    dateFormat: "Y-m-d",
    defaultDate: periodBDate,
    onChange: (selectedDates) => {
      if (selectedDates.length > 0) {
        periodBDate = selectedDates[0];
        loadData();
      }
    }
  });

  // 3. 도메인 트리 로드
  await loadDomainTree();
});

// 도메인 트리 구축
function buildDomainTree(flatDomains) {
  const tree = [];
  flatDomains.forEach(domain => {
    let currentLevel = tree;
    const hierarchy = domain.groupHierarchy || [t('domain.uncategorized')];

    hierarchy.forEach((groupName) => {
      let group = currentLevel.find(item => item.name === groupName && item.type === 'group');
      if (!group) {
        group = { name: groupName, type: 'group', children: [] };
        currentLevel.push(group);
      }
      currentLevel = group.children;
    });

    currentLevel.push({
      id: domain.domainId,
      name: domain.name,
      type: 'domain'
    });
  });
  return tree;
}

// 도메인 트리 조회 및 초기 선택
async function loadDomainTree() {
  const url = `${DOMAIN_API_BASE}?token=${TOKEN}`;
  try {
    const response = await fetch(url);
    if (!response.ok) throw new Error('Domain API load failed');
    const data = await response.json();
    const flatDomains = data.result || [];
    domainTree = buildDomainTree(flatDomains);

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

// 안전한 메트릭 데이터 호출 Helper
async function fetchMetricDataSafe(domainId, targetId, targetType, startTime, endTime, intervalMinute, metrics) {
  try {
    return await fetchMetricData(domainId, targetId, targetType, startTime, endTime, intervalMinute, metrics);
  } catch (err) {
    console.warn(`[Drift Analysis] Failed to fetch metric ${metrics}:`, err);
    return [];
  }
}

// 시뮬레이터 및 비교 계산 실행
async function loadData() {
  if (loadingOverlay) loadingOverlay.classList.remove('hidden');

  const domainId = currentSelectedPath[currentSelectedPath.length - 1]?.id;

  let muA, sigmaA, muB, sigmaB;
  let realDataA = [];
  let realDataB = [];
  let realDataFetched = false;

  let cpuValA = 0, cpuValB = 0;
  let heapValA = 0, heapValB = 0;
  let errValA = 0, errValB = 0;

  if (domainId) {
    try {
      const startA = formatDateParam(periodADate, false);
      const endA = formatDateParam(periodADate, true);
      const startB = formatDateParam(periodBDate, false);
      const endB = formatDateParam(periodBDate, true);

      const [
        resTimeA, resTimeB,
        cpuA, cpuB,
        heapA, heapB,
        errA, errB
      ] = await Promise.all([
        fetchMetricDataSafe(domainId, null, 'domain', startA, endA, 60, 'service_time'),
        fetchMetricDataSafe(domainId, null, 'domain', startB, endB, 60, 'service_time'),
        fetchMetricDataSafe(domainId, null, 'domain', startA, endA, 60, 'sys_cpu'),
        fetchMetricDataSafe(domainId, null, 'domain', startB, endB, 60, 'sys_cpu'),
        fetchMetricDataSafe(domainId, null, 'domain', startA, endA, 60, 'heap_usage'),
        fetchMetricDataSafe(domainId, null, 'domain', startB, endB, 60, 'heap_usage'),
        fetchMetricDataSafe(domainId, null, 'domain', startA, endA, 60, 'service_err_count'),
        fetchMetricDataSafe(domainId, null, 'domain', startB, endB, 60, 'service_err_count')
      ]);

      realDataA = resTimeA;
      realDataB = resTimeB;

      const paramsA = estimateLogNormalParams(realDataA);
      const paramsB = estimateLogNormalParams(realDataB);

      if (paramsA && paramsB) {
        realDataFetched = true;
        muA = paramsA.mu;
        sigmaA = paramsA.sigma;
        muB = paramsB.mu;
        sigmaB = paramsB.sigma;
        
        cpuValA = cpuA.length ? (cpuA.reduce((sum, item) => sum + item.value, 0) / cpuA.length) : 0;
        cpuValB = cpuB.length ? (cpuB.reduce((sum, item) => sum + item.value, 0) / cpuB.length) : 0;

        heapValA = heapA.length ? (heapA.reduce((sum, item) => sum + item.value, 0) / heapA.length) : 0;
        heapValB = heapB.length ? (heapB.reduce((sum, item) => sum + item.value, 0) / heapB.length) : 0;

        errValA = errA.length ? (errA.reduce((sum, item) => sum + item.value, 0) / errA.length) : 0;
        errValB = errB.length ? (errB.reduce((sum, item) => sum + item.value, 0) / errB.length) : 0;
      }
    } catch (err) {
      console.warn('[Drift Analysis] Failed to fetch real response times.', err);
    }
  }

  if (!realDataFetched) {
    avgDriftValue.textContent = '-';
    p95DriftValue.textContent = '-';
    shiftAmountValue.textContent = '-';
    driftStatusValue.innerHTML = `<span class="drift-status-badge stable">${t('heatmap.noDataShort')}</span>`;

    let noDataMsg = t('heatmap.noData');
    if (domainId) {
      const hasA = (realDataA && realDataA.map(item => item.value).filter(val => val > 0).length > 0);
      const hasB = (realDataB && realDataB.map(item => item.value).filter(val => val > 0).length > 0);
      
      if (!hasA && !hasB) {
        noDataMsg = getLang() === 'ko' ? '두 기간 모두 데이터가 없습니다.' : getLang() === 'ja' ? '両方の期間にデータがありません。' : 'No data in both periods.';
      } else if (!hasA) {
        noDataMsg = getLang() === 'ko' ? '기준 기간 (Period A)에 데이터가 없습니다.' : getLang() === 'ja' ? '基準期間 (Period A)にデータがありません。' : 'No data in baseline Period A.';
      } else if (!hasB) {
        noDataMsg = getLang() === 'ko' ? '비교 기간 (Period B)에 데이터가 없습니다.' : getLang() === 'ja' ? '比較期間 (Period B)にデータがありません。' : 'No data in comparison Period B.';
      }
    }

    driftCauseList.innerHTML = `<div style="text-align: center; padding: 1.5rem; color: var(--text-secondary); font-size: 0.9rem;">${noDataMsg}</div>`;

    if (driftChartInstance) {
      driftChartInstance.destroy();
      driftChartInstance = null;
    }

    const canvas = document.getElementById('driftChart');
    if (canvas) {
      const ctx = canvas.getContext('2d');
      ctx.clearRect(0, 0, canvas.width, canvas.height);
      ctx.font = '14px sans-serif';
      ctx.fillStyle = '#64748b';
      ctx.textAlign = 'center';
      ctx.textBaseline = 'middle';
      ctx.fillText(noDataMsg, canvas.width / 2, canvas.height / 2);
    }

    if (simulatedWarningBanner) {
      simulatedWarningBanner.classList.add('hidden');
    }

    if (loadingOverlay) loadingOverlay.classList.add('hidden');
    return;
  }

  const driftMs = Math.round(Math.exp(muB) - Math.exp(muA));

  // 백분위 지표 계산
  const avgA = Math.round(Math.exp(muA + (sigmaA * sigmaA) / 2));
  const avgB = Math.round(Math.exp(muB + (sigmaB * sigmaB) / 2));
  const avgDiffVal = avgB - avgA;
  const avgPercent = ((avgDiffVal / avgA) * 100).toFixed(1);

  // P95 = exp(mu + 1.645 * sigma)
  const p95A = Math.round(Math.exp(muA + 1.645 * sigmaA));
  const p95B = Math.round(Math.exp(muB + 1.645 * sigmaB));
  const p95DiffVal = p95B - p95A;
  const p95Percent = ((p95DiffVal / p95A) * 100).toFixed(1);

  // Dynamic X range based on values
  const xMax = Math.min(10000, Math.max(1000, Math.round(Math.max(p95A, p95B) * 1.5)));
  const xRange = [];
  const step = Math.max(5, Math.ceil(xMax / 100));
  for (let x = step; x <= xMax; x += step) {
    xRange.push(x);
  }

  const scaleFactor = Math.exp(muA) * 5;
  const distA = xRange.map(x => logNormalPdf(x, muA, sigmaA) * scaleFactor); // Scale up for chart visibility
  const distB = xRange.map(x => logNormalPdf(x, muB, sigmaB) * scaleFactor);

  // 4. UI 텍스트 및 배지 업데이트
  avgDriftValue.textContent = `${avgDiffVal >= 0 ? '+' : ''}${avgDiffVal} ms (${avgDiffVal >= 0 ? '+' : ''}${avgPercent}%)`;
  p95DriftValue.textContent = `${p95DiffVal >= 0 ? '+' : ''}${p95DiffVal} ms (${p95DiffVal >= 0 ? '+' : ''}${p95Percent}%)`;
  shiftAmountValue.textContent = driftMs >= 0 ? `Shift Right (+${driftMs}ms)` : `Shift Left (${driftMs})`;

  let statusText = t('leak.statusHealthy');
  let statusClass = 'stable';
  if (avgDiffVal > 40) {
    statusText = t('leak.statusDanger');
    statusClass = 'danger';
  } else if (avgDiffVal > 15) {
    statusText = t('leak.statusWarning');
    statusClass = 'warning';
  }
  
  // 다국어 상태값 매칭
  if (statusClass === 'stable') statusText = getLang() === 'ko' ? '안정 (Stable)' : getLang() === 'ja' ? '安定 (Stable)' : 'Stable';
  else if (statusClass === 'warning') statusText = getLang() === 'ko' ? '경고 (Drift)' : getLang() === 'ja' ? '警告 (Drift)' : 'Warning (Drift)';
  else statusText = getLang() === 'ko' ? '위험 (Regression)' : getLang() === 'ja' ? '危険 (Regression)' : 'Critical (Regression)';

  driftStatusValue.innerHTML = `<span class="drift-status-badge ${statusClass}">${statusText}</span>`;

  // 원인 분석 트리 갱신
  renderDriftCauses(avgDiffVal, cpuValA, cpuValB, heapValA, heapValB, errValA, errValB);

  // 5. 차트 그리기
  renderDriftChart(xRange, distA, distB);

  if (simulatedWarningBanner) {
    if (realDataFetched) {
      simulatedWarningBanner.classList.add('hidden');
    } else {
      simulatedWarningBanner.classList.remove('hidden');
    }
  }

  if (loadingOverlay) loadingOverlay.classList.add('hidden');
}

// Log-Normal PDF 공식
function logNormalPdf(x, mu, sigma) {
  const coeff = 1 / (x * sigma * Math.sqrt(2 * Math.PI));
  const exponent = -Math.pow(Math.log(x) - mu, 2) / (2 * sigma * sigma);
  return coeff * Math.exp(exponent);
}

function renderDriftCauses(avgDiffVal, cpuA, cpuB, heapA, heapB, errA, errB) {
  driftCauseList.innerHTML = '';

  const currentLang = getLang();
  
  // 드리프트 원인 리포트 아이템 정의
  const causes = [];
  
  if (avgDiffVal <= 15) {
    if (currentLang === 'ko') {
      causes.push({
        icon: '✅',
        title: '정상 오차 범주 내 안정 기동',
        desc: '기준 기간 대비 응답 속도 분포의 왜곡 현상이 관찰되지 않습니다. 시스템 리소스가 매우 조화롭고 안정된 상태를 유지하고 있습니다.'
      });
    } else if (currentLang === 'ja') {
      causes.push({
        icon: '✅',
        title: '正常誤差範囲内での安定稼働',
        desc: '基準期間と比較して応答時間分布の歪みは検出されません。システム全体が極めて安定した平衡状態を維持しています。'
      });
    } else {
      causes.push({
        icon: '✅',
        title: 'Normal Variance bounds',
        desc: 'No response time distribution distortion observed. The overall system resource footprint remains stable and balanced.'
      });
    }
  } else {
    // 느려진 상태인 경우 (Drift 발생)
    const cpuDiff = cpuB - cpuA;
    const heapDiff = heapB - heapA;
    const errDiff = errB - errA;

    let hasRootCause = false;

    if (cpuDiff > 2) {
      hasRootCause = true;
      if (currentLang === 'ko') {
        causes.push({
          icon: '⚡',
          title: `시스템 CPU 부하 상승에 따른 연산 지연 (Suspected CPU Drift: +${cpuDiff.toFixed(1)}%)`,
          desc: `기준 기간 대비 CPU 사용량이 평균 ${cpuDiff.toFixed(1)}%p 증가했습니다. 애플리케이션 연산 작업 증가, 비효율적인 루프 실행 또는 특정 쓰레드의 경합이 원인일 수 있습니다.`
        });
      } else if (currentLang === 'ja') {
        causes.push({
          icon: '⚡',
          title: `CPU使用率上昇による演算遅延 (CPUドリフトの疑い: +${cpuDiff.toFixed(1)}%)`,
          desc: `基準期間と比較して平均CPU使用率が ${cpuDiff.toFixed(1)}%p 増加しました。アプリケーションの演算処理の増加、非効率なループ、またはスレッド競合が原因である可能性があります。`
        });
      } else {
        causes.push({
          icon: '⚡',
          title: `Compute Latency via CPU Overhead (Suspected CPU Drift: +${cpuDiff.toFixed(1)}%)`,
          desc: `Average system CPU usage increased by ${cpuDiff.toFixed(1)}%p. This suggests computational expansion, inefficient loop execution, or thread contention issues.`
        });
      }
    }

    if (heapDiff > 5) {
      hasRootCause = true;
      if (currentLang === 'ko') {
        causes.push({
          icon: '⚙️',
          title: `JVM 힙 메모리 사용량 증가 및 GC 지연 (Suspected GC/Heap Drift: +${heapDiff.toFixed(1)}%)`,
          desc: `기준 기간 대비 JVM 힙 사용량이 평균 ${heapDiff.toFixed(1)}%p 증가했습니다. 불필요하게 오래 유지되는 객체로 인해 가비지 컬렉션(GC)의 정지 시간(Stop-the-World)이 길어졌을 가능성이 높습니다.`
        });
      } else if (currentLang === 'ja') {
        causes.push({
          icon: '⚙️',
          title: `JVMヒープ使用量増加とGC遅延 (GC/ヒープドリフトの疑い: +${heapDiff.toFixed(1)}%)`,
          desc: `基準期間と比較して平均JVMヒープ使用率が ${heapDiff.toFixed(1)}%p 増加しました。不要に保持されるオブジェクトの増加により、ガベージコレクション(GC)の一時停止時間(Stop-the-World)が長くなった可能性があります。`
        });
      } else {
        causes.push({
          icon: '⚙️',
          title: `JVM Heap Usage Expansion & GC Latency (Suspected GC/Heap Drift: +${heapDiff.toFixed(1)}%)`,
          desc: `Average JVM Heap usage expanded by ${heapDiff.toFixed(1)}%p. A high heap footprint often increases GC Stop-the-World pause times, shifting response distribution to the right.`
        });
      }
    }

    if (errDiff > 1) {
      hasRootCause = true;
      if (currentLang === 'ko') {
        causes.push({
          icon: '🚨',
          title: `트랜잭션 오류 발생량 증가 (Suspected Error Drift: +${errDiff.toFixed(1)}/hr)`,
          desc: `시간당 평균 에러 발생 건수가 ${errDiff.toFixed(1)}건 증가했습니다. 예외 처리(Exception Handling) 오버헤드나 오류 복구 로직 실행으로 인해 응답 지연이 심화될 수 있습니다.`
        });
      } else if (currentLang === 'ja') {
        causes.push({
          icon: '🚨',
          title: `トランザクションエラー発生数の増加 (エラードリフトの疑い: +${errDiff.toFixed(1)}件/時)`,
          desc: `1時間あたりの平均エラー件数が ${errDiff.toFixed(1)} 件増加しました。例外処理(Exception Handling)のオーバーヘッドやエラー回復ロジックの実行が遅延を引き起こしている可能性があります。`
        });
      } else {
        causes.push({
          icon: '🚨',
          title: `Transaction Error Volume Increase (Suspected Error Drift: +${errDiff.toFixed(1)}/hr)`,
          desc: `Average hourly transaction error count increased by ${errDiff.toFixed(1)}. Overhead from frequent exception parsing or retry recovery logic may have degraded performance.`
        });
      }
    }

    // 만약 리소스 변화나 에러가 적음에도 드리프트가 높다면 DB 대기 / 외부 대기 지연으로 판정
    if (!hasRootCause) {
      if (currentLang === 'ko') {
        causes.push({
          icon: '🔌',
          title: `데이터베이스 락 및 외부 연동 대기 지연 (Suspected Wait-time Drift)`,
          desc: `시스템 리소스(CPU/Heap) 및 에러 변화는 미미하지만 응답 지연이 관찰됩니다. 데이터베이스 락(Lock) 대기, 슬로우 쿼리, 또는 외부 제3사 API 연동 지연으로 인한 블로킹 시간이 지연을 주도하고 있을 가능성이 큽니다.`
        });
      } else if (currentLang === 'ja') {
        causes.push({
          icon: '🔌',
          title: `データベースロックおよび外部連携の待機遅延 (待機時間ドリフトの疑い)`,
          desc: `システムリソース(CPU/Heap)およびエラー率の変動は極めて低いですが、応答遅延が検出されています。データベースのロック待機、スロークエリ、または外部API連携のタイムアウトなどのブロッキング時間が影響している可能性が高いです。`
        });
      } else {
        causes.push({
          icon: '🔌',
          title: `Database Lock or External Service Blocking (Suspected Wait-time Drift)`,
          desc: `System resource metrics (CPU/Heap) and error rates are stable, but overall response times have shifted. This pattern strongly indicates DB lock waiting, slow database queries, or blocking outbound HTTP API delays.`
        });
      }
    }
  }

  causes.forEach(c => {
    const item = document.createElement('div');
    item.className = 'drift-cause-item';
    item.innerHTML = `
      <span class="cause-icon">${c.icon}</span>
      <div class="cause-details">
        <h4>${c.title}</h4>
        <p>${c.desc}</p>
      </div>
    `;
    driftCauseList.appendChild(item);
  });
}

function renderDriftChart(labels, dataA, dataB) {
  const ctx = document.getElementById('driftChart').getContext('2d');
  if (driftChartInstance) driftChartInstance.destroy();

  driftChartInstance = new Chart(ctx, {
    type: 'line',
    data: {
      labels: labels.map(x => `${x}ms`),
      datasets: [
        {
          label: t('drift.baselinePeriod') + ' (Period A)',
          data: dataA,
          borderColor: '#1e3a8a',
          backgroundColor: 'rgba(30, 58, 138, 0.05)',
          borderWidth: 2,
          pointRadius: 0,
          fill: true,
          tension: 0.3
        },
        {
          label: t('drift.comparePeriod') + ' (Period B)',
          data: dataB,
          borderColor: '#ef4444',
          backgroundColor: 'rgba(239, 68, 68, 0.05)',
          borderWidth: 2,
          pointRadius: 0,
          fill: true,
          tension: 0.3
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
        legend: { position: 'top' },
        tooltip: {
          callbacks: {
            label: (context) => {
              return ` ${context.dataset.label}: ${context.raw.toFixed(4)} % (Density)`;
            }
          }
        }
      },
      scales: {
        y: {
          title: { display: true, text: 'Probability Density (%)', font: { weight: 'bold' } },
          grid: { color: '#e2e8f0' }
        },
        x: {
          grid: { display: false }
        }
      }
    }
  });
}
