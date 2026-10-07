import { useEffect, useMemo, useRef, useState, type ChangeEvent, type FormEvent } from 'react';
import { compactSourceLocation } from '../../core/source-location';
import AnimatedTabs from '../../core/AnimatedTabs';
import SourceLocationLabel from '../../core/SourceLocationLabel';
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
import { pendingNotice } from './pendingNotice';
import { paginateItems } from '../../core/pagination';
import { readJson, toErrorMessage } from '../../core/http';
import { UploadButton, ExportButton } from '../../core/ActionButtons';
import { cn } from '../../core/cn';
import { PageHeader } from '../../core/ui/page-header';
import { Card, CardHeader, Muted } from '../../core/ui/card';
import { Button } from '../../core/ui/button';
import { Input } from '../../core/ui/input';
import { MonthPicker } from '../../core/ui/month-picker';
import { Textarea } from '../../core/ui/textarea';
import { Badge } from '../../core/ui/badge';
import { StatusLine } from '../../core/ui/status-line';
import { Table, TableBody, TableCell, TableHead, TableHeader, TableRow } from '../../core/ui/table';

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

const cardClass = 'min-w-0 grid-cols-1 [overflow-wrap:anywhere]';
const fieldClass = 'grid min-w-0 gap-1.5 text-xs font-semibold text-navy dark:text-white';
const selectClass = 'h-10 w-full min-w-0 rounded-xl border border-navy/20 bg-white px-3 text-sm text-navy focus-visible:outline-2 focus-visible:outline-offset-2 focus-visible:outline-sky disabled:opacity-50 dark:border-sky/30 dark:bg-navy/50 dark:text-white';
const subCardClass = 'min-w-0 rounded-xl border border-navy/10 bg-paper p-4 dark:border-sky/20 dark:bg-navy/30';

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

  const notice = useMemo(() => pendingNotice(trips, new Date()), [trips]);
  const statusText = error || message || (notice ? `${notice.pending ? `${integerFormat.format(notice.pending)} rendiciones pendientes por ₲ ${moneyFormat.format(Math.round(notice.pendingCost))}${notice.oldestPendingDays !== null ? `, la más antigua de hace ${integerFormat.format(notice.oldestPendingDays)} días` : ''}` : ''}${notice.pending && notice.review ? ' · ' : ''}${notice.review ? `${integerFormat.format(notice.review)} en revisión` : ''}` : summary?.records ? '' : 'Importa CONTROL DE VIATICO 2026.xlsx para comenzar.');

  return (
    <div className="page-content travel-page grid min-w-0 grid-cols-1 gap-6 [overflow-wrap:anywhere]">
      <PageHeader
        eyebrow="ADMINISTRATIVO / VIÁTICOS"
        title="Control de viáticos"
        lead="Registra viajes técnicos, conserva el histórico de la planilla y sigue las rendiciones desde la misma SQLite local."
        actions={<>
          <UploadButton busy={importing} label="Importar planilla" accept=".xlsx,application/vnd.openxmlformats-officedocument.spreadsheetml.sheet" onChange={(event) => void importFile(event)} />
          <ExportButton busy={exporting} onClick={() => void exportTrips()} disabled={trips.length === 0}>Exportar XLSX</ExportButton>
          <Button onClick={openNewTrip}>Nuevo viaje</Button>
        </>}
      />

      {statusText && <StatusLine state={error ? 'error' : 'ready'}>{statusText}</StatusLine>}

      <AnimatedTabs ariaLabel="Vistas de Viáticos" tabs={TRAVEL_VIEW_OPTIONS} active={activeView} onChange={setActiveView} />

      <section className="grid min-w-0 grid-cols-1 gap-3 sm:grid-cols-3" aria-label="Resumen de viáticos">
        <SummaryStat value={`₲ ${compactMoneyFormat.format(Math.round(summary?.totalCost ?? 0))}`} label={`gasto del período ${summary?.operationalYear ?? ''}`} accent />
        <SummaryStat value={integerFormat.format(summary?.records ?? 0)} label="viajes registrados" />
        <SummaryStat value={integerFormat.format(summary?.pending ?? 0)} label="rendiciones pendientes" />
      </section>

      {activeView === 'resumen' && summary && <TravelOverviewPanels summary={summary} />}

      {(activeView === 'resumen' || activeView === 'viajes') && <Card className={cardClass} ref={tripListRef}>
        <CardHeader eyebrow="Registro operativo" title="Viajes del período" aside={<Badge>{summary?.firstDate && summary.lastDate ? `${summary.firstDate} → ${summary.lastDate}` : 'Sin período'}</Badge>} />
        <div className="grid min-w-0 grid-cols-[repeat(auto-fit,minmax(min(100%,11rem),1fr))] items-end gap-4">
          <label className={fieldClass}>Buscar<Input value={query} onChange={(event) => setQuery(event.target.value)} placeholder="Cliente, destino, técnico…" /></label>
          <label className={fieldClass}>Estado<select className={selectClass} value={statusFilter} onChange={(event) => setStatusFilter(event.target.value)}><option value="">Todos</option>{TRAVEL_STATUSES.map((item) => <option key={item} value={item}>{STATUS_LABELS[item]}</option>)}</select></label>
          <label className={fieldClass}>Medio<select className={selectClass} value={transportFilter} onChange={(event) => setTransportFilter(event.target.value)}><option value="">Todos</option>{TRAVEL_TRANSPORTS.map((item) => <option key={item} value={item}>{item.replace('MOVIL ', 'MÓVIL ')}</option>)}</select></label>
          <div className={fieldClass}>Mes<MonthPicker label="Mes" value={monthFilter} onChange={setMonthFilter} /></div>
        </div>
        <Table className="min-w-[48rem] [overflow-wrap:normal]">
          <TableHeader><TableRow><TableHead>Fecha</TableHead><TableHead>Cliente / destino</TableHead><TableHead>Responsable</TableHead><TableHead>Medio</TableHead><TableHead className="text-right">Total</TableHead><TableHead>Rendición</TableHead><TableHead className="text-right">Acción</TableHead></TableRow></TableHeader>
          <TableBody>
            {tripPageData.items.map((trip) => <TableRow key={trip.id}>
              <TableCell><div className="whitespace-nowrap font-mono text-xs">{trip.recordedAt}</div><Muted className="mt-1">{trip.serviceNumber || 'Sin I.S.'}</Muted><TripSourceLabel trip={trip} /></TableCell>
              <TableCell className="min-w-[8rem]"><div className="font-semibold text-navy dark:text-white">{trip.customerName}</div><Muted className="mt-1">{trip.destination}</Muted></TableCell>
              <TableCell><div>{trip.technician || 'Sin técnico'}</div><Muted className="mt-1">{trip.driver || 'Sin chofer'}</Muted></TableCell>
              <TableCell><Badge className="whitespace-nowrap" tone="success">{trip.transport.replace('MOVIL ', 'MÓVIL ')}</Badge></TableCell>
              <TableCell className="text-right"><div className="whitespace-nowrap font-semibold tabular-nums">₲ {moneyFormat.format(Math.round(trip.totalCost))}</div><Muted className="mt-1 whitespace-nowrap">{trip.distanceKm ? `${integerFormat.format(trip.distanceKm)} km` : 'Sin km'}</Muted></TableCell>
              <TableCell><select className={cn(selectClass, 'h-8 w-auto text-xs')} aria-label={`Estado de rendición de ${trip.customerName}`} value={trip.status} onChange={(event) => void updateStatus(trip, event.target.value as TravelStatus)}>{TRAVEL_STATUSES.map((item) => <option key={item} value={item}>{STATUS_LABELS[item]}</option>)}</select></TableCell>
              <TableCell className="text-right"><div className="flex justify-end gap-1"><Button variant="outline" size="sm" onClick={() => beginEdit(trip)}>Editar</Button><Button variant="ghost" size="sm" onClick={() => void deleteTrip(trip)} disabled={saving}>Eliminar</Button></div></TableCell>
            </TableRow>)}
            {visibleTrips.length === 0 && <TableRow><TableCell colSpan={7} className="py-8 text-center">{loading ? 'Cargando viajes…' : summary?.records ? 'No hay viajes para los filtros seleccionados.' : 'Importa la planilla o registra un viaje nuevo.'}</TableCell></TableRow>}
          </TableBody>
        </Table>
        <PaginationControls
          label="Paginación de viajes"
          page={tripPageData.page}
          pageSize={tripPageData.pageSize}
          total={tripPageData.total}
          onPageChange={changeTripPage}
          onPageSizeChange={(size) => { setTripPageSize(size); setTripPage(1); }}
        />
      </Card>}

      {activeView === 'resumen' && <Card className={cardClass}>
        <CardHeader eyebrow="Evolución" title="Gasto por mes" aside={<Badge>{summary?.operationalYear ?? 'Sin año'}</Badge>} />
        <MonthlyBars values={summary?.monthlyTotals ?? []} />
      </Card>}

      {activeView === 'resumen' && <Card className={cardClass}>
        <CardHeader eyebrow="Histórico" title="Comparativa anual" aside={<Badge>Fuente importada</Badge>} />
        {historical.length === 0 ? <Muted className="text-sm">Importa la planilla para recuperar los resúmenes históricos.</Muted> : <Table className="min-w-[40rem]">
          <TableHeader><TableRow><TableHead>Año</TableHead><TableHead>Viajes</TableHead><TableHead>Servicios</TableHead><TableHead>Distancia</TableHead><TableHead className="text-right">Costo general</TableHead><TableHead className="text-right">Promedio / servicio</TableHead></TableRow></TableHeader>
          <TableBody>{historical.map((item) => <TableRow key={item.year}>
            <TableCell><div className="font-semibold text-navy dark:text-white">{item.year}</div>{item.partial && <Muted>En curso</Muted>}</TableCell>
            <TableCell className="tabular-nums">{integerFormat.format(item.trips)}</TableCell>
            <TableCell className="tabular-nums">{integerFormat.format(item.services)}</TableCell>
            <TableCell className="whitespace-nowrap tabular-nums">{integerFormat.format(item.distanceKm)} km</TableCell>
            <TableCell className="whitespace-nowrap text-right tabular-nums">₲ {moneyFormat.format(Math.round(item.generalCost))}</TableCell>
            <TableCell className="whitespace-nowrap text-right tabular-nums">₲ {moneyFormat.format(Math.round(item.averageCostPerService))}</TableCell>
          </TableRow>)}</TableBody>
        </Table>}
      </Card>}

      {activeView === 'rendiciones' && <TravelRenditionsView trips={trips} onEdit={beginEdit} onStatusChange={(trip, status) => void updateStatus(trip, status)} />}
      {activeView === 'historico' && <TravelHistoricalView summaries={historical} sourceName={summary?.sourceName ?? null} sourceImportedAt={summary?.sourceImportedAt ?? null} sourceBatchId={sourceBatchId} />}

      {formOpen ? (
        <TravelDrawer
          eyebrow={editingId ? 'EDITAR REGISTRO' : 'NUEVO REGISTRO'}
          title={editingId ? 'Actualizar viaje' : 'Registrar viaje'}
          onRequestClose={() => void requestCloseForm()}
        >
          <Card className="min-w-0 grid-cols-1 shadow-none">
            <form className="grid min-w-0 gap-4" onSubmit={(event) => void saveTrip(event)}>
              <label className={fieldClass}>Fecha<Input required type="date" value={form.recordedAt} onChange={(event) => updateText('recordedAt', event.target.value)} /></label>
              <div className="grid gap-4 sm:grid-cols-2"><label className={fieldClass}>I.S.<Input value={form.serviceNumber} onChange={(event) => updateText('serviceNumber', event.target.value)} placeholder="Opcional" /></label><label className={fieldClass}>Medio<select className={selectClass} value={form.transport} onChange={(event) => setForm((current) => ({ ...current, transport: event.target.value as TravelTransport }))}>{TRAVEL_TRANSPORTS.map((item) => <option key={item} value={item}>{item.replace('MOVIL ', 'MÓVIL ')}</option>)}</select></label></div>
              <label className={fieldClass}>Cliente<Input required value={form.customerName} onChange={(event) => updateText('customerName', event.target.value)} placeholder="Nombre del cliente" /></label>
              <label className={fieldClass}>Destino<DestinationCombobox required value={form.destination} onChange={(destination) => updateText('destination', destination)} /></label>
              <div className="grid gap-4 sm:grid-cols-2"><label className={fieldClass}>Técnico<Input value={form.technician} onChange={(event) => updateText('technician', event.target.value)} /></label><label className={fieldClass}>Chofer<Input value={form.driver} onChange={(event) => updateText('driver', event.target.value)} /></label></div>
              <div className="grid gap-4 sm:grid-cols-2"><MoneyField label="Monto / anticipo" value={form.advance} allowNegative onChange={(value) => updateNumber('advance', value)} /><MoneyField label="Viático" value={form.allowance} onChange={(value) => updateNumber('allowance', value)} /><MoneyField label="Hospedaje" value={form.lodging} onChange={(value) => updateNumber('lodging', value)} /><MoneyField label="Peajes" value={form.tolls} onChange={(value) => updateNumber('tolls', value)} /><MoneyField label="Varios" value={form.otherCost} onChange={(value) => updateNumber('otherCost', value)} /><MoneyField label="Uso de vehículo" value={form.vehiclePayment} onChange={(value) => updateNumber('vehiclePayment', value)} /><MoneyField label="Técnico / chofer" value={form.technicianPayment} onChange={(value) => updateNumber('technicianPayment', value)} /><MoneyField label="Combustible" value={form.fuelCost} onChange={(value) => updateNumber('fuelCost', value)} /><MoneyField label="Kilómetros" value={form.distanceKm} onChange={(value) => updateNumber('distanceKm', value)} /></div>
              {estimate && <div className={cn(subCardClass, 'grid gap-2 border-sky/40')}>
                <div className="flex flex-wrap items-baseline justify-between gap-2"><Muted>Estimación disponible</Muted><div className="text-lg font-bold tabular-nums text-navy dark:text-white">₲ {moneyFormat.format(Math.round(estimate.dailyAllowance + estimate.lodging + (estimate.tolls ?? 0) + (estimate.busFare ?? 0)))}</div></div>
                <div className="grid grid-cols-2 gap-x-4 gap-y-1 text-xs text-ink-2 dark:text-[#d6e2f5]">
                  <div>Viático <b className="text-navy dark:text-white">₲ {moneyFormat.format(Math.round(estimate.dailyAllowance))}</b></div>
                  <div>Hotel <b className="text-navy dark:text-white">₲ {moneyFormat.format(Math.round(estimate.lodging))}</b></div>
                  <div>Peajes <b className="text-navy dark:text-white">{form.transport === 'BUS' ? 'No aplica' : estimate.tolls === null ? 'Sin referencia' : `₲ ${moneyFormat.format(Math.round(estimate.tolls))}`}</b></div>
                  <div>Bus <b className="text-navy dark:text-white">{estimate.busFare === null ? 'Sin referencia' : `₲ ${moneyFormat.format(Math.round(estimate.busFare))}`}</b></div>
                </div>
                <Muted>
                  {estimate.tollRoute
                    ? `Peajes: ${estimate.tollRoute.route} · ${estimate.tollRoute.checkpoints.join(' · ')}`
                    : estimate.busReference
                      ? `Bus: ${estimate.busReference.destination}${estimate.busReference.company ? ` · ${estimate.busReference.company}` : ''}`
                      : 'No hay ruta o pasaje coincidente.'}
                </Muted>
                {estimate.busReference && <Muted>Ida ₲ {moneyFormat.format(Math.round(estimate.busOutbound ?? 0))} · vuelta ₲ {moneyFormat.format(Math.round(estimate.busReturn ?? 0))}</Muted>}
                <div><Button variant="outline" size="sm" onClick={applyEstimate}>Aplicar campos vacíos</Button></div>
              </div>}
              <label className={fieldClass}>Notas<Textarea rows={3} value={form.notes} onChange={(event) => updateText('notes', event.target.value)} placeholder="Comprobantes u observaciones" /></label>
              <div className="flex items-baseline justify-between gap-3 rounded-xl border border-navy/10 bg-paper p-4 dark:border-sky/20 dark:bg-navy/30"><div className="text-sm font-semibold text-navy dark:text-white">Total calculado</div><div className="text-xl font-bold tabular-nums text-navy dark:text-white">₲ {moneyFormat.format(Math.round(calculateTotal(form)))}</div></div>
              <div className="flex flex-wrap justify-end gap-3"><Button variant="outline" onClick={beginNewTrip}>Limpiar</Button><Button type="submit" disabled={saving}>{saving ? 'Guardando…' : editingId ? 'Guardar cambios' : 'Registrar viaje'}</Button></div>
            </form>
          </Card>

          <Card className="min-w-0 grid-cols-1 shadow-none">
            <CardHeader eyebrow="Referencia de costos" title="Estimación orientativa" />
            <Muted className="text-sm">{catalog?.source ?? 'Catálogo base de costos'}</Muted>
            <div className="grid grid-cols-3 gap-3"><label className={fieldClass}>Días<Input min={1} type="number" value={days} onChange={(event) => setDays(Number(event.target.value) || 1)} /></label><label className={fieldClass}>Noches<Input min={0} type="number" value={nights} onChange={(event) => setNights(Number(event.target.value) || 0)} /></label><label className={fieldClass}>Técnicos<Input min={1} type="number" value={technicians} onChange={(event) => setTechnicians(Number(event.target.value) || 1)} /></label></div>
            <div className="grid grid-cols-2 gap-3"><div className={cn(subCardClass, 'grid gap-1 p-3')}><Muted>Viático diario</Muted><div className="font-bold tabular-nums text-navy dark:text-white">₲ {moneyFormat.format(catalog?.dailyAllowance ?? 0)}</div></div><div className={cn(subCardClass, 'grid gap-1 p-3')}><Muted>Hotel por noche</Muted><div className="font-bold tabular-nums text-navy dark:text-white">₲ {moneyFormat.format(catalog?.hotelPerNight ?? 0)}</div></div></div>
            {catalog && <details className={subCardClass}>
              <summary className="cursor-pointer text-sm font-bold text-navy focus-visible:outline-sky dark:text-white">Ver rutas de peaje y pasajes cargados</summary>
              <div className="mt-3 grid max-h-80 gap-2 overflow-y-auto">
                <div className="flex items-center justify-between gap-2 text-sm font-bold text-navy dark:text-white">Rutas de peaje<Badge>{catalog.tollRoutes.length}</Badge></div>
                {catalog.tollRoutes.map((route) => <div className="flex items-start justify-between gap-3 border-t border-navy/10 pt-2 dark:border-sky/15" key={`${route.route}-${route.total}`}><div className="min-w-0"><div className="text-sm font-semibold text-navy dark:text-white">{route.route}</div><Muted>{route.checkpoints.join(' · ')}</Muted></div><b className="whitespace-nowrap text-sm tabular-nums text-navy dark:text-white">₲ {moneyFormat.format(Math.round(route.total))}</b></div>)}
                <div className="mt-2 flex items-center justify-between gap-2 text-sm font-bold text-navy dark:text-white">Pasajes en bus<Badge>{catalog.busFares.length}</Badge></div>
                {catalog.busFares.map((fare) => <div className="flex items-start justify-between gap-3 border-t border-navy/10 pt-2 dark:border-sky/15" key={fare.destination}><div className="min-w-0"><div className="text-sm font-semibold text-navy dark:text-white">{fare.destination}</div><Muted>{fare.company || 'Empresa no indicada'}</Muted></div><b className="whitespace-nowrap text-sm tabular-nums text-navy dark:text-white">{fare.outbound === null || fare.returnFare === null ? 'Incompleto' : `₲ ${moneyFormat.format(Math.round(fare.outbound + fare.returnFare))}`}</b></div>)}
              </div>
            </details>}
          </Card>
        </TravelDrawer>
      ) : null}

      {pendingImport && <TravelImportPreviewDialog preview={pendingImport.preview} importing={importing} onCancel={() => setPendingImport(null)} onConfirm={() => void confirmImport()} />}
    </div>
  );
}

