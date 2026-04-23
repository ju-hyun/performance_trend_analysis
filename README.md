# Performance Trend Analysis

JENNIFER5 OpenAPI를 활용한 성능 추이 분석 도구입니다.

---

## 기술 스택

- **Vite** (빌드 도구)
- **Chart.js** (차트 시각화)
- **Flatpickr** (날짜 선택)

---

## 빠른 시작 (Quick Start)

### 1. 의존성 설치
```bash
npm install
```

### 2. 설정 (Configuration)

API 연결 정보는 두 가지 방법으로 설정할 수 있습니다.

#### 방법 A: `src/config.js`에서 직접 설정 (간편)

`src/config.js` 파일의 기본값을 직접 수정합니다.
```javascript
export const config = {
### 2. 환경 설정 (Runtime Configuration)

빌드 후에도 설정을 변경할 수 있도록 `public/config.js` 파일을 사용합니다.

1.  `public/config.js` 파일을 열어 API 서버 주소와 토큰을 설정합니다.
2.  이 파일은 빌드 후 `dist/config.js` 경로에 위치하며, 메모장 등으로 수정 가능합니다.

#### 설정 항목 설명

| 항목 | 변수명 | 설명 |
|---|---|---|
| `BASE_URL` | `window.PTA_CONFIG.BASE_URL` | Vite 개발 서버의 API 프록시 대상 주소. |
| `API_DOMAIN` | `window.PTA_CONFIG.API_DOMAIN` | 프록시 없이 API 서버에 직접 요청할 때 사용하는 주소. (Nginx 배포 시 비워둠) |
| `TOKEN` | `window.PTA_CONFIG.TOKEN` | JENNIFER5 OpenAPI 인증에 사용되는 토큰. |

> [!NOTE]
> `dist/config.js`를 수정한 후에는 브라우저를 새로고침하면 변경사항이 즉시 반영됩니다. 다시 빌드할 필요가 없습니다.

### 3. 개발 서버 실행
```bash
npm run dev
```
브라우저에서 `http://localhost:5177` 으로 접속합니다.

---

## 배포 (Production Deployment)

### 빌드
```bash
npm run build
```
빌드 결과물은 `dist/` 폴더에 생성됩니다.

> [!IMPORTANT]
> 이제 `.env` 파일은 사용하지 않습니다. 모든 설정은 `public/config.js`에서 관리하며, 빌드 후에도 `dist/config.js`를 수정하여 즉시 반영할 수 있습니다.

### EC2 배포
AWS EC2 환경에서의 상세한 배포 절차(Nginx 설정, HTTPS 적용 등)는 [DEPLOY_GUIDE_EC2.md](./DEPLOY_GUIDE_EC2.md)를 참고하세요.
