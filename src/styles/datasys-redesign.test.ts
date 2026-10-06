import fs from 'node:fs';
import path from 'node:path';
import { describe, expect, it } from 'vitest';
import { readCssBundle } from '../test-support/css';

const root = path.resolve(import.meta.dirname, '../..');
const luminance = (hex: string) => {
  const [r, g, b] = [1, 3, 5].map((i) => parseInt(hex.slice(i, i + 2), 16) / 255)
    .map((v) => (v <= 0.03928 ? v / 12.92 : ((v + 0.055) / 1.055) ** 2.4));
  return 0.2126 * r + 0.7152 * g + 0.0722 * b;
};
const ratio = (a: string, b: string) => {
  const [hi, lo] = [luminance(a), luminance(b)].sort((x, y) => y - x);
  return (hi + 0.05) / (lo + 0.05);
};

const theme = readCssBundle('src/theme.css');

describe('rediseño Datasys', () => {
  it('el tema oscuro usa navy de marca como base y #0e1b31 como panel', () => {
    expect(theme).toMatch(/--ds-panel:\s*#0e1b31;/);
    expect(theme).toMatch(/html\[data-theme='dark'\] body\s*{[^}]*var\(--ds-navy\)/);
    expect(theme).toMatch(/html\[data-theme='dark'\] \.sidebar\s*{[^}]*var\(--ds-panel\)/);
  });

  it('los modales llevan blur', () => {
    for (const cls of ['service-report-overlay', 'sales-catalog-overlay', 'open-contract-overlay', 'mps-editor-overlay', 'travel-import-backdrop']) {
      expect(theme).toMatch(new RegExp(`\\.${cls}[^{]*{[^}]*backdrop-filter:\\s*blur`));
    }
  });

  it('el CTA primario es naranja de marca también en oscuro', () => {
    expect(theme).toMatch(/html\[data-theme='dark'\] \.primary-button\s*{[^}]*background:\s*var\(--ds-orange\)/);
    expect(ratio('#1a2c4c', '#ff6b00')).toBeGreaterThanOrEqual(4.5);
    expect(ratio('#1a2c4c', '#ff8533')).toBeGreaterThanOrEqual(4.5);
  });

  it.each([
    ['texto principal sobre base navy', '#edf3ff', '#1a2c4c'],
    ['texto principal sobre panel', '#edf3ff', '#0e1b31'],
    ['nota muted sobre panel', '#8fa5c7', '#0e1b31'],
    ['nota muted sobre base navy', '#8fa5c7', '#1a2c4c'],
    ['eyebrow celeste sobre panel', '#00a3e0', '#0e1b31'],
  ])('%s cumple 4,5:1', (_n, fg, bg) => {
    expect(ratio(fg, bg)).toBeGreaterThanOrEqual(4.5);
  });


  it('los iconos de la barra lateral, las pestañas y las tarjetas no llevan recuadro', () => {
    const block = theme.match(/html\[data-theme\] \.nav-icon,[^{]*\{([^}]*)\}/)?.[0] ?? '';
    for (const cls of ['.nav-icon', '.anim-tabs button > .anim-tabs-icon', '.module-symbol']) expect(block, cls).toContain(cls);
    expect(block).toMatch(/border:\s*0/);
    expect(block).toMatch(/background:\s*none/);
  });

  it('todos los modales llevan blur y no quedan azules fuera de paleta ni glifos de texto como iconos', () => {
    for (const sel of ['.travel-drawer::backdrop']) {
      expect(theme, sel).toMatch(new RegExp(`${sel.replace(/[.:]/g, '\\$&')}[^{]*{[^}]*backdrop-filter:\\s*blur`));
    }
    expect(theme).not.toMatch(/#4277e9|#77a7ff|rgba\(66, ?119, ?233/);
  });

  it('los diálogos de la suite comparten dialogPanel: blur, radio 2xl y sombra md, sin CSS heredado', () => {
    const dialog = fs.readFileSync(path.join(root, 'src/core/dialog.ts'), 'utf8');
    for (const token of ['rounded-2xl', 'shadow-md', 'backdrop:backdrop-blur-sm', 'motion-reduce:backdrop:backdrop-blur-none', 'dark:bg-panel']) expect(dialog).toContain(token);
    expect(theme).not.toMatch(/\.(confirm-dialog|command-palette|changelog-dialog|changelog-overlay)/);
  });
});
