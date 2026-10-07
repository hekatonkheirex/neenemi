import { Fragment, useEffect, useMemo, useRef, useState } from 'react';
import PaginationControls from '../../core/PaginationControls';
import { paginateItems } from '../../core/pagination';
import { formatSourceLocation } from '../../core/source-location';
import { travelSourceOperationalEntries } from './source-operational';
import type { HistoricalSummary, TravelStatus, TravelTrip } from './types';
import { readJson, toErrorMessage as describeError } from '../../core/http';
import { DownloadIcon } from '../../core/ActionButtons';
import { ChartColumn, Clock, type LucideIcon, Plane, Receipt, X } from 'lucide-react';
import { cn } from '../../core/cn';
import { dialogPanel } from '../../core/dialog';
import { Badge, type BadgeTone } from '../../core/ui/badge';
import { Button, buttonVariants } from '../../core/ui/button';
import { Card, CardHeader, Muted } from '../../core/ui/card';
import { Table, TableBody, TableCell, TableHead, TableHeader, TableRow } from '../../core/ui/table';

export type TravelView = 'resumen' | 'viajes' | 'rendiciones' | 'historico';

export const TRAVEL_VIEW_OPTIONS: Array<{ id: TravelView; label: string; hint: string; icon: LucideIcon }> = [
  { id: 'resumen', label: 'Resumen', hint: 'Indicadores del período', icon: ChartColumn },
  { id: 'viajes', label: 'Viajes', hint: 'Detalle y alta de registros', icon: Plane },
  { id: 'rendiciones', label: 'Rendiciones', hint: 'Seguimiento documental', icon: Receipt },
  { id: 'historico', label: 'Histórico', hint: 'Comparativas y fuente', icon: Clock },
];

const STATUS_LABELS: Record<TravelStatus, string> = {
  pending: 'Pendiente',
  review: 'En revisión',
  approved: 'Aprobada',
};

const TRAVEL_STATUS_VALUES: TravelStatus[] = ['pending', 'review', 'approved'];
const moneyFormat = new Intl.NumberFormat('es-PY', { maximumFractionDigits: 0 });
const integerFormat = new Intl.NumberFormat('es-PY', { maximumFractionDigits: 0 });
const dateFormat = new Intl.DateTimeFormat('es-PY', { year: 'numeric', month: '2-digit', day: '2-digit', timeZone: 'UTC' });
const selectClass = 'h-10 w-full min-w-0 rounded-xl border border-navy/20 bg-white px-3 text-sm text-navy focus-visible:outline-2 focus-visible:outline-offset-2 focus-visible:outline-sky disabled:opacity-50 dark:border-sky/30 dark:bg-navy/50 dark:text-white';
const fieldClass = 'grid min-w-0 gap-1.5 text-xs font-semibold text-navy dark:text-white';
const cardClass = 'min-w-0 grid-cols-1 [overflow-wrap:anywhere]';
const subCardClass = 'min-w-0 rounded-xl border border-navy/10 bg-paper p-4 dark:border-sky/20 dark:bg-navy/30';
const statusTone: Record<TravelStatus, BadgeTone> = { pending: 'warning', review: 'neutral', approved: 'success' };
const monthLabels = ['Ene', 'Feb', 'Mar', 'Abr', 'May', 'Jun', 'Jul', 'Ago', 'Sep', 'Oct', 'Nov', 'Dic'];

type RenditionCostField = keyof Pick<TravelTrip, 'advance' | 'allowance' | 'lodging' | 'tolls' | 'otherCost' | 'vehiclePayment' | 'technicianPayment' | 'fuelCost'>;

const RENDITION_COST_FIELDS: Array<{ key: RenditionCostField; label: string; separateFromTotal?: boolean }> = [
  { key: 'advance', label: 'Monto / anticipo', separateFromTotal: true },
  { key: 'allowance', label: 'Viático' },
  { key: 'lodging', label: 'Hospedaje' },
  { key: 'tolls', label: 'Peajes' },
  { key: 'otherCost', label: 'Varios' },
  { key: 'vehiclePayment', label: 'Uso de vehículo' },
  { key: 'technicianPayment', label: 'Técnico / chofer' },
  { key: 'fuelCost', label: 'Combustible' },
];

type SourceSheet = {
  importFileId: string;
  fileName: string;
  sheetName: string;
  sheetIndex: number;
  rowCount: number;
  columnCount: number;
};

type SourceRow = {
  id: string;
  fileName: string;
  sheetName: string;
  rowNumber: number;
  values: unknown[];
};

type SourceRowsResponse = {
  sheets: SourceSheet[];
  rows: SourceRow[];
  limit: number;
  offset: number;
};

export type TravelImportPreview = {
  duplicate: boolean;
  existingBatchId: string | null;
  currentSourceBatchId: string | null;
  currentSourceName: string | null;
  sourceName: string;
  sourceHash: string;
  sourceType: 'viaticos';
  primarySheetName: string;
  sourceSheetNames: string[];
  sourceYear: number | null;
  incomingYears: number[];
  trips: number;
  historicalSnapshots: number;
  busFares: number;
  tollRoutes: number;
};

