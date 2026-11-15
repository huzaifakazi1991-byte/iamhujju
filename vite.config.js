
import { defineConfig, loadEnv } from 'vite';
import react from '@vitejs/plugin-react';

export default defineConfig(({ mode }) => {
  const { PORT = '3001' } = loadEnv(mode, process.cwd(), 'PORT');
  const development = mode === 'development';
  const securityHeaders = {
    'Content-Security-Policy': [
      "default-src 'self'",
      "base-uri 'self'",
      "connect-src 'self'" + (development ? ' ws: wss:' : ''),
      "font-src 'self' https://fonts.gstatic.com data:",
      "form-action 'self'",
      "frame-ancestors 'none'",
      "img-src 'self' data: blob:",
      "object-src 'none'",
      "script-src 'self'" + (development ? " 'unsafe-inline'" : ''),
      "script-src-attr 'none'",
      "style-src 'self' 'unsafe-inline' https://fonts.googleapis.com"
    ].join('; '),
    'Permissions-Policy': 'camera=(), microphone=(), geolocation=()',
    'Referrer-Policy': 'strict-origin-when-cross-origin',
    'X-Content-Type-Options': 'nosniff',
    'X-Frame-Options': 'DENY'
  };

  return {
    plugins: [react()],
    server: {
      host: '127.0.0.1',
      headers: securityHeaders,
      proxy: {
        '/api': {
          target: `http://127.0.0.1:${PORT}`,
          changeOrigin: true
        }
      }
    },
    preview: {
      host: '127.0.0.1',
      headers: securityHeaders
    }
  };
});
