import fs from 'node:fs';
import path from 'node:path';
import { describe, expect, it } from 'vitest';

const root = path.resolve(import.meta.dirname, '..');

describe('development entrypoint', () => {
  it('uses one command to orchestrate API, renderer and Electron', () => {
    const packageJson = JSON.parse(fs.readFileSync(path.join(root, 'package.json'), 'utf8'));
    const script = fs.readFileSync(path.join(root, 'scripts/desktop-dev.mjs'), 'utf8');

    expect(packageJson.scripts.dev).toBe('node scripts/desktop-dev.mjs');
    expect(packageJson.scripts['dev:renderer']).toContain('vite');
    expect(script).toContain("['run', 'dev:server']");
    expect(script).toContain("['run', 'dev:renderer',");
    expect(script).toContain('DS_API_PORT');
    expect(script).toContain('DS_RENDERER_PORT');
    expect(script).toContain('watchApi');
    expect(script).toContain('restartApi');
    expect(script).toContain('electronCommand');

    const viteConfig = fs.readFileSync(path.join(root, 'vite.config.ts'), 'utf8');
    expect(viteConfig).toContain('process.env.DS_API_PORT');

    const electronMain = fs.readFileSync(path.join(root, 'electron/main.cjs'), 'utf8');
    const preload = fs.readFileSync(path.join(root, 'electron/preload.cjs'), 'utf8');
    expect(electronMain).toContain("app.requestSingleInstanceLock()");
    expect(electronMain).toContain("app.commandLine.appendSwitch('ozone-platform-hint', 'auto')");
    expect(electronMain).toContain("app.commandLine.appendSwitch('disable-gpu')");
    expect(electronMain).toContain("app.disableHardwareAcceleration()");
    expect(electronMain).toContain("preload: path.join(__dirname, 'preload.cjs')");
    expect(electronMain).toContain("ipcMain.handle('datasystems:save-current-page-as-pdf'");
    expect(preload).toContain("contextBridge.exposeInMainWorld('dataSystemsDesktop'");
  });
});