/** Origen del registro en la lista: ver compactSourceLocation. */
export function compactSourceLabel(trip: Pick<TravelTrip, 'sourceFileName' | 'sourceSheetName' | 'sourceRowNumber'>) {
  return compactSourceLocation(trip.sourceFileName, trip.sourceSheetName, trip.sourceRowNumber);
}

function TripSourceLabel({ trip }: { trip: TravelTrip }) {
  return <SourceLocationLabel fileName={trip.sourceFileName} sheetName={trip.sourceSheetName} rowNumber={trip.sourceRowNumber} />;
}

function MoneyField({ label, value, allowNegative = false, onChange }: { label: string; value: number; allowNegative?: boolean; onChange: (value: string) => void }) {
  return <label className={fieldClass}>{label}<Input {...(allowNegative ? {} : { min: 0 })} step={1000} type="number" value={value || ''} onChange={(event) => onChange(event.target.value)} placeholder="0" /></label>;
}

function SummaryStat({ value, label, accent = false }: { value: string; label: string; accent?: boolean }) {
  return <Card className={cn('min-w-0 gap-1 p-4', accent && 'border-l-4 border-l-brand!')}><div className="text-3xl font-bold tabular-nums text-navy dark:text-white">{value}</div><Muted>{label}</Muted></Card>;
}

