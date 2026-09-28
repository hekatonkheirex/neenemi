import { useEffect, useMemo, useRef, useState, type ChangeEvent, type DragEvent, type FormEvent } from 'react';
import { printOrSaveHtmlReportAsPdf } from '../../core/print';
import { calculateYield, summarizeDocumentCoverage } from './calculations';
import coveragePrintStyles from './coverage-print.css?inline';
import { renderCoveragePrintReportMarkup } from './coverage-print-report';
import type { PdfPageFailure, PdfProgressEvent } from './pdf-analysis';
import type { CanonColorType, CanonModel, CanonModelDraft, CoverageAnalysis, PageCoverage, YieldEstimate } from './types';

const numberFormat = new Intl.NumberFormat('es-PY', { maximumFractionDigits: 1, minimumFractionDigits: 1 });
const pageFormat = new Intl.NumberFormat('es-PY', { maximumFractionDigits: 0 });
const INITIAL_UPLOAD_PROGRESS = { totalPages: 0, completedPages: 0, successfulPages: 0, failedPages: 0, currentPage: null as number | null };
type UploadStatus = 'idle' | 'analyzing' | 'saving' | 'complete' | 'error';

function isPdfFile(file: File): boolean {
  return file.type === 'application/pdf' || file.name.toLowerCase().endsWith('.pdf');
}

function getProgressPercent(progress: typeof INITIAL_UPLOAD_PROGRESS): number {
  return progress.totalPages === 0 ? 0 : Math.round((progress.completedPages / progress.totalPages) * 100);
}

type ModelForm = {
  name: string;
  colorType: CanonColorType;
  black: string;
  cyan: string;
  magenta: string;
  yellow: string;
};

const EMPTY_MODEL_FORM: ModelForm = { name: '', colorType: 'color', black: '', cyan: '', magenta: '', yellow: '' };

