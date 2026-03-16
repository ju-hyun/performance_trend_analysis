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
  BASE_URL: import.meta.env.VITE_API_BASE_URL || 'http://your-api-server:7900/',
  API_DOMAIN: import.meta.env.VITE_API_EXTERNAL_URL || 'https://your-api-server:8443',
  TOKEN: import.meta.env.VITE_API_TOKEN || 'your_token_here'
};
```

#### 방법 B: `.env` 파일로 설정 (환경별 분리)

프로젝트 루트에 `.env` 파일을 생성하고 환경 변수를 입력합니다.
```env
VITE_API_BASE_URL=http://your-api-server:7900/
VITE_API_TOKEN=your_token_here
```

> [!NOTE]
> `.env` 파일에 값이 설정되어 있으면 `config.js`의 기본값보다 우선 적용됩니다.

#### 설정 항목 설명

| 항목 | 환경 변수명 | 설명 |
|---|---|---|
| `BASE_URL` | `VITE_API_BASE_URL` | Vite 개발 서버의 API 프록시 대상 주소. 개발 모드(`npm run dev`)에서 `/api` 요청을 이 주소로 프록시합니다. |
| `API_DOMAIN` | `VITE_API_EXTERNAL_URL` | 프록시 없이 API 서버에 직접 요청할 때 사용하는 주소. 빌드 후 Nginx 등에서 프록시를 설정하지 않을 경우 사용됩니다. |
| `TOKEN` | `VITE_API_TOKEN` | JENNIFER5 OpenAPI 인증에 사용되는 토큰. |

> [!NOTE]
> `API_DOMAIN` 에 값이 설정되어 있으면 `BASE_URL`의 값보다 우선 적용됩니다.

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
> `.env` 파일의 환경 변수는 **빌드 시점에** 결과물에 주입됩니다. `.env`를 수정한 후에는 반드시 `npm run build`를 다시 실행해야 합니다.

### EC2 배포
AWS EC2 환경에서의 상세한 배포 절차(Nginx 설정, HTTPS 적용 등)는 [DEPLOY_GUIDE_EC2.md](./DEPLOY_GUIDE_EC2.md)를 참고하세요.
