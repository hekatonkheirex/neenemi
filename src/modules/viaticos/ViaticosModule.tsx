import { useEffect, useMemo, useRef, useState, type ChangeEvent, type FormEvent } from 'react';
import { formatSourceLocation } from '../../core/source-location';
import { estimateTravelCosts } from './catalog';
import { DestinationCombobox } from './DestinationCombobox';
import { exportTravelTrips } from './export';
import { formatTravelSourceOperational } from './source-operational';
import TravelOverviewPanels from './TravelOverviewPanels';
import type {
  HistoricalSummary,
  TravelCostCatalog,
  TravelStatus,
  TravelSummary,
  TravelTransport,
  TravelTrip,
  TravelTripInput,
} from './types';
import { TRAVEL_STATUSES, TRAVEL_TRANSPORTS } from './types';
import {
  TRAVEL_VIEW_OPTIONS,
  TravelImportPreviewDialog,
  TravelHistoricalView,
  TravelRenditionsView,
  type TravelImportPreview,
  type TravelView,
} from './TravelViews';
import { confirmAction } from '../../core/confirm';
import { useUnsavedChanges } from '../../core/unsavedChanges';
import PaginationControls from '../../core/PaginationControls';
import TravelDrawer from './TravelDrawer';
import { paginateItems } from '../../core/pagination';

function tripToForm(trip: TravelTrip): TravelTripInput {
  return {
    recordedAt: trip.recordedAt,
    serviceNumber: trip.serviceNumber,
    customerName: trip.customerName,
    destination: trip.destination,
    transport: trip.transport,
    technician: trip.technician,
    driver: trip.driver,
    advance: trip.advance,
    allowance: trip.allowance,
    lodging: trip.lodging,
    tolls: trip.tolls,
    otherCost: trip.otherCost,
    vehiclePayment: trip.vehiclePayment,
    technicianPayment: trip.technicianPayment,
    distanceKm: trip.distanceKm,
    fuelCost: trip.fuelCost,
    notes: trip.notes,
  };
}

const EMPTY_TRIP: TravelTripInput = {
  recordedAt: new Date().toISOString().slice(0, 10),
  serviceNumber: '',
  customerName: '',
  destination: '',
  transport: 'MOVIL PROPIO',
  technician: '',
  driver: 'S/CHOFER',
  advance: 0,
  allowance: 0,
  lodging: 0,
  tolls: 0,
  otherCost: 0,
  vehiclePayment: 0,
  technicianPayment: 0,
  distanceKm: 0,
  fuelCost: 0,
  notes: '',
};

const STATUS_LABELS: Record<TravelStatus, string> = {
  pending: 'Pendiente',
  review: 'En revisión',
  approved: 'Aprobada',
};

const moneyFormat = new Intl.NumberFormat('es-PY', { maximumFractionDigits: 0 });
const compactMoneyFormat = new Intl.NumberFormat('es-PY', { notation: 'compact', maximumFractionDigits: 1 });
const integerFormat = new Intl.NumberFormat('es-PY', { maximumFractionDigits: 0 });
type TravelImportBatch = {
  id: string;
  domain: string;
  sourceName: string;
  status: 'staged' | 'applied' | 'failed';
};

type PendingTravelImport = {
  sourceName: string;
  bytes: Uint8Array;
  preview: TravelImportPreview;
};

