import { useEffect, useMemo, useState, type ChangeEvent, type FormEvent } from 'react';
import { extractDocxTextFromBytes } from '../../core/document-text';
import { printOrSaveCurrentPageAsPdf } from '../../core/print';
import { findSoftwareGaps, recommendSoftware } from './analysis';
import { SOFTWARE_FEATURES, SOFTWARE_PRODUCTS } from './catalog';
import { extractPdfTextFromBytes } from '../ventas/service-report';
import type {
  SoftwareAnalysis,
  SoftwareAnalysisResponse,
  SoftwareCategory,
  SoftwareFeature,
  SoftwareProduct,
  SoftwareRecommendation,
} from './types';
import { SOFTWARE_CATEGORIES } from './types';

const MAX_TEXT_LENGTH = 250_000;
const DEMO_TEXT = 'El pliego requiere liberación Follow-Me, autenticación con tarjeta, integración con Active Directory, escaneo a SharePoint y continuidad operativa mediante un servidor de impresión local.';
const ALL_CATEGORIES = 'Todas' as const;
const compactNumber = new Intl.NumberFormat('es-PY');
const percentage = new Intl.NumberFormat('es-PY', { style: 'percent', maximumFractionDigits: 0 });
const SOFTWARE_PRESETS = [
  {
    id: 'cloud-print',
    label: 'Suite de liberación en la nube',
    description: 'Impresión móvil segura con control de costos.',
    featureIds: ['secure_print_auth', 'print_anywhere', 'mobile_cloud_print', 'cloud_ocr', 'cost_tracking'],
  },
  {
    id: 'fleet-management',
    label: 'Flota y mantenimiento de TI',
    description: 'Servicio preventivo y gestión remota de equipos.',
    featureIds: ['meter_capture_auto', 'central_device_management', 'meap_app_management', 'firmware_remote_update', 'proactive_service_monitoring', 'consumables_monitoring'],
  },
] as const;

type SoftwareCatalogResponse = {
  features: SoftwareFeature[];
  products: SoftwareProduct[];
};