export default function CoberturaModule() {
  const [models, setModels] = useState<CanonModel[]>([]);
  const [selectedModelId, setSelectedModelId] = useState('');
  const [pages, setPages] = useState<PageCoverage[]>([]);
  const [analysis, setAnalysis] = useState<CoverageAnalysis | null>(null);
  const [fileName, setFileName] = useState<string | null>(null);
  const [uploadStatus, setUploadStatus] = useState<UploadStatus>('idle');
  const [uploadProgress, setUploadProgress] = useState(INITIAL_UPLOAD_PROGRESS);
  const [failedPages, setFailedPages] = useState<PdfPageFailure[]>([]);
  const [isDragging, setIsDragging] = useState(false);
  const [uploadError, setUploadError] = useState<string | null>(null);
  const [modelForm, setModelForm] = useState<ModelForm>(EMPTY_MODEL_FORM);
  const [editingModelId, setEditingModelId] = useState<string | null>(null);
  const [modelFormOpen, setModelFormOpen] = useState(false);
  const [loading, setLoading] = useState(true);
  const [saving, setSaving] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [message, setMessage] = useState('');
  const fileInputRef = useRef<HTMLInputElement>(null);
  const analysisRun = useRef(0);

  useEffect(() => {
    void loadModule();
  }, []);

  const selectedModel = useMemo(() => models.find((model) => model.id === selectedModelId) ?? null, [models, selectedModelId]);
  const coverage = analysis?.coverage ?? summarizeDocumentCoverage(pages);
  const yieldEstimate = useMemo<YieldEstimate | null>(() => {
    if (!selectedModel || coverage.pages.length === 0) return null;
    try {
      return calculateYield(selectedModel, coverage.average);
    } catch {
      return null;
    }
  }, [coverage, selectedModel]);

  async function loadModule() {
    setLoading(true);
    setError(null);
    try {
      const [modelsResponse, lastResponse] = await Promise.all([
        fetch('/api/coverage/models'),
        fetch('/api/coverage/last'),
      ]);
      setModels(await readJson<CanonModel[]>(modelsResponse));
      const last = await readJson<CoverageAnalysis | null>(lastResponse);
      if (last) {
        setAnalysis(last);
        setPages(last.coverage.pages);
        setFileName(last.sourceName);
        setFailedPages(last.failedPages ?? []);
        setUploadStatus('complete');
        setMessage('Se restauró el último análisis de cobertura guardado en SQLite.');
      }
    } catch (loadError: unknown) {
      setError(toErrorMessage(loadError));
    } finally {
      setLoading(false);
    }
  }

  async function analyzePdf(file: File) {
    const currentRun = ++analysisRun.current;
    setFileName(file.name);
    setUploadError(null);
    setError(null);
    setMessage('');
    setPages([]);
    setAnalysis(null);
    setFailedPages([]);
    setUploadProgress(INITIAL_UPLOAD_PROGRESS);

    if (!isPdfFile(file)) {
      setUploadStatus('error');
      setUploadError('Selecciona un archivo PDF válido.');
      return;
    }

    setUploadStatus('analyzing');
    const onProgress = (event: PdfProgressEvent) => {
      if (currentRun !== analysisRun.current) return;
      setUploadProgress({
        totalPages: event.totalPages,
        completedPages: event.completedPages,
        successfulPages: event.successfulPages,
        failedPages: event.failedPages,
        currentPage: event.status === 'completed' ? null : event.page,
      });
      if (event.status === 'page-completed') {
        setPages((current) => [...current.filter((page) => page.page !== event.page), event.coverage]
          .sort((left, right) => left.page - right.page));
      }
      if (event.status === 'page-failed') {
        setFailedPages((current) => [...current.filter((item) => item.page !== event.page), event.error]
          .sort((left, right) => left.page - right.page));
      }
    };

    try {
      const { analyzePdfFile } = await import('./pdfjs');
      const result = await analyzePdfFile(file, onProgress);
      if (currentRun !== analysisRun.current) return;

      setPages(result.coverage.pages);
      setFailedPages(result.failedPages);
      if (result.coverage.pages.length === 0) {
        setUploadStatus('error');
        setUploadError('No se pudo analizar ninguna página del PDF. Revisa el archivo e inténtalo nuevamente.');
        return;
      }

      setUploadStatus('saving');
      const response = await fetch('/api/coverage/analyze', {
        method: 'POST',
        headers: { 'content-type': 'application/json' },
        body: JSON.stringify({
          sourceName: file.name,
          pages: result.coverage.pages.map(({ total: _total, ...page }) => page),
          failedPages: result.failedPages,
          inputMode: 'pdf',
          modelId: selectedModelId || undefined,
        }),
      });
      const saved = await readJson<{ analysis: CoverageAnalysis }>(response);
      if (currentRun !== analysisRun.current) return;
      setAnalysis(saved.analysis);
      setPages(saved.analysis.coverage.pages);
      setFailedPages(saved.analysis.failedPages ?? result.failedPages);
      setMessage(`Análisis de ${file.name} guardado en SQLite.`);
      setUploadStatus('complete');
    } catch (analysisError: unknown) {
      if (currentRun !== analysisRun.current) return;
      setUploadStatus('error');
      setUploadError(toErrorMessage(analysisError));
    }
  }

  function handleFileInput(event: ChangeEvent<HTMLInputElement>) {
    const file = event.currentTarget.files?.[0];
    event.currentTarget.value = '';
    if (file) void analyzePdf(file);
  }

  function handleDrop(event: DragEvent<HTMLDivElement>) {
    event.preventDefault();
    setIsDragging(false);
    if (uploadStatus === 'analyzing' || uploadStatus === 'saving') return;
    const file = event.dataTransfer.files[0];
    if (file) void analyzePdf(file);
  }

  function resetUpload() {
    analysisRun.current += 1;
    setFileName(null);
    setUploadStatus('idle');
    setUploadProgress(INITIAL_UPLOAD_PROGRESS);
    setFailedPages([]);
    setUploadError(null);
    setPages([]);
    setAnalysis(null);
    setMessage('');
    setError(null);
    if (fileInputRef.current) fileInputRef.current.value = '';
  }

  function beginNewModel() {
    setEditingModelId(null);
    setModelForm(EMPTY_MODEL_FORM);
    setModelFormOpen(true);
  }

  function beginEditModel(model: CanonModel) {
    setEditingModelId(model.id);
    setModelFormOpen(true);
    setModelForm({
      name: model.name,
      colorType: model.colorType,
      black: String(model.nominalYield.black),
      cyan: model.nominalYield.cyan === undefined ? '' : String(model.nominalYield.cyan),
      magenta: model.nominalYield.magenta === undefined ? '' : String(model.nominalYield.magenta),
      yellow: model.nominalYield.yellow === undefined ? '' : String(model.nominalYield.yellow),
    });
  }

  function closeModelForm() {
    setEditingModelId(null);
    setModelForm(EMPTY_MODEL_FORM);
    setModelFormOpen(false);
  }

  async function saveModel(event: FormEvent<HTMLFormElement>) {
    event.preventDefault();
    const draft: CanonModelDraft = {
      name: modelForm.name,
      colorType: modelForm.colorType,
      nominalYield: modelForm.colorType === 'mono'
        ? { black: Number(modelForm.black) }
        : { black: Number(modelForm.black), cyan: Number(modelForm.cyan), magenta: Number(modelForm.magenta), yellow: Number(modelForm.yellow) },
    };
    setSaving(true);
    setError(null);
    try {
      const response = await fetch(editingModelId ? `/api/coverage/models/${editingModelId}` : '/api/coverage/models', {
        method: editingModelId ? 'PUT' : 'POST',
        headers: { 'content-type': 'application/json' },
        body: JSON.stringify(draft),
      });
      const saved = await readJson<CanonModel>(response);
      setModels((current) => [...current.filter((model) => model.id !== saved.id), saved].sort((left, right) => left.name.localeCompare(right.name, 'es')));
      setSelectedModelId(saved.id);
      closeModelForm();
      setMessage('Modelo Canon guardado en SQLite.');
    } catch (saveError: unknown) {
      setError(toErrorMessage(saveError));
    } finally {
      setSaving(false);
    }
  }

  async function deleteModel(model: CanonModel) {
    try {
      const response = await fetch(`/api/coverage/models/${model.id}`, { method: 'DELETE' });
      if (!response.ok) throw new Error('No se pudo eliminar el modelo Canon.');
      setModels((current) => current.filter((item) => item.id !== model.id));
      setSelectedModelId((current) => current === model.id ? '' : current);
      setMessage(`Modelo ${model.name} eliminado.`);
    } catch (deleteError: unknown) {
      setError(toErrorMessage(deleteError));
    }
  }

  async function clearSavedAnalysis() {
    try {
      const response = await fetch('/api/coverage/last', { method: 'DELETE' });
      if (!response.ok) throw new Error('No se pudo borrar el análisis guardado.');
      setAnalysis(null);
      setPages([]);
      setFileName(null);
      setFailedPages([]);
      setUploadStatus('idle');
      setUploadProgress(INITIAL_UPLOAD_PROGRESS);
      setUploadError(null);
      setMessage('Análisis de cobertura eliminado de SQLite.');
    } catch (clearError: unknown) {
      setError(toErrorMessage(clearError));
    }
  }

  async function printReport() {
    if (coverage.pages.length === 0) return;
    setError(null);
    try {
      const reportMarkup = renderCoveragePrintReportMarkup({
        coverage,
        sourceName: fileName ?? analysis?.sourceName ?? null,
        analyzedAt: analysis?.analyzedAt ?? null,
        inputMode: analysis?.inputMode ?? 'pdf',
        failedPages,
        yieldEstimate,
      });
      const documentHtml = createCoverageReportDocument(reportMarkup);
      const saved = await printOrSaveHtmlReportAsPdf(documentHtml, `informe-cobertura-toner-${fileName || 'reporte'}`);
      setMessage(saved === null
        ? 'Diálogo de impresión abierto.'
        : saved.saved
          ? `PDF guardado: ${saved.filePath ?? 'archivo seleccionado'}.`
          : 'Guardado de PDF cancelado.');
    } catch (printError: unknown) {
      setError(toErrorMessage(printError));
    }
  }

  const uploadBusy = uploadStatus === 'analyzing' || uploadStatus === 'saving';
  const progressPercent = getProgressPercent(uploadProgress);

  return (
    <div className="page-content coverage-page">
      <section className="catalog-header">
        <div><div className="eyebrow">ANÁLISIS / MPS</div><h1>Analizador de cobertura de tóner</h1><p className="lead">Sube un PDF para medir la cobertura real de cada página y estimar el rendimiento de tóners Canon.</p></div>
        <div className="coverage-actions"><button className="secondary-button" type="button" onClick={() => void printReport()} disabled={coverage.pages.length === 0}>Imprimir / PDF</button></div>
      </section>

      <section className="sales-status" aria-live="polite"><span className={`status-dot ${error ? 'error' : loading ? 'pending' : 'ready'}`} /><span>{error || message || (uploadError ? 'Revisa el mensaje del cargador de PDF.' : loading ? 'Cargando catálogo local…' : 'Carga un PDF para analizar la cobertura.')}</span></section>

      <section className="coverage-layout">
        <main className="coverage-main">
          <section className="sales-card coverage-input-card" aria-busy={uploadBusy}>
            <div className="card-heading"><div><h2>Analizar un PDF</h2><p className="coverage-upload-description">El documento se procesa en este equipo, página por página, a 300 DPI.</p></div><span className="muted-note">{coverage.pages.length} páginas</span></div>
            <div
              className={`coverage-upload-dropzone${isDragging ? ' is-dragging' : ''}${uploadBusy ? ' is-busy' : ''}`}
              onDragEnter={(event) => { event.preventDefault(); if (!uploadBusy) setIsDragging(true); }}
              onDragOver={(event) => { event.preventDefault(); if (!uploadBusy) setIsDragging(true); }}
              onDragLeave={(event) => {
                const relatedTarget = event.relatedTarget;
                if (!(relatedTarget instanceof Node) || !event.currentTarget.contains(relatedTarget)) setIsDragging(false);
              }}
              onDrop={handleDrop}
            >
              <input
                ref={fileInputRef}
                className="coverage-upload-file-input"
                id="coverage-pdf-upload"
                type="file"
                accept="application/pdf,.pdf"
                disabled={uploadBusy}
                onChange={handleFileInput}
              />
              <div className="coverage-upload-copy">
                <strong>{uploadStatus === 'analyzing' ? 'Analizando el PDF…' : uploadStatus === 'saving' ? 'Guardando el análisis…' : uploadStatus === 'complete' ? 'Análisis completado' : 'Suelta aquí tu archivo PDF'}</strong>
                <span>Se calculará la cobertura de negro, cian, magenta y amarillo para cada página.</span>
                <button className="primary-button" type="button" onClick={() => fileInputRef.current?.click()} disabled={uploadBusy}>Seleccionar PDF</button>
              </div>
            </div>

            {fileName && <div className="coverage-upload-file"><span>Archivo</span><strong title={fileName}>{fileName}</strong></div>}

            {uploadBusy && <div className="coverage-upload-progress" aria-live="polite">
              <div className="coverage-upload-progress-heading"><span>{uploadStatus === 'saving' ? 'Guardando en SQLite' : uploadProgress.currentPage ? `Procesando página ${uploadProgress.currentPage}` : 'Abriendo documento'}</span><strong>{progressPercent}%</strong></div>
              <div className="coverage-upload-progress-track" role="progressbar" aria-label="Progreso del análisis PDF" aria-valuemin={0} aria-valuemax={100} aria-valuenow={progressPercent}><span style={{ width: `${progressPercent}%` }} /></div>
              <small>{uploadProgress.completedPages} de {uploadProgress.totalPages || '…'} páginas procesadas{uploadProgress.failedPages > 0 ? ` · ${uploadProgress.failedPages} con error` : ''}</small>
            </div>}

            {uploadError && <div className="coverage-upload-error" role="alert">{uploadError}</div>}
            {(uploadStatus === 'complete' || uploadStatus === 'error') && fileName && <button className="text-button coverage-upload-reset" type="button" onClick={resetUpload}>Analizar otro PDF</button>}
          </section>

          <CoverageResults coverage={coverage} failedPages={failedPages} hasSavedAnalysis={analysis !== null} onClear={() => void clearSavedAnalysis()} />
        </main>

        <aside className="coverage-sidebar">
          <section className="sales-card coverage-model-selection-card" aria-labelledby="coverage-selection-title">
            <div className="card-heading">
              <div>
                <div className="eyebrow">SELECCIÓN DE CÁLCULO</div>
                <h2 id="coverage-selection-title">Modelo Canon</h2>
                <p className="coverage-upload-description">El modelo define el rendimiento nominal usado en la estimación.</p>
              </div>
            </div>
            <label className="search-field">
              <span>Modelo para el cálculo</span>
              <select value={selectedModelId} onChange={(event) => setSelectedModelId(event.target.value)} disabled={models.length === 0 || loading}>
                <option value="">Seleccionar modelo…</option>
                {models.map((model) => <option key={model.id} value={model.id}>{model.name} · {model.colorType === 'color' ? 'Color' : 'Mono'}</option>)}
              </select>
            </label>
            {!loading && models.length === 0 && <p className="coverage-catalog-hint">Agrega un modelo en el catálogo para habilitar el cálculo.</p>}
          </section>

          <section className="sales-card coverage-model-catalog-card" aria-labelledby="coverage-catalog-title">
            <div className="card-heading">
              <div>
                <div className="eyebrow">CATÁLOGO LOCAL</div>
                <h2 id="coverage-catalog-title">Administrar modelos</h2>
                <p className="coverage-upload-description">Guarda o actualiza los rendimientos nominales de tus equipos.</p>
              </div>
              {!modelFormOpen && <button className="text-button" type="button" onClick={beginNewModel} disabled={loading}>Agregar modelo</button>}
            </div>

            {modelFormOpen && (
              <form id="coverage-model-editor" className="coverage-model-form" onSubmit={(event) => void saveModel(event)}>
                <div className="coverage-model-editor-heading">
                  <h3>{editingModelId ? 'Editar modelo' : 'Nuevo modelo'}</h3>
                  <button className="text-button" type="button" onClick={closeModelForm} disabled={saving}>Cancelar</button>
                </div>
                <label className="search-field">
                  <span>Nombre</span>
                  <input value={modelForm.name} onChange={(event) => setModelForm((current) => ({ ...current, name: event.target.value }))} placeholder="imageRUNNER ADVANCE…" />
                </label>
                <label className="search-field">
                  <span>Tipo</span>
                  <select value={modelForm.colorType} onChange={(event) => setModelForm((current) => ({ ...current, colorType: event.target.value as CanonColorType }))}>
                    <option value="color">Color</option>
                    <option value="mono">Monocromo</option>
                  </select>
                </label>
                <div className="coverage-yield-fields">
                  <YieldField label="Negro" value={modelForm.black} onChange={(value) => setModelForm((current) => ({ ...current, black: value }))} />
                  {modelForm.colorType === 'color' && <>
                    <YieldField label="Cian" value={modelForm.cyan} onChange={(value) => setModelForm((current) => ({ ...current, cyan: value }))} />
                    <YieldField label="Magenta" value={modelForm.magenta} onChange={(value) => setModelForm((current) => ({ ...current, magenta: value }))} />
                    <YieldField label="Amarillo" value={modelForm.yellow} onChange={(value) => setModelForm((current) => ({ ...current, yellow: value }))} />
                  </>}
                </div>
                <button className="primary-button full-button" type="submit" disabled={saving}>{editingModelId ? 'Actualizar modelo' : 'Guardar modelo'}</button>
              </form>
            )}

            {models.length > 0 ? (
              <div className="coverage-model-list" aria-label="Modelos guardados">
                {models.map((model) => (
                  <div className="coverage-model-row" key={model.id}>
                    <span>
                      <strong>{model.name}</strong>
                      <small>{model.colorType === 'color' ? 'Color' : 'Mono'} · K {pageFormat.format(model.nominalYield.black)} páginas</small>
                    </span>
                    <span>
                      <button className="text-button" type="button" onClick={() => beginEditModel(model)}>Editar</button>
                      <button className="text-button danger-text" type="button" onClick={() => void deleteModel(model)}>Borrar</button>
                    </span>
                  </div>
                ))}
              </div>
            ) : !loading ? (
              <p className="coverage-catalog-empty">Todavía no hay modelos guardados.</p>
            ) : (
              <p className="coverage-catalog-empty">Cargando catálogo local…</p>
            )}
          </section>

          <section className="sales-card coverage-yield-card"><div className="card-heading"><div><div className="eyebrow">ESTIMACIÓN ISO / IEC 19798</div><h2>Rendimiento real</h2><p className="coverage-upload-description">Páginas estimadas desde la cobertura media por canal.</p></div><span className="muted-note">5% referencia</span></div>{yieldEstimate ? <YieldResults estimate={yieldEstimate} /> : <p className="coverage-note">Selecciona un modelo y calcula una cobertura para estimar páginas por color y el cuello de botella del conjunto.</p>}</section>
        </aside>
      </section>

    </div>
  );
}

