import { useEffect, useMemo, useState } from 'react';
import { importCatalogFile } from '../catalogo/import-file';
import { loadLegacyPriceListSeed } from '../catalogo/legacy-seed';
import { normalizeModelName, type CatalogFamilySummary, type CatalogModelNote, type CatalogServiceItem, type CatalogSourceFile } from '../catalogo/repository';
import { exportPriceList } from './export';
import type { PricingSettings, SalesPricePart } from './types';
import { confirmAction } from '../../core/confirm';

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
    fetch('/api/sales/price-list', { signal: controller.signal })
      .then(async (response) => {
        if (!response.ok) throw new Error('No se pudo cargar el catálogo completo de precios.');
        return (await response.json()) as SalesPricePart[];
      })
      .then(setAllItems)
      .catch((requestError: unknown) => {
        if (requestError instanceof DOMException && requestError.name === 'AbortError') return;
        setError(toErrorMessage(requestError));
      })
      .finally(() => setAllItemsLoading(false));

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
        setSelectedModels(Array.isArray(body.modelNames) ? body.modelNames.filter((value): value is string => typeof value === 'string') : []);
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
    fetch(`/api/sales/price-list?${params.toString()}`, { signal: controller.signal })
      .then(async (response) => {
        if (!response.ok) throw new Error('No se pudo consultar el listado de precios.');
        return (await response.json()) as SalesPricePart[];
      })
      .then(setItems)
      .catch((requestError: unknown) => {
        if (requestError instanceof DOMException && requestError.name === 'AbortError') return;
        setError(toErrorMessage(requestError));
      })
      .finally(() => setLoading(false));

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
  const displayedItems = useMemo(() => {
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

  useEffect(() => {
    if (!selectionReady) return;
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
      const body = (await response.json()) as PricingSettings | { error?: string };
      if (!response.ok || !('exchangeRate' in body)) {
        throw new Error('error' in body && body.error ? body.error : 'No se pudo guardar la configuración.');
      }
      setPricing(body);
      setDraftPricing(body);
      setMessage('Reglas comerciales guardadas en SQLite.');
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
    setRefreshVersion((version) => version + 1);
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

  function toggleModel(model: string) {
    setSelectedModels((current) => {
      const next = new Map(current.map((value) => [normalizeModelText(value), value]));
      const key = normalizeModelText(model);
      if (next.has(key)) next.delete(key);
      else next.set(key, model);
      return [...next.values()].sort((left, right) => left.localeCompare(right));
    });
  }

  function toggleVisibleModels(select: boolean) {
    setSelectedModels((current) => {
      const next = new Map(current.map((value) => [normalizeModelText(value), value]));
      for (const model of visibleModelOptions) {
        const key = normalizeModelText(model);
        if (select) next.set(key, model);
        else next.delete(key);
      }
      return [...next.values()].sort((left, right) => left.localeCompare(right));
    });
  }

  return (
    <div className="page-content sales-page">
      <section className="catalog-header">
        <div>
          <div className="eyebrow">VENTAS / CATÁLOGO CALCULADO</div>
          <h1>Listado de precios</h1>
          <p className="lead">Consulta el catálogo común y calcula el precio comercial con reglas guardadas localmente.</p>
        </div>
        <div className="catalog-header-actions">
          <label className="secondary-button">
            {importingCatalog ? 'Importando listado…' : 'Cargar listado'}
            <input
              type="file"
              accept=".xlsx,.json"
              hidden
              disabled={importingCatalog || restoringSeed}
              onChange={(event) => {
                const file = event.target.files?.[0];
                event.target.value = '';
                if (file) void handleImportCatalog(file);
              }}
            />
          </label>
          <button className="secondary-button" type="button" onClick={() => void handleRestoreSeed()} disabled={restoringSeed || importingCatalog || allItemsLoading || legacyCatalogLoading}>
            {restoringSeed ? 'Restaurando semilla…' : 'Restaurar semilla heredada'}
          </button>
          <button className="primary-button" type="button" onClick={() => void handleExport()} disabled={!pricing || selectedModels.length === 0 || allItemsLoading || legacyCatalogLoading || importingCatalog}>
            Exportar listado XLSX
          </button>
        </div>
      </section>

      <section className="sales-status" aria-live="polite">
        <span className={`status-dot ${error ? 'error' : savingSelection || loading || legacyCatalogLoading ? 'pending' : 'ready'}`} />
        <span>{error || (savingSelection ? 'Guardando selección…' : message || (loading || legacyCatalogLoading ? 'Consultando catálogo…' : `${numberFormat.format(displayedItems.length)} precios y ${numberFormat.format(displayedServiceItems.length)} opciones visibles${selectedFamily?.exchangeRate ? ` · T.C. ${numberFormat.format(selectedFamily.exchangeRate)} de ${selectedFamily.familyName}` : ''}`))}</span>
        {sourceFile ? (
          <a
            className="secondary-button catalog-source-link"
            href={`/api/imports/${encodeURIComponent(sourceFile.batchId)}/files/${encodeURIComponent(sourceFile.fileId)}`}
            download={sourceFile.fileName}
          >
            Descargar original
          </a>
        ) : null}
      </section>

      <section className="pricing-panel">
        <div>
          <div className="eyebrow">REGLAS COMERCIALES</div>
          <h2>Precio calculado</h2>
          <p>
            Venta USD = costo USD × factor. Precio Gs. = venta USD × tipo de cambio, redondeado a la centena.
            {selectedFamily?.exchangeRate ? ` Para ${selectedFamily.familyName} se aplica el T.C. de la planilla (${numberFormat.format(selectedFamily.exchangeRate)}).` : ''}
          </p>
        </div>
        <div className="pricing-fields">
          <label className="search-field">
            <span>Tipo de cambio</span>
            <input
              type="number"
              min="1"
              step="1"
              value={draftPricing?.exchangeRate ?? ''}
              onChange={(event) => setDraftPricing((current) => current ? { ...current, exchangeRate: Number(event.target.value) } : current)}
            />
          </label>
          <label className="search-field">
            <span>Factor</span>
            <input
              type="number"
              min="0.01"
              step="0.01"
              value={draftPricing?.factor ?? ''}
              onChange={(event) => setDraftPricing((current) => current ? { ...current, factor: Number(event.target.value) } : current)}
            />
          </label>
          <label className="search-field">
            <span>Mano de obra Gs.</span>
            <input
              type="number"
              min="0"
              step="1000"
              value={draftPricing?.laborPrice ?? ''}
              onChange={(event) => setDraftPricing((current) => current ? { ...current, laborPrice: Number(event.target.value) } : current)}
            />
          </label>
          <button className="secondary-button" type="button" onClick={() => void saveCommercialSettings()} disabled={!draftPricing || saving}>
            {saving ? 'Guardando…' : 'Guardar reglas'}
          </button>
        </div>
        {selectedFamily?.exchangeRate && pricing && selectedFamily.exchangeRate !== pricing.exchangeRate ? (
          <div className="family-pricing-choice">
            <div>
              <strong>Tipo de cambio de {selectedFamily.familyName}</strong>
              <span>La planilla trae Gs. {numberFormat.format(selectedFamily.exchangeRate)}. Actualmente se aplica Gs. {numberFormat.format(selectedFamilyExchangeRate ?? pricing.exchangeRate)}.</span>
            </div>
            <button
              className="secondary-button"
              type="button"
              onClick={() => void setFamilyExchangeRateOverride(selectedFamilyOverride !== undefined)}
              disabled={saving}
            >
              {selectedFamilyOverride !== undefined ? 'Usar T.C. de la planilla' : 'Volver al T.C. global'}
            </button>
          </div>
        ) : null}
      </section>

      <section className="catalog-controls price-list-controls" aria-label="Filtros del listado">
        <label className="search-field">
          <span>Buscar código o descripción</span>
          <input value={query} onChange={(event) => setQuery(event.target.value)} placeholder="Ej. FK-123" />
        </label>
        <label className="search-field">
          <span>Familia</span>
          <select value={familyName} onChange={(event) => setFamilyName(event.target.value)}>
            <option value="">Todas las familias</option>
            {familyOptions.map((family) => <option key={family.value} value={family.value}>{family.label}</option>)}
          </select>
        </label>
        <label className="search-field">
          <span>Modelo</span>
          <input list="sales-models" value={modelName} onChange={(event) => setModelName(event.target.value)} placeholder="Todos los modelos" />
          <datalist id="sales-models">
            {availableModels.map((model) => <option key={model} value={model} />)}
          </datalist>
        </label>
        <label className="checkbox-field">
          <input type="checkbox" checked={stockOnly} onChange={(event) => setStockOnly(event.target.checked)} />
          <span>Solo con stock</span>
        </label>
      </section>

      <section className="price-list-model-selection" aria-labelledby="price-list-models-title">
        <div className="price-list-model-selection-heading">
          <div>
            <div className="eyebrow">SELECCIÓN COMERCIAL</div>
            <h2 id="price-list-models-title">Modelos incluidos</h2>
            <p>Elegí modelos individuales o una selección filtrada. La exportación crea una hoja Resumen y una hoja por modelo.</p>
          </div>
          <strong>{numberFormat.format(selectedModels.length)} seleccionados</strong>
        </div>
        <div className="price-list-model-selection-toolbar">
          <label className="search-field">
            <span>Buscar modelo</span>
            <input value={selectionQuery} onChange={(event) => setSelectionQuery(event.target.value)} placeholder="Ej. iR ADV C3325i" />
          </label>
          <div className="price-list-model-selection-actions">
            <button className="secondary-button" type="button" onClick={() => toggleVisibleModels(true)} disabled={visibleModelOptions.length === 0}>
              Seleccionar visibles
            </button>
            <button className="secondary-button" type="button" onClick={() => toggleVisibleModels(false)} disabled={visibleModelOptions.length === 0 || selectedModels.length === 0}>
              Quitar visibles
            </button>
            <label className="checkbox-field">
              <input type="checkbox" checked={onlySelected} onChange={(event) => setOnlySelected(event.target.checked)} disabled={selectedModels.length === 0} />
              <span>Solo incluidos</span>
            </label>
          </div>
        </div>
        <div className="price-list-model-grid" role="list" aria-label="Modelos disponibles para exportar">
          {visibleModelOptions.map((model) => {
            const selected = selectedModelKeys.has(normalizeModelText(model));
            const partCount = (allItems.length > 0 ? allItems : items).filter((item) => item.models.some((itemModel) => normalizeModelText(itemModel) === normalizeModelText(model))).length;
            const serviceCount = serviceItems.filter((item) => normalizeModelText(item.modelName) === normalizeModelText(model)).length;
            return (
              <label key={model} className={`price-list-model-option${selected ? ' selected' : ''}`}>
                <input type="checkbox" checked={selected} onChange={() => toggleModel(model)} />
                <span>
                  <strong>{model}</strong>
                  <small>{numberFormat.format(partCount)} partes · {numberFormat.format(serviceCount)} opciones</small>
                </span>
              </label>
            );
          })}
          {visibleModelOptions.length === 0 && (
            <p className="empty-inline">{allItemsLoading ? 'Cargando modelos…' : 'No hay modelos disponibles para esta búsqueda. Importa primero el catálogo desde Catálogo.'}</p>
          )}
        </div>
      </section>

      {displayedModelNotes.length > 0 && (
        <section className="catalog-model-notes" aria-labelledby="catalog-model-notes-title">
          <div>
            <div className="eyebrow">NOTAS DEL LEGADO</div>
            <h2 id="catalog-model-notes-title">Referencias técnicas por modelo</h2>
          </div>
          <div className="catalog-model-notes-list">
            {displayedModelNotes.map((note) => (
              <article key={note.id}>
                <strong>{note.modelName}</strong>
                <span>{note.note}</span>
              </article>
            ))}
          </div>
        </section>
      )}

      <section className="catalog-table-wrap">
        <table className="catalog-table sales-table">
          <thead>
            <tr>
              <th>N° parte</th>
              <th>Descripción</th>
              <th>Modelo</th>
              <th className="align-right">Stock</th>
              <th className="align-right">Costo USD</th>
              <th className="align-right">Venta USD</th>
              <th className="align-right">Precio Gs.</th>
              <th>Estado</th>
            </tr>
          </thead>
          <tbody>
            {displayedItems.map((item) => (
              <tr key={item.id} className={item.discontinuedAt ? 'is-discontinued' : undefined}>
                <td className="code-cell">{item.code}</td>
                <td>
                  <span>{item.description || 'Sin descripción'}</span>
                  <SalesPartDetails item={item} />
                </td>
                <td className="models-cell">{item.models.join(', ') || 'Sin modelo'}</td>
                <td className="align-right">{numberFormat.format(item.stock)}</td>
                <td className="align-right">{item.costAvailable === false ? 'Sin costo' : decimalFormat.format(item.priceUsd)}</td>
                <td className="align-right">{item.costAvailable === false ? 'Sin cálculo' : decimalFormat.format(item.salePriceUsd)}</td>
                <td className="align-right price-cell">
                  {item.costAvailable === false ? (
                    item.priceLocal > 0 ? (
                      <span className="catalog-reference-price">
                        <span>{numberFormat.format(item.priceLocal)}</span>
                        <small>Valor de planilla</small>
                      </span>
                    ) : 'Sin precio'
                  ) : numberFormat.format(item.salePriceLocal)}
                </td>
                <td>{item.discontinuedAt ? `Baja ${item.discontinuedAt}` : item.costAvailable === false ? 'Referencia planilla' : 'Activo'}</td>
              </tr>
            ))}
            {displayedItems.length === 0 && (
              <tr>
                <td className="empty-cell" colSpan={8}>
                  {loading ? 'Cargando…' : 'No hay partes para estos filtros. Importa primero un XLSX desde Catálogo.'}
                </td>
              </tr>
            )}
          </tbody>
        </table>
      </section>

      {displayedServiceItems.length > 0 && (
        <section className="catalog-service-items" aria-labelledby="catalog-service-items-title">
          <div className="catalog-service-items-heading">
            <div>
              <div className="eyebrow">SERVICIOS Y CARGOS HEREDADOS</div>
              <h2 id="catalog-service-items-title">Opciones comerciales por modelo</h2>
              <p>Estas filas existían en el Listado de precios anterior y ahora quedan guardadas en la base compartida.</p>
            </div>
            <strong>{numberFormat.format(displayedServiceItems.length)} opciones</strong>
          </div>
          <div className="catalog-table-wrap">
            <table className="catalog-table catalog-service-table">
              <thead>
                <tr>
                  <th>Tipo</th>
                  <th>Familia</th>
                  <th>Modelo</th>
                  <th>Descripción</th>
                  <th className="align-right">Precio Gs.</th>
                  <th>Fuente</th>
                </tr>
              </thead>
              <tbody>
                {displayedServiceItems.map((item) => {
                  const price = item.kind === 'labor' ? pricing?.laborPrice ?? null : item.fixedPriceLocal;
                  return (
                    <tr key={item.id}>
                      <td><span className={`catalog-service-kind ${item.kind}`}>{item.kind === 'labor' ? 'Mano de obra' : 'Cargo fijo'}</span></td>
                      <td>{item.familyName}</td>
                      <td>{item.modelName}</td>
                      <td>{item.description}</td>
                      <td className="align-right price-cell">{price === null ? 'Sin precio' : numberFormat.format(price)}</td>
                      <td className="catalog-source-cell">{item.sourceName}</td>
                    </tr>
                  );
                })}
              </tbody>
            </table>
          </div>
        </section>
      )}
    </div>
  );
}

function toErrorMessage(value: unknown): string {
  return value instanceof Error ? value.message : 'No se pudo completar la operación.';
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

function normalizeModelText(value: string): string {
  return value.normalize('NFKD').replace(/[\u0300-\u036f]/g, '').trim().replace(/\s+/g, ' ').toUpperCase();
}

function SalesPartDetails({ item }: { item: SalesPricePart }) {
  const details = [
    item.group ? `Grupo: ${item.group}` : '',
    item.reference ? `Ref.: ${item.reference}` : '',
    item.usefulLife ? `Vida: ${item.usefulLife}` : '',
  ].filter(Boolean);
  return details.length > 0 ? <small className="catalog-part-details">{details.join(' · ')}</small> : null;
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
