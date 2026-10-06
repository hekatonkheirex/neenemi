import { useEffect, useMemo, useState, useTransition } from 'react';
import type { ChangeEvent } from 'react';
import { HugeiconsIcon } from '@hugeicons/react';
import AnimatedTabs from '../../core/AnimatedTabs';
import {
  Alert02Icon,
  Package01Icon,
  Tick02Icon,
  Upload01Icon,
} from '@hugeicons/core-free-icons';
import { exportCustomerPortfolio, exportOperationsWorkbook } from './export';
import { submitImportJob, type ImportJobSnapshot } from '../../core/import-job-client';
import { SOURCE_CATALOG, sourceMatchesDefinition } from '../../core/source-catalog';
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

const numberFormat = new Intl.NumberFormat('es-PY', { maximumFractionDigits: 0 });
const customerTypes: readonly CustomerType[] = ['Publico', 'Privado'];
const commercialAreas: readonly CommercialArea[] = ['Strategic', 'Commercial'];
const contractTypes: readonly ContractType[] = ['Alquiler', 'Abierto', 'Mantenimiento', 'Leasing'];
const contractTypeClasses: Record<ContractType, string> = {
  Alquiler: 'alquiler',
  Abierto: 'abierto',
  Mantenimiento: 'mantenimiento',
  Leasing: 'leasing',
};
const customerPageSize = 50;

