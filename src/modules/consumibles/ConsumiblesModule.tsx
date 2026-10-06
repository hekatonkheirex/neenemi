import { useEffect, useMemo, useState, type ChangeEvent } from 'react';
import type {
  ConsumablesAggregate,
  ConsumablesAnalytics,
  ConsumablesContractAggregate,
  ConsumablesDispatchEquipmentAggregate,
  ConsumablesEquipmentAggregate,
  ConsumablesImportResult,
  ConsumablesOutputRecord,
  ConsumablesOutputsSummary,
  ConsumablesRecord,
  ConsumablesRecordKind,
  ConsumablesSourceType,
  ConsumablesSourceOperational,
  ConsumablesSummary,
} from './types';
import { PYG_USD_RATE_DATE, usdToPyg } from './analysis';
import { submitImportJob } from '../../core/import-job-client';
import type { OperationalFilters } from '../../core/operational-filters';
import PaginationControls from '../../core/PaginationControls';
import { buildPaginatedUrl, type PaginatedResult } from '../../core/pagination';
import { SOURCE_CATALOG } from '../../core/source-catalog';
import SourceDetails from '../../core/SourceDetails';
import SourceLocationLabel from '../../core/SourceLocationLabel';
import { sourceOperationalValues } from '../../core/source-details';
import type { SourceMetadataBackfillSummary } from '../../core/source-metadata-backfill';
import type { LegacyFleetMetadataType } from '../operaciones/legacy';
import type { ServiceRecord } from '../servicios/types';
import type { IconSvgElement } from '@hugeicons/react';
import AnimatedTabs from '../../core/AnimatedTabs';
import {
  DashboardSquare01Icon,
  Tag01Icon,
  File01Icon,
  Settings02Icon,
  Package01Icon,
  Wrench01Icon,
  Medal01Icon,
  PrinterIcon,
  Database01Icon,
} from '@hugeicons/core-free-icons';
import SourceDataPanel from './SourceDataPanel';
import { outputOperationalDetail } from './output-display';
import {
  CONSUMABLES_BUNDLE_SOURCES,
  type ConsumablesBundleFiles,
  type ConsumablesBundleSourceId,
} from './bundle';
import {
  ConsumablesContractsPanel,
  ConsumablesEquipmentPanel,
  ConsumablesFamilyAnalysisPanel,
  ConsumablesFichasPanel,
  ConsumablesRankingPanel,
  ConsumablesServicePanel,
} from './LegacyAnalysisPanels';
import { readJson, toErrorMessage } from '../../core/http';
import { UploadButton } from '../../core/ActionButtons';
import { cn } from '../../core/cn';
import { PageHeader } from '../../core/ui/page-header';
import { Card, CardHeader, Muted } from '../../core/ui/card';
import { Button } from '../../core/ui/button';
import { Input } from '../../core/ui/input';
import { Badge } from '../../core/ui/badge';
import { StatusLine } from '../../core/ui/status-line';
import { Table, TableBody, TableCell, TableHead, TableHeader, TableRow } from '../../core/ui/table';

const integerFormat = new Intl.NumberFormat('es-PY', { maximumFractionDigits: 0 });

const cardClass = 'min-w-0 grid-cols-1 [overflow-wrap:anywhere]';
const fieldClass = 'grid min-w-0 gap-1.5 text-xs font-semibold text-navy dark:text-white';
const selectClass = 'h-10 w-full min-w-0 rounded-xl border border-navy/20 bg-white px-3 text-sm text-navy focus-visible:outline-2 focus-visible:outline-offset-2 focus-visible:outline-sky disabled:opacity-50 dark:border-sky/30 dark:bg-navy/50 dark:text-white';
const subCardClass = 'min-w-0 rounded-xl border border-navy/10 bg-paper p-4 dark:border-sky/20 dark:bg-navy/30';
const spreadsheetAccept = '.xlsx,application/vnd.openxmlformats-officedocument.spreadsheetml.sheet';

type DirectSource = { kind: ConsumablesSourceType; eyebrow: string; title: string; origin: string; note: string };

// Las cinco fuentes directas del flujo; el texto de cada tarjeta es el mismo que mostraba el diseño anterior.
const directSources: readonly DirectSource[] = [
  { kind: 'consumibles', eyebrow: 'Fuente principal', title: 'Detalle de consumibles', origin: 'Superset > SGS Cliente 360 > Consumibles > Consumibles, Detalles', note: 'Se filtran papel y modelos fuera de las familias analizadas.' },
  { kind: 'repuestos', eyebrow: 'Fuente complementaria', title: 'Detalle de repuestos', origin: 'Superset > SGS Cliente 360 > Repuestos > Repuestos, Detalles', note: 'También puede producir consumibles migrados, como rodillos y cilindros.' },
  { kind: 'uso-repuestos', eyebrow: 'Fuente histórica', title: 'Uso de repuestos', origin: 'Superset > SGS Uso de Repuestos > Consolidados y selectores > Detalle de Repuestos', note: `Totales en PYG; se muestran en guaraníes usando la tasa referencial ${PYG_USD_RATE_DATE}.` },
  { kind: 'salida-consumibles', eyebrow: 'Despachos', title: 'Salida de consumibles', origin: 'SGS > REPORTES > Consumibles > Rango de fechas', note: 'Importa remisiones de tóner, cilindros y rodillos como entregas separadas.' },
  { kind: 'salida-repuestos', eyebrow: 'Despachos', title: 'Salida de repuestos', origin: 'SGS > REPORTES > Consumibles > Rango de fechas', note: 'Rodillos y cilindros se clasifican como consumibles; las demás piezas quedan como repuestos.' },
];

type ImportResponse = ConsumablesImportResult & {
  duplicate: boolean;
  batchId: string;
};

type LegacyConsumablesSourceType = 'fleet.equipment' | LegacyFleetMetadataType | 'services';
type ImportSourceType = ConsumablesSourceType | LegacyConsumablesSourceType;

type LegacySourceImportResponse = {
  duplicate: boolean;
  replaced?: boolean;
  sourceName: string;
  rows?: number;
  accepted?: number;
  customers?: number;
  contracts?: number;
  equipment?: number;
};

type BundleImportResult = LegacySourceImportResponse & {
  sourceId: ConsumablesBundleSourceId;
};

type BundleImportResponse = {
  atomic: boolean;
  results: BundleImportResult[];
};

type BundlePreflightResponse = {
  accepted: boolean;
};

type ClearConsumablesResult = {
  ok: boolean;
  batches: number;
  archivedFiles: number;
};

type ConsumablesQuantitySummary = {
  originalQuantity: number;
  compatibleQuantity: number;
};

type ConsumablesTabId = 'overview' | 'T03' | 'T06' | 'GPR53' | 'contracts' | 'parts' | 'fichas' | 'servicios' | 'ranking' | 'equipment' | 'data';

const consumablesTabs: readonly { id: ConsumablesTabId; label: string; icon: IconSvgElement }[] = [
  { id: 'overview', label: 'Resumen General', icon: DashboardSquare01Icon },
  { id: 'T03', label: 'T03', icon: Tag01Icon },
  { id: 'T06', label: 'T06', icon: Tag01Icon },
  { id: 'GPR53', label: 'GPR-53', icon: Tag01Icon },
  { id: 'contracts', label: 'Impacto en Contratos', icon: File01Icon },
  { id: 'parts', label: 'Repuestos', icon: Settings02Icon },
  { id: 'fichas', label: 'Consumibles vs Repuestos', icon: Package01Icon },
  { id: 'servicios', label: 'Servicios vs Consumibles', icon: Wrench01Icon },
  { id: 'ranking', label: 'Ranking', icon: Medal01Icon },
  { id: 'equipment', label: 'Equipos', icon: PrinterIcon },
  { id: 'data', label: 'Datos', icon: Database01Icon },
];

const legacyConsumablesSources: readonly { type: LegacyConsumablesSourceType; sourceId: string; title: string }[] = [
  { type: 'fleet.equipment', sourceId: 'fleet.equipment', title: 'Equipos en contrato' },
  { type: 'contracts', sourceId: 'fleet.contracts', title: 'Contratos afectados' },
  { type: 'contract-details', sourceId: 'fleet.contract-details', title: 'Detalles de contratos' },
  { type: 'services', sourceId: 'services.lam', title: 'Servicios LAM' },
];

const consumablesSourceLabels: Record<ConsumablesSourceType, string> = {
  consumibles: 'Detalle de consumibles',
  repuestos: 'Detalle de repuestos',
  'uso-repuestos': 'Uso de repuestos',
  'salida-consumibles': 'Salida de consumibles',
  'salida-repuestos': 'Salida de repuestos',
};