export function TravelImportPreviewDialog({
  preview,
  importing,
  onCancel,
  onConfirm,
}: {
  preview: TravelImportPreview;
  importing: boolean;
  onCancel: () => void;
  onConfirm: () => void;
}) {
  const dialogRef = useRef<HTMLDialogElement>(null);
  const cancelRef = useRef<HTMLButtonElement>(null);

  useEffect(() => {
    const dialog = dialogRef.current;
    if (dialog && !dialog.open) dialog.showModal();
    cancelRef.current?.focus();
    return () => dialog?.close();
  }, []);

  return (
    <dialog
      ref={dialogRef}
      className={cn(dialogPanel, 'w-[min(38rem,calc(100vw-2rem))]')}
      aria-labelledby="travel-import-title"
      aria-describedby="travel-import-description"
      onCancel={(event) => { event.preventDefault(); if (!importing) onCancel(); }}
      onMouseDown={(event) => { if (event.target === event.currentTarget && !importing) onCancel(); }}
    >
      <div className="flex max-h-[calc(100vh-2rem)] flex-col">
        <header className="flex shrink-0 items-start justify-between gap-4 border-b border-navy/10 p-5 dark:border-sky/20">
          <div className="grid min-w-0 gap-2">
            <CardHeader eyebrow="Previsualización local" title={<span id="travel-import-title">{preview.currentSourceBatchId && !preview.duplicate ? 'Reemplazar fuente' : 'Confirmar importación'}</span>} />
            <Muted id="travel-import-description">La planilla fue analizada antes de modificar los registros guardados.</Muted>
          </div>
          <Button ref={cancelRef} variant="ghost" size="icon" aria-label="Cancelar importación" onClick={onCancel} disabled={importing}><X /></Button>
        </header>

        <div className="grid min-h-0 gap-4 overflow-y-auto p-5 [overflow-wrap:anywhere]">
          <div className={cn(subCardClass, 'grid gap-1')}>
            <Muted>Archivo seleccionado</Muted>
            <div className="font-bold text-navy dark:text-white" title={preview.sourceName}>{preview.sourceName}</div>
            <Muted>Hoja principal: {preview.primarySheetName}</Muted>
          </div>

          <div className="grid grid-cols-2 gap-3 sm:grid-cols-4" aria-label="Resumen de la planilla">
            <ImportMetric label="Viajes" value={integerFormat.format(preview.trips)} />
            <ImportMetric label="Hojas" value={integerFormat.format(preview.sourceSheetNames.length)} />
            <ImportMetric label="Año fuente" value={preview.sourceYear ? String(preview.sourceYear) : 'No detectado'} />
            <ImportMetric label="Años en filas" value={preview.incomingYears.length ? preview.incomingYears.join(' · ') : '—'} />
          </div>

          {preview.duplicate ? (
            <div className="grid gap-1 rounded-xl border border-[#e08a00]/40 bg-[#e08a00]/10 p-4 text-sm" role="status"><div className="font-bold text-[#7a4a00] dark:text-[#ffd28a]">Esta planilla ya está importada.</div><div className="text-ink-2 dark:text-[#d6e2f5]">No se crearán filas duplicadas. Podés cancelar esta operación.</div></div>
          ) : (
            <div className="grid gap-1 rounded-xl border border-sky/40 bg-sky/10 p-4 text-sm" role="status"><div className="font-bold text-navy dark:text-white">{preview.currentSourceBatchId ? 'La fuente aplicada será reemplazada.' : 'La importación agregará los registros nuevos.'}</div><div className="text-ink-2 dark:text-[#d6e2f5]">{preview.currentSourceBatchId ? 'Los viajes manuales se conservarán y los estados/notas locales de los viajes importados que sigan existiendo se mantendrán.' : 'Los archivos, hojas, filas originales, históricos y catálogo de costos quedarán guardados localmente.'}</div></div>
          )}

          <ul className="m-0 grid list-disc gap-1.5 pl-5 text-sm text-ink-2 [&_li]:before:content-none dark:text-[#d6e2f5]">
            <li>{integerFormat.format(preview.historicalSnapshots)} resúmenes históricos detectados.</li>
            <li>{integerFormat.format(preview.tollRoutes)} rutas de peaje y {integerFormat.format(preview.busFares)} referencias de bus disponibles.</li>
            <li>La operación se mantiene en este equipo y usa la SQLite local.</li>
          </ul>
        </div>

        <footer className="flex shrink-0 flex-wrap justify-end gap-3 border-t border-navy/10 p-5 dark:border-sky/20">
          <Button variant="outline" onClick={onCancel} disabled={importing}>Cancelar</Button>
          <Button onClick={onConfirm} disabled={importing}>{importing ? 'Importando…' : preview.duplicate ? 'Cerrar' : preview.currentSourceBatchId ? 'Reemplazar fuente' : 'Confirmar importación'}</Button>
        </footer>
      </div>
    </dialog>
  );
}

function ImportMetric({ label, value }: { label: string; value: string }) {
  return <div className={cn(subCardClass, 'grid gap-1 p-3')}><Muted>{label}</Muted><div className="text-lg font-bold text-navy dark:text-white" title={value}>{value}</div></div>;
}

