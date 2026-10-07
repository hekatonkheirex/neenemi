import { useEffect, useMemo, useRef, useState, type ChangeEvent, type DragEvent, type FormEvent } from 'react';
import { printOrSaveHtmlReportAsPdf } from '../../core/print';
import { calculateYield, summarizeDocumentCoverage } from './calculations';
import coveragePrintStyles from './coverage-print.css?inline';
import { renderCoveragePrintReportMarkup } from './coverage-print-report';
import type { PdfPageFailure, PdfProgressEvent } from './pdf-analysis';
import type { CanonColorType, CanonModel, CanonModelDraft, CoverageAnalysis, PageCoverage, YieldEstimate } from './types';
import { readJson, toErrorMessage } from '../../core/http';
import { PrintButton, UploadTriggerButton } from '../../core/ActionButtons';
import { useBusy } from '../../core/useBusy';
import { FileText, Pencil, Plus, RotateCcw, Save, Trash2, X } from 'lucide-react';
import { Button } from '../../core/ui/button';
import { Badge } from '../../core/ui/badge';
import { Card, CardHeader, Muted } from '../../core/ui/card';
import { formatLoadedAt } from '../../core/loaded-at';
import { Input } from '../../core/ui/input';
import { PageHeader } from '../../core/ui/page-header';
import { StatusLine } from '../../core/ui/status-line';
import { Table, TableBody, TableCell, TableHead, TableHeader, TableRow } from '../../core/ui/table';