function MonthlyBars({ values }: { values: number[] }) {
  const labels = ['Ene', 'Feb', 'Mar', 'Abr', 'May', 'Jun', 'Jul', 'Ago', 'Sep', 'Oct', 'Nov', 'Dic'];
  const max = Math.max(...values, 1);
  return <div className="overflow-x-auto" role="img" aria-label="Gasto mensual de viáticos"><div className="grid h-56 min-w-[calc(12*2.8rem+11*0.3rem)] grid-cols-12 items-end gap-[0.3rem]">{labels.map((label, index) => <div className="grid h-full min-w-0 grid-rows-[auto_minmax(0,1fr)_auto] justify-items-center gap-1" key={label}><div className="text-[0.65rem] font-semibold tabular-nums text-ink-2 dark:text-[#d6e2f5]">₲ {compactMoneyFormat.format(Math.round(values[index] ?? 0))}</div><div className="flex h-full w-full items-end rounded-md bg-navy/5 dark:bg-white/5"><div className="w-full rounded-md bg-sky" style={{ height: `${values[index] ? Math.max((values[index] / max) * 100, 4) : 2}%` }} /></div><Muted>{label}</Muted></div>)}</div></div>;
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

function bytesToBase64(bytes: Uint8Array): string {
  let binary = '';
  const chunkSize = 0x8000;
  for (let offset = 0; offset < bytes.length; offset += chunkSize) binary += String.fromCharCode(...bytes.subarray(offset, offset + chunkSize));
  return btoa(binary);
}
