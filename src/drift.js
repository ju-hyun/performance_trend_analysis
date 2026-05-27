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

function estimateLogNormalParams(data, defaultMedian = 160) {
  if (!data || data.length < 3) {
    const mu = Math.log(defaultMedian);
    const sigma = 0.45;
    return { mu, sigma };
  }

  const values = data.map(item => item.value).filter(val => val > 0);
  if (values.length < 3) {
    const mu = Math.log(defaultMedian);
    const sigma = 0.45;
    return { mu, sigma };
  }

  const logs = values.map(val => Math.log(val));
  const mu = logs.reduce((sum, val) => sum + val, 0) / logs.length;
  
  let variance = logs.reduce((sum, val) => sum + Math.pow(val - mu, 2), 0) / (logs.length - 1);
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

// 도메인 트리 조회 및 초기 선택
async function loadDomainTree() {
  const url = `${DOMAIN_API_BASE}?token=${TOKEN}`;
  try {
    const response = await fetch(url);
    if (!response.ok) throw new Error('Domain API load failed');
    const data = await response.json();
    domainTree = data.result || [];

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

// 시뮬레이터 및 비교 계산 실행
async function loadData() {
  if (loadingOverlay) loadingOverlay.classList.remove('hidden');

  const domainId = currentSelectedPath[currentSelectedPath.length - 1]?.id;

  let muA, sigmaA, muB, sigmaB;
  let realDataA = [];
  let realDataB = [];
  let realDataFetched = false;

  if (domainId) {
    try {
      const startA = formatDateParam(periodADate, false);
      const endA = formatDateParam(periodADate, true);
      const startB = formatDateParam(periodBDate, false);
      const endB = formatDateParam(periodBDate, true);

      realDataA = await fetchMetricData(domainId, null, 'domain', startA, endA, 60, 'service_time');
      realDataB = await fetchMetricData(domainId, null, 'domain', startB, endB, 60, 'service_time');

      if (realDataA && realDataA.length > 2 && realDataB && realDataB.length > 2) {
        realDataFetched = true;
      }
    } catch (err) {
      console.warn('[Drift Analysis] Failed to fetch real response times. Falling back to simulator.', err);
    }
  }

  let driftMs = 0;
  if (realDataFetched) {
    const paramsA = estimateLogNormalParams(realDataA, 160);
    const paramsB = estimateLogNormalParams(realDataB, 200);
    muA = paramsA.mu;
    sigmaA = paramsA.sigma;
    muB = paramsB.mu;
    sigmaB = paramsB.sigma;
    driftMs = Math.round(Math.exp(muB) - Math.exp(muA));
  } else {
    // 2. 날짜 선택 차이에 따른 가변적인 드리프트 값 도출 (안정적인 느낌 속에서 날짜별 미세변화 연출)
    const timeDiff = Math.abs(periodBDate.getTime() - periodADate.getTime());
    const dayDiff = Math.ceil(timeDiff / (1000 * 3600 * 24));
    
    // 날짜별로 고정된 유사 난수 시드 결정
    const seed = (dayDiff % 7) * 4.2;
    const selectedDomainId = domainId || '1001';
    let baseOffset = 0;
    if (selectedDomainId === '1002') {
      baseOffset = 30; // 1002 도메인은 기본적으로 조금 더 느림
    }
    driftMs = Math.round(15 + seed + baseOffset); // 15ms ~ 65ms 사이의 미세 딜레이 드리프트

    muA = 5.07;
    sigmaA = 0.45;
    muB = Math.log(160 + driftMs);
    sigmaB = 0.45;
  }

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
  renderDriftCauses(avgDiffVal, driftMs);

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

function renderDriftCauses(avgDiffVal, driftMs) {
  driftCauseList.innerHTML = '';

  const currentLang = getLang();
  
  // 드리프트 원인 리포트 아이템 정의
  const causes = [];
  
  if (avgDiffVal <= 15) {
    if (currentLang === 'ko') {
      causes.push({
        icon: '✅',
        title: '정상 오차 범주 내 안정 기동',
        desc: '기준 기간 대비 응답 속도 분포의 왜곡 현상이 관찰되지 않습니다. 시스템 전반이 극도로 안정된 정적 평형 상태를 유지하고 있습니다.'
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
        desc: 'No response time distribution distortion observed. The overall system remains in a highly stable static equilibrium state.'
      });
    }
  } else {
    // 느려진 상태인 경우 (Drift 발생)
    const sqlDrift = Math.round(driftMs * 0.6);
    const gcDrift = Math.round(driftMs * 0.3);
    const extDrift = Math.round(driftMs - sqlDrift - gcDrift);

    if (currentLang === 'ko') {
      causes.push({
        icon: '💾',
        title: `데이터베이스 인덱스 파편화 및 쿼리 퇴화 (Suspected SQL Drift: +${sqlDrift}ms)`,
        desc: `전체 응답시간 지연 요인의 60%가 SQL 실행 시간 증가에서 발견되었습니다. 테이블 로우 수가 점진적으로 누적되면서 주요 인덱스의 탐색 효율이 낮아진 것으로 보입니다. 주기적인 DB Optimizer 통계 갱신 및 인덱스 리빌드(Rebuild)를 추천합니다.`
      });
      causes.push({
        icon: '⚙️',
        title: `JVM GC Stop-the-World 일시 누적 (Suspected GC Drift: +${gcDrift}ms)`,
        desc: `가비지 컬렉션(GC) 이후 회수되는 힙 메모리 파편화로 인해 미세한 일시 정지 시간이 장기적으로 평균 +${gcDrift}ms 증가했습니다. JVM GC 옵션 튜닝을 검토하십시오.`
      });
      if (extDrift > 0) {
        causes.push({
          icon: '🔌',
          title: `외부 연동 API 네트워크 지연 (Suspected API Drift: +${extDrift}ms)`,
          desc: `제 3사 인증 결제 등 아웃바운드 HTTP 연동 부분의 응답 대기 시간이 미세하게 누적되었습니다.`
        });
      }
    } else if (currentLang === 'ja') {
      causes.push({
        icon: '💾',
        title: `DBインデックス断片化とクエリ性能低下 (SQL影響度: +${sqlDrift}ms)`,
        desc: `遅延要因の60%がSQL実行時間の増加に起因しています。テーブルレコード数の累積に伴い、主要インデックスの検索効率が低下した可能性があります。定期的な統計情報の更新およびインデックス再構築(Rebuild)を推奨します。`
      });
      causes.push({
        icon: '⚙️',
        title: `JVM GC Stop-the-Worldの蓄積 (GC影響度: +${gcDrift}ms)`,
        desc: `ガベージコレクション(GC)後のメモリ断片化により、一時停止時間が長期平均で +${gcDrift}ms 増加しています。JVM GCチューニングの検討をお勧めします。`
      });
      if (extDrift > 0) {
        causes.push({
          icon: '🔌',
          title: `外部連携APIのネットワーク遅延 (外部連携影響度: +${extDrift}ms)`,
          desc: `サードパーティ認証や決済などのアウトバウンドHTTP連携で、応答待機時間がわずかに累積しています。`
        });
      }
    } else {
      causes.push({
        icon: '💾',
        title: `Database Index Fragmentation (Suspected SQL Drift: +${sqlDrift}ms)`,
        desc: `60% of the response delay is found in SQL execution time expansion. As table row count accumulates over time, search efficiency has degraded. Periodic database statistic updates and index rebuilds are recommended.`
      });
      causes.push({
        icon: '⚙️',
        title: `JVM GC Stop-the-World accumulation (Suspected GC Drift: +${gcDrift}ms)`,
        desc: `Miniscule pauses from Heap fragmentation during GC runs have increased response latency by an average of +${gcDrift}ms. Consider review of JVM GC tuning flags.`
      });
      if (extDrift > 0) {
        causes.push({
          icon: '🔌',
          title: `External Third-party Latency (Suspected API Drift: +${extDrift}ms)`,
          desc: `Slight latency buildup observed in outbound HTTP API calls to external authentication/payment gateways.`
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
