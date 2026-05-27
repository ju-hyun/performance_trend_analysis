import Chart from 'chart.js/auto';
import { t, getLang } from './i18n.js';

// 설정 정보 로드
const PTA_CFG = window.PTA_CONFIG || {};
const API_BASE = (PTA_CFG.API_DOMAIN || '') + '/api/dbmetrics';
const DOMAIN_API_BASE = (PTA_CFG.API_DOMAIN || '') + '/api/domain';
const INSTANCE_API_BASE = (PTA_CFG.API_DOMAIN || '') + '/api/instance';
const BUSINESS_API_BASE = (PTA_CFG.API_DOMAIN || '') + '/api/business';
const TOKEN = PTA_CFG.TOKEN || '';

// 전역 변수
let anomalyChartInstance = null;
let currentMetric = 'service_time';
let sensitivity = 2.0;
let domainTree = [];
let currentSelectedPath = [];
let dateRange = { start: null, end: null };
let timeSeriesData = []; // hourly data points { time, service_time, service_rate, err_rate, sys_cpu, heap_usage }
let anomalyFlags = [];
let anomalyList = [];

// DOM 요소
const targetTypeRadios = document.querySelectorAll('input[name="targetType"]');
const instanceFilterArea = document.getElementById('instanceFilterArea');
const businessFilterArea = document.getElementById('businessFilterArea');
const instanceSelect = document.getElementById('instanceSelect');
const businessSelect = document.getElementById('businessSelect');
const sensitivitySlider = document.getElementById('sensitivitySlider');
const sensitivityValue = document.getElementById('sensitivityValue');
const dateRangeInput = document.getElementById('dateRangePicker');
const loadingOverlay = document.getElementById('loadingOverlay');

// 통계 요약 카드 DOM
const totalDetectedValue = document.getElementById('totalDetectedValue');
const mostAffectedValue = document.getElementById('mostAffectedValue');
const highErrorCountValue = document.getElementById('highErrorCountValue');
const peakVsAvgValue = document.getElementById('peakVsAvgValue');

// 테이블 및 상세 패널 DOM
const anomalyEventTableBody = document.getElementById('anomalyEventTableBody');
const detailSlidePanel = document.getElementById('detailSlidePanel');
const closePanelBtn = document.getElementById('closePanelBtn');
const panelBackdrop = document.getElementById('panelBackdrop');

const detailDate = document.getElementById('detailDate');
const detailTime = document.getElementById('detailTime');
const detailMetricVal = document.getElementById('detailMetricVal');
const detailDiagnosis = document.getElementById('detailDiagnosis');
const detailMetricsValues = document.getElementById('detailMetricsValues');

// Chart.js 폰트 스타일 설정
Chart.defaults.font.family = '"Pretendard JP", sans-serif';
Chart.defaults.color = "#64748b";