const selectClassName = 'h-10 w-full min-w-0 rounded-xl border border-navy/20 bg-white px-3 text-sm text-navy dark:border-sky/30 dark:bg-navy/50 dark:text-white';

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

  const [printing, runPrint] = useBusy();

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
      const saved = await runPrint(() => printOrSaveHtmlReportAsPdf(documentHtml, `informe-cobertura-toner-${fileName || 'reporte'}`));
      if (saved === undefined) return; // ya hay un PDF en curso
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
      <PageHeader eyebrow="HERRAMIENTAS / COBERTURA" title="Cobertura de tóner"
        lead="Sube un PDF para medir la cobertura real de cada página y estimar el rendimiento de tóners Canon."
        actions={<PrintButton busy={printing} onClick={() => void printReport()} disabled={coverage.pages.length === 0} />}
      />
      <StatusLine state={error || uploadError ? 'error' : loading || uploadBusy ? 'pending' : 'ready'}>
        <div className="[overflow-wrap:anywhere]">{error || message || (uploadError ? 'Revisa el mensaje del cargador de PDF.' : loading ? 'Cargando catálogo local…' : 'Carga un PDF para analizar la cobertura.')}</div>
      </StatusLine>

      <div className="grid min-w-0 items-start gap-6 min-[90rem]:grid-cols-[minmax(0,1fr)_26rem]">
        <div className="grid min-w-0 gap-6">
          <Card className="min-w-0 grid-cols-1" aria-busy={uploadBusy}>
            <CardHeader eyebrow="DOCUMENTO / PDF" title="Analizar un PDF" aside={<Badge>{coverage.pages.length} páginas</Badge>} />
            <Muted>El documento se procesa en este equipo, página por página, a 300 DPI.</Muted>
            <div
              className={`grid min-w-0 gap-4 rounded-xl border border-dashed p-6 transition-colors ${isDragging ? 'border-sky bg-sky/15' : 'border-sky/40 bg-sky/5'} ${uploadBusy ? 'cursor-progress' : ''}`}
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
                className="sr-only"
                id="coverage-pdf-upload"
                aria-label="Archivo PDF para analizar"
                tabIndex={-1}
                type="file"
                accept="application/pdf,.pdf"
                disabled={uploadBusy}
                onChange={handleFileInput}
              />
              <div className="mx-auto grid min-w-0 max-w-lg justify-items-center gap-3 text-center">
                <FileText className="size-8 text-sky" aria-hidden="true" />
                <strong className="text-sm text-navy dark:text-white">{uploadStatus === 'analyzing' ? 'Analizando el PDF…' : uploadStatus === 'saving' ? 'Guardando el análisis…' : uploadStatus === 'complete' ? 'Análisis completado' : 'Suelta aquí tu archivo PDF'}</strong>
                <Muted>Se calculará la cobertura de negro, cian, magenta y amarillo para cada página.</Muted>
                <UploadTriggerButton className="h-auto min-h-10 max-w-full whitespace-normal py-2" onClick={() => fileInputRef.current?.click()} disabled={uploadBusy}>Seleccionar PDF</UploadTriggerButton>
              </div>
            </div>
            {fileName && <div className="grid min-w-0 grid-cols-1 gap-1 rounded-xl border border-navy/10 bg-paper p-4 dark:border-sky/20 dark:bg-navy/30">
              <Muted>Archivo</Muted><strong className="break-words text-sm text-navy dark:text-white" title={fileName}>{fileName}</strong>
              {analysis && formatLoadedAt(analysis.analyzedAt) ? <Muted>{formatLoadedAt(analysis.analyzedAt)}</Muted> : null}
            </div>}
            {uploadBusy && <div className="grid min-w-0 gap-2" aria-live="polite">
              <div className="flex flex-wrap items-center justify-between gap-2 text-xs text-navy dark:text-white"><div>{uploadStatus === 'saving' ? 'Guardando en SQLite' : uploadProgress.currentPage ? `Procesando página ${uploadProgress.currentPage}` : 'Abriendo documento'}</div><Badge>{progressPercent}%</Badge></div>
              <div className="h-2 overflow-hidden rounded-full bg-sky/15" role="progressbar" aria-label="Progreso del análisis PDF" aria-valuemin={0} aria-valuemax={100} aria-valuenow={progressPercent}><div className="h-full rounded-full bg-sky" style={{ width: `${progressPercent}%` }} /></div>
              <Muted>{uploadProgress.completedPages} de {uploadProgress.totalPages || '…'} páginas procesadas{uploadProgress.failedPages > 0 ? ` · ${uploadProgress.failedPages} con error` : ''}</Muted>
            </div>}
            {uploadError && <div className="break-words rounded-xl border border-red-500/30 bg-red-500/10 p-4 text-sm text-[#b42318] dark:text-[#ffd2cc]" role="alert">{uploadError}</div>}
            {(uploadStatus === 'complete' || uploadStatus === 'error') && fileName && <Button variant="outline" className="w-fit" onClick={resetUpload}><RotateCcw />Analizar otro PDF</Button>}
          </Card>

          <CoverageResults coverage={coverage} failedPages={failedPages} hasSavedAnalysis={analysis !== null} onClear={() => void clearSavedAnalysis()} />
        </div>

        <aside className="grid min-w-0 grid-cols-1 gap-6">
          <Card className="min-w-0 grid-cols-1" aria-labelledby="coverage-selection-title">
            <CardHeader eyebrow="SELECCIÓN DE CÁLCULO" title={<span id="coverage-selection-title">Modelo Canon</span>} />
            <Muted>El modelo define el rendimiento nominal usado en la estimación.</Muted>
            <label className="grid min-w-0 gap-2 text-sm font-semibold text-navy dark:text-white">
              <div>Modelo para el cálculo</div>
              <select className={selectClassName} value={selectedModelId} onChange={(event) => setSelectedModelId(event.target.value)} disabled={models.length === 0 || loading}>
                <option value="">Seleccionar modelo…</option>
                {models.map((model) => <option key={model.id} value={model.id}>{model.name} · {model.colorType === 'color' ? 'Color' : 'Mono'}</option>)}
              </select>
            </label>
            {!loading && models.length === 0 && <Muted>Agrega un modelo en el catálogo para habilitar el cálculo.</Muted>}
          </Card>

          <Card className="min-w-0 grid-cols-1" aria-labelledby="coverage-catalog-title">
            <CardHeader eyebrow="CATÁLOGO LOCAL" title={<span id="coverage-catalog-title">Administrar modelos</span>} aside={
              !modelFormOpen && <Button variant="outline" size="sm" onClick={beginNewModel} disabled={loading}><Plus />Agregar modelo</Button>
            } />
            <Muted>Guarda o actualiza los rendimientos nominales de tus equipos.</Muted>
            {modelFormOpen && (
              <form id="coverage-model-editor" className="grid min-w-0 gap-4 border-t border-navy/10 pt-4 dark:border-sky/20" onSubmit={(event) => void saveModel(event)}>
                <div className="flex flex-wrap items-center justify-between gap-3">
                  <h3 className="m-0 text-sm font-bold text-navy dark:text-white">{editingModelId ? 'Editar modelo' : 'Nuevo modelo'}</h3>
                  <Button variant="ghost" size="sm" onClick={closeModelForm} disabled={saving}><X />Cancelar</Button>
                </div>
                <label className="grid min-w-0 gap-2 text-sm font-semibold text-navy dark:text-white">
                  <div>Nombre</div>
                  <Input value={modelForm.name} onChange={(event) => setModelForm((current) => ({ ...current, name: event.target.value }))} placeholder="imageRUNNER ADVANCE…" />
                </label>
                <label className="grid min-w-0 gap-2 text-sm font-semibold text-navy dark:text-white">
                  <div>Tipo</div>
                  <select className={selectClassName} value={modelForm.colorType} onChange={(event) => setModelForm((current) => ({ ...current, colorType: event.target.value as CanonColorType }))}>
                    <option value="color">Color</option>
                    <option value="mono">Monocromo</option>
                  </select>
                </label>
                <div className="grid min-w-0 grid-cols-[repeat(auto-fit,minmax(min(100%,10rem),1fr))] gap-3">
                  <YieldField label="Negro" value={modelForm.black} onChange={(value) => setModelForm((current) => ({ ...current, black: value }))} />
                  {modelForm.colorType === 'color' && <>
                    <YieldField label="Cian" value={modelForm.cyan} onChange={(value) => setModelForm((current) => ({ ...current, cyan: value }))} />
                    <YieldField label="Magenta" value={modelForm.magenta} onChange={(value) => setModelForm((current) => ({ ...current, magenta: value }))} />
                    <YieldField label="Amarillo" value={modelForm.yellow} onChange={(value) => setModelForm((current) => ({ ...current, yellow: value }))} />
                  </>}
                </div>
                <Button className="w-full" type="submit" disabled={saving} aria-busy={saving}><Save />{saving ? 'Guardando…' : editingModelId ? 'Actualizar modelo' : 'Guardar modelo'}</Button>
              </form>
            )}
            {models.length > 0 ? (
              <div className="grid min-w-0 grid-cols-1 max-h-[28rem] gap-3 overflow-y-auto p-1" aria-label="Modelos guardados">
                {models.map((model) => (
                  <div className="grid min-w-0 grid-cols-1 gap-3 rounded-xl border border-navy/10 bg-paper p-3 dark:border-sky/20 dark:bg-navy/30" key={model.id}>
                    <div className="grid min-w-0 grid-cols-1 gap-1">
                      <strong className="break-words text-sm text-navy dark:text-white">{model.name}</strong>
                      <Muted>{model.colorType === 'color' ? 'Color' : 'Mono'} · K {pageFormat.format(model.nominalYield.black)} páginas</Muted>
                    </div>
                    <div className="flex flex-wrap gap-2">
                      <Button variant="outline" size="sm" aria-label={`Editar ${model.name}`} onClick={() => beginEditModel(model)}><Pencil />Editar</Button>
                      <Button variant="ghost" size="sm" className="text-[#b42318]! dark:text-[#ff9ba4]!" aria-label={`Borrar ${model.name}`} onClick={() => void deleteModel(model)}><Trash2 />Borrar</Button>
                    </div>
                  </div>
                ))}
              </div>
            ) : <Muted>{loading ? 'Cargando catálogo local…' : 'Todavía no hay modelos guardados.'}</Muted>}
          </Card>

          <Card className="min-w-0 grid-cols-1">
            <CardHeader eyebrow="ESTIMACIÓN ISO / IEC 19798" title="Rendimiento real" aside={<Badge>5% referencia</Badge>} />
            <Muted>Páginas estimadas desde la cobertura media por canal.</Muted>
            {yieldEstimate ? <YieldResults estimate={yieldEstimate} /> : <Muted>Selecciona un modelo y calcula una cobertura para estimar páginas por color y el cuello de botella del conjunto.</Muted>}
          </Card>
        </aside>
      </div>
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
    <Card className="min-w-0 grid-cols-1">
      <CardHeader eyebrow="RESULTADOS / COBERTURA" title="Reporte de cobertura" aside={
        <div className="flex flex-wrap items-center gap-2"><Badge>{coverage.pages.length} páginas</Badge>{hasSavedAnalysis && <Button variant="ghost" size="sm" onClick={onClear}><Trash2 />Borrar análisis</Button>}</div>
      } />
      <Muted>Promedio de tinta estimada por canal en cada página analizada.</Muted>
      {failedPages.length > 0 && <div className="grid min-w-0 gap-1 break-words rounded-xl border border-amber-500/30 bg-amber-500/10 p-4 text-sm text-[#7a4a00] dark:text-[#ffe4a8]" role="status"><strong>{failedPages.length === 1 ? 'Una página fue excluida.' : `${failedPages.length} páginas fueron excluidas.`}</strong><div>{failedPages.map(({ page }) => `pág. ${page}`).join(', ')}</div></div>}
      {coverage.pages.length === 0 ? <div className="rounded-xl border border-dashed border-navy/20 p-6 text-center dark:border-sky/30"><Muted>Sube un PDF para ver la cobertura por página.</Muted></div> : (
        <Table className="min-w-[36rem] tabular-nums" wrapperClassName="min-w-0" aria-label="Cobertura por página">
          <TableHeader><TableRow><TableHead scope="col">Página</TableHead>{['Negro', 'Cian', 'Magenta', 'Amarillo', 'Total'].map(label => <TableHead className="text-right" scope="col" key={label}>{label}</TableHead>)}</TableRow></TableHeader>
          <TableBody>{coverage.pages.map((page) => <TableRow key={page.page}><TableHead scope="row">{page.page}</TableHead>{[page.black, page.cyan, page.magenta, page.yellow, page.total].map((value, index) => <TableCell className={`text-right whitespace-nowrap ${index === 4 ? 'font-bold' : ''}`} key={index}>{numberFormat.format(value)}%</TableCell>)}</TableRow>)}</TableBody>
          <tfoot className="border-t border-sky/30 bg-sky/10"><TableRow><TableHead scope="row">Promedio</TableHead>{[coverage.average.black, coverage.average.cyan, coverage.average.magenta, coverage.average.yellow, coverage.average.black + coverage.average.cyan + coverage.average.magenta + coverage.average.yellow].map((value, index) => <TableCell className="text-right font-bold whitespace-nowrap" key={index}>{numberFormat.format(value)}%</TableCell>)}</TableRow></tfoot>
        </Table>
      )}
    </Card>
  );
}