export default function ConsumiblesModule() {
  const [summary, setSummary] = useState<ConsumablesSummary | null>(null);
  const [quantitySummary, setQuantitySummary] = useState<ConsumablesQuantitySummary | null>(null);
  const [analytics, setAnalytics] = useState<ConsumablesAnalytics | null>(null);
  const [outputsSummary, setOutputsSummary] = useState<ConsumablesOutputsSummary | null>(null);
  const [outputs, setOutputs] = useState<ConsumablesOutputRecord[]>([]);
  const [records, setRecords] = useState<ConsumablesRecord[]>([]);
  const [serviceRecords, setServiceRecords] = useState<ServiceRecord[]>([]);
  const [recordPageData, setRecordPageData] = useState<PaginatedResult<ConsumablesRecord> | null>(null);
  const [outputPageData, setOutputPageData] = useState<PaginatedResult<ConsumablesOutputRecord> | null>(null);
  const [query, setQuery] = useState('');
  const [debouncedQuery, setDebouncedQuery] = useState('');
  const [kind, setKind] = useState<ConsumablesRecordKind | ''>('');
  const [recordPage, setRecordPage] = useState(1);
  const [recordPageSize, setRecordPageSize] = useState(50);
  const [outputPage, setOutputPage] = useState(1);
  const [outputPageSize, setOutputPageSize] = useState(50);
  const [filters, setFilters] = useState<OperationalFilters>({});
  const [activeTab, setActiveTab] = useState<ConsumablesTabId>('overview');
  const [loading, setLoading] = useState(true);
  const [recordsLoading, setRecordsLoading] = useState(false);
  const [outputsLoading, setOutputsLoading] = useState(false);
  const [analysisLoading, setAnalysisLoading] = useState(false);
  const [importing, setImporting] = useState<ImportSourceType | 'bundle' | null>(null);
  const [bundleFiles, setBundleFiles] = useState<ConsumablesBundleFiles>({});
  const [bundleProgress, setBundleProgress] = useState('');
  const [sourceRefreshKey, setSourceRefreshKey] = useState(0);
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
    setRecordPage(1);
    setOutputPage(1);
  }, [filterQuery, query, kind]);

  const visibleRecords = useMemo(() => {
    const normalizedQuery = query.trim().toLocaleLowerCase();
    return records.filter((record) => {
      if (kind && record.recordKind !== kind) return false;
      if (!normalizedQuery) return true;
      return [record.customerName, record.customerType, record.commercialArea, record.contractReference, record.orderReference, record.contractCommercialArea, record.division, record.modelLabel, record.serialNumber, record.partCode, record.description, formatConsumablesSourceType(record.sourceType), ...sourceOperationalValues(record.sourceOperational), ...record.sourceDetails.flatMap((detail) => [detail.label, detail.value])]
        .join(' ')
        .toLocaleLowerCase()
        .includes(normalizedQuery);
    });
  }, [kind, query, records]);

  useEffect(() => {
    if (activeTab !== 'overview') return;
    const controller = new AbortController();
    setRecordsLoading(true);
    setRecordPageData(null);
    fetch(buildPaginatedUrl('/api/consumables/records', filterQuery, { page: recordPage, pageSize: recordPageSize }, { query: debouncedQuery, kind }), { signal: controller.signal })
      .then((response) => readJson<PaginatedResult<ConsumablesRecord>>(response))
      .then((pageData) => {
        setRecordPageData(pageData);
        if (pageData.page !== recordPage) setRecordPage(pageData.page);
      })
      .catch((requestError: unknown) => {
        if (!controller.signal.aborted) setError(toErrorMessage(requestError));
      })
      .finally(() => {
        if (!controller.signal.aborted) setRecordsLoading(false);
      });
    return () => controller.abort();
  }, [activeTab, dataVersion, debouncedQuery, filterQuery, kind, recordPage, recordPageSize]);

  useEffect(() => {
    if (activeTab !== 'overview' && activeTab !== 'fichas') return;
    const controller = new AbortController();
    setOutputsLoading(true);
    setOutputPageData(null);
    fetch(buildPaginatedUrl('/api/consumables/outputs', filterQuery, { page: outputPage, pageSize: outputPageSize }), { signal: controller.signal })
      .then((response) => readJson<PaginatedResult<ConsumablesOutputRecord>>(response))
      .then((pageData) => {
        setOutputPageData(pageData);
        if (pageData.page !== outputPage) setOutputPage(pageData.page);
      })
      .catch((requestError: unknown) => {
        if (!controller.signal.aborted) setError(toErrorMessage(requestError));
      })
      .finally(() => {
        if (!controller.signal.aborted) setOutputsLoading(false);
      });
    return () => controller.abort();
  }, [activeTab, dataVersion, filterQuery, outputPage, outputPageSize]);

  useEffect(() => {
    const needsRecords = ['T03', 'T06', 'GPR53', 'contracts', 'parts', 'ranking', 'equipment'].includes(activeTab);
    const needsOutputs = activeTab === 'fichas' || activeTab === 'servicios';
    const needsServices = activeTab === 'servicios';
    if (!needsRecords && !needsOutputs && !needsServices) {
      setRecords([]);
      setOutputs([]);
      setServiceRecords([]);
      setAnalysisLoading(false);
      return;
    }

    const controller = new AbortController();
    setAnalysisLoading(true);
    const requests: Promise<unknown>[] = [
      needsRecords
        ? fetch(withQuery('/api/consumables/records', filterQuery, 10000), { signal: controller.signal })
          .then((response) => readJson<ConsumablesRecord[]>(response))
        : Promise.resolve([] as ConsumablesRecord[]),
      needsOutputs
        ? fetch(withQuery('/api/consumables/outputs', filterQuery, 10000), { signal: controller.signal })
          .then((response) => readJson<ConsumablesOutputRecord[]>(response))
        : Promise.resolve([] as ConsumablesOutputRecord[]),
      needsServices
        ? fetch(withQuery('/api/services/records', filterQuery, 10000), { signal: controller.signal })
          .then((response) => readJson<ServiceRecord[]>(response))
        : Promise.resolve([] as ServiceRecord[]),
    ];
    Promise.all(requests)
      .then(([recordRows, outputRows, serviceRows]) => {
        setRecords(recordRows as ConsumablesRecord[]);
        setOutputs(outputRows as ConsumablesOutputRecord[]);
        setServiceRecords(serviceRows as ServiceRecord[]);
      })
      .catch((requestError: unknown) => {
        if (!controller.signal.aborted) setError(toErrorMessage(requestError));
      })
      .finally(() => {
        if (!controller.signal.aborted) setAnalysisLoading(false);
      });
    return () => controller.abort();
  }, [activeTab, dataVersion, filterQuery]);

  async function refresh() {
    setLoading(true);
    setError(null);
    try {
      const [summaryResponse, analyticsResponse, quantitySummaryResponse, outputsSummaryResponse] = await Promise.all([
        fetch(`/api/consumables/summary${filterQuery ? `?${filterQuery}` : ''}`),
        fetch(`/api/consumables/analytics${filterQuery ? `?${filterQuery}` : ''}`),
        fetch(`/api/consumables/quantity-summary${filterQuery ? `?${filterQuery}` : ''}`),
        fetch(`/api/consumables/outputs/summary${filterQuery ? `?${filterQuery}` : ''}`),
      ]);
      setSummary(await readJson<ConsumablesSummary>(summaryResponse));
      setAnalytics(await readJson<ConsumablesAnalytics>(analyticsResponse));
      setQuantitySummary(await readJson<ConsumablesQuantitySummary>(quantitySummaryResponse));
      setOutputsSummary(await readJson<ConsumablesOutputsSummary>(outputsSummaryResponse));
      setDataVersion((version) => version + 1);
    } catch (requestError: unknown) {
      setError(toErrorMessage(requestError));
    } finally {
      setLoading(false);
    }
  }

  async function importFile(sourceType: ConsumablesSourceType, event: ChangeEvent<HTMLInputElement>) {
    const files = event.target.files ? Array.from(event.target.files) : [];
    event.target.value = '';
    if (files.length === 0) return;
    await importConsumablesFiles(sourceType, files);
  }

  async function importConsumablesFiles(sourceType: ConsumablesSourceType, files: readonly File[]) {
    setImporting(sourceType);
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
          const response = await fetch('/api/consumables/import-xlsx', {
            method: 'POST',
            headers: { 'content-type': 'application/json' },
            body: JSON.stringify({ sourceName: file.name, sourceType, contentBase64: bytesToBase64(bytes) }),
          });
          const result = await readJson<ImportResponse>(response);
          messages.push(result.duplicate
            ? `${file.name}: ya estaba importado; no se agregaron nuevas líneas.`
            : `${file.name}: ${result.accepted.toLocaleString('es-PY')} aceptadas, ${result.duplicates.toLocaleString('es-PY')} duplicadas y ${result.skippedNoEquipment.toLocaleString('es-PY')} sin equipo.`);
        } catch (importError: unknown) {
          errors.push(`${file.name}: ${toErrorMessage(importError)}`);
        }
      }
      setSourceRefreshKey((value) => value + 1);
      await refresh();
      if (messages.length > 0) setMessage(messages.join(' · '));
      if (errors.length > 0) setError(errors.join(' '));
    } finally {
      setImporting(null);
    }
  }

  async function importLegacySource(sourceType: LegacyConsumablesSourceType, event: ChangeEvent<HTMLInputElement>) {
    const files = event.target.files ? Array.from(event.target.files) : [];
    event.target.value = '';
    if (files.length === 0) return;
    await importLegacyFiles(sourceType, files);
  }

  async function importLegacyFiles(sourceType: LegacyConsumablesSourceType, files: readonly File[]) {
    setImporting(sourceType);
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
          const endpoint = sourceType === 'services'
            ? '/api/services/import-xlsx'
            : sourceType === 'fleet.equipment'
              ? '/api/operations/import-legacy-portfolio'
              : '/api/operations/import-fleet-metadata';
          const body = {
            sourceName: file.name,
            contentBase64: bytesToBase64(bytes),
            ...(sourceType === 'services' ? { sourceType: 'servicios' } : sourceType === 'fleet.equipment' ? {} : { sourceType }),
          };
          const result = sourceType === 'services'
            ? await readJson<LegacySourceImportResponse>(await fetch(endpoint, {
              method: 'POST',
              headers: { 'content-type': 'application/json' },
              body: JSON.stringify(body),
            }))
            : await submitImportJob<LegacySourceImportResponse>(endpoint, body, (job) => {
              setMessage(`${file.name}: ${job.progress}% · ${job.stage}`);
            });
          messages.push(result.duplicate
            ? `${file.name}: ya estaba importado.`
            : sourceType === 'services'
              ? `${file.name}: ${result.accepted?.toLocaleString('es-PY') ?? 0} servicios aceptados.`
              : sourceType === 'fleet.equipment'
                ? `${file.name}: ${result.customers?.toLocaleString('es-PY') ?? 0} clientes, ${result.contracts?.toLocaleString('es-PY') ?? 0} contratos y ${result.equipment?.toLocaleString('es-PY') ?? 0} equipos.`
                : `${file.name}: ${result.contracts?.toLocaleString('es-PY') ?? 0} contratos y ${result.customers?.toLocaleString('es-PY') ?? 0} clientes relacionados.`);
        } catch (importError: unknown) {
          errors.push(`${file.name}: ${toErrorMessage(importError)}`);
        }
      }
      setSourceRefreshKey((value) => value + 1);
      await refresh();
      if (messages.length > 0) setMessage(messages.join(' · '));
      if (errors.length > 0) setError(errors.join(' '));
    } finally {
      setImporting(null);
    }
  }

  async function importConsumablesBundle(files: Record<ConsumablesBundleSourceId, File>): Promise<void> {
    setImporting('bundle');
    setError(null);
    setMessage('Preparando las nueve fuentes del legado…');
    setBundleProgress('Preparando los archivos seleccionados…');
    const messages: string[] = [];
    const bundleId = createConsumablesBundleId();
    let preflightComplete = false;
    let commitAccepted = false;
    try {
      for (const [index, source] of CONSUMABLES_BUNDLE_SOURCES.entries()) {
        const file = files[source.id];
        if (!file) throw new Error(`Falta la fuente ${source.label}.`);
        if (file.size > 35 * 1024 * 1024) {
          throw new Error(`${file.name}: supera el límite de 35 MB.`);
        }

        setMessage(`Enviando fuente ${index + 1} de 9: ${source.label}…`);
        setBundleProgress(`Enviando archivo ${index + 1} de 9: ${source.label}…`);
        const bytes = new Uint8Array(await file.arrayBuffer());
        const response = await fetch('/api/consumables/bundle-preflight', {
          method: 'POST',
          headers: { 'content-type': 'application/json' },
          body: JSON.stringify({ bundleId, sourceId: source.id, sourceName: file.name, contentBase64: bytesToBase64(bytes) }),
        });
        const staged = await readJson<BundlePreflightResponse>(response);
        if (!staged.accepted) throw new Error(`${file.name}: la API no confirmó la recepción del archivo.`);
      }
      preflightComplete = true;
      setMessage('Validando y aplicando las nueve fuentes…');
      const result = await submitImportJob<BundleImportResponse>(
        '/api/consumables/bundle-commit',
        { bundleId },
        (job) => {
          const progress = `${job.progress}% · ${job.stage}`;
          setBundleProgress(progress);
          setMessage(progress);
        },
        () => { commitAccepted = true; },
      );
      if (!result.atomic) throw new Error('La API no confirmó la aplicación atómica del paquete.');
      for (const source of CONSUMABLES_BUNDLE_SOURCES) {
        const imported = result.results.find((item) => item.sourceId === source.id);
        if (imported) messages.push(formatBundleImportResult(source.label, imported));
      }
      setBundleFiles({});
      setSourceRefreshKey((value) => value + 1);
      await refresh();
      const completionMessage = `Paquete legado completado: ${messages.join(' · ')}`;
      setBundleProgress(completionMessage);
      setMessage(completionMessage);
    } catch (importError: unknown) {
      if (!commitAccepted) await discardConsumablesBundle(bundleId);
      const failureMessage = preflightComplete
        ? `La carga coordinada no se aplicó; la base quedó sin cambios. ${toErrorMessage(importError)}`
        : `La validación del paquete falló; no se aplicó ninguna fuente. ${toErrorMessage(importError)}`;
      setBundleProgress(failureMessage);
      setSourceRefreshKey((value) => value + 1);
      await refresh();
      setError(failureMessage);
    } finally {
      setImporting(null);
    }
  }

  async function reindexStoredSources(): Promise<SourceMetadataBackfillSummary> {
    const response = await fetch('/api/sources/reindex', { method: 'POST' });
    const result = await readJson<SourceMetadataBackfillSummary>(response);
    setSourceRefreshKey((value) => value + 1);
    await refresh();
    return result;
  }

  async function clearConsumablesSources(): Promise<ClearConsumablesResult> {
    const response = await fetch('/api/consumables/imports', { method: 'DELETE' });
    const result = await readJson<ClearConsumablesResult>(response);
    setSourceRefreshKey((value) => value + 1);
    await refresh();
    return result;
  }

  return (
    <div className="page-content operations-page grid min-w-0 grid-cols-1 gap-6 [overflow-wrap:anywhere]">
      <PageHeader
        eyebrow="SERVICIO TÉCNICO / CONSUMIBLES"
        title="Consumo real"
        lead="Carga los detalles XLSX, crúzalos con la base instalada y consulta consumibles y repuestos sobre la misma SQLite de la suite."
        actions={<Button variant="outline" onClick={() => void refresh()} disabled={loading}>{loading ? 'Actualizando…' : 'Actualizar datos'}</Button>}
      />

      <StatusLine state={error ? 'error' : loading ? 'pending' : 'ready'}>{error || message || (summary?.records ? `${integerFormat.format(summary.records)} líneas normalizadas` : 'Importa un XLSX de detalle para comenzar.')}</StatusLine>

      <Card className={cardClass} aria-label="Filtros globales del análisis">
        <div className="grid min-w-0 grid-cols-[repeat(auto-fit,minmax(min(100%,11rem),1fr))] items-end gap-4">
          <label className={fieldClass}>Sector<select className={selectClass} value={filters.sector ?? ''} onChange={(event) => updateFilter(setFilters, 'sector', event.target.value)}><option value="">Todos</option><option value="Publico">Público</option><option value="Privado">Privado</option></select></label>
          <label className={fieldClass}>Departamento<select className={selectClass} value={filters.department ?? ''} onChange={(event) => updateFilter(setFilters, 'department', event.target.value)}><option value="">Todos</option><option value="Strategic">Strategic</option><option value="Commercial">Commercial</option></select></label>
          <label className={fieldClass}>Tipo de contrato<select className={selectClass} value={filters.contractType ?? ''} onChange={(event) => updateFilter(setFilters, 'contractType', event.target.value)}><option value="">Todos</option><option value="Alquiler">Alquiler</option><option value="Leasing">Leasing</option><option value="Mantenimiento">Mantenimiento</option></select></label>
          <label className={fieldClass}>Desde<Input type="month" value={filters.dateFrom ?? ''} onChange={(event) => updateFilter(setFilters, 'dateFrom', event.target.value)} /></label>
          <label className={fieldClass}>Hasta<Input type="month" value={filters.dateTo ?? ''} onChange={(event) => updateFilter(setFilters, 'dateTo', event.target.value)} /></label>
          <Button variant="outline" onClick={() => setFilters({})} disabled={Object.values(filters).every((value) => !value)}>Limpiar filtros</Button>
        </div>
      </Card>

      <section className="grid min-w-0 grid-cols-1 gap-3 sm:grid-cols-3" aria-label="Resumen de consumibles">
        <SummaryStat value={integerFormat.format(summary?.records ?? 0)} label="líneas normalizadas" accent />
        <SummaryStat value={formatPyg(summary?.totalCostUsd ?? 0)} label="costo acumulado" />
        <SummaryStat value={integerFormat.format(summary?.equipment ?? 0)} label="equipos con consumo" />
      </section>

      <AnimatedTabs ariaLabel="Vistas de Consumibles" tabs={consumablesTabs} active={activeTab} onChange={setActiveTab} />

      {activeTab === 'data' ? <SourceDataPanel
        importing={importing !== null}
        bundleImporting={importing === 'bundle'}
        bundleFiles={bundleFiles}
        bundleProgress={bundleProgress}
        onBundleFilesChange={(files) => { setBundleFiles(files); setBundleProgress(''); }}
        refreshKey={sourceRefreshKey}
        onImportBundle={(files) => void importConsumablesBundle(files)}
        onReindexSources={reindexStoredSources}
        onClearConsumables={clearConsumablesSources}
      /> : null}

      {activeTab === 'overview' ? <>
        {analytics ? <ConsumablesAnalyticsPanel analytics={analytics} summary={summary} quantitySummary={quantitySummary} /> : null}
        {outputsSummary ? <ConsumablesOutputsPanel
          summary={outputsSummary}
          records={outputPageData?.items ?? []}
          loading={outputsLoading}
          pageData={outputPageData}
          requestError={error}
          onPageChange={setOutputPage}
          onPageSizeChange={(size) => { setOutputPageSize(size); setOutputPage(1); }}
        /> : null}

        {/* Bajo 1500 px la columna lateral de importaciones baja bajo la tabla. */}
        <section className="grid min-w-0 items-start gap-4 min-[1500px]:grid-cols-[minmax(0,1fr)_22rem]">
          <Card className={cardClass}>
            <CardHeader eyebrow="Registros normalizados" title="Consumibles y repuestos" aside={<Badge>{summary?.firstMonth && summary.lastMonth ? `${summary.firstMonth} → ${summary.lastMonth}` : 'Sin período'}</Badge>} />
            <div className="grid min-w-0 grid-cols-[repeat(auto-fit,minmax(min(100%,14rem),1fr))] items-end gap-4">
              <label className={fieldClass}>Buscar<Input value={query} onChange={(event) => setQuery(event.target.value)} placeholder="Cliente, serie, código o dato de origen…" /></label>
              <label className={fieldClass}>Tipo de registro<select className={selectClass} value={kind} onChange={(event) => setKind(event.target.value as ConsumablesRecordKind | '')}><option value="">Todos</option><option value="consumable">Consumibles</option><option value="part">Repuestos</option></select></label>
            </div>
            <Table className="min-w-[56rem] [overflow-wrap:normal]">
              <TableHeader><TableRow><TableHead>Fecha</TableHead><TableHead>Cliente / equipo</TableHead><TableHead>Serie</TableHead><TableHead>Parte</TableHead><TableHead>Tipo</TableHead><TableHead className="text-right">Cantidad</TableHead><TableHead className="text-right">Costo PYG</TableHead></TableRow></TableHeader>
              <TableBody>
                {(recordPageData?.items ?? []).map((record) => <TableRow key={record.id}>
                  <TableCell className="min-w-[9rem]">
                    <div className="whitespace-nowrap">{record.recordedAt || record.month || 'Sin fecha'}</div>
                    <SourceLocationLabel fileName={record.sourceFileName} sheetName={record.sourceSheetName} rowNumber={record.sourceRowNumber} />
                    {record.sourceType ? <Muted className="mt-0.5">{formatConsumablesSourceType(record.sourceType)}</Muted> : null}
                    {formatConsumablesOperationalSummary(record.sourceOperational).map((detail) => <Muted className="mt-0.5" key={`operational-date-${detail}`}>{detail}</Muted>)}
                    <SourceDetails details={record.sourceDetails} />
                  </TableCell>
                  <TableCell className="min-w-[14rem]">
                    <div className="font-mono text-xs font-semibold text-navy dark:text-white">{record.modelLabel}</div>
                    <Muted className="mt-0.5">{record.customerName}{formatContractLabel(record.contractReference, record.orderReference)}</Muted>
                    {formatContractDetails(record.contractReference, record.orderReference, record.division, record.contractCommercialArea).map((detail) => <Muted className="mt-0.5" key={detail}>{detail}</Muted>)}
                    {formatCustomerClassification(record.customerType, record.commercialArea) ? <Muted className="mt-0.5">{formatCustomerClassification(record.customerType, record.commercialArea)}</Muted> : null}
                    {record.sourceCustomerName || record.sourceOrderReference ? <Muted className="mt-0.5">Origen: {record.sourceCustomerName || 'sin cliente'}{record.sourceOrderReference ? ` · OV ${record.sourceOrderReference}` : ''}</Muted> : null}
                    {formatConsumablesOperationalNarrative(record.sourceOperational).map((detail) => <Muted className="mt-0.5" key={`operational-client-${detail}`}>{detail}</Muted>)}
                  </TableCell>
                  <TableCell className="whitespace-nowrap">{record.serialNumber}</TableCell>
                  <TableCell className="min-w-[10rem]">
                    <div className="font-mono text-xs font-semibold text-navy dark:text-white">{record.partCode}</div>
                    <Muted className="mt-0.5">{record.description || 'Sin descripción'}</Muted>
                    {record.sourceUnitPricePyg !== null || record.sourceTotalPyg !== null ? <Muted className="mt-0.5">Origen: {record.sourceUnitPricePyg !== null ? `₲ ${integerFormat.format(record.sourceUnitPricePyg)} unit.` : ''}{record.sourceTotalPyg !== null ? ` · ₲ ${integerFormat.format(record.sourceTotalPyg)} total` : ''}</Muted> : null}
                  </TableCell>
                  <TableCell><Badge className="whitespace-nowrap" tone={record.recordKind === 'consumable' ? 'success' : 'warning'}>{record.recordKind === 'consumable' ? 'Consumible' : 'Repuesto'}</Badge><Muted className="mt-1">{record.family} · {record.classification}</Muted></TableCell>
                  <TableCell className="text-right tabular-nums">{numberFormat(record.quantity)}</TableCell>
                  <TableCell className="whitespace-nowrap text-right font-semibold tabular-nums">{formatPyg(record.costUsd)}</TableCell>
                </TableRow>)}
                {(recordPageData?.items.length ?? 0) === 0 && <TableRow><TableCell colSpan={7} className="py-8 text-center">{recordsLoading || (recordPageData === null && loading) ? 'Cargando registros…' : error && recordPageData === null ? 'No se pudieron cargar los registros.' : recordPageData?.total || summary?.records ? 'No hay registros para el filtro seleccionado.' : 'Importa un detalle XLSX para ver datos aquí.'}</TableCell></TableRow>}
              </TableBody>
            </Table>
            {recordPageData ? <PaginationControls
              label="Paginación de consumibles y repuestos"
              page={recordPageData.page}
              pageSize={recordPageData.pageSize}
              total={recordPageData.total}
              disabled={recordsLoading}
              onPageChange={setRecordPage}
              onPageSizeChange={(size) => { setRecordPageSize(size); setRecordPage(1); }}
            /> : null}
          </Card>

          <aside className="grid min-w-0 gap-4">
            {directSources.map((source) => (
              <Card className={cardClass} key={source.kind}>
                <CardHeader eyebrow={source.eyebrow} title={source.title} />
                <Muted className="text-sm leading-relaxed">Origen: <code>{source.origin}</code>. {source.note}</Muted>
                <div><UploadButton busy={importing === source.kind} label="Seleccionar XLSX" accept={spreadsheetAccept} multiple onChange={(event) => void importFile(source.kind, event)} disabled={importing !== null} /></div>
              </Card>
            ))}

            <Card className={cardClass}>
              <CardHeader eyebrow="Fuentes relacionadas" title="Completar base del legado" />
              <Muted className="text-sm leading-relaxed">El análisis original dependía también de estos exports. Cárgalos desde la ubicación indicada para que los cruces no dependan de una cartera ya preparada.</Muted>
              <div className="grid gap-3">
                {legacyConsumablesSources.map((source) => {
                  const definition = SOURCE_CATALOG.find((item) => item.id === source.sourceId);
                  return (
                    <div className={cn(subCardClass, 'grid gap-2 p-3')} key={source.type}>
                      <div className="flex flex-wrap items-baseline justify-between gap-2"><div className="font-bold text-navy dark:text-white">{source.title}</div><Muted>{definition?.expectedFiles[0] ?? 'Archivo XLSX'}</Muted></div>
                      <Muted>{definition?.origin}</Muted>
                      <div><UploadButton busy={importing === source.type} label="Seleccionar XLSX" accept={spreadsheetAccept} multiple onChange={(event) => void importLegacySource(source.type, event)} disabled={importing !== null} /></div>
                    </div>
                  );
                })}
              </div>
            </Card>

            <Card className={cardClass}>
              <CardHeader eyebrow="Reglas de cruce" title="Una fuente común" />
              <dl className="m-0 grid gap-2">
                <MethodFact label="Equipos" value="Se busca por número de serie" />
                <MethodFact label="Contratos" value="Alquiler · Leasing · Mantenimiento" />
                <MethodFact label="Deduplicación" value="Código + serie + fecha" />
              </dl>
            </Card>
          </aside>
        </section>
      </> : null}

      {activeTab !== 'overview' && activeTab !== 'data' ? analysisLoading
        ? <Card className={cardClass} role="status">Cargando los datos necesarios para esta vista…</Card>
        : analytics ? <ConsumablesLegacyTab
            activeTab={activeTab}
            analytics={analytics}
            outputs={outputs}
            outputsSummary={outputsSummary}
            outputPageData={outputPageData}
            outputsLoading={outputsLoading}
            outputPage={outputPage}
            outputPageSize={outputPageSize}
            requestError={error}
            onOutputPageChange={setOutputPage}
            onOutputPageSizeChange={(size) => { setOutputPageSize(size); setOutputPage(1); }}
            records={visibleRecords}
            serviceRecords={serviceRecords}
            query={query}
          /> : null : null}
    </div>
  );
}

