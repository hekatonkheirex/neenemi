import { useEffect, useMemo, useState } from 'react';
import { findSourceHeaderRow } from '../core/source-header-row';
import { confirmAction } from '../core/confirm';

type ImportBatchSummary = {
  id: string;
  domain: string;
  sourceName: string;
  sourceType: string | null;
  sourceHash: string | null;
  status: 'staged' | 'applied' | 'failed';
  createdAt: string;
  appliedAt: string | null;
  files: number;
  rawRows: number;
  rawSheets: number;
};

type ImportSourceSheet = {
  importFileId: string;
  fileName: string;
  sheetName: string;
  sheetIndex: number;
  rowCount: number;
  columnCount: number;
};

type ImportSourceRow = {
  id: string;
  batchId: string;
  importFileId: string;
  fileName: string;
  sheetName: string;
  sheetIndex: number;
  rowNumber: number;
  values: unknown[];
  isEmpty: boolean;
};

type RawRowsResponse = {
  sheets: ImportSourceSheet[];
  rows: ImportSourceRow[];
  limit: number;
  offset: number;
};

type ImportArchivePanelProps = {
  refreshKey: number;
  onRemoveBatch: (batch: Pick<ImportBatchSummary, 'id' | 'sourceName'>) => Promise<void>;
};

type ImportArchiveViewerProps = {
  batch: ImportBatchSummary | undefined;
  selectedSheet: ImportSourceSheet | undefined;
  rawData: RawRowsResponse | null;
  headerValues: unknown[];
  headerRowNumber: number;
  loadingRows: boolean;
  page: number;
  canGoBack: boolean;
  canGoForward: boolean;
  removingBatchId: string | null;
  onSheetChange: (sheetKey: string) => void;
  onPageChange: (page: number) => void;
  onRemoveBatch: (batch: ImportBatchSummary) => void;
};

const numberFormat = new Intl.NumberFormat('es-PY');

