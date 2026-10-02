const { app, BrowserWindow, dialog, ipcMain, shell } = require('electron');
const { fork } = require('node:child_process');
const fs = require('node:fs/promises');
const path = require('node:path');
const { migrateLegacyDataDirectory, listLegacyDataSources } = require('./migrate-data.cjs');
const { attachUnloadGuard } = require('./unload-guard.cjs');

const WINDOW_BACKGROUND_COLOR = '#0b1220';
let localApiProcess;
let activeRendererUrl;
let shuttingDown = false;
let restoreRestartRequested = false;
let apiRestartTimer;
let apiRestartAttempts = 0;
let apiReadyAt = 0;

function recoverLocalApi() {
  if (shuttingDown || apiRestartTimer) return;
  if (apiRestartAttempts >= 3) {
    void dialog.showMessageBox({
      type: 'error',
      title: 'API local desconectada',
      message: 'No se pudo recuperar la API local.',
      detail: 'Comprueba el espacio disponible y los permisos del directorio de datos. Puedes volver a intentar iniciar el servicio.',
      buttons: ['Reintentar', 'Cerrar DCSS Suite'],
      defaultId: 0,
      cancelId: 1,
    }).then(({ response }) => {
      if (response === 1) app.quit();
      else {
        apiRestartAttempts = 0;
        recoverLocalApi();
      }
    });
    return;
  }
  apiRestartAttempts += 1;
  apiRestartTimer = setTimeout(() => {
    apiRestartTimer = undefined;
    if (!shuttingDown) void startLocalApi(true).catch((error) => {
      console.error('No se pudo recuperar la API local:', error);
      recoverLocalApi();
    });
  }, 1000 * apiRestartAttempts);
}

if (process.platform === 'linux' && process.env.XDG_SESSION_TYPE === 'wayland' && process.env.WAYLAND_DISPLAY) {
  app.commandLine.appendSwitch('ozone-platform-hint', 'auto');
}

// La suite es un panel operativo y no necesita aceleración 3D. En Linux esto evita
// cierres del proceso GPU en equipos o sesiones Wayland sin un dispositivo usable.
// Se puede reactivar para una instalación concreta con DS_ENABLE_GPU=true.
if (process.platform === 'linux' && process.env.DS_ENABLE_GPU !== 'true') {
  app.commandLine.appendSwitch('disable-gpu');
  app.commandLine.appendSwitch('disable-gpu-compositing');
  app.disableHardwareAcceleration();
}

if (process.platform === 'win32') {
  app.setAppUserModelId('com.datasystems.dcss');
}

const isLocalUrl = (value) => {
  try {
    const url = new URL(value);
    return url.protocol === 'http:' && (url.hostname === '127.0.0.1' || url.hostname === 'localhost');
  } catch {
    return false;
  }
};

function createWindow(rendererUrl) {
  const window = new BrowserWindow({
    width: 1440,
    height: 920,
    minWidth: 960,
    minHeight: 680,
    title: 'DCSS Suite',
    backgroundColor: WINDOW_BACKGROUND_COLOR,
    icon: app.isPackaged ? path.join(process.resourcesPath, 'icon.png') : path.join(__dirname, '..', 'build', 'icon.png'),
    webPreferences: {
      contextIsolation: true,
      nodeIntegration: false,
      preload: path.join(__dirname, 'preload.cjs'),
      sandbox: true,
    },
  });

  attachUnloadGuard(window, dialog);

  window.webContents.setWindowOpenHandler(({ url }) => {
    if (isLocalUrl(url)) return { action: 'deny' };
    void shell.openExternal(url);
    return { action: 'deny' };
  });

  window.webContents.on('will-navigate', (event, url) => {
    if (isLocalUrl(url)) return;
    event.preventDefault();
    void shell.openExternal(url);
  });

  void window.loadURL(rendererUrl);
}

