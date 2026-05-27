import Chart from 'chart.js/auto';
import { t, getLang } from './i18n.js';

// 설정 정보 로드
const PTA_CFG = window.PTA_CONFIG || {};
const API_BASE = (PTA_CFG.API_DOMAIN || '') + '/api/dbmetrics';
const BUSINESS_METRICS_API_BASE = (PTA_CFG.API_DOMAIN || '') + '/api/dbmetrics/business';
const DOMAIN_API_BASE = (PTA_CFG.API_DOMAIN || '') + '/api/domain';
const INSTANCE_API_BASE = (PTA_CFG.API_DOMAIN || '') + '/api/instance';
const BUSINESS_API_BASE = (PTA_CFG.API_DOMAIN || '') + '/api/business';
const TOKEN = PTA_CFG.TOKEN || '';

// 전역 변수
let tuningChartInstance = null;
let currentMetric = 'service_time';
let domainTree = [];
let currentSelectedPath = [];
let beforeData = {};
let afterData = {};

// DOM 요소
const instanceSelect = document.getElementById('instanceSelect');
const businessSelect = document.getElementById('businessSelect');
const instanceFilterArea = document.getElementById('instanceFilterArea');
const businessFilterArea = document.getElementById('businessFilterArea');
const typeRadios = document.querySelectorAll('input[name="targetType"]');
const btnSysCpu = document.getElementById('btnSysCpu');

// Flatpickr 입력창
const beforeStartInput = document.getElementById('beforeStart');
const beforeEndInput = document.getElementById('beforeEnd');
const afterStartInput = document.getElementById('afterStart');
const afterEndInput = document.getElementById('afterEnd');

// 성과 리포트 카드 DOM
const rtValEl = document.getElementById('rtVal');
const rtDiffEl = document.getElementById('rtDiff');
const tpsValEl = document.getElementById('tpsVal');
const tpsDiffEl = document.getElementById('tpsDiff');
const errValEl = document.getElementById('errVal');
const errDiffEl = document.getElementById('errDiff');
const effValEl = document.getElementById('effVal');
const effDiffEl = document.getElementById('effDiff');

const beforeDiagnosisReport = document.getElementById('beforeDiagnosisReport');
const tuningEffectVerdict = document.getElementById('tuningEffectVerdict');

// 날짜 포맷팅 유틸
function dateToString(d) {
  const y = d.getFullYear();
  const m = String(d.getMonth() + 1).padStart(2, '0');
  const r = String(d.getDate()).padStart(2, '0');
  return `${y}-${m}-${r}`;
}

// Chart.js 스타일 초기화
Chart.defaults.font.family = '"Pretendard JP", sans-serif';
Chart.defaults.color = "#64748b";

// 페이지 로드 시 초기화
document.addEventListener('DOMContentLoaded', async () => {
  if (!TOKEN || !PTA_CFG.BASE_URL) {
    showConfigError('Vite 설정이나 토큰 정보가 없습니다. pta/config.js를 확인하세요.');
    return;
  }

  // 1. 기본 기간 설정
  // - 개선 후 (After): 이번 달 1일부터 오늘까지
  // - 개선 전 (Before): 이전 달 1일부터 이번 달 일수(오늘 날짜)만큼의 기간 (이전 달 최대 일수 제한 적용)
  const today = new Date();
  
  const aStart = new Date(today.getFullYear(), today.getMonth(), 1);
  const aEnd = new Date(today);

  const days = today.getDate();
  const prevMonthDate = new Date(today.getFullYear(), today.getMonth() - 1, 1);
  const prevYear = prevMonthDate.getFullYear();
  const prevMonth = prevMonthDate.getMonth();
  const lastDayOfPrevMonth = new Date(prevYear, prevMonth + 1, 0).getDate();
  const prevEndDay = Math.min(days, lastDayOfPrevMonth);

  const bStart = new Date(prevYear, prevMonth, 1);
  const bEnd = new Date(prevYear, prevMonth, prevEndDay);

  beforeStartInput.value = dateToString(bStart);
  beforeEndInput.value = dateToString(bEnd);
  afterStartInput.value = dateToString(aStart);
  afterEndInput.value = dateToString(aEnd);

  // 2. Flatpickr 적용
  const currentLang = getLang();
  const fpConfig = {
    locale: currentLang === 'ko' ? 'ko' : currentLang === 'en' ? 'default' : 'ja',
    dateFormat: 'Y-m-d',
    onChange: () => {
      loadData();
    }
  };
  flatpickr(beforeStartInput, fpConfig);
  flatpickr(beforeEndInput, fpConfig);
  flatpickr(afterStartInput, fpConfig);
  flatpickr(afterEndInput, fpConfig);

  // 3. 도메인 로드
  await loadDomains();

  // 4. 대상(인스턴스 vs 비즈니스) 전환 연동
  typeRadios.forEach(radio => {
    radio.addEventListener('change', (e) => {
      const type = e.target.value;
      if (type === 'instance') {
        instanceFilterArea.classList.remove('hidden');
        businessFilterArea.classList.add('hidden');
        btnSysCpu.classList.remove('hidden');
      } else {
        instanceFilterArea.classList.add('hidden');
        businessFilterArea.classList.remove('hidden');
        btnSysCpu.classList.add('hidden');
        
        // 비즈니스 모드 시 활성 메트릭이 CPU이면 응답시간으로 되돌림
        if (currentMetric === 'sys_cpu') {
          currentMetric = 'service_time';
          document.querySelectorAll('.metric-btn').forEach(b => {
            b.classList.toggle('active', b.dataset.metric === 'service_time');
          });
        }
        
        const domainId = currentSelectedPath[currentSelectedPath.length - 1]?.id;
        if (domainId) fetchBusinesses(domainId);
      }
      loadData();
    });
  });

  // 5. 인스턴스/비즈니스 변경 연동
  instanceSelect.addEventListener('change', () => loadData());
  businessSelect.addEventListener('change', () => loadData());

  // 6. 메트릭 토글 버튼 연동
  document.querySelectorAll('.metric-btn').forEach(btn => {
    btn.addEventListener('click', (e) => {
      document.querySelectorAll('.metric-btn').forEach(b => b.classList.remove('active'));
      const targetBtn = e.currentTarget;
      targetBtn.classList.add('active');
      currentMetric = targetBtn.dataset.metric;
      
      updateView();
    });
  });
});

