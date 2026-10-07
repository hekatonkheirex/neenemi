import { renderToStaticMarkup } from 'react-dom/server';
import { describe, expect, it } from 'vitest';
import ImportArchivePanel, { ImportArchiveViewer, ImportBatchList } from './ImportArchivePanel';

const batch = {
  id: 'b1', domain: 'consumibles', sourceName: 'consumibles.xlsx', sourceType: null, sourceHash: null,
  status: 'applied' as const, createdAt: '2026-10-01T10:00:00', appliedAt: '2026-10-02T14:05:00', files: 1, rawRows: 1200, rawSheets: 1,
};
const sheet = { importFileId: 'f1', fileName: 'consumibles.xlsx', sheetName: 'Hoja1', sheetIndex: 0, rowCount: 3, columnCount: 2 };
const rawData = {
  sheets: [sheet], limit: 100, offset: 0,
  rows: [1, 2, 3].map((n) => ({ id: `r${n}`, batchId: 'b1', importFileId: 'f1', fileName: 'consumibles.xlsx', sheetName: 'Hoja1', sheetIndex: 0, rowNumber: n, values: n === 1 ? ['Modelo', 'Stock'] : [`M${n}`, n * 1000], isEmpty: false })),
};
const viewer = (over = {}) =>
  renderToStaticMarkup(
    <ImportArchiveViewer batch={batch} selectedSheet={sheet} rawData={rawData} headerValues={['Modelo', 'Stock']} headerRowNumber={1}
      loadingRows={false} page={0} canGoBack={false} canGoForward={false}
      onSheetChange={() => {}} onPageChange={() => {}} {...over} />,
  );

describe('ImportArchivePanel', () => {
  it('estado inicial: región nombrada, contador y aviso de carga', () => {
    const markup = renderToStaticMarkup(<ImportArchivePanel refreshKey={0} />);
    expect(markup).toContain('aria-label="Importaciones y archivos originales"');
    expect(markup).toContain('Archivos y filas de origen');
    expect(markup).toContain('Cargando archivos…');
  });

  it('la lista marca la importación activa con aria-pressed y muestra fecha y conteos', () => {
    const markup = renderToStaticMarkup(<ImportBatchList batches={[batch, { ...batch, id: 'b2', sourceName: 'otro.xlsx' }]} selectedBatchId="b1" loading={false} onSelect={() => {}} />);
    expect(markup.match(/aria-pressed="true"/g)).toHaveLength(1);
    expect(markup).toContain('Consumibles · Aplicada');
    expect(markup).toContain('1.200 filas · 1 hojas originales');
    expect(markup).toContain('Aplicada 02/10/2026, 14:05');
  });
});

describe('ImportArchiveViewer', () => {
  it('pinta la tabla con TanStack Table: encabezados, números de fila y valores formateados', () => {
    const markup = viewer();
    expect(markup).toContain('>#</th>');
    expect(markup).toContain('>Modelo</th>');
    expect(markup).toContain('>Stock</th>');
    expect(markup).toContain('>M2</td>');
    expect(markup).toContain('>2.000</td>');
    expect(markup).toContain('title="M2"');
    expect(markup).toContain('Filas 1–3');
  });

  it('resalta la fila de encabezado detectada y ofrece descarga y ningún dominio muestra «Quitar carga»', () => {
    const markup = viewer();
    expect(markup).toMatch(/<tr class="[^"]*bg-sky\/10[^"]*"><td[^>]*>1<\/td>/);
    expect(markup).toContain('href="/api/imports/b1/files/f1"');
    for (const domain of ['consumibles', 'viaticos', 'servicios', 'cartera']) {
      expect(viewer({ batch: { ...batch, domain } })).not.toContain('Quitar carga');
    }
  });

  it('paginación y estados vacíos', () => {
    expect(viewer({ canGoForward: true })).toMatch(/<button[^>]*>Siguiente<\/button>/);
    expect(viewer({ canGoBack: false })).toMatch(/<button[^>]*disabled[^>]*>Anterior<\/button>/);
    expect(viewer({ loadingRows: true })).toContain('Leyendo filas originales…');
    expect(viewer({ rawData: { ...rawData, rows: [] } })).toContain('No hay filas en este tramo.');
    expect(viewer({ batch: undefined })).toContain('Selecciona una importación');
  });

  it('en pantallas grandes la lista se estira a la altura del visor y hace scroll por dentro', () => {
    const list = renderToStaticMarkup(<ImportBatchList batches={[batch]} selectedBatchId="b1" loading={false} onSelect={() => {}} />);
    expect(list).toContain('lg:absolute');
    expect(list).toContain('lg:inset-0');
    expect(list).toContain('rounded-xl border border-navy/10 p-4');
    const panel = renderToStaticMarkup(<ImportArchivePanel refreshKey={0} />);
    expect(panel).not.toContain('items-start gap-5');
  });

  it('sin clases heredadas del visor', () => {
    expect(viewer()).not.toMatch(/source-data|catalog-table|secondary-button|export-button/);
  });
});
