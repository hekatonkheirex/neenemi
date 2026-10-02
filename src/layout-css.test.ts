import fs from 'node:fs';
import { describe, expect, it } from 'vitest';

// Regresiones de layout encontradas medidas en 960-1350 px (el mínimo de la ventana Electron es 960).
const css = fs.readFileSync(new URL('./index.css', import.meta.url), 'utf8');

describe('layout entre 960 y 1350 px', () => {
  it('las acciones de la cabecera pueden pasar a otra línea', () => {
    expect(css).toMatch(/\.catalog-header \.sales-actions,\s*\.catalog-header \.sla-actions\s*{[^}]*flex-wrap:\s*wrap/);
  });

  it('el filtro de Mantenimiento no fuerza una columna que no encoge', () => {
    expect(css).toMatch(/\.maintenance-analysis-filters\s*{[^}]*minmax\(0, auto\)/);
    expect(css).not.toMatch(/\.maintenance-normal-toggle\s*{[^}]*white-space:\s*nowrap/);
  });

  it('los @media de Discontinuador van después de la regla base (si no, pierden por orden de fuente)', () => {
    const base = css.indexOf('.discontinuation-insights {\n  display: grid;');
    const overrides = [...css.matchAll(/\.discontinuation-insights\s*{\s*grid-template-columns:\s*(repeat\(2|1fr)/g)].map((m) => m.index ?? -1);
    expect(base).toBeGreaterThan(-1);
    expect(overrides.length).toBeGreaterThanOrEqual(2);
    for (const index of overrides) expect(index).toBeGreaterThan(base);
  });
});
