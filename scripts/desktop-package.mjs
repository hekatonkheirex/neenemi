import fs from 'node:fs';
import path from 'node:path';
import { spawnSync } from 'node:child_process';
import { fileURLToPath } from 'node:url';

const root = path.resolve(path.dirname(fileURLToPath(import.meta.url)), '..');
const isWindows = process.platform === 'win32';
const npmCommand = isWindows ? 'npm.cmd' : 'npm';
const builderPackagePath = path.join(root, 'node_modules', 'electron-builder', 'package.json');
const builderCliPath = path.join(root, 'node_modules', 'electron-builder', 'cli.js');
const builderConfigPath = path.join(root, 'electron-builder.yml');
const isWindowsTarget = process.argv.includes('--win');
const buildTarget = isWindowsTarget ? ['--win', 'nsis', '--x64'] : ['--dir'];

if (isWindowsTarget && !isWindows) {
  console.error('No se puede generar un paquete Windows desde este sistema.');
  console.error('Ejecuta npm run desktop:package:win en Windows o CI Windows para usar el binding nativo correcto.');
  process.exit(3);
}

if (!fs.existsSync(builderPackagePath) || !fs.existsSync(builderCliPath)) {
  console.error('No se puede empaquetar todavía: falta electron-builder en datasystems-suite.');
  console.error('La configuración de Windows está preparada en electron-builder.yml.');
  console.error('Instálalo en datasystems-suite y ejecuta npm run desktop:package:win desde Windows o CI Windows.');
  process.exit(2);
}

run(npmCommand, ['run', 'build']);
run(process.execPath, [path.join(root, 'scripts', 'ensure-native.mjs'), '--electron']);
run(process.execPath, [path.join(root, 'scripts', 'release-check.mjs')]);
run(process.execPath, [builderCliPath, ...buildTarget, '--config', builderConfigPath]);

function run(command, args) {
  const useShell = isWindows && command.toLowerCase().endsWith('.cmd');
  const result = spawnSync(command, args, {
    cwd: root,
    env: process.env,
    stdio: 'inherit',
    shell: useShell,
  });

  if (result.status !== 0) process.exit(result.status ?? 1);
}
