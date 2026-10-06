import { readFileSync } from 'node:fs';
import { renderToStaticMarkup } from 'react-dom/server';
import { describe, expect, it } from 'vitest';
import { ExportLink } from '../../core/ActionButtons';
import OpenContractImportPanel from './OpenContractImportPanel';
import SalesCatalogImportPanel from './SalesCatalogImportPanel';
import ServiceReportImportPanel from './ServiceReportImportPanel';

const sources = [
  'src/modules/ventas/ProformasModule.tsx',
  'src/modules/ventas/OpenContractImportPanel.tsx',
  'src/modules/ventas/SalesCatalogImportPanel.tsx',
  'src/modules/ventas/ServiceReportImportPanel.tsx',
];

// Clases heredadas que el rediseño compartido reemplaza; su CSS ya no existe.
const legacy = /\b(proforma-[a-z-]+|total-card|history-(?:card|item|list)|contract-(?:source-banner|summary-card)|sales-catalog-[a-z-]+|open-contract-[a-z-]+|service-report-[a-z-]+|labor-[a-z-]+|suggestion-[a-z-]+|sales-card|card-heading|secondary-button|primary-button|text-button|catalog-header|search-field|compact-field|sales-status|sales-actions|full-button|quantity-input|mps-editor-close)\b/;

describe('rediseño de Proformas', () => {
  it.each(sources)('%s usa las primitivas compartidas y no las clases heredadas', (file) => {
    // proforma-page queda como gancho de la raíz del módulo.
    const classes = [...readFileSync(file, 'utf8').matchAll(/className=(?:"([^"]*)"|\{([^}]*)\})/g)].map((match) => match[1] ?? match[2]).join(' ').replace('page-content proforma-page', 'page-content');
    expect(classes.match(legacy)?.[0]).toBeUndefined();
  });

  it('el módulo conserva el resumen fijo inferior y el lateral en dos columnas desde 1500 px', () => {
    const module = readFileSync(sources[0], 'utf8');
    expect(module).toContain('min-[1500px]:grid-cols-[minmax(0,1fr)_22rem]');
    expect(module).toContain('sticky bottom-0 z-10');
    expect(module).toContain('aria-label="Resumen de la proforma"');
  });

  it('los paneles de importación son diálogos nativos con título enlazado y cierre con nombre', () => {
    const contract = renderToStaticMarkup(<OpenContractImportPanel isOpen meta={null} onClose={() => {}} onImport={async () => {}} />);
    expect(contract).toContain('<dialog');
    expect(contract).toContain('aria-labelledby="open-contract-title"');
    expect(contract).toContain('aria-label="Cerrar carga del contrato"');

    const catalogs = renderToStaticMarkup(<SalesCatalogImportPanel isOpen catalogs={{ consumibles: null, repuestos: null }} onClose={() => {}} onImport={async () => true} />);
    expect(catalogs).toContain('<dialog');
    expect(catalogs).toContain('CONSUMIBLES_SISTEMA_ING.xlsx');
    expect(catalogs).toContain('aria-label="Cerrar ventana de actualización"');

    const report = renderToStaticMarkup(<ServiceReportImportPanel isOpen catalogItems={[]} catalogLoading={false} onClose={() => {}} onApply={() => {}} />);
    expect(report).toContain('<dialog');
    expect(report).toContain('Selecciona un informe para continuar.');
  });

  it('cerrados, los paneles no pintan nada', () => {
    expect(renderToStaticMarkup(<OpenContractImportPanel isOpen={false} meta={null} onClose={() => {}} onImport={async () => {}} />)).toBe('');
  });

  it('ExportLink es un enlace de descarga con icono y el estilo de exportar', () => {
    const html = renderToStaticMarkup(<ExportLink href="/api/x" download="a.xlsx" />);
    expect(html).toContain('export-button');
    expect(html).toContain('download="a.xlsx"');
    expect(html).toContain('Descargar original');
    expect(html).toContain('<svg');
  });
});
