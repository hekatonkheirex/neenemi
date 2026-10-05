import type { IconSvgElement } from '@hugeicons/react';
import { Analytics01Icon, Airplane01Icon, Invoice01Icon, Clock01Icon } from '@hugeicons/core-free-icons';
import { Fragment, useEffect, useMemo, useRef, useState } from 'react';
import PaginationControls from '../../core/PaginationControls';
import { paginateItems } from '../../core/pagination';
import { formatSourceLocation } from '../../core/source-location';
import { travelSourceOperationalEntries } from './source-operational';
import type { HistoricalSummary, TravelStatus, TravelTrip } from './types';
import { readJson, toErrorMessage as describeError } from '../../core/http';

export type TravelView = 'resumen' | 'viajes' | 'rendiciones' | 'historico';

export const TRAVEL_VIEW_OPTIONS: Array<{ id: TravelView; label: string; hint: string; icon: IconSvgElement }> = [
  { id: 'resumen', label: 'Resumen', hint: 'Indicadores del período', icon: Analytics01Icon },
  { id: 'viajes', label: 'Viajes', hint: 'Detalle y alta de registros', icon: Airplane01Icon },
  { id: 'rendiciones', label: 'Rendiciones', hint: 'Seguimiento documental', icon: Invoice01Icon },
  { id: 'historico', label: 'Histórico', hint: 'Comparativas y fuente', icon: Clock01Icon },
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
  const cancelRef = useRef<HTMLButtonElement>(null);

  useEffect(() => {
    cancelRef.current?.focus();
    const handleKeyDown = (event: KeyboardEvent) => {
      if (event.key === 'Escape' && !importing) onCancel();
    };
    window.addEventListener('keydown', handleKeyDown);
    return () => window.removeEventListener('keydown', handleKeyDown);
  }, [importing, onCancel, preview]);

  return (
    <div className="travel-import-backdrop" role="presentation">
      <div className="travel-import-dialog" role="dialog" aria-modal="true" aria-labelledby="travel-import-title" aria-describedby="travel-import-description">
        <div className="travel-import-dialog-heading">
          <div><div className="eyebrow">PREVISUALIZACIÓN LOCAL</div><h2 id="travel-import-title">{preview.currentSourceBatchId && !preview.duplicate ? 'Reemplazar fuente' : 'Confirmar importación'}</h2><p id="travel-import-description">La planilla fue analizada antes de modificar los registros guardados.</p></div>
          <button ref={cancelRef} className="icon-button" type="button" aria-label="Cancelar importación" onClick={onCancel} disabled={importing}>×</button>
        </div>

        <div className="travel-import-file">
          <span>Archivo seleccionado</span>
          <strong title={preview.sourceName}>{preview.sourceName}</strong>
          <small>Hoja principal: {preview.primarySheetName}</small>
        </div>

        <div className="travel-import-metrics" aria-label="Resumen de la planilla">
          <ImportMetric label="Viajes" value={integerFormat.format(preview.trips)} />
          <ImportMetric label="Hojas" value={integerFormat.format(preview.sourceSheetNames.length)} />
          <ImportMetric label="Año fuente" value={preview.sourceYear ? String(preview.sourceYear) : 'No detectado'} />
          <ImportMetric label="Años en filas" value={preview.incomingYears.length ? preview.incomingYears.join(' · ') : '—'} />
        </div>

        {preview.duplicate ? (
          <div className="travel-import-notice warning" role="status"><strong>Esta planilla ya está importada.</strong><span>No se crearán filas duplicadas. Podés cancelar esta operación.</span></div>
        ) : (
          <div className="travel-import-notice" role="status"><strong>{preview.currentSourceBatchId ? 'La fuente aplicada será reemplazada.' : 'La importación agregará los registros nuevos.'}</strong><span>{preview.currentSourceBatchId ? 'Los viajes manuales se conservarán y los estados/notas locales de los viajes importados que sigan existiendo se mantendrán.' : 'Los archivos, hojas, filas originales, históricos y catálogo de costos quedarán guardados localmente.'}</span></div>
        )}

        <ul className="travel-import-checklist">
          <li>{integerFormat.format(preview.historicalSnapshots)} resúmenes históricos detectados.</li>
          <li>{integerFormat.format(preview.tollRoutes)} rutas de peaje y {integerFormat.format(preview.busFares)} referencias de bus disponibles.</li>
          <li>La operación se mantiene en este equipo y usa la SQLite local.</li>
        </ul>

        <div className="travel-import-actions"><button className="secondary-button" type="button" onClick={onCancel} disabled={importing}>Cancelar</button><button className="primary-button" type="button" onClick={onConfirm} disabled={importing}>{importing ? 'Importando…' : preview.duplicate ? 'Cerrar' : preview.currentSourceBatchId ? 'Reemplazar fuente' : 'Confirmar importación'}</button></div>
      </div>
    </div>
  );
}

