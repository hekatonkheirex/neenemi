import { useEffect, useMemo, useState, type ChangeEvent, type ReactNode } from 'react';
import { formatSourceLocation } from '../../core/source-location';
import AnimatedTabs from '../../core/AnimatedTabs';
import {
  Clock01Icon,
  Wrench01Icon,
} from '@hugeicons/core-free-icons';
import SourceDetails from '../../core/SourceDetails';
import { sourceOperationalValues } from '../../core/source-details';
import type { OperationalFilters } from '../../core/operational-filters';
import PaginationControls from '../../core/PaginationControls';
import { buildPaginatedUrl, type PaginatedResult } from '../../core/pagination';
import type { ConsumablesOutputRecord } from '../consumibles/types';
import { ConsumablesServicePanel } from '../consumibles/LegacyAnalysisPanels';
import type { ServiceImportResult, ServiceRecord, ServiceSourceOperational, ServiceSummary } from './types';

const integerFormat = new Intl.NumberFormat('es-PY', { maximumFractionDigits: 0 });

type ImportResponse = ServiceImportResult & {
  duplicate: boolean;
  batchId: string;
};

export default function ServiciosModule() {
  const [summary, setSummary] = useState<ServiceSummary | null>(null);
  const [records, setRecords] = useState<ServiceRecord[]>([]);
  const [outputs, setOutputs] = useState<ConsumablesOutputRecord[]>([]);
  const [pageData, setPageData] = useState<PaginatedResult<ServiceRecord> | null>(null);
  const [query, setQuery] = useState('');
  const [debouncedQuery, setDebouncedQuery] = useState('');
  const [taskType, setTaskType] = useState('');
  const [page, setPage] = useState(1);
  const [pageSize, setPageSize] = useState(50);
  const [filters, setFilters] = useState<OperationalFilters>({});
  const [activeView, setActiveView] = useState<'history' | 'relation'>('history');
  const [loading, setLoading] = useState(true);
  const [pageLoading, setPageLoading] = useState(false);
  const [relationLoading, setRelationLoading] = useState(false);
  const [relationError, setRelationError] = useState<string | null>(null);
  const [importing, setImporting] = useState(false);
  const [message, setMessage] = useState('');
  const [error, setError] = useState<string | null>(null);
  const [dataVersion, setDataVersion] = useState(0);

  const filterQuery = useMemo(() => toFilterQuery(filters), [filters]);

  useEffect(() => {
    void refresh();
  }, [filterQuery]);

  useEffect(() => {
    const timer = window.setTimeout(() => setDebouncedQuery(query.trim()), 250);
    return () => window.clearTimeout(timer);
  }, [query]);

  useEffect(() => {
    setPage(1);
  }, [filterQuery, query, taskType]);

  const visibleRecords = useMemo(() => {
    const normalizedQuery = query.trim().toLocaleLowerCase();
    return (pageData?.items ?? []).filter((record) => {
      if (taskType && record.taskType !== taskType) return false;
      if (!normalizedQuery) return true;
      return [
        record.customerName,
        record.customerType,
        record.commercialArea,
        record.sourceCustomerName,
        record.modelLabel,
        record.serialNumber,
        record.orderReference,
        record.serviceType,
        record.taskType,
        record.technician,
        record.taskCompleted,
        record.partsUsed,
        ...sourceOperationalValues(record.sourceOperational),
        ...record.sourceDetails.flatMap((detail) => [detail.label, detail.value]),
      ]
        .join(' ')
        .toLocaleLowerCase()
        .includes(normalizedQuery);
    });
  }, [pageData, query, taskType]);

  async function refresh() {
    setLoading(true);
    setError(null);
    try {
      const summaryResponse = await fetch(`/api/services/summary${filterQuery ? `?${filterQuery}` : ''}`);
      setSummary(await readJson<ServiceSummary>(summaryResponse));
      setDataVersion((version) => version + 1);
    } catch (requestError: unknown) {
      setError(toErrorMessage(requestError));
    } finally {
      setLoading(false);
    }
  }

  useEffect(() => {
    if (activeView !== 'history') return;
    const controller = new AbortController();
    setPageLoading(true);
    setPageData(null);
    fetch(buildPaginatedUrl('/api/services/records', filterQuery, { page, pageSize }, { query: debouncedQuery, taskType }), { signal: controller.signal })
      .then((response) => readJson<PaginatedResult<ServiceRecord>>(response))
      .then((nextPage) => {
        setPageData(nextPage);
        if (nextPage.page !== page) setPage(nextPage.page);
      })
      .catch((requestError: unknown) => {
        if (!controller.signal.aborted) setError(toErrorMessage(requestError));
      })
      .finally(() => {
        if (!controller.signal.aborted) setPageLoading(false);
      });
    return () => controller.abort();
  }, [activeView, dataVersion, debouncedQuery, filterQuery, page, pageSize, taskType]);

  useEffect(() => {
    if (activeView !== 'relation') {
      setRecords([]);
      setOutputs([]);
      setRelationLoading(false);
      setRelationError(null);
      return;
    }
    const controller = new AbortController();
    const outputQuery = new URLSearchParams(filterQuery);
    outputQuery.set('kind', 'consumable');
    outputQuery.set('limit', '10000');
    setRelationLoading(true);
    setRelationError(null);
    Promise.all([
      fetch(withQuery('/api/services/records', filterQuery, 10000), { signal: controller.signal }).then((response) => readJson<ServiceRecord[]>(response)),
      fetch(`/api/consumables/outputs?${outputQuery.toString()}`, { signal: controller.signal }).then((response) => readJson<ConsumablesOutputRecord[]>(response)),
    ])
      .then(([serviceRows, outputRows]) => {
        setRecords(serviceRows);
        setOutputs(outputRows);
      })
      .catch((requestError: unknown) => {
        if (!controller.signal.aborted) setRelationError(toErrorMessage(requestError));
      })
      .finally(() => {
        if (!controller.signal.aborted) setRelationLoading(false);
      });
    return () => controller.abort();
  }, [activeView, dataVersion, filterQuery]);

  async function importFiles(event: ChangeEvent<HTMLInputElement>) {
    const files = event.target.files ? Array.from(event.target.files) : [];
    event.target.value = '';
    if (files.length === 0) return;

    setImporting(true);
    setError(null);
    const messages: string[] = [];
    const errors: string[] = [];
    try {
      for (const file of files) {
        if (file.size > 35 * 1024 * 1024) {
          errors.push(`${file.name}: supera el límite de 35 MB.`);
          continue;
        }
        try {
          const bytes = new Uint8Array(await file.arrayBuffer());
          const response = await fetch('/api/services/import-xlsx', {
            method: 'POST',
            headers: { 'content-type': 'application/json' },
            body: JSON.stringify({
              sourceName: file.name,
              sourceType: 'servicios',
              contentBase64: bytesToBase64(bytes),
            }),
          });
          const result = await readJson<ImportResponse>(response);
          messages.push(result.duplicate
            ? `${file.name}: ya estaba importado.`
            : `${file.name}: ${integerFormat.format(result.accepted)} servicios aceptados, ${integerFormat.format(result.duplicates)} duplicados y ${integerFormat.format(result.skippedNoEquipment)} sin equipo instalado.`);
        } catch (importError: unknown) {
          errors.push(`${file.name}: ${toErrorMessage(importError)}`);
        }
      }
      await refresh();
      if (messages.length > 0) setMessage(messages.join(' · '));
      if (errors.length > 0) setError(errors.join(' '));
    } catch (importError: unknown) {
      setError(toErrorMessage(importError));
    } finally {
      setImporting(false);
    }
  }

  return (
    <div className="page-content operations-page">
      <section className="catalog-header">
        <div>
          <div className="eyebrow">OPERACIONES / SERVICIOS</div>
          <h1>Servicios técnicos</h1>
          <p className="lead">Carga el detalle LAM, relaciónalo con la base instalada y consulta el historial de intervenciones sobre la misma SQLite.</p>
        </div>
        <button className="secondary-button" type="button" onClick={() => void refresh()} disabled={loading}>{loading ? 'Actualizando…' : 'Actualizar datos'}</button>
      </section>

      <section className="sales-status" aria-live="polite">
        <span className={`status-dot ${error ? 'error' : loading ? 'pending' : 'ready'}`} />
        <span>{error || message || (summary?.records ? `${integerFormat.format(summary.records)} servicios normalizados` : 'Importa Servicios LAM.xlsx para comenzar.')}</span>
      </section>

      <AnimatedTabs
        ariaLabel="Vistas de Servicios técnicos"
        active={activeView}
        onChange={setActiveView}
        tabs={[{ id: 'history', label: 'Historial LAM', icon: Clock01Icon }, { id: 'relation', label: 'Servicios vs consumibles', icon: Wrench01Icon }]}
      />

      <section className="consumables-filter-bar" aria-label="Filtros globales de servicios">
        <label className="compact-field"><span>Sector</span><select value={filters.sector ?? ''} onChange={(event) => updateFilter(setFilters, 'sector', event.target.value)}><option value="">Todos</option><option value="Publico">Público</option><option value="Privado">Privado</option></select></label>
        <label className="compact-field"><span>Departamento</span><select value={filters.department ?? ''} onChange={(event) => updateFilter(setFilters, 'department', event.target.value)}><option value="">Todos</option><option value="Strategic">Strategic</option><option value="Commercial">Commercial</option></select></label>
        <label className="compact-field"><span>Tipo de contrato</span><select value={filters.contractType ?? ''} onChange={(event) => updateFilter(setFilters, 'contractType', event.target.value)}><option value="">Todos</option><option value="Alquiler">Alquiler</option><option value="Leasing">Leasing</option><option value="Mantenimiento">Mantenimiento</option></select></label>
        <label className="compact-field"><span>Desde</span><input type="month" value={filters.dateFrom ?? ''} onChange={(event) => updateFilter(setFilters, 'dateFrom', event.target.value)} /></label>
        <label className="compact-field"><span>Hasta</span><input type="month" value={filters.dateTo ?? ''} onChange={(event) => updateFilter(setFilters, 'dateTo', event.target.value)} /></label>
        <button className="secondary-button" type="button" onClick={() => setFilters({})} disabled={Object.values(filters).every((value) => !value)}>Limpiar filtros</button>
      </section>

      <section className="summary-grid operations-summary" aria-label="Resumen de servicios">
        <div className="summary-card accent"><span className="summary-value">{integerFormat.format(summary?.records ?? 0)}</span><span className="summary-label">servicios normalizados</span></div>
        <div className="summary-card"><span className="summary-value">{integerFormat.format(summary?.equipment ?? 0)}</span><span className="summary-label">equipos atendidos</span></div>
        <div className="summary-card"><span className="summary-value">{integerFormat.format(summary?.taskTypes.length ?? 0)}</span><span className="summary-label">tipos de tarea</span></div>
      </section>

      {activeView === 'relation' ? relationLoading
        ? <section className="sales-card pagination-loading" role="status">Cargando cruces de servicios y consumibles…</section>
        : relationError ? <section className="sales-card pagination-loading" role="alert">{relationError}</section>
        : <ConsumablesServicePanel serviceRecords={records} outputs={outputs} query={query} /> : <section className="service-layout">
        <section className="sales-card service-table-card">
          <div className="card-heading">
            <div><div className="eyebrow">HISTORIAL NORMALIZADO</div><h2>Intervenciones</h2></div>
            <span className="muted-note">{summary?.firstMonth && summary.lastMonth ? `${summary.firstMonth} → ${summary.lastMonth}` : 'Sin período'}</span>
          </div>
          <div className="service-controls">
            <label className="search-field"><span>Buscar</span><input value={query} onChange={(event) => setQuery(event.target.value)} placeholder="Cliente, serie, técnico o dato de origen…" /></label>
            <label className="compact-field"><span>Tipo de tarea</span><select value={taskType} onChange={(event) => setTaskType(event.target.value)}><option value="">Todas</option>{summary?.taskTypes.map((item) => <option value={item.key} key={item.key}>{item.key} ({item.records})</option>)}</select></label>
          </div>
          <div className="catalog-table-wrap">
            <table className="catalog-table service-table">
              <thead><tr><th>Fecha</th><th>Servicio / OV</th><th>Cliente / equipo</th><th>Tipo de tarea</th><th>Técnico</th><th>Tarea realizada</th><th>Repuestos utilizados</th></tr></thead>
              <tbody>
                {visibleRecords.map((record) => <tr key={record.id}>
                  <td>{record.recordedAt || record.month || 'Sin fecha'}<small className="table-secondary-text">{formatSourceLocation(record.sourceFileName, record.sourceSheetName, record.sourceRowNumber)}</small>{sourceOperationalLine(record.sourceOperational, 'finishedAt', 'Fin')}<SourceDetails details={record.sourceDetails} /></td>
                  <td><span className="code-cell">{record.serviceNumber ? `IS ${record.serviceNumber}` : 'IS sin número'}</span><small className="table-secondary-text">{record.orderReference || 'Sin OV'}</small>{sourceOperationalLine(record.sourceOperational, 'division', 'División')}{sourceOperationalLine(record.sourceOperational, 'receptionType', 'Recepción')}</td>
                  <td><span className="code-cell">{record.modelLabel}</span><small className="table-secondary-text">{record.customerName} · {record.serialNumber}</small>{formatCustomerClassification(record.customerType, record.commercialArea) ? <small className="table-secondary-text">{formatCustomerClassification(record.customerType, record.commercialArea)}</small> : null}{sourceOperationalLine(record.sourceOperational, 'customerCity', 'Ciudad cliente')}{sourceOperationalLine(record.sourceOperational, 'branchCity', 'Ciudad sucursal')}</td>
                  <td><span className="badge ok">{record.taskType || 'Sin especificar'}</span><small className="table-secondary-text">{record.serviceType || 'Servicio sin tipo'}</small>{sourceOperationalLine(record.sourceOperational, 'status', 'Estado')}{sourceOperationalLine(record.sourceOperational, 'closed', 'Cierre')}{sourceOperationalLine(record.sourceOperational, 'responseCompliance', 'Respuesta')}{sourceOperationalLine(record.sourceOperational, 'serviceCompliance', 'Servicio')}</td>
                  <td>{record.technician || 'Sin técnico'}{sourceOperationalLine(record.sourceOperational, 'branch', 'Sucursal')}{sourceOperationalLine(record.sourceOperational, 'previousTechnician', 'Técnico anterior')}</td>
                  <td>{record.taskCompleted || 'Sin detalle'}{sourceOperationalLine(record.sourceOperational, 'requestedService', 'Solicitado')}{sourceOperationalLine(record.sourceOperational, 'workTime', 'H. trab.')}</td>
                  <td>{record.partsUsed || '—'}{sourceOperationalLine(record.sourceOperational, 'counters', 'Contadores')}{sourceOperationalLine(record.sourceOperational, 'papers', 'Papeles')}{sourceOperationalLine(record.sourceOperational, 'rework', 'Retrabajo')}</td>
                </tr>)}
                {visibleRecords.length === 0 && <tr><td colSpan={7} className="empty-cell">{pageLoading || (pageData === null && loading) ? 'Cargando intervenciones…' : error && pageData === null ? 'No se pudieron cargar las intervenciones.' : pageData?.total || summary?.records ? 'No hay servicios para el filtro seleccionado.' : 'Importa Servicios LAM.xlsx para ver las intervenciones.'}</td></tr>}
              </tbody>
            </table>
          </div>
          {pageData ? <PaginationControls
            label="Paginación de servicios"
            page={pageData.page}
            pageSize={pageData.pageSize}
            total={pageData.total}
            disabled={pageLoading}
            onPageChange={setPage}
            onPageSizeChange={(size) => { setPageSize(size); setPage(1); }}
          /> : null}
        </section>

        <aside className="operations-sidebar">
          <section className="sales-card form-card">
            <div className="eyebrow">FUENTE HISTÓRICA</div>
            <h2>Servicios LAM</h2>
            <p className="form-hint import-description">Acepta exportaciones con columnas agregadas o desplazadas: el parser busca los campos por encabezado y usa índices antiguos como respaldo.</p>
            <label className="file-input-button"><span>{importing ? 'Importando…' : 'Seleccionar XLSX'}</span><input type="file" accept=".xlsx,application/vnd.openxmlformats-officedocument.spreadsheetml.sheet" multiple onChange={(event) => void importFiles(event)} disabled={importing} /></label>
          </section>

          <section className="sales-card form-card service-method-card">
            <div className="eyebrow">REGLAS DE CRUCE</div>
            <h2>Historial verificable</h2>
            <div className="mps-facts"><div><span>Identidad</span><strong>Se busca por número de serie</strong></div><div><span>Contrato</span><strong>Solo cartera vigente</strong></div><div><span>Duplicación</span><strong>IS o combinación técnica</strong></div></div>
          </section>
        </aside>
      </section>}
    </div>
  );
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
  return value instanceof Error ? value.message : 'No se pudo completar la operación.';
}