function YieldField({ label, value, onChange }: { label: string; value: string; onChange: (value: string) => void }) {
  return <label className="grid min-w-0 gap-2 text-sm font-semibold text-navy dark:text-white"><div>{label} páginas @ 5%</div><Input min={1} type="number" value={value} onChange={(event) => onChange(event.target.value)} placeholder="10000" /></label>;
}

function YieldResults({ estimate }: { estimate: YieldEstimate }) {
  return (
    <div className="grid min-w-0 grid-cols-1 gap-4">
      <div className="grid min-w-0 grid-cols-1 gap-2 rounded-xl border border-sky/30 bg-sky/10 p-4">
        <Muted>Cuello de botella del conjunto</Muted>
        <strong className="break-all text-3xl font-bold tabular-nums text-navy dark:text-white">{estimate.bottleneckPages === null ? '∞' : pageFormat.format(Math.round(estimate.bottleneckPages))}</strong>
        <Muted className="break-words">{estimate.bottleneckPages === null ? 'No se consume ningún canal en este documento.' : `páginas estimadas para ${estimate.modelName}`}</Muted>
      </div>
      <Table className="min-w-[22rem] tabular-nums" wrapperClassName="min-w-0" aria-label="Rendimiento por canal">
        <TableHeader><TableRow><TableHead scope="col">Canal</TableHead>{['Cobertura', 'Nominal', 'Estimado'].map(label => <TableHead scope="col" className="text-right" key={label}>{label}</TableHead>)}</TableRow></TableHeader>
        <TableBody>{estimate.colors.map((color) => <TableRow key={color.color}>
          <TableHead scope="row">{colorLabel(color.color)}</TableHead>
          <TableCell className="text-right whitespace-nowrap">{numberFormat.format(color.measuredCoverage)}%</TableCell>
          <TableCell className="text-right whitespace-nowrap">{pageFormat.format(color.nominalYield)}</TableCell>
          <TableCell className="text-right font-bold whitespace-nowrap">{color.estimatedPages === null ? '∞ / no consumido' : pageFormat.format(Math.round(color.estimatedPages))}</TableCell>
        </TableRow>)}</TableBody>
      </Table>
      <Muted>El cuello de botella es el primer canal consumido que alcanza su rendimiento estimado. Los canales sin consumo no limitan el conjunto.</Muted>
    </div>
  );
}

function colorLabel(color: 'black' | 'cyan' | 'magenta' | 'yellow'): string {
  return { black: 'Negro', cyan: 'Cian', magenta: 'Magenta', yellow: 'Amarillo' }[color];
}