function SummaryStat({ value, label, accent = false }: { value: string; label: string; accent?: boolean }) {
  // El monto en guaraníes puede tener 13 dígitos: el tamaño sigue el ancho de la ficha y no parte la cifra.
  return <Card className={cn('@container min-w-0 gap-1 p-4', accent && 'border-l-4 border-l-brand')}><div className="whitespace-nowrap text-[clamp(1.1rem,10cqw,1.875rem)] font-bold tabular-nums text-navy dark:text-white">{value}</div><Muted>{label}</Muted></Card>;
}

function MethodFact({ label, value }: { label: string; value: string }) {
  return <div className={cn(subCardClass, 'grid gap-0.5 p-3')}><dt className="text-xs text-ink-2 dark:text-[#9fb2d1]">{label}</dt><dd className="m-0 text-sm font-semibold text-navy dark:text-white">{value}</dd></div>;
}

function ConsumablesLegacyTab({
  activeTab,
  analytics,
  outputs,
  outputsSummary,
  outputPageData,
  outputsLoading,
  outputPage,
  outputPageSize,
  requestError,
  onOutputPageChange,
  onOutputPageSizeChange,
  records,
  serviceRecords,
  query,
}: {
  activeTab: Exclude<ConsumablesTabId, 'overview' | 'data'>;
  analytics: ConsumablesAnalytics;
  outputs: ConsumablesOutputRecord[];
  outputsSummary: ConsumablesOutputsSummary | null;
  outputPageData: PaginatedResult<ConsumablesOutputRecord> | null;
  outputsLoading: boolean;
  outputPage: number;
  outputPageSize: number;
  requestError: string | null;
  onOutputPageChange: (page: number) => void;
  onOutputPageSizeChange: (pageSize: number) => void;
  records: ConsumablesRecord[];
  serviceRecords: ServiceRecord[];
  query: string;
}) {
  if (activeTab === 'T03' || activeTab === 'T06' || activeTab === 'GPR53') {
    const familyRecords = records.filter((record) => record.family === activeTab && record.recordKind === 'consumable');
    return (
      <div className="consumables-tab-content">
        <ConsumablesFamilyAnalysisPanel family={activeTab} records={familyRecords} />
        <ConsumablesCodeTable title={`Detalle por código · ${activeTab === 'GPR53' ? 'GPR-53' : activeTab}`} records={familyRecords} />
        <ConsumablesRecordTable title={`Registros ${activeTab === 'GPR53' ? 'GPR-53' : activeTab}`} records={familyRecords} query={query} />
      </div>
    );
  }

  if (activeTab === 'contracts') {
    return (
      <div className="consumables-tab-content">
        <ConsumablesContractsPanel records={records} />
      </div>
    );
  }

  if (activeTab === 'parts') {
    const partRecords = records.filter((record) => record.recordKind === 'part');
    const originalRecords = partRecords.filter((record) => record.classification === 'original');
    const compatibleRecords = partRecords.filter((record) => record.classification === 'compatible');
    const originalQuantity = originalRecords.reduce((total, record) => total + record.quantity, 0);
    const compatibleQuantity = compatibleRecords.reduce((total, record) => total + record.quantity, 0);
    const originalCost = originalRecords.reduce((total, record) => total + record.costUsd, 0);
    const compatibleCost = compatibleRecords.reduce((total, record) => total + record.costUsd, 0);
    return (
      <div className="consumables-tab-content">
        <section className="summary-grid consumables-detail-summary" aria-label="Resumen de repuestos">
          <div className="summary-card"><span className="summary-value">{numberFormat(partRecords.length)}</span><span className="summary-label">líneas de repuestos</span></div>
          <div className="summary-card"><span className="summary-value">{numberFormat(originalQuantity)}</span><span className="summary-label">unidades originales</span><small className="summary-card-note">{formatPyg(originalCost)}</small></div>
          <div className="summary-card"><span className="summary-value">{numberFormat(compatibleQuantity)}</span><span className="summary-label">unidades compatibles</span><small className="summary-card-note">{formatPyg(compatibleCost)}</small></div>
          <div className="summary-card"><span className="summary-value">{formatPyg(originalCost + compatibleCost)}</span><span className="summary-label">costo acumulado</span></div>
          <div className="summary-card"><span className="summary-value">{compatibleQuantity > 0 ? formatPyg(compatibleCost / compatibleQuantity) : '₲ 0'}</span><span className="summary-label">precio prom. compatible</span></div>
          <div className="summary-card"><span className="summary-value">{originalQuantity + compatibleQuantity > 0 ? `${Math.round((compatibleQuantity / (originalQuantity + compatibleQuantity)) * 100)}%` : '0%'}</span><span className="summary-label">proporción compatible</span></div>
        </section>
        <section className="sales-card">
          <div className="card-heading"><div><div className="eyebrow">REPUESTOS</div><h2>Repuestos normalizados</h2></div><span className="muted-note">Piezas que no fueron clasificadas como consumibles</span></div>
          <AggregateList rows={analytics.categories.filter((row) => partRecords.some((record) => record.category === row.key))} />
        </section>
        <ConsumablesCodeTable title="Detalle por código" records={partRecords} />
        <ConsumablesRecordTable title="Detalle de repuestos" records={partRecords} query={query} />
      </div>
    );
  }

  if (activeTab === 'fichas') {
    return (
      <div className="consumables-tab-content">
        {outputsSummary ? <ConsumablesOutputsPanel
          summary={outputsSummary}
          records={outputPageData?.items ?? []}
          loading={outputsLoading}
          pageData={outputPageData}
          requestError={requestError}
          onPageChange={onOutputPageChange}
          onPageSizeChange={onOutputPageSizeChange}
        /> : null}
        <ConsumablesFichasPanel outputs={outputs} />
      </div>
    );
  }

  if (activeTab === 'servicios') {
    return <ConsumablesServicePanel serviceRecords={serviceRecords} outputs={outputs} query={query} />;
  }

  if (activeTab === 'ranking') {
    return <ConsumablesRankingPanel records={records} query={query} />;
  }

  return <ConsumablesEquipmentPanel records={records} query={query} />;
}

