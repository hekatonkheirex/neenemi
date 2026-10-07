import fs from 'node:fs';
import { describe, expect, it } from 'vitest';

const css = fs.readFileSync('src/tailwind.css', 'utf8');
const token = (name: string) => css.match(new RegExp(`--color-${name}:\\s*(#[0-9a-fA-F]{6})`))?.[1] ?? '';

const luminance = (hex: string) => {
  const [r, g, b] = [1, 3, 5].map((i) => parseInt(hex.slice(i, i + 2), 16) / 255)
    .map((v) => (v <= 0.03928 ? v / 12.92 : ((v + 0.055) / 1.055) ** 2.4));
  return 0.2126 * r + 0.7152 * g + 0.0722 * b;
};
const ratio = (a: string, b: string) => {
  const [hi, lo] = [luminance(a), luminance(b)].sort((x, y) => y - x);
  return (hi + 0.05) / (lo + 0.05);
};
/** Color `fg` al `alpha` sobre `bg`. */
const over = (fg: string, bg: string, alpha: number) => '#' + [1, 3, 5].map((i) => {
  const mixed = Math.round(parseInt(fg.slice(i, i + 2), 16) * alpha + parseInt(bg.slice(i, i + 2), 16) * (1 - alpha));
  return mixed.toString(16).padStart(2, '0');
}).join('');

describe('tokens de estado', () => {
  it('están definidos como hex en tailwind.css', () => {
    for (const name of ['ok', 'warn', 'danger'].flatMap((tone) => [`status-${tone}`, `status-${tone}-ink`, `status-${tone}-ink-dark`]).concat('status-idle')) {
      expect(token(name), name).toMatch(/^#[0-9a-f]{6}$/i);
    }
  });

  it.each(['ok', 'warn', 'danger'])('el texto de %s cumple 4,5:1 sobre su tinte (15 %) en claro y en oscuro', (tone) => {
    const accent = token(`status-${tone}`);
    expect(ratio(token(`status-${tone}-ink`), over(accent, '#ffffff', 0.15))).toBeGreaterThanOrEqual(4.5);
    expect(ratio(token(`status-${tone}-ink-dark`), over(accent, '#0e1b31', 0.15))).toBeGreaterThanOrEqual(4.5);
  });

  // Colores de datos (series de un gráfico junto a colores que no son de estado): se quedan en hex.
  const dataColorFiles = ['src/modules/mantenimiento/DashboardMaintenanceChart.tsx'];

  it('ningún componente pega un hex de estado en una clase: usan los tokens', () => {
    const status = /#(d92d20|e08a00|2f8f5b|912018|14532d|7a4a00|ffb4ab|9be3b9|ffd28a|6b7a90)/i;
    const walk = (dir: string): string[] => fs.readdirSync(dir, { withFileTypes: true }).flatMap((entry) => {
      const path = `${dir}/${entry.name}`;
      return entry.isDirectory() ? walk(path) : /\.tsx?$/.test(entry.name) && !/\.test\./.test(entry.name) ? [path] : [];
    });
    const offenders = walk('src').filter((file) => !dataColorFiles.includes(file) && status.test(fs.readFileSync(file, 'utf8')));
    expect(offenders).toEqual([]);
  });

  it('las excepciones siguen necesitándolo (si no, sácalas de la lista)', () => {
    for (const file of dataColorFiles) expect(fs.readFileSync(file, 'utf8')).toMatch(/#(d92d20|e08a00|2f8f5b)/i);
  });
});
