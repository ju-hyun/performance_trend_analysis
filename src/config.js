// 이 파일은 빌드 과정에서 번들링되지만, 실제 값은 브라우저 런타임 시
// public/config.js에서 로드된 window.PTA_CONFIG 값을 참조합니다.
export const config = {
  // API 프록시용 베이스 URL (개발 환경 및 특정 API 호출 시 사용)
  BASE_URL: window.PTA_CONFIG?.BASE_URL || 'https://13.158.36.15:8443/',

  // API 서버의 도메인 또는 IP (프록시를 사용하지 않고 직접 호출할 경우 적용)
  API_DOMAIN: window.PTA_CONFIG?.API_DOMAIN || '',

  // API 인증에 사용될 토큰
  TOKEN: window.PTA_CONFIG?.TOKEN || ''
};