ipcMain.handle('datasystems:save-current-page-as-pdf', async (event, options) => {
  const window = BrowserWindow.fromWebContents(event.sender);
  if (!window) throw new Error('No se encontró la ventana de DCSS Suite.');

  const requestedName = options && typeof options.defaultFileName === 'string'
    ? options.defaultFileName
    : 'dcss-suite-informe';
  const landscape = options && options.landscape === true;
  const defaultFileName = `${safeFileName(requestedName)}.pdf`;
  const dialogResult = await dialog.showSaveDialog(window, {
    title: 'Guardar informe PDF',
    defaultPath: path.join(app.getPath('documents'), defaultFileName),
    filters: [{ name: 'Documento PDF', extensions: ['pdf'] }],
    properties: ['showOverwriteConfirmation'],
  });

  if (dialogResult.canceled || !dialogResult.filePath) return { saved: false };

  const filePath = dialogResult.filePath.toLowerCase().endsWith('.pdf')
    ? dialogResult.filePath
    : `${dialogResult.filePath}.pdf`;
  // Chromium paints PDF page margins with the BrowserWindow background,
  // ignoring the renderer's @media print background in that area.
  window.setBackgroundColor('#ffffff');
  let pdf;
  try {
    pdf = await window.webContents.printToPDF({
      pageSize: 'A4',
      landscape,
      printBackground: true,
      displayHeaderFooter: false,
    });
  } finally {
    window.setBackgroundColor(WINDOW_BACKGROUND_COLOR);
  }
  await fs.writeFile(filePath, pdf);
  return { saved: true, filePath };
});

ipcMain.handle('datasystems:save-structured-report-as-pdf', async (event, options) => {
  const parentWindow = BrowserWindow.fromWebContents(event.sender);
  if (!parentWindow) throw new Error('No se encontró la ventana de DCSS Suite.');

  const html = options && typeof options.html === 'string' ? options.html : '';
  if (!html.startsWith('<!doctype html>') || html.length > 5_000_000 || /<\s*script\b/i.test(html)) {
    throw new Error('El documento del informe PDF no es válido.');
  }

  const requestedName = options && typeof options.defaultFileName === 'string'
    ? options.defaultFileName
    : 'informe-data-systems';
  const defaultFileName = `${safeFileName(requestedName)}.pdf`;
  const dialogResult = await dialog.showSaveDialog(parentWindow, {
    title: 'Guardar informe PDF',
    defaultPath: path.join(app.getPath('documents'), defaultFileName),
    filters: [{ name: 'Documento PDF', extensions: ['pdf'] }],
    properties: ['showOverwriteConfirmation'],
  });

  if (dialogResult.canceled || !dialogResult.filePath) return { saved: false };

  const filePath = dialogResult.filePath.toLowerCase().endsWith('.pdf')
    ? dialogResult.filePath
    : `${dialogResult.filePath}.pdf`;
  const reportWindow = new BrowserWindow({
    show: false,
    width: 1200,
    height: 1600,
    backgroundColor: '#ffffff',
    webPreferences: {
      contextIsolation: true,
      nodeIntegration: false,
      sandbox: true,
    },
  });
  reportWindow.webContents.setWindowOpenHandler(() => ({ action: 'deny' }));

  try {
    await reportWindow.loadURL(`data:text/html;charset=utf-8,${encodeURIComponent(html)}`);
    await reportWindow.webContents.executeJavaScript('document.fonts.ready.then(() => true)');
    const pdf = await reportWindow.webContents.printToPDF({
      pageSize: 'A4',
      printBackground: true,
      displayHeaderFooter: false,
      preferCSSPageSize: true,
      generateDocumentOutline: true,
    });
    await fs.writeFile(filePath, pdf);
  } finally {
    if (!reportWindow.isDestroyed()) reportWindow.destroy();
  }

  return { saved: true, filePath };
});

