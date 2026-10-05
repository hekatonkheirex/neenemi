import { readCssBundle } from './test-support/css';
import fs from 'node:fs';
import { describe, expect, it } from 'vitest';

// Regresiones de layout encontradas medidas en 960-1350 px (el mínimo de la ventana Electron es 960).
const css = readCssBundle('src/index.css');

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
    const theme = readCssBundle('src/theme.css');
    expect(theme).toMatch(/html\[data-theme='light'\] \.total-breakdown b\s*{\s*color:\s*var\(--ds-navy\)/);
  });

  it('MPS: la columna lateral baja bajo 1500 px y los nombres de insumo pueden envolver', () => {
    expect(css).toMatch(/@media \(max-width: 1500px\)\s*{\s*\.mps-layout\s*{\s*grid-template-columns:\s*1fr/);
    expect(css).toMatch(/\.mps-projection-table \.code-cell\s*{\s*white-space:\s*normal/);
  });

  it('PDF de MPS: el título no hereda el h1 global y las tarjetas no heredan el estilo de tarjeta de theme.css', () => {
    expect(css).toMatch(/\.mps-print-title-row h1\s*{\s*max-width:\s*none[^}]*letter-spacing:\s*-0\.01em/);
    // theme.css pinta [class*='-card'] (incluye mps-print-meta-card); la anulación necesita más especificidad.
    expect(css).toMatch(/html body\[data-print-mode='mps-analysis'\] \.mps-print-meta-card\s*{\s*border:\s*0;\s*background:\s*transparent;\s*box-shadow:\s*none/);
  });

  describe('min-width de las tablas de catálogo (medido a 960-1440 px)', () => {
    const minWidth = (selector: string): string | undefined => {
      const escaped = selector.replace(/[.*+?^${}()|[\]\\]/g, '\\$&');
      return css.match(new RegExp(`(?:^|\\n)${escaped}\\s*{[^}]*?min-width:\\s*([^;]+);`))?.[1];
    };

    it('la base ya no fija 780 px: el contenido impone su piso', () => {
      expect(minWidth('.catalog-table')).toBe('0');
    });

    it.each([
      '.operations-table', '.maintenance-table', '.discontinuation-table', '.discontinuation-equipment-table',
      '.contract-analytics-table', '.dispatch-equipment-table', '.outputs-table', '.consumables-table',
      '.legacy-ficha-table', '.legacy-equipment-table', '.historical-travel-table', '.travel-rendition-table',
    ])('%s no fuerza scroll por encima de su contenido', (selector) => {
      expect(minWidth(selector)).toBe('0');
    });

    it('conserva los mínimos donde bajarlos agranda las filas más de lo que ahorra scroll', () => {
      // legacy-contract: 0 -> filas de 142 a 217 px; 900 deja 143 px. consumables-code: 0 -> 47 a 78 px.
      expect(minWidth('.legacy-contract-table')).toBe('900px');
      expect(minWidth('.consumables-code-table')).toBe('1120px');
      expect(minWidth('.legacy-ranking-table')).toBe('1160px');
    });
  });

  it('Consumibles: la columna lateral de importaciones baja bajo 1500 px', () => {
    expect(css).toMatch(/@media \(max-width: 1500px\)\s*{\s*\.consumables-layout\s*{\s*grid-template-columns:\s*1fr/);
  });

  it('Viáticos: la tabla usa layout automático (sin columnas en % ni mínimo fijo) y no parte fecha ni importe', () => {
    expect(css).toMatch(/\.travel-table\s*{[^}]*min-width:\s*0;[^}]*}/);
    expect(css).not.toMatch(/\.travel-table th:nth-child\(1\),\s*\.travel-table td:nth-child\(1\)\s*{\s*width:/);
    expect(css).not.toMatch(/\.travel-table\s*{[^}]*table-layout:\s*fixed/);
    expect(css).toMatch(/\.travel-table td:nth-child\(1\) \.code-cell,\s*\.travel-table td:nth-child\(5\) \.code-cell\s*{\s*white-space:\s*nowrap/);
  });

  it('Consumibles: la columna de fecha tiene ancho mínimo para que el origen no se parta en 2-3 líneas', () => {
    expect(css).toMatch(/\.consumables-table td:first-child\s*{\s*min-width:\s*9rem/);
  });
});

describe('revisión visual 2026-10', () => {
  const indexCss = css;
  const themeCss = readCssBundle('src/theme.css');

  it('h1 global de herramienta: tope de 3.25rem y sin tracking extremo', () => {
    expect(indexCss).toMatch(/\nh1\s*{[^}]*font-size:\s*clamp\(2\.25rem,\s*3\.6vw,\s*3\.25rem\)[^}]*letter-spacing:\s*-0\.045em/);
  });

  it('primary-button deshabilitado no brilla ni muestra cursor de espera', () => {
    expect(indexCss).toMatch(/\.primary-button:disabled\s*{[^}]*cursor:\s*not-allowed[^}]*box-shadow:\s*none/);
    expect(themeCss).toMatch(/\[data-theme='light'\]\s+\.primary-button:disabled\s*{\s*box-shadow:\s*none/);
  });

  it('chips de plazo uniFLOW: objetivo táctil de 28px y texto de 12px', () => {
    expect(indexCss).toMatch(/\.uniflow-term-options button\s*{\s*min-height:\s*1\.75rem[^}]*font-size:\s*0\.75rem/);
  });
});