export default function ImportArchivePanel({ refreshKey, onRemoveBatch }: ImportArchivePanelProps) {
  const [batches, setBatches] = useState<ImportBatchSummary[]>([]);
  const [selectedBatchId, setSelectedBatchId] = useState('');
  const [selectedSheetKey, setSelectedSheetKey] = useState('');
  const [rawData, setRawData] = useState<RawRowsResponse | null>(null);
  const [headerValues, setHeaderValues] = useState<unknown[]>([]);
  const [headerRowNumber, setHeaderRowNumber] = useState(1);
  const [page, setPage] = useState(0);
  const [loadingBatches, setLoadingBatches] = useState(true);
  const [loadingRows, setLoadingRows] = useState(false);
  const [removingBatchId, setRemovingBatchId] = useState<string | null>(null);
  const [error, setError] = useState<string | null>(null);
  const [localRefreshKey, setLocalRefreshKey] = useState(0);

  useEffect(() => {
    let cancelled = false;
    setLoadingBatches(true);
    setError(null);
    fetch('/api/imports?limit=300')
      .then((response) => readJson<{ batches: ImportBatchSummary[] }>(response))
      .then((value) => {
        if (cancelled) return;
        setBatches(value.batches);
        setSelectedBatchId((current) => value.batches.some((batch) => batch.id === current) ? current : value.batches[0]?.id ?? '');
        if (!value.batches.some((batch) => batch.id === selectedBatchId)) {
          setSelectedSheetKey('');
          setRawData(null);
        }
      })
      .catch((requestError: unknown) => {
        if (!cancelled) setError(toErrorMessage(requestError));
      })
      .finally(() => {
        if (!cancelled) setLoadingBatches(false);
      });

    return () => {
      cancelled = true;
    };
  }, [localRefreshKey, refreshKey]);

  const selectedBatch = batches.find((batch) => batch.id === selectedBatchId);
  const selectedSheet = rawData?.sheets.find((sheet) => sourceSheetKey(sheet) === selectedSheetKey) ?? rawData?.sheets[0];

  useEffect(() => {
    if (!selectedBatchId) {
      setRawData(null);
      setHeaderValues([]);
      setHeaderRowNumber(1);
      return undefined;
    }

    let cancelled = false;
    setLoadingRows(true);
    setError(null);
    const params = new URLSearchParams({ limit: '100', offset: String(page * 100) });
    const requestedSheet = rawData?.sheets.find((sheet) => sourceSheetKey(sheet) === selectedSheetKey);
    if (requestedSheet) {
      params.set('fileId', requestedSheet.importFileId);
      params.set('sheet', requestedSheet.sheetName);
    }

    const headerParams = new URLSearchParams({ limit: '30', offset: '0' });
    if (requestedSheet) {
      headerParams.set('fileId', requestedSheet.importFileId);
      headerParams.set('sheet', requestedSheet.sheetName);
    }
    Promise.all([
      fetch(`/api/imports/${encodeURIComponent(selectedBatchId)}/raw-rows?${params.toString()}`).then((response) => readJson<RawRowsResponse>(response)),
      requestedSheet
        ? fetch(`/api/imports/${encodeURIComponent(selectedBatchId)}/raw-rows?${headerParams.toString()}`).then((response) => readJson<RawRowsResponse>(response))
        : Promise.resolve(null),
    ])
      .then(([value, headerData]) => {
        if (cancelled) return;
        setRawData(value);
        if (headerData) {
          const headerIndex = findSourceHeaderRow(
            headerData.rows.map((row) => row.values),
            selectedBatch?.sourceType,
            selectedBatch?.sourceName,
          );
          const headerRow = headerData.rows[headerIndex] ?? headerData.rows[0];
          setHeaderValues(headerRow?.values ?? []);
          setHeaderRowNumber(headerRow?.rowNumber ?? 1);
        }
        if (!value.sheets.some((sheet) => sourceSheetKey(sheet) === selectedSheetKey)) {
          setSelectedSheetKey(value.sheets[0] ? sourceSheetKey(value.sheets[0]) : '');
          if (page !== 0 && value.rows.length === 0) setPage(0);
        }
      })
      .catch((requestError: unknown) => {
        if (!cancelled) setError(toErrorMessage(requestError));
      })
      .finally(() => {
        if (!cancelled) setLoadingRows(false);
      });

    return () => {
      cancelled = true;
    };
  }, [page, selectedBatchId, selectedSheetKey]);

  const maxColumns = useMemo(() => {
    const rowWidth = Math.max(...(rawData?.rows.map((row) => row.values.length) ?? [0]), selectedSheet?.columnCount ?? 0, 1);
    return rowWidth;
  }, [rawData?.rows, selectedSheet?.columnCount]);
  const canGoBack = page > 0;
  const canGoForward = Boolean(selectedSheet && (page + 1) * 100 < selectedSheet.rowCount);

  async function removeBatch(batch: ImportBatchSummary): Promise<void> {
    const confirmed = await confirmAction({
      title: 'Quitar carga importada',
      message: `Se quitará la carga ${batch.sourceName} y sus líneas normalizadas. El XLSX original se conservará en la carpeta de archivados.`,
      confirmLabel: 'Quitar carga',
    });
    if (!confirmed) return;

    setRemovingBatchId(batch.id);
    setError(null);
    try {
      await onRemoveBatch(batch);
      setSelectedBatchId('');
      setSelectedSheetKey('');
      setRawData(null);
      setLocalRefreshKey((value) => value + 1);
    } catch (requestError: unknown) {
      setError(toErrorMessage(requestError));
    } finally {
      setRemovingBatchId(null);
    }
  }

  function selectBatch(batch: ImportBatchSummary): void {
    setSelectedBatchId(batch.id);
    setSelectedSheetKey('');
    setRawData(null);
    setPage(0);
  }

  return (
    <section className="source-data-panel overview-import-archive" aria-label="Importaciones y archivos originales">
      <div className="source-data-heading">
        <div>
          <div className="eyebrow">DATOS / ORIGINALES CONSERVADOS</div>
          <h2>Archivos y filas de origen</h2>
          <p>Consulta las importaciones de todos los módulos, inspecciona sus hojas y filas originales o descarga el archivo fuente.</p>
        </div>
        <div className="source-data-note">
          <strong>{numberFormat.format(batches.length)}</strong>
          <span>importaciones registradas</span>
        </div>
      </div>

      {error ? <div className="source-data-error" role="alert">{error}</div> : null}

      <div className="source-data-layout">
        <ImportBatchList batches={batches} selectedBatchId={selectedBatchId} loading={loadingBatches} onSelect={selectBatch} />
        <ImportArchiveViewer
          batch={selectedBatch}
          selectedSheet={selectedSheet}
          rawData={rawData}
          headerValues={headerValues}
          headerRowNumber={headerRowNumber}
          loadingRows={loadingRows}
          page={page}
          canGoBack={canGoBack}
          canGoForward={canGoForward}
          removingBatchId={removingBatchId}
          onSheetChange={(sheetKey) => { setSelectedSheetKey(sheetKey); setPage(0); }}
          onPageChange={setPage}
          onRemoveBatch={(batch) => void removeBatch(batch)}
        />
      </div>
    </section>
  );
}