export default function ViaticosModule() {
  const [summary, setSummary] = useState<TravelSummary | null>(null);
  const [trips, setTrips] = useState<TravelTrip[]>([]);
  const [historical, setHistorical] = useState<HistoricalSummary[]>([]);
  const [sourceBatchId, setSourceBatchId] = useState<string | null>(null);
  const [catalog, setCatalog] = useState<TravelCostCatalog | null>(null);
  const [form, setForm] = useState<TravelTripInput>(EMPTY_TRIP);
  const [editingId, setEditingId] = useState<string | null>(null);
  const editedTrip = editingId ? trips.find((trip) => trip.id === editingId) : undefined;
  // En un viaje nuevo la fecha es un valor por defecto: no cuenta como cambio.
  const formDirty = editedTrip
    ? JSON.stringify(form) !== JSON.stringify(tripToForm(editedTrip))
    : JSON.stringify({ ...form, recordedAt: '' }) !== JSON.stringify({ ...EMPTY_TRIP, recordedAt: '' });
  useUnsavedChanges(formDirty);
  const [formOpen, setFormOpen] = useState(false);
  const [query, setQuery] = useState('');
  const [statusFilter, setStatusFilter] = useState('');
  const [transportFilter, setTransportFilter] = useState('');
  const [monthFilter, setMonthFilter] = useState('');
  const [days, setDays] = useState(1);
  const [nights, setNights] = useState(0);
  const [technicians, setTechnicians] = useState(1);
  const [loading, setLoading] = useState(true);
  const [saving, setSaving] = useState(false);
  const [importing, setImporting] = useState(false);
  const [exporting, setExporting] = useState(false);
  const [pendingImport, setPendingImport] = useState<PendingTravelImport | null>(null);
  const [message, setMessage] = useState('');
  const [error, setError] = useState<string | null>(null);
  const [activeView, setActiveView] = useState<TravelView>('resumen');
  const [tripPage, setTripPage] = useState(1);
  const [tripPageSize, setTripPageSize] = useState(50);
  const tripListRef = useRef<HTMLElement>(null);

  useEffect(() => {
    void refresh();
  }, []);

  const visibleTrips = useMemo(() => {
    const normalizedQuery = query.trim().toLocaleLowerCase();
    return trips.filter((trip) => {
      const searchable = [trip.customerName, trip.destination, trip.technician, trip.serviceNumber, trip.notes, formatTravelSourceOperational(trip.sourceOperational)]
        .join(' ')
        .toLocaleLowerCase();
      return (!normalizedQuery || searchable.includes(normalizedQuery))
        && (!statusFilter || trip.status === statusFilter)
        && (!transportFilter || trip.transport === transportFilter)
        && (!monthFilter || trip.recordedAt.startsWith(monthFilter));
    });
  }, [monthFilter, query, statusFilter, transportFilter, trips]);

  const tripPageData = useMemo(() => paginateItems(visibleTrips, tripPage, tripPageSize), [visibleTrips, tripPage, tripPageSize]);

  // Al cambiar un filtro se vuelve a la primera página.
  useEffect(() => { setTripPage(1); }, [monthFilter, query, statusFilter, transportFilter]);

  function changeTripPage(page: number) {
    setTripPage(page);
    // El control está debajo de la tabla: sin esto la nueva página queda vista desde su final.
    tripListRef.current?.scrollIntoView({ block: 'start' });
  }

  const estimate = useMemo(
    () => catalog ? estimateTravelCosts(catalog, form.destination, form.transport, { days, nights, technicians }) : null,
    [catalog, days, form.destination, form.transport, nights, technicians],
  );

  async function refresh() {
    setLoading(true);
    setError(null);
    try {
      const [summaryResponse, tripsResponse, historicalResponse, catalogResponse, importsResponse] = await Promise.all([
        fetch('/api/travel/summary'),
        fetch('/api/travel/trips'),
        fetch('/api/travel/historical'),
        fetch('/api/travel/cost-catalog'),
        fetch('/api/imports?limit=100'),
      ]);
      setSummary(await readJson<TravelSummary>(summaryResponse));
      setTrips(await readJson<TravelTrip[]>(tripsResponse));
      setHistorical(await readJson<HistoricalSummary[]>(historicalResponse));
      setCatalog(await readJson<TravelCostCatalog>(catalogResponse));
      const importData = await readJson<{ batches: TravelImportBatch[] }>(importsResponse);
      const latestTravelBatch = importData.batches.find((batch) => batch.domain === 'viaticos' && batch.status === 'applied');
      setSourceBatchId(latestTravelBatch?.id ?? null);
    } catch (requestError: unknown) {
      setError(toErrorMessage(requestError));
    } finally {
      setLoading(false);
    }
  }

  function updateText(field: keyof Pick<TravelTripInput, 'recordedAt' | 'serviceNumber' | 'customerName' | 'destination' | 'technician' | 'driver' | 'notes'>, value: string) {
    setForm((current) => ({ ...current, [field]: value }));
  }

  function updateNumber(field: keyof Pick<TravelTripInput, 'advance' | 'allowance' | 'lodging' | 'tolls' | 'otherCost' | 'vehiclePayment' | 'technicianPayment' | 'distanceKm' | 'fuelCost'>, value: string) {
    setForm((current) => ({ ...current, [field]: Number(value) || 0 }));
  }

  function resetForm() {
    setEditingId(null);
    setForm({ ...EMPTY_TRIP, recordedAt: new Date().toISOString().slice(0, 10) });
  }

  /** "Limpiar" dentro del panel: deja un viaje nuevo en blanco sin cerrarlo. */
  function beginNewTrip() {
    resetForm();
    setMessage('');
    setError(null);
  }

  function openNewTrip() {
    beginNewTrip();
    setFormOpen(true);
  }

  /** El panel se abre sobre la vista actual (Viajes, Resumen o Rendiciones): no hace falta cambiar de pestaña. */
  function beginEdit(trip: TravelTrip) {
    setEditingId(trip.id);
    setForm(tripToForm(trip));
    setError(null);
    setFormOpen(true);
  }

  async function requestCloseForm() {
    if (formDirty && !await confirmAction({
      title: 'Descartar cambios',
      message: 'El viaje tiene cambios sin guardar. Si cierras el panel se perderán.',
      confirmLabel: 'Descartar cambios',
    })) return;
    resetForm();
    setFormOpen(false);
  }

  async function saveTrip(event: FormEvent<HTMLFormElement>) {
    event.preventDefault();
    setSaving(true);
    setError(null);
    try {
      const response = await fetch(editingId ? `/api/travel/trips/${editingId}` : '/api/travel/trips', {
        method: editingId ? 'PUT' : 'POST',
        headers: { 'content-type': 'application/json' },
        body: JSON.stringify(form),
      });
      const saved = await readJson<TravelTrip>(response);
      resetForm();
      setFormOpen(false);
      setMessage(editingId ? `Viaje actualizado: ${saved.customerName}.` : `Viaje registrado: ${saved.customerName}.`);
      await refresh();
    } catch (saveError: unknown) {
      setError(toErrorMessage(saveError));
    } finally {
      setSaving(false);
    }
  }

  async function updateStatus(trip: TravelTrip, nextStatus: TravelStatus) {
    setError(null);
    try {
      const response = await fetch(`/api/travel/trips/${trip.id}/status`, {
        method: 'PATCH',
        headers: { 'content-type': 'application/json' },
        body: JSON.stringify({ status: nextStatus }),
      });
      await readJson<TravelTrip>(response);
      setTrips((current) => current.map((item) => item.id === trip.id ? { ...item, status: nextStatus } : item));
      setSummary((current) => current ? adjustStatusSummary(current, trip.status, nextStatus) : current);
      setMessage(`Rendición marcada como ${STATUS_LABELS[nextStatus].toLocaleLowerCase()}.`);
    } catch (statusError: unknown) {
      setError(toErrorMessage(statusError));
    }
  }

  async function deleteTrip(trip: TravelTrip) {
    const description = [trip.customerName, trip.destination].filter(Boolean).join(' · ') || 'este viaje';
    if (!await confirmAction({
      title: 'Eliminar viaje',
      message: `Se eliminará ${description}. Esta acción no se puede deshacer.`,
      confirmLabel: 'Eliminar viaje',
    })) return;

    setSaving(true);
    setError(null);
    try {
      const response = await fetch(`/api/travel/trips/${trip.id}`, { method: 'DELETE' });
      const result = await readJson<{ deleted: boolean }>(response);
      if (!result.deleted) throw new Error('El viaje no estaba disponible.');
      if (editingId === trip.id) {
        resetForm();
        setFormOpen(false);
      }
      setMessage(`Viaje eliminado: ${description}.`);
      await refresh();
    } catch (deleteError: unknown) {
      setError(toErrorMessage(deleteError));
    } finally {
      setSaving(false);
    }
  }

  async function importFile(event: ChangeEvent<HTMLInputElement>) {
    const file = event.target.files?.[0];
    event.target.value = '';
    if (!file) return;
    if (file.size > 35 * 1024 * 1024) {
      setError('La planilla supera el límite de 35 MB.');
      return;
    }
    setImporting(true);
    setError(null);
    try {
      const bytes = new Uint8Array(await file.arrayBuffer());
      const response = await fetch('/api/travel/import-preview', {
        method: 'POST',
        headers: { 'content-type': 'application/json' },
        body: JSON.stringify({
          sourceName: file.name,
          sourceType: 'viaticos',
          contentBase64: bytesToBase64(bytes),
        }),
      });
      const preview = await readJson<TravelImportPreview>(response);
      setPendingImport({ sourceName: file.name, bytes, preview });
    } catch (importError: unknown) {
      setError(toErrorMessage(importError));
    } finally {
      setImporting(false);
    }
  }

  async function confirmImport() {
    const pending = pendingImport;
    if (!pending) return;
    if (pending.preview.duplicate) {
      setPendingImport(null);
      setMessage('Esta planilla ya estaba importada en la base local.');
      return;
    }

    setImporting(true);
    setError(null);
    try {
      const response = await fetch('/api/travel/import-xlsx', {
        method: 'POST',
        headers: { 'content-type': 'application/json' },
        body: JSON.stringify({
          sourceName: pending.sourceName,
          sourceType: 'viaticos',
          contentBase64: bytesToBase64(pending.bytes),
          ...(pending.preview.currentSourceBatchId ? { replaceBatchId: pending.preview.currentSourceBatchId } : {}),
        }),
      });
      const result = await readJson<{ duplicate: boolean; replaced?: boolean; accepted: number; historicalSnapshots: number }>(response);
      setPendingImport(null);
      setMessage(result.duplicate
        ? 'Esta planilla ya estaba importada en la base local.'
        : result.replaced
          ? `Fuente reemplazada: ${integerFormat.format(result.accepted)} viajes y ${integerFormat.format(result.historicalSnapshots)} históricos.`
          : `Importación completa: ${integerFormat.format(result.accepted)} viajes y ${integerFormat.format(result.historicalSnapshots)} históricos.`);
      await refresh();
    } catch (importError: unknown) {
      setError(toErrorMessage(importError));
    } finally {
      setImporting(false);
    }
  }

  async function exportTrips() {
    setExporting(true);
    setError(null);
    try {
      await exportTravelTrips(visibleTrips);
      setMessage(`Exportación XLSX generada con ${integerFormat.format(visibleTrips.length)} viajes filtrados.`);
    } catch (exportError: unknown) {
      setError(toErrorMessage(exportError));
    } finally {
      setExporting(false);
    }
  }

  function applyEstimate() {
    if (!estimate) return;
    setForm((current) => ({
      ...current,
      allowance: current.allowance || estimate.dailyAllowance,
      lodging: current.lodging || estimate.lodging,
      tolls: current.tolls || (current.transport === 'BUS' ? 0 : estimate.tolls ?? 0),
      otherCost: current.otherCost || (current.transport === 'BUS' ? estimate.busFare ?? 0 : 0),
    }));
  }

  return (
    <div className="page-content travel-page">
      <section className="catalog-header">
        <div>
          <div className="eyebrow">OPERACIONES / VIÁTICOS</div>
          <h1>Control de viáticos</h1>
          <p className="lead">Registra viajes técnicos, conserva el histórico de la planilla y sigue las rendiciones desde la misma SQLite local.</p>
        </div>
        <div className="travel-actions">
          <label className="secondary-button file-button"><span>{importing ? 'Importando…' : 'Importar planilla'}</span><input type="file" accept=".xlsx,application/vnd.openxmlformats-officedocument.spreadsheetml.sheet" onChange={(event) => void importFile(event)} disabled={importing} /></label>
          <button className="secondary-button" type="button" onClick={() => void exportTrips()} disabled={exporting || trips.length === 0}>{exporting ? 'Exportando…' : 'Exportar XLSX'}</button>
          <button className="primary-button" type="button" onClick={openNewTrip}>Nuevo viaje</button>
        </div>
      </section>

      <section className="sales-status" aria-live="polite">
        <span className={`status-dot ${error ? 'error' : 'ready'}`} />
        <span>{error ?? message ?? (summary?.records ? `${integerFormat.format(summary.records)} viajes en ${summary.operationalYear}` : 'Importa CONTROL DE VIATICO 2026.xlsx para comenzar.')}</span>
      </section>

      <nav className="travel-view-tabs" aria-label="Vistas de Viáticos">
        {TRAVEL_VIEW_OPTIONS.map((view) => (
          <button
            className={`travel-view-tab ${activeView === view.id ? 'active' : ''}`}
            key={view.id}
            type="button"
            aria-current={activeView === view.id ? 'page' : undefined}
            onClick={() => setActiveView(view.id)}
          >
            <span>{view.label}</span>
            <small>{view.hint}</small>
          </button>
        ))}
      </nav>

      <section className="summary-grid operations-summary" aria-label="Resumen de viáticos">
        <div className="summary-card accent"><span className="summary-value">₲ {compactMoneyFormat.format(Math.round(summary?.totalCost ?? 0))}</span><span className="summary-label">gasto del período {summary?.operationalYear ?? ''}</span></div>
        <div className="summary-card"><span className="summary-value">{integerFormat.format(summary?.records ?? 0)}</span><span className="summary-label">viajes registrados</span></div>
        <div className="summary-card"><span className="summary-value">{integerFormat.format(summary?.pending ?? 0)}</span><span className="summary-label">rendiciones pendientes</span></div>
      </section>

      {activeView === 'resumen' && summary && <TravelOverviewPanels summary={summary} />}

      <section className="travel-layout travel-layout-single">
        <div className="travel-main">
          {(activeView === 'resumen' || activeView === 'viajes') && <section className="sales-card" ref={tripListRef}>
            <div className="card-heading">
              <div><div className="eyebrow">REGISTRO OPERATIVO</div><h2>Viajes del período</h2></div>
              <span className="muted-note">{summary?.firstDate && summary.lastDate ? `${summary.firstDate} → ${summary.lastDate}` : 'Sin período'}</span>
            </div>
            <div className="travel-controls">
              <label className="search-field"><span>Buscar</span><input value={query} onChange={(event) => setQuery(event.target.value)} placeholder="Cliente, destino, técnico…" /></label>
              <label className="compact-field"><span>Estado</span><select value={statusFilter} onChange={(event) => setStatusFilter(event.target.value)}><option value="">Todos</option>{TRAVEL_STATUSES.map((item) => <option key={item} value={item}>{STATUS_LABELS[item]}</option>)}</select></label>
              <label className="compact-field"><span>Medio</span><select value={transportFilter} onChange={(event) => setTransportFilter(event.target.value)}><option value="">Todos</option>{TRAVEL_TRANSPORTS.map((item) => <option key={item} value={item}>{item.replace('MOVIL ', 'MÓVIL ')}</option>)}</select></label>
              <label className="compact-field"><span>Mes</span><input type="month" value={monthFilter} onChange={(event) => setMonthFilter(event.target.value)} /></label>
            </div>
            <div className="catalog-table-wrap">
              <table className="catalog-table travel-table">
                <thead><tr><th>Fecha</th><th>Cliente / destino</th><th>Responsable</th><th>Medio</th><th className="align-right">Total</th><th>Rendición</th><th className="align-right">Acción</th></tr></thead>
                <tbody>
                  {tripPageData.items.map((trip) => <tr key={trip.id}>
                    <td><span className="code-cell">{trip.recordedAt}</span><small className="table-secondary-text">{trip.serviceNumber || 'Sin I.S.'}</small><small className="table-secondary-text">{formatSourceLocation(trip.sourceFileName, trip.sourceSheetName, trip.sourceRowNumber)}</small></td>
                    <td><span className="code-cell">{trip.customerName}</span><small className="table-secondary-text">{trip.destination}</small></td>
                    <td><span>{trip.technician || 'Sin técnico'}</span><small className="table-secondary-text">{trip.driver || 'Sin chofer'}</small></td>
                    <td><span className="badge ok">{trip.transport.replace('MOVIL ', 'MÓVIL ')}</span></td>
                    <td className="align-right"><span className="code-cell">₲ {moneyFormat.format(Math.round(trip.totalCost))}</span><small className="table-secondary-text">{trip.distanceKm ? `${integerFormat.format(trip.distanceKm)} km` : 'Sin km'}</small></td>
                    <td><select className="status-select" aria-label={`Estado de rendición de ${trip.customerName}`} value={trip.status} onChange={(event) => void updateStatus(trip, event.target.value as TravelStatus)}>{TRAVEL_STATUSES.map((item) => <option key={item} value={item}>{STATUS_LABELS[item]}</option>)}</select></td>
                    <td className="align-right"><div className="travel-row-actions"><button className="text-button" type="button" onClick={() => beginEdit(trip)}>Editar</button><button className="text-button danger-text-button" type="button" onClick={() => void deleteTrip(trip)} disabled={saving}>Eliminar</button></div></td>
                  </tr>)}
                  {visibleTrips.length === 0 && <tr><td colSpan={7} className="empty-cell">{loading ? 'Cargando viajes…' : summary?.records ? 'No hay viajes para los filtros seleccionados.' : 'Importa la planilla o registra un viaje nuevo.'}</td></tr>}
                </tbody>
              </table>
            </div>
            <PaginationControls
              label="Paginación de viajes"
              page={tripPageData.page}
              pageSize={tripPageData.pageSize}
              total={tripPageData.total}
              onPageChange={changeTripPage}
              onPageSizeChange={(size) => { setTripPageSize(size); setTripPage(1); }}
            />
          </section>}

          {activeView === 'resumen' && <section className="sales-card">
            <div className="card-heading"><div><div className="eyebrow">EVOLUCIÓN</div><h2>Gasto por mes</h2></div><span className="muted-note">{summary?.operationalYear ?? 'Sin año'}</span></div>
            <MonthlyBars values={summary?.monthlyTotals ?? []} />
          </section>}

          {activeView === 'resumen' && <section className="sales-card">
            <div className="card-heading"><div><div className="eyebrow">HISTÓRICO</div><h2>Comparativa anual</h2></div><span className="muted-note">Fuente importada</span></div>
            {historical.length === 0 ? <p className="empty-inline">Importa la planilla para recuperar los resúmenes históricos.</p> : <div className="catalog-table-wrap"><table className="catalog-table historical-travel-table"><thead><tr><th>Año</th><th>Viajes</th><th>Servicios</th><th>Distancia</th><th className="align-right">Costo general</th><th className="align-right">Promedio / servicio</th></tr></thead><tbody>{historical.map((item) => <tr key={item.year}><td><span className="code-cell">{item.year}</span>{item.partial && <small className="table-secondary-text">En curso</small>}</td><td>{integerFormat.format(item.trips)}</td><td>{integerFormat.format(item.services)}</td><td>{integerFormat.format(item.distanceKm)} km</td><td className="align-right">₲ {moneyFormat.format(Math.round(item.generalCost))}</td><td className="align-right">₲ {moneyFormat.format(Math.round(item.averageCostPerService))}</td></tr>)}</tbody></table></div>}
          </section>}

          {activeView === 'rendiciones' && <TravelRenditionsView trips={trips} onEdit={beginEdit} onStatusChange={(trip, status) => void updateStatus(trip, status)} />}
          {activeView === 'historico' && <TravelHistoricalView summaries={historical} sourceName={summary?.sourceName ?? null} sourceBatchId={sourceBatchId} />}
        </div>

      </section>

      {formOpen ? (
        <TravelDrawer
          eyebrow={editingId ? 'EDITAR REGISTRO' : 'NUEVO REGISTRO'}
          title={editingId ? 'Actualizar viaje' : 'Registrar viaje'}
          onRequestClose={() => void requestCloseForm()}
        >
          <section className="sales-card form-card">
            <form className="travel-form" onSubmit={(event) => void saveTrip(event)}>
              <label className="search-field"><span>Fecha</span><input required type="date" value={form.recordedAt} onChange={(event) => updateText('recordedAt', event.target.value)} /></label>
              <div className="form-grid-2"><label className="search-field"><span>I.S.</span><input value={form.serviceNumber} onChange={(event) => updateText('serviceNumber', event.target.value)} placeholder="Opcional" /></label><label className="search-field"><span>Medio</span><select value={form.transport} onChange={(event) => setForm((current) => ({ ...current, transport: event.target.value as TravelTransport }))}>{TRAVEL_TRANSPORTS.map((item) => <option key={item} value={item}>{item.replace('MOVIL ', 'MÓVIL ')}</option>)}</select></label></div>
              <label className="search-field"><span>Cliente</span><input required value={form.customerName} onChange={(event) => updateText('customerName', event.target.value)} placeholder="Nombre del cliente" /></label>
              <label className="search-field"><span>Destino</span><DestinationCombobox required value={form.destination} onChange={(destination) => updateText('destination', destination)} /></label>
              <div className="form-grid-2"><label className="search-field"><span>Técnico</span><input value={form.technician} onChange={(event) => updateText('technician', event.target.value)} /></label><label className="search-field"><span>Chofer</span><input value={form.driver} onChange={(event) => updateText('driver', event.target.value)} /></label></div>
              <div className="form-grid-2"><MoneyField label="Monto / anticipo" value={form.advance} allowNegative onChange={(value) => updateNumber('advance', value)} /><MoneyField label="Viático" value={form.allowance} onChange={(value) => updateNumber('allowance', value)} /><MoneyField label="Hospedaje" value={form.lodging} onChange={(value) => updateNumber('lodging', value)} /><MoneyField label="Peajes" value={form.tolls} onChange={(value) => updateNumber('tolls', value)} /><MoneyField label="Varios" value={form.otherCost} onChange={(value) => updateNumber('otherCost', value)} /><MoneyField label="Uso de vehículo" value={form.vehiclePayment} onChange={(value) => updateNumber('vehiclePayment', value)} /><MoneyField label="Técnico / chofer" value={form.technicianPayment} onChange={(value) => updateNumber('technicianPayment', value)} /><MoneyField label="Combustible" value={form.fuelCost} onChange={(value) => updateNumber('fuelCost', value)} /><MoneyField label="Kilómetros" value={form.distanceKm} onChange={(value) => updateNumber('distanceKm', value)} /></div>
              {estimate && <div className="travel-estimate">
                <div><span>Estimación disponible</span><strong>₲ {moneyFormat.format(Math.round(estimate.dailyAllowance + estimate.lodging + (estimate.tolls ?? 0) + (estimate.busFare ?? 0)))}</strong></div>
                <div className="travel-estimate-breakdown">
                  <span>Viático <b>₲ {moneyFormat.format(Math.round(estimate.dailyAllowance))}</b></span>
                  <span>Hotel <b>₲ {moneyFormat.format(Math.round(estimate.lodging))}</b></span>
                  <span>Peajes <b>{form.transport === 'BUS' ? 'No aplica' : estimate.tolls === null ? 'Sin referencia' : `₲ ${moneyFormat.format(Math.round(estimate.tolls))}`}</b></span>
                  <span>Bus <b>{estimate.busFare === null ? 'Sin referencia' : `₲ ${moneyFormat.format(Math.round(estimate.busFare))}`}</b></span>
                </div>
                <p>
                  {estimate.tollRoute
                    ? `Peajes: ${estimate.tollRoute.route} · ${estimate.tollRoute.checkpoints.join(' · ')}`
                    : estimate.busReference
                      ? `Bus: ${estimate.busReference.destination}${estimate.busReference.company ? ` · ${estimate.busReference.company}` : ''}`
                      : 'No hay ruta o pasaje coincidente.'}
                </p>
                {estimate.busReference && <p>Ida ₲ {moneyFormat.format(Math.round(estimate.busOutbound ?? 0))} · vuelta ₲ {moneyFormat.format(Math.round(estimate.busReturn ?? 0))}</p>}
                <button className="text-button" type="button" onClick={applyEstimate}>Aplicar campos vacíos</button>
              </div>}
              <label className="search-field"><span>Notas</span><textarea rows={3} value={form.notes} onChange={(event) => updateText('notes', event.target.value)} placeholder="Comprobantes u observaciones" /></label>
              <div className="travel-total"><span>Total calculado</span><strong>₲ {moneyFormat.format(Math.round(calculateTotal(form)))}</strong></div>
              <div className="form-actions"><button className="secondary-button" type="button" onClick={beginNewTrip}>Limpiar</button><button className="primary-button" type="submit" disabled={saving}>{saving ? 'Guardando…' : editingId ? 'Guardar cambios' : 'Registrar viaje'}</button></div>
            </form>
          </section>

          <section className="sales-card form-card">
            <div className="eyebrow">REFERENCIA DE COSTOS</div>
            <h2>Estimación orientativa</h2>
            <p className="form-hint">{catalog?.source ?? 'Catálogo base de costos'}</p>
            <div className="travel-estimate-inputs"><label className="compact-field"><span>Días</span><input min={1} type="number" value={days} onChange={(event) => setDays(Number(event.target.value) || 1)} /></label><label className="compact-field"><span>Noches</span><input min={0} type="number" value={nights} onChange={(event) => setNights(Number(event.target.value) || 0)} /></label><label className="compact-field"><span>Técnicos</span><input min={1} type="number" value={technicians} onChange={(event) => setTechnicians(Number(event.target.value) || 1)} /></label></div>
            <div className="mps-facts"><div><span>Viático diario</span><strong>₲ {moneyFormat.format(catalog?.dailyAllowance ?? 0)}</strong></div><div><span>Hotel por noche</span><strong>₲ {moneyFormat.format(catalog?.hotelPerNight ?? 0)}</strong></div></div>
            {catalog && <details className="travel-catalog-details">
              <summary>Ver rutas de peaje y pasajes cargados</summary>
              <div className="travel-catalog-list">
                <div className="travel-catalog-list-heading"><strong>Rutas de peaje</strong><span>{catalog.tollRoutes.length}</span></div>
                {catalog.tollRoutes.map((route) => <div className="travel-catalog-row" key={`${route.route}-${route.total}`}><div><strong>{route.route}</strong><small>{route.checkpoints.join(' · ')}</small></div><b>₲ {moneyFormat.format(Math.round(route.total))}</b></div>)}
                <div className="travel-catalog-list-heading"><strong>Pasajes en bus</strong><span>{catalog.busFares.length}</span></div>
                {catalog.busFares.map((fare) => <div className="travel-catalog-row" key={fare.destination}><div><strong>{fare.destination}</strong><small>{fare.company || 'Empresa no indicada'}</small></div><b>{fare.outbound === null || fare.returnFare === null ? 'Incompleto' : `₲ ${moneyFormat.format(Math.round(fare.outbound + fare.returnFare))}`}</b></div>)}
              </div>
            </details>}
          </section>
        </TravelDrawer>
      ) : null}

      {pendingImport && <TravelImportPreviewDialog preview={pendingImport.preview} importing={importing} onCancel={() => setPendingImport(null)} onConfirm={() => void confirmImport()} />}
    </div>
  );
}