// 도메인 리스트 로드
async function loadDomains() {
  const url = new URL(DOMAIN_API_BASE, window.location.origin);
  url.searchParams.append('token', TOKEN);

  try {
    const response = await fetch(url.toString(), {
      method: 'GET',
      headers: { 'Accept': 'application/json' }
    });

    if (!response.ok) throw new Error(`HTTP Error: ${response.status}`);

    const data = await response.json();
    const flatDomains = data.result || [];
    flatDomains.sort((a, b) => a.domainId - b.domainId);

    domainTree = buildDomainTree(flatDomains);
    const firstDomain = findFirstDomain(domainTree);
    if (firstDomain) {
      updateSelectedPath(firstDomain.path);
    }
    renderHierarchicalSelector();
  } catch (error) {
    console.error('도메인 로드 실패. Mock 데이터를 사용합니다.', error);

    const mockFlatDomains = [
      { domainId: '1000', name: 'DEMO-PROD-WEB', groupHierarchy: ['JENNIFER DEMO', 'PRODUCTION'] },
      { domainId: '1001', name: 'DEMO-PROD-API', groupHierarchy: ['JENNIFER DEMO', 'PRODUCTION'] }
    ];

    domainTree = buildDomainTree(mockFlatDomains);
    const firstDomain = findFirstDomain(domainTree);
    if (firstDomain) {
      updateSelectedPath(firstDomain.path);
    }
    renderHierarchicalSelector();
  }
}

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

// 첫 번째 도메인 검색
function findFirstDomain(nodes, path = []) {
  for (const node of nodes) {
    const currentPath = [...path, { id: node.id, name: node.name, type: node.type }];
    if (node.type === 'domain') {
      return { node, path: currentPath };
    }
    if (node.children && node.children.length > 0) {
      const found = findFirstDomain(node.children, currentPath);
      if (found) return found;
    }
  }
  return null;
}

function updateSelectedPath(path) {
  currentSelectedPath = path;
  const lastItem = path[path.length - 1];
  if (lastItem && lastItem.type === 'domain') {
    loadInstances(lastItem.id);
  }
}

// 인스턴스 목록 로드
async function loadInstances(domainId) {
  const url = new URL(INSTANCE_API_BASE, window.location.origin);
  url.searchParams.append('token', TOKEN);
  url.searchParams.append('domain_id', domainId);

  try {
    const response = await fetch(url.toString(), {
      method: 'GET',
      headers: { 'Accept': 'application/json' }
    });

    if (!response.ok) throw new Error(`HTTP Error: ${response.status}`);

    const data = await response.json();
    const instances = data.result || [];
    instances.sort((a, b) => a.instanceId - b.instanceId);

    instanceSelect.innerHTML = `<option value="">${t('select.allInstances')}</option>`;
    instances.forEach(instance => {
      const option = document.createElement('option');
      option.value = instance.instanceId;
      option.textContent = instance.name;
      instanceSelect.appendChild(option);
    });
  } catch (error) {
    console.warn('인스턴스 로드 실패. Mock 적용');
    const mockInstances = [
      { instanceId: '1', name: `Instance-${domainId}-1 (AP Server)` },
      { instanceId: '2', name: `Instance-${domainId}-2 (Batch Server)` }
    ];
    instanceSelect.innerHTML = `<option value="">${t('select.allInstances')}</option>`;
    mockInstances.forEach(instance => {
      const option = document.createElement('option');
      option.value = instance.instanceId;
      option.textContent = instance.name;
      instanceSelect.appendChild(option);
    });
  }

  // 비즈니스 로드
  fetchBusinesses(domainId);
  loadData();
}

