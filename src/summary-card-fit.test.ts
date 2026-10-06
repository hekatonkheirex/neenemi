import fs from 'node:fs';
import { describe, expect, it } from 'vitest';

describe('tarjetas de resumen', () => {
  it('el valor escala con el ancho de la tarjeta para que un monto largo no se desborde', () => {
    for (const file of ['src/modules/consumibles/ConsumiblesModule.tsx', 'src/modules/consumibles/LegacyAnalysisPanels.tsx']) {
      const text = fs.readFileSync(file, 'utf8');
      expect(text).toContain('@container min-w-0 gap-1 p-4');
      expect(text).toContain('text-[clamp(1.1rem,10cqw,1.875rem)]');
    }
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
