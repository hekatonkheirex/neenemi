import { Check, Package, TriangleAlert, Upload } from 'lucide-react';
import { useEffect, useMemo, useState, useTransition } from 'react';
import type { ChangeEvent } from 'react';
import AnimatedTabs from '../../core/AnimatedTabs';
import { exportCustomerPortfolio, exportOperationsWorkbook } from './export';
import { submitImportJob, type ImportJobSnapshot } from '../../core/import-job-client';
import { SOURCE_CATALOG, isEquipmentDetailExport, latestBatch, sourceMatchesDefinition } from '../../core/source-catalog';
import SourceDetails from '../../core/SourceDetails';
import LegacySourceDataPanel from './LegacySourceDataPanel';
import { createModelSupportLookup } from './matching';
import { customerMatchesSearch } from './search';
import { parseDescontinuadorUrl, serializeDescontinuadorUrl, type DescontinuadorView } from './descontinuador-url';
import type {
  CommercialArea,
  ContractRecord,
  ContractType,
  CustomerRecord,
  CustomerType,
  DiscontinuationOverviewSnapshot,
  ModelDiscontinuationRecord,
  WaldbottStockRecord,
} from './repository';
import { confirmAction } from '../../core/confirm';
import { readJson, toErrorMessage } from '../../core/http';
import PaginationControls from '../../core/PaginationControls';
import { usePagedList } from '../../core/usePagedList';
import { UploadButton, ExportButton } from '../../core/ActionButtons';
import { cn } from '../../core/cn';
import { PageHeader } from '../../core/ui/page-header';
import { Card, CardHeader, Eyebrow, Muted } from '../../core/ui/card';
import { formatLoadedAt } from '../../core/loaded-at';
import { Button } from '../../core/ui/button';
import { Input } from '../../core/ui/input';
import { Badge, type BadgeTone } from '../../core/ui/badge';
import { StatusLine } from '../../core/ui/status-line';
import { Table, TableBody, TableCell, TableHead, TableHeader, TableRow } from '../../core/ui/table';

const numberFormat = new Intl.NumberFormat('es-PY', { maximumFractionDigits: 0 });
const customerTypes: readonly CustomerType[] = ['Publico', 'Privado'];
const commercialAreas: readonly CommercialArea[] = ['Strategic', 'Commercial'];
const contractTypes: readonly ContractType[] = ['Alquiler', 'Abierto', 'Mantenimiento', 'Leasing'];
const contractTypeFill: Record<ContractType, string> = {
  Alquiler: 'bg-brand',
  Abierto: 'bg-[#4a8d72]',
  Mantenimiento: 'bg-sky',
  Leasing: 'bg-[#6b5acd]',
};
const cardClass = 'min-w-0 grid-cols-1 [overflow-wrap:anywhere]';
const fieldClass = 'grid min-w-0 gap-1.5 text-xs font-semibold text-navy dark:text-white';
const subCardClass = 'min-w-0 rounded-xl border border-navy/10 bg-paper p-4 dark:border-sky/20 dark:bg-navy/30';
const customerPageSize = 50;

type ImportBatchSummary = {
  id: string;
  domain: string;
  sourceName: string;
  sourceType: string | null;
  status: 'staged' | 'applied' | 'failed';
  createdAt: string;
  files: number;
  rawRows: number;
  rawSheets: number;
};

type ImportProgress = {
  currentFile: number;
  totalFiles: number;
  sourceName: string;
  progress: number;
  stage: string;
};

type DiscontinuedModelSummary = {
  modelLabel: string;
  equipmentCount: number;
  endsAt: string | null;
};

const discontinuationSourceCards = [
  {
    sourceId: 'fleet.equipment',
    title: 'Cargar datos Superset (Equipos en contrato)',
    actionLabel: 'Importar cartera XLSX',
    multiple: true,
  },
  {
    sourceId: 'fleet.customer-classification',
    title: 'Cargar datos Superset (Clasificación de clientes)',
    expectedFile: 'Detalle de Equipos con Contrato.xlsx',
    notice: 'Este archivo proviene de otro módulo: se carga en Analítica de consumibles (Equipos en contrato).',
    actionLabel: 'Importar clasificación',
    multiple: true,
  },
  {
    sourceId: 'discontinuation.canon',
    title: 'Cargar información de Canon (Modelos discontinuados)',
    actionLabel: 'Importar listas Canon',
    multiple: true,
  },
  {
    sourceId: 'discontinuation.waldbott',
    title: 'Cargar stock Waldbott',
    actionLabel: 'Importar stock Waldbott',
    multiple: true,
  },
] as const;

function DiscontinuationSourceCard({
  sourceId,
  title,
  expectedFile,
  notice,
  actionLabel,
  multiple,
  busy,
  disabled,
  loadedBatches,
  loadingBatches,
  sourceBatchesError,
  onChange,
}: {
  sourceId: string;
  title: string;
  expectedFile?: string;
  notice?: string;
  actionLabel: string;
  multiple: boolean;
  busy: boolean;
  disabled: boolean;
  loadedBatches: readonly ImportBatchSummary[];
  loadingBatches: boolean;
  sourceBatchesError: boolean;
  onChange: (event: ChangeEvent<HTMLInputElement>) => void;
}) {
  const source = SOURCE_CATALOG.find((item) => item.id === sourceId);
  if (!source) return null;

  return (
    <article className={cn(subCardClass, 'grid content-start gap-3')}>
      <div className="text-sm font-bold text-navy dark:text-white">{title}</div>
      <dl className="m-0 grid gap-2.5 text-sm">
        <SourceFact label="Archivo esperado"><span className="font-bold text-navy dark:text-white">{expectedFile ?? source.expectedFiles.join(' · ')}</span></SourceFact>
        <SourceFact label="Origen">{source.origin}</SourceFact>
        {notice ? <div role="note" className="flex items-start gap-1.5 rounded-md border border-status-warn/40 bg-status-warn/10 px-2.5 py-2 text-xs font-semibold text-status-warn-ink dark:text-status-warn-ink-dark"><TriangleAlert className="mt-px shrink-0" size={14} aria-hidden="true" /><span>{notice}</span></div> : null}
        <SourceFact label="Qué alimenta">{source.purpose}</SourceFact>
        <SourceFact label="Archivos cargados">
          {loadingBatches ? <span>Consultando estado…</span> : null}
          {!loadingBatches && sourceBatchesError ? <span>No se pudo consultar el estado de carga.</span> : null}
          {!loadingBatches && !sourceBatchesError && loadedBatches.length === 0 ? <span>Sin archivo cargado</span> : null}
          {!loadingBatches && !sourceBatchesError && loadedBatches.length > 0 ? (
            <ul className="m-0 grid list-none gap-1 p-0">
              {loadedBatches.map((batch) => <li className="flex min-w-0 items-center gap-1.5 text-status-ok-ink before:content-none dark:text-status-ok-ink-dark" key={batch.id} title={batch.sourceName}><Check className="shrink-0" size={14} strokeWidth={2.5} aria-hidden="true" /><span className="min-w-0 truncate font-semibold">{batch.sourceName}</span>{formatLoadedAt(batch.createdAt) ? <span className="shrink-0 text-xs font-normal">{formatLoadedAt(batch.createdAt)}</span> : null}</li>)}
            </ul>
          ) : null}
        </SourceFact>
      </dl>
      <div>
        <UploadButton
          busy={busy}
          label={actionLabel}
          accept=".xlsx,application/vnd.openxmlformats-officedocument.spreadsheetml.sheet"
          multiple={multiple}
          onChange={onChange}
          disabled={disabled}
        />
      </div>
    </article>
  );
}

function SourceFact({ label, children }: { label: string; children: React.ReactNode }) {
  return <div className="grid min-w-0 gap-0.5"><dt className="text-[0.7rem] font-bold uppercase tracking-wider text-ink-2 dark:text-[#9fb2d1]">{label}</dt><dd className="m-0 min-w-0 text-ink-2 dark:text-[#d6e2f5]">{children}</dd></div>;
}

