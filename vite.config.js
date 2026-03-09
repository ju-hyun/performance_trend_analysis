import { defineConfig } from 'vite';

export default defineConfig({
    server: {
        host: '0.0.0.0',
        port: 5177,
        strictPort: false,
        proxy: {
            '/api': {
                target: 'https://13.113.18.12:8443',
                changeOrigin: true,
                secure: false // 스스로 서명한 인증서 에러 우회
            }
        }
    }
});