// 비즈니스 목록 로드
async function fetchBusinesses(domainId) {
  const url = new URL(BUSINESS_API_BASE, window.location.origin);
  url.searchParams.append('token', TOKEN);
  url.searchParams.append('domain_id', domainId);

  try {
    const response = await fetch(url.toString(), {
      method: 'GET',
      headers: { 'Accept': 'application/json' }
    });
    if (!response.ok) throw new Error(`HTTP Error: ${response.status}`);
    const data = await response.json();
    const businesses = data.result || [];

    businessSelect.innerHTML = `<option value="">${t('select.allBusinesses')}</option>`;
    businesses.forEach(biz => {
      const option = document.createElement('option');
      option.value = biz.businessId;
      // 계층형 들여쓰기 반영
      const indent = biz.businessIndex ? '&nbsp;&nbsp;'.repeat(biz.businessIndex.split('.').length - 1) : '';
      option.innerHTML = indent + biz.name;
      businessSelect.appendChild(option);
    });
  } catch (error) {
    console.warn('비즈니스 목록 로드 실패. Mock 적용');
    const mockBiz = [
      { businessId: '101', name: 'User Authentication API' },
      { businessId: '102', name: 'Order & Payment Service' }
    ];
    businessSelect.innerHTML = `<option value="">${t('select.allBusinesses')}</option>`;
    mockBiz.forEach(biz => {
      const option = document.createElement('option');
      option.value = biz.businessId;
      option.textContent = biz.name;
      businessSelect.appendChild(option);
    });
  }
}

// 도메인 브레드크럼 UI 렌더링
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
      showSelectorDropdown(index, breadcrumb);
    });

    container.appendChild(breadcrumb);
  });
}

function showSelectorDropdown(pathIndex, element) {
  const oldDropdown = document.getElementById('selectorDropdownPopup');
  if (oldDropdown) oldDropdown.remove();

  const dropdown = document.createElement('div');
  dropdown.id = 'selectorDropdownPopup';
  dropdown.className = 'dropdown-popup-custom';
  dropdown.style.position = 'absolute';
  dropdown.style.background = 'rgba(15, 23, 42, 0.95)';
  dropdown.style.border = '1px solid rgba(255, 255, 255, 0.15)';
  dropdown.style.borderRadius = '12px';
  dropdown.style.padding = '8px 0';
  dropdown.style.zIndex = '1000';
  dropdown.style.minWidth = '180px';
  dropdown.style.boxShadow = '0 10px 25px -5px rgba(0, 0, 0, 0.5)';
  dropdown.style.backdropFilter = 'blur(10px)';

  const rect = element.getBoundingClientRect();
  dropdown.style.top = `${rect.bottom + window.scrollY + 6}px`;
  dropdown.style.left = `${rect.left + window.scrollX}px`;

  let targetNodes = domainTree;
  for (let i = 0; i < pathIndex; i++) {
    const pathItem = currentSelectedPath[i];
    const foundGroup = targetNodes.find(n => n.name === pathItem.name && n.type === 'group');
    if (foundGroup) targetNodes = foundGroup.children;
  }

  targetNodes.forEach(node => {
    const itemEl = document.createElement('div');
    itemEl.style.padding = '8px 16px';
    itemEl.style.cursor = 'pointer';
    itemEl.style.fontSize = '0.85rem';
    itemEl.style.color = '#e2e8f0';
    itemEl.textContent = node.name;

    itemEl.addEventListener('mouseenter', () => {
      itemEl.style.background = 'rgba(255, 255, 255, 0.08)';
    });
    itemEl.addEventListener('mouseleave', () => {
      itemEl.style.background = 'transparent';
    });

    itemEl.addEventListener('click', () => {
      const nextPath = currentSelectedPath.slice(0, pathIndex);
      nextPath.push({ id: node.id, name: node.name, type: node.type });

      if (node.type === 'group') {
        const firstDomain = findFirstDomain(node.children, nextPath);
        if (firstDomain) {
          updateSelectedPath(firstDomain.path);
        }
      } else {
        updateSelectedPath(nextPath);
      }
      renderHierarchicalSelector();
      dropdown.remove();
    });

    dropdown.appendChild(itemEl);
  });

  document.body.appendChild(dropdown);

  const closeDropdown = (e) => {
    if (!dropdown.contains(e.target) && !element.contains(e.target)) {
      dropdown.remove();
      document.removeEventListener('click', closeDropdown);
    }
  };
  setTimeout(() => document.addEventListener('click', closeDropdown), 10);
}