export function TravelRenditionsView({
  trips,
  onEdit,
  onStatusChange,
}: {
  trips: TravelTrip[];
  onEdit: (trip: TravelTrip) => void;
  onStatusChange: (trip: TravelTrip, status: TravelStatus) => void;
}) {
  const [filter, setFilter] = useState<'all' | TravelStatus>('all');
  const [expandedTripId, setExpandedTripId] = useState<string | null>(null);
  const [page, setPage] = useState(1);
  const [pageSize, setPageSize] = useState(50);
  const listRef = useRef<HTMLElement>(null);
  const counts = useMemo(() => ({
    pending: trips.filter((trip) => trip.status === 'pending').length,
    review: trips.filter((trip) => trip.status === 'review').length,
    approved: trips.filter((trip) => trip.status === 'approved').length,
  }), [trips]);
  const visibleTrips = useMemo(
    () => trips
      .filter((trip) => filter === 'all' || trip.status === filter)
      .slice()
      .sort((left, right) => right.recordedAt.localeCompare(left.recordedAt)),
    [filter, trips],
  );
  const pageData = useMemo(() => paginateItems(visibleTrips, page, pageSize), [visibleTrips, page, pageSize]);

  // Al cambiar el filtro se vuelve a la primera página y se cierra el detalle abierto.
  useEffect(() => { setPage(1); setExpandedTripId(null); }, [filter]);

  function changePage(next: number) {
    setPage(next);
    setExpandedTripId(null);
    listRef.current?.scrollIntoView({ block: 'start' });
  }

  return (
    <div className="grid min-w-0 gap-4">
      <Card className={cardClass}>
        <CardHeader eyebrow="Control documental" title="Rendiciones y seguimiento" aside={<Badge>Flujo local de rendición</Badge>} />
        <Muted className="text-sm">Marcá cada viaje a medida que la documentación se entrega, se revisa y queda aprobada.</Muted>
      </Card>

      <div className="grid grid-cols-1 gap-3 sm:grid-cols-3" aria-label="Estado de las rendiciones">
        <RenditionStat label="Pendientes" value={counts.pending} tone="pending" />
        <RenditionStat label="En revisión" value={counts.review} tone="review" />
        <RenditionStat label="Aprobadas" value={counts.approved} tone="approved" />
      </div>

      <Card className={cardClass} ref={listRef}>
        <CardHeader
          title="Bandeja de rendiciones"
          aside={<label className={cn(fieldClass, 'w-48')}>Estado
            <select className={selectClass} value={filter} onChange={(event) => setFilter(event.target.value as 'all' | TravelStatus)}>
              <option value="all">Todos los estados</option>
              {TRAVEL_STATUS_VALUES.map((status) => <option key={status} value={status}>{STATUS_LABELS[status]}</option>)}
            </select>
          </label>}
        />
        <Muted>{integerFormat.format(visibleTrips.length)} registros visibles</Muted>

        {visibleTrips.length === 0 ? (
          <div className="grid gap-1 rounded-xl border border-dashed border-navy/20 p-6 text-center dark:border-sky/30" role="status">
            <div className="font-bold text-navy dark:text-white">No hay rendiciones en este estado</div>
            <Muted>Probá con otro filtro para revisar el registro.</Muted>
          </div>
        ) : (
          <Table className="min-w-[40rem]" wrapperClassName="@container">
            <TableHeader>
              <TableRow><TableHead>Viaje</TableHead><TableHead>Responsable</TableHead><TableHead className="text-right">Importe</TableHead><TableHead>Estado</TableHead><TableHead className="text-right">Acción</TableHead></TableRow>
            </TableHeader>
            <TableBody>
              {pageData.items.map((trip) => {
                const expanded = expandedTripId === trip.id;
                const detailId = `travel-rendition-detail-${trip.id.replace(/[^a-zA-Z0-9_-]/g, '-')}`;
                const operationalEntries = travelSourceOperationalEntries(trip.sourceOperational);
                return (
                  <Fragment key={trip.id}>
                    <TableRow>
                      <TableCell><div className="font-semibold text-navy dark:text-white">{trip.customerName || 'Cliente sin nombre'}</div><Muted className="mt-1">{formatDate(trip.recordedAt)} · {trip.destination || 'Destino pendiente'}</Muted></TableCell>
                      <TableCell><div>{trip.technician || 'Sin asignar'}</div><Muted className="mt-1">{trip.transport.replace('MOVIL ', 'MÓVIL ')}</Muted></TableCell>
                      <TableCell className="whitespace-nowrap text-right font-semibold tabular-nums">₲ {moneyFormat.format(Math.round(trip.totalCost))}</TableCell>
                      <TableCell>
                        <div className="flex flex-wrap items-center gap-2">
                          <Badge tone={statusTone[trip.status]}>{STATUS_LABELS[trip.status]}</Badge>
                          <select className={cn(selectClass, 'h-8 w-auto text-xs')} aria-label={`Cambiar estado de ${trip.customerName || 'viaje'}`} value={trip.status} onChange={(event) => onStatusChange(trip, event.target.value as TravelStatus)}>
                            {TRAVEL_STATUS_VALUES.map((status) => <option key={status} value={status}>{STATUS_LABELS[status]}</option>)}
                          </select>
                        </div>
                      </TableCell>
                      <TableCell className="text-right"><Button variant="outline" size="sm" aria-expanded={expanded} aria-controls={detailId} onClick={() => setExpandedTripId((current) => current === trip.id ? null : trip.id)}>{expanded ? 'Ocultar detalle' : 'Ver detalle'}</Button></TableCell>
                    </TableRow>
                    {expanded && <TableRow className="bg-paper hover:bg-paper dark:bg-navy/30">
                      <TableCell colSpan={5} className="p-0">
                        <div id={detailId} className="sticky left-0 box-border grid w-[100cqw] max-w-full gap-4 p-4 [overflow-wrap:anywhere]">
                          <div className="flex flex-wrap items-start justify-between gap-3">
                            <CardHeader eyebrow="Detalle de rendición" title={trip.customerName || 'Cliente sin nombre'} />
                            <Button variant="outline" onClick={() => onEdit(trip)}>Editar viaje</Button>
                          </div>
                          <Muted>{formatDate(trip.recordedAt)} · {trip.destination || 'Destino pendiente'}</Muted>
                          <div className="@container min-w-0"><div className="grid min-w-0 gap-4 @[44rem]:grid-cols-2">
                            <section className={subCardClass}>
                              <h4 className="m-0 mb-3 text-sm font-bold text-navy dark:text-white">Datos operativos</h4>
                              <dl className="m-0 grid gap-2">
                                <RenditionDetailItem label="I.S." value={trip.serviceNumber || 'Sin I.S.'} />
                                <RenditionDetailItem label="Cliente" value={trip.customerName || 'Sin nombre'} />
                                <RenditionDetailItem label="Destino" value={trip.destination || 'Sin destino'} />
                                <RenditionDetailItem label="Medio" value={trip.transport.replace('MOVIL ', 'MÓVIL ')} />
                                <RenditionDetailItem label="Técnico" value={trip.technician || 'Sin asignar'} />
                                <RenditionDetailItem label="Chofer" value={trip.driver || 'Sin chofer'} />
                                <RenditionDetailItem label="Distancia" value={trip.distanceKm ? `${integerFormat.format(trip.distanceKm)} km` : 'Sin kilómetros'} />
                              </dl>
                            </section>
                            <section className={subCardClass}>
                              <h4 className="m-0 mb-3 text-sm font-bold text-navy dark:text-white">Desglose de importes</h4>
                              <div className="grid gap-2">
                                {RENDITION_COST_FIELDS.map(({ key, label, separateFromTotal }) => <div className={cn('flex items-baseline justify-between gap-3 text-sm', separateFromTotal && 'border-b border-dashed border-navy/20 pb-2 dark:border-sky/30')} key={key}><div className="text-ink-2 dark:text-[#d6e2f5]">{label}{separateFromTotal && <span className="ml-2 text-xs italic">separado</span>}</div><div className="font-semibold tabular-nums text-navy dark:text-white">₲ {moneyFormat.format(Math.round(trip[key]))}</div></div>)}
                              </div>
                              <div className="mt-3 flex items-baseline justify-between gap-3 border-t border-navy/10 pt-3 dark:border-sky/20"><div className="font-bold text-navy dark:text-white">Total de costos</div><div className="text-lg font-bold tabular-nums text-navy dark:text-white">₲ {moneyFormat.format(Math.round(trip.totalCost))}</div></div>
                              <Muted className="mt-2">El monto / anticipo se conserva como dato de origen y no se suma al total de costos, igual que en el formato legado.</Muted>
                            </section>
                          </div></div>
                          {operationalEntries.length > 0 && <section className={subCardClass}>
                            <h4 className="m-0 mb-3 text-sm font-bold text-navy dark:text-white">Columnas calculadas de origen</h4>
                            <dl className="m-0 grid gap-2 sm:grid-cols-2">
                              {operationalEntries.map(({ label, value }) => <RenditionDetailItem key={label} label={label} value={value} />)}
                            </dl>
                            <Muted className="mt-2">Estos valores se conservan de las columnas auxiliares de la hoja VIAJES2026; no reemplazan el total normalizado de la rendición.</Muted>
                          </section>}
                          <section className={subCardClass}><div className="text-sm font-bold text-navy dark:text-white">Notas y observaciones</div><Muted className="mt-1 text-sm">{trip.notes || 'Sin notas ni observaciones guardadas.'}</Muted></section>
                          <Muted><strong>Fuente:</strong> {trip.source === 'xlsx' ? 'Importación XLSX' : 'Alta manual'} · {formatSourceLocation(trip.sourceFileName, trip.sourceSheetName, trip.sourceRowNumber) || 'sin ubicación de archivo'}</Muted>
                        </div>
                      </TableCell>
                    </TableRow>}
                  </Fragment>
                );
              })}
            </TableBody>
          </Table>
        )}
        {visibleTrips.length > 0 ? <PaginationControls
          label="Paginación de rendiciones"
          page={pageData.page}
          pageSize={pageData.pageSize}
          total={pageData.total}
          onPageChange={changePage}
          onPageSizeChange={(size) => { setPageSize(size); setPage(1); setExpandedTripId(null); }}
        /> : null}
      </Card>
    </div>
  );
}

