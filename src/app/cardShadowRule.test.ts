import { readCssBundle } from '../test-support/css';
import { readFileSync, readdirSync, statSync } from 'node:fs';
import { join } from 'node:path';
import { describe, expect, it } from 'vitest';

const FRAGMENT = '(?:card|panel|table-wrap|record|draft|option)';
const walk = (dir: string): string[] => readdirSync(dir).flatMap(name => {
  const path = join(dir, name);
  return statSync(path).isDirectory() ? walk(path) : /\.tsx$/.test(name) && !/\.test\./.test(name) ? [path] : [];
});

/**
 * theme.css gives a shadow and white background to every `[class*='-card']` (and -panel, -record...), and excludes the
 * inner parts named `*-card-*`. That exclusion is only safe if no real card also carries such a name.
 */
describe('regla de sombra de tarjetas', () => {
  it('ninguna tarjeta real lleva a la vez una clase base y una clase de parte interna', () => {
    const offenders: string[] = [];
    for (const file of walk('src')) {
      for (const match of readFileSync(file, 'utf8').matchAll(/className=(?:"([^"]*)"|\{`([^`]*)`\})/g)) {
        const tokens = (match[1] ?? match[2]).split(/\s+/).filter(Boolean);
        const part = tokens.some(token => new RegExp(`-${FRAGMENT}-`).test(token));
        const base = tokens.some(token => new RegExp(`-${FRAGMENT}$`).test(token));
        if (part && base) offenders.push(`${file}: ${tokens.join(' ')}`);
      }
    }
    expect(offenders).toEqual([]);
  });
  it('theme.css excluye las partes internas de la regla general', () => {
    const css = readCssBundle('src/theme.css');
    expect(css).toContain("[class*='-card-']");
  });
});
