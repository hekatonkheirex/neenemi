import { useEffect, useMemo, useState, type ChangeEvent, type FormEvent } from 'react';
import { printOrSaveCurrentPageAsPdf } from '../../core/print';
import { extractPdfTextFromBytes } from '../ventas/service-report';
import { analyzeSlaRequirements } from './analysis';
import { DEMO_SLA_TEXT, SLA_BASELINE_NOTE, SLA_REFERENCE_SECTIONS } from './constants';
import { buildSlaHtmlReport } from './html-report';
import type { SlaAnalysis, SlaComplianceItem, SlaReferenceSection, SlaStatus } from './types';

const MAX_TEXT_LENGTH = 250_000;
const numberFormat = new Intl.NumberFormat('es-PY');
const percentage = new Intl.NumberFormat('es-PY', { style: 'percent', maximumFractionDigits: 0 });

export default function SlaModule() {
  const [analysis, setAnalysis] = useState<SlaAnalysis | null>(null);
  const [text, setText] = useState('');
  const [fileName, setFileName] = useState('pliego.txt');
  const [reference, setReference] = useState<SlaReferenceSection[]>([...SLA_REFERENCE_SECTIONS]);
  const [loading, setLoading] = useState(true);
  const [analyzing, setAnalyzing] = useState(false);
  const [message, setMessage] = useState('');
  const [error, setError] = useState<string | null>(null);

  useEffect(() => {
    void loadModule();
  }, []);

  const statusCounts = useMemo(() => ({
    complies: analysis?.items.filter((item) => item.status === 'complies').length ?? 0,
    partial: analysis?.items.filter((item) => item.status === 'partial').length ?? 0,
    gap: analysis?.items.filter((item) => item.status === 'gap').length ?? 0,
  }), [analysis]);

  async function loadModule() {
    setLoading(true);
    setError(null);
    try {
      const [referenceResponse, lastResponse] = await Promise.all([
        fetch('/api/sla/reference'),
        fetch('/api/sla/last'),
      ]);
      setReference(await readJson<SlaReferenceSection[]>(referenceResponse));
      const last = await readJson<SlaAnalysis | null>(lastResponse);
      if (last) {
        setAnalysis(last);
        setText(last.textExcerpt);
        setFileName(last.fileName);
        setMessage('Se restauró el último análisis SLA guardado en SQLite.');
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
      const response = await fetch(isAi ? '/api/ai/analyze-sla' : '/api/sla/analyze', {
        method: 'POST',
        headers: { 'content-type': 'application/json' },
        body: JSON.stringify({ text, fileName }),
      });
      const result = await readJson<SlaAnalysis>(response);
      setAnalysis(result);
      setMessage(result.usedFallback
        ? 'No se detectaron cláusulas comparables; se requiere revisión manual.'
        : `Análisis ${isAi ? 'IA' : 'local'} completo: ${numberFormat.format(result.items.length)} cláusulas comparadas.`);
    } catch (analysisError: unknown) {
      setError(toErrorMessage(analysisError));
    } finally {
      setAnalyzing(false);
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
    if (!['txt', 'md', 'csv', 'json', 'pdf'].includes(extension ?? '')) {
      setError('Solo se aceptan TXT, MD, CSV o PDF.');
      return;
    }
    try {
      const contents = extension === 'pdf'
        ? await extractPdfTextFromBytes(new Uint8Array(await file.arrayBuffer()))
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
      setMessage(`Archivo ${file.name} cargado localmente. Ejecuta el análisis.`);
    } catch (fileError: unknown) {
      setError(toErrorMessage(fileError));
    }
  }

  function loadDemo() {
    setText(DEMO_SLA_TEXT);
    setFileName('ejemplo-pliego-sla.txt');
    setAnalysis(null);
    setError(null);
    setMessage('Ejemplo cargado. Ejecuta el análisis para ver brechas y recomendaciones.');
  }

  async function clearSavedAnalysis() {
    try {
      const response = await fetch('/api/sla/last', { method: 'DELETE' });
      if (!response.ok) throw new Error('No se pudo borrar el análisis SLA guardado.');
      setAnalysis(null);
      setText('');
      setFileName('pliego.txt');
      setMessage('Análisis SLA eliminado de SQLite.');
    } catch (clearError: unknown) {
      setError(toErrorMessage(clearError));
    }
  }

  function exportReport() {
    if (!analysis) return;
    const blob = new Blob([JSON.stringify(analysis, null, 2)], { type: 'application/json;charset=utf-8' });
    const url = URL.createObjectURL(blob);
    const anchor = document.createElement('a');
    anchor.href = url;
    anchor.download = 'sla-compliance-reporte.json';
    anchor.click();
    URL.revokeObjectURL(url);
    setMessage('Reporte SLA generado.');
  }

  function exportHtmlReport() {
    if (!analysis) return;
    const blob = new Blob([buildSlaHtmlReport(analysis)], { type: 'text/html;charset=utf-8' });
    const url = URL.createObjectURL(blob);
    const anchor = document.createElement('a');
    anchor.href = url;
    anchor.download = 'sla-compliance-reporte.html';
    anchor.click();
    URL.revokeObjectURL(url);
    setMessage('Reporte SLA HTML generado.');
  }

  async function printReport() {
    if (!analysis) return;
    setError(null);
    try {
      const saved = await printOrSaveCurrentPageAsPdf(`informe-sla-${fileName || 'reporte'}`);
      setMessage(saved === null
        ? 'Diálogo de impresión abierto.'
        : saved.saved
          ? `PDF guardado: ${saved.filePath ?? 'archivo seleccionado'}.`
          : 'Guardado de PDF cancelado.');
    } catch (printError: unknown) {
      setError(toErrorMessage(printError));
    }
  }

  return (
    <div className="page-content sla-page">
      <section className="catalog-header">
        <div>
          <div className="eyebrow">SOPORTE / COMPLIANCE</div>
          <h1>SLA Compliance Analyzer</h1>
          <p className="lead">Compara requisitos de un pliego con el SLA estándar de Data Systems y separa cumplimiento, condiciones parciales y brechas negociables.</p>
        </div>
        <div className="sla-actions">
          <button className="secondary-button" type="button" onClick={() => void printReport()} disabled={!analysis}>Imprimir / PDF</button>
          <button className="secondary-button" type="button" onClick={exportHtmlReport} disabled={!analysis}>Exportar HTML</button>
          <button className="primary-button" type="button" onClick={exportReport} disabled={!analysis}>Exportar JSON</button>
        </div>
      </section>

      <section className="sales-status" aria-live="polite">
        <span className={`status-dot ${error ? 'error' : loading || analyzing ? 'pending' : 'ready'}`} />
        <span>{error || message || (loading ? 'Cargando SLA de referencia…' : 'Pega un pliego para comenzar.')}</span>
      </section>

      <section className="sla-layout">
        <main className="sla-main">
          <section className="sales-card sla-input-card">
            <div className="card-heading">
              <div><div className="eyebrow">PASO 1 / DOCUMENTO</div><h2>Pliego del cliente</h2></div>
              <span className="muted-note">{numberFormat.format(text.length)} / {numberFormat.format(MAX_TEXT_LENGTH)} caracteres</span>
            </div>
            <form onSubmit={analyze}>
              <label className="search-field sla-text-field">
                <span>Texto del documento</span>
                <textarea value={text} maxLength={MAX_TEXT_LENGTH} rows={10} onChange={(event) => { setText(event.target.value); setAnalysis(null); }} placeholder="Pega aquí horarios, tiempos, consumibles, contadores y demás cláusulas del cliente…" />
              </label>
              <div className="sla-input-actions">
                <label className="file-input-button"><span>Cargar TXT / PDF</span><input type="file" accept=".txt,.md,.csv,.json,.pdf,text/plain,text/markdown,text/csv,application/json,application/pdf" onChange={(event) => void loadDocumentFile(event)} /></label>
                <button className="secondary-button" type="button" onClick={loadDemo}>Cargar ejemplo</button>
                <button className="secondary-button" type="submit" id="btn-local" disabled={analyzing || !text.trim()}>{analyzing ? 'Procesando…' : 'Ejecutar análisis local'}</button>
                <button className="primary-button" type="submit" id="btn-ai" disabled={analyzing || !text.trim()}>Analizar con IA</button>
              </div>
              <p className="form-hint">{SLA_BASELINE_NOTE} Los PDF con capa de texto se extraen localmente; los PDF escaneados como imagen todavía requieren OCR externo o pegar el texto.</p>
            </form>
          </section>

          {analysis ? <SlaResults analysis={analysis} statusCounts={statusCounts} /> : <section className="sales-card sla-empty-card"><strong>El informe aparecerá aquí.</strong><span>Carga el ejemplo o pega un fragmento del pliego para calcular el nivel de riesgo y las cláusulas a negociar.</span></section>}
        </main>

        <aside className="sla-sidebar">
          <section className="sales-card sla-reference-card">
            <div className="card-heading"><div><div className="eyebrow">SLA BASE / REFERENCIA</div><h2>Cláusulas vigentes</h2></div><span className="muted-note">{reference.length} secciones</span></div>
            <div className="sla-reference-list">{reference.map((section) => <article className="sla-reference-item" key={`${section.section}-${section.title}`}><span>§ {section.section}</span><strong>{section.title}</strong><p>{section.coverage}</p></article>)}</div>
          </section>
          {analysis && <button className="text-button sla-clear-saved" type="button" onClick={() => void clearSavedAnalysis()}>Borrar análisis guardado</button>}
        </aside>
      </section>
    </div>
  );
}

function SlaResults({ analysis, statusCounts }: { analysis: SlaAnalysis; statusCounts: { complies: number; partial: number; gap: number } }) {
  return (
    <section className="sla-results">
      <section className="sla-overview-grid" aria-label="Resumen de cumplimiento SLA">
        <div className="sla-score-card"><span className="detail-label">Cumplimiento estimado</span><strong>{percentage.format(analysis.complianceScore / 100)}</strong><span>{analysis.fileName}</span></div>
        <div className={`sla-risk-card ${analysis.overallRisk}`}><span className="detail-label">Riesgo general</span><strong>{riskLabel(analysis.overallRisk)}</strong><span>{analysis.items.length} cláusulas revisadas</span></div>
        <div className="sla-count-card"><span className="detail-label">Brechas</span><strong>{statusCounts.gap}</strong><span>requieren aclaración</span></div>
        <div className="sla-count-card"><span className="detail-label">Parciales</span><strong>{statusCounts.partial}</strong><span>requieren condición</span></div>
      </section>

      <section className="sales-card sla-summary-card">
        <div className="card-heading"><div><div className="eyebrow">LECTURA EJECUTIVA</div><h2>{analysis.usedFallback ? 'Revisión manual requerida' : 'Resultado del cruce'}</h2></div><span className="badge neutral">{analysis.source}</span></div>
        <p className="sla-summary-text">{analysis.summary}</p>
      </section>

      <section className="sales-card sla-items-card">
        <div className="card-heading"><div><div className="eyebrow">DETALLE / TRAZABILIDAD</div><h2>Cláusulas comparadas</h2></div><span className="muted-note">{statusCounts.complies} cumplen</span></div>
        <div className="sla-table-wrap"><table className="sla-table"><thead><tr><th>Estado</th><th>Requisito del cliente</th><th>Posición Data Systems</th><th>Acción sugerida</th></tr></thead><tbody>{analysis.items.map((item) => <SlaItemRow item={item} key={item.id} />)}</tbody></table></div>
      </section>

      <div className="sla-advice-grid">
        <AdviceList title="Brechas críticas" items={analysis.criticalGaps} empty="No se detectaron brechas críticas." />
        <AdviceList title="Recomendaciones" items={analysis.recommendations} empty="No hay recomendaciones adicionales." />
        <AdviceList title="Puntos de negociación" items={analysis.negotiationPoints} empty="No hay puntos pendientes de negociación." />
      </div>
    </section>
  );
}

function SlaItemRow({ item }: { item: SlaComplianceItem }) {
  return <tr><td><span className={`sla-status ${item.status}`}>{statusLabel(item.status)}</span><small>{item.clientSource}</small></td><td><strong>{item.category}</strong><span>{item.clientRequirement}</span></td><td><span>{item.ourPosition}</span><small>{item.ourSource}</small></td><td>{item.advice}</td></tr>;
}

function AdviceList({ title, items, empty }: { title: string; items: string[]; empty: string }) {
  return <section className="sales-card sla-advice-card"><div className="card-heading"><h2>{title}</h2><span className="badge neutral">{items.length}</span></div>{items.length > 0 ? <ul>{items.map((item, index) => <li key={`${title}-${index}`}>{item}</li>)}</ul> : <p className="sla-note">{empty}</p>}</section>;
}

function statusLabel(status: SlaStatus): string {
  return { complies: 'Cumple', partial: 'Parcial', gap: 'Brecha', na: 'Revisar' }[status];
}

function riskLabel(risk: SlaAnalysis['overallRisk']): string {
  return { low: 'Bajo', medium: 'Medio', high: 'Alto', critical: 'Crítico' }[risk];
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