function RenditionDetailItem({ label, value }: { label: string; value: string }) {
  return <div className="grid min-w-0 gap-0.5"><dt className="text-xs text-ink-2 dark:text-[#9fb2d1]">{label}</dt><dd className="m-0 text-sm font-semibold text-navy dark:text-white">{value}</dd></div>;
}

const statDot: Record<TravelStatus, string> = { pending: 'bg-[#e08a00]', review: 'bg-sky', approved: 'bg-[#2f8f5b]' };

function RenditionStat({ label, value, tone }: { label: string; value: number; tone: TravelStatus }) {
  return (
    <Card className="grid-cols-[auto_minmax(0,1fr)] items-center gap-3 p-4">
      <div className={cn('size-3 rounded-full', statDot[tone])} aria-hidden="true" />
      <div><Muted>{label}</Muted><div className="text-2xl font-bold tabular-nums text-navy dark:text-white">{integerFormat.format(value)}</div></div>
    </Card>
  );
}

export function TravelHistoricalView({
  summaries,
  sourceName,
  sourceBatchId,
}: {
  summaries: HistoricalSummary[];
  sourceName: string | null;
  sourceBatchId: string | null;
}) {
  const orderedSummaries = useMemo(() => summaries.slice().sort((left, right) => left.year - right.year), [summaries]);
  const latest = orderedSummaries.at(-1);
  const previous = orderedSummaries.at(-2);
  const costVariation = latest && previous && previous.generalCost !== 0
    ? (latest.generalCost - previous.generalCost) / previous.generalCost
    : null;

  return (
    <div className="grid min-w-0 gap-4">
      <Card className={cardClass}>
        <CardHeader eyebrow="Análisis histórico" title="Viajes y costos comparados" aside={<Badge tone={sourceName ? 'success' : 'neutral'}>{sourceName ? 'Fuente XLSX guardada localmente' : 'Usando resumen de referencia'}</Badge>} />
        <Muted className="text-sm">Consultá la evolución desde los resúmenes de la planilla y compará servicios, viajes, distancias y costos en guaraníes.</Muted>
      </Card>

      <div className="grid min-w-0 grid-cols-1 gap-3 sm:grid-cols-3">
        <HistoryMetric label={`Costo general ${latest?.year ?? ''}`} value={`₲ ${moneyFormat.format(Math.round(latest?.generalCost ?? 0))}`} detail={latest?.partial ? 'Período en curso' : 'Año cerrado'} />
        <HistoryMetric label={`Viajes ${latest?.year ?? ''}`} value={integerFormat.format(latest?.trips ?? 0)} detail={`${integerFormat.format(latest?.services ?? 0)} servicios asistidos`} />
        <HistoryMetric label="Variación de costo" value={costVariation === null ? '—' : `${costVariation > 0 ? '+' : ''}${Math.round(costVariation * 100)}%`} detail={latest && previous ? `${latest.year} frente a ${previous.year}` : 'Sin año anterior'} tone={costVariation !== null && costVariation > 0 ? 'warning' : 'positive'} />
      </div>

      {orderedSummaries.length === 0 ? (
        <Card className={cardClass} role="status">
          <div className="font-bold text-navy dark:text-white">No hay resúmenes históricos cargados.</div>
          <Muted className="text-sm">Importá la planilla de Viáticos para recuperar sus hojas auxiliares y comparativas.</Muted>
        </Card>
      ) : (
        <>
          <div className="@container min-w-0"><div className="grid min-w-0 gap-4 @[52rem]:grid-cols-2">
            <AnnualActivityChart summaries={orderedSummaries} />
            <AnnualCostChart summaries={orderedSummaries} />
          </div></div>
          <MonthlyTrendChart summaries={orderedSummaries} />
          <HistoricalTravelTable summaries={orderedSummaries} />
        </>
      )}

      <TravelSourceArchive batchId={sourceBatchId} sourceName={sourceName} />
    </div>
  );
}

