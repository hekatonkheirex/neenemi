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
    <div className="page-content operations-page mps-page">
      <section className="catalog-header">
        <div>
          <div className="eyebrow">ANÁLISIS / MPS</div>
          <h1>Insumos MPS</h1>
          <p className="lead">Proyecta reemplazos de consumibles por modelo y volumen mensual usando el perfil Canon guardado en la SQLite compartida.</p>
        </div>
        <button className="secondary-button" type="button" onClick={() => void refresh()} disabled={loading}>{loading ? 'Actualizando…' : 'Actualizar modelos'}</button>
      </section>

      <section className="sales-status" aria-live="polite">
        <span className={`status-dot ${error ? 'error' : loading ? 'pending' : 'ready'}`} />
        <span>{error || message || (summary && summary.models > 0 ? `${summary.models} modelos · ${summary.consumables} insumos disponibles` : 'Importa la base MPS anterior para comenzar.')}</span>
      </section>

      <section className="summary-grid operations-summary" aria-label="Resumen MPS">
        <div className="summary-card accent"><span className="summary-value">{summary?.models.toLocaleString('es-PY') ?? '0'}</span><span className="summary-label">modelos MPS</span></div>
        <div className="summary-card"><span className="summary-value">{summary?.consumables.toLocaleString('es-PY') ?? '0'}</span><span className="summary-label">insumos registrados</span></div>
        <div className="summary-card"><span className="summary-value">{summary?.linkedEquipmentModels.toLocaleString('es-PY') ?? '0'}</span><span className="summary-label">modelos enlazados</span></div>
      </section>

      <section className="mps-layout">
        <div className="mps-main">
          <section className="sales-card mps-selection-card">
            <div className="card-heading">
              <div><div className="eyebrow">PASO 1 / MODELO</div><h2>Selecciona el equipo</h2></div>
              <div className="mps-model-heading-actions"><label className="search-field compact-search"><span>Buscar</span><input id="mps-model-search" name="modelQuery" value={modelQuery} onChange={(event) => setModelQuery(event.target.value)} placeholder="Modelo o marca…" /></label><button className="secondary-button" type="button" onClick={() => openEditor('create')}>+ Nuevo modelo</button></div>
            </div>
            {visibleModels.length > 0 ? <div className="mps-model-list">
              {visibleModels.map((model) => <div className={`mps-model-option ${selectedModel?.id === model.id ? 'active' : ''}`} key={model.id}>
                <button className="mps-model-select" type="button" onClick={() => setSelectedModelId(model.id)}>
                  <span><strong>{model.modelLabel}</strong><small>{model.brand} · {model.consumables.length} insumo{model.consumables.length === 1 ? '' : 's'}</small></span>
                  <span className="mps-model-volume">{integerFormat.format(model.recVolumeMin)}–{integerFormat.format(model.recVolumeMax)} pág.</span>
                </button>
                {model.isEditable ? <div className="mps-model-actions"><button className="text-button" type="button" onClick={() => openEditor('edit', model)}>Editar</button><button className="text-button" type="button" onClick={() => openEditor('clone', model)}>Duplicar</button><button className="text-button danger-text-button" type="button" onClick={() => void deleteModel(model)}>Eliminar</button></div> : <span className="mps-source-badge">Importado</span>}
              </div>)}
            </div> : <div className="mps-empty"><strong>No hay perfiles MPS cargados.</strong><span>Selecciona el archivo `canon_mps.db` en el panel de migración.</span></div>}
          </section>

          {selectedModel ? <>
            <section className="sales-card mps-config-card">
              <div className="card-heading">
                <div><div className="eyebrow">PASO 2 / VOLUMEN</div><h2>{selectedModel.modelLabel}</h2></div>
                <span className="mps-model-meta">{selectedModel.isEditable ? 'Perfil manual' : 'Fuente importada'} · {selectedModel.isColor ? 'Color' : 'Monocromático'}{selectedModel.speedPpm ? ` · ${selectedModel.speedPpm} ppm` : ''}</span>
              </div>
              <div className="mps-volume-row">
                <label className="search-field"><span>Volumen mensual del cliente</span><input id="mps-monthly-volume" name="monthlyVolume" type="number" min="1" step="1" value={monthlyVolumeInput} onChange={(event) => setMonthlyVolumeInput(event.target.value)} onKeyDown={(event) => { if (event.key === 'Enter') applyVolume(); }} /></label>
                <button className="primary-button" type="button" onClick={applyVolume}>Calcular proyección</button>
                <div className={`mps-volume-status ${appliedVolume ? getVolumeStatus(appliedVolume, selectedModel.recVolumeMin, selectedModel.recVolumeMax).className : 'idle'}`}>
                  {appliedVolume ? getVolumeStatus(appliedVolume, selectedModel.recVolumeMin, selectedModel.recVolumeMax).label : 'Ingresa un volumen para evaluar el rango'}
                </div>
              </div>
              <div className="mps-presets"><span>Presets</span>{[1000, 3000, 5000, 10000, 20000, 50000].map((value) => <button className={appliedVolume === value ? 'active' : ''} type="button" key={value} onClick={() => { setMonthlyVolumeInput(String(value)); setAppliedVolume(value); }}>{integerFormat.format(value)}</button>)}</div>
            </section>

            <section className="sales-card">
              <div className="card-heading">
                <div><div className="eyebrow">PROYECCIÓN / 5 AÑOS</div><h2>Reemplazos estimados</h2></div>
                <span className="muted-note">{appliedVolume ? `${integerFormat.format(appliedVolume)} páginas / mes` : 'Esperando volumen'}</span>
              </div>
              <div className="catalog-table-wrap">
                <table className="catalog-table mps-projection-table">
                  <thead><tr><th>Insumo</th><th>Tipo</th><th className="align-right">Rendimiento</th><th className="align-right">Año 1</th><th className="align-right">Año 2</th><th className="align-right">Año 3</th><th className="align-right">Año 4</th><th className="align-right">Año 5</th></tr></thead>
                  <tbody>{projections.map((projection) => <ProjectionRow key={projection.consumable.id} projection={projection} />)}{projections.length === 0 && <tr><td colSpan={8} className="empty-cell">Selecciona un volumen para calcular los reemplazos.</td></tr>}</tbody>
                </table>
              </div>
              <p className="scope-note mps-note">La proyección usa el rendimiento declarado en el perfil actual, importado o manual. Sirve como base de planificación y debe contrastarse con el consumo real del contrato.</p>
            </section>
            <MpsAnalysisPanels model={selectedModel} analysis={analysis} exporting={exportingAnalysis} exportingConsumables={exportingConsumables} printing={printableAnalysis !== null} onExport={() => void exportAnalysis()} onExportConsumables={() => void exportConsumables()} onPrint={printAnalysis} />
          </> : null}
        </div>

        <aside className="operations-sidebar">
          <section className="sales-card form-card maintenance-import-card">
            <div className="eyebrow">MIGRACIÓN DE LEGADO</div>
            <h2>Importar perfiles</h2>
            <p className="form-hint import-description">Selecciona el archivo SQLite <code>canon_mps.db</code> de la calculadora anterior. Se conserva el original y sus modelos pasan a la base unificada.</p>
            <label className="file-input-button"><span>{importing ? 'Importando…' : 'Seleccionar base SQLite'}</span><input id="mps-legacy-database" name="mpsLegacyDatabase" type="file" accept=".db,.sqlite,.sqlite3,application/vnd.sqlite3" onChange={(event) => void importLegacyFile(event)} disabled={importing} /></label>
            <div className="import-summary">
              {summary && summary.models > 0 ? <>
                <strong>{summary.models.toLocaleString('es-PY')} modelos activos</strong>
                <span>{summary.sourceName ? `${summary.sourceName} · ` : 'Incluye perfiles manuales · '}{summary.linkedEquipmentModels.toLocaleString('es-PY')} enlazados con equipos</span>
                {summary.batchId && summary.sourceFileId ? <a
                  className="secondary-button source-data-download-button"
                  href={`/api/imports/${encodeURIComponent(summary.batchId)}/files/${encodeURIComponent(summary.sourceFileId)}`}
                  download={summary.sourceName ?? undefined}
                >
                  Descargar base original
                </a> : null}
              </> : <span>Aún no hay una carga MPS en la suite.</span>}
            </div>
          </section>

          <section className="sales-card form-card">
            <div className="eyebrow">RANGO DE FÁBRICA</div>
            <h2>{selectedModel ? 'Lectura del perfil' : 'Cómo empezar'}</h2>
            {selectedModel ? <div className="mps-facts"><div><span>Volumen mínimo</span><strong>{integerFormat.format(selectedModel.recVolumeMin)} pág./mes</strong></div><div><span>Volumen máximo</span><strong>{integerFormat.format(selectedModel.recVolumeMax)} pág./mes</strong></div><div><span>Insumos</span><strong>{selectedModel.consumables.length}</strong></div></div> : <p className="form-hint">La importación habilita la selección de modelos, el cálculo de volumen y la proyección anual de insumos.</p>}
          </section>
        </aside>
      </section>
      {printableAnalysis ? <MpsPrintReport {...printableAnalysis} /> : null}
      {editorMode ? <MpsModelEditor mode={editorMode} model={editorModel} models={models} saving={savingModel} onCancel={closeEditor} onSave={(input) => void saveModel(input)} /> : null}
    </div>
  );
}