function ImportMetric({ label, value }: { label: string; value: string }) {
  return <div><span>{label}</span><strong title={value}>{value}</strong></div>;
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
    <div className="travel-subpage">
      <section className="travel-subpage-header sales-card">
        <div>
          <div className="eyebrow">CONTROL DOCUMENTAL</div>
          <h2>Rendiciones y seguimiento</h2>
          <p>Marcá cada viaje a medida que la documentación se entrega, se revisa y queda aprobada.</p>
        </div>
        <span className="travel-local-flow">Flujo local de rendición</span>
      </section>

      <div className="travel-rendition-summary" aria-label="Estado de las rendiciones">
        <RenditionStat label="Pendientes" value={counts.pending} tone="pending" />
        <RenditionStat label="En revisión" value={counts.review} tone="review" />
        <RenditionStat label="Aprobadas" value={counts.approved} tone="approved" />
      </div>

      <section className="sales-card travel-rendition-card" ref={listRef}>
        <div className="card-heading">
          <div>
            <h2>Bandeja de rendiciones</h2>
            <p className="muted-note">{integerFormat.format(visibleTrips.length)} registros visibles</p>
          </div>
          <label className="compact-field travel-rendition-filter">
            <span>Estado</span>
            <select value={filter} onChange={(event) => setFilter(event.target.value as 'all' | TravelStatus)}>
              <option value="all">Todos los estados</option>
              {TRAVEL_STATUS_VALUES.map((status) => <option key={status} value={status}>{STATUS_LABELS[status]}</option>)}
            </select>
          </label>
        </div>

        {visibleTrips.length === 0 ? (
          <div className="empty-cell travel-empty-state" role="status">
            <strong>No hay rendiciones en este estado</strong>
            <span>Probá con otro filtro para revisar el registro.</span>
          </div>
        ) : (
          <div className="catalog-table-wrap">
            <table className="catalog-table travel-rendition-table">
              <thead>
                <tr><th>Viaje</th><th>Responsable</th><th className="align-right">Importe</th><th>Estado</th><th className="align-right">Acción</th></tr>
              </thead>
              <tbody>
                {pageData.items.map((trip) => {
                  const expanded = expandedTripId === trip.id;
                  const detailId = `travel-rendition-detail-${trip.id.replace(/[^a-zA-Z0-9_-]/g, '-')}`;
                  const operationalEntries = travelSourceOperationalEntries(trip.sourceOperational);
                  return (
                    <Fragment key={trip.id}>
                      <tr>
                        <td><span className="code-cell">{trip.customerName || 'Cliente sin nombre'}</span><small className="table-secondary-text">{formatDate(trip.recordedAt)} · {trip.destination || 'Destino pendiente'}</small></td>
                        <td><span>{trip.technician || 'Sin asignar'}</span><small className="table-secondary-text">{trip.transport.replace('MOVIL ', 'MÓVIL ')}</small></td>
                        <td className="align-right"><span className="code-cell">₲ {moneyFormat.format(Math.round(trip.totalCost))}</span></td>
                        <td>
                          <div className="travel-rendition-status">
                            <span className={`travel-status-badge ${trip.status}`}>{STATUS_LABELS[trip.status]}</span>
                            <select aria-label={`Cambiar estado de ${trip.customerName || 'viaje'}`} value={trip.status} onChange={(event) => onStatusChange(trip, event.target.value as TravelStatus)}>
                              {TRAVEL_STATUS_VALUES.map((status) => <option key={status} value={status}>{STATUS_LABELS[status]}</option>)}
                            </select>
                          </div>
                        </td>
                        <td className="align-right"><button className="text-button" type="button" aria-expanded={expanded} aria-controls={detailId} onClick={() => setExpandedTripId((current) => current === trip.id ? null : trip.id)}>{expanded ? 'Ocultar detalle' : 'Ver detalle'}</button></td>
                      </tr>
                      {expanded && <tr className="travel-rendition-detail-row">
                        <td colSpan={5}>
                          <div id={detailId} className="travel-rendition-detail">
                            <div className="travel-rendition-detail-heading">
                              <div><div className="eyebrow">DETALLE DE RENDICIÓN</div><h3>{trip.customerName || 'Cliente sin nombre'}</h3><p>{formatDate(trip.recordedAt)} · {trip.destination || 'Destino pendiente'}</p></div>
                              <button className="secondary-button" type="button" onClick={() => onEdit(trip)}>Editar viaje</button>
                            </div>
                            <div className="travel-rendition-detail-grid">
                              <section className="travel-rendition-detail-section">
                                <h4>Datos operativos</h4>
                                <dl className="travel-rendition-detail-list">
                                  <RenditionDetailItem label="I.S." value={trip.serviceNumber || 'Sin I.S.'} />
                                  <RenditionDetailItem label="Cliente" value={trip.customerName || 'Sin nombre'} />
                                  <RenditionDetailItem label="Destino" value={trip.destination || 'Sin destino'} />
                                  <RenditionDetailItem label="Medio" value={trip.transport.replace('MOVIL ', 'MÓVIL ')} />
                                  <RenditionDetailItem label="Técnico" value={trip.technician || 'Sin asignar'} />
                                  <RenditionDetailItem label="Chofer" value={trip.driver || 'Sin chofer'} />
                                  <RenditionDetailItem label="Distancia" value={trip.distanceKm ? `${integerFormat.format(trip.distanceKm)} km` : 'Sin kilómetros'} />
                                </dl>
                              </section>
                              <section className="travel-rendition-detail-section">
                                <h4>Desglose de importes</h4>
                                <div className="travel-rendition-cost-list">
                                  {RENDITION_COST_FIELDS.map(({ key, label, separateFromTotal }) => <div className={`travel-rendition-cost-line ${separateFromTotal ? 'separate' : ''}`} key={key}><span>{label}{separateFromTotal && <small>separado</small>}</span><strong>₲ {moneyFormat.format(Math.round(trip[key]))}</strong></div>)}
                                </div>
                                <div className="travel-rendition-cost-total"><span>Total de costos</span><strong>₲ {moneyFormat.format(Math.round(trip.totalCost))}</strong></div>
                                <p className="travel-rendition-detail-note">El monto / anticipo se conserva como dato de origen y no se suma al total de costos, igual que en el formato legado.</p>
                              </section>
                            </div>
                            {operationalEntries.length > 0 && <section className="travel-rendition-detail-section travel-source-operational-section">
                              <h4>Columnas calculadas de origen</h4>
                              <dl className="travel-rendition-detail-list">
                                {operationalEntries.map(({ label, value }) => <RenditionDetailItem key={label} label={label} value={value} />)}
                              </dl>
                              <p className="travel-rendition-detail-note">Estos valores se conservan de las columnas auxiliares de la hoja VIAJES2026; no reemplazan el total normalizado de la rendición.</p>
                            </section>}
                            <div className="travel-rendition-detail-notes"><strong>Notas y observaciones</strong><p>{trip.notes || 'Sin notas ni observaciones guardadas.'}</p></div>
                            <p className="travel-rendition-detail-source"><strong>Fuente:</strong> {trip.source === 'xlsx' ? 'Importación XLSX' : 'Alta manual'} · {formatSourceLocation(trip.sourceFileName, trip.sourceSheetName, trip.sourceRowNumber) || 'sin ubicación de archivo'}</p>
                          </div>
                        </td>
                      </tr>}
                    </Fragment>
                  );
                })}
              </tbody>
            </table>
          </div>
        )}
        {visibleTrips.length > 0 ? <PaginationControls
          label="Paginación de rendiciones"
          page={pageData.page}
          pageSize={pageData.pageSize}
          total={pageData.total}
          onPageChange={changePage}
          onPageSizeChange={(size) => { setPageSize(size); setPage(1); setExpandedTripId(null); }}
        /> : null}
      </section>
    </div>
  );
}