function startLocalApi(reloadWindowsAfterReady = false) {
  const apiScript = path.join(__dirname, 'api-child.cjs');
  // app.asar is virtual, so a child process must use a real filesystem directory as cwd.
  const workingDirectory = app.isPackaged ? process.resourcesPath : path.join(__dirname, '..');
  const child = fork(apiScript, [], {
    cwd: workingDirectory,
    execPath: process.execPath,
    env: {
      ...process.env,
      DS_SERVER_AUTOSTART: 'false',
      DS_DATA_DIR: path.join(app.getPath('userData'), 'data'),
      ELECTRON_RUN_AS_NODE: '1',
    },
    stdio: ['ignore', 'pipe', 'pipe', 'ipc'],
  });
  localApiProcess = child;
  child.stdout?.on('data', (chunk) => process.stdout.write(`[api] ${chunk}`));
  child.stderr?.on('data', (chunk) => process.stderr.write(`[api] ${chunk}`));

  return new Promise((resolve, reject) => {
    let settled = false;
    child.on('message', (message) => {
      if (!message || typeof message !== 'object') return;
      if (message.type === 'restart-after-restore') {
        restoreRestartRequested = true;
        return;
      }
      if (message.type === 'ready' && Number.isInteger(message.port) && message.port > 0) {
        settled = true;
        apiReadyAt = Date.now();
        const rendererUrl = `http://127.0.0.1:${message.port}/`;
        activeRendererUrl = rendererUrl;
        if (reloadWindowsAfterReady) {
          for (const window of BrowserWindow.getAllWindows()) void window.loadURL(rendererUrl);
        }
        resolve(rendererUrl);
        return;
      }
      if (message.type === 'error') {
        const error = new Error(typeof message.message === 'string' ? message.message : 'La API local no pudo iniciar.');
        if (!settled) reject(error);
        else console.error('API local:', error.message);
      }
    });
    child.on('error', (error) => {
      if (!settled) reject(error);
      else console.error('API local:', error);
    });
    child.on('exit', (code, signal) => {
      if (localApiProcess !== child) return;
      localApiProcess = undefined;
      if (!settled) {
        reject(new Error(`La API local terminó antes de iniciar${signal ? ` (${signal})` : ` con código ${code ?? 'desconocido'}`}.`));
        return;
      }
      if (shuttingDown) return;
      if (Date.now() - apiReadyAt > 60000) apiRestartAttempts = 0;
      if (restoreRestartRequested) {
        restoreRestartRequested = false;
        void startLocalApi(true).catch((error) => {
          console.error('No se pudo reiniciar la API después de restaurar la base:', error);
          recoverLocalApi();
        });
      } else {
        console.error(`La API local terminó${signal ? ` (${signal})` : ` con código ${code ?? 'desconocido'}`}.`);
        recoverLocalApi();
      }
    });
  });
}

function stopLocalApi() {
  shuttingDown = true;
  clearTimeout(apiRestartTimer);
  apiRestartTimer = undefined;
  const child = localApiProcess;
  localApiProcess = undefined;
  if (child && !child.killed) {
    child.kill();
  }
}

const hasSingleInstanceLock = app.requestSingleInstanceLock();

if (!hasSingleInstanceLock) {
  app.quit();
} else {
  app.on('second-instance', () => {
    const window = BrowserWindow.getAllWindows()[0];
    if (!window) return;
    if (window.isMinimized()) window.restore();
    window.focus();
  });

  app.whenReady().then(async () => {
    if (app.isPackaged) {
      const appData = app.getPath('appData');
      const userData = app.getPath('userData');
      const existingDatabase = await fs.access(path.join(userData, 'data', 'dcss.sqlite')).then(
        () => true,
        (error) => {
          if (error.code === 'ENOENT') return false;
          throw error;
        },
      );
      const sources = existingDatabase ? [] : await listLegacyDataSources(appData, userData);
      let selectedSource;
      if (sources.length > 1) {
        const { response } = await dialog.showMessageBox({
          type: 'warning',
          title: 'Seleccionar datos anteriores',
          message: 'Se encontraron dos perfiles anteriores de DCSS Suite.',
          detail: `Elige qué base copiar a la nueva instalación. Ningún perfil anterior se eliminará.\n\n${sources.map((source, index) => `${index + 1}. ${path.join(source, 'datasystems.sqlite')}`).join('\n')}`,
          buttons: ['Usar perfil 1', 'Usar perfil 2', 'Cancelar'],
          defaultId: 2,
          cancelId: 2,
          noLink: true,
        });
        if (response === 2) {
          app.quit();
          return;
        }
        selectedSource = sources[response];
      }
      await migrateLegacyDataDirectory(appData, userData, selectedSource);
    }
    activeRendererUrl = process.env.DS_RENDERER_URL || await startLocalApi();
    createWindow(activeRendererUrl);
    app.on('activate', () => {
      if (BrowserWindow.getAllWindows().length === 0 && activeRendererUrl) createWindow(activeRendererUrl);
    });
  }).catch((error) => {
    console.error('No se pudo iniciar DCSS Suite:', error);
    dialog.showErrorBox('No se pudo iniciar DCSS Suite', `${error instanceof Error ? error.message : String(error)}\n\nRevisa el directorio de datos antes de reintentar. No se modificaron los perfiles anteriores.`);
    app.quit();
  });
}

app.on('window-all-closed', () => {
  if (process.platform !== 'darwin') {
    stopLocalApi();
    app.quit();
  }
});

app.on('before-quit', () => {
  stopLocalApi();
});

function safeFileName(value) {
  return value
    .normalize('NFD')
    .replace(/[\u0300-\u036f]/g, '')
    .replace(/[^a-zA-Z0-9]+/g, '-')
    .replace(/^-+|-+$/g, '')
    .slice(0, 80)
    .toLowerCase() || 'dcss-suite-informe';
}
