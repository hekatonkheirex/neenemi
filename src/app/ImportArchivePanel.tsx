import { useEffect, useMemo, useState } from 'react';
import { findSourceHeaderRow } from '../core/source-header-row';
import { confirmAction } from '../core/confirm';
import { readJson, toErrorMessage as describeError } from '../core/http';
import { Download } from 'lucide-react';
import { createColumnHelper, tableFeatures, useTable } from '@tanstack/react-table';
import { cn } from '../core/cn';
import { Button } from '../core/ui/button';
import { Table, TableBody, TableCell, TableHead, TableHeader, TableRow } from '../core/ui/table';

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
  onSheetChange: (sheetKey: string) => void;
  onPageChange: (page: number) => void;
};

const numberFormat = new Intl.NumberFormat('es-PY');
const features = tableFeatures({});
const EMPTY_ROWS: ImportSourceRow[] = [];
const columnHelper = createColumnHelper<typeof features, ImportSourceRow>();
const mutedText = 'text-ink-2! dark:text-[#9fb2d1]!';
const statusTone: Record<ImportBatchSummary['status'], string> = {
  applied: 'bg-[#2f8f5b]/15 text-[#14532d]! dark:text-[#9be3b9]!',
  staged: 'bg-[#e08a00]/15 text-[#7a4a00]! dark:text-[#ffd28a]!',
  failed: 'bg-[#d92d20]/15 text-[#912018]! dark:text-[#ffb4ab]!',
};

export default function ImportArchivePanel({ refreshKey }: ImportArchivePanelProps) {
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

  function selectBatch(batch: ImportBatchSummary): void {
    setSelectedBatchId(batch.id);
    setSelectedSheetKey('');
    setRawData(null);
    setPage(0);
  }

  return (
    <section aria-label="Importaciones y archivos originales" className="grid min-w-0 grid-cols-1 gap-5 rounded-2xl border border-navy/10 bg-white p-5 shadow-md dark:border-sky/20 dark:bg-panel">
      <div className="flex flex-wrap items-end justify-between gap-4">
        <div className="min-w-0">
          <div className="eyebrow">DATOS / ORIGINALES CONSERVADOS</div>
          <h2 className="text-navy dark:text-white">Archivos y filas de origen</h2>
          <div className={cn('max-w-3xl text-sm', mutedText)}>Consulta las importaciones de todos los módulos, inspecciona sus hojas y filas originales o descarga el archivo fuente.</div>
        </div>
        <div className="rounded-xl border border-navy/10 px-4 py-2 text-right dark:border-sky/20">
          <div className="text-2xl font-extrabold text-navy dark:text-white">{numberFormat.format(batches.length)}</div>
          <div className={cn('text-xs', mutedText)}>importaciones registradas</div>
        </div>
      </div>

      {error ? <div role="alert" className="rounded-xl border border-[#d92d20]/40 bg-[#d92d20]/10 px-4 py-3 text-sm text-[#912018] dark:text-[#ffb4ab]">{error}</div> : null}

      <div className="grid min-w-0 grid-cols-1 gap-5 lg:grid-cols-[minmax(16rem,22rem)_minmax(0,1fr)]">
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
          onSheetChange={(sheetKey) => { setSelectedSheetKey(sheetKey); setPage(0); }}
          onPageChange={setPage}
        />
      </div>
    </section>
  );
}

