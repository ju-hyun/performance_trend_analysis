import { t, getLang, setLang } from './i18n.js';

// 전역 설정 및 API 엔드포인트 정의
const API_BASE = window.PTA_CONFIG?.API_DOMAIN || '/api';
const TOKEN = window.PTA_CONFIG?.TOKEN || '';
const DOMAIN_API_BASE = `${API_BASE}/domain`;
const INSTANCE_API_BASE = `${API_BASE}/instance`;
const BUSINESS_API_BASE = `${API_BASE}/business`;

// 상태 변수
let domainTree = [];
let currentSelectedPath = [];
let dateRange = { start: null, end: null };
let fpInstance = null;
let trendChart = null;
let copyTimeout = null;

// DOM 요소 캐시
const langSelect = document.getElementById('langSelect');
const typeInstance = document.getElementById('typeInstance');
const typeBusiness = document.getElementById('typeBusiness');
const instanceFilterArea = document.getElementById('instanceFilterArea');
const businessFilterArea = document.getElementById('businessFilterArea');
const instanceSelect = document.getElementById('instanceSelect');
const businessSelect = document.getElementById('businessSelect');
const dateRangePicker = document.getElementById('dateRangePicker');
const loadingOverlay = document.getElementById('loadingOverlay');

const btnExportPdf = document.getElementById('btnExportPdf');
const btnExportImg = document.getElementById('btnExportImg');
const btnCopyOpinion = document.getElementById('btnCopyOpinion');
const copyTooltip = document.getElementById('copyTooltip');

// 리포트 UI 요소 캐시
const reportTargetLabel = document.getElementById('reportTargetLabel');
const reportRange = document.getElementById('reportRange');
const reportGeneratedTime = document.getElementById('reportGeneratedTime');
const gradeBadge = document.getElementById('gradeBadge');
const gradeScoreText = document.getElementById('gradeScoreText');
const opinionComment = document.getElementById('opinionComment');

const valTotalHits = document.getElementById('valTotalHits');
const valAvgTps = document.getElementById('valAvgTps');
const valResponseTime = document.getElementById('valResponseTime');
const valErrorRate = document.getElementById('valErrorRate');
const valCpuUsage = document.getElementById('valCpuUsage');
const valHeapUsage = document.getElementById('valHeapUsage');
const boxCpuUsage = document.getElementById('boxCpuUsage');
const boxHeapUsage = document.getElementById('boxHeapUsage');
const reportAnomalyTableBody = document.getElementById('reportAnomalyTableBody');