// 초기화
document.addEventListener('DOMContentLoaded', async () => {
  if (!TOKEN || !PTA_CFG.BASE_URL) {
    showConfigError('Vite 설정이나 토큰 정보가 없습니다. pta/config.js를 확인하세요.');
    return;
  }

  // 1. 기본 기간 설정 (최근 30일)
  const today = new Date();
  const prior = new Date();
  prior.setDate(today.getDate() - 30);
  dateRange.start = prior;
  dateRange.end = today;

  // 2. Flatpickr 초기화
  const currentLang = getLang();
  flatpickr(dateRangeInput, {
    mode: "range",
    locale: currentLang === 'ko' ? 'ko' : currentLang === 'en' ? 'default' : 'ja',
    dateFormat: "Y-m-d",
    defaultDate: [dateRange.start, dateRange.end],
    onChange: (selectedDates) => {
      if (selectedDates.length === 2) {
        dateRange.start = selectedDates[0];
        dateRange.end = selectedDates[1];
        loadData();
      }
    }
  });

  // 3. 민감도 슬라이더 이벤트 연동
  sensitivitySlider.addEventListener('input', (e) => {
    sensitivity = parseFloat(e.target.value);
    sensitivityValue.textContent = sensitivity.toFixed(1);
    detectAnomalies();
    updateDashboardUI();
  });

  // 4. 대상 타입 라디오 버튼 연동
  targetTypeRadios.forEach(radio => {
    radio.addEventListener('change', (e) => {
      const type = e.target.value;
      if (type === 'instance') {
        instanceFilterArea.classList.remove('hidden');
        businessFilterArea.classList.add('hidden');
      } else {
        instanceFilterArea.classList.add('hidden');
        businessFilterArea.classList.remove('hidden');
      }
      loadData();
    });
  });

  // 5. 셀렉트 박스 변경 연동
  instanceSelect.addEventListener('change', () => loadData());
  businessSelect.addEventListener('change', () => loadData());

  // 6. 메트릭 버튼 클릭 연동
  document.querySelectorAll('.metric-btn').forEach(btn => {
    btn.addEventListener('click', (e) => {
      document.querySelectorAll('.metric-btn').forEach(b => b.classList.remove('active'));
      const targetBtn = e.currentTarget;
      targetBtn.classList.add('active');
      currentMetric = targetBtn.dataset.metric;
      detectAnomalies();
      updateDashboardUI();
    });
  });

  // 7. 슬라이드 패널 닫기 연동
  closePanelBtn.addEventListener('click', closeSlidePanel);
  panelBackdrop.addEventListener('click', closeSlidePanel);
  document.addEventListener('keydown', (e) => {
    if (e.key === 'Escape') closeSlidePanel();
  });

  // 8. 도메인 로드
  await loadDomains();
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

    if (response.status === 401) {
      showConfigError('Invalid or expired TOKEN. Please check your pta/config.js setting.', 'Unauthorized (401)');
      return;
    }

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
    console.error('도메인 목록 로드 실패.', error);
    showConfigError('도메인 목록 로드 실패: ' + error.message);
  }
}

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
    const targetType = document.querySelector('input[name="targetType"]:checked').value;
    if (targetType === 'instance') {
      loadInstances(lastItem.id);
    } else {
      loadBusinesses(lastItem.id);
    }
  }
}

// 인스턴스 로드
async function loadInstances(domainId) {
  const url = new URL(INSTANCE_API_BASE, window.location.origin);
  url.searchParams.append('token', TOKEN);
  url.searchParams.append('domain_id', domainId);

  try {
    const response = await fetch(url.toString(), {
      method: 'GET',
      headers: { 'Accept': 'application/json' }
    });
    
    if (response.status === 401) {
      showConfigError('Invalid or expired TOKEN. Please check your pta/config.js setting.', 'Unauthorized (401)');
      return;
    }

    if (!response.ok) throw new Error(`HTTP Error: ${response.status}`);
    const data = await response.json();
    const instances = data.result || [];
    instances.sort((a, b) => a.instanceId - b.instanceId);

    instanceSelect.innerHTML = '';
    const allOpt = document.createElement('option');
    allOpt.value = '';
    allOpt.textContent = t('select.allInstances');
    instanceSelect.appendChild(allOpt);

    instances.forEach(ins => {
      const opt = document.createElement('option');
      opt.value = ins.instanceId;
      opt.textContent = ins.name;
      instanceSelect.appendChild(opt);
    });
  } catch (error) {
    console.error('인스턴스 로드 실패.', error);
    alert('인스턴스 목록 로드 실패: ' + error.message);
  }
  loadData();
}

// 비즈니스 로드
async function loadBusinesses(domainId) {
  const url = new URL(BUSINESS_API_BASE, window.location.origin);
  url.searchParams.append('token', TOKEN);
  url.searchParams.append('domain_id', domainId);

  try {
    const response = await fetch(url.toString(), {
      method: 'GET',
      headers: { 'Accept': 'application/json' }
    });
    
    if (response.status === 401) {
      showConfigError('Invalid or expired TOKEN. Please check your pta/config.js setting.', 'Unauthorized (401)');
      return;
    }

    if (!response.ok) throw new Error(`HTTP Error: ${response.status}`);
    const data = await response.json();
    const businesses = data.result || [];

    businessSelect.innerHTML = '';
    const allOpt = document.createElement('option');
    allOpt.value = '';
    allOpt.textContent = t('select.allBusinesses');
    businessSelect.appendChild(allOpt);

    businesses.forEach(biz => {
      const opt = document.createElement('option');
      opt.value = biz.businessId || biz.id;
      opt.textContent = biz.name;
      businessSelect.appendChild(opt);
    });
  } catch (error) {
    console.error('비즈니스 로드 실패.', error);
    alert('비즈니스 목록 로드 실패: ' + error.message);
  }
  loadData();
}