export default function SoftwareSelectorModule() {
  const [features, setFeatures] = useState<SoftwareFeature[]>([...SOFTWARE_FEATURES]);
  const [products, setProducts] = useState<SoftwareProduct[]>([...SOFTWARE_PRODUCTS]);
  const [analysis, setAnalysis] = useState<SoftwareAnalysis | null>(null);
  const [text, setText] = useState('');
  const [fileName, setFileName] = useState('texto_pegado.txt');
  const [selectedFeatureIds, setSelectedFeatureIds] = useState<string[]>([]);
  const [search, setSearch] = useState('');
  const [activeCategory, setActiveCategory] = useState<typeof ALL_CATEGORIES | SoftwareCategory>(ALL_CATEGORIES);
  const [collapsedCategories, setCollapsedCategories] = useState<Record<SoftwareCategory, boolean>>(() =>
    Object.fromEntries(SOFTWARE_CATEGORIES.map((category) => [category, false])) as Record<SoftwareCategory, boolean>,
  );
  const [loading, setLoading] = useState(true);
  const [analyzing, setAnalyzing] = useState(false);
  const [message, setMessage] = useState('');
  const [error, setError] = useState<string | null>(null);

  useEffect(() => {
    void loadModule();
  }, []);

  const selectedFeatures = useMemo(
    () => features.filter((feature) => selectedFeatureIds.includes(feature.id)),
    [features, selectedFeatureIds],
  );
  const recommendations = useMemo(() => recommendSoftware(selectedFeatureIds), [selectedFeatureIds]);
  const gaps = useMemo(() => findSoftwareGaps(selectedFeatureIds), [selectedFeatureIds]);
  const filteredFeatures = useMemo(() => {
    const query = search.trim().toLowerCase();
    return features.filter((feature) => {
      const categoryMatches = activeCategory === ALL_CATEGORIES || feature.category === activeCategory;
      const searchMatches = !query
        || feature.label.toLowerCase().includes(query)
        || feature.description.toLowerCase().includes(query)
        || feature.category.toLowerCase().includes(query);
      return categoryMatches && searchMatches;
    });
  }, [activeCategory, features, search]);

  async function loadModule() {
    setLoading(true);
    setError(null);
    try {
      const [catalogResponse, lastResponse] = await Promise.all([
        fetch('/api/software-selector/catalog'),
        fetch('/api/software-selector/last'),
      ]);
      const catalog = await readJson<SoftwareCatalogResponse>(catalogResponse);
      const last = await readJson<SoftwareAnalysisResponse | null>(lastResponse);
      setFeatures(catalog.features);
      setProducts(catalog.products);
      if (last) {
        setAnalysis(last.analysis);
        setText(last.analysis.textExcerpt);
        setFileName(last.analysis.fileName);
        setSelectedFeatureIds(last.analysis.selectedFeatureIds);
        setMessage('Se restauró el último análisis guardado en SQLite.');
      }
    } catch (loadError: unknown) {
      setError(toErrorMessage(loadError));
    } finally {
      setLoading(false);
    }
  }

  async function analyze(event: FormEvent<HTMLFormElement>) {
    event.preventDefault();
    const isAi = (event.nativeEvent as SubmitEvent).submitter?.id === 'btn-ai';
    if (!text.trim()) {
      setError('Pega el texto del pliego o carga un archivo de texto antes de analizar.');
      return;
    }
    setAnalyzing(true);
    setError(null);
    try {
      const response = await fetch(isAi ? '/api/ai/analyze-software' : '/api/software-selector/analyze', {
        method: 'POST',
        headers: { 'content-type': 'application/json' },
        body: JSON.stringify({ text, fileName }),
      });
      const result = await readJson<SoftwareAnalysisResponse>(response);
      setAnalysis(result.analysis);
      setSelectedFeatureIds(result.analysis.selectedFeatureIds);
      setMessage(result.analysis.usedFallback
        ? 'No hubo coincidencias específicas; se cargó la selección base para revisión manual.'
        : `Análisis ${isAi ? 'IA' : 'local'} completo: ${compactNumber.format(result.analysis.selectedFeatureIds.length)} requisitos detectados.`);
    } catch (analysisError: unknown) {
      setError(toErrorMessage(analysisError));
    } finally {
      setAnalyzing(false);
    }
  }

  function toggleFeature(id: string) {
    setSelectedFeatureIds((current) => current.includes(id)
      ? current.filter((featureId) => featureId !== id)
      : [...current, id]);
    setAnalysis(null);
    setMessage('Selección manual actualizada. Analiza nuevamente para guardar el texto y las coincidencias.');
  }

  function toggleCategory(category: SoftwareCategory) {
    const categoryIds = filteredFeatures.filter((feature) => feature.category === category).map((feature) => feature.id);
    const allSelected = categoryIds.length > 0 && categoryIds.every((id) => selectedFeatureIds.includes(id));
    setSelectedFeatureIds((current) => allSelected
      ? current.filter((id) => !categoryIds.includes(id))
      : [...new Set([...current, ...categoryIds])]);
    setAnalysis(null);
  }

  function toggleCategoryVisibility(category: SoftwareCategory) {
    setCollapsedCategories((current) => ({ ...current, [category]: !current[category] }));
  }

  function setAllCategoriesCollapsed(collapsed: boolean) {
    setCollapsedCategories(Object.fromEntries(SOFTWARE_CATEGORIES.map((category) => [category, collapsed])) as Record<SoftwareCategory, boolean>);
  }

  function applyPreset(featureIds: readonly string[], label: string) {
    setSelectedFeatureIds([...featureIds]);
    setAnalysis(null);
    setError(null);
    setMessage(`${label} cargado. Puedes ajustar los requisitos antes de generar el informe.`);
  }

  function clearSelection() {
    setSelectedFeatureIds([]);
    setAnalysis(null);
    setText('');
    setFileName('texto_pegado.txt');
    setSearch('');
    setError(null);
    setMessage('Selección reiniciada.');
  }

  async function clearSavedAnalysis() {
    try {
      const response = await fetch('/api/software-selector/last', { method: 'DELETE' });
      if (!response.ok) throw new Error('No se pudo borrar el análisis guardado.');
      clearSelection();
      setMessage('Análisis guardado eliminado de SQLite.');
    } catch (clearError: unknown) {
      setError(toErrorMessage(clearError));
    }
  }

  async function loadDocumentFile(event: ChangeEvent<HTMLInputElement>) {
    const file = event.target.files?.[0];
    event.target.value = '';
    if (!file) return;
    if (file.size > 5 * 1024 * 1024) {
      setError('El documento supera el límite de 5 MB.');
      return;
    }
    const extension = file.name.toLowerCase().split('.').pop();
    if (!['txt', 'md', 'csv', 'json', 'pdf', 'docx'].includes(extension ?? '')) {
      setError('Solo se aceptan TXT, MD, CSV, JSON, PDF o DOCX.');
      return;
    }
    try {
      const bytes = extension === 'pdf' || extension === 'docx'
        ? new Uint8Array(await file.arrayBuffer())
        : null;
      const contents = extension === 'pdf'
        ? await extractPdfTextFromBytes(bytes!)
        : extension === 'docx'
          ? await extractDocxTextFromBytes(bytes!)
          : await file.text();
      if (!contents.trim()) {
        throw new Error(`No se encontró texto legible en ${file.name}.`);
      }
      if (contents.length > MAX_TEXT_LENGTH) {
        setError('El texto supera el límite de 250.000 caracteres.');
        return;
      }
      setText(contents);
      setFileName(file.name);
      setAnalysis(null);
      setError(null);
      setMessage(`Archivo ${file.name} cargado localmente. Revisa el texto extraído y ejecuta el análisis.`);
    } catch (fileError: unknown) {
      setError(toErrorMessage(fileError));
    }
  }

  function loadDemo() {
    setText(DEMO_TEXT);
    setFileName('ejemplo-pliego.txt');
    setAnalysis(null);
    setError(null);
    setMessage('Ejemplo cargado. Ejecuta el análisis local para detectar requisitos.');
  }

  async function printReport() {
    if (selectedFeatures.length === 0) return;
    setError(null);
    try {
      const saved = await printOrSaveCurrentPageAsPdf(`informe-software-selector-${fileName || 'reporte'}`);
      setMessage(saved === null
        ? 'Diálogo de impresión abierto.'
        : saved.saved
          ? `PDF guardado: ${saved.filePath ?? 'archivo seleccionado'}.`
          : 'Guardado de PDF cancelado.');
    } catch (printError: unknown) {
      setError(toErrorMessage(printError));
    }
  }

  function exportReport() {
    if (selectedFeatures.length === 0) return;
    const payload = {
      generatedAt: new Date().toISOString(),
      fileName,
      source: analysis?.source ?? 'selección manual',
      requirements: selectedFeatures.map((feature) => ({
        id: feature.id,
        category: feature.category,
        label: feature.label,
        description: feature.description,
        reasoning: analysis?.reasoning[feature.id] ?? 'Seleccionado manualmente para evaluación.',
      })),
      recommendations: recommendations.map((recommendation) => ({
        product: recommendation.product.name,
        score: recommendation.score,
        coverageRate: recommendation.coverageRate,
        tier: recommendation.tier,
        supportedFeatureIds: recommendation.supportedFeatureIds,
        unsupportedFeatureIds: recommendation.unsupportedFeatureIds,
      })),
    };
    const blob = new Blob([JSON.stringify(payload, null, 2)], { type: 'application/json;charset=utf-8' });
    const url = URL.createObjectURL(blob);
    const anchor = document.createElement('a');
    anchor.href = url;
    anchor.download = 'software-selector-reporte.json';
    anchor.click();
    URL.revokeObjectURL(url);
    setMessage('Reporte JSON generado.');
  }

  const productById = new Map(products.map((product) => [product.id, product]));

  return (
    <div className="page-content software-page">
      <section className="catalog-header">
        <div>
          <div className="eyebrow">SOPORTE / ANÁLISIS LOCAL</div>
          <h1>Canon Software Selector</h1>
          <p className="lead">Convierte requisitos de un pliego en una matriz de compatibilidad para uniFLOW e imageWARE, sin depender de un proveedor de IA.</p>
        </div>
        <div className="software-actions">
          <button className="secondary-button" type="button" onClick={() => void printReport()} disabled={selectedFeatures.length === 0}>Imprimir / PDF</button>
          <button className="primary-button" type="button" onClick={exportReport} disabled={selectedFeatures.length === 0}>Exportar JSON</button>
        </div>
      </section>

      <section className="sales-status" aria-live="polite">
        <span className={`status-dot ${error ? 'error' : loading || analyzing ? 'pending' : 'ready'}`} />
        <span>{error || message || (loading ? 'Cargando catálogo de requisitos…' : 'Pega un pliego para comenzar.')}</span>
      </section>

      <section className="software-layout">
        <main className="software-main">
          <section className="sales-card software-input-card">
            <div className="card-heading">
              <div><div className="eyebrow">PASO 1 / DOCUMENTO</div><h2>Requisitos del pliego</h2></div>
              <span className="muted-note">{compactNumber.format(text.length)} / {compactNumber.format(MAX_TEXT_LENGTH)} caracteres</span>
            </div>
            <form onSubmit={analyze}>
              <label className="search-field software-text-field">
                <span>Texto para analizar</span>
                <textarea id="software-requirements" name="requirements" value={text} maxLength={MAX_TEXT_LENGTH} rows={9} onChange={(event) => { setText(event.target.value); setAnalysis(null); }} placeholder="Pega aquí los requisitos técnicos del cliente…" />
              </label>
              <div className="software-input-actions">
                <label className="file-input-button">
                  <span>Cargar TXT / PDF / DOCX</span>
                  <input id="software-source-file" name="sourceFile" type="file" accept=".txt,.md,.csv,.json,.pdf,.docx,text/plain,text/markdown,text/csv,application/json,application/pdf,application/vnd.openxmlformats-officedocument.wordprocessingml.document" onChange={(event) => void loadDocumentFile(event)} />
                </label>
                <button className="secondary-button" type="button" onClick={loadDemo}>Cargar ejemplo</button>
                <button className="secondary-button" type="submit" id="btn-local" disabled={analyzing || !text.trim()}>{analyzing ? 'Procesando…' : 'Analizar localmente'}</button>
                <button className="primary-button" type="submit" id="btn-ai" disabled={analyzing || !text.trim()}>Analizar con Gemini</button>
              </div>
              <p className="form-hint">Fuente actual: <strong>{fileName}</strong>. PDF y DOCX se extraen localmente; el motor normaliza acentos y busca expresiones técnicas conocidas. Los resultados se guardan en la SQLite de esta instalación.</p>
            </form>
          </section>

          <section className="sales-card software-feature-card">
            <div className="card-heading">
              <div><div className="eyebrow">PASO 2 / REVISIÓN</div><h2>Requisitos evaluados</h2></div>
              <span className="badge neutral">{compactNumber.format(selectedFeatureIds.length)} seleccionados</span>
            </div>
            <div className="software-filter-row">
              <label className="search-field"><span>Buscar requisito</span><input id="software-feature-search" name="featureSearch" value={search} onChange={(event) => setSearch(event.target.value)} placeholder="OCR, LDAP, tóner…" /></label>
              <div className="software-filter-actions">
                <button className="text-button" type="button" onClick={() => setSelectedFeatureIds([])}>Quitar selección</button>
                {(selectedFeatureIds.length > 0 || text || analysis) && <button className="text-button" type="button" onClick={clearSelection}>Reiniciar</button>}
              </div>
            </div>
            <div className="software-category-tabs" role="tablist" aria-label="Categorías de requisitos">
              <button className={activeCategory === ALL_CATEGORIES ? 'active' : ''} type="button" onClick={() => setActiveCategory(ALL_CATEGORIES)}>Todas</button>
              {SOFTWARE_CATEGORIES.map((category) => <button className={activeCategory === category ? 'active' : ''} key={category} type="button" onClick={() => setActiveCategory(category)}>{category}</button>)}
            </div>
            <div className="software-category-actions">
              <span>Vista de categorías</span>
              <div>
                <button className="text-button" type="button" onClick={() => setAllCategoriesCollapsed(false)}>Expandir todo</button>
                <button className="text-button" type="button" onClick={() => setAllCategoriesCollapsed(true)}>Colapsar todo</button>
              </div>
            </div>
            <div className="software-feature-groups">
              {SOFTWARE_CATEGORIES.map((category) => {
                const categoryFeatures = filteredFeatures.filter((feature) => feature.category === category);
                if (categoryFeatures.length === 0) return null;
                const selectedInCategory = categoryFeatures.filter((feature) => selectedFeatureIds.includes(feature.id)).length;
                const collapsed = collapsedCategories[category];
                return (
                  <section className="software-feature-group" key={category}>
                    <div className="software-group-heading">
                      <div><h3>{category}</h3><span>{selectedInCategory} / {categoryFeatures.length} visibles seleccionados</span></div>
                      <div className="software-group-actions">
                        <button className="text-button" type="button" onClick={() => toggleCategory(category)}>{selectedInCategory === categoryFeatures.length ? 'Ninguno' : 'Todos'}</button>
                        <button className="text-button" type="button" onClick={() => toggleCategoryVisibility(category)}>{collapsed ? 'Mostrar' : 'Ocultar'}</button>
                      </div>
                    </div>
                    {!collapsed && <div className="software-feature-list">
                      {categoryFeatures.map((feature) => {
                        const selected = selectedFeatureIds.includes(feature.id);
                        return (
                          <label className={`software-feature-row ${selected ? 'selected' : ''}`} key={feature.id}>
                            <input id={`software-feature-${feature.id}`} name="features" type="checkbox" value={feature.id} checked={selected} onChange={() => toggleFeature(feature.id)} />
                            <span><strong>{feature.label}</strong><small>{feature.description}</small></span>
                          </label>
                        );
                      })}
                    </div>}
                  </section>
                );
              })}
              {filteredFeatures.length === 0 && <div className="software-empty">No hay requisitos que coincidan con la búsqueda.</div>}
            </div>
          </section>
        </main>

        <aside className="software-sidebar">
          <section className="sales-card software-summary-card">
            <div className="card-heading"><div><div className="eyebrow">MATRIZ / RESULTADO</div><h2>Recomendaciones</h2></div><span className="muted-note">{recommendations.length} opciones</span></div>
            {recommendations.length === 0
              ? <div className="software-empty">
                <strong>Sin matriz todavía.</strong>
                <span>Analiza un pliego o selecciona requisitos manualmente.</span>
                <div className="software-shortcuts">
                  {SOFTWARE_PRESETS.map((preset) => (
                    <button className="software-shortcut" type="button" key={preset.id} onClick={() => applyPreset(preset.featureIds, preset.label)}>
                      <strong>{preset.label}</strong>
                      <span>{preset.description}</span>
                    </button>
                  ))}
                </div>
              </div>
              : <div className="software-recommendation-list">{recommendations.map((recommendation) => <RecommendationCard key={recommendation.product.id} recommendation={recommendation} />)}</div>}
          </section>

          <section className="sales-card software-analysis-card">
            <div className="card-heading"><div><div className="eyebrow">TRAZABILIDAD</div><h2>Requisitos detectados</h2></div><span className="muted-note">{analysis ? analysis.source : 'manual'}</span></div>
            {analysis
              ? <div className="software-reason-list">{analysis.selectedFeatureIds.map((id) => <div className="software-reason" key={id}><strong>{features.find((feature) => feature.id === id)?.label ?? id}</strong><span>{analysis.reasoning[id]}</span></div>)}</div>
              : <p className="software-note">El motor mostrará aquí la expresión que justificó cada selección. Puedes corregir la matriz manualmente.</p>}
            {analysis && <button className="text-button software-clear-saved" type="button" onClick={() => void clearSavedAnalysis()}>Borrar análisis guardado</button>}
          </section>

          <section className="sales-card software-gaps-card">
            <div className="card-heading"><div><div className="eyebrow">REVISIÓN</div><h2>Gaps universales</h2></div><span className="badge neutral">{gaps.length}</span></div>
            {gaps.length > 0
              ? <ul className="software-gap-list">{gaps.map((feature) => <li key={feature.id}>{feature.label}</li>)}</ul>
              : <p className="software-note">No hay requisitos seleccionados que queden sin cobertura en las cuatro opciones de la matriz.</p>}
          </section>

          <section className="sales-card software-products-card">
            <div className="card-heading"><div><div className="eyebrow">REFERENCIA</div><h2>Productos comparados</h2></div><span className="muted-note">{products.length}</span></div>
            <div className="software-product-list">{products.map((product) => <div className="software-product-row" key={product.id}><strong>{product.name}</strong><span>{product.category}</span></div>)}</div>
            {productById.size === 0 && <p className="software-note">El catálogo no está disponible.</p>}
          </section>
        </aside>
      </section>
    </div>
  );
}

