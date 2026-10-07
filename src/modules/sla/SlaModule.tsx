import { useEffect, useMemo, useState, type ChangeEvent, type FormEvent } from 'react';
import AiKeyPanel from '../../core/AiKeyPanel';
import { printOrSaveCurrentPageAsPdf } from '../../core/print';
import { extractPdfTextFromBytes } from '../ventas/service-report';
import { analyzeSlaRequirements } from './analysis';
import { DEMO_SLA_TEXT, SLA_BASELINE_NOTE, SLA_REFERENCE_SECTIONS } from './constants';
import { buildSlaHtmlReport } from './html-report';
import type { SlaAnalysis, SlaComplianceItem, SlaReferenceSection, SlaStatus } from './types';
import { readJson, toErrorMessage } from '../../core/http';
import { UploadButton, ExportButton, PrintButton } from '../../core/ActionButtons';
import { useBusy } from '../../core/useBusy';
import { cn } from '../../core/cn';
import { Badge, type BadgeTone } from '../../core/ui/badge';
import { Button } from '../../core/ui/button';
import { Card, CardHeader, Muted } from '../../core/ui/card';
import { formatLoadedAt } from '../../core/loaded-at';
import { PageHeader } from '../../core/ui/page-header';
import { StatusLine } from '../../core/ui/status-line';
import { Table, TableBody, TableCell, TableHead, TableHeader, TableRow } from '../../core/ui/table';
import { Textarea } from '../../core/ui/textarea';

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

  const [reading, runRead] = useBusy();

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
      const contents = await runRead(async () => extension === 'pdf'
        ? await extractPdfTextFromBytes(new Uint8Array(await file.arrayBuffer()))
        : await file.text());
      if (contents === undefined) return;
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

  const [printing, runPrint] = useBusy();

  async function printReport() {
    if (!analysis) return;
    setError(null);
    try {
      const saved = await runPrint(() => printOrSaveCurrentPageAsPdf(`informe-sla-${fileName || 'reporte'}`));
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

  return (
    <div className="page-content">
      <PageHeader
        eyebrow="HERRAMIENTAS / COMPLIANCE"
        title="SLA Compliance Analyzer"
        lead="Compara requisitos de un pliego con el SLA estándar de Data Systems y separa cumplimiento, condiciones parciales y brechas negociables."
        actions={(
          <>
            <PrintButton busy={printing} onClick={() => void printReport()} disabled={!analysis} />
            <ExportButton onClick={exportHtmlReport} disabled={!analysis}>Exportar HTML</ExportButton>
            <ExportButton onClick={exportReport} disabled={!analysis}>Exportar JSON</ExportButton>
          </>
        )}
      />

      <StatusLine state={error ? 'error' : loading || analyzing ? 'pending' : 'ready'}>
        {error || message || (loading ? 'Cargando SLA de referencia…' : 'Pega un pliego para comenzar.')}
      </StatusLine>

      <div className="grid items-start gap-5 min-[1401px]:grid-cols-[minmax(0,1fr)_21rem] print:block">
        <div className="grid min-w-0 gap-5">
          <Card className="print:hidden">
            <CardHeader
              eyebrow="PASO 1 / DOCUMENTO"
              title="Pliego del cliente"
              aside={<Muted>{numberFormat.format(text.length)} / {numberFormat.format(MAX_TEXT_LENGTH)} caracteres</Muted>}
            />
            <form className="grid gap-3" onSubmit={analyze}>
              <label className="grid gap-1.5 text-xs font-bold text-ink-2! dark:text-[#9fb2d1]!">
                Texto del documento
                <Textarea
                  className="min-h-56 font-normal"
                  value={text}
                  maxLength={MAX_TEXT_LENGTH}
                  rows={10}
                  onChange={(event) => { setText(event.target.value); setAnalysis(null); }}
                  placeholder="Pega aquí horarios, tiempos, consumibles, contadores y demás cláusulas del cliente…"
                />
              </label>
              <div className="flex flex-wrap items-center gap-2.5">
                <UploadButton busy={reading} busyLabel="Leyendo…" label="Cargar TXT / PDF" accept=".txt,.md,.csv,.json,.pdf,text/plain,text/markdown,text/csv,application/json,application/pdf" onChange={(event) => void loadDocumentFile(event)} />
                <Button variant="outline" onClick={loadDemo}>Cargar ejemplo</Button>
                <Button variant="outline" type="submit" id="btn-local" disabled={analyzing || !text.trim()}>{analyzing ? 'Procesando…' : 'Ejecutar análisis local'}</Button>
                <Button type="submit" id="btn-ai" className="ml-auto max-[720px]:ml-0" disabled={analyzing || !text.trim()}>Analizar con IA</Button>
              </div>
              <Muted>{SLA_BASELINE_NOTE} Los PDF con capa de texto se extraen localmente; los PDF escaneados como imagen todavía requieren OCR externo o pegar el texto.</Muted>
            </form>
          </Card>

          <div className="print:hidden"><AiKeyPanel /></div>

          {analysis ? <SlaResults analysis={analysis} statusCounts={statusCounts} /> : (
            <Card className="justify-items-center gap-1.5 border-dashed py-10 text-center">
              <div className="font-bold text-navy dark:text-white">El informe aparecerá aquí.</div>
              <Muted className="max-w-md text-sm">Carga el ejemplo o pega un fragmento del pliego para calcular el nivel de riesgo y las cláusulas a negociar.</Muted>
            </Card>
          )}
        </div>

        <aside aria-label="Referencia del SLA base" className="grid gap-4 print:hidden">
          <Card>
            <CardHeader eyebrow="SLA BASE / REFERENCIA" title="Cláusulas vigentes" aside={<Muted>{reference.length} secciones</Muted>} />
            <div className="grid gap-3">
              {reference.map((section) => (
                <article className="grid gap-1 rounded-xl border border-navy/10 p-3 dark:border-sky/20" key={`${section.section}-${section.title}`}>
                  <div className="text-xs font-bold text-[#00698f] dark:text-sky">§ {section.section}</div>
                  <div className="text-sm font-bold text-navy dark:text-white">{section.title}</div>
                  <Muted className="text-sm leading-snug">{section.coverage}</Muted>
                </article>
              ))}
            </div>
          </Card>
          {analysis && <Button variant="ghost" size="sm" className="justify-self-start underline" onClick={() => void clearSavedAnalysis()}>Borrar análisis guardado</Button>}
        </aside>
      </div>
    </div>
  );
}

const riskTone: Record<SlaAnalysis['overallRisk'], string> = {
  low: 'border-[#2f8f5b]/50 bg-[#2f8f5b]/10',
  medium: 'border-[#e08a00]/50 bg-[#e08a00]/10',
  high: 'border-[#d92d20]/50 bg-[#d92d20]/10',
  critical: 'border-[#d92d20]/70 bg-[#d92d20]/15',
};

const statusTone: Record<SlaStatus, BadgeTone> = { complies: 'success', partial: 'warning', gap: 'danger', na: 'neutral' };

function Stat({ label, value, note, tone }: { label: string; value: string | number; note: string; tone?: string }) {
  // El tono reemplaza (no se suma a) el fondo y borde base: las variantes dark: de la base ganarían al tono en el tema oscuro.
  return (
    <div className={cn('grid gap-1 rounded-2xl border p-4 shadow-md', tone ?? 'border-navy/10 bg-white dark:border-sky/20 dark:bg-panel')}>
      <div className="text-[0.7rem] font-extrabold uppercase tracking-wider text-ink-2 dark:text-[#9fb2d1]">{label}</div>
      <div className="text-3xl font-extrabold tracking-tight text-navy dark:text-white">{value}</div>
      <Muted>{note}</Muted>
    </div>
  );
}

export function SlaResults({ analysis, statusCounts }: { analysis: SlaAnalysis; statusCounts: { complies: number; partial: number; gap: number } }) {
  return (
    <div className="grid gap-5">
      <section aria-label="Resumen de cumplimiento SLA" className="grid gap-3 min-[640px]:grid-cols-2 min-[1101px]:grid-cols-4">
        <Stat label="Cumplimiento estimado" value={percentage.format(analysis.complianceScore / 100)} note={[analysis.fileName, formatLoadedAt(analysis.analyzedAt)].filter(Boolean).join(' · ')} />
        <Stat label="Riesgo general" value={riskLabel(analysis.overallRisk)} note={`${analysis.items.length} cláusulas revisadas`} tone={riskTone[analysis.overallRisk]} />
        <Stat label="Brechas" value={statusCounts.gap} note="requieren aclaración" />
        <Stat label="Parciales" value={statusCounts.partial} note="requieren condición" />
      </section>

      <Card>
        <CardHeader eyebrow="LECTURA EJECUTIVA" title={analysis.usedFallback ? 'Revisión manual requerida' : 'Resultado del cruce'} aside={<Badge>{analysis.source}</Badge>} />
        <div className="text-sm leading-relaxed text-navy dark:text-[#d6e2f5]">{analysis.summary}</div>
      </Card>

      <Card>
        <CardHeader eyebrow="DETALLE / TRAZABILIDAD" title="Cláusulas comparadas" aside={<Muted>{statusCounts.complies} cumplen</Muted>} />
        <Table className="min-w-[600px]" wrapperClassName="print:overflow-visible">
          <TableHeader>
            <TableRow>
              <TableHead>Estado</TableHead>
              <TableHead>Requisito del cliente</TableHead>
              <TableHead>Posición Data Systems</TableHead>
              <TableHead>Acción sugerida</TableHead>
            </TableRow>
          </TableHeader>
          <TableBody>{analysis.items.map((item) => <SlaItemRow item={item} key={item.id} />)}</TableBody>
        </Table>
      </Card>

      <div className="grid gap-5 min-[1101px]:grid-cols-3 print:hidden">
        <AdviceList title="Brechas críticas" items={analysis.criticalGaps} empty="No se detectaron brechas críticas." />
        <AdviceList title="Recomendaciones" items={analysis.recommendations} empty="No hay recomendaciones adicionales." />
        <AdviceList title="Puntos de negociación" items={analysis.negotiationPoints} empty="No hay puntos pendientes de negociación." />
      </div>
    </div>
  );
}

function SlaItemRow({ item }: { item: SlaComplianceItem }) {
  return (
    <TableRow>
      <TableCell className="min-w-28">
        <Badge tone={statusTone[item.status]}>{statusLabel(item.status)}</Badge>
        <Muted className="mt-1">{item.clientSource}</Muted>
      </TableCell>
      <TableCell>
        <div className="font-bold text-navy dark:text-white">{item.category}</div>
        <div>{item.clientRequirement}</div>
      </TableCell>
      <TableCell>
        <div>{item.ourPosition}</div>
        <Muted className="mt-1">{item.ourSource}</Muted>
      </TableCell>
      <TableCell>{item.advice}</TableCell>
    </TableRow>
  );
}

function AdviceList({ title, items, empty }: { title: string; items: string[]; empty: string }) {
  return (
    <Card>
      <CardHeader title={title} aside={<Badge>{items.length}</Badge>} />
      {items.length > 0 ? (
        // ponytail: <div> con viñeta propia; el CSS global de <li> añade un ✓ (index/01-ventas.css:671).
        <div className="grid gap-2">
          {items.map((item, index) => (
            <div className="border-l-4 border-sky pl-3 text-sm leading-snug text-navy dark:text-[#d6e2f5]" key={`${title}-${index}`}>{item}</div>
          ))}
        </div>
      ) : <Muted className="text-sm">{empty}</Muted>}
    </Card>
  );
}

function statusLabel(status: SlaStatus): string {
  return { complies: 'Cumple', partial: 'Parcial', gap: 'Brecha', na: 'Revisar' }[status];
}

function riskLabel(risk: SlaAnalysis['overallRisk']): string {
  return { low: 'Bajo', medium: 'Medio', high: 'Alto', critical: 'Crítico' }[risk];
}