// Before / After 각각의 데이터 병렬 로드
async function loadData() {
  const loadingOverlay = document.getElementById('loadingOverlay');
  if (loadingOverlay) loadingOverlay.classList.remove('hidden');

  const domainId = currentSelectedPath[currentSelectedPath.length - 1]?.id;
  const targetType = document.querySelector('input[name="targetType"]:checked')?.value || 'instance';
  const instanceId = instanceSelect.value;
  const businessId = businessSelect.value;
  const targetId = targetType === 'instance' ? instanceId : businessId;

  if (!domainId) {
    if (loadingOverlay) loadingOverlay.classList.add('hidden');
    return;
  }

  const bStart = beforeStartInput.value.replace(/-/g, '') + "00";
  const bEnd = beforeEndInput.value.replace(/-/g, '') + "00";
  const aStart = afterStartInput.value.replace(/-/g, '') + "00";
  const aEnd = afterEndInput.value.replace(/-/g, '') + "00";

  try {
    const metrics = ['service_time', 'service_rate', 'service_err_count', 'service_count', 'sys_cpu'];

    // Before 데이터와 After 데이터를 각각 병렬 요청
    const [bRes, aRes] = await Promise.all([
      fetchPeriodMetrics(domainId, targetId, targetType, bStart, bEnd, metrics),
      fetchPeriodMetrics(domainId, targetId, targetType, aStart, aEnd, metrics)
    ]);

    beforeData = bRes;
    afterData = aRes;

    if (Object.keys(beforeData).length === 0 || Object.keys(afterData).length === 0) {
      throw new Error('API 데이터 비어 있음');
    }

    updateView();
  } catch (error) {
    console.warn('API 연동 실패로 Before / After 성능 모의 데이터를 구성합니다.');
    generateMockTuningData();
  } finally {
    if (loadingOverlay) loadingOverlay.classList.add('hidden');
  }
}