// 초기화
document.addEventListener('DOMContentLoaded', async () => {
  // 1. 다국어 설정
  const currentLang = getLang();
  langSelect.value = currentLang;
  applyTranslations();

  langSelect.addEventListener('change', (e) => {
    setLang(e.target.value);
    applyTranslations();
    renderHierarchicalSelector();
    if (currentSelectedPath.length > 0) {
      loadData();
    }
  });

  // 2. 인스턴스/비즈니스 토글 설정
  typeInstance.addEventListener('change', handleTargetTypeChange);
  typeBusiness.addEventListener('change', handleTargetTypeChange);
  instanceSelect.addEventListener('change', loadData);
  businessSelect.addEventListener('change', loadData);

  // 3. 날짜 설정 (최근 7일 기본값)
  const defaultEnd = new Date();
  const defaultStart = new Date();
  defaultStart.setDate(defaultEnd.getDate() - 7);
  dateRange = { start: defaultStart, end: defaultEnd };

  fpInstance = flatpickr(dateRangePicker, {
    mode: 'range',
    dateFormat: 'Y-m-d',
    defaultDate: [defaultStart, defaultEnd],
    onClose: (selectedDates) => {
      if (selectedDates.length === 2) {
        dateRange.start = selectedDates[0];
        dateRange.end = selectedDates[1];
        loadData();
      }
    }
  });

  // 4. 내보내기 액션 연동
  btnExportPdf.addEventListener('click', () => {
    window.print();
  });

  btnExportImg.addEventListener('click', exportToImage);

  // 4.5. 소견 복사 액션 연동
  if (btnCopyOpinion) {
    btnCopyOpinion.addEventListener('click', () => {
      const textToCopy = opinionComment.textContent || '';
      navigator.clipboard.writeText(textToCopy).then(() => {
        const tooltipContainer = btnCopyOpinion.closest('.js-tooltip-container');
        if (tooltipContainer) {
          tooltipContainer.classList.add('tooltip-active');
        }
        if (copyTooltip) {
          copyTooltip.textContent = t('copied');
        }
        btnCopyOpinion.innerHTML = `
          <svg width="18" height="18" viewBox="0 0 24 24" xmlns="http://www.w3.org/2000/svg" class="js-icon">
            <path fill="currentColor" fill-rule="evenodd" clip-rule="evenodd" d="M9 16.17L4.83 12l-1.42 1.41L9 19 21 7l-1.41-1.41L9 16.17z"></path>
          </svg>
        `;

        if (copyTimeout) {
          clearTimeout(copyTimeout);
        }

        copyTimeout = setTimeout(() => {
          if (tooltipContainer) {
            tooltipContainer.classList.remove('tooltip-active');
          }
          if (copyTooltip) {
            copyTooltip.textContent = t('copy');
          }
          btnCopyOpinion.innerHTML = `
            <svg width="18" height="18" viewBox="0 0 24 24" xmlns="http://www.w3.org/2000/svg" class="js-icon">
              <path fill="currentColor" d="M4 1H16V3H4V17H2V3C2 1.9 2.9 1 4 1Z"></path>
              <path fill="currentColor" fill-rule="evenodd" clip-rule="evenodd" d="M8 5H19C20.1 5 21 5.85 21 6.88889V20.1111C21 21.15 20.1 22 19 22H8C6.9 22 6 21.15 6 20.1111V6.88889C6 5.85 6.9 5 8 5ZM19 20H8V7H19V20Z"></path>
            </svg>
          `;
          copyTimeout = null;
        }, 3000);
      }).catch(err => {
        console.error('Failed to copy: ', err);
      });
    });
  }

  // 5. 초기 도메인 리스크 로드
  showLoading(true);
  await loadDomains();
});

// 대상 토글 변경 처리
function handleTargetTypeChange() {
  const selectedType = document.querySelector('input[name="targetType"]:checked').value;
  if (selectedType === 'instance') {
    instanceFilterArea.classList.remove('hidden');
    businessFilterArea.classList.add('hidden');
    boxCpuUsage.classList.remove('hidden');
    boxHeapUsage.classList.remove('hidden');
    const lastItem = currentSelectedPath[currentSelectedPath.length - 1];
    if (lastItem && lastItem.type === 'domain') {
      loadInstances(lastItem.id);
    }
  } else {
    instanceFilterArea.classList.add('hidden');
    businessFilterArea.classList.remove('hidden');
    boxCpuUsage.classList.add('hidden');
    boxHeapUsage.classList.add('hidden');
    const lastItem = currentSelectedPath[currentSelectedPath.length - 1];
    if (lastItem && lastItem.type === 'domain') {
      loadBusinesses(lastItem.id);
    }
  }
}

// 다국어 텍스트 적용
function applyTranslations() {
  document.querySelectorAll('[data-i18n]').forEach(el => {
    const key = el.getAttribute('data-i18n');
    el.textContent = t(key);
  });
}

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
    console.error('비즈니스 목록 로드 실패.', error);
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

// 날짜 파라미터 포맷팅
function formatDateParam(date, isEnd = false) {
  const y = date.getFullYear();
  const m = String(date.getMonth() + 1).padStart(2, '0');
  const d = String(date.getDate()).padStart(2, '0');
  const h = isEnd ? '24' : '00';
  return `${y}${m}${d}${h}`;
}

