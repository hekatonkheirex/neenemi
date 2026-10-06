import { useEffect, useMemo, useState, type ChangeEvent } from 'react';
import { printOrSaveCurrentPageAsPdf } from '../../core/print';
import { calculateMpsProjection } from './calculations';
import { buildMpsAnalysis } from './analysis';
import MpsAnalysisPanels from './MpsAnalysisPanels';
import MpsModelEditor from './MpsModelEditor';
import MpsPrintReport from './MpsPrintReport';
import { exportMpsConsumablesWorkbook, exportMpsWorkbook } from './export';
import type { MpsAnalysis } from './analysis';
import type { MpsImportSummary, MpsModel, MpsProjection, SaveMpsModelInput } from './repository';
import { confirmAction } from '../../core/confirm';
import { readJson, toErrorMessage } from '../../core/http';
import { UploadButton, DownloadIcon } from '../../core/ActionButtons';
import { Calculator, Copy, Pencil, Plus, RefreshCw, Trash2 } from 'lucide-react';
import { Badge } from '../../core/ui/badge';
import { Button } from '../../core/ui/button';
import { Card, CardHeader, Muted } from '../../core/ui/card';
import { Input } from '../../core/ui/input';
import { PageHeader } from '../../core/ui/page-header';
import { StatusLine } from '../../core/ui/status-line';
import { Table, TableBody, TableCell, TableHead, TableHeader, TableRow } from '../../core/ui/table';

const numberFormat = new Intl.NumberFormat('es-PY', { maximumFractionDigits: 1 });
const integerFormat = new Intl.NumberFormat('es-PY', { maximumFractionDigits: 0 });

type LegacyImportResponse = MpsImportSummary & {
  duplicate: boolean;
};

type EditorMode = 'create' | 'edit' | 'clone';
type PrintableMpsAnalysis = {
  model: MpsModel;
  analysis: MpsAnalysis;
  projections: readonly MpsProjection[];
};

