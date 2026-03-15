import { defineConfig, loadEnv } from 'vite';

export default defineConfig(({ mode }) => {
    const env = loadEnv(mode, process.cwd());

    if (!env.VITE_API_BASE_URL) {
        console.error('\x1b[31m%s\x1b[0m', 'ERR_CONFIG_MISSING: VITE_API_BASE_URL is not defined in .env file.');
    }

    return {
        server: {
            host: '0.0.0.0',
            port: 5177,
            strictPort: true,
            proxy: env.VITE_API_BASE_URL ? {
                '/api': {
                    target: env.VITE_API_BASE_URL,
                    changeOrigin: true,
                    secure: false, // 스스로 서명한 인증서 에러 우회
                    onProxyRes: (proxyRes) => {
                        proxyRes.headers['Cross-Origin-Resource-Policy'] = 'cross-origin';
                    }
                }
            } : {},
            headers: {
                'Content-Security-Policy': "frame-ancestors 'self' * file://*",
                'Cross-Origin-Resource-Policy': 'cross-origin',
                'Cross-Origin-Embedder-Policy': 'credentialless',
                'Cross-Origin-Opener-Policy': 'same-origin'
            }
        },
        build: {
            rollupOptions: {
                input: {
                    main: 'analysis_perf_trend.html'
                }
            }
        }
    };
});
