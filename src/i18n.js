// Multi-language (i18n) support: Japanese / Korean / English
// Used by the landing page, the PTA dashboard (main.js) and the help page.

const SUPPORTED = ['ja', 'ko', 'en'];
const STORAGE_KEY = 'pta_lang';

// Translation dictionary. Flat keys; each entry has ja / ko / en.
const DICT = {
  // --- Common / dashboard ---
  'app.title': { ja: '性能トレンド分析', ko: '성능 트렌드 분석', en: 'Performance Trend Analysis' },
  'loading': { ja: 'データロード中...', ko: '데이터 로딩 중...', en: 'Loading data...' },
  'loadingShort': { ja: 'ロード中...', ko: '로딩 중...', en: 'Loading...' },

  'filter.domain': { ja: 'ドメイン', ko: '도메인', en: 'Domain' },
  'filter.target': { ja: '対象', ko: '대상', en: 'Target' },
  'target.instance': { ja: 'インスタンス', ko: '인스턴스', en: 'Instance' },
  'target.business': { ja: 'ビジネス', ko: '비지니스', en: 'Business' },
  'select.allInstances': { ja: '全体インスタンス', ko: '인스턴스 전체', en: 'All Instances' },
  'select.allBusinesses': { ja: '全体ビジネス', ko: '비지니스 전체', en: 'All Businesses' },
  'help': { ja: 'ヘルプ', ko: '도움말', en: 'Help' },
  'domain.uncategorized': { ja: '未分類ドメイン', ko: '미분류 도메인', en: 'Uncategorized Domain' },

  // --- Metrics ---
  'metric.service_time': { ja: '応答時間', ko: '응답시간', en: 'Response Time' },
  'metric.service_rate': { ja: 'TPS', ko: 'TPS', en: 'TPS' },
  'metric.service_count': { ja: 'Hit数', ko: 'Hit 수', en: 'Hits' },
  'metric.concurrent_user': { ja: '同時ユーザ数', ko: '동시 사용자 수', en: 'Concurrent Users' },
  'metric.err_rate': { ja: 'エラー率', ko: '에러율', en: 'Error Rate' },
  'metric.sys_cpu': { ja: 'システムCPU', ko: '시스템 CPU', en: 'System CPU' },
  'metric.heap_usage': { ja: 'ヒープメモリ使用率', ko: '힙 메모리 사용률', en: 'Heap Memory Usage' },

  // --- Chart controls ---
  'ma': { ja: '移動平均', ko: '이동평균', en: 'Moving Average' },
  'ma7': { ja: '7日移動平均', ko: '7일 이동평균', en: '7-Day Moving Avg' },
  'ma30': { ja: '30日移動平均', ko: '30일 이동평균', en: '30-Day Moving Avg' },
  'cpu.avg': { ja: '平均CPU', ko: '평균 CPU', en: 'Avg CPU' },
  'cpu.max': { ja: '最大CPU', ko: '최대 CPU', en: 'Max CPU' },
  'stats.avg': { ja: '平均', ko: '평균', en: 'Average' },
  'stats.mom': { ja: '前月比', ko: '전월 대비', en: 'MoM Change' },

  // --- Summary cards ---
  'summary.period': { ja: '期間', ko: '기간', en: 'Period' },
  'summary.peakDate': { ja: 'ピーク日', ko: '피크일', en: 'Peak Day' },
  'summary.avgResponseTime': { ja: '平均応答時間', ko: '평균 응답시간', en: 'Avg Response Time' },
  'summary.avgTps': { ja: '平均TPS', ko: '평균 TPS', en: 'Avg TPS' },
  'summary.avgHits': { ja: '平均Hit数', ko: '평균 Hit 수', en: 'Avg Hits' },
  'summary.avgUsers': { ja: '平均同時ユーザ数', ko: '평균 동시 사용자 수', en: 'Avg Concurrent Users' },
  'summary.avgErrRate': { ja: '平均エラー率', ko: '평균 에러율', en: 'Avg Error Rate' },
  'summary.avgCpu': { ja: '平均CPU', ko: '평균 CPU', en: 'Avg CPU' },
  'summary.avgHeap': { ja: '平均ヒープメモリ', ko: '평균 힙 메모리', en: 'Avg Heap Memory' },
  'range.full': { ja: '全体 (1年)', ko: '전체 (1년)', en: 'Full (1 Year)' },

  // --- Heatmaps ---
  'heatmap.overall': { ja: 'データ分布 (Overall)', ko: '데이터 분포 (Overall)', en: 'Data Distribution (Overall)' },
  'heatmap.dayhour': { ja: '曜日 x 時間帯別分布', ko: '요일 x 시간대별 분포', en: 'Day x Hour Distribution' },
  'guide': { ja: '分析ガイド', ko: '분석 가이드', en: 'Analysis Guide' },
  'legend.low': { ja: '低', ko: '낮음', en: 'Low' },
  'legend.high': { ja: '高', ko: '높음', en: 'High' },
  'legend.good': { ja: '安定', ko: '안정', en: 'Stable' },
  'legend.warning': { ja: '警戒', ko: '경계', en: 'Warning' },
  'legend.danger': { ja: '高', ko: '높음', en: 'High' },
  'heatmap.afterLoad': { ja: 'データロード後、表示されます。', ko: '데이터 로드 후 표시됩니다.', en: 'Displayed after data loads.' },
  'heatmap.noData': { ja: 'データがありません。', ko: '데이터가 없습니다.', en: 'No data available.' },
  'heatmap.noValidData': { ja: '有効なデータがありません。', ko: '유효한 데이터가 없습니다.', en: 'No valid data available.' },
  'heatmap.noDataShort': { ja: 'No data', ko: 'No data', en: 'No data' },

  // --- Axis labels ---
  'axis.responseTimeMs': { ja: '応答時間 (ms)', ko: '응답시간 (ms)', en: 'Response Time (ms)' },
  'axis.hitsCount': { ja: 'Hit数 (count)', ko: 'Hit 수 (count)', en: 'Hits (count)' },
  'axis.day': { ja: '曜日 (Day)', ko: '요일 (Day)', en: 'Day' },
  'axis.hour': { ja: '時間帯 (Hour)', ko: '시간대 (Hour)', en: 'Hour' },

  // --- Detail layers / tables ---
  'layer.detailList': { ja: '詳細データリスト', ko: '상세 데이터 리스트', en: 'Detailed Data List' },
  'close': { ja: '閉じる', ko: '닫기', en: 'Close' },
  'th.no': { ja: 'No.', ko: 'No.', en: 'No.' },
  'th.date': { ja: '日付', ko: '날짜', en: 'Date' },
  'th.time': { ja: '時間', ko: '시간', en: 'Time' },
  'th.hits': { ja: 'Hit数', ko: 'Hit 수', en: 'Hits' },
  'th.metricValue': { ja: 'メトリクス値', ko: '메트릭 값', en: 'Metric Value' },

  // --- Units ---
  'unit.users': { ja: '人', ko: '명', en: '' },
  'unit.hits': { ja: '件', ko: '건', en: '' },

  // --- Landing page ---
  'landing.subCatch': { ja: 'JENNIFERのデータを、もっと自由に使いこなす。', ko: 'JENNIFER의 데이터를, 더 자유롭게 활용하다.', en: "Use JENNIFER's data more freely." },
  'landing.intro1': {
    ja: '<strong>JENNIFER Extension Labo</strong> は、APMツール「JENNIFER」が収集したパフォーマンスデータをOpenAPIを通じて活用する、プロトタイプ機能・画面を試せる実験スペースです。',
    ko: '<strong>JENNIFER Extension Labo</strong>는 APM 도구 「JENNIFER」가 수집한 성능 데이터를 OpenAPI를 통해 활용하여, 프로토타입 기능·화면을 체험할 수 있는 실험 공간입니다.',
    en: '<strong>JENNIFER Extension Labo</strong> is an experimental space for trying prototype features and screens that leverage the performance data collected by the APM tool "JENNIFER" through its OpenAPI.'
  },
  'landing.intro2': {
    ja: 'JENNIFERが持つ豊富な性能データを、標準機能の枠を超えてどう使えるか ― アイデアを実際の画面として形にし、ユーザーが直接体験・評価できる場を提供します。ここはユーザーと開発チームが一緒にJENNIFERの未来を作る、共同実験室です。',
    ko: 'JENNIFER가 보유한 풍부한 성능 데이터를 표준 기능의 틀을 넘어 어떻게 활용할 수 있을지 ― 아이디어를 실제 화면으로 구현하여, 사용자가 직접 체험하고 평가할 수 있는 장을 제공합니다. 이곳은 사용자와 개발팀이 함께 JENNIFER의 미래를 만들어가는 공동 실험실입니다.',
    en: "How can JENNIFER's rich performance data be used beyond the limits of its standard features? We turn ideas into real screens and provide a space where users can directly experience and evaluate them. This is a collaborative lab where users and the development team shape the future of JENNIFER together."
  },
  'landing.sectionTitle': { ja: '現在進行中の実験', ko: '현재 진행 중인 실험', en: 'Experiments in Progress' },
  'landing.ptaTitle': { ja: '性能トレンド分析', ko: '성능 트렌드 분석', en: 'Performance Trend Analysis' },
  'landing.ptaDesc': {
    ja: 'システムの長期的な性能推移を分析し、時間帯別/曜日別のパターンを可視化。最適なキャパシティプランニングを支援します。',
    ko: '시스템의 장기적인 성능 추이를 분석하고 시간대별/요일별 패턴을 시각화하여, 최적의 용량 계획을 지원합니다.',
    en: 'Analyzes long-term system performance trends and visualizes patterns by hour and day of week to support optimal capacity planning.'
  },
  'landing.ptaBtn': { ja: '実験を開始する', ko: '실험 시작하기', en: 'Start Experiment' },
  'landing.soonTitle': { ja: '新しい分析画面', ko: '새로운 분석 화면', en: 'New Analysis Screen' },
  'landing.soonDesc': {
    ja: 'OpenAPIを活用した新しいデータ可視化のアイデアを準備中です。近日公開予定です。',
    ko: 'OpenAPI를 활용한 새로운 데이터 시각화 아이디어를 준비 중입니다. 곧 공개될 예정입니다.',
    en: 'New data visualization ideas leveraging the OpenAPI are in preparation. Coming soon.'
  },
  'landing.footer1': {
    ja: '<strong>JENNIFER Expansion Labo</strong> は、株式会社JenniferSoftが運営するプロトタイプサイトです。<br> ここで公開されるすべての機能はプロトタイプであり、将来的なサービスへの搭載を保証するものではありません。',
    ko: '<strong>JENNIFER Expansion Labo</strong>는 주식회사 JenniferSoft가 운영하는 프로토타입 사이트입니다.<br> 여기에서 공개되는 모든 기능은 프로토타입이며, 향후 서비스 탑재를 보장하지 않습니다.',
    en: '<strong>JENNIFER Expansion Labo</strong> is a prototype site operated by JenniferSoft, Inc.<br> All features published here are prototypes and do not guarantee future inclusion in any service.'
  },

  // --- Help page ---
  'help.title': {
    ja: '性能トレンド分析 - ヘルプ',
    ko: '성능 트렌드 분석 - 도움말',
    en: 'Performance Trend Analysis - Help'
  },
  'help.headerTitle': {
    ja: '性能トレンド分析 ガイド',
    ko: '성능 트렌드 분석 가이드',
    en: 'Performance Trend Analysis Guide'
  },
  'help.closeBtn': { ja: '閉じる', ko: '닫기', en: 'Close' },

  // Section 1 - Overview
  'help.general.h2': { ja: '1. 概要', ko: '1. 개요', en: '1. Overview' },
  'help.general.p1': {
    ja: '性能トレンド分析ダッシュボードは、ウェブアプリケーションの長期的な性能推移を可視化し、システムの状態を多角的に分析するためのツールです。1年間のデータを1時間単位の精度で保持し、トレンドの把握やキャパシティプランニングに活用できます。',
    ko: '성능 트렌드 분석 대시보드는 웹 애플리케이션의 장기적인 성능 추이를 시각화하고, 시스템 상태를 다각도로 분석하기 위한 도구입니다. 1년간의 데이터를 1시간 단위의 정밀도로 유지하여, 트렌드 파악 및 용량 계획(Capacity Planning)에 활용할 수 있습니다.',
    en: 'The Performance Trend Analysis dashboard is a tool for visualizing the long-term performance trends of web applications and analyzing system health from multiple angles. It retains one year of data at hourly precision, supporting trend analysis and capacity planning.'
  },

  // Section 2 - Main time-series chart
  'help.mainChart.h2': { ja: '2. メイン時系列チャート', ko: '2. 메인 시계열 차트', en: '2. Main Time-Series Chart' },
  'help.mainChart.p1': {
    ja: 'アプリケーション上部に配置されたメインチャートは、選択したメトリクスの時間経過に伴う変化を確認するための主要な指標です。 1年間のデータを1日単位の精度で保持し、トレンドの把握やキャパシティプランニングに活用できます。',
    ko: '애플리케이션 상단에 배치된 메인 차트는 선택된 메트릭의 시간 경과에 따른 변화를 확인하는 주요 지표입니다. 1년간의 데이터를 1일 단위 정밀도로 기록하여 추세 분석과 용량 계획에 활용할 수 있습니다.',
    en: 'The main chart placed at the top of the application is the primary indicator for tracking how the selected metric changes over time. It retains one year of data at daily precision, supporting trend analysis and capacity planning.'
  },
  'help.mainChart.h3_1': { ja: '2.1 各指標（メトリクス）の定義', ko: '2.1 각 지표(메트릭)의 정의', en: '2.1 Definition of Each Metric' },
  'help.mainChart.metric.responseTime': {
    ja: '<span class="metric-tag">応答時間</span> <strong>Response Time (ms):</strong> リクエストの処理完了までにかかった平均時間。ユーザー体験に直結する重要な指標です。',
    ko: '<span class="metric-tag">응답시간</span> <strong>Response Time (ms):</strong> 요청 처리 완료까지 걸린 평균 시간. 사용자 경험과 직결되는 중요한 지표입니다.',
    en: '<span class="metric-tag">Response Time</span> <strong>Response Time (ms):</strong> The average time taken to complete request processing. A key metric directly tied to user experience.'
  },
  'help.mainChart.metric.tps': {
    ja: '<span class="metric-tag">TPS</span> <strong>Transactions Per Second:</strong> 1秒あたりの平均処理件数。システムの現在のスループットを示します。',
    ko: '<span class="metric-tag">TPS</span> <strong>Transactions Per Second:</strong> 1초당 평균 처리 건수. 시스템의 현재 처리량(Throughput)을 나타냅니다.',
    en: '<span class="metric-tag">TPS</span> <strong>Transactions Per Second:</strong> The average number of transactions processed per second. Indicates the current throughput of the system.'
  },
  'help.mainChart.metric.hits': {
    ja: '<span class="metric-tag">Hit数</span> <strong>Hits (Count):</strong> 特定の時間枠内の総リクエスト数。システムの負荷量（トラフィック）を測定します。',
    ko: '<span class="metric-tag">Hit 수</span> <strong>Hits (Count):</strong> 특정 시간대 내 총 요청 횟수. 시스템의 부하량(트래픽)을 측정합니다.',
    en: '<span class="metric-tag">Hits</span> <strong>Hits (Count):</strong> The total number of requests within a given time window. Measures the system load (traffic).'
  },
  'help.mainChart.metric.users': {
    ja: '<span class="metric-tag">同時ユーザ数</span> <strong>Concurrent Users:</strong> システムにアクティブに接続しているユーザー数。',
    ko: '<span class="metric-tag">동시 사용자 수</span> <strong>Concurrent Users:</strong> 시스템에 활성화된 세션/사용자 수.',
    en: '<span class="metric-tag">Concurrent Users</span> <strong>Concurrent Users:</strong> The number of users actively connected to the system.'
  },
  'help.mainChart.metric.errRate': {
    ja: '<span class="metric-tag">エラー率</span> <strong>Error Rate (%):</strong> 総リクエスト数に対するエラー発生数の割合。計算式: <code>(エラー件数 / 総リクエスト数) × 100</code>。エラー率の上昇は、アプリケーションの不具合やインフラ障害を示す重要なシグナルです。',
    ko: '<span class="metric-tag">에러율</span> <strong>Error Rate (%):</strong> 전체 요청 건수 대비 에러 발생 건수의 비율. 수식: <code>(에러 건수 / 총 요청 건수) × 100</code>. 에러율 상승은 애플리케이션 버그나 인프라 장애를 알리는 중요한 신호입니다.',
    en: '<span class="metric-tag">Error Rate</span> <strong>Error Rate (%):</strong> The ratio of errors to the total number of requests. Formula: <code>(error count / total requests) × 100</code>. A rising error rate is an important signal of application bugs or infrastructure failures.'
  },
  'help.mainChart.metric.cpuMem': {
    ja: '<span class="metric-tag">CPU / メモリ</span> インスタンスごとの物理リソース使用率。平均値と最大値(Peak)を同時に分析することで、リソース不足を早期に検知できます。',
    ko: '<span class="metric-tag">CPU / 메모리</span> 개별 인스턴스의 물리적 리소스 사용률. 평균값과 최대값(Peak)을 함께 분석하여 리소스 부족을 조기에 감지할 수 있습니다.',
    en: '<span class="metric-tag">CPU / Memory</span> Physical resource usage per instance. Analyzing the average and peak values together enables early detection of resource shortages.'
  },
  'help.mainChart.h3_2': { ja: '2.2 ダッシュボードの操作方法', ko: '2.2 대시보드 조작 방법', en: '2.2 How to Operate the Dashboard' },
  'help.mainChart.op.filter': {
    ja: '<strong>期間の絞り込み:</strong> メインチャート上の特定の範囲をマウスでドラッグすると、その期間の統計データが全カードとヒートマップに即座に反映されます。 キーボードの方向キー (←, →) を押すと、選択した1ヶ月の範囲を前後に範囲が拡張されます。',
    ko: '<strong>기간 범위 지정:</strong> 메인 차트 상의 특정 범위를 마우스로 드래그하면, 해당 기간의 통계 데이터가 즉시 모든 카드와 히트맵에 반영됩니다. 키보드 방향키 (←, →)를 누르면 선택된 1개월 범위가 앞뒤로 확장됩니다.',
    en: '<strong>Period Selection:</strong> Drag a specific range on the main chart with the mouse, and the statistics for that period are instantly reflected in all cards and heatmaps. Press the arrow keys (←, →) to extend the selected one-month range forward or backward.'
  },
  'help.mainChart.op.move': {
    ja: '<strong>範囲の移動:</strong> キーボードの方向キー (←, →) を押すと、選択した1ヶ月の範囲を前後に移動できます。',
    ko: '<strong>범위 이동:</strong> 키보드 방향키 (←, →)를 누르면 선택된 1개월 범위를 앞뒤로 이동할 수 있습니다.',
    en: '<strong>Range Navigation:</strong> Press the arrow keys (←, →) to move the selected one-month range forward or backward.'
  },
  'help.mainChart.op.reset': {
    ja: '<strong>選択解除:</strong> <code>Esc</code> キーを押すと、選択がリセットされ、1年全体のデータに戻ります。',
    ko: '<strong>선택 해제:</strong> <code>Esc</code> 키를 누르면 선택이 초기화되어 1년 전체 데이터로 되돌아갑니다.',
    en: '<strong>Clear Selection:</strong> Press <code>Esc</code> to reset the selection and return to the full one-year dataset.'
  },
  'help.mainChart.op.ma': {
    ja: '<strong>移動平均の活用:</strong> 「移動平均」をOnにすると、短期的な変動を抑えた長期的なトレンドが視覚化され、本質的な変化を捉えやすくなります。',
    ko: '<strong>이동평균 활용:</strong> \'이동평균\'을 On으로 설정하면 단기적인 변동이 억제된 장기 트렌드가 시각화되어 본질적인 변화를 쉽게 파악할 수 있습니다.',
    en: '<strong>Using Moving Averages:</strong> Turning on "Moving Average" visualizes long-term trends with short-term fluctuations smoothed out, making essential changes easier to spot.'
  },
  'help.mainChart.h3_3': { ja: '2.3 なぜこのチャートが重要か？', ko: '2.3 왜 이 차트가 중요한가?', en: '2.3 Why Is This Chart Important?' },
  'help.mainChart.why.trend': {
    ja: '<strong>長期トレンドの可視化:</strong> 1年分のデータを1日単位で表示することで、月次・四半期ごとの性能推移や季節性のあるトラフィック変動を把握できます。一時的なスパイクと構造的な劣化を明確に区別できます。',
    ko: '<strong>장기 트렌드 시각화:</strong> 1년치 데이터를 일별로 표시함으로써 월간·분기별 성능 추이와 계절성 트래픽 변동을 파악할 수 있습니다. 일시적인 스파이크와 구조적인 성능 저하를 명확하게 구분할 수 있습니다.',
    en: '<strong>Long-Term Trend Visualization:</strong> Displaying a year of data on a daily basis lets you grasp monthly and quarterly performance trends and seasonal traffic variations. It clearly distinguishes temporary spikes from structural degradation.'
  },
  'help.mainChart.why.capacity': {
    ja: '<strong>キャパシティプランニング:</strong> 過去の推移から将来のリソース需要を予測し、「いつ頃インフラ増設が必要か」を定量的に判断する根拠となります。',
    ko: '<strong>용량 계획(Capacity Planning):</strong> 과거 추이로부터 미래의 리소스 수요를 예측하여, "언제쯤 인프라 증설이 필요한가"를 정량적으로 판단하는 근거가 됩니다.',
    en: '<strong>Capacity Planning:</strong> By forecasting future resource demand from historical trends, it provides a quantitative basis for deciding "when infrastructure expansion will be needed."'
  },
  'help.mainChart.why.change': {
    ja: '<strong>変更影響の検証:</strong> デプロイやインフラ変更の前後で性能がどのように変化したかを時系列で確認でき、変更の効果やリグレッションを即座に検知できます。',
    ko: '<strong>변경 영향도 검증:</strong> 배포나 인프라 변경 전후로 성능이 어떻게 변화했는지 시계열로 확인할 수 있어, 변경의 효과나 회귀(Regression)를 즉시 감지할 수 있습니다.',
    en: '<strong>Change Impact Verification:</strong> You can review how performance changed before and after a deployment or infrastructure change on a time series, instantly detecting the effect of the change or any regression.'
  },
  'help.mainChart.h3_4': { ja: '2.4 移動平均線の活用方法', ko: '2.4 이동 평균선 활용법', en: '2.4 How to Use Moving Average Lines' },
  'help.mainChart.ma.intro': {
    ja: '移動平均(MA)は日次の変動ノイズを除去し、本質的なトレンドを浮き彫りにします。本ツールでは <strong>7日移動平均</strong> と <strong>30日移動平均</strong> の2種類を提供しています。',
    ko: '이동 평균(MA)은 일별 변동 노이즈를 제거하여 본질적인 트렌드를 부각합니다. 본 도구는 <strong>7일 이동 평균</strong>과 <strong>30일 이동 평균</strong> 2가지를 제공합니다.',
    en: 'A moving average (MA) removes daily fluctuation noise and highlights the underlying trend. This tool provides two types: a <strong>7-day moving average</strong> and a <strong>30-day moving average</strong>.'
  },
  'help.mainChart.ma7.h4': {
    ja: '▶ 7日移動平均 <small style="color:#64748b;">（短期トレンド）</small>',
    ko: '▶ 7일 이동 평균 <small style="color:#64748b;">(단기 트렌드)</small>',
    en: '▶ 7-Day Moving Average <small style="color:#64748b;">(Short-Term Trend)</small>'
  },
  'help.mainChart.ma7.li1': {
    ja: '週単位の傾向変化を素早く検出できます。',
    ko: '주 단위의 경향성 변화를 빠르게 포착할 수 있습니다.',
    en: 'Quickly detects week-level shifts in trends.'
  },
  'help.mainChart.ma7.li2': {
    ja: 'デプロイ後の性能変化を数日以内に確認する際に有効です。',
    ko: '배포 직후 며칠 내 성능 변화를 점검할 때 유용합니다.',
    en: 'Useful for checking performance changes within a few days after a deployment.'
  },
  'help.mainChart.ma30.h4': {
    ja: '▶ 30日移動平均 <small style="color:#64748b;">（長期トレンド）</small>',
    ko: '▶ 30일 이동 평균 <small style="color:#64748b;">(장기 트렌드)</small>',
    en: '▶ 30-Day Moving Average <small style="color:#64748b;">(Long-Term Trend)</small>'
  },
  'help.mainChart.ma30.li1': {
    ja: '月単位の構造的なトレンドを把握できます。',
    ko: '월 단위의 구조적인 트렌드를 파악할 수 있습니다.',
    en: 'Captures structural trends at the monthly level.'
  },
  'help.mainChart.ma30.li2': {
    ja: '30日線が持続的に上昇（応答時間・エラー率の場合）している場合、スケーリングやチューニングの検討が必要です。',
    ko: '30일선이 지속적으로 우상향(응답 시간·에러율 기준)한다면, 스케일아웃이나 튜닝 검토가 필요합니다.',
    en: 'If the 30-day line keeps rising (for response time or error rate), scaling or tuning should be considered.'
  },
  'help.mainChart.maPoint.h4': { ja: '▶ 分析のポイント', ko: '▶ 분석 포인트', en: '▶ Analysis Tips' },
  'help.mainChart.maPoint.li1': {
    ja: '<strong>7日線と30日線の乖離:</strong> 7日線が30日線を上回り始めたら直近の性能悪化の兆候、下回り始めたら改善の兆候です。',
    ko: '<strong>7일선과 30일선의 이격:</strong> 7일선이 30일선 위로 상승하기 시작하면 최근 성능 악화의 징조이며, 아래로 내려가기 시작하면 개선의 징조입니다.',
    en: '<strong>Divergence Between the 7-Day and 30-Day Lines:</strong> When the 7-day line starts rising above the 30-day line it signals recent degradation; when it falls below, it signals improvement.'
  },
  'help.mainChart.maPoint.li2': {
    ja: '<strong>ゴールデンクロス / デッドクロス:</strong> 短期線が長期線を下から上に突き抜けた場合（応答時間等では悪化シグナル）、逆に上から下に抜けた場合は改善シグナルとして読み取れます。',
    ko: '<strong>골든 크로스 / 데드 크로스:</strong> 단기선이 장기선을 아래에서 위로 돌파한 경우(응답 시간 등에서는 악화 시그널), 반대로 위에서 아래로 교차한 경우는 개선 시그널로 해석할 수 있습니다.',
    en: '<strong>Golden Cross / Dead Cross:</strong> When the short-term line breaks through the long-term line from below (a degradation signal for response time, etc.), and conversely when it crosses from above to below, it can be read as an improvement signal.'
  },
  'help.mainChart.maPoint.li3': {
    ja: '<strong>原データとの差:</strong> 原データが移動平均線から大きく乖離した日は、一時的なイベントや障害を示す外れ値である可能性が高いです。',
    ko: '<strong>원본 데이터와의 차이:</strong> 원본 데이터가 이동 평균선에서 크게 벗어난 날은 일시적인 이벤트나 장애를 나타내는 이상치일 가능성이 높습니다.',
    en: '<strong>Difference From Raw Data:</strong> Days where the raw data deviates significantly from the moving average line are likely outliers indicating a one-off event or incident.'
  },

  // Section 3 - Overall heatmap
  'help.overall.h2': { ja: '3. Overall ヒットマップ分析 (相関分析)', ko: '3. Overall 히트맵 분석 (상관 분석)', en: '3. Overall Heatmap Analysis (Correlation Analysis)' },
  'help.overall.p1': {
    ja: 'このチャートは、<strong>負荷(Hits)</strong>と<strong>性能指標</strong>の相関を示します。データは中央値(Median)によって4つのエリアに分類されます。 性能指標の中央値(Median)は全体期間の中央値(Median)を使用します。Hit数の中央値(Median)は選択した期間の中央値(Median)を使用します。',
    ko: '이 차트는 <strong>부하(Hits)</strong>와 <strong>성능 지표</strong> 간의 상관관계를 나타냅니다. 데이터는 중앙값(Median)을 기준으로 4개 구역으로 분류됩니다. 성능 지표의 중앙값(Median)은 전체 기간의 중앙값을 사용하고, Hit 수의 중앙값(Median)은 선택한 기간의 중앙값을 사용합니다.',
    en: 'This chart shows the correlation between <strong>load (Hits)</strong> and <strong>performance metrics</strong>. Data is classified into four areas by the median. The median of the performance metric uses the median of the full period, while the median of Hits uses the median of the selected period.'
  },
  'help.overall.quad.topLeft': {
    ja: '<strong>左上: 低負荷 × 高指標値</strong> 負荷(Hits)が少ないにもかかわらず、Y軸の指標値が高い状態。',
    ko: '<strong>좌측 상단: 저부하 × 고지표</strong> 부하(Hits)가 낮음에도 불구하고 Y축 수치가 높은 상태.',
    en: '<strong>Top Left: Low Load × High Metric</strong> A state where the Y-axis metric is high even though the load (Hits) is low.'
  },
  'help.overall.quad.topRight': {
    ja: '<strong>右上: 高負荷 × 高指標値</strong> 負荷(Hits)と Y軸の指標値が共に高い状態。',
    ko: '<strong>우측 상단: 고부하 × 고지표</strong> 부하(Hits)와 Y축 수치 모두 높은 상태.',
    en: '<strong>Top Right: High Load × High Metric</strong> A state where both the load (Hits) and the Y-axis metric are high.'
  },
  'help.overall.quad.bottomLeft': {
    ja: '<strong>左下: 低負荷 × 低指標値</strong> 負荷(Hits)と Y軸の指標値が共に低い状態。',
    ko: '<strong>좌측 하단: 저부하 × 저지표</strong> 부하(Hits)와 Y축 수치 모두 낮은 상태.',
    en: '<strong>Bottom Left: Low Load × Low Metric</strong> A state where both the load (Hits) and the Y-axis metric are low.'
  },
  'help.overall.quad.bottomRight': {
    ja: '<strong>右下: 高負荷 × 低指標値</strong> 負荷(Hits)が高いにもかかわらず、Y軸の指標値が低い状態。',
    ko: '<strong>우측 하단: 고부하 × 저지표</strong> 부하(Hits)가 높음에도 불구하고 Y축 수치가 낮은 상태.',
    en: '<strong>Bottom Right: High Load × Low Metric</strong> A state where the Y-axis metric is low even though the load (Hits) is high.'
  },
  'help.overall.h3_1': { ja: '3.1 メトリクス別の解析ガイド', ko: '3.1 메트릭별 해석 가이드', en: '3.1 Per-Metric Interpretation Guide' },
  'help.overall.h3_1.p': {
    ja: 'Y軸に表示される指標の種類によって、各エリアの意味が変わります。',
    ko: 'Y축에 표시되는 지표의 종류에 따라 각 구역의 의미가 달라집니다.',
    en: 'The meaning of each area changes depending on the type of metric shown on the Y-axis.'
  },
  'help.overall.bad.h4': {
    ja: '▶ 応答時間 / エラー率 / CPU / メモリ <small style="color:#64748b;">（値が高い＝悪化）</small>',
    ko: '▶ 응답 시간 / 에러율 / CPU / 메모리 <small style="color:#64748b;">(값이 높을수록 악화)</small>',
    en: '▶ Response Time / Error Rate / CPU / Memory <small style="color:#64748b;">(higher value = worse)</small>'
  },
  'help.overall.bad.topLeft': {
    ja: '<strong>左上（⚠️）:</strong> 低負荷でも指標が高い → アプリケーション内部の非効率（遅いクエリ、メモリリーク等）が疑われます。',
    ko: '<strong>좌상단 (⚠️):</strong> 부하가 적은데 지표가 높음 → 슬로우 쿼리, 메모리 릭 등 애플리케이션 내부의 비효율 의심.',
    en: '<strong>Top Left (⚠️):</strong> Metric is high despite low load → suspect internal application inefficiency (slow queries, memory leaks, etc.).'
  },
  'help.overall.bad.topRight': {
    ja: '<strong>右上（🔴）:</strong> 高負荷で指標も高い → キャパシティの限界。リソースの増設やチューニングが急務です。',
    ko: '<strong>우상단 (🔴):</strong> 부하도 많고 지표도 높음 → 수용 가능(Capacity) 한계. 리소스 증설과 튜닝이 시급합니다.',
    en: '<strong>Top Right (🔴):</strong> Both load and metric are high → capacity limit reached. Resource expansion or tuning is urgent.'
  },
  'help.overall.bad.bottomLeft': {
    ja: '<strong>左下（🟢）:</strong> 低負荷で指標も低い → 安定した理想的な状態です。',
    ko: '<strong>좌하단 (🟢):</strong> 부하도 적고 지표도 낮음 → 안정적이고 이상적인 상태입니다.',
    en: '<strong>Bottom Left (🟢):</strong> Both load and metric are low → a stable, ideal state.'
  },
  'help.overall.bad.bottomRight': {
    ja: '<strong>右下（✅）:</strong> 高負荷でも指標が低い → 高効率。十分なキャパシティがあります。',
    ko: '<strong>우하단 (✅):</strong> 부하가 몰렸는데 지표는 낮음 → 고효율. 충분한 용량 여유가 있습니다.',
    en: '<strong>Bottom Right (✅):</strong> Metric is low even under high load → highly efficient. There is ample capacity.'
  },
  'help.overall.tps.h4': {
    ja: '▶ TPS <small style="color:#64748b;">（値が高い＝良好）</small>',
    ko: '▶ TPS <small style="color:#64748b;">(값이 높을수록 우수)</small>',
    en: '▶ TPS <small style="color:#64748b;">(higher value = better)</small>'
  },
  'help.overall.tps.topLeft': {
    ja: '<strong>左上（✅）:</strong> 低負荷で高スループット → 効率的な処理が行われています。',
    ko: '<strong>좌상단 (✅):</strong> 적은 부하로 높은 처리량 → 효율적인 처리가 이루어지고 있습니다.',
    en: '<strong>Top Left (✅):</strong> High throughput under low load → processing is efficient.'
  },
  'help.overall.tps.topRight': {
    ja: '<strong>右上（🟢）:</strong> 高負荷で高スループット → 最適なパフォーマンス状態です。',
    ko: '<strong>우상단 (🟢):</strong> 많은 부하를 빠르게 처리 → 최적의 성능 상태입니다.',
    en: '<strong>Top Right (🟢):</strong> High throughput under high load → an optimal performance state.'
  },
  'help.overall.tps.bottomLeft': {
    ja: '<strong>左下（⚪）:</strong> 低負荷で低スループット → アイドル状態またはトラフィックが少ない時間帯です。',
    ko: '<strong>좌하단 (⚪):</strong> 낮은 부하에 처리량도 적음 → 유휴 상태 또는 트래픽이 적은 시간대입니다.',
    en: '<strong>Bottom Left (⚪):</strong> Low throughput under low load → an idle state or a low-traffic time window.'
  },
  'help.overall.tps.bottomRight': {
    ja: '<strong>右下（⚠️）:</strong> 高負荷で低スループット → ボトルネックの可能性。処理が追いついていません。',
    ko: '<strong>우하단 (⚠️):</strong> 부하는 많으나 처리량이 낮음 → 병목 가능성. 처리가 따라가지 못하고 있습니다.',
    en: '<strong>Bottom Right (⚠️):</strong> Low throughput under high load → a possible bottleneck. Processing is not keeping up.'
  },
  'help.overall.h3_2': { ja: '3.2 なぜこのチャートが重要か？', ko: '3.2 왜 이 차트가 중요한가?', en: '3.2 Why Is This Chart Important?' },
  'help.overall.why.cause': {
    ja: '<strong>負荷と性能の因果関係の把握:</strong> 時系列チャートだけでは「いつ遅くなったか」は分かりますが、「なぜ遅くなったか」は分かりません。Overallヒートマップは、負荷量との相関を可視化することで原因の切り分けを支援します。',
    ko: '<strong>부하와 성능 간 인과관계 파악:</strong> 시계열 차트만으로는 "언제 느려졌는가"는 알 수 있지만 "왜 느려졌는가"는 알 수 없습니다. Overall 히트맵은 부하량과의 상관관계를 시각화하여 원인 규명을 지원합니다.',
    en: '<strong>Understanding the Cause-and-Effect of Load and Performance:</strong> A time-series chart alone tells you "when" things slowed down, but not "why." The Overall heatmap supports root-cause isolation by visualizing the correlation with load.'
  },
  'help.overall.why.limit': {
    ja: '<strong>キャパシティの限界点の特定:</strong> データポイントが右上エリアに集中し始めた場合、現在のインフラ構成ではトラフィックの増加に耐えられないことを示しており、事前のスケーリング計画に役立ちます。',
    ko: '<strong>용량 한계 지점 도출:</strong> 데이터 포인트가 우상단 구역에 집중되기 시작하면, 현재 인프라 구성으로는 트래픽 증가를 견디지 못함을 의미하며, 사전 스케일링 계획에 도움이 됩니다.',
    en: '<strong>Identifying the Capacity Limit Point:</strong> When data points begin to concentrate in the top-right area, it indicates that the current infrastructure cannot withstand traffic growth, which helps with proactive scaling planning.'
  },
  'help.overall.why.tuning': {
    ja: '<strong>チューニング効果の検証:</strong> アプリケーションやインフラのチューニング前後でデータ分布がどう変化したかを視覚的に比較できます。',
    ko: '<strong>튜닝 효과 검증:</strong> 애플리케이션이나 인프라의 튜닝 전후로 데이터 분포가 어떻게 변화했는지 시각적으로 비교할 수 있습니다.',
    en: '<strong>Verifying Tuning Effectiveness:</strong> You can visually compare how the data distribution shifted before and after tuning the application or infrastructure.'
  },
  'help.overall.h3_3': { ja: '3.3 活用ガイド', ko: '3.3 활용 가이드', en: '3.3 Usage Guide' },
  'help.overall.tip.dist': {
    ja: '<strong>分布の偏りを確認:</strong> 左下（安定）に密集していれば健全な状態。右上へ広がるほどキャパシティリスクが高まっています。',
    ko: '<strong>분포 편향도 검토:</strong> 좌측 하단(안정)에 군집이 뭉쳐 있다면 건전한 상태입니다. 우상단으로 넓게 퍼질수록 용량 리스크가 높아집니다.',
    en: '<strong>Check Distribution Skew:</strong> Clustering in the bottom-left (stable) indicates a healthy state. The more the distribution spreads toward the top-right, the higher the capacity risk.'
  },
  'help.overall.tip.range': {
    ja: '<strong>期間絞り込みとの併用:</strong> メインチャートで特定の月を選択すると、その期間だけの負荷-性能分布を確認でき、月別・季節別の変化を比較分析できます。',
    ko: '<strong>기간 범위 지정과 연동 적용:</strong> 메인 차트에서 특정 월을 선택하면 해당 기간만의 부하-성능 분포를 확인할 수 있어, 월별·계절별 변화를 비교 분석할 수 있습니다.',
    en: '<strong>Combine With Period Selection:</strong> Selecting a specific month on the main chart lets you view the load-performance distribution for that period only, enabling comparative analysis of monthly and seasonal changes.'
  },
  'help.overall.tip.metric': {
    ja: '<strong>メトリクス切替による多面的分析:</strong> 同じ期間でメトリクスを切り替えることで、「負荷増加時に応答時間は悪化するがエラー率は安定」など、複合的な性能特性を把握できます。',
    ko: '<strong>지표 전환을 통한 다면적 분석:</strong> 동일한 기간에 메트릭을 전환하면 "부하 증가 시 응답 시간은 악화되나 에러율은 안정" 등 복합적인 성능 특성을 파악할 수 있습니다.',
    en: '<strong>Multi-Faceted Analysis by Switching Metrics:</strong> Switching metrics for the same period lets you grasp composite performance characteristics, such as "response time degrades under increased load but the error rate stays stable."'
  },
  'help.overall.tip.instance': {
    ja: '<strong>インスタンス別比較:</strong> インスタンスを切り替えて分布パターンを比較することで、特定のサーバーだけに問題が集中していないか確認できます。',
    ko: '<strong>인스턴스별 비교:</strong> 인스턴스를 전환하여 분포 패턴을 비교함으로써, 특정 서버에만 문제가 집중되어 있지 않은지 확인할 수 있습니다.',
    en: '<strong>Per-Instance Comparison:</strong> By switching instances and comparing distribution patterns, you can check whether problems are concentrated on a specific server.'
  },

  // Section 4 - Day x Hour heatmap
  'help.dayhour.h2': { ja: '4. 曜日 x 時間帯別 分析 (パターン分析)', ko: '4. 요일 x 시간대별 분석 (패턴 분석)', en: '4. Day × Hour Analysis (Pattern Analysis)' },
  'help.dayhour.p1': {
    ja: '曜日と時間帯ごとの平均値をヒートマップで可視化し、システムの稼働パターンを一目で把握できるチャートです。統計的な四分位範囲(IQR)に基づき、自動的にステータスを分類します。',
    ko: '요일과 시간대별 평균값을 히트맵으로 시각화하여 시스템의 가동 패턴을 한눈에 파악할 수 있는 차트입니다. 통계적 사분위 범위(IQR)에 기반해 상태를 자동으로 분류합니다.',
    en: 'This chart visualizes the average value for each day of week and hour as a heatmap, letting you grasp the system\'s operating patterns at a glance. It automatically classifies status based on the statistical interquartile range (IQR).'
  },
  'help.dayhour.h3_1': { ja: '4.1 ステータスの定義', ko: '4.1 상태 기준 구분', en: '4.1 Status Definitions' },
  'help.dayhour.status.stable': {
    ja: '<strong>安定 (Stable):</strong> 過去の統計から見て平均的な動作範囲（Q3以下）。',
    ko: '<strong>안정 (Stable):</strong> 과거 통계로 볼 때 평균적인 동작 범위(Q3 이하).',
    en: '<strong>Stable:</strong> The average operating range based on past statistics (at or below Q3).'
  },
  'help.dayhour.status.warning': {
    ja: '<strong>警戒 (Warning):</strong> 通常よりも高い値を示す時間帯（Q3 〜 Q3+1.5×IQR）。注意深い監視が必要です。',
    ko: '<strong>경계 (Warning):</strong> 평소보다 높은 값을 보이는 시간대(Q3 ~ Q3+1.5×IQR). 주의 깊은 모니터링이 필요합니다.',
    en: '<strong>Warning:</strong> A time window showing higher-than-usual values (Q3 to Q3+1.5×IQR). Careful monitoring is required.'
  },
  'help.dayhour.status.high': {
    ja: '<strong>高 (High):</strong> 明らかなピーク（Q3+1.5×IQR超）。リソースの限界に近い、または異常なアクセス集中が発生している可能性があります。',
    ko: '<strong>위험 (High):</strong> 명백한 피크(Q3+1.5×IQR 초과). 리소스 한계에 근접했거나 이례적인 접속 과밀이 발생했을 가능성이 있습니다.',
    en: '<strong>High:</strong> A clear peak (above Q3+1.5×IQR). It may be near a resource limit or experiencing an abnormal concentration of access.'
  },
  'help.dayhour.h3_2': { ja: '4.2 なぜこのチャートが重要か？', ko: '4.2 왜 이 차트가 중요한가?', en: '4.2 Why Is This Chart Important?' },
  'help.dayhour.why.pattern': {
    ja: '<strong>反復パターンの発見:</strong> 毎週同じ曜日・時間帯に負荷が集中する傾向を把握でき、予測可能な問題に対して事前に対策が立てられます。',
    ko: '<strong>반복 패턴 발견:</strong> 매주 같은 요일·시간대에 부하가 집중되는 경향을 파악할 수 있어, 예측 가능한 문제에 대해 사전에 대책을 세울 수 있습니다.',
    en: '<strong>Discovering Recurring Patterns:</strong> You can grasp tendencies where load concentrates on the same day and hour each week, allowing you to prepare countermeasures in advance for predictable problems.'
  },
  'help.dayhour.why.anomaly': {
    ja: '<strong>異常検知の基準:</strong> 普段は安定している時間帯に突然「警戒」や「高」が現れた場合、通常とは異なるアクセスパターンや障害の兆候を素早く察知できます。',
    ko: '<strong>이상 탐지의 기준:</strong> 평소 안정적인 시간대에 갑자기 \'경계\'나 \'위험\'이 나타나면, 평소와 다른 접속 패턴이나 장애 징후를 빠르게 감지할 수 있습니다.',
    en: '<strong>A Baseline for Anomaly Detection:</strong> When "Warning" or "High" suddenly appears in a normally stable time window, you can quickly detect access patterns that differ from the norm or signs of an incident.'
  },
  'help.dayhour.why.resource': {
    ja: '<strong>リソース計画:</strong> ピーク時間帯を正確に把握することで、スケーリングポリシーの設定やメンテナンス作業の最適な時間帯を決定できます。',
    ko: '<strong>리소스 계획:</strong> 피크 시간대를 정확히 파악함으로써, 스케일링 정책 설정이나 유지보수 작업의 최적 시간대를 결정할 수 있습니다.',
    en: '<strong>Resource Planning:</strong> By accurately identifying peak time windows, you can configure scaling policies and determine the optimal time for maintenance work.'
  },
  'help.dayhour.h3_3': { ja: '4.3 活用ガイド', ko: '4.3 활용 가이드', en: '4.3 Usage Guide' },
  'help.dayhour.tip.maintenance': {
    ja: '<strong>定期メンテナンス:</strong> 「安定」が続く時間帯（例：日曜深夜〜月曜早朝）をメンテナンスウィンドウとして選定します。',
    ko: '<strong>정기 유지보수:</strong> \'안정\'이 지속되는 시간대(예: 일요일 심야~월요일 새벽)를 유지보수 윈도우로 선정합니다.',
    en: '<strong>Scheduled Maintenance:</strong> Select time windows where "Stable" persists (e.g., late Sunday night to early Monday morning) as the maintenance window.'
  },
  'help.dayhour.tip.autoscaling': {
    ja: '<strong>オートスケーリング:</strong> 「警戒」以上が頻出する曜日・時間帯に合わせて、サーバーの自動スケーリングルールを設定します。',
    ko: '<strong>오토 스케일링:</strong> \'경계\' 이상이 자주 출현하는 요일·시간대에 맞춰 서버의 자동 스케일링 규칙을 설정합니다.',
    en: '<strong>Auto-Scaling:</strong> Configure the server\'s auto-scaling rules to match the days and hours where "Warning" or above frequently appears.'
  },
  'help.dayhour.tip.metric': {
    ja: '<strong>メトリクス切替による多面的分析:</strong> 応答時間 → エラー率 → CPU の順にメトリクスを切り替えて比較すると、ボトルネックの根本原因を特定しやすくなります。',
    ko: '<strong>지표 전환을 통한 다면적 분석:</strong> 응답 시간 → 에러율 → CPU 순으로 메트릭을 전환하며 비교하면, 병목의 근본 원인을 파악하기 쉬워집니다.',
    en: '<strong>Multi-Faceted Analysis by Switching Metrics:</strong> Switching metrics in the order Response Time → Error Rate → CPU for comparison makes it easier to identify the root cause of a bottleneck.'
  },
  'help.dayhour.tip.range': {
    ja: '<strong>期間絞り込みとの併用:</strong> メインチャートで特定の月を選択すると、季節やイベント期間ごとの曜日パターンの変化を比較分析できます。',
    ko: '<strong>기간 범위 지정과 연동 적용:</strong> 메인 차트에서 특정 월을 선택하면, 계절이나 이벤트 기간별 요일 패턴의 변화를 비교 분석할 수 있습니다.',
    en: '<strong>Combine With Period Selection:</strong> Selecting a specific month on the main chart lets you compare and analyze how day-of-week patterns change across seasons and event periods.'
  },

  'help.footer': {
    ja: '© 2026 JenniferSoft, Inc. All rights reserved.',
    ko: '© 2026 JenniferSoft, Inc. All rights reserved.',
    en: '© 2026 JenniferSoft, Inc. All rights reserved.'
  }
};

