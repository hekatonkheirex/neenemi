import { createHash } from 'node:crypto';
import fs from 'node:fs';
import { describe, expect, it } from 'vitest';
import { buildContentSecurityPolicy, inlineScriptHashes } from './csp';

const html = `<head><script>window.a = 1;</script><script type="module" src="/assets/x.js"></script></head>`;

describe('inlineScriptHashes', () => {
  it('hashea solo los scripts en línea', () => {
    expect(inlineScriptHashes(html)).toEqual([`'sha256-${createHash('sha256').update('window.a = 1;').digest('base64')}'`]);
  });
  it('un script externo con atributos antes de src tampoco se hashea', () => {
    expect(inlineScriptHashes('<script type="module" crossorigin src="/a.js"></script>')).toEqual([]);
  });
});

describe('buildContentSecurityPolicy', () => {
  const policy = buildContentSecurityPolicy(html);
  const directive = (name: string) => policy.split('; ').find((part) => part.startsWith(`${name} `));

  it('scripts solo propios más el hash del script de tema; sin unsafe-inline ni unsafe-eval', () => {
    expect(directive('script-src')).toMatch(/^script-src 'self' 'wasm-unsafe-eval' 'sha256-/);
    expect(directive('script-src')).not.toMatch(/'unsafe-inline'|'unsafe-eval'/);
  });
  it('bloquea objetos, marcos y base ajena; red solo local', () => {
    expect(directive('object-src')).toBe("object-src 'none'");
    expect(directive('frame-ancestors')).toBe("frame-ancestors 'none'");
    expect(directive('base-uri')).toBe("base-uri 'self'");
    expect(directive('connect-src')).toBe("connect-src 'self'");
  });
  it('permite los mosaicos de OpenStreetMap y ningún otro origen remoto', () => {
    expect(directive('img-src')).toContain('https://tile.openstreetmap.org');
    expect(policy.match(/https:\/\/[^\s;]+/g)).toEqual(['https://tile.openstreetmap.org']);
  });
  it('cubre el index.html real del proyecto (el script de tema queda autorizado)', () => {
    const real = fs.readFileSync('index.html', 'utf8');
    expect(inlineScriptHashes(real)).toHaveLength(1);
    expect(buildContentSecurityPolicy(real)).toContain(inlineScriptHashes(real)[0]);
  });
});