// 브레드크럼 UI 렌더링
function renderHierarchicalSelector() {
  const container = document.getElementById('breadcrumbContainer');
  if (!container) return;
  container.innerHTML = '';

  currentSelectedPath.forEach((item, index) => {
    // Add separator if not the first item
    if (index > 0) {
      const sep = document.createElement('div');
      sep.className = 'breadcrumb-separator';
      sep.textContent = '>';
      container.appendChild(sep);
    }

    const breadcrumb = document.createElement('div');
    breadcrumb.className = 'breadcrumb-item';

    // Icon (Cube style)
    const icon = document.createElement('span');
    icon.innerHTML = `<svg xmlns="http://www.w3.org/2000/svg" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round"><polygon points="12 2 2 7 12 12 22 7 12 2"></polygon><polyline points="2 17 12 22 22 17"></polyline><polyline points="2 12 12 17 22 12"></polyline></svg>`;

    const text = document.createElement('span');
    text.textContent = item.name;

    breadcrumb.appendChild(icon);
    breadcrumb.appendChild(text);

    // Dropdown arrow for groups
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
          renderHierarchicalSelector();
        } else {
          // Find first domain in selected subgroup
          // We need to look into the node tree to find it
          let targetNode = domainTree;
          for (let i = 0; i < finalPath.length; i++) {
            const found = targetNode.find(n => n.name === finalPath[i].name);
            if (found) targetNode = (found.type === 'group') ? found.children : [found];
          }
          const firstInGroup = findFirstDomain(targetNode, finalPath);
          if (firstInGroup) {
            updateSelectedPath(firstInGroup.path);
            renderHierarchicalSelector();
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

    // Path including current item
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


function formatDateParam(date, isEnd = false) {
  const y = date.getFullYear();
  const m = String(date.getMonth() + 1).padStart(2, '0');
  const d = String(date.getDate()).padStart(2, '0');
  const h = isEnd ? '24' : '00';
  return `${y}${m}${d}${h}`;
}

function formatTimeForDisplay(tStr) {
  if (tStr && tStr.length === 10) {
    const y = tStr.substring(0, 4);
    const m = tStr.substring(4, 6);
    const d = tStr.substring(6, 8);
    const h = tStr.substring(8, 10);
    return `${y}-${m}-${d} ${h}:00`;
  }
  return tStr;
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

// 데이터 조회
async function loadData() {
  showLoading(true);
  
  const targetType = document.querySelector('input[name="targetType"]:checked')?.value || 'instance';
  const domainId = currentSelectedPath[currentSelectedPath.length - 1]?.id;
  const targetId = targetType === 'instance' ? instanceSelect.value : businessSelect.value;

  if (!domainId) {
    showLoading(false);
    return;
  }

  const startTimeStr = formatDateParam(dateRange.start, false);
  const endTimeStr = formatDateParam(dateRange.end, true);

  try {
    const metricsToFetch = ['service_time', 'service_rate', 'service_count', 'service_err_count', 'sys_cpu', 'heap_usage'];
    
    const fetchPromises = metricsToFetch.map(m => 
      fetchMetricData(domainId, targetId, targetType, startTimeStr, endTimeStr, 60, m)
        .catch(err => {
          console.warn(`Failed to fetch ${m} hourly data`, err);
          return [];
        })
    );

    const rawResults = await Promise.all(fetchPromises);
    
    const resultsMap = {};
    metricsToFetch.forEach((m, idx) => {
      resultsMap[m] = rawResults[idx] || [];
    });

    const allTimes = new Set();
    metricsToFetch.forEach(m => {
      resultsMap[m].forEach(item => {
        if (item.time) allTimes.add(item.time);
      });
    });

    const sortedTimes = Array.from(allTimes).sort();

    const dataByTime = {};
    sortedTimes.forEach(t => {
      dataByTime[t] = {
        time: formatTimeForDisplay(t),
        service_time: 0,
        service_rate: 0,
        err_rate: 0,
        sys_cpu: 0,
        heap_usage: 0,
        service_count: 0
      };
    });

    metricsToFetch.forEach(m => {
      resultsMap[m].forEach(item => {
        if (dataByTime[item.time]) {
          if (m === 'service_time' || m === 'service_rate' || m === 'sys_cpu' || m === 'heap_usage' || m === 'service_count') {
            dataByTime[item.time][m] = item.value || 0;
          } else if (m === 'service_err_count') {
            dataByTime[item.time]._err_count = item.value || 0;
          }
        }
      });
    });

    sortedTimes.forEach(t => {
      const d = dataByTime[t];
      const count = d.service_count || 0;
      const errCount = d._err_count || 0;
      d.err_rate = count > 0 ? (errCount / count) * 100 : 0;
    });

    timeSeriesData = sortedTimes.map(t => dataByTime[t]);

    if (timeSeriesData.length === 0) {
      throw new Error('No data returned from API');
    }
  } catch (error) {
    console.warn('이상 감지 API 실패 또는 데이터 비어있음. Mock 데이터를 생성합니다.', error);
    generateMockData();
  }

  detectAnomalies();
  updateDashboardUI();
  showLoading(false);
}

function dateToString(d) {
  const y = d.getFullYear();
  const m = String(d.getMonth() + 1).padStart(2, '0');
  const r = String(d.getDate()).padStart(2, '0');
  return `${y}-${m}-${r}`;
}

// 고성능 Mock 데이터 발전기
function generateMockData() {
  timeSeriesData = [];
  const daysCount = Math.round((dateRange.end - dateRange.start) / (1000 * 60 * 60 * 24)) + 1;
  const totalHours = daysCount * 24;

  const seedDate = new Date(dateRange.start);
  for (let i = 0; i < totalHours; i++) {
    const curr = new Date(seedDate.getTime() + i * 3600000);
    const dayOfWeek = curr.getDay();
    const hour = curr.getHours();
    
    // 비즈니스 성격별 트래픽 주기 모델 (낮시간 상승, 주말 감소)
    const isWeekend = (dayOfWeek === 0 || dayOfWeek === 6);
    const timeFactor = Math.sin(((hour - 6) / 24) * 2 * Math.PI) * 0.5 + 0.5; // peak at 18:00
    const weekFactor = isWeekend ? 0.6 : 1.0;
    
    // 기본값 설정
    let baseTps = (5 + timeFactor * 15) * weekFactor;
    let baseRt = 200 + (baseTps / 20) * 100 + Math.random() * 50; // TPS 증가 시 약간 상승
    let baseCpu = 15 + (baseTps / 20) * 35 + Math.random() * 8;
    let baseHeap = 40 + Math.sin(i / 100) * 20 + Math.random() * 5;
    let baseError = Math.random() < 0.05 ? Math.random() * 0.5 : Math.random() * 0.05;

    // 인위적 이상 구간(Spike Anomalies) 7군데 추가
    if (i === Math.round(totalHours * 0.15)) {
      // 1. 에러 폭증
      baseError = 15.4;
      baseRt = 850;
    } else if (i === Math.round(totalHours * 0.32)) {
      // 2. CPU 병목으로 인한 극단적 지연
      baseCpu = 94.2;
      baseRt = 4500;
      baseTps = 2.4;
    } else if (i === Math.round(totalHours * 0.48)) {
      // 3. 트래픽 폭주 (Surge)
      baseTps = 85.0;
      baseRt = 1200;
      baseCpu = 88.0;
    } else if (i === Math.round(totalHours * 0.65)) {
      // 4. 메모리 누수 임계치 돌파
      baseHeap = 96.5;
      baseCpu = 65.0;
      baseRt = 900;
    } else if (i === Math.round(totalHours * 0.78)) {
      // 5. DB 쿼리 대기 락 (TPS는 낮지만 응답이 매우 느림, CPU는 조용)
      baseRt = 8200;
      baseTps = 1.1;
      baseCpu = 8.5;
    } else if (i === Math.round(totalHours * 0.88)) {
      // 6. 일시적인 간헐적 타임아웃
      baseError = 8.7;
      baseRt = 2800;
    } else if (i === Math.round(totalHours * 0.94)) {
      // 7. CPU 튐현상 (TPS 정상)
      baseCpu = 98.0;
      baseRt = 1100;
    }

    const y = curr.getFullYear();
    const m = String(curr.getMonth() + 1).padStart(2, '0');
    const d = String(curr.getDate()).padStart(2, '0');
    const hh = String(hour).padStart(2, '0');

    timeSeriesData.push({
      time: `${y}-${m}-${d} ${hh}:00`,
      service_time: baseRt,
      service_rate: baseTps,
      err_rate: baseError,
      sys_cpu: baseCpu,
      heap_usage: baseHeap,
      service_count: baseTps * 3600
    });
  }
}

// 요일별/시간대별 계절성 통계 기반 이상 감지 알고리즘 (Seasonal Z-Score)
function detectAnomalies() {
  anomalyFlags = new Array(timeSeriesData.length).fill(false);
  anomalyList = [];

  if (timeSeriesData.length === 0) return;

  // 1. 요일x시간별 (168개 버킷) 통계 구하기
  const buckets = Array.from({ length: 7 }, () => Array.from({ length: 24 }, () => []));

  timeSeriesData.forEach(item => {
    // time format: "yyyy-MM-dd HH:00"
    const parsedDate = new Date(item.time.replace(/-/g, '/'));
    const day = parsedDate.getDay();
    const hr = parsedDate.getHours();
    const val = item[currentMetric];
    if (val !== undefined && val !== null) {
      buckets[day][hr].push(val);
    }
  });

  // 전체 데이터의 평균과 표준편차 계산 (버킷 표본 수 부족 시 폴백용)
  const allValues = timeSeriesData.map(item => item[currentMetric]).filter(v => v !== undefined && v !== null);
  const allMean = allValues.reduce((a, b) => a + b, 0) / allValues.length;
  const allVariance = allValues.reduce((a, b) => a + Math.pow(b - allMean, 2), 0) / allValues.length;
  const allStd = Math.sqrt(allVariance) || 1.0;

  // 각 버킷의 평균과 표준편차 계산
  const stats = Array.from({ length: 7 }, () => Array.from({ length: 24 }, () => ({ mean: 0, std: 0, useFallback: false })));

  for (let d = 0; d < 7; d++) {
    for (let h = 0; h < 24; h++) {
      const arr = buckets[d][h];
      // 버킷당 표본 수가 최소 10개 이상 쌓여있어야 계절성 탐지 적용, 그렇지 않으면 전체 데이터 통계를 활용
      if (arr.length >= 10) {
        const mean = arr.reduce((a, b) => a + b, 0) / arr.length;
        const variance = arr.reduce((a, b) => a + Math.pow(b - mean, 2), 0) / arr.length;
        const std = Math.sqrt(variance) || 1.0;
        stats[d][h] = { mean, std, useFallback: false };
      } else {
        stats[d][h] = { mean: allMean, std: allStd, useFallback: true };
      }
    }
  }

  // 2. 이상값 탐지 및 Z-Score 매핑
  timeSeriesData.forEach((item, index) => {
    const parsedDate = new Date(item.time.replace(/-/g, '/'));
    const day = parsedDate.getDay();
    const hr = parsedDate.getHours();
    const val = item[currentMetric];
    const { mean, std } = stats[day][hr];

    // Z-Score 계산
    const zScore = (val - mean) / std;

    // 감도 임계값 초과 시 이상치로 설정 (단, 값이 실제로 의미 있게 높은 구간이고 양수 방향인 경우만 필터링)
    let minThreshold = 0.0;
    if (currentMetric === 'service_time') minThreshold = 200; // 응답시간 200ms 이상 지연부터 이상 감지 시작
    else if (currentMetric === 'service_rate') minThreshold = 5; // TPS 5 이상
    else if (currentMetric === 'err_rate') minThreshold = 0.1; // 에러율 0.1% 이상

    if (zScore > sensitivity && val > minThreshold) {
      anomalyFlags[index] = true;

      // 원인 휴리스틱 진단 실행
      const diagnosis = diagnoseCause(item, mean);

      anomalyList.push({
        no: 0, // 렌더링 시 채움
        index: index,
        time: item.time,
        value: val,
        mean: mean,
        deviation: zScore,
        diagnosis: diagnosis,
        allMetrics: item
      });
    }
  });

  // 순번 정렬 (가장 최근 순 또는 날짜 순)
  anomalyList.forEach((anomaly, idx) => {
    anomaly.no = idx + 1;
  });
}

// 융합 원인 판단 휴리스틱 엔진
function diagnoseCause(item, baselineVal) {
  const lang = getLang();

  // 진단 문구 다국어 지원
  const causes = {
    error: {
      ko: 'CRITICAL: 에러율 폭증 감지. 서버 내부 예외(Exception) 코드 또는 DB 연동 유실 여부를 확인하십시오.',
      ja: 'CRITICAL: エラー率の急増を検出。サーバー内部の例外(Exception)コードまたはDB接続ロスを確認してください。',
      en: 'CRITICAL: Error rate spike detected. Check internal exceptions or database connection loss.'
    },
    cpuBottleneck: {
      ko: 'WARNING: 시스템 CPU 임계치 포화. 무한 루프, 스레드 병목 또는 대용량 백그라운드 배치 연산 여부를 확인하십시오.',
      ja: 'WARNING: システムCPU飽和状態。無限ループ、スレッドボトルネック、または大規模バックグラウンドバッチ処理を確認してください。',
      en: 'WARNING: CPU saturation detected. Check for infinite loops, thread bottlenecks, or bulk background batch operations.'
    },
    memoryLeak: {
      ko: 'WARNING: 힙 메모리 고부하 상태. 가비지 컬렉션(GC) 오버헤드 또는 메모리 누수(Memory Leak) 여부를 분석하십시오.',
      ja: 'WARNING: ヒープメモリ高負荷。ガビージコレクション(GC)オーバーヘッドまたはメモリリーク(Memory Leak)を分析してください。',
      en: 'WARNING: High heap memory footprint. Analyze Garbage Collection (GC) overhead or potential memory leaks.'
    },
    dbLock: {
      ko: 'WARNING: 애플리케이션 반응속도 극단적 하락. DB 커넥션 락(Lock) 또는 외부 연동 API 응답 타임아웃 지연을 확인하십시오.',
      ja: 'WARNING: アプリ応答が極端に低下。DB接続ロック(Lock)または外部連携API応答タイムアウト遅延を確認してください。',
      en: 'WARNING: App response time severely degraded. Check for Database Connection Lock or external API latency/timeouts.'
    },
    trafficSurge: {
      ko: 'NOTICE: 순간 트래픽(TPS) 급증으로 인한 일시적인 자원 경합 및 응답 속도 밀림 현상입니다.',
      ja: 'NOTICE: 瞬間トラフィック(TPS)急増による一時的なリソース競合および応答遅延現象です。',
      en: 'NOTICE: Temporary resource contention and latency due to a sudden traffic (TPS) spike.'
    }
  };

  const getCauseMsg = (key) => causes[key][lang] || causes[key]['ko'];

  // 1. 에러율이 5% 이상인 경우 에러 우선 진단
  if (item.err_rate > 5) {
    return getCauseMsg('error');
  }
  // 2. CPU 사용률이 매우 높은 경우
  if (item.sys_cpu > 80) {
    return getCauseMsg('cpuBottleneck');
  }
  // 3. 메모리 사용률이 매우 높은 경우
  if (item.heap_usage > 85) {
    return getCauseMsg('memoryLeak');
  }
  // 4. 응답시간이 비정상적으로 느린데 CPU는 정상인 경우 (DB 락이나 행 지연)
  if (currentMetric === 'service_time' && item.service_time > baselineVal * 2 && item.sys_cpu < 50) {
    return getCauseMsg('dbLock');
  }
  // 5. 트래픽 급증
  if (item.service_rate > 40) {
    return getCauseMsg('trafficSurge');
  }

  // 기본 문구
  const defaultDiag = {
    ko: 'NOTICE: 평소 프로파일 대비 성능 변화 감지. 리소스 분산 사용 현황을 확인하십시오.',
    ja: 'NOTICE: 通常プロファイルに対する性能変化を検出。リソース分散利用状況を確認してください。',
    en: 'NOTICE: Performance fluctuation detected. Monitor resource consumption trends.'
  };
  return defaultDiag[lang] || defaultDiag['ko'];
}

// UI 컴포넌트 데이터 갱신
function updateDashboardUI() {
  // 1. 요약 카드 업데이트
  totalDetectedValue.textContent = anomalyList.length;

  // 최다 발생 요일/시간 추출
  if (anomalyList.length > 0) {
    const daysName = {
      ko: ['일', '월', '화', '수', '목', '금', '토'],
      ja: ['日', '月', '火', '水', '木', '金', '土'],
      en: ['Sun', 'Mon', 'Tue', 'Wed', 'Thu', 'Fri', 'Sat']
    };
    const lang = getLang();

    const counts = {};
    anomalyList.forEach(an => {
      const parsedDate = new Date(an.time.replace(/-/g, '/'));
      const day = parsedDate.getDay();
      const hour = parsedDate.getHours();
      const key = `${day}-${hour}`;
      counts[key] = (counts[key] || 0) + 1;
    });

    let bestKey = '';
    let maxCount = 0;
    Object.keys(counts).forEach(k => {
      if (counts[k] > maxCount) {
        maxCount = counts[k];
        bestKey = k;
      }
    });

    const [bestDay, bestHour] = bestKey.split('-').map(Number);
    const dayStr = daysName[lang][bestDay];
    mostAffectedValue.textContent = `${dayStr} / ${bestHour}h (${maxCount}x)`;
  } else {
    mostAffectedValue.textContent = '-';
  }

  // 고에러율 감지 횟수 (에러율 > 3% 초과)
  const highErrCount = anomalyList.filter(an => an.allMetrics.err_rate > 3).length;
  highErrorCountValue.textContent = highErrCount;

  // 최대 피크 / 평균 값
  if (timeSeriesData.length > 0) {
    const values = timeSeriesData.map(item => item[currentMetric]);
    const maxVal = Math.max(...values);
    const avgVal = values.reduce((a, b) => a + b, 0) / values.length;
    const unit = currentMetric === 'service_time' ? 'ms' : (currentMetric === 'service_rate' ? 'TPS' : (currentMetric === 'err_rate' ? '%' : '%'));
    peakVsAvgValue.textContent = `${maxVal.toFixed(1)}${unit} / ${avgVal.toFixed(1)}${unit}`;
  } else {
    peakVsAvgValue.textContent = '0 / 0';
  }

  // 2. 테이블 바인딩
  anomalyEventTableBody.innerHTML = '';
  if (anomalyList.length === 0) {
    const tr = document.createElement('tr');
    tr.innerHTML = `<td colspan="7" class="no-data" style="text-align: center; padding: 2rem;">${t('heatmap.noData')}</td>`;
    anomalyEventTableBody.appendChild(tr);
  } else {
    // 내림차순(최근에 일어난 이상치부터 표시)
    const reversedList = [...anomalyList].reverse();
    reversedList.forEach(an => {
      const tr = document.createElement('tr');
      tr.className = 'anomaly-row';
      tr.style.cursor = 'pointer';

      // 날짜/시간 나누기
      const parts = an.time.split(' ');
      const date = parts[0];
      const time = parts[1] || '';

      const unit = currentMetric === 'service_time' ? 'ms' : (currentMetric === 'service_rate' ? 'TPS' : '%');

      tr.innerHTML = `
        <td>${an.no}</td>
        <td>${date}</td>
        <td><strong>${time}</strong></td>
        <td style="color: var(--danger-color); font-weight: 700;">${an.value.toFixed(1)} ${unit}</td>
        <td>${an.mean.toFixed(1)} ${unit}</td>
        <td><span class="anomaly-badge ${an.deviation > 3.0 ? 'critical' : 'warning'}">+${an.deviation.toFixed(1)} σ</span></td>
        <td><span class="diagnosis-text">${an.diagnosis}</span></td>
      `;

      tr.addEventListener('click', () => openSlidePanel(an));
      anomalyEventTableBody.appendChild(tr);
    });
  }

  // 3. 차트 렌더링
  renderChart();
}

// 차트 그리기
function renderChart() {
  const ctx = document.getElementById('anomalyChart').getContext('2d');
  if (anomalyChartInstance) {
    anomalyChartInstance.destroy();
  }

  const labels = timeSeriesData.map(item => item.time);
  const dataValues = timeSeriesData.map(item => item[currentMetric]);

  const unit = currentMetric === 'service_time' ? 'ms' : (currentMetric === 'service_rate' ? 'TPS' : '%');
  const metricLabel = t(`metric.${currentMetric === 'err_rate' ? 'err_rate' : currentMetric}`);

  anomalyChartInstance = new Chart(ctx, {
    type: 'line',
    data: {
      labels: labels,
      datasets: [
        {
          label: metricLabel,
          data: dataValues,
          borderColor: '#10b981',
          borderWidth: 1.5,
          pointRadius: (ctx) => {
            const idx = ctx.dataIndex;
            return anomalyFlags[idx] ? 6 : 0; // 이상 포인트만 도드라지게 크게 표시
          },
          pointHoverRadius: 8,
          pointBackgroundColor: (ctx) => {
            const idx = ctx.dataIndex;
            return anomalyFlags[idx] ? '#ef4444' : '#10b981';
          },
          pointBorderColor: '#ffffff',
          pointBorderWidth: 1.5,
          tension: 0.15,
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
          display: false
        },
        tooltip: {
          callbacks: {
            label: function (context) {
              const idx = context.dataIndex;
              let label = `${context.dataset.label}: ${context.raw.toFixed(1)} ${unit}`;
              if (anomalyFlags[idx]) {
                label += ` [ANOMALY DETECTED]`;
              }
              return label;
            }
          }
        }
      },
      scales: {
        x: {
          grid: {
            color: 'rgba(0, 0, 0, 0.03)'
          },
          ticks: {
            maxTicksLimit: 12
          }
        },
        y: {
          grid: {
            color: 'rgba(0, 0, 0, 0.05)'
          },
          ticks: {
            callback: function (value) {
              return value + ' ' + unit;
            }
          }
        }
      },
      onClick: (e, elements) => {
        if (elements.length > 0) {
          const index = elements[0].index;
          if (anomalyFlags[index]) {
            // 해당 이상 항목 찾기
            const an = anomalyList.find(x => x.index === index);
            if (an) openSlidePanel(an);
          }
        }
      }
    }
  });
}

// 상세 패널 열기
function openSlidePanel(anomaly) {
  const parts = anomaly.time.split(' ');
  detailDate.textContent = parts[0];
  detailTime.textContent = parts[1] || '';

  const unit = currentMetric === 'service_time' ? 'ms' : (currentMetric === 'service_rate' ? 'TPS' : '%');
  detailMetricVal.textContent = `${anomaly.value.toFixed(1)} ${unit} (Baseline: ${anomaly.mean.toFixed(1)} ${unit})`;
  detailDiagnosis.textContent = anomaly.diagnosis;

  // 상세 지표별 막대 렌더링
  const metrics = [
    { key: 'service_time', title: t('metric.service_time'), unit: 'ms', color: '#3b82f6', max: 5000 },
    { key: 'service_rate', title: t('metric.service_rate'), unit: 'TPS', color: '#10b981', max: 100 },
    { key: 'err_rate', title: t('metric.err_rate'), unit: '%', color: '#ef4444', max: 20 },
    { key: 'sys_cpu', title: t('metric.sys_cpu'), unit: '%', color: '#facc15', max: 100 },
    { key: 'heap_usage', title: t('metric.heap_usage'), unit: '%', color: '#8b5cf6', max: 100 }
  ];

  detailMetricsValues.innerHTML = '';
  metrics.forEach(m => {
    const rawVal = anomaly.allMetrics[m.key] || 0;
    const percent = Math.min(100, (rawVal / m.max) * 100);

    const metricRow = document.createElement('div');
    metricRow.style.marginBottom = '1.25rem';
    metricRow.innerHTML = `
      <div style="display: flex; justify-content: space-between; font-size: 0.8rem; margin-bottom: 0.25rem;">
        <span style="color: var(--text-secondary); font-weight: 500;">${m.title}</span>
        <span style="font-weight: 700; color: var(--text-primary);">${rawVal.toFixed(1)} ${m.unit}</span>
      </div>
      <div style="width: 100%; height: 8px; background: var(--border-color); border-radius: 4px; overflow: hidden;">
        <div style="width: ${percent}%; height: 100%; background: ${m.color}; border-radius: 4px;"></div>
      </div>
    `;
    detailMetricsValues.appendChild(metricRow);
  });

  // 패널 활성화
  detailSlidePanel.classList.add('open');
  panelBackdrop.classList.remove('hidden');
}

// 상세 패널 닫기
function closeSlidePanel() {
  detailSlidePanel.classList.remove('open');
  panelBackdrop.classList.add('hidden');
}

// 로딩 표시
function showLoading(show) {
  if (show) {
    loadingOverlay.classList.remove('hidden');
  } else {
    loadingOverlay.classList.add('hidden');
  }
}

// 설정 에러 UI 표시
function showConfigError(msg) {
  console.error(msg);
  alert(msg);
}