export default function DescontinuadorModule() {
  const [initialUrlState] = useState(() => parseDescontinuadorUrl(typeof window === 'undefined' ? '/' : window.location.href, customerPageSize));
  const [customers, setCustomers] = useState<CustomerRecord[]>([]);
  const [modelItems, setModelItems] = useState<ModelDiscontinuationRecord[]>([]);
  const [stockItems, setStockItems] = useState<WaldbottStockRecord[]>([]);
  const [importBatches, setImportBatches] = useState<ImportBatchSummary[]>([]);
  const [loadingImportBatches, setLoadingImportBatches] = useState(true);
  const [sourceBatchesError, setSourceBatchesError] = useState(false);
  const [query, setQuery] = useState(initialUrlState.query);
  const [customerQuery, setCustomerQuery] = useState(initialUrlState.customerQuery);
  const [contractFilter, setContractFilter] = useState<ContractType | 'Todos'>(initialUrlState.contractFilter);
  const [customerTypeFilter, setCustomerTypeFilter] = useState<CustomerType | 'Todos'>(initialUrlState.customerTypeFilter);
  const [commercialAreaFilter, setCommercialAreaFilter] = useState<CommercialArea | 'Todos'>(initialUrlState.commercialAreaFilter);
  const [selectedCustomerId, setSelectedCustomerId] = useState<string | undefined>(initialUrlState.selectedCustomerId);
  const [visibleCustomerCount, setVisibleCustomerCount] = useState(initialUrlState.visibleCustomerCount);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);
  const [message, setMessage] = useState<string | null>(null);
  const [importingPortfolio, setImportingPortfolio] = useState(false);
  const [importingClassification, setImportingClassification] = useState(false);
  const [importingCanon, setImportingCanon] = useState(false);
  const [importingWaldbott, setImportingWaldbott] = useState(false);
  const [importProgress, setImportProgress] = useState<ImportProgress | null>(null);
  const [exportingCustomerId, setExportingCustomerId] = useState<string>();
  const [exportingPortfolio, setExportingPortfolio] = useState(false);
  const [activeView, setActiveView] = useState<DescontinuadorView>(initialUrlState.view);
  const [clearingExclusiveImports, setClearingExclusiveImports] = useState(false);
  const [sourceDataRefreshKey, setSourceDataRefreshKey] = useState(0);
  const [isFilterPending, startFilterTransition] = useTransition();

  useEffect(() => {
    void refresh();
  }, []);

  const modelSupportByLabel = useMemo(() => {
    const modelLabels = customers.flatMap((customer) => customer.contracts.flatMap((contract) => contract.equipment.map((equipment) => equipment.modelLabel)));
    return createModelSupportLookup(modelLabels, modelItems);
  }, [customers, modelItems]);

  useEffect(() => {
    let cancelled = false;
    setLoadingImportBatches(true);
    setSourceBatchesError(false);
    requestJson<{ batches: ImportBatchSummary[] }>('/api/imports?limit=300')
      .then((result) => {
        if (!cancelled) setImportBatches(result.batches);
      })
      .catch(() => {
        if (cancelled) return;
        setImportBatches([]);
        setSourceBatchesError(true);
      })
      .finally(() => {
        if (!cancelled) setLoadingImportBatches(false);
      });

    return () => {
      cancelled = true;
    };
  }, [sourceDataRefreshKey]);

  const customerAlertCounts = useMemo(() => {
    const counts = new Map<string, number>();
    for (const customer of customers) {
      let count = 0;
      for (const contract of customer.contracts) {
        if (contractFilter !== 'Todos' && contract.contractType !== contractFilter) continue;
        for (const equipment of contract.equipment) {
          const support = modelSupportByLabel.get(equipment.modelLabel);
          if (support?.status === 'discontinued' || support?.status === 'scheduled') count += 1;
        }
      }
      counts.set(customer.id, count);
    }
    return counts;
  }, [contractFilter, customers, modelSupportByLabel]);

  const filteredCustomers = useMemo(() => {
    return customers
      .filter((customer) => customerMatchesSearch(customer, customerQuery))
      .filter((customer) => customerTypeFilter === 'Todos' || customer.customerType === customerTypeFilter)
      .filter((customer) => commercialAreaFilter === 'Todos' || customer.commercialArea === commercialAreaFilter)
      .filter((customer) => contractFilter === 'Todos' || customer.contracts.some((contract) => contract.contractType === contractFilter))
      .sort((left, right) => (customerAlertCounts.get(right.id) ?? 0) - (customerAlertCounts.get(left.id) ?? 0) || left.name.localeCompare(right.name, 'es'));
  }, [commercialAreaFilter, contractFilter, customerAlertCounts, customerQuery, customerTypeFilter, customers]);

  const selectedCustomer = filteredCustomers.find((customer) => customer.id === selectedCustomerId) ?? filteredCustomers[0];
  const visibleCustomers = filteredCustomers.slice(0, visibleCustomerCount);
  const remainingCustomers = filteredCustomers.length - visibleCustomers.length;

  useEffect(() => {
    if (typeof window === 'undefined') return;
    window.history.replaceState(null, '', serializeDescontinuadorUrl(window.location.pathname, window.location.search, window.location.hash, {
      view: activeView,
      query,
      customerQuery,
      selectedCustomerId: selectedCustomer?.id,
      contractFilter,
      customerTypeFilter,
      commercialAreaFilter,
      visibleCustomerCount,
    }));
  }, [activeView, commercialAreaFilter, contractFilter, customerQuery, customerTypeFilter, query, selectedCustomer?.id, visibleCustomerCount]);

  const exportCustomers = useMemo(
    () => filteredCustomers.map((customer) => ({
      ...customer,
      contracts: contractFilter === 'Todos'
        ? customer.contracts
        : customer.contracts.filter((contract) => contract.contractType === contractFilter),
    })),
    [contractFilter, filteredCustomers],
  );

  const portfolioStats = useMemo(() => {
    const contracts = filteredCustomers.flatMap((customer) => customer.contracts.filter((contract) => contractFilter === 'Todos' || contract.contractType === contractFilter));
    const equipment = contracts.flatMap((contract) => contract.equipment);
    const support = equipment.map((item) => modelSupportByLabel.get(item.modelLabel));
    const equipmentByContractType = contractTypes.map((type) => ({
      type,
      amount: contracts.filter((contract) => contract.contractType === type).reduce((total, contract) => total + contract.equipment.length, 0),
    }));
    const contractsByType = contractTypes.map((type) => ({
      type,
      amount: contracts.filter((contract) => contract.contractType === type).length,
    }));
    return {
      customers: filteredCustomers.length,
      contracts: contracts.length,
      equipment: equipment.length,
      atRisk: support.filter((item) => item?.status === 'discontinued' || item?.status === 'scheduled').length,
      discontinued: support.filter((item) => item?.status === 'discontinued').length,
      scheduled: support.filter((item) => item?.status === 'scheduled').length,
      unmatched: support.filter((item) => !item).length,
      supported: equipment.length - support.filter((item) => item?.status === 'discontinued' || item?.status === 'scheduled').length,
      equipmentByContractType,
      contractsByType,
    };
  }, [contractFilter, filteredCustomers, modelSupportByLabel]);

  const discontinuedModels = useMemo(() => {
    const summaries = new Map<string, DiscontinuedModelSummary>();
    const contracts = filteredCustomers.flatMap((customer) => customer.contracts.filter((contract) => contractFilter === 'Todos' || contract.contractType === contractFilter));
    for (const contract of contracts) {
      for (const equipment of contract.equipment) {
        const support = modelSupportByLabel.get(equipment.modelLabel);
        if (support?.status !== 'discontinued') continue;
        const key = support.modelLabel.trim().toLocaleUpperCase();
        const current = summaries.get(key);
        if (current) {
          current.equipmentCount += 1;
          continue;
        }
        summaries.set(key, {
          modelLabel: support.modelLabel,
          equipmentCount: 1,
          endsAt: support.endsAt,
        });
      }
    }
    return [...summaries.values()].sort((left, right) => right.equipmentCount - left.equipmentCount || left.modelLabel.localeCompare(right.modelLabel, 'es'));
  }, [contractFilter, filteredCustomers, modelSupportByLabel]);

  const portfolioChart = useMemo(() => {
    if (portfolioStats.equipment === 0) return 'var(--ds-chart-track)';
    const discontinuedShare = (portfolioStats.discontinued / portfolioStats.equipment) * 100;
    const scheduledShare = (portfolioStats.scheduled / portfolioStats.equipment) * 100;
    return `conic-gradient(var(--ds-chart-danger) 0 ${discontinuedShare}%, var(--ds-chart-warning) ${discontinuedShare}% ${discontinuedShare + scheduledShare}%, var(--ds-chart-success) ${discontinuedShare + scheduledShare}% 100%)`;
  }, [portfolioStats]);

  const visibleModelItems = useMemo(() => {
    const normalizedQuery = query.trim().toLocaleLowerCase();
    if (!normalizedQuery) return modelItems;
    return modelItems.filter((item) =>
      [item.modelLabel, item.partCode, item.voltage ?? '', item.sourceNotes.join(' '), item.installedModels.join(' '), item.sourceName]
        .join(' ')
        .toLocaleLowerCase()
        .includes(normalizedQuery),
    );
  }, [modelItems, query]);
  const pagedModelItems = usePagedList(visibleModelItems, 100);
  const visibleStockItems = useMemo(() => {
    const normalizedQuery = query.trim().toLocaleLowerCase();
    if (!normalizedQuery) return stockItems;
    return stockItems.filter((item) =>
      [item.modelLabel, item.canonModelLabel ?? '', item.installedModels.join(' '), item.sourceNames.join(' ')]
        .join(' ')
        .toLocaleLowerCase()
        .includes(normalizedQuery),
    );
  }, [query, stockItems]);
  const stockUnits = useMemo(() => stockItems.reduce((total, item) => total + item.quantity, 0), [stockItems]);
  const rescueStockUnits = useMemo(
    () => stockItems.filter((item) => item.canonStatus === 'discontinued').reduce((total, item) => total + item.quantity, 0),
    [stockItems],
  );
  const importingSource = importingPortfolio || importingClassification || importingCanon || importingWaldbott;
  const sourceActionsDisabled = clearingExclusiveImports || importingSource;
  const loadedBatchesBySource = useMemo(() => new Map(
    discontinuationSourceCards.map(({ sourceId }) => {
      const source = SOURCE_CATALOG.find((item) => item.id === sourceId);
      const batches = source
        ? importBatches.filter((batch) => batch.status === 'applied' && (isEquipmentDetailExport(batch.sourceName)
          ? sourceId === 'fleet.customer-classification'
          : sourceMatchesDefinition(source, batch.sourceName, batch.sourceType, batch.domain)))
        : [];
      return [sourceId, sourceId === 'fleet.equipment' || sourceId === 'fleet.customer-classification' ? latestBatch(batches) : batches] as const;
    }),
  ), [importBatches]);
  const loadedSourceCount = useMemo(
    () => discontinuationSourceCards.filter(({ sourceId }) => (loadedBatchesBySource.get(sourceId)?.length ?? 0) > 0).length,
    [loadedBatchesBySource],
  );

  async function refresh() {
    setLoading(true);
    setError(null);
    try {
      const snapshot = await requestJson<DiscontinuationOverviewSnapshot>('/api/operations/discontinuation-overview');
      setCustomers(snapshot.customers);
      setModelItems(snapshot.modelItems);
      setStockItems(snapshot.stockItems);
    } catch (requestError: unknown) {
      setError(`No se pudo consultar el Discontinuador. ${toErrorMessage(requestError)}`);
    } finally {
      setLoading(false);
    }
  }

  function applyContractFilter(value: ContractType | 'Todos') {
    startFilterTransition(() => {
      setContractFilter(value);
      setVisibleCustomerCount(customerPageSize);
      setSelectedCustomerId(undefined);
    });
  }

  function applyCustomerTypeFilter(value: CustomerType | 'Todos') {
    startFilterTransition(() => {
      setCustomerTypeFilter(value);
      setVisibleCustomerCount(customerPageSize);
      setSelectedCustomerId(undefined);
    });
  }

  function applyCommercialAreaFilter(value: CommercialArea | 'Todos') {
    startFilterTransition(() => {
      setCommercialAreaFilter(value);
      setVisibleCustomerCount(customerPageSize);
      setSelectedCustomerId(undefined);
    });
  }

  function resetPortfolioFilters() {
    startFilterTransition(() => {
      setCustomerQuery('');
      setContractFilter('Todos');
      setCustomerTypeFilter('Todos');
      setCommercialAreaFilter('Todos');
      setVisibleCustomerCount(customerPageSize);
      setSelectedCustomerId(undefined);
    });
  }

  async function exportCustomer(customer: CustomerRecord) {
    setExportingCustomerId(customer.id);
    setError(null);
    try {
      await exportCustomerPortfolio(customer);
      setMessage(`Cartera de ${customer.name} exportada en XLSX.`);
    } catch (exportError: unknown) {
      setError(toErrorMessage(exportError));
    } finally {
      setExportingCustomerId(undefined);
    }
  }

  async function exportPortfolio() {
    if (exportCustomers.length === 0) return;
    setExportingPortfolio(true);
    setError(null);
    try {
      await exportOperationsWorkbook(exportCustomers);
      setMessage(`Cartera exportada: ${exportCustomers.length.toLocaleString('es-PY')} clientes filtrados, con contratos, equipos y detalles de origen.`);
    } catch (exportError: unknown) {
      setError(toErrorMessage(exportError));
    } finally {
      setExportingPortfolio(false);
    }
  }

  async function importCanonDiscontinuation(event: ChangeEvent<HTMLInputElement>) {
    const files = Array.from(event.target.files ?? []);
    event.target.value = '';
    if (files.length === 0) return;
    setImportingCanon(true);
    setError(null);
    setMessage(null);
    const messages: string[] = [];
    const errors: string[] = [];
    try {
      for (const [fileIndex, file] of files.entries()) {
        if (file.size > 35 * 1024 * 1024) {
          errors.push(`${file.name}: supera el límite de 35 MB.`);
          continue;
        }
        try {
          setImportProgress({ currentFile: fileIndex + 1, totalFiles: files.length, sourceName: file.name, progress: 0, stage: 'Preparando archivo…' });
          const bytes = new Uint8Array(await file.arrayBuffer());
          const result = await submitImportJob<CanonDiscontinuationImportResponse>(
            '/api/operations/import-canon-discontinuation',
            { sourceName: file.name, contentBase64: bytesToBase64(bytes) },
            (job) => setImportProgress({
              currentFile: fileIndex + 1,
              totalFiles: files.length,
              sourceName: file.name,
              progress: Math.round((fileIndex * 100 + job.progress) / files.length),
              stage: job.stage,
            }),
          );
          messages.push(result.duplicate
            ? `${result.sourceName}: ya estaba importada.`
            : `${result.sourceName}: ${result.rows} registros Canon incorporados desde ${result.sheets} hojas.`);
        } catch (importError: unknown) {
          errors.push(`${file.name}: ${toErrorMessage(importError)}`);
        }
      }
      await refresh();
      setSourceDataRefreshKey((current) => current + 1);
      if (messages.length > 0) setMessage(messages.join(' · '));
      if (errors.length > 0) setError(errors.join(' '));
    } catch (requestError: unknown) {
      setError(toErrorMessage(requestError));
    } finally {
      setImportingCanon(false);
      setImportProgress(null);
    }
  }

  async function importLegacyPortfolio(event: ChangeEvent<HTMLInputElement>) {
    const files = Array.from(event.target.files ?? []);
    event.target.value = '';
    if (files.length === 0) return;
    setImportingPortfolio(true);
    setError(null);
    setMessage(null);
    const messages: string[] = [];
    const errors: string[] = [];
    try {
      for (const [fileIndex, file] of files.entries()) {
        if (file.size > 35 * 1024 * 1024) {
          errors.push(`${file.name}: supera el límite de 35 MB.`);
          continue;
        }
        try {
          setImportProgress({ currentFile: fileIndex + 1, totalFiles: files.length, sourceName: file.name, progress: 0, stage: 'Preparando archivo…' });
          const bytes = new Uint8Array(await file.arrayBuffer());
          const result = await submitImportJob<LegacyPortfolioImportResponse>(
            '/api/operations/import-legacy-portfolio',
            { sourceName: file.name, contentBase64: bytesToBase64(bytes) },
            (job) => setImportProgress({
              currentFile: fileIndex + 1,
              totalFiles: files.length,
              sourceName: file.name,
              progress: Math.round((fileIndex * 100 + job.progress) / files.length),
              stage: job.stage,
            }),
          );
          messages.push(result.duplicate
            ? `${result.sourceName}: ya estaba importada.`
            : `${result.sourceName}: ${result.rows} filas, ${result.customers} clientes, ${result.contracts} contratos y ${result.equipment} equipos.`);
        } catch (importError: unknown) {
          errors.push(`${file.name}: ${toErrorMessage(importError)}`);
        }
      }
      await refresh();
      setSourceDataRefreshKey((current) => current + 1);
      if (messages.length > 0) setMessage(messages.join(' · '));
      if (errors.length > 0) setError(errors.join(' '));
    } catch (requestError: unknown) {
      setError(toErrorMessage(requestError));
    } finally {
      setImportingPortfolio(false);
      setImportProgress(null);
    }
  }

  async function importCustomerClassification(event: ChangeEvent<HTMLInputElement>) {
    const files = Array.from(event.target.files ?? []);
    event.target.value = '';
    if (files.length === 0) return;
    setImportingClassification(true);
    setError(null);
    setMessage(null);
    const messages: string[] = [];
    const errors: string[] = [];
    try {
      for (const [fileIndex, file] of files.entries()) {
        if (file.size > 35 * 1024 * 1024) {
          errors.push(`${file.name}: supera el límite de 35 MB.`);
          continue;
        }
        try {
          setImportProgress({ currentFile: fileIndex + 1, totalFiles: files.length, sourceName: file.name, progress: 0, stage: 'Preparando archivo…' });
          const bytes = new Uint8Array(await file.arrayBuffer());
          const result = await submitImportJob<LegacyClassificationImportResponse>(
            '/api/operations/import-fleet-metadata',
            { sourceName: file.name, sourceType: 'classification', contentBase64: bytesToBase64(bytes) },
            (job) => setImportProgress({
              currentFile: fileIndex + 1,
              totalFiles: files.length,
              sourceName: file.name,
              progress: Math.round((fileIndex * 100 + job.progress) / files.length),
              stage: job.stage,
            }),
          );
          messages.push(result.duplicate
            ? `${result.sourceName}: ya estaba importada.`
            : `${result.sourceName}: ${result.rows} filas, ${result.customers} clientes clasificados.`);
        } catch (importError: unknown) {
          errors.push(`${file.name}: ${toErrorMessage(importError)}`);
        }
      }
      await refresh();
      setSourceDataRefreshKey((current) => current + 1);
      if (messages.length > 0) setMessage(messages.join(' · '));
      if (errors.length > 0) setError(errors.join(' '));
    } catch (requestError: unknown) {
      setError(toErrorMessage(requestError));
    } finally {
      setImportingClassification(false);
      setImportProgress(null);
    }
  }

  async function importWaldbottStock(event: ChangeEvent<HTMLInputElement>) {
    const files = Array.from(event.target.files ?? []);
    event.target.value = '';
    if (files.length === 0) return;
    setImportingWaldbott(true);
    setError(null);
    setMessage(null);
    const messages: string[] = [];
    const errors: string[] = [];
    try {
      for (const [fileIndex, file] of files.entries()) {
        if (file.size > 35 * 1024 * 1024) {
          errors.push(`${file.name}: supera el límite de 35 MB.`);
          continue;
        }
        try {
          setImportProgress({ currentFile: fileIndex + 1, totalFiles: files.length, sourceName: file.name, progress: 0, stage: 'Preparando archivo…' });
          const bytes = new Uint8Array(await file.arrayBuffer());
          const result = await submitImportJob<WaldbottStockImportResponse>(
            '/api/operations/import-waldbott-stock',
            { sourceName: file.name, contentBase64: bytesToBase64(bytes) },
            (job) => setImportProgress({
              currentFile: fileIndex + 1,
              totalFiles: files.length,
              sourceName: file.name,
              progress: Math.round((fileIndex * 100 + job.progress) / files.length),
              stage: job.stage,
            }),
          );
          messages.push(result.duplicate
            ? `${result.sourceName}: ya estaba importado.`
            : `${result.sourceName}: ${result.items} filas, ${numberFormat.format(result.quantity)} unidades en ${result.models} modelos del Depósito 04.`);
        } catch (importError: unknown) {
          errors.push(`${file.name}: ${toErrorMessage(importError)}`);
        }
      }
      await refresh();
      setSourceDataRefreshKey((current) => current + 1);
      if (messages.length > 0) setMessage(messages.join(' · '));
      if (errors.length > 0) setError(errors.join(' '));
    } catch (requestError: unknown) {
      setError(toErrorMessage(requestError));
    } finally {
      setImportingWaldbott(false);
      setImportProgress(null);
    }
  }

  async function clearExclusiveImports() {
    if (clearingExclusiveImports || (modelItems.length === 0 && stockItems.length === 0)) return;
    const confirmed = await confirmAction({
      title: 'Quitar cargas de Discontinuador',
      message: 'Se quitarán las listas Canon y el stock Waldbott cargados desde Discontinuador. Los originales se conservarán en el archivo recuperable; la cartera compartida de clientes, contratos y equipos no se eliminará.',
      confirmLabel: 'Quitar cargas',
    });
    if (!confirmed) return;

    setClearingExclusiveImports(true);
    setError(null);
    setMessage(null);
    try {
      const response = await fetch('/api/operations/exclusive-imports', { method: 'DELETE' });
      const result = await readJson<ClearExclusiveImportsResponse>(response);
      setMessage(`${result.batches.toLocaleString('es-PY')} carga(s) quitada(s); ${result.archivedFiles.toLocaleString('es-PY')} original(es) archivado(s). La cartera compartida se mantuvo intacta.`);
      setSourceDataRefreshKey((current) => current + 1);
      await refresh();
    } catch (clearError: unknown) {
      setError(toErrorMessage(clearError));
    } finally {
      setClearingExclusiveImports(false);
    }
  }

  const lead = activeView === 'discontinued' ? 'Identifica contratos que requieren revisión y prioriza los modelos afectados.' : activeView === 'stock' ? 'Cruza el stock recuperable con el soporte Canon y la cartera instalada.' : 'Conserva cada exportación, muestra su origen y deja las filas originales disponibles para inspección.';

  return (
    <div className="page-content grid min-w-0 grid-cols-1 gap-6 [overflow-wrap:anywhere]">
      <PageHeader
        eyebrow="ADMINISTRATIVO / CICLO DE VIDA"
        title="Discontinuador"
        lead={lead}
        actions={activeView === 'discontinued'
          ? <HeaderMetric value={numberFormat.format(portfolioStats.discontinued)} label="equipos discontinuados" tone="danger" />
          : activeView === 'uploads' ? <HeaderMetric value={String(loadedSourceCount)} label="cargas activas" /> : undefined}
      />

      <AnimatedTabs
        ariaLabel="Vistas del Discontinuador"
        active={activeView}
        onChange={setActiveView}
        tabs={[
          { id: 'discontinued', label: 'Discontinuados', icon: TriangleAlert, count: numberFormat.format(portfolioStats.discontinued) },
          { id: 'stock', label: 'Stock Waldbott', icon: Package, count: numberFormat.format(stockItems.length) },
          { id: 'uploads', label: 'Carga', icon: Upload, count: loadedSourceCount },
        ]}
      />

      {(activeView === 'uploads' || error || message || loading || importProgress) && <StatusLine state={error ? 'error' : loading || importProgress ? 'pending' : 'ready'}>{error || message || (importProgress ? `${importProgress.currentFile}/${importProgress.totalFiles} archivo(s) · ${importProgress.progress}% · ${importProgress.stage}` : loading ? 'Consultando modelos Canon y base instalada…' : `${modelItems.length} modelos Canon para cruce`)}</StatusLine>}

      {importProgress ? <Card className={cardClass} aria-label="Progreso de importación">
        <div className="flex items-baseline justify-between gap-3"><div className="font-semibold text-navy dark:text-white">{importProgress.sourceName}</div><div className="font-bold tabular-nums text-navy dark:text-white">{importProgress.progress}%</div></div>
        <div className="h-2 overflow-hidden rounded-full bg-navy/10 dark:bg-white/10" role="progressbar" aria-valuemin={0} aria-valuemax={100} aria-valuenow={importProgress.progress}>
          <div className="h-full rounded-full bg-sky transition-[width]" style={{ width: `${importProgress.progress}%` }} />
        </div>
        <Muted>Archivo {importProgress.currentFile} de {importProgress.totalFiles} · {importProgress.stage}</Muted>
      </Card> : null}

      {activeView === 'uploads' && <>
        <Card className={cardClass} aria-labelledby="flow-source-title">
          <CardHeader eyebrow="Fuentes de carga" title={<span id="flow-source-title">Archivos del flujo de discontinuación</span>} aside={<Badge>4 fuentes documentadas</Badge>} />
          <Muted className="text-sm leading-relaxed">Selecciona cada exportación desde su origen indicado. La Suite conserva el archivo original, normaliza los campos necesarios y deja las filas completas disponibles para inspección.</Muted>
          <div className="grid min-w-0 grid-cols-[repeat(auto-fit,minmax(min(100%,16rem),1fr))] gap-4">
            <DiscontinuationSourceCard {...discontinuationSourceCards[0]} busy={importingPortfolio} disabled={sourceActionsDisabled} loadedBatches={loadedBatchesBySource.get('fleet.equipment') ?? []} loadingBatches={loadingImportBatches} sourceBatchesError={sourceBatchesError} onChange={(event) => void importLegacyPortfolio(event)} />
            <DiscontinuationSourceCard {...discontinuationSourceCards[1]} busy={importingClassification} disabled={sourceActionsDisabled} loadedBatches={loadedBatchesBySource.get('fleet.customer-classification') ?? []} loadingBatches={loadingImportBatches} sourceBatchesError={sourceBatchesError} onChange={(event) => void importCustomerClassification(event)} />
            <DiscontinuationSourceCard {...discontinuationSourceCards[2]} busy={importingCanon} disabled={sourceActionsDisabled} loadedBatches={loadedBatchesBySource.get('discontinuation.canon') ?? []} loadingBatches={loadingImportBatches} sourceBatchesError={sourceBatchesError} onChange={(event) => void importCanonDiscontinuation(event)} />
            <DiscontinuationSourceCard {...discontinuationSourceCards[3]} busy={importingWaldbott} disabled={sourceActionsDisabled} loadedBatches={loadedBatchesBySource.get('discontinuation.waldbott') ?? []} loadingBatches={loadingImportBatches} sourceBatchesError={sourceBatchesError} onChange={(event) => void importWaldbottStock(event)} />
          </div>
          <div className="flex flex-wrap gap-2">
            <Button variant="outline" onClick={() => void clearExclusiveImports()} disabled={sourceActionsDisabled || (modelItems.length === 0 && stockItems.length === 0)}>{clearingExclusiveImports ? 'Limpiando listas…' : 'Limpiar listas Canon / stock'}</Button>
            <Button variant="outline" onClick={() => void refresh()} disabled={loading || clearingExclusiveImports}>{loading ? 'Actualizando…' : 'Actualizar alertas'}</Button>
          </div>
        </Card>

        <LegacySourceDataPanel key={sourceDataRefreshKey} />
      </>}

      {activeView === 'discontinued' && <Card className={cardClass}>
        <CardHeader
          eyebrow="Filtro general"
          title="Segmentar cartera"
          aside={<div className="flex flex-wrap items-end gap-2">
            <label className={cn(fieldClass, 'w-64')}>Buscar cartera<Input value={customerQuery} onChange={(event) => { setCustomerQuery(event.target.value); setVisibleCustomerCount(customerPageSize); }} placeholder="Cliente, contrato, OV, serie…" /></label>
            <ExportButton busy={exportingPortfolio} onClick={() => void exportPortfolio()} disabled={exportCustomers.length === 0}>Exportar cartera XLSX</ExportButton>
          </div>}
        />
        <Muted className="text-sm">Combina tipo de contrato, cliente y área comercial para priorizar los equipos afectados.</Muted>

        <div className="flex flex-wrap items-end gap-x-6 gap-y-3" aria-label="Filtros de cartera" aria-busy={isFilterPending}>
          <FilterGroup label="Tipo de contrato" value={contractFilter} values={['Todos', ...contractTypes]} onChange={applyContractFilter} disabled={isFilterPending} />
          <FilterGroup label="Tipo de cliente" value={customerTypeFilter} values={['Todos', ...customerTypes]} onChange={applyCustomerTypeFilter} disabled={isFilterPending} />
          <FilterGroup label="Área comercial" value={commercialAreaFilter} values={['Todos', ...commercialAreas]} onChange={applyCommercialAreaFilter} disabled={isFilterPending} />
          <Button variant="ghost" onClick={resetPortfolioFilters} disabled={isFilterPending}>Limpiar filtros</Button>
        </div>

        <div className="grid min-w-0 grid-cols-2 gap-3 min-[900px]:grid-cols-4" aria-label="Indicadores de cartera filtrada">
          <Stat label="Clientes" value={numberFormat.format(portfolioStats.customers)} />
          <Stat label="Equipos relevados" value={numberFormat.format(portfolioStats.equipment)} />
          <Stat label="Discontinuados" value={numberFormat.format(portfolioStats.discontinued)} tone="danger" />
          <Stat label="Próximos a fin de soporte" value={numberFormat.format(portfolioStats.scheduled)} tone={portfolioStats.scheduled > 0 ? 'warning' : undefined} />
        </div>

        <section className="@container min-w-0" aria-label="Resumen gráfico de cartera">
          <div className="grid min-w-0 gap-4 @[44rem]:grid-cols-2 @[68rem]:grid-cols-3">
            <article className={cn(subCardClass, 'grid content-start gap-4')}>
              <div className="flex flex-wrap items-start justify-between gap-2">
                <div className="grid gap-1"><Eyebrow>Parque instalado</Eyebrow><h3 className="m-0 text-base font-bold text-navy dark:text-white">Estado Canon</h3><Muted>Soporte de los equipos incluidos en los filtros actuales.</Muted></div>
                <Badge>{numberFormat.format(portfolioStats.equipment)} equipos</Badge>
              </div>
              <div className="flex flex-wrap items-center gap-5">
                <div className="grid size-32 shrink-0 place-items-center rounded-full" role="img" aria-label={`${portfolioStats.discontinued} equipos discontinuados, ${portfolioStats.scheduled} próximos a vencer y ${portfolioStats.supported} con soporte vigente`} style={{ background: portfolioChart }}>
                  <div className="grid size-20 place-items-center content-center rounded-full bg-paper text-center dark:bg-[#13233f]"><div className="text-xl font-bold tabular-nums text-navy dark:text-white">{numberFormat.format(portfolioStats.equipment)}</div><Muted>equipos</Muted></div>
                </div>
                <div className="grid gap-2 text-sm text-ink-2 dark:text-[#d6e2f5]">
                  <LegendRow color="var(--ds-chart-danger)" label="Discontinuados" value={portfolioStats.discontinued} />
                  <LegendRow color="var(--ds-chart-warning)" label="Próximo fin" value={portfolioStats.scheduled} />
                  <LegendRow color="var(--ds-chart-success)" label="Soporte vigente" value={portfolioStats.supported} />
                </div>
              </div>
            </article>
            <PortfolioBreakdownCard eyebrow="Equipos por contrato" title="Distribución por tipo" description="Equipos instalados según el tipo de contrato." values={portfolioStats.equipmentByContractType} />
            <PortfolioBreakdownCard eyebrow="Contratos por tipo" title="Cantidad de contratos" description="Contratos incluidos en la selección actual." values={portfolioStats.contractsByType} />
          </div>
        </section>

        <section className="grid min-w-0 gap-3" aria-labelledby="models-title">
          <div className="flex flex-wrap items-start justify-between gap-3">
            <div className="grid gap-1"><Eyebrow>Modelos identificados</Eyebrow><h2 className="m-0 text-lg font-bold text-navy dark:text-white" id="models-title">Canon discontinuados en la cartera</h2><Muted>Modelos con fin de soporte que aparecen en los equipos filtrados.</Muted></div>
            <Badge>{discontinuedModels.length} modelos</Badge>
          </div>
          {discontinuedModels.length > 0 ? <div className="grid min-w-0 grid-cols-[repeat(auto-fill,minmax(min(100%,13rem),1fr))] gap-3">
            {discontinuedModels.map((model) => <article className={cn(subCardClass, 'grid content-start gap-2 p-3')} key={model.modelLabel}>
              <div className="flex flex-wrap items-center justify-between gap-2"><Badge tone="danger">Discontinuado</Badge><div className="text-sm font-bold tabular-nums text-navy dark:text-white">{numberFormat.format(model.equipmentCount)} equipos</div></div>
              <h3 className="m-0 text-sm font-bold text-navy dark:text-white">{model.modelLabel}</h3>
              <Muted>{model.endsAt ? `Fin de soporte: ${formatDate(model.endsAt)}` : 'Fin de soporte sin fecha'}</Muted>
            </article>)}
          </div> : <Muted className="text-sm">No hay modelos discontinuados en la cartera filtrada.</Muted>}
        </section>

        <div className="@container min-w-0">
          <div className="grid min-w-0 items-start gap-4 @[56rem]:grid-cols-[minmax(16rem,1fr)_minmax(0,2.2fr)]">
            <aside className={cn(subCardClass, 'grid content-start gap-3')} aria-label="Clientes de la cartera">
              <div className="flex items-baseline justify-between gap-2"><div className="font-bold text-navy dark:text-white">Clientes</div><Muted>{numberFormat.format(filteredCustomers.length)} encontrados</Muted></div>
              <div className="grid max-h-[40rem] gap-2 overflow-y-auto pr-1">
                {visibleCustomers.map((customer) => {
                  const alertCount = customerAlertCounts.get(customer.id) ?? 0;
                  const customerContracts = contractFilter === 'Todos' ? customer.contracts : customer.contracts.filter((contract) => contract.contractType === contractFilter);
                  const equipmentCount = customerContracts.reduce((total, contract) => total + contract.equipment.length, 0);
                  const selected = selectedCustomer?.id === customer.id;
                  return <button className={cn('grid min-w-0 grid-cols-[minmax(0,1fr)_auto] items-center gap-2 rounded-xl border p-3 text-left focus-visible:outline-2 focus-visible:outline-offset-2 focus-visible:outline-sky', selected ? 'border-sky bg-sky/10' : 'border-navy/10 bg-white hover:bg-sky/5 dark:border-sky/20 dark:bg-transparent')} type="button" key={customer.id} aria-pressed={selected} onClick={() => setSelectedCustomerId(customer.id)}>
                    <div className="min-w-0"><div className="font-bold text-navy dark:text-white">{customer.name}</div><Muted>{customerContracts.length} contrato{customerContracts.length === 1 ? '' : 's'} · {equipmentCount} equipo{equipmentCount === 1 ? '' : 's'}</Muted></div>
                    <Badge className="whitespace-nowrap" tone={alertCount > 0 ? 'danger' : 'neutral'}>{alertCount > 0 ? `${alertCount} alertas` : 'Sin alertas'}</Badge>
                  </button>;
                })}
                {remainingCustomers > 0 && <Button variant="outline" onClick={() => setVisibleCustomerCount((current) => current + customerPageSize)}>Ver {Math.min(customerPageSize, remainingCustomers)} clientes más</Button>}
                {visibleCustomers.length === 0 && <Muted className="text-sm">{loading ? 'Cargando cartera…' : 'No hay clientes para este filtro.'}</Muted>}
              </div>
            </aside>

            <div className="min-w-0">
              {selectedCustomer ? <CustomerPortfolioDetail customer={selectedCustomer} contractFilter={contractFilter} supportByModel={modelSupportByLabel} alertCount={customerAlertCounts.get(selectedCustomer.id) ?? 0} exporting={exportingCustomerId === selectedCustomer.id} onExport={() => void exportCustomer(selectedCustomer)} /> : <Muted className="text-sm">Importa una cartera para consultar contratos y equipos por cliente.</Muted>}
            </div>
          </div>
        </div>
      </Card>}

      {activeView === 'discontinued' && <Card className={cardClass}>
        <CardHeader eyebrow="Soporte Canon + base instalada" title="Modelos de impresoras discontinuados" />
        <Muted className="text-sm">Se conservan registros de modelo aunque la lista no traiga código de parte.</Muted>
        <Table className="min-w-[52rem] [overflow-wrap:normal]">
          <TableHeader><TableRow><TableHead>Modelo</TableHead><TableHead>Código de parte</TableHead><TableHead>Tensión</TableHead><TableHead>Fecha fin</TableHead><TableHead>Equipos instalados</TableHead><TableHead>Notas de fuente</TableHead><TableHead>Estado</TableHead></TableRow></TableHeader>
          <TableBody>
            {pagedModelItems.items.map((item) => <TableRow key={item.id} className={item.status === 'discontinued' ? 'bg-status-danger/5' : undefined}>
              <TableCell className="min-w-[10rem]"><div className="font-mono text-xs font-semibold text-navy dark:text-white">{item.modelLabel}</div><Muted className="mt-1" title={item.sourceLabel ?? item.sourceName}>{item.sourceLabel ?? item.sourceName}</Muted></TableCell>
              <TableCell>{item.partCode || <Muted>Sin código</Muted>}</TableCell>
              <TableCell>{item.voltage || <Muted>Sin dato</Muted>}</TableCell>
              <TableCell className="whitespace-nowrap">{item.endsAt ? formatDate(item.endsAt) : <Muted>Sin fecha</Muted>}</TableCell>
              <TableCell>{item.installedCount > 0 ? <div><div className="font-semibold">{item.installedCount} equipo{item.installedCount === 1 ? '' : 's'}</div><Muted>{item.installedModels.join(', ')}</Muted></div> : <Muted>Sin coincidencias</Muted>}</TableCell>
              <TableCell className="max-w-[16rem]">{item.sourceNotes.length > 0 ? <div className="line-clamp-2" title={item.sourceNotes.join(' · ')}>{item.sourceNotes.join(' · ')}</div> : <Muted>Sin notas</Muted>}</TableCell>
              <TableCell><Badge className="whitespace-nowrap" tone={item.status === 'discontinued' ? 'danger' : 'warning'}>{item.status === 'discontinued' ? 'Discontinuado' : 'Programado'}</Badge></TableCell>
            </TableRow>)}
            {visibleModelItems.length === 0 && <TableRow><TableCell colSpan={7} className="py-8 text-center">{loading ? 'Cargando…' : 'Importa una lista Canon XLSX para consultar modelos y fechas de soporte.'}</TableCell></TableRow>}
          </TableBody>
        </Table>
        {pagedModelItems.totalPages > 1 && <PaginationControls label="Paginación de modelos discontinuados" page={pagedModelItems.page} pageSize={pagedModelItems.pageSize} total={pagedModelItems.total} pageSizeOptions={[50, 100, 250]} onPageChange={pagedModelItems.setPage} onPageSizeChange={pagedModelItems.setPageSize} />}
      </Card>}

      {activeView === 'stock' && <Card className={cardClass}>
        <CardHeader eyebrow="Waldbott + soporte Canon" title="Stock recuperable" />
        <Muted className="text-sm">
          {stockItems.length
            ? `${numberFormat.format(stockUnits)} unidades en ${stockItems.length} modelos. ${numberFormat.format(rescueStockUnits)} unidades tienen soporte Canon discontinuado.`
            : 'Solo se considera el Depósito 04. Las filas de proyectores, Epson, Casio, BenQ y pantallas interactivas quedan fuera.'}
        </Muted>
        <Table className="min-w-[44rem] [overflow-wrap:normal]">
          <TableHeader><TableRow><TableHead>Modelo</TableHead><TableHead className="text-right">Unidades</TableHead><TableHead>Canon</TableHead><TableHead>Fecha fin</TableHead><TableHead>Base instalada</TableHead><TableHead>Fuente</TableHead></TableRow></TableHeader>
          <TableBody>
            {visibleStockItems.map((item) => <TableRow key={item.id}>
              <TableCell className="min-w-[10rem]"><div className="font-mono text-xs font-semibold text-navy dark:text-white">{item.modelLabel}</div>{item.canonModelLabel && item.canonModelLabel !== item.modelLabel ? <Muted className="mt-1">Canon: {item.canonModelLabel}</Muted> : null}</TableCell>
              <TableCell className="text-right tabular-nums">{numberFormat.format(item.quantity)}</TableCell>
              <TableCell><Badge className="whitespace-nowrap" tone={stockStatusTone(item.canonStatus)}>{formatStockStatus(item.canonStatus)}</Badge></TableCell>
              <TableCell className="whitespace-nowrap">{item.canonEndsAt ? formatDate(item.canonEndsAt) : <Muted>Sin fecha</Muted>}</TableCell>
              <TableCell>{item.installedCount > 0 ? <div><div className="font-semibold">{item.installedCount} equipo{item.installedCount === 1 ? '' : 's'}</div><Muted>{item.installedModels.join(', ')}</Muted></div> : <Muted>Sin coincidencias</Muted>}</TableCell>
              <TableCell className="max-w-[14rem]"><div className="line-clamp-2" title={item.sourceNames.join(', ')}>{item.sourceNames.join(', ')}</div></TableCell>
            </TableRow>)}
            {visibleStockItems.length === 0 && <TableRow><TableCell colSpan={6} className="py-8 text-center">{loading ? 'Cargando…' : 'Importa el stock Waldbott XLSX para cruzar unidades recuperables con soporte Canon y cartera instalada.'}</TableCell></TableRow>}
          </TableBody>
        </Table>
      </Card>}

      <Muted className="text-sm leading-relaxed">La suite cruza stock, listas de modelos Canon y equipos instalados con las reglas disponibles del legado. El proyecto original no definía sustitutos automáticos; para no inventar equivalencias, los modelos sin cruce se muestran como pendientes de revisión.</Muted>
    </div>
  );
}

