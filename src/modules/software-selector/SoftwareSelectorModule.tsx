import { useEffect, useMemo, useState, type ChangeEvent, type FormEvent } from 'react';
import AiKeyPanel from '../../core/AiKeyPanel';
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
import type { IconSvgElement } from '@hugeicons/react';
import { ChartBarLineIcon, GridViewIcon, PrinterIcon, ServerStack01Icon, ShieldEnergyIcon, Wrench01Icon, WorkflowSquare01Icon } from '@hugeicons/core-free-icons';
import AnimatedTabs from '../../core/AnimatedTabs';
import { readJson, toErrorMessage } from '../../core/http';
import { UploadButton, ExportButton } from '../../core/ActionButtons';
import { ChevronDown, ChevronUp, FileText, Printer, Search, Sparkles } from 'lucide-react';
import { cn } from '../../core/cn';
import { Badge } from '../../core/ui/badge';
import { Button } from '../../core/ui/button';
import { Card, CardHeader, Muted } from '../../core/ui/card';
import { Input } from '../../core/ui/input';
import { PageHeader } from '../../core/ui/page-header';
import { StatusLine } from '../../core/ui/status-line';
import { Textarea } from '../../core/ui/textarea';

const MAX_TEXT_LENGTH = 250_000;
const DEMO_TEXT = 'El pliego requiere liberación Follow-Me, autenticación con tarjeta, integración con Active Directory, escaneo a SharePoint y continuidad operativa mediante un servidor de impresión local.';
const ALL_CATEGORIES = 'Todas' as const;

const CATEGORY_ICONS: Record<SoftwareCategory, IconSvgElement> = {
  'Gestión de Impresión': PrinterIcon,
  'Escaneo y Flujos de Trabajo': WorkflowSquare01Icon,
  'Costos e Informes': ChartBarLineIcon,
  'Gestión de Dispositivos y Flotas': ServerStack01Icon,
  'Supervisión y Servicio': Wrench01Icon,
  'Seguridad e Identidad': ShieldEnergyIcon,
};