const metricTone = { neutral: 'border-l-navy/30! dark:border-l-sky/40!', positive: 'border-l-[#2f8f5b]!', warning: 'border-l-[#e08a00]!' } as const;

function HistoryMetric({ label, value, detail, tone = 'neutral' }: { label: string; value: string; detail: string; tone?: 'neutral' | 'positive' | 'warning' }) {
  return <Card className={cn('min-w-0 gap-1 border-l-4 p-4', metricTone[tone])}><Muted>{label}</Muted><div className="text-2xl font-bold tabular-nums text-navy dark:text-white">{value}</div><Muted>{detail}</Muted></Card>;
}

const chartArea = 'grid h-56 min-w-0 auto-cols-fr grid-flow-col items-end gap-3 border-b border-navy/15 pb-1 dark:border-sky/25';

function AnnualActivityChart({ summaries }: { summaries: HistoricalSummary[] }) {
  const maxValue = Math.max(...summaries.flatMap((summary) => [summary.services, summary.trips]), 1);
  return (
    <Card className={cardClass}>
      <CardHeader eyebrow="Actividad" title="Servicios y viajes" aside={<Badge>Por año</Badge>} />
      <div className={chartArea} role="img" aria-label="Comparativa anual de servicios y viajes">
        {summaries.map((summary) => (
          <div className="grid h-full min-w-0 grid-rows-[minmax(0,1fr)_auto_auto] justify-items-center gap-1" key={summary.year}>
            <div className="flex h-full w-full items-end justify-center gap-1">
              <div className="w-1/3 max-w-8 rounded-t bg-sky" style={{ height: `${summary.services ? Math.max((summary.services / maxValue) * 100, 4) : 0}%` }} title={`${summary.services} servicios`} />
              <div className="w-1/3 max-w-8 rounded-t bg-brand" style={{ height: `${summary.trips ? Math.max((summary.trips / maxValue) * 100, 4) : 0}%` }} title={`${summary.trips} viajes`} />
            </div>
            <div className="text-sm font-bold text-navy dark:text-white">{summary.year}</div>
            <Muted>{summary.partial ? 'En curso' : 'Cerrado'}</Muted>
          </div>
        ))}
      </div>
      <div className="flex flex-wrap gap-4 text-xs text-ink-2 dark:text-[#d6e2f5]"><div className="flex items-center gap-1.5"><i className="size-2.5 rounded-sm bg-sky" />Servicios</div><div className="flex items-center gap-1.5"><i className="size-2.5 rounded-sm bg-brand" />Viajes</div></div>
    </Card>
  );
}