// Crear un Intl.DateTimeFormat por fecha era caro (~1,5 s al pintar la cartera completa): se crea una sola vez.
const mediumDateFormat = new Intl.DateTimeFormat('es-PY', { dateStyle: 'medium' });

function formatDate(value: string): string {
  const date = new Date(`${value.slice(0, 10)}T12:00:00`);
  return Number.isNaN(date.getTime()) ? value.slice(0, 10) : mediumDateFormat.format(date);
}

async function requestJson<T>(url: string): Promise<T> {
  const retryDelays = [150, 400] as const;
  let lastError: unknown = null;

  for (let attempt = 0; attempt <= retryDelays.length; attempt += 1) {
    try {
      const response = await fetch(url);
      if (response.ok || response.status < 500 || attempt === retryDelays.length) {
        return readJson<T>(response);
      }
      lastError = new Error(`La API local respondió con HTTP ${response.status}.`);
    } catch (requestError: unknown) {
      lastError = requestError;
      if (attempt === retryDelays.length) throw requestError;
    }

    await new Promise<void>((resolve) => setTimeout(resolve, retryDelays[attempt]));
  }

  throw lastError instanceof Error ? lastError : new Error('No se pudo consultar la API local.');
}

type LegacyPortfolioImportResponse = {
  duplicate: boolean;
  sourceName: string;
  rows: number;
  customers: number;
  contracts: number;
  equipment: number;
};