type RecordSortKey = 'date' | 'model' | 'serial' | 'part' | 'kind' | 'quantity' | 'cost';
type SortDirection = 'asc' | 'desc';

function ConsumablesCodeTable({ title, records }: { title: string; records: ConsumablesRecord[] }) {
  const rows = useMemo(() => {
    const byCode = new Map<string, { code: string; description: string; classification: string; category: string; quantity: number; costUsd: number; records: number }>();
    for (const record of records) {
      const current = byCode.get(record.partCode) ?? {
        code: record.partCode,
        description: record.description,
        classification: record.classification,
        category: record.category,
        quantity: 0,
        costUsd: 0,
        records: 0,
      };
      current.quantity += record.quantity;
      current.costUsd += record.costUsd;
      current.records += 1;
      if (current.description === '' && record.description) current.description = record.description;
      if (current.classification !== record.classification) current.classification = 'mixto';
      byCode.set(record.partCode, current);
    }
    return [...byCode.values()].sort((left, right) => right.costUsd - left.costUsd || right.quantity - left.quantity || left.code.localeCompare(right.code));
  }, [records]);

  return (
    <section className="sales-card">
      <div className="card-heading"><div><div className="eyebrow">CÓDIGOS AGRUPADOS</div><h2>{title}</h2></div><span className="muted-note">{numberFormat(rows.length)} códigos · ordenados por costo</span></div>
      <div className="catalog-table-wrap">
        <table className="catalog-table consumables-code-table">
          <thead><tr><th>Código</th><th>Descripción</th><th>Tipo</th><th>Categoría</th><th className="align-right">Líneas</th><th className="align-right">Unidades</th><th className="align-right">Costo PYG</th><th className="align-right">Precio prom.</th></tr></thead>
          <tbody>
            {rows.map((row) => <tr key={row.code}>
              <td><span className="code-cell">{row.code}</span></td>
              <td>{row.description || 'Sin descripción'}</td>
              <td><span className={`badge ${row.classification === 'original' ? 'ok' : 'warning'}`}>{row.classification === 'original' ? 'Original' : row.classification === 'compatible' ? 'Compatible' : 'Mixto'}</span></td>
              <td>{row.category}</td>
              <td className="align-right">{numberFormat(row.records)}</td>
              <td className="align-right">{numberFormat(row.quantity)}</td>
              <td className="align-right price-cell">{formatPyg(row.costUsd)}</td>
              <td className="align-right">{formatPyg(row.costUsd / Math.max(row.quantity, 1))}</td>
            </tr>)}
            {rows.length === 0 ? <tr><td colSpan={8} className="empty-cell">No hay registros para esta familia.</td></tr> : null}
          </tbody>
        </table>
      </div>
    </section>
  );
}

