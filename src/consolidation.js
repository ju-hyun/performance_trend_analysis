import Chart from 'chart.js/auto';
import { t, getLang } from './i18n.js';

// 설정 정보 로드
const PTA_CFG = window.PTA_CONFIG || {};
const DOMAIN_API_BASE = (PTA_CFG.API_DOMAIN || '') + '/api/domain';
const INSTANCE_API_BASE = (PTA_CFG.API_DOMAIN || '') + '/api/instance';
const API_BASE = (PTA_CFG.API_DOMAIN || '') + '/api/dbmetrics';
const TOKEN = PTA_CFG.TOKEN || '';

// 전역 변수
let chartBeforeInstance = null;
let chartAfterInstance = null;
let domainTree = [];
let currentSelectedPath = [];
let realDataFetched = false;

// Mock Servers and their 24h CPU profiles (complementary workloads)
const MOCK_SERVERS = [
  {
    id: 'srv_ap1',
    name: 'Commerce API (AP Server 1)',
    cost: 3600, // $3,600/year
    cpuProfile: [15, 12, 10, 8, 12, 18, 25, 35, 42, 48, 50, 45, 48, 42, 45, 40, 38, 30, 28, 25, 22, 20, 18, 16],
    color: '#3b82f6'
  },
  {
    id: 'srv_batch',
    name: 'Nightly Batch Runner',
    cost: 3600,
    // Complementary: peaks between 1 AM and 6 AM, low during the day
    cpuProfile: [65, 75, 80, 70, 60, 45, 15, 10, 8, 8, 8, 8, 8, 8, 8, 8, 8, 10, 12, 15, 25, 40, 50, 60],
    color: '#8b5cf6'
  },
  {
    id: 'srv_admin',
    name: 'Admin Backoffice WAS',
    cost: 2400, // $2,400/year
    // Standard office hours peak (9 AM to 6 PM)
    cpuProfile: [5, 5, 5, 5, 5, 8, 12, 15, 25, 35, 38, 32, 28, 30, 32, 28, 25, 18, 12, 8, 5, 5, 5, 5],
    color: '#eab308'
  },
  {
    id: 'srv_sync',
    name: 'Real-time DB Sync Daemon',
    cost: 2400,
    // Steady low load throughout the day
    cpuProfile: [12, 12, 12, 12, 12, 12, 12, 12, 12, 12, 12, 12, 12, 12, 12, 12, 12, 12, 12, 12, 12, 12, 12, 12],
    color: '#10b981'
  },
  {
    id: 'srv_notify',
    name: 'Push Notification Dispatcher',
    cost: 1800, // $1,800/year
    // Sporadic peaks around lunch (12 PM) and evening (8 PM)
    cpuProfile: [8, 8, 5, 5, 5, 10, 15, 20, 22, 25, 30, 55, 35, 20, 15, 18, 22, 25, 45, 60, 40, 20, 12, 10],
    color: '#f97316'
  }
];

let activeServers = JSON.parse(JSON.stringify(MOCK_SERVERS));

// Selected servers state
let selectedServerIds = ['srv_ap1', 'srv_batch']; // Default select two complementary servers

// DOM 요소
const serverListContainer = document.getElementById('serverListContainer');
const savingsValue = document.getElementById('savingsValue');
const contentionValue = document.getElementById('contentionValue');
const peakCpuValue = document.getElementById('peakCpuValue');
const loadingOverlay = document.getElementById('loadingOverlay');
const simulatedWarningBanner = document.getElementById('simulatedWarningBanner');

// Chart.js 폰트 스타일 설정
Chart.defaults.font.family = '"Pretendard JP Variable", "Pretendard JP", sans-serif';
Chart.defaults.color = "#64748b";