function detectLang() {
  try {
    const saved = localStorage.getItem(STORAGE_KEY);
    if (saved && SUPPORTED.includes(saved)) return saved;
  } catch (e) { /* localStorage unavailable */ }

  const nav = (navigator.language || navigator.userLanguage || 'ja').toLowerCase();
  if (nav.startsWith('ko')) return 'ko';
  if (nav.startsWith('en')) return 'en';
  if (nav.startsWith('ja')) return 'ja';
  return 'ja'; // default fallback
}

let currentLang = detectLang();

export function getLang() {
  return currentLang;
}

export function t(key) {
  const entry = DICT[key];
  if (!entry) return key;
  return entry[currentLang] ?? entry.ja ?? key;
}

export function setLang(lang) {
  if (!SUPPORTED.includes(lang) || lang === currentLang) return;
  try {
    localStorage.setItem(STORAGE_KEY, lang);
  } catch (e) { /* ignore */ }
  // Reload so dynamically rendered content (charts, heatmaps) is rebuilt.
  location.reload();
}

// Apply translations to all static [data-i18n*] elements within root.
export function applyStaticI18n(root = document) {
  root.querySelectorAll('[data-i18n]').forEach(el => {
    el.textContent = t(el.dataset.i18n);
  });
  root.querySelectorAll('[data-i18n-html]').forEach(el => {
    el.innerHTML = t(el.dataset.i18nHtml);
  });
  root.querySelectorAll('[data-i18n-title]').forEach(el => {
    el.title = t(el.dataset.i18nTitle);
  });
  root.querySelectorAll('[data-i18n-placeholder]').forEach(el => {
    el.placeholder = t(el.dataset.i18nPlaceholder);
  });
  document.documentElement.lang = currentLang;
}

function initLangSelector() {
  const sel = document.getElementById('langSelect');
  if (!sel) return;
  sel.value = currentLang;
  sel.addEventListener('change', (e) => setLang(e.target.value));
}

function init() {
  applyStaticI18n();
  initLangSelector();
}

if (document.readyState === 'loading') {
  document.addEventListener('DOMContentLoaded', init);
} else {
  init();
}
