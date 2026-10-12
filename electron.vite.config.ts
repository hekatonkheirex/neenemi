import { defineConfig } from 'electron-vite';
import react from '@vitejs/plugin-react';
import tailwindcss from '@tailwindcss/vite';
import { resolve } from 'node:path';
import { randomBytes } from 'node:crypto';
export default defineConfig(({ command }) => {
  const devNonce = command === 'serve' ? randomBytes(18).toString('base64') : undefined;
  return {
  main: { build: { rollupOptions: { input: { index: resolve('electron/main.ts'), service: resolve('electron/service-worker.ts') }, output: { entryFileNames: '[name].js' } } } },
  preload: { build: { rollupOptions: { input: resolve('electron/preload.ts'), output: { format: 'cjs', entryFileNames: 'index.cjs' } } } },
  renderer: {
    root: '.',
    html: devNonce ? { cspNonce: devNonce } : undefined,
    plugins: [react(), tailwindcss(), {
      name: 'neenemi-development-csp',
      apply: 'serve',
      transformIndexHtml: {
        order: 'pre',
        handler(html) {
          return html.replace("script-src 'self';", `script-src 'self' 'nonce-${devNonce}';`)
            .replace("style-src 'self';", `style-src 'self' 'nonce-${devNonce}';`);
        }
      }
    }],
    build: { rollupOptions: { input: resolve('index.html') } }
  }
  };
});