export function ImportBatchList({
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
    <div className="relative min-h-0">
      {/* ponytail: absolute inset-0 on lg so the list scrolls inside the viewer's height instead of driving the row height */}
      <div className="grid max-h-[32rem] content-start gap-2 overflow-y-auto rounded-xl border border-navy/10 p-4 dark:border-sky/20 lg:absolute lg:inset-0 lg:max-h-none">
      <div className="text-[0.7rem] font-extrabold uppercase tracking-[0.14em] text-ink-2 dark:text-[#8fa5c7]">Importaciones</div>
      {loading ? <div className={cn('text-sm', mutedText)}>Cargando archivos…</div> : null}
      {!loading && batches.length === 0 ? <div className={cn('text-sm', mutedText)}>Todavía no hay archivos importados.</div> : null}
      {batches.map((batch) => {
        const active = batch.id === selectedBatchId;
        return (
          <button
            key={batch.id}
            type="button"
            aria-pressed={active}
            onClick={() => onSelect(batch)}
            className={cn(
              'grid gap-0.5 rounded-xl border px-3 py-2.5 text-left transition-colors focus-visible:outline-2 focus-visible:outline-offset-2 focus-visible:outline-sky',
              active
                ? 'border-sky bg-sky/10 shadow-[inset_3px_0_0_var(--color-sky)]'
                : 'border-navy/10 bg-transparent hover:bg-sky/5 dark:border-sky/20',
            )}
          >
            <div className="break-words text-sm font-bold text-navy dark:text-white">{batch.sourceName}</div>
            <div className={cn('text-xs', mutedText)}>{formatImportDomain(batch.domain)} · {formatImportStatus(batch.status)}</div>
            <div className={cn('text-xs', mutedText)}>{numberFormat.format(batch.rawRows)} filas · {numberFormat.format(batch.rawSheets)} hojas originales</div>
            <div className={cn('text-xs tabular-nums', mutedText)}>{formatBatchDate(batch)}</div>
          </button>
        );
      })}
      </div>
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

export function ImportArchiveViewer({
  batch,
  selectedSheet,
  rawData,
  headerValues,
  headerRowNumber,
  loadingRows,
  page,
  canGoBack,
  canGoForward,
  onSheetChange,
  onPageChange,
}: ImportArchiveViewerProps) {
  const maxColumns = Math.max(...(rawData?.rows.map((row) => row.values.length) ?? [0]), selectedSheet?.columnCount ?? 0, 1);
  const columns = useMemo(
    () =>
      columnHelper.columns([
        columnHelper.display({ id: 'row', header: '#', cell: ({ row }) => row.original.rowNumber }),
        ...Array.from({ length: maxColumns }, (_, index) =>
          columnHelper.display({
            id: `c${index}`,
            header: headerLabel(headerValues[index], index),
            cell: ({ row }) => formatRawValue(row.original.values[index]),
          }),
        ),
      ]),
    [maxColumns, headerValues],
  );
  const table = useTable({ features, columns, data: rawData?.rows ?? EMPTY_ROWS, getRowId: (row) => row.id });
  const colSpan = maxColumns + 1;
  const emptyText = 'text-sm ' + mutedText;

  return (
    <div className="grid min-w-0 gap-4 rounded-xl border border-navy/10 p-4 dark:border-sky/20">
      {batch ? (
        <>
          <div className="flex flex-wrap items-start justify-between gap-3">
            <div className="min-w-0">
              <div className="text-[0.7rem] font-extrabold uppercase tracking-[0.14em] text-ink-2 dark:text-[#8fa5c7]">Fuente seleccionada</div>
              <h3 className="break-words text-lg font-bold text-navy dark:text-white">{batch.sourceName}</h3>
            </div>
            <div className="flex flex-wrap items-center gap-2">
              <div className={cn('rounded-full px-3 py-1 text-xs font-bold', statusTone[batch.status])}>{formatImportStatus(batch.status)}</div>
              {selectedSheet ? (
                <Button asChild variant="outline" size="sm">
                  <a
                    href={`/api/imports/${encodeURIComponent(batch.id)}/files/${encodeURIComponent(selectedSheet.importFileId)}`}
                    download={selectedSheet.fileName}
                  >
                    <Download aria-hidden="true" />
                    Descargar original
                  </a>
                </Button>
              ) : null}
            </div>
          </div>

          {rawData?.sheets.length ? (
            <>
              <label className="grid max-w-xl gap-1 text-xs font-bold text-ink-2! dark:text-[#9fb2d1]!">
                Hoja
                <select
                  className="h-10 rounded-xl border border-navy/20 bg-white px-3 text-sm font-normal text-navy focus-visible:outline-2 focus-visible:outline-offset-2 focus-visible:outline-sky dark:border-sky/30 dark:bg-panel dark:text-white"
                  value={selectedSheet ? sourceSheetKey(selectedSheet) : ''}
                  onChange={(event) => onSheetChange(event.target.value)}
                >
                  {rawData.sheets.map((sheet) => <option key={sourceSheetKey(sheet)} value={sourceSheetKey(sheet)}>{sheet.fileName} · {sheet.sheetName} ({numberFormat.format(sheet.rowCount)} filas)</option>)}
                </select>
              </label>
              <div className={cn('flex flex-wrap gap-x-4 gap-y-1 text-xs', mutedText)}>
                <div>{selectedSheet?.sheetName}</div>
                <div>{numberFormat.format(selectedSheet?.rowCount ?? 0)} filas · {numberFormat.format(selectedSheet?.columnCount ?? 0)} columnas</div>
                <div>Filas {page * 100 + 1}–{Math.min((page + 1) * 100, selectedSheet?.rowCount ?? 0)}</div>
              </div>
              <Table wrapperClassName="max-h-[28rem]">
                <TableHeader>
                  {table.getHeaderGroups().map((group) => (
                    <TableRow key={group.id}>
                      {group.headers.map((header) => (
                        <TableHead key={header.id}>{header.isPlaceholder ? null : <table.FlexRender header={header} />}</TableHead>
                      ))}
                    </TableRow>
                  ))}
                </TableHeader>
                <TableBody>
                  {loadingRows ? <TableRow><TableCell colSpan={colSpan} className={emptyText}>Leyendo filas originales…</TableCell></TableRow> : null}
                  {!loadingRows && table.getRowModel().rows.map((row) => (
                    <TableRow key={row.id} className={row.original.rowNumber === headerRowNumber ? 'bg-sky/10' : undefined}>
                      {row.getAllCells().map((cell) => (
                        <TableCell
                          key={cell.id}
                          className={cell.column.id === 'row' ? 'text-right tabular-nums' : 'max-w-72 truncate'}
                          title={cell.column.id === 'row' ? undefined : formatRawValue(row.original.values[Number(cell.column.id.slice(1))])}
                        >
                          <table.FlexRender cell={cell} />
                        </TableCell>
                      ))}
                    </TableRow>
                  ))}
                  {!loadingRows && rawData.rows.length === 0 ? <TableRow><TableCell colSpan={colSpan} className={emptyText}>No hay filas en este tramo.</TableCell></TableRow> : null}
                </TableBody>
              </Table>
              <div className="flex items-center justify-end gap-3">
                <Button variant="outline" size="sm" onClick={() => onPageChange(page - 1)} disabled={!canGoBack || loadingRows}>Anterior</Button>
                <div className={cn('text-xs', mutedText)}>Página {page + 1}</div>
                <Button variant="outline" size="sm" onClick={() => onPageChange(page + 1)} disabled={!canGoForward || loadingRows}>Siguiente</Button>
              </div>
            </>
          ) : <div className={emptyText}>{loadingRows ? 'Preparando las hojas originales…' : 'Esta importación no contiene filas XLSX conservadas.'}</div>}
        </>
      ) : <div className={emptyText}>Selecciona una importación para inspeccionar sus datos.</div>}
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

function toErrorMessage(value: unknown): string {
  return describeError(value, 'No se pudieron leer los datos originales.');
}