// 초기화
document.addEventListener('DOMContentLoaded', async () => {
  // 1. 도메인 트리 로드
  await loadDomainTree();
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

async function loadInstancesAndMetrics(domainId) {
  if (loadingOverlay) loadingOverlay.classList.remove('hidden');
  
  try {
    const url = `${INSTANCE_API_BASE}?token=${TOKEN}&domain_id=${domainId}`;
    const response = await fetch(url);
    if (!response.ok) throw new Error('Instance API load failed');
    const data = await response.json();
    const instances = data.result || [];
    instances.sort((a, b) => a.instanceId - b.instanceId);

    if (instances.length === 0) {
      throw new Error('No instances found for this domain');
    }

    // Query 24h CPU for each instance
    const today = new Date();
    const prior = new Date();
    prior.setDate(today.getDate() - 1);
    const startTimeStr = formatDateParam(prior, false);
    const endTimeStr = formatDateParam(today, true);

    const colors = ['#3b82f6', '#8b5cf6', '#eab308', '#10b981', '#f97316', '#ec4899', '#06b6d4', '#f43f5e'];

    let anyRealInstanceData = false;
    const fetchPromises = instances.map(async (ins, index) => {
      try {
        const cpuData = await fetchMetricData(domainId, ins.instanceId, 'instance', startTimeStr, endTimeStr, 60, 'sys_cpu');
        
        let profile = [];
        if (cpuData && cpuData.length > 5) {
          cpuData.sort((a, b) => a.time.localeCompare(b.time));
          const last24 = cpuData.slice(-24);
          profile = last24.map(item => Math.round(item.value));
          anyRealInstanceData = true;
        }

        if (profile.length < 12) {
          profile = generateRealisticCpuProfile(ins.instanceId, index);
        }

        while (profile.length < 24) {
          profile.push(Math.round(10 + Math.random() * 20));
        }
        if (profile.length > 24) {
          profile = profile.slice(0, 24);
        }

        return {
          id: String(ins.instanceId),
          name: ins.name,
          cost: ins.name.toLowerCase().includes('db') || ins.name.toLowerCase().includes('batch') ? 3600 : 2400,
          cpuProfile: profile,
          color: colors[index % colors.length]
        };
      } catch (err) {
        console.warn(`Failed to fetch CPU for instance ${ins.instanceId}, generating simulated profile.`, err);
        return {
          id: String(ins.instanceId),
          name: ins.name,
          cost: 2400,
          cpuProfile: generateRealisticCpuProfile(ins.instanceId, index),
          color: colors[index % colors.length]
        };
      }
    });

    activeServers = await Promise.all(fetchPromises);
    realDataFetched = anyRealInstanceData;
  } catch (error) {
    console.warn('Falling back to default MOCK_SERVERS due to error:', error);
    activeServers = JSON.parse(JSON.stringify(MOCK_SERVERS));
    realDataFetched = false;
  }

  if (activeServers.length > 0) {
    selectedServerIds = activeServers.slice(0, 2).map(s => s.id);
  } else {
    selectedServerIds = [];
  }

  if (simulatedWarningBanner) {
    if (realDataFetched) {
      simulatedWarningBanner.classList.add('hidden');
    } else {
      simulatedWarningBanner.classList.remove('hidden');
    }
  }

  renderServerList();
  loadData();
}

function generateRealisticCpuProfile(id, index) {
  const profile = [];
  const type = index % 3; 
  for (let h = 0; h < 24; h++) {
    let base = 10;
    if (type === 0) {
      if (h >= 9 && h <= 18) {
        base = 35 + Math.sin((h - 9) / 9 * Math.PI) * 20;
      } else {
        base = 12 + Math.sin(h / 24 * Math.PI * 2) * 5;
      }
    } else if (type === 1) {
      if (h >= 1 && h <= 6) {
        base = 60 + Math.sin((h - 1) / 5 * Math.PI) * 25;
      } else {
        base = 8 + Math.cos(h / 24 * Math.PI * 2) * 4;
      }
    } else {
      base = 15 + Math.sin(h / 6) * 5 + Math.cos(h / 3) * 3;
    }
    base += Math.random() * 6 - 3;
    profile.push(Math.max(2, Math.min(98, Math.round(base))));
  }
  return profile;
}

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
  const lastItem = path[path.length - 1];
  if (lastItem && lastItem.type === 'domain') {
    loadInstancesAndMetrics(lastItem.id);
  }
}

function renderServerList() {
  serverListContainer.innerHTML = '';
  activeServers.forEach(srv => {
    const label = document.createElement('label');
    label.className = `server-checkbox-label ${selectedServerIds.includes(srv.id) ? 'selected' : ''}`;
    
    const checkbox = document.createElement('input');
    checkbox.type = 'checkbox';
    checkbox.value = srv.id;
    checkbox.checked = selectedServerIds.includes(srv.id);
    
    const textNode = document.createTextNode(` ${srv.name}`);
    
    label.appendChild(checkbox);
    label.appendChild(textNode);
    serverListContainer.appendChild(label);

    checkbox.addEventListener('change', (e) => {
      if (e.target.checked) {
        selectedServerIds.push(srv.id);
        label.classList.add('selected');
      } else {
        selectedServerIds = selectedServerIds.filter(id => id !== srv.id);
        label.classList.remove('selected');
      }
      loadData();
    });
  });
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

// 시뮬레이션 데이터 계산 및 렌더링
function loadData() {
  if (loadingOverlay) loadingOverlay.classList.remove('hidden');

  setTimeout(() => {
    const hours = Array.from({ length: 24 }, (_, i) => `${String(i).padStart(2, '0')}:00`);

    // 1. 선택된 서버 목록 필터링
    const selectedServers = activeServers.filter(srv => selectedServerIds.includes(srv.id));

    // 2. 통합 전 개별 차트용 데이터셋 구성
    const beforeDatasets = selectedServers.map(srv => ({
      label: srv.name,
      data: srv.cpuProfile,
      borderColor: srv.color,
      backgroundColor: 'transparent',
      borderWidth: 2,
      pointRadius: 2,
      tension: 0.2
    }));

    // 3. 통합 시뮬레이션 계산
    // combined[h] = sum(srv.profile[h]) * 1.05 (가상화/컨테이너화 오버헤드 5% 추가)
    const combinedProfile = Array.from({ length: 24 }, (_, h) => {
      const sum = selectedServers.reduce((acc, srv) => acc + srv.cpuProfile[h], 0);
      return Math.min(100, Math.round(sum * 1.05));
    });

    // 4. 비용 절감액 계산
    // 선택된 서버 개수가 N개일 때, 통합되면 1대 값만 지불하므로 (N-1) 대 만큼 절감됨
    let totalSavings = 0;
    if (selectedServers.length > 1) {
      // 가장 비싼 서버 1대의 비용을 남기고, 나머지 비용의 합을 절감액으로 산출
      const sortedCosts = selectedServers.map(s => s.cost).sort((a, b) => b - a);
      totalSavings = sortedCosts.slice(1).reduce((acc, val) => acc + val, 0);
    }

    // 5. 예측 피크값 및 리소스 경합 확률 계산
    const peakCpu = Math.max(...combinedProfile);
    
    // 리소스 경합 확률: 24시간 중 CPU 부하가 80%를 넘는 시간의 비율
    const hotHours = combinedProfile.filter(cpu => cpu >= 80).length;
    const contentionRisk = Math.round((hotHours / 24) * 100);

    // 6. 상태 요약 갱신
    savingsValue.textContent = `$${totalSavings.toLocaleString()} / Year`;
    peakCpuValue.textContent = `${peakCpu}%`;
    
    // 경합 확률 위험도 텍스트 스타일
    let contentionClass = 'contention-low';
    if (contentionRisk > 20) contentionClass = 'contention-high';
    else if (contentionRisk > 0) contentionClass = 'contention-medium';
    
    contentionValue.innerHTML = `<span class="${contentionClass}">${contentionRisk}%</span>`;

    // 7. 차트 그리기
    renderBeforeChart(hours, beforeDatasets);
    renderAfterChart(hours, combinedProfile, peakCpu);

    if (loadingOverlay) loadingOverlay.classList.add('hidden');
  }, 400);
}

function renderBeforeChart(labels, datasets) {
  const ctx = document.getElementById('chartBeforeConsolidation').getContext('2d');
  if (chartBeforeInstance) chartBeforeInstance.destroy();

  chartBeforeInstance = new Chart(ctx, {
    type: 'line',
    data: { labels, datasets },
    options: {
      responsive: true,
      maintainAspectRatio: false,
      scales: {
        y: {
          min: 0,
          max: 100,
          title: { display: true, text: 'CPU Usage (%)', font: { weight: 'bold' } },
          grid: { color: '#e2e8f0' }
        },
        x: { grid: { display: false } }
      },
      plugins: {
        legend: { position: 'top', labels: { boxWidth: 12, font: { size: 10 } } }
      }
    }
  });
}

function renderAfterChart(labels, combinedData, peakCpu) {
  const ctx = document.getElementById('chartAfterConsolidation').getContext('2d');
  if (chartAfterInstance) chartAfterInstance.destroy();

  // 피크 부하 상태에 따른 결합 추세선 색상 변경 (안전: 네이비, 경고: 황색, 위험: 적색)
  let lineColor = '#1e3a8a';
  let fillColor = 'rgba(30, 58, 138, 0.05)';
  if (peakCpu >= 85) {
    lineColor = '#dc2626';
    fillColor = 'rgba(220, 38, 38, 0.08)';
  } else if (peakCpu >= 70) {
    lineColor = '#d97706';
    fillColor = 'rgba(217, 119, 6, 0.08)';
  }

  chartAfterInstance = new Chart(ctx, {
    type: 'line',
    data: {
      labels,
      datasets: [
        {
          label: 'Simulated Combined Server Load',
          data: combinedData,
          borderColor: lineColor,
          backgroundColor: fillColor,
          borderWidth: 2.5,
          pointRadius: 2,
          tension: 0.2,
          fill: true
        },
        {
          label: 'Resource Limit (80%)',
          data: Array(24).fill(80),
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
      scales: {
        y: {
          min: 0,
          max: 100,
          title: { display: true, text: 'CPU Usage (%)', font: { weight: 'bold' } },
          grid: { color: '#e2e8f0' }
        },
        x: { grid: { display: false } }
      },
      plugins: {
        legend: { position: 'top', labels: { boxWidth: 12, font: { size: 10 } } }
      }
    }
  });
}
