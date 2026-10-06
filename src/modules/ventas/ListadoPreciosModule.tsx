import { useEffect, useMemo, useRef, useState } from 'react';
import { importCatalogFile } from '../catalogo/import-file';
import { loadLegacyPriceListSeed } from '../catalogo/legacy-seed';
import { normalizeModelName, type CatalogFamilySummary, type CatalogModelNote, type CatalogServiceItem, type CatalogSourceFile } from '../catalogo/repository';
import { exportPriceList } from './export';
import { countItemsByModel } from './model-counts';
import { addToSelection, MAX_PRICE_LIST_SELECTION, selectionNeedsSave } from './selection-sync';
import type { PricingSettings, SalesPricePart } from './types';
import { confirmAction } from '../../core/confirm';
import { useUnsavedChanges } from '../../core/unsavedChanges';
import { getSharedJson, readJson, toErrorMessage } from '../../core/http';
import { memoizeString } from '../../core/memoize';
import PaginationControls from '../../core/PaginationControls';
import { usePagedList } from '../../core/usePagedList';
import { DownloadIcon, ExportButton, UploadButton } from '../../core/ActionButtons';
import { Check, Minus, RotateCcw, Save } from 'lucide-react';
import { Button } from '../../core/ui/button';
import { Badge } from '../../core/ui/badge';
import { Card, CardHeader, Muted } from '../../core/ui/card';
import { Input } from '../../core/ui/input';
import { PageHeader } from '../../core/ui/page-header';
import { StatusLine } from '../../core/ui/status-line';
import { Table, TableBody, TableCell, TableHead, TableHeader, TableRow } from '../../core/ui/table';

const fieldClassName = 'grid min-w-0 gap-2 text-sm font-semibold text-navy dark:text-white';
const selectClassName = 'h-10 w-full min-w-0 rounded-xl border border-navy/20 bg-white px-3 text-sm text-navy dark:border-sky/30 dark:bg-navy/50 dark:text-white';
const checkboxClassName = 'flex min-w-0 items-center gap-2 text-sm text-navy dark:text-white';

const numberFormat = new Intl.NumberFormat('es-PY', { maximumFractionDigits: 0 });
const decimalFormat = new Intl.NumberFormat('es-PY', { minimumFractionDigits: 2, maximumFractionDigits: 4 });
const UNASSIGNED_FAMILY = '__sin-familia__';

