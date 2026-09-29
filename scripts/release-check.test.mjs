import fs from 'node:fs';
import path from 'node:path';
import { describe, expect, it } from 'vitest';

const root = path.resolve(import.meta.dirname, '..');

describe('production packaging contract', () => {
  it('exposes one check and explicit package commands', () => {
    const packageJson = JSON.parse(fs.readFileSync(path.join(root, 'package.json'), 'utf8'));
    expect(packageJson.scripts['desktop:check']).toContain('scripts/release-check.mjs');
    expect(packageJson.scripts['desktop:package']).toBe('node scripts/desktop-package.mjs --dir');
    expect(packageJson.scripts['desktop:package:win']).toBe('node scripts/desktop-package.mjs --win');
  });

  it('keeps the Windows target and native SQLite rule in the builder config', () => {
    const builderConfig = fs.readFileSync(path.join(root, 'electron-builder.yml'), 'utf8');
    expect(builderConfig).toContain('target: nsis');
    expect(builderConfig).toContain('node_modules/better-sqlite3/**');
    expect(builderConfig).toContain('npmRebuild: false');
    expect(builderConfig).toContain('allowToChangeInstallationDirectory: true');
  });

  it('does not cross-package Windows with a host-native SQLite binding', () => {
    const packageScript = fs.readFileSync(path.join(root, 'scripts/desktop-package.mjs'), 'utf8');
    expect(packageScript).toContain("if (isWindowsTarget && !isWindows)");
    expect(packageScript).toContain('binding nativo correcto');
  });

  it('recreates the native output directory before restoring a cached binding', () => {
    const nativeScript = fs.readFileSync(path.join(root, 'scripts/ensure-native.mjs'), 'utf8');
    expect(nativeScript).toContain('fs.mkdirSync(path.dirname(nativeModulePath), { recursive: true });');
  });
});
