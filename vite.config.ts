import { defineConfig } from 'vite';
import react from '@vitejs/plugin-react';

const apiPort = Number(process.env.DS_API_PORT) || 3210;

export default defineConfig({
  plugins: [react()],
  build: {
    // ExcelJS remains a deliberate on-demand vendor chunk for XLSX actions;
    // it must not inflate the initial renderer bundle or fail the build warning budget.
    chunkSizeWarningLimit: 1000,
  },
  server: {
    host: '127.0.0.1',
    port: 5173,
    strictPort: true,
    proxy: {
      '/api': {
        target: `http://127.0.0.1:${apiPort}`,
        // Preserve the renderer's Host so it matches Origin at the API's same-origin guard.
        changeOrigin: false,
      },
    },
  },
});
