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

  it('SLA: la tabla de resultados no obliga a scroll horizontal y la columna lateral baja en ventanas medianas', () => {
    expect(css).toMatch(/\.sla-table\s*{[^}]*min-width:\s*600px/);
    expect(css).toMatch(/@media \(max-width: 1400px\)\s*{\s*\.sla-layout\s*{\s*grid-template-columns:\s*1fr/);
  });

  it('Proformas: bajo 1500 px el lateral pasa a celdas del grid y el Resumen es una barra fija inferior', () => {
    const block = css.match(/@media \(max-width: 1500px\)\s*{\s*\.proforma-layout[\s\S]*?\n}\n/)?.[0] ?? '';
    expect(block).toMatch(/\.proforma-sidebar\s*{\s*display:\s*contents/);
    expect(block).toMatch(/\.proforma-sidebar > \.total-card\s*{[^}]*position:\s*sticky[^}]*bottom:/);
    expect(block).toMatch(/html:has\(\.proforma-layout\)\s*{\s*scroll-padding-bottom/);
    expect(css).not.toMatch(/\.proforma-table\s*{[^}]*min-width/);
  });

  it('Proformas: la barra tiene fondo opaco y los importes se leen en tema claro', () => {
    expect(css).toMatch(/\.proforma-sidebar > \.total-card\s*{[^}]*,\s*#0b1220/);
    const theme = fs.readFileSync(new URL('./theme.css', import.meta.url), 'utf8');
    expect(theme).toMatch(/html\[data-theme='light'\] \.total-breakdown b\s*{\s*color:\s*var\(--ds-navy\)/);
  });

  it('MPS: la columna lateral baja bajo 1500 px y la proyección anula el min-width de .catalog-table', () => {
    expect(css).toMatch(/@media \(max-width: 1500px\)\s*{\s*\.mps-layout\s*{\s*grid-template-columns:\s*1fr/);
    // .catalog-table fija 780 px; sin esta anulación la tabla de 8 columnas quedaba cortada.
    expect(css).toMatch(/\.catalog-table\s*{[^}]*min-width:\s*780px/);
    const override = css.search(/\.mps-projection-table\s*{\s*min-width:\s*0/);
    expect(override).toBeGreaterThan(css.search(/\.catalog-table\s*{[^}]*min-width:\s*780px/));
    expect(css).toMatch(/\.mps-projection-table \.code-cell\s*{\s*white-space:\s*normal/);
  });

  it('PDF de MPS: el título no hereda el h1 global y las tarjetas no heredan el estilo de tarjeta de theme.css', () => {
    expect(css).toMatch(/\.mps-print-title-row h1\s*{\s*max-width:\s*none[^}]*letter-spacing:\s*-0\.01em/);
    // theme.css pinta [class*='-card'] (incluye mps-print-meta-card); la anulación necesita más especificidad.
    expect(css).toMatch(/html body\[data-print-mode='mps-analysis'\] \.mps-print-meta-card\s*{\s*border:\s*0;\s*background:\s*transparent;\s*box-shadow:\s*none/);
  });
});