function ConsumablesRecordTable({ title, records, query }: { title: string; records: ConsumablesRecord[]; query: string }) {
  const [sortKey, setSortKey] = useState<RecordSortKey>('date');
  const [sortDirection, setSortDirection] = useState<SortDirection>('desc');
  const sorters: Record<RecordSortKey, (record: ConsumablesRecord) => string | number> = {
    date: (record) => record.recordedAt || record.month,
    model: (record) => record.modelLabel,
    serial: (record) => record.serialNumber,
    part: (record) => record.partCode,
    kind: (record) => record.recordKind,
    quantity: (record) => record.quantity,
    cost: (record) => record.costUsd,
  };
  const sortedRecords = useMemo(() => sortRows(records, sorters[sortKey], sortDirection), [records, sortDirection, sortKey]);
  const changeSort = (nextKey: RecordSortKey) => {
    if (nextKey === sortKey) setSortDirection((value) => value === 'asc' ? 'desc' : 'asc');
    else {
      setSortKey(nextKey);
      setSortDirection(nextKey === 'date' ? 'desc' : 'asc');
    }
  };

  return (
    <section className="sales-card">
      <div className="card-heading"><div><div className="eyebrow">DATOS NORMALIZADOS</div><h2>{title}</h2></div><span className="muted-note">{query ? `Filtro: ${query}` : `${numberFormat(records.length)} filas visibles`}</span></div>
      <div className="catalog-table-wrap">
        <table className="catalog-table consumables-table">
          <thead><tr>
            <SortableHeader label="Fecha" active={sortKey === 'date'} direction={sortDirection} onClick={() => changeSort('date')} />
            <SortableHeader label="Cliente / equipo" active={sortKey === 'model'} direction={sortDirection} onClick={() => changeSort('model')} />
            <SortableHeader label="Serie" active={sortKey === 'serial'} direction={sortDirection} onClick={() => changeSort('serial')} />
            <SortableHeader label="Parte" active={sortKey === 'part'} direction={sortDirection} onClick={() => changeSort('part')} />
            <SortableHeader label="Tipo" active={sortKey === 'kind'} direction={sortDirection} onClick={() => changeSort('kind')} />
            <SortableHeader label="Cantidad" active={sortKey === 'quantity'} direction={sortDirection} onClick={() => changeSort('quantity')} alignRight />
            <SortableHeader label="Costo PYG" active={sortKey === 'cost'} direction={sortDirection} onClick={() => changeSort('cost')} alignRight />
          </tr></thead>
          <tbody>
            {sortedRecords.map((record) => <tr key={record.id}>
              <td>{record.recordedAt || record.month || 'Sin fecha'}<SourceLocationLabel fileName={record.sourceFileName} sheetName={record.sourceSheetName} rowNumber={record.sourceRowNumber} />{record.sourceType ? <small className="table-secondary-text">{formatConsumablesSourceType(record.sourceType)}</small> : null}{formatConsumablesOperationalSummary(record.sourceOperational).map((detail) => <small className="table-secondary-text" key={detail}>{detail}</small>)}<SourceDetails details={record.sourceDetails} /></td>
              <td><span className="code-cell">{record.modelLabel}</span><small className="table-secondary-text">{record.customerName}{formatContractLabel(record.contractReference, record.orderReference)}</small>{formatContractDetails(record.contractReference, record.orderReference, record.division, record.contractCommercialArea).map((detail) => <small className="table-secondary-text" key={detail}>{detail}</small>)}{formatCustomerClassification(record.customerType, record.commercialArea) ? <small className="table-secondary-text">{formatCustomerClassification(record.customerType, record.commercialArea)}</small> : null}{formatConsumablesOperationalNarrative(record.sourceOperational).map((detail) => <small className="table-secondary-text" key={detail}>{detail}</small>)}</td>
              <td>{record.serialNumber}</td>
              <td><span className="code-cell">{record.partCode}</span><small className="table-secondary-text">{record.description || 'Sin descripción'}</small></td>
              <td><span className={`badge ${record.recordKind === 'consumable' ? 'ok' : 'warning'}`}>{record.recordKind === 'consumable' ? 'Consumible' : 'Repuesto'}</span><small className="table-secondary-text">{record.family} · {record.classification}</small></td>
              <td className="align-right">{numberFormat(record.quantity)}</td>
              <td className="align-right price-cell">{formatPyg(record.costUsd)}</td>
            </tr>)}
            {records.length === 0 ? <tr><td colSpan={7} className="empty-cell">No hay registros para esta vista.</td></tr> : null}
          </tbody>
        </table>
      </div>
    </section>
  );
}

