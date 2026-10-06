import { defineConfig } from 'vite';
import react from '@vitejs/plugin-react';
import tailwindcss from '@tailwindcss/vite';
import { createRequire } from 'node:module';
import inject from '@rollup/plugin-inject';
import { fileURLToPath } from 'node:url';

const require = createRequire(import.meta.url);
const rendererBuild = !process.env.VITEST;
const browserGlobals = fileURLToPath(new URL('./src/core/exceljs-browser-globals.js', import.meta.url));

const apiPort = Number(process.env.DS_API_PORT) || 3210;

export default defineConfig({
  plugins: [
    react(),
    tailwindcss(),
    rendererBuild && {
      ...inject({
        Buffer: [browserGlobals, 'Buffer'],
        process: [browserGlobals, 'process'],
      }),
      enforce: 'post',
    },
  ],
  define: rendererBuild ? { global: 'globalThis' } : {},
  optimizeDeps: {
    entries: ['index.html'],
    esbuildOptions: rendererBuild
      ? {
          inject: [browserGlobals],
          define: { global: 'globalThis' },
          plugins: [{
            name: 'resolve-exceljs-browser-globals',
            setup(build) {
              // Vite's scanner externalizes JS outside node_modules; injected files must be bundled.
              build.onResolve({ filter: /exceljs-browser-globals\.js$/ }, (args) => {
                if (args.path === browserGlobals) return { path: browserGlobals, external: false };
              });
            },
          }],
        }
      : {},
  },
  resolve: {
    // Rebuild ExcelJS with the patched UUID dependency instead of its stale UMD bundle.
    alias: rendererBuild
      ? [
          { find: /^exceljs$/, replacement: require.resolve('exceljs/lib/exceljs.bare.js') },
          {
            find: /^jszip$/,
            replacement: require.resolve('jszip/lib/index.js'),
            customResolver: () => require.resolve('jszip/lib/index.js'),
          },
          { find: /^buffer$/, replacement: require.resolve('buffer/') },
          { find: /^events$/, replacement: require.resolve('events/') },
          { find: /^process$/, replacement: require.resolve('process/browser.js') },
          { find: /^stream$/, replacement: require.resolve('stream-browserify') },
          { find: /^string_decoder$/, replacement: require.resolve('string_decoder/') },
          { find: /^util$/, replacement: require.resolve('util/') },
          {
            find: /^crypto$/,
            replacement: fileURLToPath(new URL('./src/core/exceljs-browser-crypto.js', import.meta.url)),
          },
        ]
      : [],
  },
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