type CostMetric = 'generalCost' | 'fuelCost' | 'renditions';

function AnnualCostChart({ summaries }: { summaries: HistoricalSummary[] }) {
  const [metric, setMetric] = useState<CostMetric>('generalCost');
  const labels: Record<CostMetric, string> = { generalCost: 'Costo general', fuelCost: 'Combustible', renditions: 'Rendiciones' };
  const maxValue = Math.max(...summaries.map((summary) => summary[metric]), 1);
  return (
    <Card className={cardClass}>
      <CardHeader
        eyebrow="Costos"
        title="Comparativa anual"
        aside={<label className={cn(fieldClass, 'w-44')}>Métrica<select className={selectClass} value={metric} onChange={(event) => setMetric(event.target.value as CostMetric)}><option value="generalCost">Costo general</option><option value="fuelCost">Combustible</option><option value="renditions">Rendiciones</option></select></label>}
      />
      <div className={chartArea} role="img" aria-label={`Comparativa anual de ${labels[metric]}`}>
        {summaries.map((summary) => (
          <div className="grid h-full min-w-0 grid-rows-[auto_minmax(0,1fr)_auto_auto] justify-items-center gap-1" key={summary.year}>
            <div className="text-xs font-semibold tabular-nums text-ink-2 dark:text-[#d6e2f5]">₲ {compactMoney(summary[metric])}</div>
            <div className="flex h-full w-full items-end justify-center"><div className="w-1/2 max-w-12 rounded-t bg-sky" style={{ height: `${summary[metric] ? Math.max((summary[metric] / maxValue) * 100, 4) : 0}%` }} title={`${summary.year}: ₲ ${moneyFormat.format(Math.round(summary[metric]))}`} /></div>
            <div className="text-sm font-bold text-navy dark:text-white">{summary.year}</div>
            <Muted>{summary.partial ? 'En curso' : 'Cerrado'}</Muted>
          </div>
        ))}
      </div>
      <Muted>{labels[metric]} en guaraníes. El período en curso queda identificado en la tabla.</Muted>
    </Card>
  );
}

function MonthlyTrendChart({ summaries }: { summaries: HistoricalSummary[] }) {
  const [metric, setMetric] = useState<'monthlyServices' | 'monthlyTrips'>('monthlyServices');
  const label = metric === 'monthlyServices' ? 'Servicios' : 'Viajes';
  const maxValue = Math.max(...summaries.flatMap((summary) => summary[metric]), 1);
  return (
    <Card className={cardClass}>
      <CardHeader
        eyebrow="Tendencia mensual"
        title="Concentración de la operación"
        aside={<div className="flex gap-2" role="group" aria-label="Métrica mensual">
          <Button variant={metric === 'monthlyServices' ? 'default' : 'outline'} size="sm" aria-pressed={metric === 'monthlyServices'} onClick={() => setMetric('monthlyServices')}>Servicios</Button>
          <Button variant={metric === 'monthlyTrips' ? 'default' : 'outline'} size="sm" aria-pressed={metric === 'monthlyTrips'} onClick={() => setMetric('monthlyTrips')}>Viajes</Button>
        </div>}
      />
      <div className="grid min-w-0 grid-cols-[repeat(auto-fit,minmax(min(100%,11rem),1fr))] gap-3" role="img" aria-label={`Tendencia mensual comparada de ${label}`}>
        {monthLabels.map((month, monthIndex) => (
          <div className={cn(subCardClass, 'grid content-start gap-2 p-3')} key={month}>
            <div className="flex items-baseline justify-between gap-2"><div className="font-bold text-navy dark:text-white">{month}</div><Muted>{integerFormat.format(summaries.reduce((total, summary) => total + (summary[metric][monthIndex] ?? 0), 0))} total</Muted></div>
            {summaries.map((summary) => {
              const value = summary[metric][monthIndex] ?? 0;
              return <div className="grid grid-cols-[2.5rem_2rem_minmax(0,1fr)] items-center gap-2 text-xs" key={summary.year}><div className="text-ink-2 dark:text-[#9fb2d1]">{summary.year}</div><div className="text-right font-bold tabular-nums text-navy dark:text-white">{integerFormat.format(value)}</div><div className="h-1.5 overflow-hidden rounded-full bg-navy/10 dark:bg-white/10"><div className="h-full rounded-full bg-sky" style={{ width: `${value ? Math.max((value / maxValue) * 100, 4) : 0}%` }} /></div></div>;
            })}
          </div>
        ))}
      </div>
    </Card>
  );
}