export default function ListadoPreciosModule() {
  const [items, setItems] = useState<SalesPricePart[]>([]);
  const [allItems, setAllItems] = useState<SalesPricePart[]>([]);
  const [serviceItems, setServiceItems] = useState<CatalogServiceItem[]>([]);
  const [modelNotes, setModelNotes] = useState<CatalogModelNote[]>([]);
  const [families, setFamilies] = useState<CatalogFamilySummary[]>([]);
  const [sourceFile, setSourceFile] = useState<CatalogSourceFile | null>(null);
  const [pricing, setPricing] = useState<PricingSettings | null>(null);
  const [draftPricing, setDraftPricing] = useState<PricingSettings | null>(null);
  const pricingDirty = draftPricing !== null && JSON.stringify(draftPricing) !== JSON.stringify(pricing);
  useUnsavedChanges(pricingDirty);
  const [query, setQuery] = useState('');
  const [modelName, setModelName] = useState('');
  const [familyName, setFamilyName] = useState('');
  const [stockOnly, setStockOnly] = useState(false);
  const [selectedModels, setSelectedModels] = useState<string[]>([]);
  const [selectionQuery, setSelectionQuery] = useState('');
  const [onlySelected, setOnlySelected] = useState(false);
  const [loading, setLoading] = useState(true);
  const [allItemsLoading, setAllItemsLoading] = useState(true);
  const [legacyCatalogLoading, setLegacyCatalogLoading] = useState(true);
  const [saving, setSaving] = useState(false);
  const [restoringSeed, setRestoringSeed] = useState(false);
  const [importingCatalog, setImportingCatalog] = useState(false);
  const [refreshVersion, setRefreshVersion] = useState(0);
  const [selectionReady, setSelectionReady] = useState(false);
  const [savingSelection, setSavingSelection] = useState(false);
  const persistedSelection = useRef<string[] | null>(null);
  const [message, setMessage] = useState('');
  const [error, setError] = useState<string | null>(null);

  useEffect(() => {
    fetch('/api/sales/pricing')
      .then(async (response) => {
        if (!response.ok) throw new Error('No se pudo cargar la configuración comercial.');
        return (await response.json()) as PricingSettings;
      })
      .then((value) => {
        setPricing(value);
        setDraftPricing(value);
      })
      .catch((requestError: unknown) => setError(toErrorMessage(requestError)));
  }, []);

  useEffect(() => {
    const controller = new AbortController();
    setAllItemsLoading(true);
    getSharedJson<SalesPricePart[]>('/api/sales/price-list')
      .then((value) => { if (!controller.signal.aborted) setAllItems(value); })
      .catch((requestError: unknown) => {
        if (!controller.signal.aborted) setError(`No se pudo cargar el catálogo completo de precios. ${toErrorMessage(requestError)}`);
      })
      .finally(() => { if (!controller.signal.aborted) setAllItemsLoading(false); });

    return () => controller.abort();
  }, [refreshVersion]);

  useEffect(() => {
    const controller = new AbortController();
    fetch('/api/catalog/source', { signal: controller.signal })
      .then(async (response) => {
        if (!response.ok) throw new Error('No se pudo consultar el archivo original del catálogo.');
        return (await response.json()) as CatalogSourceFile | null;
      })
      .then(setSourceFile)
      .catch((requestError: unknown) => {
        if (requestError instanceof DOMException && requestError.name === 'AbortError') return;
        setError(toErrorMessage(requestError));
      });

    return () => controller.abort();
  }, [refreshVersion]);

  useEffect(() => {
    const controller = new AbortController();
    setLegacyCatalogLoading(true);
    Promise.all([
      fetch('/api/catalog/service-items', { signal: controller.signal }).then(async (response) => {
        if (!response.ok) throw new Error('No se pudieron cargar los servicios heredados del catálogo.');
        return await response.json() as CatalogServiceItem[];
      }),
      fetch('/api/catalog/model-notes', { signal: controller.signal }).then(async (response) => {
        if (!response.ok) throw new Error('No se pudieron cargar las notas de modelos del catálogo.');
        return await response.json() as CatalogModelNote[];
      }),
      fetch('/api/catalog/families', { signal: controller.signal }).then(async (response) => {
        if (!response.ok) throw new Error('No se pudieron cargar las familias del catálogo.');
        return await response.json() as CatalogFamilySummary[];
      }),
    ])
      .then(([loadedServiceItems, loadedModelNotes, loadedFamilies]) => {
        setServiceItems(loadedServiceItems);
        setModelNotes(loadedModelNotes);
        setFamilies(loadedFamilies);
      })
      .catch((requestError: unknown) => {
        if (requestError instanceof DOMException && requestError.name === 'AbortError') return;
        setError(toErrorMessage(requestError));
      })
      .finally(() => setLegacyCatalogLoading(false));

    return () => controller.abort();
  }, [refreshVersion]);

  useEffect(() => {
    const controller = new AbortController();
    fetch('/api/sales/price-list-selection', { signal: controller.signal })
      .then(async (response) => {
        if (!response.ok) throw new Error('No se pudo cargar la selección de modelos.');
        return (await response.json()) as { modelNames?: unknown };
      })
      .then((body) => {
        const loaded = Array.isArray(body.modelNames) ? body.modelNames.filter((value): value is string => typeof value === 'string') : [];
        persistedSelection.current = loaded;
        setSelectedModels(loaded);
        setSelectionReady(true);
      })
      .catch((requestError: unknown) => {
        if (requestError instanceof DOMException && requestError.name === 'AbortError') return;
        setError(toErrorMessage(requestError));
        setSelectionReady(true);
      });

    return () => controller.abort();
  }, []);

  useEffect(() => {
    const controller = new AbortController();
    const params = new URLSearchParams();
    if (query.trim()) params.set('query', query.trim());
    if (familyName && familyName !== UNASSIGNED_FAMILY) params.set('familyName', familyName);
    if (modelName.trim()) params.set('modelName', modelName.trim());
    if (stockOnly) params.set('stockOnly', 'true');

    setLoading(true);
    const queryString = params.toString();
    // Sin filtros es la misma URL que pide el catálogo completo: se comparte una sola descarga.
    getSharedJson<SalesPricePart[]>(queryString ? `/api/sales/price-list?${queryString}` : '/api/sales/price-list')
      .then((value) => { if (!controller.signal.aborted) setItems(value); })
      .catch((requestError: unknown) => {
        if (!controller.signal.aborted) setError(`No se pudo consultar el listado de precios. ${toErrorMessage(requestError)}`);
      })
      .finally(() => { if (!controller.signal.aborted) setLoading(false); });

    return () => controller.abort();
  }, [familyName, query, modelName, stockOnly, refreshVersion]);

  const availableModels = useMemo(
    () => uniqueModelLabels(allItems.length > 0 ? allItems : items, serviceItems),
    [allItems, items, serviceItems],
  );
  const knownFamilyModelKeys = useMemo(
    () => new Set(families.flatMap((family) => family.modelNames.map(normalizeModelText))),
    [families],
  );
  const familyModelKeys = useMemo<Set<string> | null>(() => {
    if (!familyName) return null;
    if (familyName === UNASSIGNED_FAMILY) {
      return new Set(availableModels.filter((model) => !knownFamilyModelKeys.has(normalizeModelText(model))).map(normalizeModelText));
    }
    const family = families.find((candidate) => normalizeModelText(candidate.familyName) === normalizeModelText(familyName));
    return new Set(family?.modelNames.map(normalizeModelText) ?? []);
  }, [availableModels, families, familyName, knownFamilyModelKeys]);
  const familyOptions = useMemo(() => {
    const options = families.map((family) => ({
      value: family.familyName,
      label: `${family.familyName} · ${numberFormat.format(family.modelNames.length)} modelos${family.exchangeRate ? ` · T.C. ${numberFormat.format(family.exchangeRate)}` : ''}`,
    }));
    const hasUnassignedModels = availableModels.some((model) => !knownFamilyModelKeys.has(normalizeModelText(model)));
    if (hasUnassignedModels) options.push({ value: UNASSIGNED_FAMILY, label: 'Sin familia identificada' });
    return options;
  }, [availableModels, families, knownFamilyModelKeys]);
  const selectedFamily = useMemo(
    () => families.find((family) => normalizeModelText(family.familyName) === normalizeModelText(familyName)) ?? null,
    [families, familyName],
  );
  const selectedFamilyOverride = selectedFamily
    ? pricing?.familyExchangeRateOverrides?.[normalizeModelName(selectedFamily.familyName)]
    : undefined;
  const selectedFamilyExchangeRate = selectedFamilyOverride ?? selectedFamily?.exchangeRate ?? pricing?.exchangeRate ?? null;
  const visibleModelOptions = useMemo(() => {
    const normalizedQuery = normalizeModelText(selectionQuery);
    return availableModels.filter((model) => (
      (!familyModelKeys || familyModelKeys.has(normalizeModelText(model))) &&
      (!normalizedQuery || normalizeModelText(model).includes(normalizedQuery))
    ));
  }, [availableModels, familyModelKeys, selectionQuery]);
  const selectedModelKeys = useMemo(
    () => new Set(selectedModels.map((model) => normalizeModelText(model))),
    [selectedModels],
  );
  const partCountByModel = useMemo(
    () => countItemsByModel(allItems.length > 0 ? allItems : items, (item) => item.models, normalizeModelText),
    [allItems, items],
  );
  const serviceCountByModel = useMemo(
    () => countItemsByModel(serviceItems, (item) => [item.modelName], normalizeModelText),
    [serviceItems],
  );
  const displayedItems = useMemo(() => {
    // Sin familia ni "solo seleccionados" no se descarta nada: evita recorrer ~10 mil ítems normalizando sus modelos.
    if (!familyModelKeys && !(onlySelected && selectedModels.length > 0)) return items;
    return items.filter((item) => {
      const itemModelKeys = item.models.map(normalizeModelText);
      if (familyModelKeys && !itemModelKeys.some((model) => familyModelKeys.has(model))) return false;
      if (onlySelected && selectedModels.length > 0 && !itemModelKeys.some((model) => selectedModelKeys.has(model))) return false;
      return true;
    });
  }, [familyModelKeys, items, onlySelected, selectedModelKeys, selectedModels.length]);
  const displayedServiceItems = useMemo(() => {
    const normalizedQuery = normalizeModelText(query);
    const normalizedModel = normalizeModelText(modelName);
    return serviceItems.filter((item) => {
      if (normalizedQuery && !normalizeModelText(`${item.familyName} ${item.modelName} ${item.description}`).includes(normalizedQuery)) return false;
      if (normalizedModel && normalizeModelText(item.modelName) !== normalizedModel) return false;
      if (familyModelKeys && !familyModelKeys.has(normalizeModelText(item.modelName))) return false;
      if (onlySelected && selectedModels.length > 0 && !selectedModelKeys.has(normalizeModelText(item.modelName))) return false;
      return true;
    });
  }, [familyModelKeys, modelName, onlySelected, query, selectedModelKeys, selectedModels.length, serviceItems]);
  const displayedModelNotes = useMemo(() => {
    if (!modelName.trim() && selectedModels.length === 0) return [];
    return modelNotes.filter((note) => {
      if (familyModelKeys && !familyModelKeys.has(normalizeModelText(note.modelName))) return false;
      if (onlySelected && selectedModels.length > 0) return selectedModelKeys.has(normalizeModelText(note.modelName));
      if (modelName.trim()) return normalizeModelText(note.modelName) === normalizeModelText(modelName);
      return selectedModelKeys.has(normalizeModelText(note.modelName));
    });
  }, [familyModelKeys, modelName, modelNotes, onlySelected, selectedModelKeys, selectedModels.length]);

  const pagedItems = usePagedList(displayedItems, 100);

  useEffect(() => {
    if (!selectionReady || !selectionNeedsSave(selectedModels, persistedSelection.current)) return;
    const controller = new AbortController();
    const timer = window.setTimeout(() => {
      setSavingSelection(true);
      fetch('/api/sales/price-list-selection', {
        method: 'PUT',
        signal: controller.signal,
        headers: { 'content-type': 'application/json' },
        body: JSON.stringify({ modelNames: selectedModels }),
      })
        .then(async (response) => {
          const body = (await response.json().catch(() => null)) as { modelNames?: unknown; error?: string } | null;
          if (!response.ok || !body || !Array.isArray(body.modelNames)) {
            throw new Error(body?.error || 'No se pudo guardar la selección de modelos.');
          }
          persistedSelection.current = body.modelNames.filter((value): value is string => typeof value === 'string');
          setMessage('Selección de modelos guardada en SQLite.');
        })
        .catch((requestError: unknown) => {
          if (requestError instanceof DOMException && requestError.name === 'AbortError') return;
          setError(toErrorMessage(requestError));
        })
        .finally(() => setSavingSelection(false));
    }, 300);

    return () => {
      window.clearTimeout(timer);
      controller.abort();
    };
  }, [selectedModels, selectionReady]);

  async function saveCommercialSettings() {
    await persistPricing(draftPricing);
  }

  async function persistPricing(nextPricing: PricingSettings | null) {
    if (!nextPricing) return;
    setSaving(true);
    setError(null);
    try {
      const response = await fetch('/api/sales/pricing', {
        method: 'PUT',
        headers: { 'content-type': 'application/json' },
        body: JSON.stringify(nextPricing),
      });
      const body = await readJson<PricingSettings>(response);
      setPricing(body);
      setDraftPricing(body);
      setMessage('Reglas comerciales guardadas en SQLite.');
      setRefreshVersion((version) => version + 1);
    } catch (saveError: unknown) {
      setError(toErrorMessage(saveError));
    } finally {
      setSaving(false);
    }
  }

  async function setFamilyExchangeRateOverride(useFamilyRate: boolean) {
    if (!pricing || !selectedFamily?.exchangeRate) return;
    const familyKey = normalizeModelName(selectedFamily.familyName);
    const nextOverrides = { ...(pricing.familyExchangeRateOverrides ?? {}) };
    if (useFamilyRate) delete nextOverrides[familyKey];
    else nextOverrides[familyKey] = pricing.exchangeRate;

    const nextPricing: PricingSettings = {
      ...pricing,
      familyExchangeRateOverrides: nextOverrides,
    };
    setPricing(nextPricing);
    setDraftPricing(nextPricing);
    await persistPricing(nextPricing);
  }

  async function handleImportCatalog(file: File) {
    if (importingCatalog) return;
    setImportingCatalog(true);
    setError(null);
    setMessage('Analizando la planilla del listado…');
    try {
      const result = await importCatalogFile(file, (progress) => {
        setMessage(`${progress.message}${progress.percent < 100 ? ` ${progress.percent}%` : ''}`);
      });
      setRefreshVersion((version) => version + 1);
      if (result.duplicate) {
        setMessage(`Este archivo ya es la fuente vigente: ${numberFormat.format(result.parts)} filas de catálogo y ${numberFormat.format(result.serviceItems)} opciones; no se duplicó la carga.`);
      } else {
        setFamilyName('');
        setMessage(`Listado importado: ${numberFormat.format(result.parts)} filas de catálogo, ${numberFormat.format(result.serviceItems)} opciones comerciales y archivo original conservado.`);
      }
    } catch (importError: unknown) {
      setError(toErrorMessage(importError));
    } finally {
      setImportingCatalog(false);
    }
  }

  async function handleRestoreSeed() {
    if (restoringSeed) return;
    if (!await confirmAction({
      title: 'Restaurar semilla heredada',
      message: 'La semilla heredada reemplazará únicamente el catálogo Canon compartido.',
      confirmLabel: 'Reemplazar catálogo',
    })) return;

    setRestoringSeed(true);
    setError(null);
    setMessage('Leyendo las 13 familias de la semilla heredada…');
    try {
      const seed = await loadLegacyPriceListSeed();
      const sourceName = 'Listado de precios 2024 (semilla heredada).json';
      const sourceHash = await digestBytes(seed.sourceBytes);
      const batchResponse = await fetch('/api/imports', {
        method: 'POST',
        headers: { 'content-type': 'application/json' },
        body: JSON.stringify({ domain: 'catalog', sourceName, sourceType: 'catalog-seed', sourceHash }),
      });
      if (!batchResponse.ok) throw new Error('No se pudo crear la restauración de la semilla.');
      const batch = await batchResponse.json() as { id?: unknown };
      if (typeof batch.id !== 'string' || batch.id.trim() === '') throw new Error('La API no devolvió una importación válida.');

      const sourceResponse = await fetch(`/api/imports/${batch.id}/source`, {
        method: 'POST',
        headers: { 'content-type': 'application/json' },
        body: JSON.stringify({
          fileName: sourceName,
          contentBase64: bytesToBase64(seed.sourceBytes),
          contentType: 'application/json',
        }),
      });
      if (!sourceResponse.ok) throw new Error('No se pudo conservar la semilla original.');

      const importResponse = await fetch('/api/catalog/parts', {
        method: 'POST',
        headers: { 'content-type': 'application/json' },
        body: JSON.stringify({
          batchId: batch.id,
          parts: seed.parsed.parts,
          modelFamilies: seed.parsed.modelFamilies,
          modelNotes: seed.parsed.modelNotes,
          serviceItems: seed.parsed.serviceItems,
          replaceAll: true,
        }),
      });
      const importBody = await importResponse.json().catch(() => null) as { parts?: unknown; error?: string } | null;
      if (!importResponse.ok || !importBody || typeof importBody.parts !== 'number') {
        throw new Error(importBody?.error || 'La API rechazó la semilla heredada.');
      }

      setSelectedModels([]);
      setOnlySelected(false);
      setQuery('');
      setModelName('');
      setStockOnly(false);
      setSelectionQuery('');
      setFamilyName('');
      setRefreshVersion((version) => version + 1);
      setMessage(`Semilla restaurada: ${numberFormat.format(seed.familyCount)} familias, ${numberFormat.format(importBody.parts)} repuestos y ${numberFormat.format(seed.parsed.serviceItems.length)} opciones comerciales.`);
    } catch (restoreError: unknown) {
      setError(toErrorMessage(restoreError));
    } finally {
      setRestoringSeed(false);
    }
  }

  async function handleExport() {
    const exportItems = allItems.length > 0 ? allItems : items;
    if (!pricing || selectedModels.length === 0) {
      setError('Selecciona al menos un modelo para generar el listado comercial.');
      return;
    }
    if (exportItems.length === 0) {
      setError('No hay partes cargadas para los modelos seleccionados.');
      return;
    }
    setError(null);
    try {
      await exportPriceList(exportItems, pricing, selectedModels, serviceItems, modelNotes, families);
      setMessage(`Listado XLSX generado con ${numberFormat.format(selectedModels.length)} modelos.`);
    } catch (exportError: unknown) {
      setError(toErrorMessage(exportError));
    }
  }

  function limitMessage(skipped: number) {
    return `La selección admite hasta ${numberFormat.format(MAX_PRICE_LIST_SELECTION)} modelos${skipped > 1 ? `; ${numberFormat.format(skipped)} quedaron fuera` : ''}. Filtra y selecciona por tandas.`;
  }

  function toggleModel(model: string) {
    const key = normalizeModelText(model);
    if (selectedModels.some((value) => normalizeModelText(value) === key)) {
      setSelectedModels((current) => current.filter((value) => normalizeModelText(value) !== key));
      return;
    }
    const { selection, skipped } = addToSelection(selectedModels, [model], normalizeModelText);
    setSelectedModels(selection);
    if (skipped > 0) setError(limitMessage(skipped));
  }

  function toggleVisibleModels(select: boolean) {
    if (!select) {
      const hidden = new Set(visibleModelOptions.map(normalizeModelText));
      setSelectedModels((current) => current.filter((value) => !hidden.has(normalizeModelText(value))));
      return;
    }
    const { selection, skipped } = addToSelection(selectedModels, visibleModelOptions, normalizeModelText);
    setSelectedModels(selection);
    if (skipped > 0) setError(limitMessage(skipped));
  }

  return (
    <div className="page-content sales-page price-list-page">
      <PageHeader eyebrow="VENTAS / CATÁLOGO CALCULADO" title="Listado de precios"
        lead="Consulta el catálogo común y calcula el precio comercial con reglas guardadas localmente."
        actions={<div className="flex min-w-0 flex-wrap gap-2">
          <UploadButton busy={importingCatalog} busyLabel="Importando listado…" label="Cargar listado" accept=".xlsx,.json" disabled={restoringSeed} onChange={(event) => {
            const file = event.target.files?.[0];
            event.target.value = '';
            if (file) void handleImportCatalog(file);
          }} />
          <Button variant="outline" onClick={() => void handleRestoreSeed()} disabled={restoringSeed || importingCatalog || allItemsLoading || legacyCatalogLoading} aria-busy={restoringSeed}><RotateCcw />{restoringSeed ? 'Restaurando semilla…' : 'Restaurar semilla heredada'}</Button>
          <ExportButton onClick={() => void handleExport()} disabled={!pricing || selectedModels.length === 0 || allItemsLoading || legacyCatalogLoading || importingCatalog}>Exportar listado XLSX</ExportButton>
        </div>}
      />
      <div className="mt-4 flex min-w-0 flex-wrap items-center justify-between gap-x-4">
        <StatusLine state={error ? 'error' : savingSelection || loading || legacyCatalogLoading || importingCatalog || restoringSeed ? 'pending' : 'ready'}>
          <div className="[overflow-wrap:anywhere]">{error || (savingSelection ? 'Guardando selección…' : message || (loading || legacyCatalogLoading ? 'Consultando catálogo…' : `${numberFormat.format(displayedItems.length)} precios y ${numberFormat.format(displayedServiceItems.length)} opciones visibles${selectedFamily?.exchangeRate ? ` · T.C. ${numberFormat.format(selectedFamily.exchangeRate)} de ${selectedFamily.familyName}` : ''}`))}</div>
        </StatusLine>
        {sourceFile && <Button variant="export" size="sm" className="mb-4" asChild><a href={`/api/imports/${encodeURIComponent(sourceFile.batchId)}/files/${encodeURIComponent(sourceFile.fileId)}`} download={sourceFile.fileName}><DownloadIcon />Descargar original</a></Button>}
      </div>
      <div className="grid min-w-0 gap-6">
        <section className="grid min-w-0 gap-4 sm:grid-cols-2" aria-label="Resumen del listado">
          <PriceListSummary label="Partes visibles" value={displayedItems.length} />
          <PriceListSummary label="Modelos disponibles" value={availableModels.length} />
        </section>
        <Card className="min-w-0 grid-cols-1">
          <CardHeader eyebrow="REGLAS COMERCIALES" title="Precio calculado" aside={
            pricingDirty ? <Badge tone="warning">Cambios sin guardar</Badge> : null
          } />
          <Muted className="[overflow-wrap:anywhere]">Venta USD = costo USD × factor. Precio Gs. = venta USD × tipo de cambio, redondeado a la centena.
            {selectedFamily?.exchangeRate ? ` Para ${selectedFamily.familyName} se aplica el T.C. de la planilla (${numberFormat.format(selectedFamily.exchangeRate)}).` : ''}
          </Muted>
          <div className="grid min-w-0 grid-cols-[repeat(auto-fit,minmax(min(100%,12rem),1fr))] items-end gap-4">
            <label className={fieldClassName}><div>Tipo de cambio</div><Input type="number" min="1" step="1" value={draftPricing?.exchangeRate ?? ''} onChange={(event) => setDraftPricing((current) => current ? { ...current, exchangeRate: Number(event.target.value) } : current)} /></label>
            <label className={fieldClassName}><div>Factor</div><Input type="number" min="0.01" step="0.01" value={draftPricing?.factor ?? ''} onChange={(event) => setDraftPricing((current) => current ? { ...current, factor: Number(event.target.value) } : current)} /></label>
            <label className={fieldClassName}><div>Mano de obra Gs.</div><Input type="number" min="0" step="1000" value={draftPricing?.laborPrice ?? ''} onChange={(event) => setDraftPricing((current) => current ? { ...current, laborPrice: Number(event.target.value) } : current)} /></label>
            <Button variant="outline" onClick={() => void saveCommercialSettings()} disabled={!draftPricing || saving} aria-busy={saving}><Save />{saving ? 'Guardando…' : 'Guardar reglas'}</Button>
          </div>
          {selectedFamily?.exchangeRate && pricing && selectedFamily.exchangeRate !== pricing.exchangeRate && <div className="flex min-w-0 flex-wrap items-center justify-between gap-4 rounded-xl border border-sky/30 bg-sky/5 p-4">
            <div className="grid min-w-0 gap-1 [overflow-wrap:anywhere]">
              <strong className="text-sm text-navy dark:text-white">Tipo de cambio de {selectedFamily.familyName}</strong>
              <Muted>La planilla trae Gs. {numberFormat.format(selectedFamily.exchangeRate)}. Actualmente se aplica Gs. {numberFormat.format(selectedFamilyExchangeRate ?? pricing.exchangeRate)}.</Muted>
            </div>
            <Button variant="outline" onClick={() => void setFamilyExchangeRateOverride(selectedFamilyOverride !== undefined)} disabled={saving}>{selectedFamilyOverride !== undefined ? 'Usar T.C. de la planilla' : 'Volver al T.C. global'}</Button>
          </div>}
        </Card>
        <Card className="min-w-0 grid-cols-1" aria-label="Filtros del listado">
          <CardHeader eyebrow="CONSULTA / FILTROS" title="Buscar partes y opciones" />
          <div className="grid min-w-0 grid-cols-[repeat(auto-fit,minmax(min(100%,14rem),1fr))] items-end gap-4">
            <label className={fieldClassName}><div>Buscar código o descripción</div><Input value={query} onChange={(event) => setQuery(event.target.value)} placeholder="Ej. FK-123" /></label>
            <label className={fieldClassName}><div>Familia</div><select className={selectClassName} value={familyName} onChange={(event) => setFamilyName(event.target.value)}>
              <option value="">Todas las familias</option>{familyOptions.map((family) => <option key={family.value} value={family.value}>{family.label}</option>)}
            </select></label>
            <label className={fieldClassName}><div>Modelo</div><Input list="sales-models" value={modelName} onChange={(event) => setModelName(event.target.value)} placeholder="Todos los modelos" /><datalist id="sales-models">{availableModels.map((model) => <option key={model} value={model} />)}</datalist></label>
            <label className={`${checkboxClassName} min-h-10`}><input className="size-4 shrink-0 accent-sky" type="checkbox" checked={stockOnly} onChange={(event) => setStockOnly(event.target.checked)} /><div>Solo con stock</div></label>
          </div>
        </Card>
        <Card className="min-w-0 grid-cols-1" aria-labelledby="price-list-models-title">
          <CardHeader eyebrow="SELECCIÓN COMERCIAL" title={<span id="price-list-models-title">Modelos incluidos</span>} aside={<Badge tone="success">{numberFormat.format(selectedModels.length)} seleccionados</Badge>} />
          <Muted>Elegí modelos individuales o una selección filtrada. La exportación crea una hoja Resumen y una hoja por modelo.</Muted>
          <div className="flex min-w-0 flex-wrap items-end gap-4">
            <label className={`${fieldClassName} flex-1 basis-64`}><div>Buscar modelo</div><Input value={selectionQuery} onChange={(event) => setSelectionQuery(event.target.value)} placeholder="Ej. iR ADV C3325i" /></label>
            <div className="flex min-w-0 flex-wrap items-center gap-2">
              <Button variant="outline" onClick={() => toggleVisibleModels(true)} disabled={visibleModelOptions.length === 0}><Check />Seleccionar visibles</Button>
              <Button variant="outline" onClick={() => toggleVisibleModels(false)} disabled={visibleModelOptions.length === 0 || selectedModels.length === 0}><Minus />Quitar visibles</Button>
              <label className={`${checkboxClassName} min-h-10`}><input className="size-4 shrink-0 accent-sky" type="checkbox" checked={onlySelected} onChange={(event) => setOnlySelected(event.target.checked)} disabled={selectedModels.length === 0} /><div>Solo incluidos</div></label>
            </div>
          </div>
          <div className="grid min-w-0 max-h-[28rem] grid-cols-[repeat(auto-fit,minmax(min(100%,16rem),1fr))] gap-3 overflow-y-auto p-1" role="list" aria-label="Modelos disponibles para exportar">
            {visibleModelOptions.map((model) => {
              const modelKey = normalizeModelText(model);
              const selected = selectedModelKeys.has(modelKey);
              const partCount = partCountByModel.get(modelKey) ?? 0;
              const serviceCount = serviceCountByModel.get(modelKey) ?? 0;
              return <div className="min-w-0" role="listitem" key={model}>
                <label className={`flex min-w-0 cursor-pointer items-start gap-3 rounded-xl border p-3 ${selected ? 'border-sky/60 bg-sky/10' : 'border-navy/10 bg-paper hover:bg-sky/5 dark:border-sky/20 dark:bg-navy/30'}`}>
                  <input className="mt-1 size-4 shrink-0 accent-sky" type="checkbox" checked={selected} onChange={() => toggleModel(model)} />
                  <div className="grid min-w-0 grid-cols-1 gap-1 [overflow-wrap:anywhere]"><strong className="text-sm text-navy dark:text-white">{model}</strong><Muted>{numberFormat.format(partCount)} partes · {numberFormat.format(serviceCount)} opciones</Muted></div>
                </label>
              </div>;
            })}
            {visibleModelOptions.length === 0 && <div className="col-span-full rounded-xl border border-dashed border-navy/20 p-6 text-center dark:border-sky/30"><Muted>{allItemsLoading ? 'Cargando modelos…' : 'No hay modelos disponibles para esta búsqueda. Carga primero el listado o restaura la semilla heredada.'}</Muted></div>}
          </div>
        </Card>
        {displayedModelNotes.length > 0 && <Card className="min-w-0 grid-cols-1" aria-labelledby="catalog-model-notes-title">
          <CardHeader eyebrow="NOTAS DEL LEGADO" title={<span id="catalog-model-notes-title">Referencias técnicas por modelo</span>} />
          <div className="grid min-w-0 grid-cols-1 gap-3">
            {displayedModelNotes.map((note) => <article className="grid min-w-0 grid-cols-1 gap-2 rounded-xl border border-navy/10 bg-paper p-4 [overflow-wrap:anywhere] dark:border-sky/20 dark:bg-navy/30" key={note.id}>
              <strong className="text-sm text-navy dark:text-white">{note.modelName}</strong><Muted>{note.note}</Muted>
            </article>)}
          </div>
        </Card>}
        <Card className="min-w-0 grid-cols-1">
          <CardHeader eyebrow="CATÁLOGO / PRECIOS" title="Partes y repuestos" aside={<Badge>{numberFormat.format(displayedItems.length)} partes</Badge>} />
          <Table className="min-w-[64rem]" wrapperClassName="min-w-0" aria-label="Listado de precios">
            <TableHeader><TableRow>
              <TableHead>N° parte</TableHead><TableHead>Descripción</TableHead><TableHead>Modelo</TableHead>
              <TableHead className="text-right">Stock</TableHead><TableHead className="text-right">Costo USD</TableHead><TableHead className="text-right">Venta USD</TableHead><TableHead className="text-right">Precio Gs.</TableHead><TableHead>Estado</TableHead>
            </TableRow></TableHeader>
            <TableBody>{pagedItems.items.map((item) => <TableRow key={item.id} className={item.discontinuedAt ? 'bg-red-500/5' : undefined}>
              <TableCell className="whitespace-nowrap font-mono text-xs">{item.code}</TableCell>
              <TableCell className="min-w-56 max-w-md [overflow-wrap:anywhere]"><div>{item.description || 'Sin descripción'}</div><SalesPartDetails item={item} /></TableCell>
              <TableCell className="min-w-40 max-w-xs [overflow-wrap:anywhere]">{item.models.join(', ') || 'Sin modelo'}</TableCell>
              <TableCell className="text-right whitespace-nowrap tabular-nums">{numberFormat.format(item.stock)}</TableCell>
              <TableCell className="text-right whitespace-nowrap tabular-nums">{item.costAvailable === false ? 'Sin costo' : decimalFormat.format(item.priceUsd)}</TableCell>
              <TableCell className="text-right whitespace-nowrap tabular-nums">{item.costAvailable === false ? 'Sin cálculo' : decimalFormat.format(item.salePriceUsd)}</TableCell>
              <TableCell className="text-right font-bold whitespace-nowrap tabular-nums">{item.costAvailable === false ? item.priceLocal > 0 ? <div className="grid gap-1"><div>{numberFormat.format(item.priceLocal)}</div><Muted>Valor de planilla</Muted></div> : 'Sin precio' : numberFormat.format(item.salePriceLocal)}</TableCell>
              <TableCell><Badge tone={item.discontinuedAt ? 'warning' : item.costAvailable === false ? 'neutral' : 'success'}>{item.discontinuedAt ? `Baja ${item.discontinuedAt}` : item.costAvailable === false ? 'Referencia planilla' : 'Activo'}</Badge></TableCell>
            </TableRow>)}
            {displayedItems.length === 0 && <TableRow><TableCell className="p-6 text-center" colSpan={8}>{loading ? 'Cargando…' : 'No hay partes para estos filtros. Carga un listado o restaura la semilla heredada.'}</TableCell></TableRow>}
            </TableBody>
          </Table>
          {pagedItems.totalPages > 1 && <PaginationControls label="Paginación del listado de precios" page={pagedItems.page} pageSize={pagedItems.pageSize} total={pagedItems.total} pageSizeOptions={[50, 100, 250]} onPageChange={pagedItems.setPage} onPageSizeChange={pagedItems.setPageSize} />}
        </Card>
        {displayedServiceItems.length > 0 && <Card className="min-w-0 grid-cols-1" aria-labelledby="catalog-service-items-title">
          <CardHeader eyebrow="SERVICIOS Y CARGOS HEREDADOS" title={<span id="catalog-service-items-title">Opciones comerciales por modelo</span>} aside={<Badge>{numberFormat.format(displayedServiceItems.length)} opciones</Badge>} />
          <Muted>Estas filas existían en el Listado de precios anterior y ahora quedan guardadas en la base compartida.</Muted>
          <Table className="min-w-[52rem]" wrapperClassName="min-w-0" aria-label="Opciones comerciales por modelo">
            <TableHeader><TableRow><TableHead>Tipo</TableHead><TableHead>Familia</TableHead><TableHead>Modelo</TableHead><TableHead>Descripción</TableHead><TableHead className="text-right">Precio Gs.</TableHead><TableHead>Fuente</TableHead></TableRow></TableHeader>
            <TableBody>{displayedServiceItems.map((item) => {
              const price = item.kind === 'labor' ? pricing?.laborPrice ?? null : item.fixedPriceLocal;
              return <TableRow key={item.id}>
                <TableCell><Badge>{item.kind === 'labor' ? 'Mano de obra' : 'Cargo fijo'}</Badge></TableCell>
                <TableCell className="max-w-xs [overflow-wrap:anywhere]">{item.familyName}</TableCell><TableCell className="max-w-xs [overflow-wrap:anywhere]">{item.modelName}</TableCell><TableCell className="min-w-56 max-w-md [overflow-wrap:anywhere]">{item.description}</TableCell>
                <TableCell className="text-right font-bold whitespace-nowrap tabular-nums">{price === null ? 'Sin precio' : numberFormat.format(price)}</TableCell><TableCell className="max-w-xs [overflow-wrap:anywhere]">{item.sourceName}</TableCell>
              </TableRow>;
            })}</TableBody>
          </Table>
        </Card>}
      </div>
    </div>
  );
}

