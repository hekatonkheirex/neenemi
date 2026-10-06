import { useEffect, useMemo, useState } from 'react';
import { readJson, toErrorMessage as describeError } from '../../core/http';
import { DownloadIcon } from '../../core/ActionButtons';
import { cn } from '../../core/cn';
import { Badge, type BadgeTone } from '../../core/ui/badge';
import { Button, buttonVariants } from '../../core/ui/button';
import { Card, CardHeader, Muted } from '../../core/ui/card';
import { Table, TableBody, TableCell, TableHead, TableHeader, TableRow } from '../../core/ui/table';

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
    <Card className="min-w-0 grid-cols-1 [overflow-wrap:anywhere]" aria-label="Datos originales de listas Canon y stock Waldbott">
      <CardHeader eyebrow="Datos originales / Operaciones" title="Filas originales de Canon y Waldbott" aside={<Badge>{numberFormat.format(batches.length)} cargas auditables</Badge>} />
      <Muted className="text-sm leading-relaxed">Las listas normalizadas no reemplazan los archivos: cada carga conserva sus hojas y filas para revisar columnas históricas, títulos y valores que aún no tienen una vista propia.</Muted>

      {error ? <div className="rounded-xl border border-[#b42318]/30 bg-[#b42318]/5 p-4 text-sm text-[#b42318] dark:text-[#ffb0b7]" role="alert">{error}</div> : null}

      <div className="@container min-w-0">
        <div className="grid min-w-0 items-start gap-4 @[56rem]:grid-cols-[minmax(14rem,1fr)_minmax(0,3fr)]">
          <div className="grid min-w-0 content-start gap-2">
            <div className="text-xs font-bold uppercase tracking-wider text-ink-2 dark:text-[#9fb2d1]">Listas cargadas</div>
            {loadingBatches ? <Muted className="text-sm">Cargando archivos…</Muted> : null}
            {!loadingBatches && batches.length === 0 ? <Muted className="text-sm">Todavía no hay listas Canon o stock Waldbott importados.</Muted> : null}
            {batches.map((batch) => (
              <button
                className={cn('grid min-w-0 gap-0.5 rounded-xl border p-3 text-left focus-visible:outline-2 focus-visible:outline-offset-2 focus-visible:outline-sky', batch.id === selectedBatchId ? 'border-sky bg-sky/10' : 'border-navy/10 bg-white hover:bg-sky/5 dark:border-sky/20 dark:bg-transparent')}
                key={batch.id}
                type="button"
                aria-pressed={batch.id === selectedBatchId}
                onClick={() => {
                  setSelectedBatchId(batch.id);
                  setSelectedSheetKey('');
                  setRawData(null);
                  setHeaderValues([]);
                  setPage(0);
                }}
              >
                <div className="font-bold text-navy dark:text-white">{batch.sourceName}</div>
                <Muted>{formatImportDomain(batch.domain)} · {formatImportStatus(batch.status)}</Muted>
                <Muted>{numberFormat.format(batch.rawRows)} filas · {numberFormat.format(batch.rawSheets)} hojas originales</Muted>
              </button>
            ))}
          </div>

          <div className="grid min-w-0 content-start gap-3">
            {selectedBatch ? (
              <>
                <div className="flex flex-wrap items-start justify-between gap-3">
                  <div className="grid min-w-0 gap-0.5"><Muted>Fuente seleccionada</Muted><h3 className="m-0 text-base font-bold text-navy dark:text-white">{selectedBatch.sourceName}</h3></div>
                  <div className="flex flex-wrap items-center gap-2">
                    <Badge tone={importStatusTone(selectedBatch.status)}>{formatImportStatus(selectedBatch.status)}</Badge>
                    {selectedSheet ? <a
                      className={cn(buttonVariants({ variant: 'export' }), 'export-button')}
                      href={`/api/imports/${encodeURIComponent(selectedBatch.id)}/files/${encodeURIComponent(selectedSheet.importFileId)}`}
                      download={selectedSheet.fileName}
                    >
                      <DownloadIcon />
                      Descargar original
                    </a> : null}
                  </div>
                </div>

                {rawData?.sheets.length ? (
                  <>
                    <label className="grid min-w-0 gap-1.5 text-xs font-semibold text-navy dark:text-white">Hoja
                      <select
                        className="h-10 w-full min-w-0 rounded-xl border border-navy/20 bg-white px-3 text-sm text-navy focus-visible:outline-2 focus-visible:outline-offset-2 focus-visible:outline-sky dark:border-sky/30 dark:bg-navy/50 dark:text-white"
                        value={selectedSheet ? sourceSheetKey(selectedSheet) : ''}
                        onChange={(event) => {
                          setSelectedSheetKey(event.target.value);
                          setPage(0);
                        }}
                      >
                        {rawData.sheets.map((sheet) => <option key={sourceSheetKey(sheet)} value={sourceSheetKey(sheet)}>{sheet.fileName} · {sheet.sheetName} ({numberFormat.format(sheet.rowCount)} filas)</option>)}
                      </select>
                    </label>
                    <div className="flex flex-wrap gap-2">
                      <Badge>{selectedSheet?.sheetName}</Badge>
                      <Badge>{numberFormat.format(selectedSheet?.rowCount ?? 0)} filas · {numberFormat.format(selectedSheet?.columnCount ?? 0)} columnas</Badge>
                      <Badge>Filas {page * 100 + 1}–{Math.min((page + 1) * 100, selectedSheet?.rowCount ?? 0)}</Badge>
                    </div>
                    <Table className="min-w-max text-xs" wrapperClassName="max-h-[28rem]">
                      <TableHeader>
                        <TableRow>
                          <TableHead>#</TableHead>
                          {Array.from({ length: maxColumns }, (_, index) => <TableHead key={index}>{headerLabel(headerValues[index], index)}</TableHead>)}
                        </TableRow>
                      </TableHeader>
                      <TableBody>
                        {loadingRows ? <TableRow><TableCell className="py-6 text-center" colSpan={maxColumns + 1}>Leyendo filas originales…</TableCell></TableRow> : null}
                        {!loadingRows && rawData.rows.map((row) => (
                          <TableRow className={row.rowNumber === headerRowNumber ? 'bg-sky/10 font-semibold' : undefined} key={row.id}>
                            <TableCell className="font-mono tabular-nums">{row.rowNumber}</TableCell>
                            {Array.from({ length: maxColumns }, (_, index) => <TableCell className="max-w-[16rem] truncate" key={index} title={formatRawValue(row.values[index])}>{formatRawValue(row.values[index])}</TableCell>)}
                          </TableRow>
                        ))}
                        {!loadingRows && rawData.rows.length === 0 ? <TableRow><TableCell className="py-6 text-center" colSpan={maxColumns + 1}>No hay filas en este tramo.</TableCell></TableRow> : null}
                      </TableBody>
                    </Table>
                    <div className="flex flex-wrap items-center justify-between gap-3">
                      <Button variant="outline" onClick={() => setPage((value) => value - 1)} disabled={!canGoBack || loadingRows}>Anterior</Button>
                      <Muted>Página {page + 1}</Muted>
                      <Button variant="outline" onClick={() => setPage((value) => value + 1)} disabled={!canGoForward || loadingRows}>Siguiente</Button>
                    </div>
                  </>
                ) : loadingRows ? <Muted className="text-sm">Preparando las hojas originales…</Muted> : <Muted className="text-sm">Esta carga no contiene filas XLSX conservadas.</Muted>}
              </>
            ) : <Muted className="text-sm">Selecciona una carga para inspeccionar sus datos.</Muted>}
          </div>
        </div>
      </div>
    </Card>
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

function importStatusTone(status: ImportBatchStatus): BadgeTone {
  if (status === 'applied') return 'success';
  if (status === 'failed') return 'danger';
  return 'warning';
}

function toErrorMessage(value: unknown): string {
  return describeError(value, 'No se pudieron leer las filas originales.');
}