// 메트릭 API 개별 조회
async function fetchMetricData(domainId, targetId, targetType, startTime, endTime, intervalMinute, metrics) {
  if (!domainId) return [];

  let endpoint;
  if (!targetId) {
    endpoint = `${API_BASE}/dbmetrics/domain`;
  } else {
    endpoint = targetType === 'instance' ? `${API_BASE}/dbmetrics/instance` : `${API_BASE}/dbmetrics/business`;
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

// 메인 데이터 로드 및 분석 수행
async function loadData() {
  showLoading(true);
  const domainId = currentSelectedPath[currentSelectedPath.length - 1]?.id;
  const targetType = document.querySelector('input[name="targetType"]:checked')?.value || 'instance';
  const instanceId = instanceSelect.value;
  const businessId = businessSelect.value;
  const targetId = targetType === 'instance' ? instanceId : businessId;

  if (!domainId) {
    showLoading(false);
    return;
  }

  // 1. 헤더 메타데이터 표시 설정
  const domainName = currentSelectedPath.map(p => p.name).join(' > ');
  let targetName = t('select.allInstances');
  if (targetType === 'instance' && instanceId) {
    const opt = instanceSelect.querySelector(`option[value="${instanceId}"]`);
    targetName = opt ? opt.textContent : instanceId;
  } else if (targetType === 'business') {
    if (businessId) {
      const opt = businessSelect.querySelector(`option[value="${businessId}"]`);
      targetName = opt ? opt.textContent : businessId;
    } else {
      targetName = t('select.allBusinesses');
    }
  }
  reportTargetLabel.textContent = `${domainName} [${targetType === 'instance' ? t('target.instance') : t('target.business')}: ${targetName}]`;

  const startFmt = dateRange.start.toLocaleDateString();
  const endFmt = dateRange.end.toLocaleDateString();
  reportRange.textContent = `${startFmt} ~ ${endFmt}`;
  reportGeneratedTime.textContent = `${t('stats.generated') || 'Generated'}: ${new Date().toLocaleString()}`;

  const startTimeStr = formatDateParam(dateRange.start, false);
  const endTimeStr = formatDateParam(dateRange.end, true);

  // 2. 메트릭 데이터 병렬 조회
  try {
    const metricsToFetch = ['service_time', 'service_rate', 'service_count', 'service_err_count'];
    if (targetType === 'instance') {
      metricsToFetch.push('sys_cpu', 'heap_usage');
    }

    const fetches = metricsToFetch.map(metric =>
      fetchMetricData(domainId, targetId, targetType, startTimeStr, endTimeStr, 60, metric)
        .catch(err => {
          console.error(`Metric ${metric} load failed.`, err);
          return [];
        })
    );

    const results = await Promise.all(fetches);
    const metricData = {};
    metricsToFetch.forEach((m, idx) => {
      metricData[m] = results[idx] || [];
    });

    // 3. 통계 요약 계산
    processMetricsSummary(metricData, targetType);

  } catch (error) {
    console.error('리포트 데이터 취합 실패.', error);
    alert('데이터 조회 중 오류가 발생했습니다: ' + error.message);
  }
  showLoading(false);
}

// 메트릭 데이터를 계산하고 등급 및 의견 도출
function processMetricsSummary(data, targetType) {
  // 공통 헬퍼: 평균, 최대값 계산
  const getStats = (arr) => {
    if (!arr || arr.length === 0) return { avg: 0, max: 0, raw: [] };
    const values = arr.map(item => item.value || 0);
    const sum = values.reduce((s, v) => s + v, 0);
    return {
      avg: sum / values.length,
      max: Math.max(...values),
      raw: arr
    };
  };

  const rtStats = getStats(data.service_time);
  const tpsStats = getStats(data.service_rate);
  const hitsStats = getStats(data.service_count);
  const errStats = getStats(data.service_err_count);

  let cpuStats = { avg: 0, max: 0, raw: [] };
  let heapStats = { avg: 0, max: 0, raw: [] };

  if (targetType === 'instance') {
    cpuStats = getStats(data.sys_cpu);
    heapStats = getStats(data.heap_usage);
  }

  // 총 호출 수 합산
  const totalHitsVal = data.service_count ? data.service_count.reduce((sum, item) => sum + (item.value || 0), 0) : 0;
  // 전체 평균 에러율 산출 (에러 건수 합 / 전체 호출 수 * 100)
  const totalErrVal = data.service_err_count ? data.service_err_count.reduce((sum, item) => sum + (item.value || 0), 0) : 0;
  const avgErrorRateVal = totalHitsVal > 0 ? (totalErrVal / totalHitsVal) * 100 : 0;

  // 에러율 배열 생성 (시계열 매핑용)
  const errorRateTimeseries = [];
  if (data.service_count && data.service_count.length > 0) {
    data.service_count.forEach(c => {
      const e = data.service_err_count.find(item => item.time === c.time);
      const errCount = e ? (e.value || 0) : 0;
      const hitsCount = c.value || 0;
      const rate = hitsCount > 0 ? (errCount / hitsCount) * 100 : 0;
      errorRateTimeseries.push({ time: c.time, value: rate });
    });
  }
  const maxErrorRateVal = errorRateTimeseries.length > 0 ? Math.max(...errorRateTimeseries.map(i => i.value)) : 0;

  // 요약 그리드 렌더링
  valTotalHits.textContent = totalHitsVal.toLocaleString();
  valAvgTps.textContent = tpsStats.avg.toFixed(2);
  valResponseTime.textContent = `${rtStats.avg.toFixed(1)} / ${rtStats.max.toFixed(0)}`;
  valErrorRate.textContent = `${avgErrorRateVal.toFixed(2)}% / ${maxErrorRateVal.toFixed(2)}%`;

  if (targetType === 'instance') {
    valCpuUsage.textContent = `${cpuStats.avg.toFixed(1)}% / ${cpuStats.max.toFixed(1)}%`;
    valHeapUsage.textContent = `${heapStats.avg.toFixed(1)}% / ${heapStats.max.toFixed(1)}%`;
  }

  // 4. 등급 판정 알고리즘 (Score Calculation)
  let score = 100;

  // 에러율 감점
  score -= (avgErrorRateVal * 15); // 에러율 1%당 -15점
  if (maxErrorRateVal >= 5.0) score -= 10;
  if (maxErrorRateVal >= 15.0) score -= 15;

  // 응답시간 감점
  if (rtStats.avg > 500) score -= 5;
  if (rtStats.avg > 1000) score -= 15;
  if (rtStats.avg > 2500) score -= 20;
  if (rtStats.max > 8000) score -= 5;

  // 리소스 부하 감점 (인스턴스 모드 전용)
  let cpuSpikeCount = 0;
  if (targetType === 'instance' && data.sys_cpu) {
    cpuSpikeCount = data.sys_cpu.filter(item => (item.value || 0) >= 85).length;
    score -= Math.min(20, cpuSpikeCount * 3); // 85% 이상 1회당 -3점 (최대 -20점)

    const maxCpu = cpuStats.max;
    if (maxCpu >= 95) score -= 5;

    const maxHeap = heapStats.max;
    if (maxHeap >= 90) score -= 5;
  }

  score = Math.max(0, Math.min(100, score));

  // 등급 결정
  let grade = 'S';
  let gradeClass = 'grade-s';
  if (score >= 95) {
    grade = 'S';
    gradeClass = 'grade-s';
  } else if (score >= 85) {
    grade = 'A';
    gradeClass = 'grade-a';
  } else if (score >= 70) {
    grade = 'B';
    gradeClass = 'grade-b';
  } else if (score >= 55) {
    grade = 'C';
    gradeClass = 'grade-c';
  } else if (score >= 40) {
    grade = 'D';
    gradeClass = 'grade-d';
  } else {
    grade = 'F';
    gradeClass = 'grade-f';
  }

  gradeBadge.className = `grade-badge-emblem ${gradeClass}`;
  gradeBadge.textContent = grade;
  gradeScoreText.textContent = `${score.toFixed(0)} / 100 Points`;

  // 5. 시계열 차트 렌더링
  renderTrendChart(data.service_time, data.service_rate, errorRateTimeseries);

  // 6. 통계 기반 이상 징후 분석 및 이력 매핑
  const anomalies = detectAnomaliesInPeriod(data, errorRateTimeseries, targetType);
  renderAnomaliesTable(anomalies);

  // 7. 경영 소견 자동 생성
  generateExecutiveOpinion(grade, score, totalHitsVal, rtStats, avgErrorRateVal, maxErrorRateVal, cpuStats, heapStats, targetType, anomalies.length, cpuSpikeCount);
}

// Z-Score 기반의 간이 이상 탐지
function detectAnomaliesInPeriod(data, errorRateTs, targetType) {
  const anomalies = [];
  const getZScores = (arr) => {
    if (!arr || arr.length < 3) return []; // 최소 표본 제한 완화
    const values = arr.map(i => i.value || 0);
    const mean = values.reduce((s, v) => s + v, 0) / values.length;
    const variance = values.reduce((s, v) => s + Math.pow(v - mean, 2), 0) / values.length;
    const stdDev = Math.sqrt(variance);
    if (stdDev === 0) return [];
    return arr.map(item => ({
      time: item.time,
      value: item.value,
      z: (item.value - mean) / stdDev
    }));
  };

  const rtZs = getZScores(data.service_time);
  const errZs = getZScores(errorRateTs);
  let cpuZs = [];
  if (targetType === 'instance') {
    cpuZs = getZScores(data.sys_cpu);
  }

  // Z-Score > 2.0 이상인 포인트 수집 (상위 2.3% 영역 탐색으로 변경)
  const limit = 2.0;

  rtZs.forEach(item => {
    if (item.z > limit && item.value > 200) { // 최소 기준 완화: 200ms
      anomalies.push({
        time: item.time,
        metric: 'service_time',
        value: item.value,
        z: item.z,
        diagnosis: t('anomaly.diagRt') || '일시적 응답 지연 (API/DB 병목 의심)'
      });
    }
  });

  errZs.forEach(item => {
    if (item.z > limit && item.value > 0.1) { // 최소 기준 완화: 0.1%
      anomalies.push({
        time: item.time,
        metric: 'error_rate',
        value: item.value,
        z: item.z,
        diagnosis: t('anomaly.diagErr') || '애플리케이션 에러 급증 (서버 예외 확인 요망)'
      });
    }
  });

  cpuZs.forEach(item => {
    if (item.z > limit && item.value > 60) { // 최소 기준 완화: 60%
      anomalies.push({
        time: item.time,
        metric: 'sys_cpu',
        value: item.value,
        z: item.z,
        diagnosis: t('anomaly.diagCpu') || '시스템 자원 임계치 도달 (자원 경합)'
      });
    }
  });

  // 시간순 정렬 및 개수 제한 (최대 10개만 리포트에 수록)
  anomalies.sort((a, b) => b.time - a.time);
  return anomalies.slice(0, 10);
}

// 이상 감지 리포트 이력 테이블 렌더링
function renderAnomaliesTable(anomalies) {
  reportAnomalyTableBody.innerHTML = '';

  if (anomalies.length === 0) {
    reportAnomalyTableBody.innerHTML = `
      <tr>
        <td colspan="5" style="text-align: center; padding: 2rem; color: var(--text-secondary);" data-i18n="report.noAnomalyText">
          ${t('report.noAnomalyText')}
        </td>
      </tr>
    `;
    return;
  }

  anomalies.forEach(item => {
    const tr = document.createElement('tr');
    
    // 시간 변환 yyyyMMddHH -> yyyy-MM-dd HH:00
    const str = String(item.time);
    const dateStr = `${str.substring(0, 4)}-${str.substring(4, 6)}-${str.substring(6, 8)}`;
    const timeStr = `${str.substring(8, 10)}:00`;

    let metricUnit = 'ms';
    if (item.metric === 'error_rate') metricUnit = '%';
    else if (item.metric === 'sys_cpu') metricUnit = '%';

    tr.innerHTML = `
      <td style="padding: 8px; border-bottom: 1px solid var(--border-color); color: var(--text-primary); font-size: 0.8rem;">${dateStr}</td>
      <td style="padding: 8px; border-bottom: 1px solid var(--border-color); color: var(--text-primary); font-size: 0.8rem;">${timeStr}</td>
      <td style="padding: 8px; border-bottom: 1px solid var(--border-color); color: var(--text-primary); font-weight: 600; font-size: 0.8rem;">${item.value.toFixed(1)}${metricUnit}</td>
      <td style="padding: 8px; border-bottom: 1px solid var(--border-color); color: #ef4444; font-size: 0.8rem;">+${item.z.toFixed(1)} σ</td>
      <td style="padding: 8px; border-bottom: 1px solid var(--border-color); color: var(--text-secondary); font-size: 0.8rem;">${item.diagnosis}</td>
    `;
    reportAnomalyTableBody.appendChild(tr);
  });
}

// 경영진용 보고 의견 자동 작성 (휴리스틱 문장 렌더링)
function generateExecutiveOpinion(grade, score, hits, rt, avgErr, maxErr, cpu, heap, targetType, anomalyCount, cpuSpike) {
  const lang = getLang();

  let comments = '';

  if (lang === 'ko') {
    comments += `본 보고서는 선택된 기간 동안 수집된 성능 메트릭 데이터를 종합 분석한 결과입니다. 전체 성능 평가 점수는 ${score.toFixed(0)}점으로, 종합 평가 등급은 [${grade}]입니다.\n\n`;
    comments += `• 처리량 분석: 총 ${hits.toLocaleString()}건의 사용자 요청을 안정적으로 소화했으며, 평균 TPS는 ${valAvgTps.textContent}입니다.\n`;
    comments += `• 응답속도 분석: 평균 응답 속도는 ${rt.avg.toFixed(1)}ms이며, 최대 피크 시간대 지연은 ${rt.max.toFixed(0)}ms를 기록했습니다.\n`;

    if (avgErr > 0.05) {
      comments += `⚠️ 경고: 해당 분석 기간의 평균 에러율은 ${avgErr.toFixed(2)}%로 관찰되었으며, 최대 피크 에러율이 ${maxErr.toFixed(2)}%까지 도달한 이력이 있습니다. 이는 어플리케이션 내 비정상 예외 상황이나 데이터베이스 접속 지연으로 인한 타임아웃 오류가 의심되므로 관련 예외 로그 검토가 적극적으로 권장됩니다.\n`;
    } else {
      comments += `• 서비스 에러: 평균 에러율 ${avgErr.toFixed(2)}%로 안정적인 트랜잭션 성공률을 기록했습니다.\n`;
    }

    if (targetType === 'instance') {
      comments += `• 리소스 분석: 시스템 평균 CPU 사용률은 ${cpu.avg.toFixed(1)}%로 안정적이나, ${cpuSpike}회에 걸쳐 CPU가 85% 임계치를 넘는 과부하 스파이크가 탐지되었습니다. 힙 메모리 평균 사용률은 ${heap.avg.toFixed(1)}% (최대 ${heap.max.toFixed(1)}%)로 유지되고 있습니다.\n`;
    }

    if (anomalyCount > 0) {
      comments += `• 특이사항: 통계적 Z-Score 분석 기준을 충족하는 이상 징후 포인트가 총 ${anomalyCount}회 발생했습니다. 주로 응답 시간 지연 및 리소스 충돌 시점과 일치하므로 하단 상세 감지 이력을 참조하여 예방적 점검을 권장합니다.`;
    } else {
      comments += `• 특이사항: 통계적 이상 수치가 검출되지 않아 전체 시스템 가용성 및 성능 관리가 매우 우수하게 진행되고 있는 것으로 판단됩니다.`;
    }

  } else if (lang === 'ja') {
    comments += `本レポートは、選択期間中に収集されたシステム性能メトリクスデータを総合的に分析した結果です。総合性能スコアは${score.toFixed(0)}点、総合評価ランクは【${grade}】です。\n\n`;
    comments += `・スループット：総ユーザーリクエスト数 ${hits.toLocaleString()}件を処理し、平均TPSは${valAvgTps.textContent}でした。\n`;
    comments += `・応答時間：平均応答時間は${rt.avg.toFixed(1)}ms、ピーク時の最大遅延は${rt.max.toFixed(0)}msを記録しました。\n`;

    if (avgErr > 0.05) {
      comments += `⚠️ 警告：平均エラー率が${avgErr.toFixed(2)}%に達しており、瞬間ピークエラー率が${maxErr.toFixed(2)}%まで上昇した履歴があります。アプリケーションの例外発生またはデータベース接続タイムアウト等のトラブルが発生した可能性が高いため、エラーログの精査を推奨します。\n`;
    } else {
      comments += `・エラー発生状況：平均エラー率は${avgErr.toFixed(2)}%と低く、安定したトランザクション処理が行われています。\n`;
    }

    if (targetType === 'instance') {
      comments += `・リソース使用率：システム平均CPU使用率は${cpu.avg.toFixed(1)}%と安定していますが、${cpuSpike}回の一時的なCPU過負荷（85%以上）スパイクが検出されました。ヒープメモリ使用率は平均${heap.avg.toFixed(1)}%（最大${heap.max.toFixed(1)}%）で適正に管理されています。\n`;
    }

    if (anomalyCount > 0) {
      comments += `・特異事項：統計的Z-Score基準を超えるパフォーマンス異常が合計${anomalyCount}回発生しました。該当時間帯の応答遅延やリソース負荷状況を併せてご確認の上、予防措置の実施を推奨します。`;
    } else {
      comments += `・特異事項：統計的異常値は検出されず、全体的なシステム可用性および品質は極めて良好に維持されています。`;
    }

  } else {
    // English (default fallback)
    comments += `This report presents a comprehensive analysis of the performance metric data collected during the selected timeframe. The overall score is ${score.toFixed(0)}/100, leading to a performance grade of [${grade}].\n\n`;
    comments += `• Throughput: Handled ${hits.toLocaleString()} requests with an average TPS of ${valAvgTps.textContent}.\n`;
    comments += `• Latency: Avg response time was ${rt.avg.toFixed(1)}ms, with a maximum peak latency of ${rt.max.toFixed(0)}ms.\n`;

    if (avgErr > 0.05) {
      comments += `⚠️ Warning: The average error rate was ${avgErr.toFixed(2)}% during this period, with a maximum error spike of ${maxErr.toFixed(2)}%. This suggests potential server exceptions or DB lock-induced timeouts. Examining server log files is highly recommended.\n`;
    } else {
      comments += `• Errors: Kept average error rate at ${avgErr.toFixed(2)}%, proving robust application logic and transaction success.\n`;
    }

    if (targetType === 'instance') {
      comments += `• Resources: Avg System CPU was ${cpu.avg.toFixed(1)}%. Detected ${cpuSpike} transient spikes above 85%. Avg Heap Usage was ${heap.avg.toFixed(1)}% (Peak ${heap.max.toFixed(1)}%).\n`;
    }

    if (anomalyCount > 0) {
      comments += `• Anomalies: Detected ${anomalyCount} statistics-based anomaly occurrences using Z-Score threshold. Check the table details below for remediation.`;
    } else {
      comments += `• Anomalies: No statistical performance anomalies detected. System availability and operational control remain excellent.`;
    }
  }

  opinionComment.textContent = comments;
}

// Chart.js 시계열 추이 차트 렌더링
function renderTrendChart(rtData, tpsData, errData) {
  const ctx = document.getElementById('reportTrendChart').getContext('2d');
  
  if (trendChart) {
    trendChart.destroy();
  }

  // 시간 순 정렬
  const sortData = (arr) => arr ? [...arr].sort((a, b) => a.time - b.time) : [];

  const sortedRt = sortData(rtData);
  const sortedTps = sortData(tpsData);
  const sortedErr = sortData(errData);

  const labels = sortedRt.map(item => {
    const s = String(item.time);
    return `${s.substring(4,6)}/${s.substring(6,8)} ${s.substring(8,10)}h`;
  });

  const rtValues = sortedRt.map(item => item.value || 0);
  const tpsValues = sortedTps.map(item => item.value || 0);
  const errValues = sortedErr.map(item => item.value || 0);

  // 다국어 라벨 매핑
  const tpsLabel = t('metric.service_rate') || 'TPS';
  const rtLabel = t('metric.service_time') || '응답시간(ms)';
  const errLabel = t('metric.err_rate') || '에러율(%)';

  trendChart = new Chart(ctx, {
    type: 'line',
    data: {
      labels: labels,
      datasets: [
        {
          label: rtLabel,
          data: rtValues,
          borderColor: '#3b82f6',
          backgroundColor: 'rgba(59, 130, 246, 0.05)',
          borderWidth: 2,
          yAxisID: 'yRt',
          tension: 0.3,
          pointRadius: 2,
          fill: true
        },
        {
          label: tpsLabel,
          data: tpsValues,
          borderColor: '#10b981',
          backgroundColor: 'transparent',
          borderWidth: 2,
          yAxisID: 'yTps',
          tension: 0.3,
          pointRadius: 2
        },
        {
          label: errLabel,
          data: errValues,
          borderColor: '#ef4444',
          backgroundColor: 'transparent',
          borderWidth: 1.5,
          borderDash: [4, 4],
          yAxisID: 'yErr',
          tension: 0.2,
          pointRadius: 1
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
            color: '#94a3b8',
            font: { size: 10, family: 'Pretendard' }
          }
        }
      },
      scales: {
        x: {
          grid: { color: 'rgba(255, 255, 255, 0.05)' },
          ticks: {
            color: '#94a3b8',
            font: { size: 9 },
            maxRotation: 45,
            autoSkip: true,
            maxTicksLimit: 12
          }
        },
        yRt: {
          type: 'linear',
          display: true,
          position: 'left',
          title: { display: true, text: 'ms', color: '#3b82f6', font: { size: 10 } },
          grid: { color: 'rgba(255, 255, 255, 0.05)' },
          ticks: { color: '#94a3b8', font: { size: 9 } }
        },
        yTps: {
          type: 'linear',
          display: true,
          position: 'right',
          title: { display: true, text: 'TPS', color: '#10b981', font: { size: 10 } },
          grid: { drawOnChartArea: false },
          ticks: { color: '#94a3b8', font: { size: 9 } }
        },
        yErr: {
          type: 'linear',
          display: true,
          position: 'right',
          title: { display: true, text: '%', color: '#ef4444', font: { size: 10 } },
          grid: { drawOnChartArea: false },
          ticks: { color: '#94a3b8', font: { size: 9 } },
          min: 0,
          max: 100
        }
      }
    }
  });
}

// html2canvas를 활용한 PNG 이미지 캡처/다운로드
async function exportToImage() {
  showLoading(true);
  const element = document.getElementById('reportPrintArea');
  
  // 캡처 전에 일시적으로 테마 스타일 및 섀도우를 캡처용으로 최적화
  const originalBackground = element.style.background;
  const originalBorder = element.style.border;
  const isDark = window.matchMedia && window.matchMedia('(prefers-color-scheme: dark)').matches;

  // html2canvas 설정 (더 고해상도로 캡처하기 위해 scale 지정)
  try {
    const canvas = await html2canvas(element, {
      scale: 2,
      useCORS: true,
      backgroundColor: isDark ? '#0f172a' : '#ffffff',
      logging: false
    });

    const link = document.createElement('a');
    const startStr = formatDateParam(dateRange.start, false).substring(0, 8);
    const endStr = formatDateParam(dateRange.end, true).substring(0, 8);
    link.download = `Executive_Performance_Report_${startStr}_${endStr}.png`;
    link.href = canvas.toDataURL('image/png');
    link.click();
  } catch (error) {
    console.error('이미지 저장 중 오류 발생.', error);
    alert('이미지 내보내기 중 오류가 발생했습니다: ' + error.message);
  }
  showLoading(false);
}

// 로딩 인디케이터
function showLoading(show) {
  if (show) {
    loadingOverlay.classList.remove('hidden');
  } else {
    loadingOverlay.classList.add('hidden');
  }
}

// 에러 알림
function showConfigError(msg, title = 'Error') {
  console.error(title, msg);
  alert(`${title}: ${msg}`);
}
