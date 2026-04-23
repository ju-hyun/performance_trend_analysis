import { defineConfig } from 'vite';

export default defineConfig(() => {
    return {
        base: './', // 빌드 시 상대 경로 사용
        server: {
            host: '0.0.0.0',
            port: 5177,
            strictPort: true,
            proxy: {
                '/api': {
                    target: 'https://13.158.36.15:8443/',
                    changeOrigin: true,
                    secure: false,
                    onProxyRes: (proxyRes) => {
                        proxyRes.headers['Cross-Origin-Resource-Policy'] = 'cross-origin';
                    }
                }
            },
            headers: {
                'Content-Security-Policy': "frame-ancestors 'self' * file://*",
                'Cross-Origin-Resource-Policy': 'cross-origin',
                'Cross-Origin-Embedder-Policy': 'credentialless',
                'Cross-Origin-Opener-Policy': 'same-origin'
            }
        },
        build: {
            assetsDir: 'pta/asserts',
            rollupOptions: {
                input: {
                    main: 'index.html',
                    pta: 'pta/index.html',
                    help: 'pta/help.html'
                },
                output: {
                    entryFileNames: 'pta/asserts/[name]-[hash].js',
                    chunkFileNames: 'pta/asserts/[name]-[hash].js',
                    assetFileNames: 'pta/asserts/[name]-[hash].[ext]'
                }
            }
        }
    };
});
