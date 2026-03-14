export const config = {
  // API 서버의 도메인 또는 IP (프록시를 사용하지 않고 직접 호출할 경우 적용)
  // 값이 비어있으면 브라우저의 현재 오리진(프록시)을 사용합니다.
  API_DOMAIN: import.meta.env.VITE_API_EXTERNAL_URL || '', 
  
  // API 인증에 사용될 토큰 (.env 파일의 VITE_API_TOKEN 참조)
  TOKEN: import.meta.env.VITE_API_TOKEN || 'd5HJuONXNZf'
};
