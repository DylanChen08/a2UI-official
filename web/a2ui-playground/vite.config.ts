import { defineConfig } from 'vite';
import react from '@vitejs/plugin-react';
import path from 'path';

const apiProxyTarget = process.env.VITE_API_PROXY_TARGET || 'http://localhost:3847';

export default defineConfig({
  plugins: [react()],
  resolve: {
    alias: {
      'a2ui-core': path.resolve(__dirname, '../../packages/a2ui-core/src'),
      'a2ui-react': path.resolve(__dirname, '../../packages/a2ui-react/src')
    }
  },
  server: {
    port: 3000,
    open: true,
    proxy: {
      '/api': {
        target: apiProxyTarget,
        changeOrigin: true
      }
    }
  }
});
