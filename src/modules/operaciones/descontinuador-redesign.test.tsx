import { readFileSync } from 'node:fs';
import { renderToStaticMarkup } from 'react-dom/server';
import { describe, expect, it } from 'vitest';
import PaginationControls from '../../core/PaginationControls';
import SourceDetails from '../../core/SourceDetails';
import LegacySourceDataPanel from './LegacySourceDataPanel';

const sources = [
  'src/modules/operaciones/DescontinuadorModule.tsx',
  'src/modules/operaciones/LegacySourceDataPanel.tsx',
  'src/core/PaginationControls.tsx',
  'src/core/SourceDetails.tsx',
];

// Clases heredadas que el rediseño compartido reemplaza; su CSS ya no existe.
const legacy = /className=.*\b(discontinuation-[a-z-]+|source-data-[a-z-]+|operations-source-data|sales-card|card-heading|secondary-button|primary-button|text-button|catalog-header|catalog-table-wrap|catalog-table|search-field|compact-field|sales-status|badge (?:alert|warning|ok|neutral)|pagination-[a-z]+|stock-table|impact-label|source-cell|scope-note)\b/;

describe('rediseño de Discontinuador', () => {
  it.each(sources)('%s usa las primitivas compartidas y no las clases heredadas', (file) => {
    expect(readFileSync(file, 'utf8').match(legacy)?.[0]).toBeUndefined();
  });

  it('la paginación conserva texto, etiqueta accesible y botones deshabilitados en los extremos', () => {
    const html = renderToStaticMarkup(<PaginationControls label="Paginación de prueba" page={1} pageSize={50} total={120} onPageChange={() => {}} onPageSizeChange={() => {}} />);
    expect(html).toContain('aria-label="Paginación de prueba"');
    expect(html).toContain('1–50 de 120');
    expect(html).toContain('Página 1 de 3');
    expect(html).toMatch(/<button[^>]*disabled=""[^>]*>Anterior<\/button>/);
    expect(html).not.toMatch(/<button[^>]*disabled=""[^>]*>Siguiente<\/button>/);
  });

  it('el detalle de origen limita su alto y no se muestra sin datos', () => {
    expect(renderToStaticMarkup(<SourceDetails details={[]} />)).toBe('');
    const html = renderToStaticMarkup(<SourceDetails details={[{ label: 'Serie', value: 'ABC' }]} />);
    expect(html).toContain('Ver datos del origen (1)');
    expect(html).toContain('max-h-[22rem]');
    expect(html).toContain('overflow-y-auto');
  });

  it('el visor de filas originales arranca con su encabezado y sin errores', () => {
    const html = renderToStaticMarkup(<LegacySourceDataPanel />);
    expect(html).toContain('Filas originales de Canon y Waldbott');
    expect(html).toContain('Listas cargadas');
    expect(html).not.toContain('role="alert"');
  });
});
