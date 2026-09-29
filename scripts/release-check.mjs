import fs from 'node:fs';
import path from 'node:path';
import { spawnSync } from 'node:child_process';
import { fileURLToPath } from 'node:url';

const root = path.resolve(path.dirname(fileURLToPath(import.meta.url)), '..');
const isWindows = process.platform === 'win32';
const electronCliPath = path.join(root, 'node_modules', 'electron', 'cli.js');
const packagePath = path.join(root, 'package.json');
const packageJson = JSON.parse(fs.readFileSync(packagePath, 'utf8'));
const mainSource = fs.readFileSync(path.join(root, 'electron', 'main.cjs'), 'utf8');
const moduleManifest = fs.readFileSync(path.join(root, 'src', 'app', 'modules.ts'), 'utf8');
const builderConfig = fs.readFileSync(path.join(root, 'electron-builder.yml'), 'utf8');

const requiredFiles = [
  'dist/index.html',
  'dist/server.cjs',
  'electron/main.cjs',
  'electron/api-child.cjs',
  'electron-builder.yml',
];
const failures = requiredFiles
  .filter((relativePath) => !fs.existsSync(path.join(root, relativePath)))
  .map((relativePath) => `Falta el artefacto ${relativePath}. Ejecuta npm run build.`);

if (packageJson.main !== 'electron/main.cjs') {
  failures.push('package.json debe apuntar a electron/main.cjs como entrypoint de producción.');
}

if (packageJson.scripts?.['desktop:package:win'] !== 'node scripts/desktop-package.mjs --win') {
  failures.push('Falta el comando reproducible desktop:package:win.');
}

if (!mainSource.includes("app.getPath('userData')")) {
  failures.push('La API de producción debe guardar los datos en app.getPath(\'userData\').');
}

if (/redact-ds/i.test(moduleManifest)) {
  failures.push('redact-ds no puede aparecer en el manifiesto de módulos de la suite.');
}

if (!/appId:\s*com\.datasystems\.dcss/.test(builderConfig)
  || !/target:\s*nsis/.test(builderConfig)
  || !/node_modules\/better-sqlite3\/\*\*/.test(builderConfig)
  || !/npmRebuild:\s*false/.test(builderConfig)) {
  failures.push('electron-builder.yml no define el identificador, destino NSIS, desempaquetado nativo o regla de rebuild esperada.');
}

const electronPackagePath = path.join(root, 'node_modules', 'electron', 'package.json');
const nativeModulePath = path.join(root, 'node_modules', 'better-sqlite3', 'build', 'Release', 'better_sqlite3.node');

if (!fs.existsSync(electronPackagePath)) {
  failures.push('No está instalado Electron. Ejecuta npm install en dcss-suite.');
}

if (!fs.existsSync(nativeModulePath)) {
  failures.push('Falta better_sqlite3.node para Electron. Ejecuta node scripts/ensure-native.mjs --electron.');
}

if (failures.length > 0) {
  console.error('Release check: FAILED');
  for (const failure of failures) console.error(`- ${failure}`);
  process.exit(1);
}

const probe = spawnSync(process.execPath, [
  electronCliPath,
  '-e',
  "const Database=require('better-sqlite3'); const db=new Database(':memory:'); db.prepare('select 1').get(); db.close()",
], {
  cwd: root,
  env: { ...process.env, ELECTRON_RUN_AS_NODE: '1' },
  encoding: 'utf8',
  shell: false,
});

if (probe.status !== 0) {
  console.error('Release check: FAILED');
  console.error('better-sqlite3 no carga con el runtime de Electron actual.');
  if (probe.stderr?.trim()) console.error(probe.stderr.trim());
  console.error('Ejecuta node scripts/ensure-native.mjs --electron y vuelve a comprobar.');
  process.exit(probe.status ?? 1);
}

const builderAvailable = fs.existsSync(path.join(root, 'node_modules', 'electron-builder', 'package.json'))
  && fs.existsSync(path.join(root, 'node_modules', '.bin', isWindows ? 'electron-builder.cmd' : 'electron-builder'));

console.log('Release check: OK');
console.log('- renderer y API de producción presentes');
console.log('- Electron y better-sqlite3 compatibles con el runtime actual');
console.log('- almacenamiento aislado en el directorio de datos de usuario');
console.log('- redact-ds excluido del manifiesto');

if (builderAvailable) {
  console.log('- electron-builder disponible; rebuild nativo delegado a ensure-native.mjs');
} else {
  console.warn('- AVISO: electron-builder no está instalado; el runtime está listo, pero el empaquetado sigue pendiente.');
}
