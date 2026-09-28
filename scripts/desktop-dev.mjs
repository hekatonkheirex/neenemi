import { spawn } from 'node:child_process';
import path from 'node:path';
import { fileURLToPath } from 'node:url';

const root = path.resolve(path.dirname(fileURLToPath(import.meta.url)), '..');
const isWindows = process.platform === 'win32';
const npmCommand = isWindows ? 'npm.cmd' : 'npm';
const electronCommand = path.join(root, 'node_modules', '.bin', isWindows ? 'electron.cmd' : 'electron');
const apiPort = Number(process.env.DS_API_PORT) || 3210;
const rendererPort = Number(process.env.DS_RENDERER_PORT) || 5173;
const apiUrl = `http://127.0.0.1:${apiPort}`;
const rendererUrl = `http://127.0.0.1:${rendererPort}/`;
const children = new Set();
let stopping = false;
let apiProcess = null;
let apiRestartTimer = null;

function start(command, args, extraEnv = {}) {
  const child = spawn(command, args, {
    cwd: root,
    env: { ...process.env, ...extraEnv },
    stdio: 'inherit',
    shell: isWindows,
    windowsHide: true,
  });
  children.add(child);
  child.once('exit', () => children.delete(child));
  return child;
}

async function waitFor(url, child, timeoutMs = 30_000) {
  const deadline = Date.now() + timeoutMs;
  while (Date.now() < deadline) {
    if (child.exitCode !== null) {
      throw new Error(`El proceso terminó antes de responder: ${url}`);
    }
    try {
      const response = await fetch(url);
      if (response.ok) return;
    } catch {
      // El proceso todavía está iniciando.
    }
    await new Promise((resolve) => setTimeout(resolve, 200));
  }
  throw new Error(`No respondió dentro del tiempo esperado: ${url}`);
}

function stop(child) {
  if (!child || child.exitCode !== null || child.pid === undefined) return;
  if (isWindows) {
    spawn('taskkill', ['/pid', String(child.pid), '/t', '/f'], { windowsHide: true });
  } else {
    child.kill('SIGTERM');
  }
}

function watchApi(child) {
  child.once('exit', (code, signal) => {
    if (stopping || apiProcess !== child) return;
    apiProcess = null;
    console.error(`Data Systems Suite API terminó (código ${code ?? 'n/a'}, señal ${signal ?? 'n/a'}). Se intentará reiniciar.`);
    scheduleApiRestart();
  });
}

function scheduleApiRestart() {
  if (stopping || apiRestartTimer !== null) return;
  apiRestartTimer = setTimeout(() => {
    apiRestartTimer = null;
    void restartApi();
  }, 500);
}

async function restartApi() {
  if (stopping || apiProcess) return;
  const child = start(npmCommand, ['run', 'dev:server'], {
    PORT: String(apiPort),
    DS_DATA_DIR: dataDirectory,
  });
  apiProcess = child;
  watchApi(child);

  try {
    await waitFor(`${apiUrl}/api/health`, child, 10_000);
    console.log(`Data Systems Suite API restablecida: ${apiUrl}`);
  } catch (error) {
    if (stopping) return;
    console.error(error instanceof Error ? error.message : 'No se pudo reiniciar la API local.');
    if (apiProcess === child) stop(child);
  }
}

const dataDirectory = path.join(root, 'data');
apiProcess = start(npmCommand, ['run', 'dev:server'], {
  PORT: String(apiPort),
  DS_DATA_DIR: dataDirectory,
});
watchApi(apiProcess);
const renderer = start(npmCommand, ['run', 'dev:renderer', '--', '--port', String(rendererPort)], {
  BROWSER: 'none',
  DS_API_PORT: String(apiPort),
});

try {
  await Promise.all([
    waitFor(`${apiUrl}/api/health`, apiProcess),
    waitFor(rendererUrl, renderer),
  ]);

  const electron = start(electronCommand, ['electron/main.cjs'], {
    DS_RENDERER_URL: rendererUrl,
  });
  await new Promise((resolve) => electron.once('exit', resolve));
} finally {
  stopping = true;
  if (apiRestartTimer !== null) clearTimeout(apiRestartTimer);
  for (const child of children) stop(child);
}
