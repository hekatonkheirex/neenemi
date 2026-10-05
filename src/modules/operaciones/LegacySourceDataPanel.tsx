import { useEffect, useMemo, useState } from 'react';
import { readJson, toErrorMessage as describeError } from '../../core/http';

type ImportBatchStatus = 'staged' | 'applied' | 'failed';

type ImportBatchSummary = {
  id: string;
  domain: string;
  sourceName: string;
  sourceType: string | null;
  status: ImportBatchStatus;
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
  rowNumber: number;
  values: unknown[];
};

type RawRowsResponse = {
  sheets: ImportSourceSheet[];
  rows: ImportSourceRow[];
  limit: number;
  offset: number;
};

const numberFormat = new Intl.NumberFormat('es-PY');
const legacySourceDomains = new Set(['operations-canon', 'operations-waldbott']);

export default function LegacySourceDataPanel() {
  const [batches, setBatches] = useState<ImportBatchSummary[]>([]);
  const [selectedBatchId, setSelectedBatchId] = useState('');
  const [selectedSheetKey, setSelectedSheetKey] = useState('');
  const [rawData, setRawData] = useState<RawRowsResponse | null>(null);
  const [headerValues, setHeaderValues] = useState<unknown[]>([]);
  const [headerRowNumber, setHeaderRowNumber] = useState(1);
  const [page, setPage] = useState(0);
  const [loadingBatches, setLoadingBatches] = useState(true);
  const [loadingRows, setLoadingRows] = useState(false);
  const [error, setError] = useState<string | null>(null);

  useEffect(() => {
    let cancelled = false;
    setLoadingBatches(true);
    fetch('/api/imports?limit=300')
      .then((response) => readJson<{ batches: ImportBatchSummary[] }>(response))
      .then((value) => {
        if (cancelled) return;
        const sourceBatches = value.batches.filter((batch) => legacySourceDomains.has(batch.domain));
        setBatches(sourceBatches);
        setSelectedBatchId((current) => sourceBatches.some((batch) => batch.id === current) ? current : sourceBatches[0]?.id ?? '');
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
  }, []);

  useEffect(() => {
    if (!selectedBatchId) {
      setRawData(null);
      setHeaderValues([]);
      setHeaderRowNumber(1);
      return;
    }

    let cancelled = false;
    setLoadingRows(true);
    setError(null);
    const selectedSheet = rawData?.sheets.find((sheet) => sourceSheetKey(sheet) === selectedSheetKey);
    const params = new URLSearchParams({ limit: '100', offset: String(page * 100) });
    const headerParams = new URLSearchParams({ limit: '30', offset: '0' });
    if (selectedSheet) {
      params.set('fileId', selectedSheet.importFileId);
      params.set('sheet', selectedSheet.sheetName);
      headerParams.set('fileId', selectedSheet.importFileId);
      headerParams.set('sheet', selectedSheet.sheetName);
    }

    Promise.all([
      fetch(`/api/imports/${encodeURIComponent(selectedBatchId)}/raw-rows?${params.toString()}`).then((response) => readJson<RawRowsResponse>(response)),
      selectedSheet
        ? fetch(`/api/imports/${encodeURIComponent(selectedBatchId)}/raw-rows?${headerParams.toString()}`).then((response) => readJson<RawRowsResponse>(response))
        : Promise.resolve(null),
    ])
      .then(([value, headerData]) => {
        if (cancelled) return;
        setRawData(value);
        if (headerData) {
          const batch = batches.find((item) => item.id === selectedBatchId);
          const headerIndex = findLegacySourceHeaderRow(
            headerData.rows.map((row) => row.values),
            batch?.domain,
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
  }, [batches, page, selectedBatchId, selectedSheetKey]);

  const selectedBatch = batches.find((batch) => batch.id === selectedBatchId);
  const selectedSheet = rawData?.sheets.find((sheet) => sourceSheetKey(sheet) === selectedSheetKey) ?? rawData?.sheets[0];
  const maxColumns = useMemo(() => Math.max(
    ...(rawData?.rows.map((row) => row.values.length) ?? [0]),
    selectedSheet?.columnCount ?? 0,
    headerValues.length,
    1,
  ), [headerValues.length, rawData?.rows, selectedSheet?.columnCount]);
  const canGoBack = page > 0;
  const canGoForward = Boolean(selectedSheet && (page + 1) * 100 < selectedSheet.rowCount);

  return (
    <section className="sales-card operations-source-data" aria-label="Datos originales de listas Canon y stock Waldbott">
      <div className="source-data-heading">
        <div>
          <div className="eyebrow">DATOS ORIGINALES / OPERACIONES</div>
          <h2>Filas originales de Canon y Waldbott</h2>
          <p>Las listas normalizadas no reemplazan los archivos: cada carga conserva sus hojas y filas para revisar columnas históricas, títulos y valores que aún no tienen una vista propia.</p>
        </div>
        <div className="source-data-note">
          <strong>{numberFormat.format(batches.length)}</strong>
          <span>cargas auditables</span>
        </div>
      </div>

      {error ? <div className="source-data-error" role="alert">{error}</div> : null}

      <div className="source-data-layout">
        <div className="source-data-batches">
          <span className="detail-label">Listas cargadas</span>
          {loadingBatches ? <p className="analytics-empty">Cargando archivos…</p> : null}
          {!loadingBatches && batches.length === 0 ? <p className="analytics-empty">Todavía no hay listas Canon o stock Waldbott importados.</p> : null}
          {batches.map((batch) => (
            <button
              className={`source-data-batch ${batch.id === selectedBatchId ? 'active' : ''}`}
              key={batch.id}
              type="button"
              onClick={() => {
                setSelectedBatchId(batch.id);
                setSelectedSheetKey('');
                setRawData(null);
                setHeaderValues([]);
                setPage(0);
              }}
            >
              <strong>{batch.sourceName}</strong>
              <span>{formatImportDomain(batch.domain)} · {formatImportStatus(batch.status)}</span>
              <small>{numberFormat.format(batch.rawRows)} filas · {numberFormat.format(batch.rawSheets)} hojas originales</small>
            </button>
          ))}
        </div>

        <div className="source-data-viewer">
          {selectedBatch ? (
            <>
              <div className="source-data-viewer-heading">
                <div>
                  <span className="detail-label">Fuente seleccionada</span>
                  <h3>{selectedBatch.sourceName}</h3>
                </div>
                <div className="source-data-viewer-actions">
                  <span className={`source-data-status status-${selectedBatch.status}`}>{formatImportStatus(selectedBatch.status)}</span>
                  {selectedSheet ? <a
                    className="secondary-button source-data-download-button"
                    href={`/api/imports/${encodeURIComponent(selectedBatch.id)}/files/${encodeURIComponent(selectedSheet.importFileId)}`}
                    download={selectedSheet.fileName}
                  >
                    Descargar original
                  </a> : null}
                </div>
              </div>

              {rawData?.sheets.length ? (
                <>
                  <label className="source-data-sheet-select">
                    <span>Hoja</span>
                    <select
                      value={selectedSheet ? sourceSheetKey(selectedSheet) : ''}
                      onChange={(event) => {
                        setSelectedSheetKey(event.target.value);
                        setPage(0);
                      }}
                    >
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
                    <button className="secondary-button" type="button" onClick={() => setPage((value) => value - 1)} disabled={!canGoBack || loadingRows}>Anterior</button>
                    <span>Página {page + 1}</span>
                    <button className="secondary-button" type="button" onClick={() => setPage((value) => value + 1)} disabled={!canGoForward || loadingRows}>Siguiente</button>
                  </div>
                </>
              ) : loadingRows ? <p className="analytics-empty">Preparando las hojas originales…</p> : <p className="analytics-empty">Esta carga no contiene filas XLSX conservadas.</p>}
            </>
          ) : <p className="analytics-empty">Selecciona una carga para inspeccionar sus datos.</p>}
        </div>
      </div>
    </section>
  );
}

export function findLegacySourceHeaderRow(rows: readonly unknown[][], domain: string | null | undefined): number {
  for (let rowIndex = 0; rowIndex < Math.min(rows.length, 30); rowIndex += 1) {
    const headers = rows[rowIndex] ?? [];
    if (domain === 'operations-canon') {
      const hasModel = hasHeader(headers, ['machine', 'machines', 'model', 'modelo']);
      const hasPartOrEnd = hasHeader(headers, ['parts item code', 'item code', 'part code', 'support end date', 'parts end date', 'end date']);
      if (hasModel && hasPartOrEnd) return rowIndex;
    }
    if (domain === 'operations-waldbott') {
      const hasModel = hasHeader(headers, ['descripcion', 'description', 'modelo', 'model', 'machine', 'articulo', 'article']);
      if (hasModel && hasHeader(headers, ['deposito', 'depósito', 'deposit', 'deposits', 'warehouse', 'almacen'])) return rowIndex;
    }
  }
  return 0;
}

function hasHeader(headers: readonly unknown[], names: readonly string[]): boolean {
  const expected = new Set(names.map(normalizeHeader));
  return headers.some((header) => expected.has(normalizeHeader(header)));
}

function normalizeHeader(value: unknown): string {
  return String(value ?? '')
    .normalize('NFD')
    .replace(/[\u0300-\u036f]/g, '')
    .toLocaleLowerCase()
    .replace(/[^a-z0-9]+/g, ' ')
    .trim();
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
  return domain === 'operations-canon' ? 'Soporte Canon' : 'Stock Waldbott';
}

function formatImportStatus(status: ImportBatchStatus): string {
  if (status === 'applied') return 'Aplicada';
  if (status === 'failed') return 'Fallida';
  return 'Pendiente';
}

function toErrorMessage(value: unknown): string {
  return describeError(value, 'No se pudieron leer las filas originales.');
}