// 특정 범위 메트릭 요청
async function fetchPeriodMetrics(domainId, targetId, targetType, start, end, metrics) {
  const dataStore = {};

  const promises = metrics.map(async (metric) => {
    let endpoint;
    if (!targetId) {
      endpoint = `${API_BASE}/domain`;
    } else {
      endpoint = targetType === 'instance' ? `${API_BASE}/instance` : BUSINESS_METRICS_API_BASE;
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
    url.searchParams.append('start_time', start);
    url.searchParams.append('end_time', end);
    url.searchParams.append('interval_minute', 1440); // 일별
    url.searchParams.append('metrics', metric);

    const response = await fetch(url.toString(), {
      method: 'GET',
      headers: { 'Accept': 'application/json' }
    });

    if (!response.ok) throw new Error(`HTTP Error: ${response.status}`);
    const data = await response.json();
    
    // 시간 정렬 및 캐싱
    const sorted = data.result || [];
    sorted.sort((a, b) => String(a.time).localeCompare(String(b.time)));
    dataStore[metric] = sorted;
  });

  await Promise.all(promises);

  // 에러율 계산 통합
  const errCount = dataStore.service_err_count || [];
  const serviceCount = dataStore.service_count || [];
  dataStore.err_rate = serviceCount.map((item, idx) => {
    const errItem = errCount[idx];
    const count = item.value || 0;
    const errVal = errItem ? errItem.value : 0;
    return {
      time: item.time,
      value: count > 0 ? (errVal / count) * 100 : 0
    };
  });

  return dataStore;
}

// 화면 업데이트 및 튜닝 효과 통계 계산
function updateView() {
  const bList = beforeData[currentMetric] || [];
  const aList = afterData[currentMetric] || [];

  if (bList.length === 0 || aList.length === 0) return;

  // 1. 주요 지표 평균 계산
  const avgBeforeRT = getAverage(beforeData.service_time);
  const avgAfterRT = getAverage(afterData.service_time);

  const avgBeforeTPS = getAverage(beforeData.service_rate);
  const avgAfterTPS = getAverage(afterData.service_rate);

  const avgBeforeErr = getAverage(beforeData.err_rate);
  const avgAfterErr = getAverage(afterData.err_rate);

  // CPU 데이터의 유효성 검사 (도메인 전체이거나 비즈니스 모드면 CPU 데이터가 수집되지 않음)
  const hasBeforeCpu = beforeData.sys_cpu && beforeData.sys_cpu.length > 0 && beforeData.sys_cpu.some(d => (d.value || 0) > 0);
  const hasAfterCpu = afterData.sys_cpu && afterData.sys_cpu.length > 0 && afterData.sys_cpu.some(d => (d.value || 0) > 0);
  const hasCpuData = hasBeforeCpu && hasAfterCpu;

  // 리소스 효율성 (평균 CPU / TPS) -> 낮을수록 고효율 튜닝
  const avgBeforeCpu = hasCpuData ? getAverage(beforeData.sys_cpu) : 0;
  const avgAfterCpu = hasCpuData ? getAverage(afterData.sys_cpu) : 0;
  
  const beforeEff = (hasCpuData && avgBeforeTPS > 0) ? (avgBeforeCpu / avgBeforeTPS) : 0;
  const afterEff = (hasCpuData && avgAfterTPS > 0) ? (avgAfterCpu / avgAfterTPS) : 0;

  // 2. 카드 값 렌더링
  rtValEl.innerHTML = `${avgAfterRT.toFixed(1)} <span class="unit">ms</span>`;
  renderDiff(rtDiffEl, avgBeforeRT, avgAfterRT, 'down', 'ms');

  tpsValEl.innerHTML = `${avgAfterTPS.toFixed(2)}`;
  renderDiff(tpsDiffEl, avgBeforeTPS, avgAfterTPS, 'up', '');

  errValEl.innerHTML = `${avgAfterErr.toFixed(2)} <span class="unit">%</span>`;
  renderDiff(errDiffEl, avgBeforeErr, avgAfterErr, 'down', '%');

  if (hasCpuData) {
    effValEl.innerHTML = `${afterEff.toFixed(2)} <span class="unit">CPU/TPS</span>`;
    renderDiff(effDiffEl, beforeEff, afterEff, 'down', '');
  } else {
    effValEl.innerHTML = `-`;
    effDiffEl.innerHTML = `-`;
    effDiffEl.className = 'change-rate';
  }

  // 3. 한글 분석 리포트 연산
  generateReports(avgBeforeRT, avgAfterRT, avgBeforeTPS, avgAfterTPS, avgBeforeErr, avgAfterErr, beforeEff, afterEff, avgBeforeCpu, avgAfterCpu, hasCpuData);

  // 4. 오버레이 비교 차트 그리기
  renderOverlayChart(bList, aList);
}

function getAverage(arr) {
  if (!arr || arr.length === 0) return 0;
  const sum = arr.reduce((acc, item) => acc + (item.value || 0), 0);
  return sum / arr.length;
}

// 증감 및 개선도 렌더링 유틸
function renderDiff(element, before, after, goodTrend, unit = '') {
  if (before === 0) {
    element.textContent = '-';
    element.className = 'change-rate';
    return;
  }

  let rate = 0;
  if (goodTrend === 'down') {
    // 낮아지는 것이 양호 (응답시간, 에러율, CPU 부하 등)
    rate = ((before - after) / before) * 100;
  } else {
    // 높아지는 것이 양호 (TPS 등)
    rate = ((after - before) / before) * 100;
  }

  const rawChange = ((after - before) / before) * 100;
  const displayPercent = Math.abs(rawChange).toFixed(1);

  if (rawChange === 0) {
    element.innerHTML = `<span>변화 없음</span>`;
    element.className = 'change-rate';
  } else if (rawChange > 0) {
    // 상승
    const isGood = goodTrend === 'up';
    element.innerHTML = `<span class="${isGood ? 'rate-down' : 'rate-up'}">▲ ${displayPercent}%</span>`;
  } else {
    // 하락
    const isGood = goodTrend === 'down';
    element.innerHTML = `<span class="${isGood ? 'rate-down' : 'rate-up'}">▼ ${displayPercent}%</span>`;
  }
}

// 한글/일본어/영어 진단 및 검증 리포트 자동 생성
function generateReports(bRT, aRT, bTPS, aTPS, bErr, aErr, bEff, aEff, bCpu, aCpu, hasCpuData) {
  const lang = getLang();
  
  // Before 리포트 생성
  const beforeList = [];
  
  if (lang === 'ko') {
    if (bRT > 3000) {
      beforeList.push(`평균 응답시간이 <strong>${bRT.toFixed(0)}ms</strong>에 달해 사용자 지연 시간이 매우 길었습니다. DB Lock이나 긴 비즈니스 로직 튜닝이 요구되는 상태였습니다.`);
    } else {
      beforeList.push(`평균 응답시간은 ${bRT.toFixed(0)}ms로 안정 범위 내에 있었으나, 피크 부하 대응 성능 한계를 확인하기 위한 모니터링이 필요한 상태였습니다.`);
    }
    if (bErr > 2.0) {
      beforeList.push(`평균 에러율이 <strong>${bErr.toFixed(2)}%</strong>로 비교적 높아 특정 예외나 연결 장애가 서비스 품질을 악화시키는 주요 원인이었습니다.`);
    }
    if (hasCpuData) {
      if (bCpu > 40) {
        beforeList.push(`평균 CPU 사용률이 <strong>${bCpu.toFixed(1)}%</strong>로 비교적 높아 트랜잭션당 리소스 부하가 가중되고 있었습니다.`);
      }
      if (bEff > 5.0) {
        beforeList.push(`자원 효율성이 <strong>${bEff.toFixed(2)} CPU/TPS</strong>로 측정되어, 적은 처리량(TPS)에 비해 CPU 연산 소모가 많았음을 드러냅니다.`);
      } else {
        beforeList.push(`리소스 효율성 지표가 ${bEff.toFixed(2)} 수준으로, 애플리케이션의 기본적인 구조 개선 여지가 충분했습니다.`);
      }
    }
  } else if (lang === 'en') {
    if (bRT > 3000) {
      beforeList.push(`Average response time was extremely high at <strong>${bRT.toFixed(0)}ms</strong>. Tuning for DB locks or heavy business logic was required.`);
    } else {
      beforeList.push(`Average response time was stable at ${bRT.toFixed(0)}ms, but continuous monitoring was recommended for peak load capability.`);
    }
    if (bErr > 2.0) {
      beforeList.push(`Average error rate was relatively high at <strong>${bErr.toFixed(2)}%</strong>, indicating that application exceptions or network issues were affecting service quality.`);
    }
    if (hasCpuData) {
      if (bCpu > 40) {
        beforeList.push(`Average CPU usage was high at <strong>${bCpu.toFixed(1)}%</strong>, adding resource pressure per transaction.`);
      }
      if (bEff > 5.0) {
        beforeList.push(`Resource efficiency was measured at <strong>${bEff.toFixed(2)} CPU/TPS</strong>, showing heavy CPU load per transaction.`);
      } else {
        beforeList.push(`Resource efficiency index was at ${bEff.toFixed(2)}, leaving room for standard structural optimization.`);
      }
    }
  } else { // default ja
    if (bRT > 3000) {
      beforeList.push(`平均応答時間が <strong>${bRT.toFixed(0)}ms</strong> に達し、ユーザー遅延が深刻でした。DBロックや複雑なビジネスロジックのチューニングが要求される状態でした。`);
    } else {
      beforeList.push(`平均応答時間は ${bRT.toFixed(0)}ms と安定範囲内でしたが、ピーク負荷耐性を確認するための継続監視が必要な状態でした。`);
    }
    if (bErr > 2.0) {
      beforeList.push(`平均エラー率が <strong>${bErr.toFixed(2)}%</strong> と比較的高く、特定の例外や接続障害がサービス品質低下の主因でした。`);
    }
    if (hasCpuData) {
      if (bCpu > 40) {
        beforeList.push(`平均CPU使用率が <strong>${bCpu.toFixed(1)}%</strong> と比較的高く、トランザクションあたりのリソース負荷が加重されていました。`);
      }
      if (bEff > 5.0) {
        beforeList.push(`リソース効率性が <strong>${bEff.toFixed(2)} CPU/TPS</strong> と算出され、低い処理量に対して過度なCPU消費があったことを示します。`);
      } else {
        beforeList.push(`リソース効率性指標は ${bEff.toFixed(2)} レベルで、基本的なアプリケーション構成의 改善余地が存在していました。`);
      }
    }
  }

  beforeDiagnosisReport.innerHTML = beforeList.map(li => `<li>${li}</li>`).join('');

  // Verdict 리포트 생성
  const verdictList = [];
  const rtImprovement = bRT > 0 ? ((bRT - aRT) / bRT) * 100 : 0;
  const tpsImprovement = bTPS > 0 ? ((aTPS - bTPS) / bTPS) * 100 : 0;
  const errReduction = bErr - aErr;
  const effImprovement = (hasCpuData && bEff > 0) ? ((bEff - aEff) / bEff) * 100 : 0;

  // 성능 저하(부작용) 발생 여부 체크: 응답 시간이 1% 이상 증가했거나 에러율이 0.2%p 이상 상승한 경우
  const isDegraded = rtImprovement < -1 || errReduction < -0.2;

  if (lang === 'ko') {
    if (rtImprovement > 15) {
      verdictList.push(`<strong>평균 응답시간이 기존 대비 ${rtImprovement.toFixed(1)}% 대폭 단축</strong>되어 사용성 및 응답 지연이 해소되었습니다.`);
    } else if (rtImprovement > 0) {
      verdictList.push(`응답시간이 약 ${rtImprovement.toFixed(1)}% 소폭 단축되어 점진적인 튜닝 성과가 있었습니다.`);
    } else {
      verdictList.push(`응답시간 개선 성과가 미미하거나 소폭 늘어났습니다. 튜닝 코드의 다른 로직 부작용을 점검해야 합니다.`);
    }
    if (tpsImprovement > 10) {
      verdictList.push(`동일 리소스 처리량(TPS)이 <strong>${tpsImprovement.toFixed(1)}% 증가</strong>하여 애플리케이션의 최대 수용량이 확대되었습니다.`);
    }
    if (errReduction > 1.0) {
      verdictList.push(`에러율이 <strong>${errReduction.toFixed(2)}%p 감소</strong>하여 트랜잭션 성공 신뢰도가 한층 보강되었습니다.`);
    }
    if (hasCpuData && effImprovement > 15) {
      verdictList.push(`자원 효율이 <strong>${effImprovement.toFixed(1)}% 향상(CPU/TPS 감소)</strong>되어 동일 서버 하드웨어 스펙에서 처리 가능한 효율이 증명되었습니다.`);
    }
    if (verdictList.length === 0) {
      verdictList.push(`개선 전후의 뚜렷한 성능 격차가 감지되지 않았습니다. 분석 기간을 재지정하거나 튜닝 소스 배포 시점을 재확인하십시오.`);
    } else {
      if (isDegraded) {
        verdictList.unshift(`<strong>[종합 판정]</strong> 성능 튜닝 및 애플리케이션 배포 결과, 응답 지연 또는 에러율 상승 등 성능 역전 현상이 감지되었습니다. 튜닝 코드의 부작용이나 인프라 설정 오류 가능성이 있으므로 배포를 재검토하십시오.`);
      } else {
        verdictList.unshift(`<strong>[종합 판정]</strong> 성능 튜닝 및 애플리케이션 배포 결과, 주요 서비스 응답성 및 인프라 비용 효율 면에서 확실한 성과가 증명되어 배포 타당성을 확보했습니다.`);
      }
    }
  } else if (lang === 'en') {
    if (rtImprovement > 15) {
      verdictList.push(`<strong>Average response time decreased significantly by ${rtImprovement.toFixed(1)}%</strong>, resolving latency issues.`);
    } else if (rtImprovement > 0) {
      verdictList.push(`Response time decreased slightly by ${rtImprovement.toFixed(1)}%, showing gradual optimization results.`);
    } else {
      verdictList.push(`Response time showed no noticeable improvement. Verify code side-effects.`);
    }
    if (tpsImprovement > 10) {
      verdictList.push(`Throughput (TPS) <strong>increased by ${tpsImprovement.toFixed(1)}%</strong>, boosting maximum capacity.`);
    }
    if (errReduction > 1.0) {
      verdictList.push(`Error rate <strong>decreased by ${errReduction.toFixed(2)}%p</strong>, ensuring transaction reliability.`);
    }
    if (hasCpuData && effImprovement > 15) {
      verdictList.push(`Resource efficiency <strong>improved by ${effImprovement.toFixed(1)}%</strong> (reduced CPU/TPS cost), proving system efficiency.`);
    }
    if (verdictList.length === 0) {
      verdictList.push(`No significant performance difference detected. Check the analysis range or tuning deployment time.`);
    } else {
      if (isDegraded) {
        verdictList.unshift(`<strong>[Final Verdict]</strong> Performance degradation or increased error rates detected after tuning/deployment. Reconsider deployment and investigate potential side-effects in the code or configuration.`);
      } else {
        verdictList.unshift(`<strong>[Final Verdict]</strong> Tuning results confirmed solid performance improvement in latency and hardware utilization cost.`);
      }
    }
  } else { // default ja
    if (rtImprovement > 15) {
      verdictList.push(`<strong>平均応答時間が従来比 ${rtImprovement.toFixed(1)}% 大幅短縮</strong>され、応答遅延が解消されました。`);
    } else if (rtImprovement > 0) {
      verdictList.push(`応答時間が約 ${rtImprovement.toFixed(1)}% 改善され、段階的なチューニング効果が認められました。`);
    } else {
      verdictList.push(`応答時間の改善効果が認められません。チューニングコードの副作用を再確認してください。`);
    }
    if (tpsImprovement > 10) {
      verdictList.push(`処理容量(TPS)が <strong>${tpsImprovement.toFixed(1)}% 向上</strong>し、システムの最大処理能力が拡大しました。`);
    }
    if (errReduction > 1.0) {
      verdictList.push(`エラー率が <strong>${errReduction.toFixed(2)}%p 低減</strong>し、トランザクションの信頼性が向上しました。`);
    }
    if (hasCpuData && effImprovement > 15) {
      verdictList.push(`リソース効率が <strong>${effImprovement.toFixed(1)}% 向上 (CPU/TPSの削減)</strong>し、費用対効果の高い処理能力が実証されました。`);
    }
    if (verdictList.length === 0) {
      verdictList.push(`前後で明確な性能差異が検出されませんでした。期間の再設定や配備日時を再確認してください。`);
    } else {
      if (isDegraded) {
        verdictList.unshift(`<strong>[総合判定]</strong> チューニングおよびアプリケーション配備の結果、応答遅延やエラー率の上昇など性能の悪化が検出されました。コードの副作用や設定ミスの可能性があるため、配備の再検討を推奨します。`);
      } else {
        verdictList.unshift(`<strong>[総合判定]</strong> チューニングの結果、サービスの応答性とハードウェアコスト効率の両面で顕著な改善が実証され、配備妥当性が確保されました。`);
      }
    }
  }

  tuningEffectVerdict.innerHTML = verdictList.map(li => `<li>${li}</li>`).join('');
}

// 오버레이 차트 렌더링
function renderOverlayChart(beforeList, afterList) {
  const canvas = document.getElementById('tuningChart');
  if (!canvas) return;

  const lang = getLang();
  // 두 기간의 데이터 길이가 다를 수 있으므로 최대 길이를 기준으로 1일차, 2일차로 라벨링
  const maxLength = Math.max(beforeList.length, afterList.length);
  const labels = Array.from({ length: maxLength }, (_, i) => {
    if (lang === 'ko') return `${i + 1}일차`;
    if (lang === 'en') return `Day ${i + 1}`;
    return `${i + 1}日目`;
  });

  const bVals = beforeList.map(item => item.value);
  const aVals = afterList.map(item => item.value);

  // 부족한 데이터는 null 채우기
  while (bVals.length < maxLength) bVals.push(null);
  while (aVals.length < maxLength) aVals.push(null);

  const metricLabel = document.querySelector(`.metric-btn.active`).textContent;
  const beforeLabel = lang === 'ko' ? `Before - 개선 전 (${metricLabel})` : lang === 'en' ? `Before - Tuning (${metricLabel})` : `Before - 改善前 (${metricLabel})`;
  const afterLabel = lang === 'ko' ? `After - 개선 후 (${metricLabel})` : lang === 'en' ? `After - Tuning (${metricLabel})` : `After - 改善後 (${metricLabel})`;

  const datasetBefore = {
    label: beforeLabel,
    data: bVals,
    borderColor: '#f87171',
    backgroundColor: 'transparent',
    borderWidth: 2,
    borderDash: [5, 5],
    pointRadius: 3,
    pointBackgroundColor: '#f87171',
    tension: 0.1
  };

  const datasetAfter = {
    label: afterLabel,
    data: aVals,
    borderColor: '#4ade80',
    backgroundColor: 'rgba(74, 222, 128, 0.05)',
    borderWidth: 2.5,
    fill: true,
    pointRadius: 3,
    pointBackgroundColor: '#4ade80',
    tension: 0.1
  };

  if (tuningChartInstance) {
    tuningChartInstance.destroy();
  }

  tuningChartInstance = new Chart(canvas, {
    type: 'line',
    data: {
      labels: labels,
      datasets: [datasetBefore, datasetAfter]
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
          labels: { color: '#94a3b8', font: { size: 11 } }
        },
        tooltip: {
          callbacks: {
            label: function(context) {
              const val = context.raw;
              if (val === null) return '';
              const unit = currentMetric === 'service_time' ? ' ms' : currentMetric === 'err_rate' ? '%' : '';
              return `${context.dataset.label}: ${val.toFixed(1)}${unit}`;
            }
          }
        }
      },
      scales: {
        x: {
          grid: { display: false },
          ticks: { color: '#64748b', font: { size: 10 } }
        },
        y: {
          grid: { color: 'rgba(255, 255, 255, 0.05)' },
          ticks: { color: '#64748b', font: { size: 10 } }
        }
      }
    }
  });
}

