import fs from 'node:fs';
import { describe, expect, it } from 'vitest';

const css = fs.readFileSync(new URL('./index.css', import.meta.url), 'utf8');

describe('tarjetas de resumen', () => {
  it('el valor escala con el ancho de la tarjeta para que un monto largo no se desborde', () => {
    expect(css).toMatch(/\.summary-grid > \.summary-card\s*{\s*container-type:\s*inline-size/);
    expect(css).toMatch(/\.summary-grid > \.summary-card \.summary-value\s*{\s*font-size:\s*clamp\(1\.5rem, 11cqi, 2\.5rem\)/);
  });

  it('11cqi de una tarjeta de 250 px de contenido deja entrar "₲ 2.723.113.406" (15 caracteres a ~0,52 em)', () => {
    const font = Math.min(40, Math.max(24, 0.11 * 250));
    expect(15 * 0.52 * font).toBeLessThanOrEqual(250);
  });
});