function RecommendationCard({ recommendation }: { recommendation: SoftwareRecommendation }) {
  return (
    <article className={`software-recommendation ${recommendation.tier === 'Mejor coincidencia' ? 'best' : ''}`}>
      <div className="software-recommendation-head">
        <div><span className="software-tier">{recommendation.tier}</span><strong>{recommendation.product.name}</strong></div>
        <b>{percentage.format(recommendation.coverageRate)}</b>
      </div>
      <p>{recommendation.product.description}</p>
      <div className="software-score-line"><span>{recommendation.score} de {recommendation.score + recommendation.unsupportedFeatureIds.length} requisitos cubiertos</span><span>{recommendation.unsupportedFeatureIds.length} pendientes</span></div>
      <details>
        <summary>Ver alcance y límites</summary>
        <p>{recommendation.product.details}</p>
      </details>
    </article>
  );
}

async function readJson<T>(response: Response): Promise<T> {
  const payload = await response.json() as T | { error?: unknown };
  if (!response.ok) {
    const error = payload && typeof payload === 'object' && 'error' in payload ? payload.error : undefined;
    throw new Error(typeof error === 'string' ? error : `Solicitud fallida (${response.status}).`);
  }
  return payload as T;
}

function toErrorMessage(error: unknown): string {
  return error instanceof Error ? error.message : 'No se pudo completar la operación.';
}