function showConfigError(msg) {
  const content = document.querySelector('.main-content');
  if (content) {
    content.innerHTML = `
      <div style="background:rgba(239,68,68,0.1); border:1px solid rgba(239,68,68,0.3); border-radius:16px; padding:2rem; margin-top:3rem; text-align:center;">
        <span style="font-size:3rem;">⚠️</span>
        <h2 style="margin-top:1rem;">설정 오류</h2>
        <p style="color:var(--text-secondary); margin-top:0.5rem;">${msg}</p>
      </div>
    `;
  }
}

// 튜닝 전후 성능 차이(Before = 비효율, After = 튜닝 효과)를 명확히 보여주는 모의 데이터 생성
function generateMockTuningData() {
  const bDays = Math.ceil((new Date(beforeEndInput.value) - new Date(beforeStartInput.value)) / (24 * 3600000)) + 1;
  const aDays = Math.ceil((new Date(afterEndInput.value) - new Date(afterStartInput.value)) / (24 * 3600000)) + 1;

  const bTimes = Array.from({ length: bDays }, (_, i) => `BeforeDay-${i}`);
  const aTimes = Array.from({ length: aDays }, (_, i) => `AfterDay-${i}`);

  beforeData = {
    service_time: bTimes.map(t => ({ time: t, value: 4100 + Math.random() * 800 })), // Before: 느림 (4100~4900ms)
    service_rate: bTimes.map(t => ({ time: t, value: 1.5 + Math.random() * 0.8 })), // TPS: 낮음
    service_err_count: bTimes.map(t => ({ time: t, value: 200 + Math.random() * 150 })),
    service_count: bTimes.map(t => ({ time: t, value: 6000 + Math.random() * 2000 })),
    sys_cpu: bTimes.map(t => ({ time: t, value: 45 + Math.random() * 15 })) // CPU 높은 편
  };

  beforeData.err_rate = beforeData.service_count.map((item, idx) => {
    const err = beforeData.service_err_count[idx].value;
    return { time: item.time, value: (err / item.value) * 100 };
  });

  afterData = {
    service_time: aTimes.map(t => ({ time: t, value: 1100 + Math.random() * 300 })), // After: 매우 빠름 (1100~1400ms)
    service_rate: aTimes.map(t => ({ time: t, value: 3.8 + Math.random() * 1.2 })), // TPS: 높음
    service_err_count: aTimes.map(t => ({ time: t, value: 10 + Math.random() * 15 })),
    service_count: aTimes.map(t => ({ time: t, value: 9000 + Math.random() * 1500 })),
    sys_cpu: aTimes.map(t => ({ time: t, value: 22 + Math.random() * 8 })) // CPU 낮고 안정적
  };

  afterData.err_rate = afterData.service_count.map((item, idx) => {
    const err = afterData.service_err_count[idx].value;
    return { time: item.time, value: (err / item.value) * 100 };
  });

  updateView();
}