function HistoricalTravelTable({ summaries }: { summaries: HistoricalSummary[] }) {
  return (
    <Card className={cardClass}>
      <CardHeader eyebrow="Resumen anual" title="Indicadores históricos" aside={<Badge>Consolidado de la fuente</Badge>} />
      <Table className="min-w-[44rem]">
        <TableHeader><TableRow><TableHead>Año</TableHead><TableHead>Viajes</TableHead><TableHead>Servicios</TableHead><TableHead>Distancia</TableHead><TableHead className="text-right">Costo general</TableHead><TableHead className="text-right">Promedio / servicio</TableHead><TableHead className="text-right">Vs. anterior</TableHead></TableRow></TableHeader>
        <TableBody>{summaries.map((summary, index) => {
          const previous = summaries[index - 1];
          const variation = previous?.generalCost ? (summary.generalCost - previous.generalCost) / previous.generalCost : null;
          return <TableRow key={summary.year}>
            <TableCell><div className="font-semibold text-navy dark:text-white">{summary.year}</div>{summary.partial && <Muted>En curso</Muted>}</TableCell>
            <TableCell className="tabular-nums">{integerFormat.format(summary.trips)}</TableCell>
            <TableCell className="tabular-nums">{integerFormat.format(summary.services)}</TableCell>
            <TableCell className="whitespace-nowrap tabular-nums">{integerFormat.format(summary.distanceKm)} km</TableCell>
            <TableCell className="whitespace-nowrap text-right tabular-nums">₲ {moneyFormat.format(Math.round(summary.generalCost))}</TableCell>
            <TableCell className="whitespace-nowrap text-right tabular-nums">₲ {moneyFormat.format(Math.round(summary.averageCostPerService))}</TableCell>
            <TableCell className={cn('text-right font-bold tabular-nums', variation !== null && variation > 0 ? 'text-[#912018]! dark:text-[#ffb4ab]!' : 'text-[#14532d]! dark:text-[#9be3b9]!')}>{variation === null ? '—' : `${variation > 0 ? '+' : ''}${Math.round(variation * 100)}%`}</TableCell>
          </TableRow>;
        })}</TableBody>
      </Table>
    </Card>
  );
}

function TravelSourceArchive({ batchId, sourceName }: { batchId: string | null; sourceName: string | null }) {
  const [sheets, setSheets] = useState<SourceSheet[]>([]);
  const [selectedSheetKey, setSelectedSheetKey] = useState('');
  const [rows, setRows] = useState<SourceRow[]>([]);
  const [headerValues, setHeaderValues] = useState<unknown[]>([]);
  const [headerRowNumber, setHeaderRowNumber] = useState<number | null>(null);
  const [offset, setOffset] = useState(0);
  const [loading, setLoading] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const pageSize = 100;
  const selectedSheet = sheets.find((sheet) => `${sheet.importFileId}:${sheet.sheetName}` === selectedSheetKey);
  const columnCount = Math.max(selectedSheet?.columnCount ?? 0, ...rows.map((row) => row.values.length), 0);

  useEffect(() => {
    let cancelled = false;
    setSheets([]);
    setRows([]);
    setSelectedSheetKey('');
    setHeaderValues([]);
    setHeaderRowNumber(null);
    setOffset(0);
    setError(null);
    if (!batchId) return () => undefined;

    void fetch(`/api/imports/${encodeURIComponent(batchId)}/raw-rows?limit=1&offset=0`)
      .then((response) => readJson<SourceRowsResponse>(response))
      .then((value) => {
        if (cancelled) return;
        setSheets(value.sheets);
        const first = value.sheets[0];
        if (first) setSelectedSheetKey(`${first.importFileId}:${first.sheetName}`);
      })
      .catch((requestError: unknown) => {
        if (!cancelled) setError(toErrorMessage(requestError));
      });
    return () => { cancelled = true; };
  }, [batchId]);

  useEffect(() => {
    let cancelled = false;
    if (!batchId || !selectedSheet) {
      setHeaderValues([]);
      setHeaderRowNumber(null);
      return () => undefined;
    }

    const params = new URLSearchParams({
      fileId: selectedSheet.importFileId,
      sheet: selectedSheet.sheetName,
      limit: '30',
      offset: '0',
    });
    void fetch(`/api/imports/${encodeURIComponent(batchId)}/raw-rows?${params.toString()}`)
      .then((response) => readJson<SourceRowsResponse>(response))
      .then((value) => {
        if (cancelled) return;
        const headerIndex = findTravelSourceHeaderRow(value.rows.map((row) => row.values));
        const header = value.rows[headerIndex] ?? value.rows[0];
        setHeaderValues(header?.values ?? []);
        setHeaderRowNumber(header?.rowNumber ?? null);
      })
      .catch((requestError: unknown) => {
        if (!cancelled) setError(toErrorMessage(requestError));
      });

    return () => { cancelled = true; };
  }, [batchId, selectedSheet, selectedSheetKey]);

  useEffect(() => {
    let cancelled = false;
    if (!batchId || !selectedSheet) return () => undefined;
    setLoading(true);
    setError(null);
    const params = new URLSearchParams({ fileId: selectedSheet.importFileId, sheet: selectedSheet.sheetName, limit: String(pageSize), offset: String(offset) });
    void fetch(`/api/imports/${encodeURIComponent(batchId)}/raw-rows?${params.toString()}`)
      .then((response) => readJson<SourceRowsResponse>(response))
      .then((value) => {
        if (!cancelled) setRows(value.rows);
      })
      .catch((requestError: unknown) => {
        if (!cancelled) setError(toErrorMessage(requestError));
      })
      .finally(() => {
        if (!cancelled) setLoading(false);
      });
    return () => { cancelled = true; };
  }, [batchId, offset, selectedSheet]);

  return (
    <Card className={cardClass}>
      <CardHeader
        eyebrow="Fuente conservada"
        title="Hojas auxiliares de la planilla"
        aside={batchId && selectedSheet ? <div className="flex flex-wrap items-center gap-2">
          <Badge>{integerFormat.format(selectedSheet.rowCount)} filas</Badge>
          <a
            className={cn(buttonVariants({ variant: 'export' }), 'export-button')}
            href={`/api/imports/${encodeURIComponent(batchId ?? '')}/files/${encodeURIComponent(selectedSheet.importFileId)}`}
            download={selectedSheet.fileName}
          >
            <DownloadIcon />
            Descargar original
          </a>
        </div> : null}
      />
      <Muted className="text-sm">{batchId ? `${sheets.length} hojas disponibles desde ${sourceName ?? 'la importación local'}.` : 'Importá la planilla para consultar cada hoja y sus filas originales.'}</Muted>
      {!batchId ? <Muted className="text-sm">No hay una importación de Viáticos aplicada todavía.</Muted> : error ? <div className="rounded-xl border border-[#b42318]/30 bg-[#b42318]/5 p-4 text-sm text-[#b42318] dark:text-[#ffb0b7]" role="alert">{error}</div> : sheets.length === 0 ? <Muted className="text-sm">{loading ? 'Leyendo hojas…' : 'La importación no tiene filas de fuente disponibles.'}</Muted> : (
        <>
          <div className="flex min-w-0 gap-2 overflow-x-auto pb-1" role="list" aria-label="Hojas de la fuente">
            {sheets.map((sheet) => {
              const key = `${sheet.importFileId}:${sheet.sheetName}`;
              const active = selectedSheetKey === key;
              return <Button className="h-auto shrink-0 flex-col items-start gap-0.5 py-2 text-left" variant={active ? 'default' : 'outline'} aria-pressed={active} key={key} onClick={() => { setSelectedSheetKey(key); setOffset(0); }}><div>{sheet.sheetName}</div><div className="text-xs font-normal">{integerFormat.format(sheet.rowCount)} filas · {integerFormat.format(sheet.columnCount)} columnas</div></Button>;
            })}
          </div>
          {selectedSheet && <>
            <Table className="min-w-max text-xs" wrapperClassName="max-h-[28rem]">
              <TableHeader><TableRow><TableHead>#</TableHead>{Array.from({ length: columnCount }, (_, index) => <TableHead key={index}>{travelSourceHeaderLabel(headerValues[index], index)}</TableHead>)}</TableRow></TableHeader>
              <TableBody>{rows.map((row) => <TableRow className={row.rowNumber === headerRowNumber ? 'bg-sky/10 font-semibold' : undefined} key={row.id}><TableCell className="font-mono tabular-nums">{row.rowNumber}</TableCell>{Array.from({ length: columnCount }, (_, index) => <TableCell className="max-w-[16rem] truncate" key={index} title={sourceValue(row.values[index])}>{sourceValue(row.values[index])}</TableCell>)}</TableRow>)}</TableBody>
            </Table>
            {rows.length === 0 && <Muted className="text-sm">{loading ? 'Leyendo filas…' : 'No hay filas en esta página.'}</Muted>}
          </>}
          <div className="flex flex-wrap items-center justify-between gap-3"><Muted>Filas {offset + 1}–{offset + rows.length} de {integerFormat.format(selectedSheet?.rowCount ?? 0)}</Muted><div className="flex gap-2"><Button variant="outline" disabled={offset === 0 || loading} onClick={() => setOffset((current) => Math.max(0, current - pageSize))}>Anterior</Button><Button variant="outline" disabled={loading || rows.length < pageSize || offset + rows.length >= (selectedSheet?.rowCount ?? 0)} onClick={() => setOffset((current) => current + pageSize)}>Siguiente</Button></div></div>
        </>
      )}
    </Card>
  );
}