type LegacyClassificationImportResponse = {
  duplicate: boolean;
  sourceName: string;
  rows: number;
  customers: number;
};

type CanonDiscontinuationImportResponse = {
  duplicate: boolean;
  sourceName: string;
  rows: number;
  sheets: number;
};

type WaldbottStockImportResponse = {
  duplicate: boolean;
  sourceName: string;
  rows: number;
  items: number;
  models: number;
  quantity: number;
};

type ClearExclusiveImportsResponse = {
  ok: boolean;
  batches: number;
  archivedFiles: number;
};

function formatStockStatus(status: WaldbottStockRecord['canonStatus']): string {
  if (status === 'discontinued') return 'Discontinuado';
  if (status === 'scheduled') return 'Próximo fin';
  if (status === 'supported') return 'Con soporte';
  return 'Sin registro';
}

function stockStatusTone(status: WaldbottStockRecord['canonStatus']): BadgeTone {
  if (status === 'discontinued') return 'danger';
  if (status === 'scheduled') return 'warning';
  return 'neutral';
}

function HeaderMetric({ value, label, tone }: { value: string; label: string; tone?: 'danger' }) {
  return <div className={cn('grid min-w-36 gap-0.5 rounded-xl border border-navy/10 bg-white px-4 py-3 shadow-md dark:border-sky/20 dark:bg-panel', tone === 'danger' && 'border-l-4 border-l-status-danger!')}><div className={cn('text-3xl font-bold tabular-nums', tone === 'danger' ? 'text-status-danger-ink dark:text-[#ff8a93]' : 'text-navy dark:text-white')}>{value}</div><Muted>{label}</Muted></div>;
}