export default function MpsModule() {
  const [models, setModels] = useState<MpsModel[]>([]);
  const [summary, setSummary] = useState<MpsImportSummary | null>(null);
  const [selectedModelId, setSelectedModelId] = useState<string | null>(null);
  const [modelQuery, setModelQuery] = useState('');
  const [monthlyVolumeInput, setMonthlyVolumeInput] = useState('5000');
  const [appliedVolume, setAppliedVolume] = useState<number | null>(null);
  const [loading, setLoading] = useState(true);
  const [importing, setImporting] = useState(false);
  const [savingModel, setSavingModel] = useState(false);
  const [exportingAnalysis, setExportingAnalysis] = useState(false);
  const [exportingConsumables, setExportingConsumables] = useState(false);
  const [printableAnalysis, setPrintableAnalysis] = useState<PrintableMpsAnalysis | null>(null);
  const [editorMode, setEditorMode] = useState<EditorMode | null>(null);
  const [editorModel, setEditorModel] = useState<MpsModel | null>(null);
  const [message, setMessage] = useState('');
  const [error, setError] = useState<string | null>(null);

  useEffect(() => {
    void refresh();
  }, []);

  useEffect(() => {
    if (!printableAnalysis) {
      if (document.body.dataset.printMode === 'mps-analysis') {
        delete document.body.dataset.printMode;
      }
      return;
    }

    document.body.dataset.printMode = 'mps-analysis';
    let cancelled = false;
    const printReport = async () => {
      await new Promise<void>((resolve) => window.requestAnimationFrame(() => resolve()));
      try {
        const result = await printOrSaveCurrentPageAsPdf(
          `proyeccion-mps-${printableAnalysis.model.modelLabel}`,
          { landscape: true },
        );
        if (!cancelled) {
          setMessage(result === null
            ? 'Diálogo de impresión abierto.'
            : result.saved
              ? `PDF guardado: ${result.filePath ?? 'archivo seleccionado'}.`
              : 'Guardado de PDF cancelado.');
        }
      } catch (printError: unknown) {
        if (!cancelled) setError(toErrorMessage(printError));
      } finally {
        if (!cancelled) setPrintableAnalysis(null);
      }
    };

    void printReport();
    return () => {
      cancelled = true;
      if (document.body.dataset.printMode === 'mps-analysis') {
        delete document.body.dataset.printMode;
      }
    };
  }, [printableAnalysis]);

  const selectedModel = useMemo(
    () => models.find((model) => model.id === selectedModelId) ?? models[0] ?? null,
    [models, selectedModelId],
  );
  const visibleModels = useMemo(() => {
    const normalizedQuery = modelQuery.trim().toLocaleLowerCase();
    if (!normalizedQuery) return models;
    return models.filter((model) => [model.brand, model.modelLabel].join(' ').toLocaleLowerCase().includes(normalizedQuery));
  }, [modelQuery, models]);
  const projections = useMemo<MpsProjection[]>(
    () => selectedModel && appliedVolume ? calculateMpsProjection(selectedModel, appliedVolume, 5) : [],
    [appliedVolume, selectedModel],
  );
  const analysis = useMemo(
    () => selectedModel && appliedVolume ? buildMpsAnalysis(selectedModel, appliedVolume) : null,
    [appliedVolume, selectedModel],
  );

  async function refresh() {
    setLoading(true);
    setError(null);
    try {
      const [summaryResponse, modelsResponse] = await Promise.all([
        fetch('/api/mps/summary'),
        fetch('/api/mps/models'),
      ]);
      const loadedSummary = await readJson<MpsImportSummary>(summaryResponse);
      const loadedModels = await readJson<MpsModel[]>(modelsResponse);
      setSummary(loadedSummary);
      setModels(loadedModels);
      setSelectedModelId((current) => loadedModels.some((model) => model.id === current) ? current : loadedModels[0]?.id ?? null);
    } catch (requestError: unknown) {
      setError(toErrorMessage(requestError));
    } finally {
      setLoading(false);
    }
  }

  async function importLegacyFile(event: ChangeEvent<HTMLInputElement>) {
    const file = event.target.files?.[0];
    event.target.value = '';
    if (!file) return;
    if (file.size > 35 * 1024 * 1024) {
      setError('La base supera el límite de 35 MB.');
      return;
    }

    setImporting(true);
    setError(null);
    try {
      const bytes = new Uint8Array(await file.arrayBuffer());
      const response = await fetch('/api/mps/import-legacy', {
        method: 'POST',
        headers: { 'content-type': 'application/json' },
        body: JSON.stringify({ sourceName: file.name, contentBase64: bytesToBase64(bytes) }),
      });
      const result = await readJson<LegacyImportResponse>(response);
      setMessage(result.duplicate
        ? `Esa base ya estaba importada: ${result.models.toLocaleString('es-PY')} modelos.`
        : `Importación completa: ${result.models.toLocaleString('es-PY')} modelos y ${result.consumables.toLocaleString('es-PY')} insumos.`);
      await refresh();
    } catch (importError: unknown) {
      setError(toErrorMessage(importError));
    } finally {
      setImporting(false);
    }
  }

  function openEditor(mode: EditorMode, model: MpsModel | null = null) {
    setError(null);
    setMessage('');
    setEditorModel(model);
    setEditorMode(mode);
  }

  function closeEditor() {
    if (savingModel) return;
    setEditorMode(null);
    setEditorModel(null);
  }

  async function saveModel(input: SaveMpsModelInput) {
    setSavingModel(true);
    setError(null);
    try {
      const response = await fetch(input.id ? `/api/mps/models/${encodeURIComponent(input.id)}` : '/api/mps/models', {
        method: input.id ? 'PUT' : 'POST',
        headers: { 'content-type': 'application/json' },
        body: JSON.stringify(input),
      });
      const saved = await readJson<MpsModel>(response);
      setEditorMode(null);
      setEditorModel(null);
      setMessage(input.id ? `Perfil actualizado: ${saved.modelLabel}.` : `Perfil creado: ${saved.modelLabel}.`);
      await refresh();
      setSelectedModelId(saved.id);
    } catch (saveError: unknown) {
      setError(toErrorMessage(saveError));
    } finally {
      setSavingModel(false);
    }
  }

  async function deleteModel(model: MpsModel) {
    if (!model.isEditable) return;
    if (!await confirmAction({
      title: 'Eliminar perfil manual',
      message: `Se eliminará el perfil manual “${model.modelLabel}”.`,
      confirmLabel: 'Eliminar perfil',
    })) return;
    setError(null);
    setMessage('');
    try {
      const response = await fetch(`/api/mps/models/${encodeURIComponent(model.id)}`, { method: 'DELETE' });
      await readJson<{ deleted: boolean }>(response);
      setMessage(`Perfil eliminado: ${model.modelLabel}.`);
      await refresh();
    } catch (deleteError: unknown) {
      setError(toErrorMessage(deleteError));
    }
  }

  async function exportAnalysis() {
    if (!selectedModel || !analysis) return;
    setExportingAnalysis(true);
    setError(null);
    try {
      await exportMpsWorkbook(selectedModel, analysis, projections);
      setMessage(`Exportación lista: ${selectedModel.modelLabel}.`);
    } catch (exportError: unknown) {
      setError(toErrorMessage(exportError));
    } finally {
      setExportingAnalysis(false);
    }
  }

  function printAnalysis() {
    if (!selectedModel || !analysis) return;
    setError(null);
    setPrintableAnalysis({ model: selectedModel, analysis, projections });
  }

  async function exportConsumables() {
    if (!selectedModel || selectedModel.consumables.length === 0) return;
    setExportingConsumables(true);
    setError(null);
    try {
      await exportMpsConsumablesWorkbook(selectedModel);
      setMessage(`Lista de consumibles lista: ${selectedModel.modelLabel}.`);
    } catch (exportError: unknown) {
      setError(toErrorMessage(exportError));
    } finally {
      setExportingConsumables(false);
    }
  }

  function applyVolume() {
    const value = Number(monthlyVolumeInput.replace(/[^0-9]/g, ''));
    if (!Number.isInteger(value) || value <= 0) {
      setError('Ingresa un volumen mensual mayor a cero.');
      return;
    }
    setError(null);
    setAppliedVolume(value);
  }

  return (
    <div className="page-content mps-page">
      <PageHeader eyebrow="ANÁLISIS / MPS" title="Insumos MPS"
        lead="Proyecta reemplazos de consumibles por modelo y volumen mensual usando el perfil Canon guardado en la SQLite compartida."
        actions={<Button variant="outline" onClick={() => void refresh()} disabled={loading} aria-busy={loading}><RefreshCw />{loading ? 'Actualizando…' : 'Actualizar modelos'}</Button>}
      />
      <StatusLine state={error ? 'error' : loading || importing ? 'pending' : 'ready'}>
        {error || message || (loading ? 'Cargando perfiles MPS…' : summary && summary.models > 0 ? `${summary.models} modelos · ${summary.consumables} insumos disponibles` : 'Importa la base MPS anterior o crea un perfil manual para comenzar.')}
      </StatusLine>
      <section className="mb-6 grid gap-4 sm:grid-cols-3 print:hidden" aria-label="Resumen MPS">
        <MpsSummary label="Modelos MPS" value={summary?.models ?? 0} accent />
        <MpsSummary label="Insumos registrados" value={summary?.consumables ?? 0} />
        <MpsSummary label="Modelos enlazados" value={summary?.linkedEquipmentModels ?? 0} />
      </section>

      <div className="grid min-w-0 items-start gap-6 min-[1601px]:grid-cols-[minmax(0,1fr)_20rem]">
        <div className="grid min-w-0 gap-6">
          <Card className="min-w-0 print:hidden">
            <CardHeader eyebrow="PASO 1 / MODELO" title="Selecciona el equipo" aside={
              <Button variant="outline" size="sm" onClick={() => openEditor('create')}><Plus />Nuevo modelo</Button>
            } />
            <label className="grid gap-2 text-xs font-bold text-navy dark:text-white">
              Buscar modelo o marca
              <Input id="mps-model-search" name="modelQuery" type="search" value={modelQuery} onChange={(event) => setModelQuery(event.target.value)} placeholder="Modelo o marca…" />
            </label>
            {visibleModels.length > 0 ? <div className="grid max-h-[27rem] gap-2 overflow-y-auto p-1" aria-label="Perfiles MPS">
              {visibleModels.map((model) => <div className={`grid min-w-0 gap-2 rounded-xl border p-3 ${selectedModel?.id === model.id ? 'border-sky/60 bg-sky/10 dark:bg-sky/15' : 'border-navy/10 bg-paper/50 dark:border-sky/20 dark:bg-navy/30'}`} key={model.id}>
                <Button variant="ghost" className="h-auto min-w-0 justify-between gap-4 px-2 py-2 text-left whitespace-normal" aria-pressed={selectedModel?.id === model.id} onClick={() => setSelectedModelId(model.id)}>
                  <span className="grid min-w-0 gap-1"><strong className="break-words text-sm">{model.modelLabel}</strong><span className="text-xs font-normal text-ink-2 dark:text-[#9fb2d1]">{model.brand} · {model.consumables.length} insumo{model.consumables.length === 1 ? '' : 's'}</span></span>
                  <span className="shrink-0 text-right text-xs font-normal text-ink-2 dark:text-[#9fb2d1]">{integerFormat.format(model.recVolumeMin)}–{integerFormat.format(model.recVolumeMax)} pág.</span>
                </Button>
                <div className="flex flex-wrap items-center justify-between gap-2 border-t border-navy/10 pt-2 dark:border-sky/15">
                  <Badge>{model.isEditable ? 'Perfil manual' : 'Importado'}</Badge>
                  {model.isEditable ? <div className="flex flex-wrap gap-1">
                    <Button variant="ghost" size="sm" onClick={() => openEditor('edit', model)} aria-label={`Editar ${model.modelLabel}`}><Pencil />Editar</Button>
                    <Button variant="ghost" size="sm" onClick={() => openEditor('clone', model)} aria-label={`Duplicar ${model.modelLabel}`}><Copy />Duplicar</Button>
                    <Button variant="ghost" size="sm" className="text-[#b42318]! dark:text-[#ffb0b7]!" onClick={() => void deleteModel(model)} aria-label={`Eliminar ${model.modelLabel}`}><Trash2 />Eliminar</Button>
                  </div> : null}
                </div>
              </div>)}
            </div> : <div className="grid gap-2 rounded-xl border border-dashed border-navy/20 p-6 text-center dark:border-sky/30">
              <strong className="text-sm text-navy dark:text-white">{models.length > 0 ? 'No hay modelos que coincidan con la búsqueda.' : 'No hay perfiles MPS cargados.'}</strong>
              <Muted>{models.length > 0 ? 'Prueba otro modelo o marca.' : 'Importa canon_mps.db o crea un nuevo modelo con sus consumibles.'}</Muted>
            </div>}
          </Card>

          {selectedModel ? <>
            <Card className="min-w-0 print:hidden">
              <CardHeader eyebrow="PASO 2 / VOLUMEN" title={selectedModel.modelLabel} aside={<Badge>{selectedModel.isColor ? 'Color' : 'Monocromático'}{selectedModel.speedPpm ? ` · ${selectedModel.speedPpm} ppm` : ''}</Badge>} />
              <div className="flex flex-wrap items-end gap-3">
                <label className="grid min-w-0 flex-1 basis-64 gap-2 text-xs font-bold text-navy dark:text-white">
                  Volumen mensual del cliente
                  <Input id="mps-monthly-volume" name="monthlyVolume" type="number" min="1" step="1" value={monthlyVolumeInput} onChange={(event) => setMonthlyVolumeInput(event.target.value)} onKeyDown={(event) => { if (event.key === 'Enter') applyVolume(); }} />
                </label>
                <Button onClick={applyVolume}><Calculator />Calcular proyección</Button>
              </div>
              {appliedVolume ? <Badge className="w-fit" tone={getVolumeStatus(appliedVolume, selectedModel.recVolumeMin, selectedModel.recVolumeMax).className === 'good' ? 'success' : 'warning'}>
                {getVolumeStatus(appliedVolume, selectedModel.recVolumeMin, selectedModel.recVolumeMax).label}
              </Badge> : <Muted>Ingresa un volumen para evaluar el rango recomendado.</Muted>}
              <div className="flex flex-wrap items-center gap-2 border-t border-navy/10 pt-4 dark:border-sky/20" aria-label="Volúmenes habituales">
                <Muted>Presets</Muted>
                {[1000, 3000, 5000, 10000, 20000, 50000].map((value) => <Button variant="outline" size="sm" className={appliedVolume === value ? 'border-sky! bg-sky/10! dark:bg-sky/20!' : ''} aria-pressed={appliedVolume === value} key={value} onClick={() => { setMonthlyVolumeInput(String(value)); setAppliedVolume(value); }}>{integerFormat.format(value)}</Button>)}
              </div>
            </Card>

            <Card className="min-w-0">
              <CardHeader eyebrow="PROYECCIÓN / 5 AÑOS" title="Reemplazos estimados" aside={<Muted>{appliedVolume ? `${integerFormat.format(appliedVolume)} páginas / mes` : 'Esperando volumen'}</Muted>} />
              <Table className="min-w-[48rem]" aria-label="Proyección anual de consumibles">
                <TableHeader><TableRow><TableHead className="w-48">Insumo</TableHead><TableHead>Tipo</TableHead><TableHead className="text-right">Rendimiento</TableHead>{[1, 2, 3, 4, 5].map((year) => <TableHead className="text-right" key={year}>Año {year}</TableHead>)}</TableRow></TableHeader>
                <TableBody>{projections.map((projection) => <ProjectionRow key={projection.consumable.id} projection={projection} />)}{projections.length === 0 && <TableRow><TableCell colSpan={8} className="py-8 text-center">Selecciona un volumen para calcular los reemplazos.</TableCell></TableRow>}</TableBody>
              </Table>
              <Muted>La proyección usa el rendimiento declarado en el perfil actual, importado o manual. Sirve como base de planificación y debe contrastarse con el consumo real del contrato.</Muted>
            </Card>
            <MpsAnalysisPanels model={selectedModel} analysis={analysis} exporting={exportingAnalysis} exportingConsumables={exportingConsumables} printing={printableAnalysis !== null} onExport={() => void exportAnalysis()} onExportConsumables={() => void exportConsumables()} onPrint={printAnalysis} />
          </> : null}
        </div>

        <aside className="grid min-w-0 grid-cols-[repeat(auto-fit,minmax(min(100%,20rem),1fr))] gap-6 print:hidden">
          <Card className="min-w-0 grid-cols-1">
            <CardHeader eyebrow="MIGRACIÓN DE LEGADO" title="Importar perfiles" />
            <Muted>Selecciona el archivo SQLite <code>canon_mps.db</code> de la calculadora anterior. Se conserva el original y sus modelos pasan a la base unificada.</Muted>
            <UploadButton id="mps-legacy-database" name="mpsLegacyDatabase" className="h-auto min-h-10 max-w-full whitespace-normal py-2" busy={importing} label="Seleccionar base SQLite" accept=".db,.sqlite,.sqlite3,application/vnd.sqlite3" onChange={(event) => void importLegacyFile(event)} />
            <div className="grid min-w-0 grid-cols-1 gap-2 rounded-xl border border-navy/10 bg-paper p-4 dark:border-sky/20 dark:bg-navy/30">
              {summary && summary.models > 0 ? <>
                <strong className="text-sm text-navy dark:text-white">{summary.models.toLocaleString('es-PY')} modelos activos</strong>
                <Muted className="break-words">{summary.sourceName ? `${summary.sourceName} · ` : 'Incluye perfiles manuales · '}{summary.linkedEquipmentModels.toLocaleString('es-PY')} enlazados con equipos</Muted>
                {summary.batchId && summary.sourceFileId ? <Button variant="export" size="sm" className="h-auto min-h-8 w-fit max-w-full whitespace-normal py-1" asChild><a
                  href={`/api/imports/${encodeURIComponent(summary.batchId)}/files/${encodeURIComponent(summary.sourceFileId)}`}
                  download={summary.sourceName ?? undefined}
                ><DownloadIcon />Descargar base original</a></Button> : null}
              </> : <Muted>Aún no hay una carga MPS en la suite.</Muted>}
            </div>
          </Card>
          <Card className="min-w-0 grid-cols-1">
            <CardHeader eyebrow="RANGO DE FÁBRICA" title={selectedModel ? 'Lectura del perfil' : 'Cómo empezar'} />
            {selectedModel ? <dl className="m-0 grid gap-3">
              <MpsFact label="Volumen mínimo" value={`${integerFormat.format(selectedModel.recVolumeMin)} pág./mes`} />
              <MpsFact label="Volumen máximo" value={`${integerFormat.format(selectedModel.recVolumeMax)} pág./mes`} />
              <MpsFact label="Insumos" value={String(selectedModel.consumables.length)} />
            </dl> : <Muted>Importa la base anterior o crea un perfil manual para seleccionar un modelo y proyectar sus insumos.</Muted>}
          </Card>
        </aside>
      </div>
      {printableAnalysis ? <MpsPrintReport {...printableAnalysis} /> : null}
      {editorMode ? <MpsModelEditor mode={editorMode} model={editorModel} models={models} saving={savingModel} onCancel={closeEditor} onSave={(input) => void saveModel(input)} /> : null}
    </div>
  );
}