function ProjectionRow({ projection }: { projection: MpsProjection }) {
  return <tr>
    <td><span className="code-cell">{projection.consumable.name}</span><small className="table-secondary-text">{projection.consumable.sku || 'Sin SKU'}</small></td>
    <td>{projection.consumable.type} · {projection.consumable.color}</td>
    <td className="align-right">{integerFormat.format(projection.consumable.yieldPages)} pág.</td>
    {projection.years.map((year) => <td className="align-right mps-year-cell" key={year.year}><strong>{integerFormat.format(year.units)} ud.</strong><small>{numberFormat.format(year.replacements)} ciclos</small></td>)}
  </tr>;
}

function getVolumeStatus(volume: number, minimum: number, maximum: number): { label: string; className: string } {
  if (volume < minimum) return { label: 'Por debajo del rango recomendado', className: 'low' };
  if (volume > maximum) return { label: 'Por encima del rango recomendado', className: 'high' };
  return { label: 'Dentro del rango recomendado', className: 'good' };
}

async function readJson<T>(response: Response): Promise<T> {
  const body = (await response.json()) as T | { error?: string };
  if (!response.ok) {
    const error = typeof body === 'object' && body !== null && 'error' in body && typeof body.error === 'string'
      ? body.error
      : 'La API local devolvió un error.';
    throw new Error(error);
  }
  return body as T;
}

function toErrorMessage(value: unknown): string {
  return value instanceof Error ? value.message : 'No se pudo completar la operación.';
}

function bytesToBase64(bytes: Uint8Array): string {
  let binary = '';
  const chunkSize = 0x8000;
  for (let offset = 0; offset < bytes.length; offset += chunkSize) {
    binary += String.fromCharCode(...bytes.subarray(offset, offset + chunkSize));
  }
  return btoa(binary);
}
