import { readFileSync } from 'node:fs';
import { renderToStaticMarkup } from 'react-dom/server';
import { describe, expect, it } from 'vitest';
import SourceLocationLabel from '../../core/SourceLocationLabel';
import ConsumablesBundlePanel from './ConsumiblesBundlePanel';
import SourceDataPanel from './SourceDataPanel';

// Primera entrega del rediseño: el módulo (hasta ConsumablesLegacyTab), Datos y la carga coordinada.
const legacy = /\b(source-data-[a-z-]+|consumables-(?:layout|main|filter-bar|controls|method-card|legacy-sources-card)|legacy-fleet-source[a-z-]*|operations-sidebar|operations-summary|sales-card|card-heading|secondary-button|primary-button|text-button|catalog-header|search-field|compact-field|sales-status|summary-card|form-card|form-hint|import-description|mps-facts|table-secondary-text)\b/;

function classesOf(text: string): string {
  return [...text.matchAll(/className=(?:"([^"]*)"|\{([^}]*)\})/g)].map((match) => match[1] ?? match[2]).join(' ');
}

describe('rediseño de Consumibles (parte 1)', () => {
  it('el módulo, hasta la pestaña heredada, usa las primitivas compartidas', () => {
    const text = readFileSync('src/modules/consumibles/ConsumiblesModule.tsx', 'utf8');
    const migrated = text.slice(0, text.indexOf('function ConsumablesLegacyTab('));
    expect(classesOf(migrated).match(legacy)?.[0]).toBeUndefined();
    expect(migrated).toContain('<PageHeader');
    expect(migrated).toContain('min-[1500px]:grid-cols-[minmax(0,1fr)_22rem]');
  });

  it.each(['src/modules/consumibles/ConsumiblesBundlePanel.tsx', 'src/modules/consumibles/SourceDataPanel.tsx', 'src/core/SourceLocationLabel.tsx'])('%s no usa clases heredadas', (file) => {
    expect(classesOf(readFileSync(file, 'utf8')).match(legacy)?.[0]).toBeUndefined();
  });

  it('la carga coordinada lista las nueve fuentes y avisa que faltan archivos', () => {
    const html = renderToStaticMarkup(<ConsumablesBundlePanel importing={false} busy={false} files={{}} onFilesChange={() => {}} progressMessage="" onImportBundle={() => {}} />);
    expect(html).toContain('0/9 archivos seleccionados');
    expect(html).toContain('Faltan archivos por seleccionar.');
    expect(html.match(/type="file"/g)).toHaveLength(9);
    expect(html).toMatch(/<button[^>]*disabled=""[^>]*>Importar paquete<\/button>/);
  });

  it('Datos muestra las acciones de mantenimiento y la carga coordinada', () => {
    const html = renderToStaticMarkup(<SourceDataPanel importing={false} bundleImporting={false} bundleFiles={{}} bundleProgress="" refreshKey={0} onBundleFilesChange={() => {}} onImportBundle={() => {}} onReindexSources={async () => { throw new Error('no se usa'); }} onClearConsumables={async () => ({ ok: true, batches: 0, archivedFiles: 0 })} />);
    expect(html).toContain('Recalcular datos');
    expect(html).toContain('Limpiar cargas de Consumibles');
    expect(html).toContain('Carga coordinada de las nueve fuentes');
  });

  it('la etiqueta de origen abrevia la ubicación y no pinta nada sin archivo', () => {
    expect(renderToStaticMarkup(<SourceLocationLabel fileName="" />)).toBe('');
    expect(renderToStaticMarkup(<SourceLocationLabel fileName="Detalle.xlsx" sheetName="Hoja1" rowNumber={7} />)).toContain('fila 7');
  });
});