export function findTravelSourceHeaderRow(rows: readonly unknown[][]): number {
  const preferredIndex = rows.findIndex((row) => {
    const headers = row.map(normalizeTravelSourceHeader);
    const hasDate = headers.includes('fecha');
    const hasCount = headers.includes('cant') || headers.includes('cantidad');
    const hasCustomer = headers.includes('cliente');
    return hasDate && (hasCount || hasCustomer);
  });
  if (preferredIndex >= 0) return preferredIndex;

  const multiValueIndex = rows.findIndex((row) => row.filter((value) => sourceValue(value) !== '—').length >= 2);
  if (multiValueIndex >= 0) return multiValueIndex;
  const meaningfulIndex = rows.findIndex((row) => row.some((value) => sourceValue(value) !== '—'));
  return meaningfulIndex >= 0 ? meaningfulIndex : 0;
}

function travelSourceHeaderLabel(value: unknown, index: number): string {
  const label = sourceValue(value).replace(/\s+/g, ' ').trim();
  return label && label !== '—' ? label.slice(0, 40) : `Columna ${index + 1}`;
}

function normalizeTravelSourceHeader(value: unknown): string {
  return String(value ?? '')
    .normalize('NFD')
    .replace(/[\u0300-\u036f]/g, '')
    .toLowerCase()
    .replace(/[^a-z0-9]+/g, ' ')
    .trim();
}

function compactMoney(value: number): string {
  return new Intl.NumberFormat('es-PY', { notation: 'compact', maximumFractionDigits: 1 }).format(Math.round(value));
}

function formatDate(value: string): string {
  if (!value) return 'Fecha pendiente';
  const parsed = new Date(`${value.slice(0, 10)}T00:00:00Z`);
  return Number.isNaN(parsed.getTime()) ? value : dateFormat.format(parsed);
}

function sourceValue(value: unknown): string {
  if (value === null || value === undefined || value === '') return '—';
  if (typeof value === 'object') {
    try {
      return JSON.stringify(value);
    } catch {
      return '[valor no serializable]';
    }
  }
  return String(value);
}

function toErrorMessage(value: unknown): string {
  return describeError(value, 'No se pudo consultar la fuente original.');
}
