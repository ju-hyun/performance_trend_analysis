# AWS EC2 배포 가이드 (Performance Trend Analysis Tool)

이 문서는 본 프로젝트를 AWS EC2(Amazon Linux 2023 또는 Ubuntu) 환경에 배포하기 위한 단계별 절차를 설명합니다.

---

## 1. 사전 준비 (Prerequisites)

### AWS EC2 인스턴스 생성
- **OS**: Amazon Linux 2023 또는 Ubuntu 22.04 LTS 추천
- **보안 그룹(Security Group) 설정**:
  - `Inbound Rule`에 다음 포트를 추가합니다:
    - **SSH (22)**: 관리용
    - **HTTP (80)**: 웹 서비스용
    - **HTTPS (443)**: SSL 적용 시 (권장)
    - **커스텀 (5177)**: Nginx 없이 직접 테스트할 경우 (옵션)

---

## 2. 서버 환경 설정 (Server Setup)

인스턴스에 접속한 후 다음 명령어를 실행하여 필수 패키지를 설치합니다.

### Node.js 설치 (Node 18+ 권장)
```bash
# nvm을 통한 설치 (추천)
curl -o- https://raw.githubusercontent.com/nvm-sh/nvm/v0.39.5/install.sh | bash
source ~/.bashrc
nvm install 18
nvm use 18
```

### Nginx 설치 및 실행
```bash
# Amazon Linux 2023
sudo dnf install -y nginx
sudo systemctl enable nginx
sudo systemctl start nginx

# Ubuntu
sudo apt update
sudo apt install -y nginx
sudo systemctl enable nginx
sudo systemctl start nginx
```

---

## 3. 프로젝트 배포 (Project Deployment)

### 코드 가져오기 및 빌드
```bash
# 저장소 클론
git clone [REPOSITORY_URL]
cd performance-trend-analysis

# 의존성 설치
npm install

# 빌드 실행
npm run build
```
빌드가 완료되면 루트 디렉토리에 `dist/` 폴더가 생성됩니다.

### 환경 변수 설정
`.env` 파일을 생성하고 운영 환경에 맞는 백엔드 API 주소와 토큰을 입력합니다.
```bash
vi .env
```
내용 예시:
```env
VITE_API_BASE_URL=http://your-backend-api-server.com:8000
VITE_API_TOKEN=your_secure_token_here
```
> [!IMPORTANT]
> `npm run build`를 실행하기 전에 `.env` 파일이 존재해야 빌드 결과물에 환경 변수가 반영됩니다.

---

## 4. Nginx 웹 서버 설정 (Nginx Configuration)

Vite의 개발 서버 프록시 설정을 Nginx 설정으로 옮겨야 합니다.

### Nginx 설정 파일 수정
```bash
sudo vi /etc/nginx/conf.d/perf-analysis.conf
```

다음 내용을 복사하여 붙여넣습니다 (도메인 또는 IP 주소에 맞게 수정).
```nginx
server {
    listen 80;
    server_name your-domain.com; # 또는 EC2 퍼블릭 IP

    root /home/ec2-user/performance-trend-analysis/dist; # 프로젝트 빌드 경로
    index index.html;

    location / {
        try_files $uri $uri/ /index.html;
    }

    # 백엔드 API 프록시 설정 (Vite의 proxy 설정 대체)
    location /api {
        proxy_pass http://your-backend-api-server.com:8000;
        proxy_http_version 1.1;
        proxy_set_header Upgrade $http_upgrade;
        proxy_set_header Connection 'upgrade';
        proxy_set_header Host $host;
        proxy_cache_off;
        
        # CORS 및 보안 헤더 (필요시)
        add_header 'Cross-Origin-Resource-Policy' 'cross-origin';
    }
}
```

### 설정 적용
```bash
# 설정 문법 검사
sudo nginx -t

# Nginx 재시작
sudo systemctl restart nginx
```

---

## 5. 트러블슈팅 (Troubleshooting)

### 권한 문제 (Nginx 403 Forbidden)
Nginx 프로세스가 프로젝트의 `dist` 폴더에 접근할 수 있도록 상위 디렉토리에 실행 권한을 부여해야 할 수 있습니다.
```bash
chmod 755 /home/ec2-user
```

### API 연결 오류 (502 Bad Gateway)
Nginx 설정의 `proxy_pass` 주소가 실제 백엔드 서버에 도달 가능한지 확인하세요. AWS 보안 그룹에서 백엔드 서버로의 Outbound 트래픽이 허용되어야 합니다.

### 환경 변수 반영 안 됨
Vite는 빌드 타임에 환경 변수를 주입합니다. `.env` 파일을 수정한 후에는 반드시 `npm run build`를 다시 실행하고 Nginx를 새로고침해야 합니다.