function SortableHeader({ label, active, direction, onClick, alignRight = false }: { label: string; active: boolean; direction: SortDirection; onClick: () => void; alignRight?: boolean }) {
  return <th className={`${alignRight ? 'align-right ' : ''}sortable-th`} aria-sort={active ? direction === 'asc' ? 'ascending' : 'descending' : 'none'}><button type="button" onClick={onClick}>{label}<span aria-hidden="true">{active ? direction === 'asc' ? ' ↑' : ' ↓' : ''}</span></button></th>;
}

function formatConsumablesOperationalSummary(operational?: ConsumablesSourceOperational): string[] {
  if (!operational) return [];
  return [
    operational.cabId ? `Id. CAB: ${operational.cabId}` : '',
    operational.dispatchNumber ? `Salida ${operational.dispatchNumber}` : '',
    operational.serviceReportNumber ? `I.S. ${operational.serviceReportNumber}` : '',
    operational.technician ? `Técnico: ${operational.technician}` : '',
    operational.branch ? `Sucursal: ${operational.branch}` : '',
  ].filter(Boolean);
}

function formatConsumablesOperationalNarrative(operational?: ConsumablesSourceOperational): string[] {
  if (!operational) return [];
  const contractDates = [operational.contractStartsAt, operational.contractEndsAt].filter(Boolean).join(' → ');
  return [
    operational.division ? `División fuente: ${operational.division}` : '',
    operational.dataReference ? `Ref. DATA: ${operational.dataReference}` : '',
    operational.sourceSector ? `Sector fuente: ${operational.sourceSector}` : '',
    operational.sourceCommercialArea ? `Área comercial fuente: ${operational.sourceCommercialArea}` : '',
    operational.sourceContractReference ? `Ref. contrato fuente: ${operational.sourceContractReference}` : '',
    operational.contractType ? `Contrato fuente: ${operational.contractType}` : '',
    operational.active ? `Vigente fuente: ${operational.active}` : '',
    contractDates ? `Vigencia fuente: ${contractDates}` : '',
    operational.taskCompleted ? `Tarea: ${operational.taskCompleted}` : '',
    operational.partsUsed ? `Repuestos usados: ${operational.partsUsed}` : '',
  ].filter(Boolean);
}

function sortRows<T>(rows: readonly T[], getValue: (row: T) => string | number, direction: SortDirection): T[] {
  return [...rows].sort((left, right) => {
    const leftValue = getValue(left);
    const rightValue = getValue(right);
    const comparison = typeof leftValue === 'number' && typeof rightValue === 'number'
      ? leftValue - rightValue
      : String(leftValue).localeCompare(String(rightValue), 'es', { numeric: true, sensitivity: 'base' });
    return direction === 'asc' ? comparison : -comparison;
  });
}