function PriceListSummary({ label, value }: { label: string; value: number }) {
  return <Card className="min-w-0 grid-cols-1 gap-2"><Muted>{label}</Muted><strong className="break-all text-2xl font-bold tabular-nums text-navy dark:text-white">{numberFormat.format(value)}</strong></Card>;
}

function uniqueModelLabels(items: readonly SalesPricePart[], serviceItems: readonly CatalogServiceItem[] = []): string[] {
  const models = new Map<string, string>();
  for (const item of items) {
    for (const model of item.models) {
      const label = model.trim();
      if (label) models.set(normalizeModelText(label), label);
    }
  }
  for (const item of serviceItems) {
    const label = item.modelName.trim();
    if (label) models.set(normalizeModelText(label), label);
  }
  return [...models.values()].sort((left, right) => left.localeCompare(right));
}

// Se llama por cada ítem del catálogo (decenas de miles) en cada filtrado: sin memoria era ~50 % del bloqueo al abrir el módulo.
const normalizeModelText = memoizeString((value) => value.normalize('NFKD').replace(/[\u0300-\u036f]/g, '').trim().replace(/\s+/g, ' ').toUpperCase());

function SalesPartDetails({ item }: { item: SalesPricePart }) {
  const details = [
    item.group ? `Grupo: ${item.group}` : '',
    item.reference ? `Ref.: ${item.reference}` : '',
    item.usefulLife ? `Vida: ${item.usefulLife}` : '',
  ].filter(Boolean);
  return details.length > 0 ? <Muted className="mt-1">{details.join(' · ')}</Muted> : null;
}

async function digestBytes(bytes: Uint8Array): Promise<string> {
  const hash = await crypto.subtle.digest('SHA-256', bytes);
  return [...new Uint8Array(hash)].map((byte) => byte.toString(16).padStart(2, '0')).join('');
}

function bytesToBase64(bytes: Uint8Array): string {
  let binary = '';
  const chunkSize = 0x8000;
  for (let offset = 0; offset < bytes.length; offset += chunkSize) {
    binary += String.fromCharCode(...bytes.subarray(offset, offset + chunkSize));
  }
  return btoa(binary);
}