function createCoverageReportDocument(reportMarkup: string): string {
  return `<!doctype html>
<html lang="es">
  <head>
    <meta charset="utf-8">
    <meta name="viewport" content="width=device-width, initial-scale=1">
    <meta http-equiv="Content-Security-Policy" content="default-src 'none'; style-src 'unsafe-inline'; img-src 'none'; font-src 'none'; base-uri 'none'; form-action 'none'">
    <title>Informe de cobertura de tóner</title>
    <style>${coveragePrintStyles}</style>
  </head>
  <body>${reportMarkup}</body>
</html>`;
}

function CoverageResults({ coverage, failedPages, hasSavedAnalysis, onClear }: {
  coverage: ReturnType<typeof summarizeDocumentCoverage>;
  failedPages: PdfPageFailure[];
  hasSavedAnalysis: boolean;
  onClear: () => void;
}) {
  return (
    <section className="sales-card coverage-results-card">
      <div className="card-heading">
        <div><h2>Reporte de cobertura</h2><p className="coverage-upload-description">Promedio de tinta estimada por canal en cada página analizada.</p></div>
        <div className="coverage-results-actions"><span className="coverage-page-count">{coverage.pages.length} páginas</span>{hasSavedAnalysis && <button className="text-button" type="button" onClick={onClear}>Borrar análisis</button>}</div>
      </div>
      {failedPages.length > 0 && <div className="coverage-upload-failures" role="status"><strong>{failedPages.length === 1 ? 'Una página fue excluida.' : `${failedPages.length} páginas fueron excluidas.`}</strong><span>{failedPages.map(({ page }) => `pág. ${page}`).join(', ')}</span></div>}
      {coverage.pages.length === 0 ? <div className="coverage-empty">Sube un PDF para ver la cobertura por página.</div> : (
        <div className="coverage-table-wrap">
          <table className="coverage-table coverage-report-table">
            <thead><tr><th scope="col">Página</th><th scope="col">Negro</th><th scope="col">Cian</th><th scope="col">Magenta</th><th scope="col">Amarillo</th><th scope="col">Total</th></tr></thead>
            <tbody>{coverage.pages.map((page) => <tr key={page.page}><th scope="row">{page.page}</th><td>{numberFormat.format(page.black)}%</td><td>{numberFormat.format(page.cyan)}%</td><td>{numberFormat.format(page.magenta)}%</td><td>{numberFormat.format(page.yellow)}%</td><td className="coverage-total">{numberFormat.format(page.total)}%</td></tr>)}</tbody>
            <tfoot><tr><th scope="row">Promedio</th><td>{numberFormat.format(coverage.average.black)}%</td><td>{numberFormat.format(coverage.average.cyan)}%</td><td>{numberFormat.format(coverage.average.magenta)}%</td><td>{numberFormat.format(coverage.average.yellow)}%</td><td className="coverage-total">{numberFormat.format(coverage.average.black + coverage.average.cyan + coverage.average.magenta + coverage.average.yellow)}%</td></tr></tfoot>
          </table>
        </div>
      )}
    </section>
  );
}