function formatCustomerClassification(customerType?: string, commercialArea?: string): string {
  const type = customerType === 'Publico' ? 'Público' : customerType;
  return [type ? `Sector: ${type}` : '', commercialArea ? `Área: ${commercialArea}` : ''].filter(Boolean).join(' · ');
}

function sourceOperationalLine(
  operational: ServiceSourceOperational | undefined,
  key: keyof ServiceSourceOperational,
  label: string,
): ReactNode {
  const value = operational?.[key];
  return value ? <small className="table-secondary-text">{label}: {value}</small> : null;
}

function bytesToBase64(bytes: Uint8Array): string {
  let binary = '';
  const chunkSize = 0x8000;
  for (let offset = 0; offset < bytes.length; offset += chunkSize) {
    binary += String.fromCharCode(...bytes.subarray(offset, offset + chunkSize));
  }
  return btoa(binary);
}

function updateFilter(
  setFilters: (value: OperationalFilters | ((current: OperationalFilters) => OperationalFilters)) => void,
  key: keyof OperationalFilters,
  value: string,
): void {
  setFilters((current) => {
    const next = { ...current, [key]: value || undefined };
    if (key === 'dateFrom' && next.dateTo && value > next.dateTo) next.dateTo = value;
    if (key === 'dateTo' && next.dateFrom && value < next.dateFrom) next.dateFrom = value;
    return next;
  });
}

function toFilterQuery(filters: OperationalFilters): string {
  const params = new URLSearchParams();
  const entries: Array<[keyof OperationalFilters, string | undefined]> = [
    ['sector', filters.sector],
    ['department', filters.department],
    ['contractType', filters.contractType],
    ['dateFrom', filters.dateFrom],
    ['dateTo', filters.dateTo],
  ];
  for (const [key, value] of entries) {
    if (value) params.set(key, value);
  }
  return params.toString();
}

function withQuery(path: string, filterQuery: string, limit: number): string {
  const params = new URLSearchParams(filterQuery);
  params.set('limit', String(limit));
  return `${path}?${params.toString()}`;
}