function ConsumablesOutputsPanel({
  summary,
  records,
  loading,
  pageData,
  requestError,
  onPageChange,
  onPageSizeChange,
}: {
  summary: ConsumablesOutputsSummary;
  records: ConsumablesOutputRecord[];
  loading: boolean;
  pageData: PaginatedResult<ConsumablesOutputRecord> | null;
  requestError: string | null;
  onPageChange: (page: number) => void;
  onPageSizeChange: (pageSize: number) => void;
}) {
  return (
    <section className="sales-card consumables-outputs-panel" aria-label="Salidas de consumibles y repuestos">
      <div className="card-heading">
        <div><div className="eyebrow">DESPACHOS NORMALIZADOS</div><h2>Salidas registradas</h2></div>
        <span className="muted-note">{summary.firstMonth && summary.lastMonth ? `${summary.firstMonth} → ${summary.lastMonth}` : 'Sin período'}</span>
      </div>
      <div className="output-summary-grid">
        <div><strong>{integerFormat.format(summary.records)}</strong><span>líneas despachadas</span></div>
        <div><strong>{integerFormat.format(summary.totalQuantity)}</strong><span>unidades</span></div>
        <div><strong>{integerFormat.format(summary.equipment)}</strong><span>equipos asociados</span></div>
        <div><strong>{integerFormat.format(summary.consumables)} / {integerFormat.format(summary.parts)}</strong><span>consumibles / repuestos</span></div>
      </div>
      <div className="catalog-table-wrap">
        <table className="catalog-table consumables-table outputs-table">
          <thead><tr><th>Fecha</th><th>Documento</th><th>Cliente / equipo</th><th>Parte</th><th>Tipo</th><th className="align-right">Cantidad</th><th className="align-right">Rendimiento</th></tr></thead>
          <tbody>
            {records.map((record) => <tr key={record.id}>
              <td>{record.recordedAt || record.month || 'Sin fecha'}<SourceLocationLabel fileName={record.sourceFileName} sheetName={record.sourceSheetName} rowNumber={record.sourceRowNumber} />{record.sourceType ? <small className="table-secondary-text">{formatConsumablesSourceType(record.sourceType)}</small> : null}<SourceDetails details={record.sourceDetails} /></td>
              <td>#{record.documentNumber}{record.serviceReportNumber > 0 ? <small className="table-secondary-text">Inf. {record.serviceReportNumber}</small> : null}{record.recordKind === 'part' ? <small className="table-secondary-text">{outputOperationalDetail(record, 'sourceContract', ['Contrato (fuente)', 'Contrato']) || 'Contrato de origen sin informar'}</small> : null}</td>
              <td><span className="code-cell">{record.modelLabel}</span><small className="table-secondary-text">{record.customerName}{formatContractLabel(record.contractReference, record.orderReference)}{record.sourceCustomerName && record.sourceCustomerName !== record.customerName ? ` · fuente: ${record.sourceCustomerName}` : ''}</small>{formatContractDetails(record.contractReference, record.orderReference, record.division, record.contractCommercialArea).map((detail) => <small className="table-secondary-text" key={detail}>{detail}</small>)}{formatCustomerClassification(record.customerType, record.commercialArea) ? <small className="table-secondary-text">{formatCustomerClassification(record.customerType, record.commercialArea)}</small> : null}{formatOutputSourceClassification(record).map((detail) => <small className="table-secondary-text" key={detail}>{detail}</small>)}{outputOperationalDetail(record, 'observations', ['Observaciones']) ? <small className="table-secondary-text">Obs.: {outputOperationalDetail(record, 'observations', ['Observaciones'])}</small> : null}{outputOperationalDetail(record, 'contact', ['Contacto']) ? <small className="table-secondary-text">Contacto: {outputOperationalDetail(record, 'contact', ['Contacto'])}</small> : null}</td>
              <td><span className="code-cell">{record.partCode || 'Sin código'}</span><small className="table-secondary-text">{record.description || 'Sin descripción'}</small>{record.sourceOperational?.yieldPerUnit ? <small className="table-secondary-text">Rend. unit.: {record.sourceOperational.yieldPerUnit}</small> : null}{record.sourceUnitPricePyg !== null || record.sourceTotalPyg !== null ? <small className="table-secondary-text">{record.sourceUnitPricePyg !== null ? `₲ ${integerFormat.format(record.sourceUnitPricePyg)} unit.` : ''}{record.sourceTotalPyg !== null ? ` · ₲ ${integerFormat.format(record.sourceTotalPyg)} total` : ''}</small> : null}</td>
              <td><span className={`badge ${record.recordKind === 'consumable' ? 'ok' : 'warning'}`}>{record.recordKind === 'consumable' ? 'Consumible' : 'Repuesto'}</span><small className="table-secondary-text">{record.family}{record.technician ? ` · ${record.technician}` : ''}</small></td>
              <td className="align-right">{numberFormat(record.quantity)}</td>
              <td className="align-right">{record.yieldPages ? numberFormat(record.yieldPages) : '—'}</td>
            </tr>)}
            {records.length === 0 && <tr><td colSpan={7} className="empty-cell">{loading ? 'Cargando salidas…' : requestError && pageData === null ? 'No se pudieron cargar las salidas.' : summary.records ? 'No hay salidas para los filtros seleccionados.' : 'Importa una salida de consumibles o repuestos para ver los despachos.'}</td></tr>}
          </tbody>
        </table>
      </div>
      {pageData ? <PaginationControls
        label="Paginación de salidas"
        page={pageData.page}
        pageSize={pageData.pageSize}
        total={pageData.total}
        disabled={loading}
        onPageChange={onPageChange}
        onPageSizeChange={onPageSizeChange}
      /> : null}
    </section>
  );
}

function ConsumablesAnalyticsPanel({ analytics, summary, quantitySummary }: {
  analytics: ConsumablesAnalytics;
  summary: ConsumablesSummary | null;
  quantitySummary: ConsumablesQuantitySummary | null;
}) {
  const monthly = analytics.monthly.length > 12 ? analytics.monthly.slice(-12) : analytics.monthly;
  const originalQuantity = quantitySummary?.originalQuantity ?? 0;
  const compatibleQuantity = quantitySummary?.compatibleQuantity ?? 0;
  const compatibleShare = originalQuantity + compatibleQuantity > 0 ? Math.round((compatibleQuantity / (originalQuantity + compatibleQuantity)) * 100) : 0;

  return (
    <>
      <section className="summary-grid legacy-summary" aria-label="Indicadores del resumen de consumibles">
        <div className="summary-card"><span className="summary-value">{integerFormat.format(summary?.consumables ?? 0)}</span><span className="summary-label">líneas de consumibles</span></div>
        <div className="summary-card"><span className="summary-value">{integerFormat.format(summary?.parts ?? 0)}</span><span className="summary-label">líneas de repuestos</span></div>
        <div className="summary-card"><span className="summary-value">{formatPyg(summary?.totalCostUsd ?? 0)}</span><span className="summary-label">costo acumulado</span></div>
        <div className="summary-card"><span className="summary-value">{integerFormat.format(summary?.equipment ?? 0)}</span><span className="summary-label">equipos con registros</span></div>
        <div className="summary-card"><span className="summary-value">{integerFormat.format(originalQuantity)}</span><span className="summary-label">unidades originales</span></div>
        <div className="summary-card"><span className="summary-value">{compatibleShare}%</span><span className="summary-label">proporción compatible</span></div>
      </section>
      <section className="consumables-analytics-grid" aria-label="Analítica agregada de consumibles">
      <section className="sales-card analytics-panel">
        <div className="card-heading">
          <div><div className="eyebrow">EVOLUCIÓN</div><h2>Costo por mes</h2></div>
          <span className="muted-note">{monthly.length} meses visibles</span>
        </div>
        <MonthlyAggregateList rows={monthly} />
      </section>

      <section className="sales-card analytics-panel">
        <div className="card-heading">
          <div><h2>Por familia</h2><span className="muted-note">Costo y volumen normalizado</span></div>
        </div>
        <AggregateList rows={analytics.families} />
      </section>

      <section className="sales-card analytics-panel">
        <div className="card-heading">
          <div><h2>Por categoría</h2><span className="muted-note">Consumibles migrados y repuestos</span></div>
        </div>
        <AggregateList rows={analytics.categories} />
      </section>

      <section className="sales-card analytics-panel">
        <div className="card-heading">
          <div><h2>Equipos con mayor costo</h2><span className="muted-note">Ordenado por costo acumulado</span></div>
        </div>
        <EquipmentAggregateList rows={analytics.topEquipment} />
      </section>

      <section className="sales-card analytics-panel contract-analytics-panel">
        <div className="card-heading">
          <div><h2>Impacto por contrato</h2><span className="muted-note">Costo de consumibles y repuestos enlazado a la cartera</span></div>
        </div>
        <ContractAggregateList rows={analytics.contracts} />
      </section>

      <section className="sales-card analytics-panel dispatch-equipment-panel">
        <div className="card-heading">
          <div><h2>Fichas por equipo</h2><span className="muted-note">Relación entre salidas de consumibles y repuestos por número de serie</span></div>
          <span className="muted-note">Hasta 100 equipos más activos</span>
        </div>
        <DispatchEquipmentTable rows={analytics.dispatchEquipment} />
      </section>
      </section>
    </>
  );
}

function MonthlyAggregateList({ rows }: { rows: ConsumablesAggregate[] }) {
  if (rows.length === 0) return <p className="analytics-empty">Todavía no hay meses con registros aceptados.</p>;
  const maxCost = Math.max(...rows.map((row) => row.costUsd), 0);

  return (
    <div className="analytics-bars">
      {rows.map((row) => <div className="analytics-bar-row" key={row.key}>
        <div className="analytics-row-top"><span>{row.label}</span><strong>{formatPyg(row.costUsd)}</strong></div>
        <div className="analytics-bar-track" aria-hidden="true"><span style={{ width: barWidth(row.costUsd, maxCost) }} /></div>
        <small>{numberFormat(row.quantity)} unidades · {numberFormat(row.records)} líneas · {numberFormat(row.equipment)} equipos</small>
      </div>)}
    </div>
  );
}