function MoneyField({ label, value, allowNegative = false, onChange }: { label: string; value: number; allowNegative?: boolean; onChange: (value: string) => void }) {
  return <label className="search-field"><span>{label}</span><input {...(allowNegative ? {} : { min: 0 })} step={1000} type="number" value={value || ''} onChange={(event) => onChange(event.target.value)} placeholder="0" /></label>;
}

function MonthlyBars({ values }: { values: number[] }) {
  const labels = ['Ene', 'Feb', 'Mar', 'Abr', 'May', 'Jun', 'Jul', 'Ago', 'Sep', 'Oct', 'Nov', 'Dic'];
  const max = Math.max(...values, 1);
  return <div className="travel-month-bars" role="img" aria-label="Gasto mensual de viáticos"><div className="travel-bars-grid">{labels.map((label, index) => <div className="travel-bar-column" key={label}><span>₲ {compactMoneyFormat.format(Math.round(values[index] ?? 0))}</span><div className="travel-bar-track"><div className="travel-bar-fill" style={{ height: `${values[index] ? Math.max((values[index] / max) * 100, 4) : 2}%` }} /></div><small>{label}</small></div>)}</div></div>;
}

function calculateTotal(input: TravelTripInput): number {
  return input.allowance + input.lodging + input.tolls + input.otherCost + input.vehiclePayment + input.technicianPayment + input.fuelCost;
}

function adjustStatusSummary(summary: TravelSummary, previous: TravelStatus, next: TravelStatus): TravelSummary {
  if (previous === next) return summary;
  const counts: Record<TravelStatus, number> = { pending: summary.pending, review: summary.review, approved: summary.approved };
  counts[previous] = Math.max(0, counts[previous] - 1);
  counts[next] += 1;
  return { ...summary, pending: counts.pending, review: counts.review, approved: counts.approved };
}

async function readJson<T>(response: Response): Promise<T> {
  const body = (await response.json()) as T | { error?: string };
  if (!response.ok) {
    const error = typeof body === 'object' && body !== null && 'error' in body && typeof body.error === 'string' ? body.error : 'La API local devolvió un error.';
    throw new Error(error);
  }
  return body as T;
}

function toErrorMessage(value: unknown): string {
  return value instanceof Error ? value.message : 'No se pudo completar la operación.';
}

function bytesToBase64(bytes: Uint8Array): string {
  let binary = '';
  const chunkSize = 0x8000;
  for (let offset = 0; offset < bytes.length; offset += chunkSize) binary += String.fromCharCode(...bytes.subarray(offset, offset + chunkSize));
  return btoa(binary);
}