const statTone = { danger: 'border-l-status-danger', warning: 'border-l-status-warn' } as const;

function Stat({ label, value, tone }: { label: string; value: string; tone?: keyof typeof statTone }) {
  return <div className={cn(subCardClass, 'grid gap-1 p-3', tone && `border-l-4 ${statTone[tone]}`)}><Muted>{label}</Muted><div className="text-2xl font-bold tabular-nums text-navy dark:text-white">{value}</div></div>;
}

function LegendRow({ color, label, value }: { color: string; label: string; value: number }) {
  return <div className="flex items-center gap-2"><i className="size-2.5 shrink-0 rounded-full" style={{ background: color }} /><div>{label}</div><b className="tabular-nums text-navy dark:text-white">{numberFormat.format(value)}</b></div>;
}

function FilterGroup<T extends string>({
  label,
  value,
  values,
  onChange,
  disabled,
}: {
  label: string;
  value: T;
  values: readonly T[];
  onChange: (value: T) => void;
  disabled: boolean;
}) {
  return <div className="grid gap-1.5"><div className="text-xs font-semibold text-navy dark:text-white">{label}</div><div className="flex flex-wrap gap-1.5" role="group" aria-label={label}>{values.map((option) => <Button type="button" key={option} size="sm" variant={option === value ? 'default' : 'outline'} aria-pressed={option === value} disabled={disabled} onClick={() => onChange(option)}>{option === 'Publico' ? 'Público' : option}</Button>)}</div></div>;
}

