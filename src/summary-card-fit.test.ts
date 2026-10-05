import fs from 'node:fs';
import { describe, expect, it } from 'vitest';

const css = fs.readFileSync(new URL('./index.css', import.meta.url), 'utf8');

describe('tarjetas de resumen', () => {
  it('el valor escala con el ancho de la tarjeta para que un monto largo no se desborde', () => {
    expect(css).toMatch(/\.summary-grid > \.summary-card\s*{\s*container-type:\s*inline-size/);
    expect(css).toMatch(/\.summary-grid > \.summary-card \.summary-value\s*{\s*font-size:\s*clamp\(1\.1rem, 12cqi, 2\.5rem\)/);
  });

  it('12cqi de una tarjeta de 250 px de contenido deja entrar "₲ 2.723.113.406" (15 caracteres a ~0,52 em)', () => {
    const font = Math.min(40, Math.max(17.6, 0.12 * 250));
    expect(15 * 0.52 * font).toBeLessThanOrEqual(250);
  });

  it('tarjeta estrecha (6 por fila, ~150 px de contenido): el mismo monto cabe sin elipsis', () => {
    const font = Math.min(40, Math.max(17.6, 0.12 * 150));
    expect(15 * 0.52 * font).toBeLessThanOrEqual(150);
  });
});
