import { readFileSync } from 'node:fs';
import { renderToStaticMarkup } from 'react-dom/server';
import { describe, expect, it } from 'vitest';
import TravelDrawer from './TravelDrawer';
import TravelOverviewPanels from './TravelOverviewPanels';
import { TravelHistoricalView, TravelImportPreviewDialog, type TravelImportPreview } from './TravelViews';
import type { HistoricalSummary, TravelSummary } from './types';

const sources = ['ViaticosModule', 'TravelViews', 'TravelDrawer', 'TravelOverviewPanels', 'DestinationCombobox'].map((name) => `src/modules/viaticos/${name}.tsx`);

// Clases heredadas que el rediseño compartido reemplaza; su CSS ya no existe.
const legacy = /className=.*\b(travel-(?!page\b)[a-z-]+|destination-combobox[a-z-]*|sales-card|card-heading|secondary-button|primary-button|text-button|catalog-header|catalog-table-wrap|catalog-table|search-field|compact-field|sales-status|summary-card|status-select|form-grid-2|historical-travel-table|danger-text-button)\b/;

const preview: TravelImportPreview = {
  duplicate: false, existingBatchId: null, currentSourceBatchId: 'b1', currentSourceName: 'viejo.xlsx', sourceName: 'CONTROL DE VIATICO 2026.xlsx',
  sourceHash: 'h', sourceType: 'viaticos', primarySheetName: 'VIAJES2026', sourceSheetNames: ['VIAJES2026', 'HOTEL'], sourceYear: 2026,
  incomingYears: [2026], trips: 120, historicalSnapshots: 4, busFares: 9, tollRoutes: 5,
};

const summary = {
  totalCost: 1_000_000, records: 3, pending: 1, review: 0, approved: 2, operationalYear: 2026, monthlyTotals: [],
  transportTotals: [{ key: 'MOVIL PROPIO', records: 2, totalCost: 700000 }],
  topDestinations: [{ destination: 'Encarnación', records: 1, totalCost: 400000 }],
} as unknown as TravelSummary;

describe('rediseño de Viáticos', () => {
  it.each(sources)('%s usa las primitivas compartidas y no las clases heredadas', (file) => {
    expect(readFileSync(file, 'utf8').match(legacy)?.[0]).toBeUndefined();
  });

  it('el panel lateral es un diálogo nativo con dialogPanel, título enlazado y cierre con nombre', () => {
    const html = renderToStaticMarkup(<TravelDrawer eyebrow="NUEVO REGISTRO" title="Registrar viaje" onRequestClose={() => {}}><input name="cliente" /></TravelDrawer>);
    expect(html).toContain('<dialog');
    expect(html).toContain('backdrop:backdrop-blur-sm');
    expect(html).toContain('aria-labelledby="travel-drawer-title"');
    expect(html).toContain('aria-label="Cerrar panel"');
    expect(html).toContain('data-drawer-body');
  });

  it('la previsualización de importación es un diálogo con las cifras y la acción de reemplazo', () => {
    const html = renderToStaticMarkup(<TravelImportPreviewDialog preview={preview} importing={false} onCancel={() => {}} onConfirm={() => {}} />);
    expect(html).toContain('<dialog');
    expect(html).toContain('Reemplazar fuente');
    expect(html).toContain('CONTROL DE VIATICO 2026.xlsx');
    expect(html).toContain('aria-label="Cancelar importación"');
    expect(html).toContain('120');
  });

  it('los paneles de resumen muestran el medio con tilde y el destino con su costo', () => {
    const html = renderToStaticMarkup(<TravelOverviewPanels summary={summary} />);
    expect(html).toContain('MÓVIL PROPIO');
    expect(html).toContain('Encarnación');
    expect(html).toContain('₲ 400.000');
  });

  it('el histórico sin datos avisa y conserva el archivo de fuente', () => {
    const html = renderToStaticMarkup(<TravelHistoricalView summaries={[] as HistoricalSummary[]} sourceName={null} sourceBatchId={null} />);
    expect(html).toContain('No hay resúmenes históricos cargados.');
    expect(html).toContain('Hojas auxiliares de la planilla');
  });
});