function RenditionDetailItem({ label, value }: { label: string; value: string }) {
  return <div><dt>{label}</dt><dd>{value}</dd></div>;
}

function RenditionStat({ label, value, tone }: { label: string; value: number; tone: TravelStatus }) {
  return (
    <article className={`travel-rendition-stat ${tone}`}>
      <span className="travel-rendition-stat-dot" aria-hidden="true" />
      <div><span>{label}</span><strong>{integerFormat.format(value)}</strong></div>
    </article>
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
    <div className="travel-subpage">
      <section className="travel-subpage-header sales-card">
        <div>
          <div className="eyebrow">ANÁLISIS HISTÓRICO</div>
          <h2>Viajes y costos comparados</h2>
          <p>Consultá la evolución desde los resúmenes de la planilla y compará servicios, viajes, distancias y costos en guaraníes.</p>
        </div>
        <div className="travel-history-source-summary">
          <span className="status-dot ready" aria-hidden="true" />
          <span>{sourceName ? 'Fuente XLSX guardada localmente' : 'Usando resumen de referencia'}</span>
        </div>
      </section>

      <div className="travel-history-metrics">
        <HistoryMetric label={`Costo general ${latest?.year ?? ''}`} value={`₲ ${moneyFormat.format(Math.round(latest?.generalCost ?? 0))}`} detail={latest?.partial ? 'Período en curso' : 'Año cerrado'} />
        <HistoryMetric label={`Viajes ${latest?.year ?? ''}`} value={integerFormat.format(latest?.trips ?? 0)} detail={`${integerFormat.format(latest?.services ?? 0)} servicios asistidos`} />
        <HistoryMetric label="Variación de costo" value={costVariation === null ? '—' : `${costVariation > 0 ? '+' : ''}${Math.round(costVariation * 100)}%`} detail={latest && previous ? `${latest.year} frente a ${previous.year}` : 'Sin año anterior'} tone={costVariation !== null && costVariation > 0 ? 'warning' : 'positive'} />
      </div>

      {orderedSummaries.length === 0 ? (
        <section className="sales-card travel-empty-state" role="status">
          <strong>No hay resúmenes históricos cargados.</strong>
          <span>Importá la planilla de Viáticos para recuperar sus hojas auxiliares y comparativas.</span>
        </section>
      ) : (
        <>
          <div className="travel-history-chart-grid">
            <AnnualActivityChart summaries={orderedSummaries} />
            <AnnualCostChart summaries={orderedSummaries} />
          </div>
          <MonthlyTrendChart summaries={orderedSummaries} />
          <HistoricalTravelTable summaries={orderedSummaries} />
        </>
      )}

      <TravelSourceArchive batchId={sourceBatchId} sourceName={sourceName} />
    </div>
  );
}

