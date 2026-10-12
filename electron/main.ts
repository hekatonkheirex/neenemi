import { app, BrowserWindow, clipboard, dialog, ipcMain, protocol, shell, type IpcMainInvokeEvent, type IpcMainEvent } from 'electron';
import { resolve, join } from 'node:path';
import { pathToFileURL } from 'node:url';
import { writeFile, stat } from 'node:fs/promises';
import { createReadStream } from 'node:fs';
import { Readable } from 'node:stream';
import { randomUUID } from 'node:crypto';
import { ServiceClient } from './service-client';
import { safeFileName } from './services/markdown';
import { validateCall, validateId } from './validation';
import type { Method, Params } from '../src/shared/contracts';

protocol.registerSchemesAsPrivileged([{ scheme: 'neenemi-audio', privileges: { standard: true, secure: true, stream: true, supportFetchAPI: true } }]);
app.setName('neenemi');
let window: BrowserWindow | null = null;
let core: ServiceClient;
let closing = false;
let allowClose = false;
let captureStop: { id: number; resolve(): void; reject(error: Error): void } | undefined;
let captureRequestId = 0;
const audio = new Map<string, { id: string; path: string }>();
const rendererFile = resolve(__dirname, '../renderer/index.html');
const rendererURL = !app.isPackaged ? process.env.ELECTRON_RENDERER_URL : undefined;
const trustedURL = rendererURL ? new URL(rendererURL).href : pathToFileURL(rendererFile).href;
function assertSender(event: IpcMainInvokeEvent | IpcMainEvent): void {
  if (!window || event.sender !== window.webContents || event.senderFrame !== window.webContents.mainFrame || event.senderFrame.url !== trustedURL) throw new Error('Origen IPC no permitido.');
}
if (!app.requestSingleInstanceLock()) app.quit();
else {
  app.on('second-instance', () => { if (window?.isMinimized()) window.restore(); window?.focus(); });
  app.whenReady().then(async () => {
    const dataDirectory = process.env.NEENEMI_DATA_DIRECTORY ?? join(app.getPath('appData'), 'neenemi', 'data');
    const toolsDirectory = process.env.NEENEMI_TOOLS_DIRECTORY ?? (app.isPackaged ? join(process.resourcesPath, 'tools') : resolve('build/resources'));
    core = new ServiceClient(resolve(__dirname, 'service.js'), { dataDirectory, toolsDirectory, settingsPath: process.env.NEENEMI_SETTINGS_PATH ?? join(app.getPath('appData'), 'neenemi', 'settings.json') }, event => {
      if (!closing && !window?.isDestroyed()) window?.webContents.send('core:event', event);
    });
    protocol.handle('neenemi-audio', async request => {
      const url = new URL(request.url);
      const resource = url.host === 'playback' ? audio.get(url.pathname.slice(1)) : undefined;
      if (!resource || !['GET', 'HEAD'].includes(request.method)) return new Response(null, { status: 404 });
      try {
        const { size } = await stat(resource.path);
        let start = 0, end = size - 1;
        const range = request.headers.get('range');
        if (range) {
          const match = /^bytes=(\d*)-(\d*)$/.exec(range);
          if (!match || (!match[1] && !match[2])) return new Response(null, { status: 416 });
          if (!match[1]) start = Math.max(0, size - Number(match[2]));
          else { start = Number(match[1]); if (match[2]) end = Math.min(end, Number(match[2])); }
          if (start > end || start >= size) return new Response(null, { status: 416, headers: { 'Content-Range': `bytes */${size}` } });
        }
        const headers: Record<string, string> = { 'Content-Type': 'audio/wav', 'Accept-Ranges': 'bytes', 'Content-Length': String(end - start + 1), 'Cache-Control': 'no-store' };
        if (range) headers['Content-Range'] = `bytes ${start}-${end}/${size}`;
        const body = request.method === 'HEAD' ? null : Readable.toWeb(createReadStream(resource.path, { start, end })) as ReadableStream<Uint8Array>;
        return new Response(body, { status: range ? 206 : 200, headers });
      } catch { return new Response(null, { status: 404 }); }
    });
    window = new BrowserWindow({ width: 1150, height: 800, minWidth: 640, minHeight: 500, title: "Ñe'eñemi", backgroundColor: '#f5f6f4', webPreferences: { preload: resolve(__dirname, '../preload/index.cjs'), contextIsolation: true, sandbox: true, nodeIntegration: false, webSecurity: true } });
    window.webContents.setWindowOpenHandler(() => ({ action: 'deny' }));
    window.webContents.on('will-navigate', (event, url) => { if (url !== trustedURL) event.preventDefault(); });
    window.webContents.session.setPermissionRequestHandler((contents, permission, callback, details) => callback(contents === window?.webContents && contents.getURL() === trustedURL && permission === 'media' && 'mediaTypes' in details && Array.isArray(details.mediaTypes) && details.mediaTypes.length > 0 && details.mediaTypes.every(type => type === 'audio')));
    window.webContents.session.setPermissionCheckHandler((contents, permission, _origin, details) => contents === window?.webContents && contents?.getURL() === trustedURL && permission === 'media' && details.mediaType === 'audio');
    ipcMain.on('capture:stopped', (event, result: unknown) => {
      try {
        assertSender(event);
        if (!result || typeof result !== 'object' || !('id' in result) || result.id !== captureStop?.id) return;
        if ('error' in result && typeof result.error === 'string') captureStop?.reject(new Error(result.error));
        else captureStop?.resolve();
      } catch { /* Ignore messages from frames that do not own the capture. */ }
    });
    ipcMain.handle('core:call', async (event, method: Method, params: Params[Method]) => {
      assertSender(event); validateCall(method, params);
      if (method === 'delete' || method === 'settings') {
        for (const [token, item] of audio) if (method === 'settings' || (params && 'id' in params && item.id === params.id)) audio.delete(token);
      }
      return core.call(method, params);
    });
    ipcMain.handle('desktop:playback', async (event, id: unknown) => {
      assertSender(event); validateId(id);
      const path = await core.call('playback', { id });
      for (const [token, item] of audio) if (item.id === id) return `neenemi-audio://playback/${token}`;
      const token = randomUUID(); audio.set(token, { id, path });
      return `neenemi-audio://playback/${token}`;
    });
    ipcMain.handle('desktop:import', async event => {
      assertSender(event);
      const selected = await dialog.showOpenDialog(window!, { title: 'Importar grabaciones (cierra la aplicación de origen)', properties: ['openFile'], filters: [{ name: 'SQLite', extensions: ['sqlite', 'db'] }] });
      if (selected.canceled) return null;
      const confirmation = await dialog.showMessageBox(window!, { type: 'question', message: 'Importar grabaciones sin modificar el origen ni sobrescribir identificadores existentes.', buttons: ['Cancelar', 'Importar'], defaultId: 0, cancelId: 0 });
      return confirmation.response === 1 ? core.call('import', { path: selected.filePaths[0] }) : null;
    });
    ipcMain.handle('desktop:export', async (event, id: unknown, summary: unknown) => {
      assertSender(event); validateId(id); if (typeof summary !== 'boolean') throw new Error('Formato inválido.');
      const detail = await core.call('detail', { id });
      const selected = await dialog.showSaveDialog(window!, { defaultPath: safeFileName(detail.meeting.title + (summary ? '-resumen' : '')), filters: [{ name: 'Markdown', extensions: ['md'] }] });
      if (selected.canceled || !selected.filePath) return false;
      await writeFile(selected.filePath, await core.call('markdown', { id, summary }), 'utf8'); return true;
    });
    ipcMain.handle('desktop:copy', async (event, id: unknown, summary: unknown) => {
      assertSender(event); validateId(id); if (typeof summary !== 'boolean') throw new Error('Formato inválido.');
      clipboard.writeText(await core.call('markdown', { id, summary }));
    });
    ipcMain.handle('desktop:ollama', async event => { assertSender(event); await shell.openExternal('https://ollama.com/download/windows'); });
    window.on('close', event => {
      if (allowClose) return;
      event.preventDefault();
      if (closing) return;
      closing = true;
      void (async () => {
        try {
          const state = await core.call('state', undefined).catch(() => null);
          if (state?.recordingId) {
            const decision = await dialog.showMessageBox(window!, { type: 'question', message: 'Se guardará el audio conservado y el procesamiento continuará al abrir de nuevo.', buttons: ['Cancelar', 'Guardar y cerrar'], defaultId: 0, cancelId: 0 });
            if (decision.response !== 1) { closing = false; return; }
            const stopped = Promise.withResolvers<void>();
            captureStop = { id: ++captureRequestId, resolve: stopped.resolve, reject: stopped.reject };
            const timer = setTimeout(() => stopped.reject(new Error('La ventana no terminó de guardar el audio. No se cerrará sin conservarlo.')), 15000);
            window!.webContents.send('capture:stop', captureStop.id);
            try { await stopped.promise; } finally { clearTimeout(timer); captureStop = undefined; }
          }
          await core.close(); allowClose = true; window?.close(); app.quit();
        } catch (error) { closing = false; dialog.showErrorBox('No se pudo cerrar el núcleo', String(error)); }
      })();
    });
    await core.call('state', undefined);
    if (rendererURL) await window.loadURL(rendererURL); else await window.loadFile(rendererFile);
  }).catch(async error => {
    dialog.showErrorBox('No se pudo iniciar Ñe’eñemi', String(error));
    if (core) await core.close().catch(() => {});
    allowClose = true; app.quit();
  });
  app.on('window-all-closed', () => app.quit());
  app.on('before-quit', event => { if (!allowClose && window && !window.isDestroyed()) { event.preventDefault(); window.close(); } });
}