const categoryTabs: readonly { id: typeof ALL_CATEGORIES | SoftwareCategory; label: string; icon: IconSvgElement }[] = [
  { id: ALL_CATEGORIES, label: 'Todas', icon: GridViewIcon },
  ...SOFTWARE_CATEGORIES.map((category) => ({ id: category, label: category, icon: CATEGORY_ICONS[category] })),
];
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

  return (
    <div className="page-content software-page">
      <PageHeader
        eyebrow="SOPORTE / SELECCIÓN DE SOFTWARE"
        title="Canon Software Selector"
        lead="Cruza los requisitos del cliente con uniFLOW e imageWARE. Analiza el pliego, revisa la selección y compara la cobertura de cada producto."
        actions={(
          <>
            <Button variant="outline" onClick={() => void printReport()} disabled={selectedFeatures.length === 0}><Printer />Imprimir / PDF</Button>
            <ExportButton onClick={exportReport} disabled={selectedFeatures.length === 0}>Exportar JSON</ExportButton>
          </>
        )}
      />

      <div className="print:hidden">
        <StatusLine state={error ? 'error' : loading || analyzing ? 'pending' : 'ready'}>
          {error || (analyzing ? 'Analizando requisitos del pliego…' : loading ? 'Cargando catálogo de requisitos…' : message || 'Pega un pliego o selecciona requisitos para comenzar.')}
        </StatusLine>
      </div>

      <div className="grid items-start gap-5 min-[1401px]:grid-cols-[minmax(0,1fr)_24rem] print:block">
        <div className="grid min-w-0 gap-5 print:hidden">
          <Card>
            <CardHeader
              eyebrow="PASO 1 / DOCUMENTO"
              title="Requisitos del pliego"
              aside={<Muted>{compactNumber.format(text.length)} / {compactNumber.format(MAX_TEXT_LENGTH)} caracteres</Muted>}
            />
            <form className="grid gap-3" onSubmit={analyze}>
              <label className="grid gap-1.5 text-xs font-bold text-ink-2! dark:text-[#9fb2d1]!">
                Texto para analizar
                <Textarea
                  id="software-requirements"
                  name="requirements"
                  className="min-h-56 font-normal"
                  value={text}
                  maxLength={MAX_TEXT_LENGTH}
                  rows={9}
                  onChange={(event) => { setText(event.target.value); setAnalysis(null); }}
                  placeholder="Pega aquí los requisitos técnicos del cliente…"
                />
              </label>
              <div className="flex flex-wrap items-center gap-2.5">
                <UploadButton id="software-source-file" name="sourceFile" label="Cargar TXT / PDF / DOCX" accept=".txt,.md,.csv,.json,.pdf,.docx,text/plain,text/markdown,text/csv,application/json,application/pdf,application/vnd.openxmlformats-officedocument.wordprocessingml.document" onChange={(event) => void loadDocumentFile(event)} />
                <Button variant="outline" onClick={loadDemo}>Cargar ejemplo</Button>
                <Button variant="outline" type="submit" id="btn-local" disabled={analyzing || !text.trim()}><FileText />{analyzing ? 'Procesando…' : 'Analizar localmente'}</Button>
                <Button type="submit" id="btn-ai" className="ml-auto max-[720px]:ml-0" disabled={analyzing || !text.trim()}><Sparkles />Analizar con IA</Button>
              </div>
              <Muted className="break-words leading-relaxed">
                Fuente actual: {fileName}. PDF y DOCX se extraen localmente. El análisis local busca expresiones técnicas conocidas y guarda el resultado en SQLite; el análisis con IA envía el texto a OpenRouter.
              </Muted>
            </form>
          </Card>

          <AiKeyPanel />

          <Card>
            <CardHeader eyebrow="PASO 2 / REVISIÓN" title="Requisitos evaluados" aside={<Badge>{compactNumber.format(selectedFeatureIds.length)} seleccionados</Badge>} />
            <div className="flex flex-wrap items-end gap-3">
              <label className="grid min-w-0 flex-1 basis-60 gap-1.5 text-xs font-bold text-ink-2! dark:text-[#9fb2d1]!">
                Buscar requisito
                <div className="relative">
                  <Search aria-hidden="true" className="pointer-events-none absolute left-3 top-3 size-4" />
                  <Input id="software-feature-search" name="featureSearch" className="pl-9 font-normal" value={search} onChange={(event) => setSearch(event.target.value)} placeholder="OCR, LDAP, tóner…" />
                </div>
              </label>
              <div className="flex flex-wrap gap-2">
                <Button variant="ghost" size="sm" onClick={() => setSelectedFeatureIds([])} disabled={selectedFeatureIds.length === 0}>Quitar selección</Button>
                {(selectedFeatureIds.length > 0 || text || analysis) && <Button variant="outline" size="sm" onClick={clearSelection}>Reiniciar</Button>}
              </div>
            </div>
            <AnimatedTabs scroll ariaLabel="Categorías de requisitos" tabs={categoryTabs} active={activeCategory} onChange={setActiveCategory} />
            <div className="flex flex-wrap items-center justify-between gap-2">
              <Muted>{compactNumber.format(filteredFeatures.length)} requisitos visibles</Muted>
              <div className="flex flex-wrap gap-1">
                <Button variant="ghost" size="sm" onClick={() => setAllCategoriesCollapsed(false)}>Expandir todo</Button>
                <Button variant="ghost" size="sm" onClick={() => setAllCategoriesCollapsed(true)}>Colapsar todo</Button>
              </div>
            </div>
            <div className="grid gap-5">
              {SOFTWARE_CATEGORIES.map((category, categoryIndex) => {
                const categoryFeatures = filteredFeatures.filter((feature) => feature.category === category);
                if (categoryFeatures.length === 0) return null;
                const selectedInCategory = categoryFeatures.filter((feature) => selectedFeatureIds.includes(feature.id)).length;
                const collapsed = collapsedCategories[category];
                const groupId = `software-category-${categoryIndex}`;
                return (
                  <section className="grid gap-3" key={category} aria-labelledby={`${groupId}-title`}>
                    <div className="flex flex-wrap items-center justify-between gap-3 border-b border-navy/10 pb-3 dark:border-sky/20">
                      <div className="min-w-0">
                        <h3 id={`${groupId}-title`} className="text-sm font-bold text-navy dark:text-white">{category}</h3>
                        <Muted>{selectedInCategory} / {categoryFeatures.length} visibles seleccionados</Muted>
                      </div>
                      <div className="flex gap-1">
                        <Button variant="ghost" size="sm" onClick={() => toggleCategory(category)} aria-label={`${selectedInCategory === categoryFeatures.length ? 'Quitar' : 'Seleccionar'} todos los requisitos visibles de ${category}`}>{selectedInCategory === categoryFeatures.length ? 'Ninguno' : 'Todos'}</Button>
                        <Button variant="outline" size="sm" onClick={() => toggleCategoryVisibility(category)} aria-expanded={!collapsed} aria-controls={groupId}>{collapsed ? <ChevronDown /> : <ChevronUp />}{collapsed ? 'Mostrar' : 'Ocultar'}</Button>
                      </div>
                    </div>
                    <div id={groupId} hidden={collapsed} className={collapsed ? undefined : 'grid gap-2'}>
                      {categoryFeatures.map((feature) => {
                        const selected = selectedFeatureIds.includes(feature.id);
                        return (
                          <label
                            className={cn(
                              'grid cursor-pointer grid-cols-[1rem_minmax(0,1fr)] items-start gap-3 rounded-xl border p-3 transition-colors hover:border-sky/60 focus-within:outline-2 focus-within:outline-offset-2 focus-within:outline-sky',
                              selected ? 'border-sky/60 bg-sky/10' : 'border-navy/10 bg-paper/60 dark:border-sky/20 dark:bg-navy/30',
                            )}
                            key={feature.id}
                          >
                            <input className="mt-0.5 size-4 accent-sky" id={`software-feature-${feature.id}`} name="features" type="checkbox" value={feature.id} checked={selected} onChange={() => toggleFeature(feature.id)} />
                            <div className="grid gap-1">
                              <div className="text-sm font-semibold leading-snug text-navy dark:text-white">{feature.label}</div>
                              <Muted className="leading-relaxed">{feature.description}</Muted>
                            </div>
                          </label>
                        );
                      })}
                    </div>
                  </section>
                );
              })}
              {filteredFeatures.length === 0 && (
                <div className="grid justify-items-center gap-2 rounded-xl border border-dashed border-navy/20 p-6 text-center dark:border-sky/30">
                  <div className="text-sm font-bold text-navy dark:text-white">Sin coincidencias</div>
                  <Muted>Prueba otra búsqueda o vuelve a la categoría Todas.</Muted>
                </div>
              )}
            </div>
          </Card>
        </div>

        <aside aria-label="Matriz de compatibilidad y recomendaciones" className="grid min-w-0 gap-5 print:block">
          <Card className="print:mb-5">
            <CardHeader eyebrow="PASO 3 / RESULTADO" title="Recomendaciones" aside={<Badge>{recommendations.length} opciones</Badge>} />
            {recommendations.length === 0 ? (
              <div className="grid gap-4">
                <div className="grid gap-1 rounded-xl border border-dashed border-navy/20 p-5 text-center dark:border-sky/30">
                  <div className="font-bold text-navy dark:text-white">Sin matriz todavía</div>
                  <Muted>Analiza un pliego o selecciona requisitos manualmente. También puedes partir de un caso de uso.</Muted>
                </div>
                <div className="grid gap-2">
                  {SOFTWARE_PRESETS.map((preset) => (
                    <Button variant="outline" className="h-auto justify-start whitespace-normal p-3 text-left" key={preset.id} onClick={() => applyPreset(preset.featureIds, preset.label)}>
                      <div className="grid gap-1">
                        <div className="text-sm">{preset.label}</div>
                        <Muted className="font-normal">{preset.description}</Muted>
                      </div>
                    </Button>
                  ))}
                </div>
              </div>
            ) : (
              <div className="grid gap-3">{recommendations.map((recommendation) => <RecommendationCard key={recommendation.product.id} recommendation={recommendation} />)}</div>
            )}
          </Card>

          <Card className="print:mb-5 print:break-inside-avoid">
            <CardHeader eyebrow="TRAZABILIDAD" title="Requisitos detectados" aside={<Badge>{analysis ? analysis.source : 'manual'}</Badge>} />
            {analysis ? (
              <div className="grid max-h-96 gap-3 overflow-y-auto print:max-h-none print:overflow-visible">
                {analysis.selectedFeatureIds.map((id) => (
                  <div className="grid gap-1 border-b border-navy/10 pb-3 last:border-0 last:pb-0 dark:border-sky/20" key={id}>
                    <div className="text-sm font-semibold text-navy dark:text-white">{features.find((feature) => feature.id === id)?.label ?? id}</div>
                    <Muted className="leading-relaxed">{analysis.reasoning[id]}</Muted>
                  </div>
                ))}
              </div>
            ) : (
              <Muted className="leading-relaxed">El motor mostrará aquí la expresión que justificó cada selección. Puedes corregir la matriz manualmente.</Muted>
            )}
            {analysis && <Button variant="ghost" size="sm" className="justify-self-start underline print:hidden" onClick={() => void clearSavedAnalysis()}>Borrar análisis guardado</Button>}
          </Card>

          <Card className="print:mb-5 print:break-inside-avoid">
            <CardHeader eyebrow="REVISIÓN" title="Requisitos sin cobertura" aside={<Badge tone={gaps.length > 0 ? 'warning' : 'neutral'}>{gaps.length}</Badge>} />
            {gaps.length > 0 ? (
              <div className="grid gap-2">
                {gaps.map((feature) => <div className="rounded-xl border border-[#e08a00]/30 bg-[#e08a00]/10 p-3 text-sm text-[#7a4a00] dark:text-[#ffd28a]" key={feature.id}>{feature.label}</div>)}
              </div>
            ) : (
              <Muted className="leading-relaxed">No hay requisitos seleccionados que queden sin cobertura en las cuatro opciones de la matriz.</Muted>
            )}
          </Card>

          <Card className="print:hidden">
            <CardHeader eyebrow="REFERENCIA" title="Productos comparados" aside={<Badge>{products.length}</Badge>} />
            <div className="grid gap-3">
              {products.map((product) => (
                <div className="grid gap-1 border-b border-navy/10 pb-3 last:border-0 last:pb-0 dark:border-sky/20" key={product.id}>
                  <div className="text-sm font-semibold text-navy dark:text-white">{product.name}</div>
                  <Muted>{product.category}</Muted>
                </div>
              ))}
            </div>
            {products.length === 0 && <Muted>El catálogo no está disponible.</Muted>}
          </Card>
        </aside>
      </div>
    </div>
  );
}

