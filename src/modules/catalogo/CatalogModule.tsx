import { useEffect, useMemo, useRef, useState } from 'react';
import { exportCatalogWorkbook } from './export';
import { importCatalogFile } from './import-file';
import type { CatalogPart, CatalogSourceFile } from './repository';

type ImportStatus = 'idle' | 'reading' | 'uploading' | 'error';
type CatalogSortKey = 'code' | 'description' | 'stock' | 'priceUsd' | 'priceLocal' | 'discontinuedAt';
type CatalogSort = { key: CatalogSortKey; direction: 'asc' | 'desc' };

const numberFormat = new Intl.NumberFormat('es-PY');
const currencyFormat = new Intl.NumberFormat('es-PY', { minimumFractionDigits: 0 });

export default function CatalogModule() {
  const fileInput = useRef<HTMLInputElement>(null);
  const [parts, setParts] = useState<CatalogPart[]>([]);
  const [sourceFile, setSourceFile] = useState<CatalogSourceFile | null>(null);
  const [query, setQuery] = useState('');
  const [modelName, setModelName] = useState('');
  const [includeUnlinked, setIncludeUnlinked] = useState(false);
  const [stockOnly, setStockOnly] = useState(false);
  const [excludeDiscontinued, setExcludeDiscontinued] = useState(true);
  const [sort, setSort] = useState<CatalogSort>({ key: 'code', direction: 'asc' });
  const [refreshVersion, setRefreshVersion] = useState(0);
  const [status, setStatus] = useState<ImportStatus>('idle');
  const [statusText, setStatusText] = useState('');
  const [error, setError] = useState<string | null>(null);
  const [exporting, setExporting] = useState(false);

  useEffect(() => {
    const controller = new AbortController();
    const params = new URLSearchParams();
    if (query.trim()) params.set('query', query.trim());
    if (modelName.trim()) params.set('modelName', modelName.trim());
    params.set('modelLinkedOnly', String(!includeUnlinked));
    if (stockOnly) params.set('stockOnly', 'true');
    if (excludeDiscontinued) params.set('excludeDiscontinued', 'true');

    fetch(`/api/catalog/parts?${params.toString()}`, { signal: controller.signal })
      .then(async (response) => {
        if (!response.ok) throw new Error('No se pudo consultar el catálogo local.');
        return (await response.json()) as CatalogPart[];
      })
      .then((loadedParts) => {
        setParts(loadedParts);
        setError(null);
      })
      .catch((requestError: unknown) => {
        if (requestError instanceof DOMException && requestError.name === 'AbortError') return;
        setParts([]);
        setError(requestError instanceof Error ? requestError.message : 'No se pudo cargar el catálogo.');
      });

    return () => controller.abort();
  }, [query, modelName, includeUnlinked, stockOnly, excludeDiscontinued, refreshVersion]);

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
        setError(requestError instanceof Error ? requestError.message : 'No se pudo cargar el origen del catálogo.');
      });

    return () => controller.abort();
  }, [refreshVersion]);

  const availableModels = useMemo(
    () => [...new Set(parts.flatMap((part) => part.models))].sort((left, right) => left.localeCompare(right)),
    [parts],
  );

  const visibleParts = useMemo(() => {
    const direction = sort.direction === 'asc' ? 1 : -1;
    const collator = new Intl.Collator('es', { numeric: true, sensitivity: 'base' });
    return [...parts].sort((left, right) => {
      const leftValue = left[sort.key];
      const rightValue = right[sort.key];
      if (typeof leftValue === 'number' && typeof rightValue === 'number') {
        return (leftValue - rightValue) * direction;
      }
      return collator.compare(String(leftValue ?? ''), String(rightValue ?? '')) * direction;
    });
  }, [parts, sort]);

  function toggleSort(key: CatalogSortKey) {
    setSort((current) => current.key === key
      ? { key, direction: current.direction === 'asc' ? 'desc' : 'asc' }
      : { key, direction: 'asc' });
  }

  async function exportVisibleParts() {
    if (visibleParts.length === 0) return;
    setExporting(true);
    setError(null);
    try {
      await exportCatalogWorkbook(visibleParts);
      setStatusText(`Exportación lista: ${numberFormat.format(visibleParts.length)} repuestos.`);
    } catch (exportError: unknown) {
      setError(exportError instanceof Error ? exportError.message : 'No se pudo exportar el catálogo.');
    } finally {
      setExporting(false);
    }
  }

  async function handleFileChange(file: File | undefined) {
    if (!file) return;
    const fileName = file.name.toLowerCase();
    const isJson = fileName.endsWith('.json');
    if (!isJson && !fileName.endsWith('.xlsx')) {
      setError('Selecciona una planilla .xlsx o un respaldo .json del catálogo.');
      return;
    }

    setError(null);
    setStatus('reading');
    setStatusText('Analizando la planilla…');

    try {
      const result = await importCatalogFile(file, (progress) => {
        setStatus(progress.phase);
        setStatusText(`${progress.message}${progress.percent < 100 ? ` ${progress.percent}%` : ''}`);
      });
      setStatus('idle');
      setStatusText(result.duplicate
        ? `Este archivo ya es la fuente vigente: ${numberFormat.format(result.parts)} filas y ${numberFormat.format(result.serviceItems)} opciones. No se duplicó la carga.`
        : `Importación completa: ${numberFormat.format(result.parts)} filas conservadas y ${numberFormat.format(result.serviceItems)} opciones comerciales.`);
      setRefreshVersion((version) => version + 1);
    } catch (importError: unknown) {
      setStatus('error');
      setStatusText('');
      setError(importError instanceof Error ? importError.message : 'No se pudo importar el catálogo.');
    } finally {
      if (fileInput.current) fileInput.current.value = '';
    }
  }

  return (
    <div className="page-content catalog-page">
      <section className="catalog-header">
        <div>
          <div className="eyebrow">CATÁLOGO / FUENTE COMPARTIDA</div>
          <h1>Repuestos Canon</h1>
          <p className="lead">Importa una vez y deja disponibles partes, precios y stock para los módulos de ventas.</p>
        </div>
        <div className="catalog-header-actions">
          <input
            ref={fileInput}
            className="visually-hidden"
            type="file"
            accept=".xlsx,.json,application/vnd.openxmlformats-officedocument.spreadsheetml.sheet,application/json"
            onChange={(event) => void handleFileChange(event.target.files?.[0])}
          />
          <button className="primary-button" type="button" onClick={() => fileInput.current?.click()} disabled={status === 'reading' || status === 'uploading'}>
            {status === 'reading' || status === 'uploading' ? 'Procesando…' : 'Importar XLSX o JSON'}
          </button>
          <button className="secondary-button" type="button" onClick={() => void exportVisibleParts()} disabled={exporting || visibleParts.length === 0}>
            {exporting ? 'Exportando…' : 'Exportar XLSX'}
          </button>
        </div>
      </section>

      <section className="catalog-status-row" aria-live="polite">
        <span className={`status-dot ${error || status === 'error' ? 'error' : status === 'reading' || status === 'uploading' ? 'pending' : 'ready'}`} />
        <span>{statusText || `${numberFormat.format(visibleParts.length)} repuestos visibles`}</span>
        {error && <span className="error-message">{error}</span>}
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

      <section className="catalog-controls" aria-label="Filtros del catálogo">
        <label className="search-field">
          <span>Buscar código o descripción</span>
          <input value={query} onChange={(event) => setQuery(event.target.value)} placeholder="Ej. FK-123" />
        </label>
        <label className="search-field">
          <span>Modelo</span>
          <input list="catalog-models" value={modelName} onChange={(event) => setModelName(event.target.value)} placeholder="Buscar modelo, ej. IPF" />
          <datalist id="catalog-models">
            {availableModels.map((model) => <option key={model} value={model} />)}
          </datalist>
        </label>
        <label className="checkbox-field">
          <input type="checkbox" checked={stockOnly} onChange={(event) => setStockOnly(event.target.checked)} />
          <span>Solo con stock</span>
        </label>
        <label className="checkbox-field">
          <input type="checkbox" checked={excludeDiscontinued} onChange={(event) => setExcludeDiscontinued(event.target.checked)} />
          <span>Excluir discontinuados</span>
        </label>
        <label className="checkbox-field">
          <input type="checkbox" checked={includeUnlinked} onChange={(event) => setIncludeUnlinked(event.target.checked)} />
          <span>Incluir filas sin modelo</span>
        </label>
      </section>

      {visibleParts.length > 0 ? (
        <section className="catalog-table-wrap">
          <table className="catalog-table">
            <thead>
              <tr>
                <SortableHeader label="N° parte" sortKey="code" sort={sort} onSort={toggleSort} />
                <SortableHeader label="Descripción" sortKey="description" sort={sort} onSort={toggleSort} />
                <th>Modelo</th>
                <SortableHeader label="Stock" sortKey="stock" sort={sort} onSort={toggleSort} align="right" />
                <SortableHeader label="USD" sortKey="priceUsd" sort={sort} onSort={toggleSort} align="right" />
                <SortableHeader label="Gs." sortKey="priceLocal" sort={sort} onSort={toggleSort} align="right" />
                <SortableHeader label="Estado" sortKey="discontinuedAt" sort={sort} onSort={toggleSort} />
              </tr>
            </thead>
            <tbody>
              {visibleParts.map((part) => (
                <tr key={part.id} className={part.discontinuedAt ? 'is-discontinued' : undefined}>
                  <td className="code-cell">{part.code}</td>
                  <td>
                    <span>{part.description || 'Sin descripción'}</span>
                    <CatalogPartDetails part={part} />
                  </td>
                  <td className="models-cell">{part.models.join(', ') || 'Sin modelo'}</td>
                  <td className="align-right">{numberFormat.format(part.stock)}</td>
                  <td className="align-right">{part.costAvailable === false ? 'Sin costo' : currencyFormat.format(part.priceUsd)}</td>
                  <td className="align-right">
                    {part.costAvailable === false ? (
                      part.priceLocal > 0 ? (
                        <span className="catalog-reference-price">
                          <span>{numberFormat.format(part.priceLocal)}</span>
                          <small>Valor de planilla</small>
                        </span>
                      ) : 'Sin precio'
                    ) : numberFormat.format(part.priceLocal)}
                  </td>
                  <td>{part.discontinuedAt ? `Baja ${part.discontinuedAt}` : part.costAvailable === false ? 'Referencia planilla' : 'Activo'}</td>
                </tr>
              ))}
              {visibleParts.length === 0 && (
                <tr>
                  <td className="empty-cell" colSpan={7}>Todavía no hay registros para estos filtros.</td>
                </tr>
              )}
            </tbody>
          </table>
        </section>
      ) : (
        <section className="catalog-empty-state">
          <div className="eyebrow">CONSULTA DEL CATÁLOGO</div>
          <h2>{query.trim() || modelName.trim() ? 'No hay repuestos para estos filtros' : 'No hay repuestos Canon vinculados'}</h2>
          <p>La vista normal muestra las filas Canon asociadas a un modelo. Las filas históricas sin modelo no se mezclan en esta lista.</p>
          <small>Activa «Incluir filas sin modelo» si necesitas auditar también el contenido completo de la hoja original.</small>
        </section>
      )}
    </div>
  );
}

function CatalogPartDetails({ part }: { part: CatalogPart }) {
  const details = [
    part.group ? `Grupo: ${part.group}` : '',
    part.reference ? `Ref.: ${part.reference}` : '',
    part.usefulLife ? `Vida: ${part.usefulLife}` : '',
  ].filter(Boolean);
  return details.length > 0 ? <small className="catalog-part-details">{details.join(' · ')}</small> : null;
}

function SortableHeader({
  label,
  sortKey,
  sort,
  onSort,
  align,
}: {
  label: string;
  sortKey: CatalogSortKey;
  sort: CatalogSort;
  onSort: (key: CatalogSortKey) => void;
  align?: 'right';
}) {
  const active = sort.key === sortKey;
  return (
    <th className={align === 'right' ? 'align-right' : undefined}>
      <button className={`catalog-sort-button ${active ? 'active' : ''}`} type="button" onClick={() => onSort(sortKey)}>
        <span>{label}</span>
        <span aria-hidden="true">{active ? (sort.direction === 'asc' ? '↑' : '↓') : '↕'}</span>
      </button>
    </th>
  );
}