function ImportBatchList({
  batches,
  selectedBatchId,
  loading,
  onSelect,
}: {
  batches: ImportBatchSummary[];
  selectedBatchId: string;
  loading: boolean;
  onSelect: (batch: ImportBatchSummary) => void;
}) {
  return (
    <div className="source-data-batches">
      <span className="detail-label">Importaciones</span>
      {loading ? <p className="analytics-empty">Cargando archivos…</p> : null}
      {!loading && batches.length === 0 ? <p className="analytics-empty">Todavía no hay archivos importados.</p> : null}
      {batches.map((batch) => (
        <button
          className={`source-data-batch ${batch.id === selectedBatchId ? 'active' : ''}`}
          key={batch.id}
          type="button"
          onClick={() => onSelect(batch)}
        >
          <strong>{batch.sourceName}</strong>
          <span>{formatImportDomain(batch.domain)} · {formatImportStatus(batch.status)}</span>
          <small>{numberFormat.format(batch.rawRows)} filas · {numberFormat.format(batch.rawSheets)} hojas originales</small>
          <small className="source-data-batch-date">{formatBatchDate(batch)}</small>
        </button>
      ))}
    </div>
  );
}

const batchDateFormat = new Intl.DateTimeFormat('es-PY', { day: '2-digit', month: '2-digit', year: 'numeric', hour: '2-digit', minute: '2-digit', hour12: false });

/** Fecha de aplicación si ya se aplicó; si no, la de creación. */
export function formatBatchDate(batch: Pick<ImportBatchSummary, 'status' | 'createdAt' | 'appliedAt'>): string {
  const applied = batch.status === 'applied' && batch.appliedAt;
  const date = new Date(applied || batch.createdAt);
  if (Number.isNaN(date.getTime())) return 'Sin fecha';
  return `${applied ? 'Aplicada' : 'Cargada'} ${batchDateFormat.format(date)}`;
}