function PortfolioBreakdownCard({
  eyebrow,
  title,
  description,
  values,
}: {
  eyebrow: string;
  title: string;
  description: string;
  values: readonly { type: ContractType; amount: number }[];
}) {
  const maximum = Math.max(1, ...values.map((value) => value.amount));
  return (
    <article className={cn(subCardClass, 'grid content-start gap-4')}>
      <div className="grid gap-1"><Eyebrow>{eyebrow}</Eyebrow><h3 className="m-0 text-base font-bold text-navy dark:text-white">{title}</h3><Muted>{description}</Muted></div>
      <div className="grid gap-3">
        {values.map((value) => <div className="grid gap-1.5" key={value.type}>
          <div className="flex items-baseline justify-between gap-2 text-sm text-ink-2 dark:text-[#d6e2f5]"><div>{value.type}</div><b className="tabular-nums text-navy dark:text-white">{numberFormat.format(value.amount)}</b></div>
          <div className="h-2 overflow-hidden rounded-full bg-navy/10 dark:bg-white/10"><div className={cn('h-full rounded-full', contractTypeFill[value.type])} style={{ width: `${(value.amount / maximum) * 100}%` }} /></div>
        </div>)}
      </div>
    </article>
  );
}

function CustomerPortfolioDetail({
  customer,
  contractFilter,
  supportByModel,
  alertCount,
  exporting,
  onExport,
}: {
  customer: CustomerRecord;
  contractFilter: ContractType | 'Todos';
  supportByModel: ReadonlyMap<string, ModelDiscontinuationRecord | undefined>;
  alertCount: number;
  exporting: boolean;
  onExport: () => void;
}) {
  const contracts = contractFilter === 'Todos' ? customer.contracts : customer.contracts.filter((contract) => contract.contractType === contractFilter);
  const equipmentCount = contracts.reduce((total, contract) => total + contract.equipment.length, 0);
  return (
    <div className="grid min-w-0 gap-4">
      <div className="flex flex-wrap items-start justify-between gap-3">
        <div className="grid min-w-0 gap-1"><Eyebrow>Cliente seleccionado</Eyebrow><h3 className="m-0 text-lg font-bold text-navy dark:text-white">{customer.name}</h3><Muted>{customer.customerType ?? 'Sin tipo'} · {customer.commercialArea ?? 'Sin área comercial'}</Muted><SourceDetails details={customer.sourceDetails} /></div>
        <ExportButton busy={exporting} onClick={onExport}>Exportar cliente XLSX</ExportButton>
      </div>
      <div className="flex flex-wrap gap-2"><Badge>{numberFormat.format(contracts.length)} contratos</Badge><Badge>{numberFormat.format(equipmentCount)} equipos</Badge><Badge tone={alertCount > 0 ? 'danger' : 'neutral'}>{numberFormat.format(alertCount)} alertas de soporte</Badge></div>
      <div className="grid gap-3">
        {contracts.map((contract) => <details className={cn(subCardClass, 'group')} open key={contract.id}>
          <summary className="flex cursor-pointer list-none flex-wrap items-center justify-between gap-2 focus-visible:outline-2 focus-visible:outline-sky">
            <div className="grid min-w-0 gap-0.5"><b className="text-navy dark:text-white">{contract.reference || 'Sin referencia'}</b><Muted>{contract.contractType} · {formatDateRange(contract.startsAt, contract.endsAt)}</Muted></div>
            <div className="flex items-center gap-3 text-xs"><em className="not-italic font-semibold text-ink-2 dark:text-[#d6e2f5]">{contract.equipment.length} equipo{contract.equipment.length === 1 ? '' : 's'}</em><span className="font-semibold text-[#00587a] dark:text-[#8bd6f2]"><span className="group-open:hidden">Ver equipos</span><span className="hidden group-open:inline">Contraer equipos</span></span></div>
          </summary>
          <div className="mt-3 grid gap-2"><Muted>{formatContractMetadata(contract)}</Muted><SourceDetails details={contract.sourceDetails} /></div>
          <div className="mt-3"><ContractEquipmentTable equipment={contract.equipment} supportByModel={supportByModel} /></div>
        </details>)}
        {contracts.length === 0 && <Muted className="text-sm">Sin contratos registrados para este filtro.</Muted>}
      </div>
    </div>
  );
}