type ImportBatchSummary = {
  id: string;
  domain: string;
  sourceName: string;
  sourceType: string | null;
  status: 'staged' | 'applied' | 'failed';
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
    title: 'Cargar datos Superset (SGS – Contratos/Equipos en contratos)',
    actionLabel: 'Importar cartera XLSX',
    multiple: true,
  },
  {
    sourceId: 'fleet.customer-classification',
    title: 'Cargar clasificación de clientes',
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
    <article className="source-data-source-card discontinuation-source-card">
      <div className="source-data-source-heading">
        <span className="detail-label">{title}</span>
      </div>
      <div>
        <span className="discontinuation-source-card-label">Archivo esperado</span>
        <strong>{source.expectedFiles.join(' · ')}</strong>
      </div>
      <p><span className="discontinuation-source-card-label">Origen</span>{source.origin}</p>
      <small><span className="discontinuation-source-card-label">Qué alimenta</span>{source.purpose}</small>
      <div className="discontinuation-source-loaded">
        <span className="discontinuation-source-card-label">Archivos cargados</span>
        {loadingBatches ? <span className="discontinuation-source-loaded-empty">Consultando estado…</span> : null}
        {!loadingBatches && sourceBatchesError ? <span className="discontinuation-source-loaded-empty">No se pudo consultar el estado de carga.</span> : null}
        {!loadingBatches && !sourceBatchesError && loadedBatches.length === 0 ? <span className="discontinuation-source-loaded-empty">Sin archivo cargado</span> : null}
        {!loadingBatches && !sourceBatchesError && loadedBatches.length > 0 ? (
          <ul className="discontinuation-source-loaded-list">
            {loadedBatches.map((batch) => <li key={batch.id} title={batch.sourceName}><HugeiconsIcon icon={Tick02Icon} size={14} strokeWidth={2.5} aria-hidden="true" /><strong>{batch.sourceName}</strong></li>)}
          </ul>
        ) : null}
      </div>
      <UploadButton
        busy={busy}
        label={actionLabel}
        accept=".xlsx,application/vnd.openxmlformats-officedocument.spreadsheetml.sheet"
        multiple={multiple}
        onChange={onChange}
        disabled={disabled}
      />
    </article>
  );
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
        ? importBatches.filter((batch) => batch.status === 'applied' && sourceMatchesDefinition(source, batch.sourceName, batch.sourceType, batch.domain))
        : [];
      return [sourceId, batches] as const;
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

  return (
    <div className="page-content operations-page">
      <section className="catalog-header discontinuation-page-header">
        <div>
          <div className="eyebrow">OPERACIONES / CICLO DE VIDA</div>
          <h1>{activeView === 'discontinued' ? 'Equipos discontinuados' : activeView === 'stock' ? 'Stock Waldbott' : 'Archivos del flujo de discontinuación'}</h1>
          <p className="lead">{activeView === 'discontinued' ? 'Identifica contratos que requieren revisión y prioriza los modelos afectados.' : activeView === 'stock' ? 'Cruza el stock recuperable con el soporte Canon y la cartera instalada.' : 'Conserva cada exportación, muestra su origen y deja las filas originales disponibles para inspección.'}</p>
        </div>
        {activeView === 'discontinued' && <div className="discontinuation-header-metric"><strong>{numberFormat.format(portfolioStats.discontinued)}</strong><span>equipos discontinuados</span></div>}
        {activeView === 'uploads' && <div className="discontinuation-header-metric is-neutral"><strong>{loadedSourceCount}</strong><span>cargas activas</span></div>}
      </section>

      <AnimatedTabs
        ariaLabel="Vistas del Discontinuador"
        active={activeView}
        onChange={setActiveView}
        tabs={[
          { id: 'discontinued', label: 'Discontinuados', icon: Alert02Icon, count: numberFormat.format(portfolioStats.discontinued) },
          { id: 'stock', label: 'Stock Waldbott', icon: Package01Icon, count: numberFormat.format(stockItems.length) },
          { id: 'uploads', label: 'Carga', icon: Upload01Icon, count: loadedSourceCount },
        ]}
      />

      {(activeView === 'uploads' || error || message || loading || importProgress) && <section className="sales-status" aria-live="polite">
        <span className={`status-dot ${error ? 'error' : loading || importProgress ? 'pending' : 'ready'}`} />
        <span>{error || message || (importProgress ? `${importProgress.currentFile}/${importProgress.totalFiles} archivo(s) · ${importProgress.progress}% · ${importProgress.stage}` : loading ? 'Consultando modelos Canon y base instalada…' : `${modelItems.length} modelos Canon para cruce`)}</span>
      </section>}

      {importProgress ? <section className="discontinuation-import-progress" aria-label="Progreso de importación">
        <div className="discontinuation-import-progress-heading">
          <span>{importProgress.sourceName}</span>
          <strong>{importProgress.progress}%</strong>
        </div>
        <div className="discontinuation-import-progress-track" role="progressbar" aria-valuemin={0} aria-valuemax={100} aria-valuenow={importProgress.progress}>
          <span style={{ width: `${importProgress.progress}%` }} />
        </div>
        <small>Archivo {importProgress.currentFile} de {importProgress.totalFiles} · {importProgress.stage}</small>
      </section> : null}

      {activeView === 'uploads' && <>
        <section className="source-data-panel discontinuation-source-panel" aria-labelledby="discontinuation-source-title">
          <div className="source-data-heading">
            <div>
              <div className="eyebrow">FUENTES DE CARGA</div>
              <h2 id="discontinuation-source-title">Archivos del flujo de discontinuación</h2>
              <p>Selecciona cada exportación desde su origen indicado. La Suite conserva el archivo original, normaliza los campos necesarios y deja las filas completas disponibles para inspección.</p>
            </div>
            <div className="source-data-note">
              <strong>4</strong>
              <span>fuentes documentadas</span>
            </div>
          </div>
          <div className="source-data-source-grid discontinuation-source-grid">
            <DiscontinuationSourceCard {...discontinuationSourceCards[0]} busy={importingPortfolio} disabled={sourceActionsDisabled} loadedBatches={loadedBatchesBySource.get('fleet.equipment') ?? []} loadingBatches={loadingImportBatches} sourceBatchesError={sourceBatchesError} onChange={(event) => void importLegacyPortfolio(event)} />
            <DiscontinuationSourceCard {...discontinuationSourceCards[1]} busy={importingClassification} disabled={sourceActionsDisabled} loadedBatches={loadedBatchesBySource.get('fleet.customer-classification') ?? []} loadingBatches={loadingImportBatches} sourceBatchesError={sourceBatchesError} onChange={(event) => void importCustomerClassification(event)} />
            <DiscontinuationSourceCard {...discontinuationSourceCards[2]} busy={importingCanon} disabled={sourceActionsDisabled} loadedBatches={loadedBatchesBySource.get('discontinuation.canon') ?? []} loadingBatches={loadingImportBatches} sourceBatchesError={sourceBatchesError} onChange={(event) => void importCanonDiscontinuation(event)} />
            <DiscontinuationSourceCard {...discontinuationSourceCards[3]} busy={importingWaldbott} disabled={sourceActionsDisabled} loadedBatches={loadedBatchesBySource.get('discontinuation.waldbott') ?? []} loadingBatches={loadingImportBatches} sourceBatchesError={sourceBatchesError} onChange={(event) => void importWaldbottStock(event)} />
          </div>
          <div className="discontinuation-source-actions">
            <button className="secondary-button" type="button" onClick={() => void clearExclusiveImports()} disabled={sourceActionsDisabled || (modelItems.length === 0 && stockItems.length === 0)}>{clearingExclusiveImports ? 'Limpiando listas…' : 'Limpiar listas Canon / stock'}</button>
            <button className="secondary-button" type="button" onClick={() => void refresh()} disabled={loading || clearingExclusiveImports}>{loading ? 'Actualizando…' : 'Actualizar alertas'}</button>
          </div>
        </section>

        <LegacySourceDataPanel key={sourceDataRefreshKey} />
      </>}

      {activeView === 'discontinued' && <section className="sales-card discontinuation-portfolio-card">
        <div className="card-heading">
          <div><div className="eyebrow">FILTRO GENERAL</div><h2>Segmentar cartera</h2><p className="analysis-meta">Combina tipo de contrato, cliente y área comercial para priorizar los equipos afectados.</p></div>
          <div className="discontinuation-portfolio-heading-actions">
          <label className="search-field compact-search"><span>Buscar cartera</span><input value={customerQuery} onChange={(event) => { setCustomerQuery(event.target.value); setVisibleCustomerCount(customerPageSize); }} placeholder="Cliente, contrato, OV, serie…" /></label>
            <ExportButton busy={exportingPortfolio} onClick={() => void exportPortfolio()} disabled={exportCustomers.length === 0}>Exportar cartera XLSX</ExportButton>
          </div>
        </div>

        <div className="discontinuation-filter-bar" aria-label="Filtros de cartera" aria-busy={isFilterPending}>
          <FilterGroup label="Tipo de contrato" value={contractFilter} values={['Todos', ...contractTypes]} onChange={applyContractFilter} disabled={isFilterPending} />
          <FilterGroup label="Tipo de cliente" value={customerTypeFilter} values={['Todos', ...customerTypes]} onChange={applyCustomerTypeFilter} disabled={isFilterPending} />
          <FilterGroup label="Área comercial" value={commercialAreaFilter} values={['Todos', ...commercialAreas]} onChange={applyCommercialAreaFilter} disabled={isFilterPending} />
          <button className="secondary-button filter-reset-button" type="button" onClick={resetPortfolioFilters} disabled={isFilterPending}>Limpiar filtros</button>
        </div>

        <div className="discontinuation-portfolio-stats" aria-label="Indicadores de cartera filtrada">
          <div><span>Clientes</span><strong>{numberFormat.format(portfolioStats.customers)}</strong></div>
          <div><span>Equipos relevados</span><strong>{numberFormat.format(portfolioStats.equipment)}</strong></div>
          <div className="is-critical"><span>Discontinuados</span><strong>{numberFormat.format(portfolioStats.discontinued)}</strong></div>
          <div className={portfolioStats.scheduled > 0 ? 'is-warning' : ''}><span>Próximos a fin de soporte</span><strong>{numberFormat.format(portfolioStats.scheduled)}</strong></div>
        </div>

        <section className="discontinuation-insights" aria-label="Resumen gráfico de cartera">
          <article className="discontinuation-insight-card">
            <div className="discontinuation-insight-heading">
              <div><div className="eyebrow">PARQUE INSTALADO</div><h3>Estado Canon</h3><p>Soporte de los equipos incluidos en los filtros actuales.</p></div>
              <span>{numberFormat.format(portfolioStats.equipment)} equipos</span>
            </div>
            <div className="discontinuation-chart-content">
              <div className="discontinuation-donut" role="img" aria-label={`${portfolioStats.discontinued} equipos discontinuados, ${portfolioStats.scheduled} próximos a vencer y ${portfolioStats.supported} con soporte vigente`} style={{ background: portfolioChart }}>
                <div><strong>{numberFormat.format(portfolioStats.equipment)}</strong><span>equipos</span></div>
              </div>
              <div className="discontinuation-chart-legend">
                <span><i className="discontinuation-legend-dot discontinued" />Discontinuados <b>{numberFormat.format(portfolioStats.discontinued)}</b></span>
                <span><i className="discontinuation-legend-dot scheduled" />Próximo fin <b>{numberFormat.format(portfolioStats.scheduled)}</b></span>
                <span><i className="discontinuation-legend-dot unmatched" />Soporte vigente <b>{numberFormat.format(portfolioStats.supported)}</b></span>
              </div>
            </div>
          </article>
          <PortfolioBreakdownCard eyebrow="EQUIPOS POR CONTRATO" title="Distribución por tipo" description="Equipos instalados según el tipo de contrato." values={portfolioStats.equipmentByContractType} />
          <PortfolioBreakdownCard eyebrow="CONTRATOS POR TIPO" title="Cantidad de contratos" description="Contratos incluidos en la selección actual." values={portfolioStats.contractsByType} />
        </section>

        <section className="discontinuation-models" aria-labelledby="discontinuation-models-title">
          <div className="discontinuation-models-heading">
            <div><div className="eyebrow">MODELOS IDENTIFICADOS</div><h2 id="discontinuation-models-title">Canon discontinuados en la cartera</h2><p>Modelos con fin de soporte que aparecen en los equipos filtrados.</p></div>
            <span className="discontinuation-model-count"><strong>{discontinuedModels.length}</strong> modelos</span>
          </div>
          {discontinuedModels.length > 0 ? <div className="discontinuation-model-grid">
            {discontinuedModels.map((model) => <article className="discontinuation-model-card" key={model.modelLabel}>
              <div className="discontinuation-model-card-heading"><span className="badge alert">Discontinuado</span><strong>{numberFormat.format(model.equipmentCount)} equipos</strong></div>
              <h3>{model.modelLabel}</h3>
              <small>{model.endsAt ? `Fin de soporte: ${formatDate(model.endsAt)}` : 'Fin de soporte sin fecha'}</small>
            </article>)}
          </div> : <p className="empty-inline">No hay modelos discontinuados en la cartera filtrada.</p>}
        </section>

        <div className="discontinuation-portfolio-grid">
          <aside className="discontinuation-customer-directory" aria-label="Clientes de la cartera">
            <div className="discontinuation-directory-heading"><strong>Clientes</strong><span>{numberFormat.format(filteredCustomers.length)} encontrados</span></div>
            <div className="discontinuation-customer-list">
              {visibleCustomers.map((customer) => {
                const alertCount = customerAlertCounts.get(customer.id) ?? 0;
                const customerContracts = contractFilter === 'Todos' ? customer.contracts : customer.contracts.filter((contract) => contract.contractType === contractFilter);
                const equipmentCount = customerContracts.reduce((total, contract) => total + contract.equipment.length, 0);
                return <button className={`discontinuation-customer ${selectedCustomer?.id === customer.id ? 'selected' : ''}`} type="button" key={customer.id} onClick={() => setSelectedCustomerId(customer.id)}><span><strong>{customer.name}</strong><small>{customerContracts.length} contrato{customerContracts.length === 1 ? '' : 's'} · {equipmentCount} equipo{equipmentCount === 1 ? '' : 's'}</small></span><b className={alertCount > 0 ? 'has-alert' : ''}>{alertCount > 0 ? `${alertCount} alertas` : 'Sin alertas'}</b></button>;
              })}
              {remainingCustomers > 0 && <button className="text-button directory-more-button" type="button" onClick={() => setVisibleCustomerCount((current) => current + customerPageSize)}>Ver {Math.min(customerPageSize, remainingCustomers)} clientes más</button>}
              {visibleCustomers.length === 0 && <p className="empty-inline">{loading ? 'Cargando cartera…' : 'No hay clientes para este filtro.'}</p>}
            </div>
          </aside>

          <div className="discontinuation-customer-detail">
            {selectedCustomer ? <CustomerPortfolioDetail customer={selectedCustomer} contractFilter={contractFilter} supportByModel={modelSupportByLabel} alertCount={customerAlertCounts.get(selectedCustomer.id) ?? 0} exporting={exportingCustomerId === selectedCustomer.id} onExport={() => void exportCustomer(selectedCustomer)} /> : <div className="empty-inline">Importa una cartera para consultar contratos y equipos por cliente.</div>}
          </div>
        </div>
      </section>}

      {activeView === 'discontinued' && <>
      <section className="sales-card">
        <div className="card-heading">
          <div><div className="eyebrow">SOPORTE CANON + BASE INSTALADA</div><h2>Modelos de impresoras discontinuados</h2></div>
          <span className="analysis-meta">Se conservan registros de modelo aunque la lista no traiga código de parte.</span>
        </div>
        <div className="catalog-table-wrap">
          <table className="catalog-table operations-table discontinuation-table">
            <thead><tr><th>Modelo</th><th>Código de parte</th><th>Tensión</th><th>Fecha fin</th><th>Equipos instalados</th><th>Notas de fuente</th><th>Estado</th></tr></thead>
            <tbody>
              {pagedModelItems.items.map((item) => <tr key={item.id} className={item.status === 'discontinued' ? 'is-discontinued' : undefined}>
                <td><span className="code-cell">{item.modelLabel}</span><small className="table-secondary-text" title={item.sourceLabel ?? item.sourceName}>{item.sourceLabel ?? item.sourceName}</small></td>
                <td>{item.partCode || <span className="muted-note">Sin código</span>}</td>
                <td>{item.voltage || <span className="muted-note">Sin dato</span>}</td>
                <td>{item.endsAt ? formatDate(item.endsAt) : <span className="muted-note">Sin fecha</span>}</td>
                <td>{item.installedCount > 0 ? <span className="impact-label">{item.installedCount} equipo{item.installedCount === 1 ? '' : 's'}<small>{item.installedModels.join(', ')}</small></span> : <span className="muted-note">Sin coincidencias</span>}</td>
                <td>{item.sourceNotes.length > 0 ? <span className="source-cell" title={item.sourceNotes.join(' · ')}>{item.sourceNotes.join(' · ')}</span> : <span className="muted-note">Sin notas</span>}</td>
                <td><span className={`badge ${item.status === 'discontinued' ? 'alert' : 'warning'}`}>{item.status === 'discontinued' ? 'Discontinuado' : 'Programado'}</span></td>
              </tr>)}
              {visibleModelItems.length === 0 && <tr><td colSpan={7} className="empty-cell">{loading ? 'Cargando…' : 'Importa una lista Canon XLSX para consultar modelos y fechas de soporte.'}</td></tr>}
            </tbody>
          </table>
        </div>
        {pagedModelItems.totalPages > 1 && <PaginationControls label="Paginación de modelos discontinuados" page={pagedModelItems.page} pageSize={pagedModelItems.pageSize} total={pagedModelItems.total} pageSizeOptions={[50, 100, 250]} onPageChange={pagedModelItems.setPage} onPageSizeChange={pagedModelItems.setPageSize} />}
      </section>
      </>}

      {activeView === 'stock' && <section className="sales-card">
        <div className="card-heading">
          <div><div className="eyebrow">WALDBOTT + SOPORTE CANON</div><h2>Stock recuperable</h2></div>
          <span className="analysis-meta">
            {stockItems.length
              ? `${numberFormat.format(stockUnits)} unidades en ${stockItems.length} modelos. ${numberFormat.format(rescueStockUnits)} unidades tienen soporte Canon discontinuado.`
              : 'Solo se considera el Depósito 04. Las filas de proyectores, Epson, Casio, BenQ y pantallas interactivas quedan fuera.'}
          </span>
        </div>
        <div className="catalog-table-wrap">
          <table className="catalog-table operations-table stock-table">
            <thead><tr><th>Modelo</th><th className="align-right">Unidades</th><th>Canon</th><th>Fecha fin</th><th>Base instalada</th><th>Fuente</th></tr></thead>
            <tbody>
              {visibleStockItems.map((item) => <tr key={item.id}>
                <td><span className="code-cell">{item.modelLabel}</span>{item.canonModelLabel && item.canonModelLabel !== item.modelLabel ? <small className="table-secondary-text">Canon: {item.canonModelLabel}</small> : null}</td>
                <td className="align-right">{numberFormat.format(item.quantity)}</td>
                <td><span className={`badge ${stockStatusClass(item.canonStatus)}`}>{formatStockStatus(item.canonStatus)}</span></td>
                <td>{item.canonEndsAt ? formatDate(item.canonEndsAt) : <span className="muted-note">Sin fecha</span>}</td>
                <td>{item.installedCount > 0 ? <span className="impact-label">{item.installedCount} equipo{item.installedCount === 1 ? '' : 's'}<small>{item.installedModels.join(', ')}</small></span> : <span className="muted-note">Sin coincidencias</span>}</td>
                <td><span className="source-cell" title={item.sourceNames.join(', ')}>{item.sourceNames.join(', ')}</span></td>
              </tr>)}
              {visibleStockItems.length === 0 && <tr><td colSpan={6} className="empty-cell">{loading ? 'Cargando…' : 'Importa el stock Waldbott XLSX para cruzar unidades recuperables con soporte Canon y cartera instalada.'}</td></tr>}
            </tbody>
          </table>
        </div>
      </section>
      }

      <p className="scope-note">La suite cruza stock, listas de modelos Canon y equipos instalados con las reglas disponibles del legado. El proyecto original no definía sustitutos automáticos; para no inventar equivalencias, los modelos sin cruce se muestran como pendientes de revisión.</p>
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

function stockStatusClass(status: WaldbottStockRecord['canonStatus']): string {
  if (status === 'discontinued') return 'alert';
  if (status === 'scheduled') return 'warning';
  return 'neutral';
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
  return <div className="discontinuation-filter-group"><span>{label}</span><div className="discontinuation-filter-options" aria-label={label}>{values.map((option) => <button type="button" key={option} className={option === value ? 'active' : ''} aria-pressed={option === value} disabled={disabled} onClick={() => onChange(option)}>{option === 'Publico' ? 'Público' : option}</button>)}</div></div>;
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
    <article className="discontinuation-insight-card">
      <div className="discontinuation-insight-heading"><div><div className="eyebrow">{eyebrow}</div><h3>{title}</h3><p>{description}</p></div></div>
      <div className="discontinuation-breakdown-list">
        {values.map((value) => <div className="discontinuation-breakdown-item" key={value.type}>
          <div><span>{value.type}</span><b>{numberFormat.format(value.amount)}</b></div>
          <div className="discontinuation-breakdown-track"><span className={`discontinuation-breakdown-fill ${contractTypeClasses[value.type]}`} style={{ width: `${(value.amount / maximum) * 100}%` }} /></div>
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
    <div>
      <div className="discontinuation-customer-detail-header">
        <div><div className="eyebrow">CLIENTE SELECCIONADO</div><h3>{customer.name}</h3><p>{customer.customerType ?? 'Sin tipo'} · {customer.commercialArea ?? 'Sin área comercial'}</p><SourceDetails details={customer.sourceDetails} /></div>
        <ExportButton busy={exporting} onClick={onExport}>Exportar cliente XLSX</ExportButton>
      </div>
      <div className="discontinuation-customer-meta"><span><strong>{numberFormat.format(contracts.length)}</strong> contratos</span><span><strong>{numberFormat.format(equipmentCount)}</strong> equipos</span><span className={alertCount > 0 ? 'has-alert' : ''}><strong>{numberFormat.format(alertCount)}</strong> alertas de soporte</span></div>
      <div className="discontinuation-contract-detail-list">
        {contracts.map((contract) => <details className="discontinuation-contract-detail" open key={contract.id}>
          <summary><span><b>{contract.reference || 'Sin referencia'}</b><small>{contract.contractType} · {formatDateRange(contract.startsAt, contract.endsAt)}</small></span><em>{contract.equipment.length} equipo{contract.equipment.length === 1 ? '' : 's'}</em><span className="discontinuation-contract-toggle"><span className="when-open">Contraer equipos</span><span className="when-closed">Ver equipos</span></span></summary>
          <div className="discontinuation-contract-meta">{formatContractMetadata(contract)}<SourceDetails details={contract.sourceDetails} /></div>
          <ContractEquipmentTable equipment={contract.equipment} supportByModel={supportByModel} />
        </details>)}
        {contracts.length === 0 && <p className="empty-inline">Sin contratos registrados para este filtro.</p>}
      </div>
    </div>
  );
}

/** Equipos de un contrato, de a 50: un cliente grande llega a cientos de filas con detalle de origen cada una. */
function ContractEquipmentTable({ equipment, supportByModel }: { equipment: ContractRecord['equipment']; supportByModel: ReadonlyMap<string, ModelDiscontinuationRecord | undefined> }) {
  const paged = usePagedList(equipment, 50);
  return (
    <>
      <div className="catalog-table-wrap">
        <table className="catalog-table operations-table discontinuation-equipment-table">
          <thead><tr><th>Equipo</th><th>Serie</th><th>Ubicación</th><th>Ciudad / dirección</th><th>Estado Canon</th></tr></thead>
          <tbody>{paged.items.map((equipment) => {
            const support = supportByModel.get(equipment.modelLabel);
            return <tr key={equipment.id}>
              <td><span className="code-cell">{equipment.modelLabel}</span><small className="table-secondary-text">{[equipment.brand, equipment.description].filter(Boolean).join(' · ') || 'Sin descripción de origen'}</small><SourceDetails details={equipment.sourceDetails} /></td>
              <td>{equipment.serialNumber || 'Sin serie'}</td>
              <td><span>{equipment.interior || equipment.location || 'Sin ubicación'}</span><small className="table-secondary-text">{equipment.branch || 'Sin sucursal'}</small></td>
              <td><span>{equipment.city || 'Sin ciudad'}</span><small className="table-secondary-text">{equipment.address || 'Sin dirección'}</small></td>
              <td>{support ? <><span className={`badge ${support.status === 'discontinued' ? 'alert' : support.status === 'scheduled' ? 'warning' : 'ok'}`}>{support.status === 'discontinued' ? 'Discontinuado' : support.status === 'scheduled' ? 'Próximo fin' : 'Soporte vigente'}</span><small className="table-secondary-text">{support.endsAt ? `Fin: ${formatDate(support.endsAt)}` : support.sourceName}</small></> : <span className="badge neutral">Sin registro Canon</span>}</td>
            </tr>;
          })}</tbody>
        </table>
      </div>
      {paged.totalPages > 1 && <PaginationControls label="Paginación de equipos del contrato" page={paged.page} pageSize={paged.pageSize} total={paged.total} pageSizeOptions={[25, 50, 100]} onPageChange={paged.setPage} onPageSizeChange={paged.setPageSize} />}
    </>
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
