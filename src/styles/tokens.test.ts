import fs from 'node:fs';
import { describe, expect, it } from 'vitest';
import { readCssBundle } from '../test-support/css';

const css = readCssBundle('src/index.css');
const theme = readCssBundle('src/theme.css');

// Colores de marca: ya existen como --ds-* con el mismo valor en ambos temas.
const BRAND = { '#ff6b00': '--ds-orange', '#00a3e0': '--ds-sky', '#1a2c4c': '--ds-navy', '#d6deea': '--ds-border', '#18243a': '--ds-ink' } as const;

describe('tokens de color', () => {
  const defined = [...css.matchAll(/^\s*(--dk-([0-9a-f]{6})):\s*(#[0-9a-f]{6});$/gm)];

  it('cada --dk-XXXXXX vale exactamente #XXXXXX', () => {
    expect(defined.length).toBeGreaterThanOrEqual(11);
    for (const [, name, hex, value] of defined) expect(value, name).toBe(`#${hex}`);
  });

  it('los tonos fusionados (ΔE2000 ≤ 2,5 del canónico) ya no existen como token', () => {
    for (const merged of ['e7efff', 'e5eeff', 'dce9ff', 'd8e7ff', '93a8ca']) expect(css, merged).not.toContain(`--dk-${merged}`);
  });

  it('los colores de marca tienen un único valor en --ds-* (claro y oscuro)', () => {
    for (const [hex, token] of Object.entries(BRAND)) {
      const values = [...theme.matchAll(new RegExp(`^\\s*${token}:\\s*([^;]+);`, 'gm'))].map((m) => m[1].trim());
      expect(values, token).toEqual([hex]);
    }
  });

  it('no quedan literales de los colores con token en los estilos base (usar var(--token))', () => {
    const base = css.replace(/^\s*--dk-[0-9a-f]{6}:[^;]+;$/gm, '');
    const literals = [...defined.map((m) => `#${m[2]}`), ...Object.keys(BRAND)];
    const offenders = literals.filter((hex) => new RegExp(`${hex}(?![0-9a-fA-F])`, 'i').test(base.replace(/var\(--[\w-]+,\s*#[0-9a-fA-F]{3,8}\)/g, '')));
    expect(offenders).toEqual([]);
  });

  it('todo var(--dk-*) usado está definido', () => {
    const used = new Set([...css.matchAll(/var\((--dk-[0-9a-f]{6})\)/g)].map((m) => m[1]));
    const names = new Set(defined.map((m) => m[1]));
    expect([...used].filter((name) => !names.has(name))).toEqual([]);
    expect(fs.existsSync('src/styles/README.md')).toBe(true);
  });
});