/** Equipos de un contrato, de a 50: un cliente grande llega a cientos de filas con detalle de origen cada una. */
function ContractEquipmentTable({ equipment, supportByModel }: { equipment: ContractRecord['equipment']; supportByModel: ReadonlyMap<string, ModelDiscontinuationRecord | undefined> }) {
  const paged = usePagedList(equipment, 50);
  return (
    <div className="grid gap-3">
      <Table className="min-w-[40rem] [overflow-wrap:normal]">
        <TableHeader><TableRow><TableHead>Equipo</TableHead><TableHead>Serie</TableHead><TableHead>Ubicación</TableHead><TableHead>Ciudad / dirección</TableHead><TableHead>Estado Canon</TableHead></TableRow></TableHeader>
        <TableBody>{paged.items.map((equipment) => {
          const support = supportByModel.get(equipment.modelLabel);
          return <TableRow key={equipment.id}>
            <TableCell className="min-w-[10rem]"><div className="font-mono text-xs font-semibold text-navy dark:text-white">{equipment.modelLabel}</div><Muted className="mt-1">{[equipment.brand, equipment.description].filter(Boolean).join(' · ') || 'Sin descripción de origen'}</Muted><SourceDetails details={equipment.sourceDetails} /></TableCell>
            <TableCell className="whitespace-nowrap">{equipment.serialNumber || 'Sin serie'}</TableCell>
            <TableCell><div>{equipment.interior || equipment.location || 'Sin ubicación'}</div><Muted className="mt-1">{equipment.branch || 'Sin sucursal'}</Muted></TableCell>
            <TableCell><div>{equipment.city || 'Sin ciudad'}</div><Muted className="mt-1">{equipment.address || 'Sin dirección'}</Muted></TableCell>
            <TableCell>{support ? <><Badge className="whitespace-nowrap" tone={support.status === 'discontinued' ? 'danger' : support.status === 'scheduled' ? 'warning' : 'success'}>{support.status === 'discontinued' ? 'Discontinuado' : support.status === 'scheduled' ? 'Próximo fin' : 'Soporte vigente'}</Badge><Muted className="mt-1">{support.endsAt ? `Fin: ${formatDate(support.endsAt)}` : support.sourceName}</Muted></> : <Badge className="whitespace-nowrap">Sin registro Canon</Badge>}</TableCell>
          </TableRow>;
        })}</TableBody>
      </Table>
      {paged.totalPages > 1 && <PaginationControls label="Paginación de equipos del contrato" page={paged.page} pageSize={paged.pageSize} total={paged.total} pageSizeOptions={[25, 50, 100]} onPageChange={paged.setPage} onPageSizeChange={paged.setPageSize} />}
    </div>
  );
}

function formatContractMetadata(contract: ContractRecord): string {
  const values = [
    contract.orderReference ? `OV ${contract.orderReference}` : '',
    contract.commercialArea ? `Área contrato ${contract.commercialArea}` : '',
    contract.division ? `División ${contract.division}` : '',
    contract.isActive === false ? 'No vigente' : contract.isActive === true ? 'Vigente' : '',
    contract.requiresClosure === true ? 'Requiere cierre' : '',
  ].filter(Boolean);
  return values.join(' · ') || 'Metadatos de contrato pendientes';
}

function formatDateRange(startsAt: string | null, endsAt: string | null): string {
  return `${startsAt ? formatDate(startsAt) : 'Sin inicio'} → ${endsAt ? formatDate(endsAt) : 'abierto'}`;
}

function bytesToBase64(bytes: Uint8Array): string {
  let binary = '';
  const chunkSize = 0x8000;
  for (let offset = 0; offset < bytes.length; offset += chunkSize) {
    binary += String.fromCharCode(...bytes.subarray(offset, offset + chunkSize));
  }
  return btoa(binary);
}
