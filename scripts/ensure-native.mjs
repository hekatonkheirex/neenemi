import fs from 'node:fs';
import path from 'node:path';
import { spawnSync } from 'node:child_process';
import { fileURLToPath } from 'node:url';

const root = path.resolve(path.dirname(fileURLToPath(import.meta.url)), '..');
const isWindows = process.platform === 'win32';
const npmCommand = isWindows ? 'npm.cmd' : 'npm';
const electronRebuildCliPath = path.join(root, 'node_modules', '@electron', 'rebuild', 'lib', 'cli.js');
const electronCliPath = path.join(root, 'node_modules', 'electron', 'cli.js');
const packagePath = path.join(root, 'node_modules', 'electron', 'package.json');
const electronVersion = JSON.parse(fs.readFileSync(packagePath, 'utf8')).version;
const target = process.argv.includes('--node') ? 'node' : 'electron';
const nativeModulePath = path.join(root, 'node_modules', 'better-sqlite3', 'build', 'Release', 'better_sqlite3.node');
const cacheDirectory = path.join(root, 'node_modules', '.datasystems-native');
const cacheKey = target === 'node'
  ? `node-${process.versions.modules}`
  : `electron-${electronVersion}-${process.platform}-${process.arch}`;
const cachedModulePath = path.join(cacheDirectory, cacheKey, 'better_sqlite3.node');

if (target === 'electron' && isWindows && root.includes(' ')) {
  console.error('La ruta del proyecto contiene espacios y puede impedir la compilación nativa de better-sqlite3.');
  console.error('Mueve dcss-suite a una ruta simple, por ejemplo C:\\dev\\dcss-suite, y vuelve a empaquetar.');
  process.exit(1);
}

if (target === 'electron' && !fs.existsSync(electronRebuildCliPath)) {
  console.error('Falta @electron/rebuild. Ejecuta npm ci en dcss-suite y vuelve a empaquetar.');
  process.exit(1);
}

if (probeNativeModule(target).status === 0) {
  cacheNativeModule();
  process.exit(0);
}

if (fs.existsSync(cachedModulePath)) {
  fs.mkdirSync(path.dirname(nativeModulePath), { recursive: true });
  fs.copyFileSync(cachedModulePath, nativeModulePath);
  if (probeNativeModule(target).status === 0) process.exit(0);
}

console.log(target === 'node'
  ? `Recompilando better-sqlite3 para Node ${process.versions.node}…`
  : `Recompilando better-sqlite3 para Electron ${electronVersion}…`);
const rebuildEnvironment = { ...process.env };
delete rebuildEnvironment.npm_config_runtime;
delete rebuildEnvironment.npm_config_target;
delete rebuildEnvironment.npm_config_disturl;

const rebuild = target === 'electron'
  ? spawnSync(process.execPath, [
      electronRebuildCliPath,
      '--force',
      '--which-module', 'better-sqlite3',
      '--version', electronVersion,
      '--module-dir', root,
    ], {
      cwd: root,
      env: rebuildEnvironment,
      stdio: 'inherit',
    })
  : spawnSync(npmCommand, ['rebuild', 'better-sqlite3'], {
      cwd: root,
      env: rebuildEnvironment,
      shell: isWindows,
      stdio: 'inherit',
    });

if (rebuild.status !== 0) {
  console.error(`No se pudo recompilar better-sqlite3 para ${target}. Revisa que los scripts de instalación estén habilitados para ese paquete.`);
  if (rebuild.error) console.error(rebuild.error.message);
  process.exit(rebuild.status ?? 1);
}

const probe = probeNativeModule(target);
if (probe.status !== 0) {
  console.error(`better-sqlite3 todavía no es compatible con el ABI de ${target}.`);
  if (probe.error) console.error(probe.error.message);
  if (probe.stderr?.trim()) console.error(probe.stderr.trim());
  process.exit(probe.status ?? 1);
}
cacheNativeModule();

function probeNativeModule(runtime) {
  const args = runtime === 'node'
    ? ['-e', "const Database=require('better-sqlite3'); const db=new Database(':memory:'); db.close()"]
    : [electronCliPath, '-e', "const Database=require('better-sqlite3'); const db=new Database(':memory:'); db.close()"];
  const environment = runtime === 'node' ? process.env : { ...process.env, ELECTRON_RUN_AS_NODE: '1' };
  return spawnSync(process.execPath, args, {
    cwd: root,
    env: environment,
    shell: false,
    encoding: 'utf8',
  });
}

function cacheNativeModule() {
  if (!fs.existsSync(nativeModulePath)) return;
  fs.mkdirSync(path.dirname(cachedModulePath), { recursive: true });
  fs.copyFileSync(nativeModulePath, cachedModulePath);
}