function HistoryMetric({ label, value, detail, tone = 'neutral' }: { label: string; value: string; detail: string; tone?: 'neutral' | 'positive' | 'warning' }) {
  return <article className={`travel-history-metric ${tone}`}><span>{label}</span><strong>{value}</strong><small>{detail}</small></article>;
}

function AnnualActivityChart({ summaries }: { summaries: HistoricalSummary[] }) {
  const maxValue = Math.max(...summaries.flatMap((summary) => [summary.services, summary.trips]), 1);
  return (
    <section className="sales-card travel-history-chart">
      <div className="card-heading"><div><div className="eyebrow">ACTIVIDAD</div><h2>Servicios y viajes</h2></div><span className="muted-note">Por año</span></div>
      <div className="travel-history-bars" role="img" aria-label="Comparativa anual de servicios y viajes">
        {summaries.map((summary) => (
          <div className="travel-history-year" key={summary.year}>
            <div className="travel-history-year-bars">
              <span className="travel-history-bar services" style={{ height: `${summary.services ? Math.max((summary.services / maxValue) * 100, 4) : 0}%` }} title={`${summary.services} servicios`} />
              <span className="travel-history-bar trips" style={{ height: `${summary.trips ? Math.max((summary.trips / maxValue) * 100, 4) : 0}%` }} title={`${summary.trips} viajes`} />
            </div>
            <strong>{summary.year}</strong>
            <small>{summary.partial ? 'En curso' : 'Cerrado'}</small>
          </div>
        ))}
      </div>
      <div className="travel-chart-legend"><span><i className="services" />Servicios</span><span><i className="trips" />Viajes</span></div>
    </section>
  );
}

