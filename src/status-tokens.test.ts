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

  it('Configuración y Badge usan los tokens, no hex de estado sueltos', () => {
    const status = /#(d92d20|e08a00|2f8f5b|912018|14532d|7a4a00|ffb4ab|9be3b9|ffd28a|6b7a90)/i;
    for (const file of ['src/app/DatabaseRecoveryPanel.tsx', 'src/app/ImportArchivePanel.tsx', 'src/core/ui/badge.tsx']) {
      expect(fs.readFileSync(file, 'utf8'), file).not.toMatch(status);
    }
  });
});
