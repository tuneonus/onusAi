import react from '@vitejs/plugin-react';
import { defineConfig, loadEnv } from 'vite';

// https://vite.dev/config/
export default defineConfig(({ mode }) => {
  const env = loadEnv(mode, process.cwd(), '');
  const apiProxyTarget = env.VITE_DEV_API_PROXY_TARGET || 'http://127.0.0.1:3000';

  return {
    plugins: [react()],
    server: {
      fs: {
        // Allow importing the single-source branding config from ../packages/branding.
        allow: ['.', '../packages/branding'],
      },
      proxy: {
        // Forward /api requests in dev so HttpOnly session and CSRF cookies stay same-origin.
        '/api': {
          target: apiProxyTarget,
          changeOrigin: true,
        },
      },
    },
  };
});