function RecommendationCard({ recommendation }: { recommendation: SoftwareRecommendation }) {
  const best = recommendation.tier === 'Mejor coincidencia';
  return (
    <article className={cn('grid gap-3 rounded-xl border p-4 print:break-inside-avoid', best ? 'border-sky/50 bg-sky/10' : 'border-navy/10 bg-paper/60 dark:border-sky/20 dark:bg-navy/30')}>
      <div className="flex items-start justify-between gap-3">
        <div className="grid min-w-0 gap-2">
          <Badge className="justify-self-start" tone={best ? 'success' : 'neutral'}>{recommendation.tier}</Badge>
          <h3 className="text-base font-bold leading-snug text-navy dark:text-white">{recommendation.product.name}</h3>
        </div>
        <div className="text-right">
          <div className="text-2xl font-extrabold text-[#00698f] dark:text-sky">{percentage.format(recommendation.coverageRate)}</div>
          <Muted>cobertura</Muted>
        </div>
      </div>
      <Muted className="leading-relaxed">{recommendation.product.description}</Muted>
      <div className="flex flex-wrap items-center justify-between gap-2">
        <Muted>{recommendation.score} de {recommendation.score + recommendation.unsupportedFeatureIds.length} requisitos cubiertos</Muted>
        <Badge tone={recommendation.unsupportedFeatureIds.length > 0 ? 'warning' : 'success'}>{recommendation.unsupportedFeatureIds.length} {recommendation.unsupportedFeatureIds.length === 1 ? 'pendiente' : 'pendientes'}</Badge>
      </div>
      <details className="border-t border-navy/10 pt-3 dark:border-sky/20 print:hidden">
        <summary className="cursor-pointer text-xs font-bold text-[#00698f] dark:text-sky">Ver alcance y límites</summary>
        <Muted className="mt-2 leading-relaxed">{recommendation.product.details}</Muted>
      </details>
      <Muted className="hidden leading-relaxed print:block">{recommendation.product.details}</Muted>
    </article>
  );
}

