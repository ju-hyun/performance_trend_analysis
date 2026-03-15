export const config = {
  // API 프록시용 베이스 URL (Vite 프로젝트 설정용)
  BASE_URL: import.meta.env.VITE_API_BASE_URL || '',

  // API 서버의 도메인 또는 IP (프록시를 사용하지 않고 직접 호출할 경우 적용)
  API_DOMAIN: import.meta.env.VITE_API_EXTERNAL_URL || '',

  // API 인증에 사용될 토큰 (.env 파일의 VITE_API_TOKEN 참조)
  TOKEN: import.meta.env.VITE_API_TOKEN || ''
};