function YieldField({ label, value, onChange }: { label: string; value: string; onChange: (value: string) => void }) {
  return <label className="search-field"><span>{label} páginas @ 5%</span><input min={1} type="number" value={value} onChange={(event) => onChange(event.target.value)} placeholder="10000" /></label>;
}

function YieldResults({ estimate }: { estimate: YieldEstimate }) {
  return (
    <div className="coverage-yield-results">
      <div className="coverage-bottleneck">
        <span>Cuello de botella del conjunto</span>
        <strong>{estimate.bottleneckPages === null ? '∞' : pageFormat.format(Math.round(estimate.bottleneckPages))}</strong>
        <small>{estimate.bottleneckPages === null ? 'No se consume ningún canal en este documento.' : `páginas estimadas para ${estimate.modelName}`}</small>
      </div>
      <div className="coverage-yield-table-wrap">
        <table className="coverage-yield-table">
          <thead><tr><th scope="col">Canal</th><th scope="col">Cobertura</th><th scope="col">Nominal</th><th scope="col">Estimado</th></tr></thead>
          <tbody>{estimate.colors.map((color) => (
            <tr key={color.color}>
              <th scope="row"><span className={`coverage-color-dot ${color.color}`} aria-hidden="true" />{colorLabel(color.color)}</th>
              <td>{numberFormat.format(color.measuredCoverage)}%</td>
              <td>{pageFormat.format(color.nominalYield)}</td>
              <td className="coverage-yield-estimate">{color.estimatedPages === null ? '∞ / no consumido' : pageFormat.format(Math.round(color.estimatedPages))}</td>
            </tr>
          ))}</tbody>
        </table>
      </div>
      <p className="coverage-yield-footnote">El cuello de botella es el primer canal consumido que alcanza su rendimiento estimado. Los canales sin consumo no limitan el conjunto.</p>
    </div>
  );
}

function colorLabel(color: 'black' | 'cyan' | 'magenta' | 'yellow'): string {
  return { black: 'Negro', cyan: 'Cian', magenta: 'Magenta', yellow: 'Amarillo' }[color];
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