function MpsSummary({ label, value, accent = false }: { label: string; value: number; accent?: boolean }) {
  return <Card className={`gap-2 ${accent ? 'border-sky/40 bg-sky/10! dark:bg-sky/10!' : ''}`}><Muted>{label}</Muted><strong className="break-all text-2xl font-bold tabular-nums text-navy dark:text-white">{integerFormat.format(value)}</strong></Card>;
}

function MpsFact({ label, value }: { label: string; value: string }) {
  return <div className="grid gap-1 border-b border-navy/10 pb-3 last:border-0 last:pb-0 dark:border-sky/20"><dt className="text-xs text-ink-2 dark:text-[#9fb2d1]">{label}</dt><dd className="m-0 break-words text-sm font-bold text-navy dark:text-white">{value}</dd></div>;
}

function ProjectionRow({ projection }: { projection: MpsProjection }) {
  return <TableRow>
    <TableCell><strong className="text-xs">{projection.consumable.name}</strong><Muted>{projection.consumable.sku || 'Sin SKU'}</Muted></TableCell>
    <TableCell>{projection.consumable.type} · {projection.consumable.color}</TableCell>
    <TableCell className="text-right whitespace-nowrap tabular-nums">{integerFormat.format(projection.consumable.yieldPages)} pág.</TableCell>
    {projection.years.map((year) => <TableCell className="text-right whitespace-nowrap tabular-nums" key={year.year}><strong>{integerFormat.format(year.units)} ud.</strong><Muted>{numberFormat.format(year.replacements)} ciclos</Muted></TableCell>)}
  </TableRow>;
}

function getVolumeStatus(volume: number, minimum: number, maximum: number): { label: string; className: string } {
  if (volume < minimum) return { label: 'Por debajo del rango recomendado', className: 'low' };
  if (volume > maximum) return { label: 'Por encima del rango recomendado', className: 'high' };
  return { label: 'Dentro del rango recomendado', className: 'good' };
}

function bytesToBase64(bytes: Uint8Array): string {
  let binary = '';
  const chunkSize = 0x8000;
  for (let offset = 0; offset < bytes.length; offset += chunkSize) {
    binary += String.fromCharCode(...bytes.subarray(offset, offset + chunkSize));
  }
  return btoa(binary);
}