type CostMetric = 'generalCost' | 'fuelCost' | 'renditions';

function AnnualCostChart({ summaries }: { summaries: HistoricalSummary[] }) {
  const [metric, setMetric] = useState<CostMetric>('generalCost');
  const labels: Record<CostMetric, string> = { generalCost: 'Costo general', fuelCost: 'Combustible', renditions: 'Rendiciones' };
  const maxValue = Math.max(...summaries.map((summary) => summary[metric]), 1);
  return (
    <section className="sales-card travel-history-chart">
      <div className="card-heading travel-history-chart-heading">
        <div><div className="eyebrow">COSTOS</div><h2>Comparativa anual</h2></div>
        <label className="compact-field travel-history-metric-select"><span>Métrica</span><select value={metric} onChange={(event) => setMetric(event.target.value as CostMetric)}><option value="generalCost">Costo general</option><option value="fuelCost">Combustible</option><option value="renditions">Rendiciones</option></select></label>
      </div>
      <div className="travel-history-bars" role="img" aria-label={`Comparativa anual de ${labels[metric]}`}>
        {summaries.map((summary) => (
          <div className="travel-history-year with-value" key={summary.year}>
            <span className="travel-history-value">₲ {compactMoney(summary[metric])}</span>
            <div className="travel-history-year-bars single"><span className="travel-history-bar cost" style={{ height: `${summary[metric] ? Math.max((summary[metric] / maxValue) * 100, 4) : 0}%` }} title={`${summary.year}: ₲ ${moneyFormat.format(Math.round(summary[metric]))}`} /></div>
            <strong>{summary.year}</strong>
            <small>{summary.partial ? 'En curso' : 'Cerrado'}</small>
          </div>
        ))}
      </div>
      <p className="analysis-meta">{labels[metric]} en guaraníes. El período en curso queda identificado en la tabla.</p>
    </section>
  );
}

function MonthlyTrendChart({ summaries }: { summaries: HistoricalSummary[] }) {
  const [metric, setMetric] = useState<'monthlyServices' | 'monthlyTrips'>('monthlyServices');
  const label = metric === 'monthlyServices' ? 'Servicios' : 'Viajes';
  const maxValue = Math.max(...summaries.flatMap((summary) => summary[metric]), 1);
  return (
    <section className="sales-card travel-monthly-trend">
      <div className="card-heading">
        <div><div className="eyebrow">TENDENCIA MENSUAL</div><h2>Concentración de la operación</h2></div>
        <div className="travel-segmented-control" aria-label="Métrica mensual"><button className={metric === 'monthlyServices' ? 'active' : ''} type="button" onClick={() => setMetric('monthlyServices')}>Servicios</button><button className={metric === 'monthlyTrips' ? 'active' : ''} type="button" onClick={() => setMetric('monthlyTrips')}>Viajes</button></div>
      </div>
      <div className="travel-monthly-grid" role="img" aria-label={`Tendencia mensual comparada de ${label}`}>
        {monthLabels.map((month, monthIndex) => (
          <article className="travel-monthly-card" key={month}>
            <div><strong>{month}</strong><span>{integerFormat.format(summaries.reduce((total, summary) => total + (summary[metric][monthIndex] ?? 0), 0))} total</span></div>
            {summaries.map((summary) => {
              const value = summary[metric][monthIndex] ?? 0;
              return <div className="travel-monthly-row" key={summary.year}><span>{summary.year}</span><b>{integerFormat.format(value)}</b><i><em style={{ width: `${value ? Math.max((value / maxValue) * 100, 4) : 0}%` }} /></i></div>;
            })}
          </article>
        ))}
      </div>
    </section>
  );
}