function ImportArchiveViewer({
  batch,
  selectedSheet,
  rawData,
  headerValues,
  headerRowNumber,
  loadingRows,
  page,
  canGoBack,
  canGoForward,
  removingBatchId,
  onSheetChange,
  onPageChange,
  onRemoveBatch,
}: ImportArchiveViewerProps) {
  const maxColumns = Math.max(...(rawData?.rows.map((row) => row.values.length) ?? [0]), selectedSheet?.columnCount ?? 0, 1);

  return (
    <div className="source-data-viewer">
      {batch ? (
        <>
          <div className="source-data-viewer-heading">
            <div>
              <span className="detail-label">Fuente seleccionada</span>
              <h3>{batch.sourceName}</h3>
            </div>
            <div className="source-data-viewer-actions">
              <span className={`source-data-status status-${batch.status}`}>{formatImportStatus(batch.status)}</span>
              {selectedSheet ? (
                <a
                  className="secondary-button source-data-download-button"
                  href={`/api/imports/${encodeURIComponent(batch.id)}/files/${encodeURIComponent(selectedSheet.importFileId)}`}
                  download={selectedSheet.fileName}
                >
                  Descargar original
                </a>
              ) : null}
              {batch.domain === 'consumibles' ? (
                <button
                  className="secondary-button source-data-remove-button"
                  type="button"
                  disabled={removingBatchId !== null}
                  onClick={() => onRemoveBatch(batch)}
                >
                  {removingBatchId === batch.id ? 'Quitando…' : 'Quitar carga'}
                </button>
              ) : null}
            </div>
          </div>

          {rawData?.sheets.length ? (
            <>
              <label className="source-data-sheet-select">
                <span>Hoja</span>
                <select value={selectedSheet ? sourceSheetKey(selectedSheet) : ''} onChange={(event) => onSheetChange(event.target.value)}>
                  {rawData.sheets.map((sheet) => <option key={sourceSheetKey(sheet)} value={sourceSheetKey(sheet)}>{sheet.fileName} · {sheet.sheetName} ({numberFormat.format(sheet.rowCount)} filas)</option>)}
                </select>
              </label>
              <div className="source-data-meta">
                <span>{selectedSheet?.sheetName}</span>
                <span>{numberFormat.format(selectedSheet?.rowCount ?? 0)} filas · {numberFormat.format(selectedSheet?.columnCount ?? 0)} columnas</span>
                <span>Filas {page * 100 + 1}–{Math.min((page + 1) * 100, selectedSheet?.rowCount ?? 0)}</span>
              </div>
              <div className="catalog-table-wrap source-data-table-wrap">
                <table className="catalog-table source-data-table">
                  <thead>
                    <tr>
                      <th>#</th>
                      {Array.from({ length: maxColumns }, (_, index) => <th key={index}>{headerLabel(headerValues[index], index)}</th>)}
                    </tr>
                  </thead>
                  <tbody>
                    {loadingRows ? <tr><td className="empty-cell" colSpan={maxColumns + 1}>Leyendo filas originales…</td></tr> : null}
                    {!loadingRows && rawData.rows.map((row) => (
                      <tr className={row.rowNumber === headerRowNumber ? 'source-header-row' : ''} key={row.id}>
                        <td className="source-row-number">{row.rowNumber}</td>
                        {Array.from({ length: maxColumns }, (_, index) => <td key={index}>{formatRawValue(row.values[index])}</td>)}
                      </tr>
                    ))}
                    {!loadingRows && rawData.rows.length === 0 ? <tr><td className="empty-cell" colSpan={maxColumns + 1}>No hay filas en este tramo.</td></tr> : null}
                  </tbody>
                </table>
              </div>
              <div className="source-data-pagination">
                <button className="secondary-button" type="button" onClick={() => onPageChange(page - 1)} disabled={!canGoBack || loadingRows}>Anterior</button>
                <span>Página {page + 1}</span>
                <button className="secondary-button" type="button" onClick={() => onPageChange(page + 1)} disabled={!canGoForward || loadingRows}>Siguiente</button>
              </div>
            </>
          ) : loadingRows ? <p className="analytics-empty">Preparando las hojas originales…</p> : <p className="analytics-empty">Esta importación no contiene filas XLSX conservadas.</p>}
        </>
      ) : <p className="analytics-empty">Selecciona una importación para inspeccionar sus datos.</p>}
    </div>
  );
}

function sourceSheetKey(sheet: ImportSourceSheet): string {
  return `${sheet.importFileId}::${sheet.sheetName}`;
}

function headerLabel(value: unknown, index: number): string {
  const text = formatRawValue(value).replace(/\s+/g, ' ').trim();
  return text ? text.slice(0, 32) : `Columna ${index + 1}`;
}

function formatRawValue(value: unknown): string {
  if (value === null || value === undefined) return '';
  if (typeof value === 'string') return value;
  if (typeof value === 'number') return numberFormat.format(value);
  if (typeof value === 'boolean') return value ? 'Sí' : 'No';
  return String(value);
}

function formatImportDomain(domain: string): string {
  const labels: Record<string, string> = {
    catalog: 'Catálogo',
    operations: 'Cartera',
    'operations-fleet-contracts': 'Cartera · contratos',
    'operations-fleet-contract-details': 'Cartera · detalles',
    'operations-fleet-classification': 'Cartera · clasificación',
    'operations-canon': 'Soporte Canon',
    'operations-waldbott': 'Stock Waldbott',
    maintenance: 'Mantenimiento',
    mps: 'MPS',
    consumibles: 'Consumibles',
    services: 'Servicios',
    viaticos: 'Viáticos',
  };
  return labels[domain] ?? domain;
}

function formatImportStatus(status: ImportBatchSummary['status']): string {
  if (status === 'applied') return 'Aplicada';
  if (status === 'failed') return 'Fallida';
  return 'Pendiente';
}

async function readJson<T>(response: Response): Promise<T> {
  const body = (await response.json()) as T | { error?: string };
  if (!response.ok) {
    const error = typeof body === 'object' && body !== null && 'error' in body && typeof body.error === 'string'
      ? body.error
      : 'La API local devolvió un error.';
    throw new Error(error);
  }
  return body as T;
}

function toErrorMessage(value: unknown): string {
  return value instanceof Error ? value.message : 'No se pudieron leer los datos originales.';
}