function AggregateList({ rows }: { rows: ConsumablesAggregate[] }) {
  if (rows.length === 0) return <p className="analytics-empty">Sin datos suficientes para agrupar.</p>;
  const maxCost = Math.max(...rows.map((row) => row.costUsd), 0);

  return (
    <div className="analytics-bars">
      {rows.map((row) => <div className="analytics-bar-row" key={row.key}>
        <div className="analytics-row-top"><span>{row.label || 'Sin categoría'}</span><strong>{formatPyg(row.costUsd)}</strong></div>
        <div className="analytics-bar-track" aria-hidden="true"><span style={{ width: barWidth(row.costUsd, maxCost) }} /></div>
        <small>{numberFormat(row.records)} líneas · {numberFormat(row.quantity)} unidades · {numberFormat(row.originalRecords)} originales · {numberFormat(row.compatibleRecords)} compatibles</small>
      </div>)}
    </div>
  );
}

function EquipmentAggregateList({ rows }: { rows: ConsumablesEquipmentAggregate[] }) {
  if (rows.length === 0) return <p className="analytics-empty">Importa un detalle asociado a un equipo para ver el ranking.</p>;

  return (
    <div className="analytics-equipment-list">
      {rows.map((row, index) => <div className="analytics-equipment-row" key={row.equipmentId}>
        <span className="analytics-rank">{String(index + 1).padStart(2, '0')}</span>
        <div className="analytics-equipment-name"><strong>{row.modelLabel}</strong><small>{row.customerName} · {row.serialNumber}</small></div>
        <div className="analytics-equipment-value"><strong>{formatPyg(row.costUsd)}</strong><small>{numberFormat(row.records)} líneas</small></div>
      </div>)}
    </div>
  );
}

function ContractAggregateList({ rows }: { rows: ConsumablesContractAggregate[] }) {
  if (rows.length === 0) return <p className="analytics-empty">Importa un detalle asociado a contratos para ver este cruce.</p>;

  return (
    <div className="catalog-table-wrap contract-analytics-table-wrap">
      <table className="catalog-table contract-analytics-table">
        <thead><tr><th>Contrato / cliente</th><th>Tipo</th><th className="align-right">Equipos</th><th className="align-right">Consumibles</th><th className="align-right">Repuestos</th><th className="align-right">Total</th></tr></thead>
        <tbody>
          {rows.map((row) => <tr key={row.key}>
            <td><span className="code-cell">{row.reference}</span>{formatContractDetails(row.reference, row.orderReference, row.division, row.contractCommercialArea).map((detail) => <small className="table-secondary-text" key={detail}>{detail}</small>)}<small className="table-secondary-text">{row.customerName}</small></td>
            <td>{row.contractType}</td>
            <td className="align-right">{integerFormat.format(row.equipment)}</td>
            <td className="align-right">{formatPyg(row.consumableCostUsd)}<small className="table-secondary-text">{integerFormat.format(row.consumableRecords)} líneas</small></td>
            <td className="align-right">{formatPyg(row.partCostUsd)}<small className="table-secondary-text">{integerFormat.format(row.partRecords)} líneas</small></td>
            <td className="align-right price-cell">{formatPyg(row.costUsd)}<small className="table-secondary-text">{integerFormat.format(row.records)} líneas</small></td>
          </tr>)}
        </tbody>
      </table>
    </div>
  );
}

function DispatchEquipmentTable({ rows }: { rows: ConsumablesDispatchEquipmentAggregate[] }) {
  if (rows.length === 0) return <p className="analytics-empty">Importa salidas de consumibles o repuestos para construir las fichas por equipo.</p>;

  return (
    <div className="catalog-table-wrap dispatch-equipment-table-wrap">
      <table className="catalog-table dispatch-equipment-table">
        <thead><tr><th>Equipo / cliente</th><th>Serie</th><th>Contrato</th><th className="align-right">Consumibles</th><th className="align-right">Repuestos</th><th className="align-right">Ratio</th><th>Última salida</th></tr></thead>
        <tbody>
          {rows.map((row) => <tr key={row.key}>
            <td><span className="code-cell">{row.modelLabel}</span><small className="table-secondary-text">{row.customerName}</small></td>
            <td><span className="code-cell">{row.serialNumber}</span></td>
            <td><span className="code-cell">{row.contractReference || 'Sin referencia'}</span>{formatContractDetails(row.contractReference, row.orderReference, row.division, row.contractCommercialArea).map((detail) => <small className="table-secondary-text" key={detail}>{detail}</small>)}<small className="table-secondary-text">{row.contractType}</small></td>
            <td className="align-right">{numberFormat(row.consumableRecords)} líneas<small className="table-secondary-text">{numberFormat(row.consumableQuantity)} unidades · {numberFormat(row.originalRecords)} orig. / {numberFormat(row.compatibleRecords)} comp.</small></td>
            <td className="align-right">{numberFormat(row.partRecords)} líneas<small className="table-secondary-text">{numberFormat(row.partQuantity)} unidades</small></td>
            <td className="align-right">{row.partRecords > 0 ? `${(row.consumableRecords / row.partRecords).toFixed(1)}x` : '—'}</td>
            <td>{row.lastRecordedAt || 'Sin fecha'}</td>
          </tr>)}
        </tbody>
      </table>
    </div>
  );
}

function barWidth(value: number, maximum: number): string {
  if (maximum <= 0) return '0%';
  return `${Math.max(4, Math.round((value / maximum) * 100))}%`;
}

function formatPyg(valueUsd: number): string {
  return `₲ ${integerFormat.format(usdToPyg(valueUsd))}`;
}

function numberFormat(value: number): string {
  return integerFormat.format(value);
}

function formatContractLabel(contractReference: string, orderReference: string): string {
  if (orderReference) return ` · OV ${orderReference}`;
  return contractReference ? ` · Contrato ${contractReference}` : '';
}

function formatContractDetails(contractReference: string, orderReference: string, division: string, commercialArea = ''): string[] {
  return [
    contractReference && orderReference && contractReference !== orderReference ? `Contrato: ${contractReference}` : '',
    commercialArea ? `Área contrato: ${commercialArea}` : '',
    division ? `División: ${division}` : '',
  ].filter(Boolean);
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

function createConsumablesBundleId(): string {
  if (typeof crypto !== 'undefined' && typeof crypto.randomUUID === 'function') return crypto.randomUUID();
  return `bundle-${Date.now()}-${Math.random().toString(36).slice(2)}`;
}

async function discardConsumablesBundle(bundleId: string): Promise<void> {
  try {
    await fetch(`/api/consumables/bundle/${encodeURIComponent(bundleId)}`, { method: 'DELETE' });
  } catch {
    // La limpieza es oportunista; el servidor vuelve a validar el paquete antes de aplicarlo.
  }
}

function formatBundleImportResult(sourceLabel: string, result: BundleImportResult): string {
  if (result.duplicate) return `${sourceLabel}: ya estaba importada.`;
  if (result.sourceId === 'fleet.equipment') {
    return `${sourceLabel}: ${result.customers?.toLocaleString('es-PY') ?? 0} clientes, ${result.contracts?.toLocaleString('es-PY') ?? 0} contratos y ${result.equipment?.toLocaleString('es-PY') ?? 0} equipos.`;
  }
  if (result.sourceId === 'fleet.contracts' || result.sourceId === 'fleet.contract-details') {
    return `${sourceLabel}: ${result.contracts?.toLocaleString('es-PY') ?? 0} contratos y ${result.customers?.toLocaleString('es-PY') ?? 0} clientes relacionados.`;
  }
  return `${sourceLabel}: ${result.accepted?.toLocaleString('es-PY') ?? 0} registros aceptados${result.replaced ? ' y versión anterior reemplazada' : ''}.`;
}

function formatCustomerClassification(customerType?: string, commercialArea?: string): string {
  const type = customerType === 'Publico' ? 'Público' : customerType;
  return [type ? `Sector: ${type}` : '', commercialArea ? `Área: ${commercialArea}` : ''].filter(Boolean).join(' · ');
}

function formatConsumablesSourceType(sourceType: ConsumablesSourceType | null): string {
  return sourceType ? `Fuente: ${consumablesSourceLabels[sourceType]}` : '';
}

function formatOutputSourceClassification(record: ConsumablesOutputRecord): string[] {
  const sector = outputOperationalDetail(record, 'sourceSector', ['Sector (fuente)', 'Sector']);
  const commercialArea = outputOperationalDetail(record, 'sourceCommercialArea', ['Área comercial (fuente)', 'Área comercial', 'Área']);
  return [
    sector ? `Sector fuente: ${sector}` : '',
    commercialArea ? `Área comercial fuente: ${commercialArea}` : '',
  ].filter(Boolean);
}

function bytesToBase64(bytes: Uint8Array): string {
  let binary = '';
  const chunkSize = 0x8000;
  for (let offset = 0; offset < bytes.length; offset += chunkSize) {
    binary += String.fromCharCode(...bytes.subarray(offset, offset + chunkSize));
  }
  return btoa(binary);
}