function HistoricalTravelTable({ summaries }: { summaries: HistoricalSummary[] }) {
  return (
    <section className="sales-card">
      <div className="card-heading"><div><div className="eyebrow">RESUMEN ANUAL</div><h2>Indicadores históricos</h2></div><span className="muted-note">Consolidado de la fuente</span></div>
      <div className="catalog-table-wrap"><table className="catalog-table historical-travel-table"><thead><tr><th>Año</th><th>Viajes</th><th>Servicios</th><th>Distancia</th><th className="align-right">Costo general</th><th className="align-right">Promedio / servicio</th><th className="align-right">Vs. anterior</th></tr></thead><tbody>{summaries.map((summary, index) => {
        const previous = summaries[index - 1];
        const variation = previous?.generalCost ? (summary.generalCost - previous.generalCost) / previous.generalCost : null;
        return <tr key={summary.year}><td><span className="code-cell">{summary.year}</span>{summary.partial && <small className="table-secondary-text">En curso</small>}</td><td>{integerFormat.format(summary.trips)}</td><td>{integerFormat.format(summary.services)}</td><td>{integerFormat.format(summary.distanceKm)} km</td><td className="align-right">₲ {moneyFormat.format(Math.round(summary.generalCost))}</td><td className="align-right">₲ {moneyFormat.format(Math.round(summary.averageCostPerService))}</td><td className={`align-right travel-variation ${variation !== null && variation > 0 ? 'higher' : 'lower'}`}>{variation === null ? '—' : `${variation > 0 ? '+' : ''}${Math.round(variation * 100)}%`}</td></tr>;
      })}</tbody></table></div>
    </section>
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
    <section className="sales-card travel-source-archive">
      <div className="card-heading">
        <div><div className="eyebrow">FUENTE CONSERVADA</div><h2>Hojas auxiliares de la planilla</h2><p className="form-hint">{batchId ? `${sheets.length} hojas disponibles desde ${sourceName ?? 'la importación local'}.` : 'Importá la planilla para consultar cada hoja y sus filas originales.'}</p></div>
        {batchId && selectedSheet ? <div className="travel-source-heading-actions">
          <span className="muted-note">{integerFormat.format(selectedSheet.rowCount)} filas</span>
          <a
            className="secondary-button source-data-download-button"
            href={`/api/imports/${encodeURIComponent(batchId ?? '')}/files/${encodeURIComponent(selectedSheet.importFileId)}`}
            download={selectedSheet.fileName}
          >
            Descargar original
          </a>
        </div> : null}
      </div>
      {!batchId ? <p className="empty-inline">No hay una importación de Viáticos aplicada todavía.</p> : error ? <p className="error-message" role="alert">{error}</p> : sheets.length === 0 ? <p className="empty-inline">{loading ? 'Leyendo hojas…' : 'La importación no tiene filas de fuente disponibles.'}</p> : (
        <>
          <div className="travel-source-sheet-list" role="list" aria-label="Hojas de la fuente">
            {sheets.map((sheet) => {
              const key = `${sheet.importFileId}:${sheet.sheetName}`;
              return <button className={selectedSheetKey === key ? 'active' : ''} type="button" key={key} onClick={() => { setSelectedSheetKey(key); setOffset(0); }}><span>{sheet.sheetName}</span><small>{integerFormat.format(sheet.rowCount)} filas · {integerFormat.format(sheet.columnCount)} columnas</small></button>;
            })}
          </div>
          {selectedSheet && <div className="travel-source-table-wrap"><table className="catalog-table travel-source-table"><thead><tr><th>#</th>{Array.from({ length: columnCount }, (_, index) => <th key={index}>{travelSourceHeaderLabel(headerValues[index], index)}</th>)}</tr></thead><tbody>{rows.map((row) => <tr className={row.rowNumber === headerRowNumber ? 'source-header-row' : undefined} key={row.id}><td className="source-row-number">{row.rowNumber}</td>{Array.from({ length: columnCount }, (_, index) => <td key={index} title={sourceValue(row.values[index])}>{sourceValue(row.values[index])}</td>)}</tr>)}</tbody></table>{rows.length === 0 && <p className="empty-inline">{loading ? 'Leyendo filas…' : 'No hay filas en esta página.'}</p>}</div>}
          <div className="travel-source-pagination"><span>Filas {offset + 1}–{offset + rows.length} de {integerFormat.format(selectedSheet?.rowCount ?? 0)}</span><div><button className="secondary-button" type="button" disabled={offset === 0 || loading} onClick={() => setOffset((current) => Math.max(0, current - pageSize))}>Anterior</button><button className="secondary-button" type="button" disabled={loading || rows.length < pageSize || offset + rows.length >= (selectedSheet?.rowCount ?? 0)} onClick={() => setOffset((current) => current + pageSize)}>Siguiente</button></div></div>
        </>
      )}
    </section>
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
