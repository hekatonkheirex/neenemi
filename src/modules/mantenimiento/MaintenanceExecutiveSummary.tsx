import type { MaintenanceAnalysis } from './analysis';
import { buildMaintenanceExecutiveSummary } from './maintenance-summary';
import { ExportButton, PrintButton } from '../../core/ActionButtons';
import { cn } from '../../core/cn';
import { Button } from '../../core/ui/button';
import { Card, CardHeader, Muted } from '../../core/ui/card';
import { Badge } from '../../core/ui/badge';

export type MaintenanceExportKind = 'critical' | 'attention' | 'unrecognized' | 'zero' | 'recommended';

type MaintenanceExecutiveSummaryProps = {
  analyses: readonly MaintenanceAnalysis[];
  onExport?: (analyses: readonly MaintenanceAnalysis[], kind: MaintenanceExportKind) => void;
  exporting?: boolean;
  onPrint?: () => void;
  printing?: boolean;
};

const integerFormat = new Intl.NumberFormat('es-PY', { maximumFractionDigits: 0 });

// Tono de cada ficha y lista: borde y color del indicador. Los textos usan los tokens de marca en ambos temas.
const tones: Record<string, { border: string; accent: string }> = {
  normal: { border: 'border-l-[#2f8f5b]', accent: 'text-[#14532d] dark:text-[#9be3b9]' },
  critical: { border: 'border-l-[#d92d20]', accent: 'text-[#912018] dark:text-[#ff8a93]' },
  attention: { border: 'border-l-[#e08a00]', accent: 'text-[#7a4a00] dark:text-[#f0b44c]' },
  unrecognized: { border: 'border-l-[#6b5bd6]', accent: 'text-[#4a3fa8] dark:text-[#b9afff]' },
  idle: { border: 'border-l-[#73869f]', accent: 'text-ink-2 dark:text-[#9fb3d4]' },
  overworked: { border: 'border-l-brand', accent: 'text-[#b84d00] dark:text-[#ff9a4d]' },
  recommended: { border: 'border-l-sky', accent: 'text-[#00587a] dark:text-[#8bd6f2]' },
};

const panelClass = 'grid min-w-0 content-start gap-3 rounded-xl border border-navy/10 border-l-4 bg-paper p-4 dark:border-sky/20 dark:bg-navy/30';
const rowClass = 'grid min-w-0 grid-cols-[2rem_minmax(0,1fr)_auto] items-start gap-3 border-t border-navy/10 pt-3 dark:border-sky/15';

export default function MaintenanceExecutiveSummary({ analyses, onExport, onPrint, exporting, printing }: MaintenanceExecutiveSummaryProps) {
  const summary = buildMaintenanceExecutiveSummary(analyses);
  if (summary.total === 0) return null;

  return (
    <Card className="@container min-w-0 grid-cols-1 [overflow-wrap:anywhere]" aria-label="Tablero ejecutivo de mantenimiento">
      <CardHeader
        eyebrow="Tablero ejecutivo"
        title="Estado del parque"
        aside={<div className="flex flex-wrap items-center gap-2">
          <Badge>{integerFormat.format(summary.total)} equipos analizados</Badge>
          {onPrint ? <PrintButton busy={printing} onClick={onPrint}>Imprimir resumen PDF</PrintButton> : null}
        </div>}
      />
      <Muted className="text-sm">Lectura priorizada de las mismas reglas y períodos usados en el análisis por equipo.</Muted>

      <div className="grid min-w-0 grid-cols-2 gap-3 min-[640px]:grid-cols-3 min-[1180px]:grid-cols-6">
        <SummaryKpi label="Normal" value={summary.normal} tone="normal" detail="Dentro del óptimo dinámico" />
        <SummaryKpi label="Críticos" value={summary.critical} tone="critical" detail="Requieren intervención" />
        <SummaryKpi label="Atención" value={summary.attention} tone="attention" detail="Revisión preventiva" />
        <SummaryKpi label="Sin mapeo" value={summary.unrecognized} tone="unrecognized" detail="Configurar regla" />
        <SummaryKpi label="Contador en cero" value={summary.zeroCounters} tone="idle" detail="Auditar telemetría" />
        <SummaryKpi label="Sobre el óptimo" value={summary.overworked} tone="overworked" detail="Ratio mayor a 1" />
      </div>

      <div className="grid min-w-0 gap-4 @[44rem]:grid-cols-2">
        <PriorityList
          title="Intervención prioritaria"
          description="Todos los equipos críticos, ordenados por ratio."
          analyses={summary.urgentAll}
          tone="critical"
          empty="No hay equipos críticos en la ventana seleccionada."
          exportKind="critical"
          onExport={onExport} exporting={exporting}
        />
        <PriorityList
          title="Seguimiento preventivo"
          description="Todos los equipos en atención, ordenados por ratio."
          analyses={summary.cautionAll}
          tone="attention"
          empty="No hay equipos en atención en la ventana seleccionada."
          exportKind="attention"
          onExport={onExport} exporting={exporting}
        />
      </div>

      {summary.unrecognizedList.length > 0 || summary.zeroList.length > 0 ? <div className="grid min-w-0 gap-4 @[44rem]:grid-cols-2">
        {summary.unrecognizedList.length > 0 ? <MaintenanceSubsetPanel
          title="Equipos no reconocidos"
          description="No tienen una regla de vida útil asociada. Configurá el modelo antes de usar el resultado como límite operativo."
          analyses={summary.unrecognizedList}
          tone="unrecognized"
          metric={() => 'SIN REGLA'}
          detail={(analysis) => `${analysis.modelLabel} · ${analysis.customerName || 'Cliente sin informar'}`}
          exportKind="unrecognized"
          onExport={onExport} exporting={exporting}
        /> : null}
        {summary.zeroList.length > 0 ? <MaintenanceSubsetPanel
          title="Equipos con contador en cero"
          description="Equipos sin copias promedio en la ventana. Revisá telemetría, conectividad o baja operativa."
          analyses={summary.zeroList}
          tone="idle"
          metric={() => '0 COPIAS'}
          detail={(analysis) => `${analysis.modelLabel} · ${analysis.customerName || 'Cliente sin informar'}`}
          exportKind="zero"
          onExport={onExport} exporting={exporting}
        /> : null}
      </div> : null}

      <MaintenanceSubsetPanel
        title="Equipos sobre el volumen óptimo recomendado"
        description="Promedio mensual por encima de Óptimo Base / 65%, sin aplicar el coeficiente de desgaste."
        analyses={summary.recommendedExceeded}
        tone="recommended"
        metric={(analysis) => {
          const limit = Math.round(analysis.optimalBase / 0.65);
          const exceeded = Math.round((analysis.averageCopies / limit) * 100) - 100;
          return exceeded > 0 ? `+${exceeded}%` : 'EN LÍMITE';
        }}
        detail={(analysis) => `Prom. ${integerFormat.format(analysis.averageCopies)} · límite ${integerFormat.format(Math.round(analysis.optimalBase / 0.65))}`}
        empty="Ningún equipo supera el volumen óptimo recomendado."
        exportKind="recommended"
        onExport={onExport} exporting={exporting}
      />

      <div className="grid min-w-0 gap-2 rounded-xl border border-navy/10 bg-paper p-4 dark:border-sky/20 dark:bg-navy/30">
        <div className="text-[0.7rem] font-extrabold uppercase tracking-[0.14em] text-[#00698f] dark:text-sky">Patrones detectados</div>
        <h3 className="m-0 text-base font-bold text-navy dark:text-white">Lectura operativa</h3>
        <ul className="m-0 grid list-disc gap-1.5 pl-5 text-sm text-ink-2 [&_li]:before:content-none dark:text-[#d6e2f5]">{summary.insights.map((insight) => <li key={insight}>{insight}</li>)}</ul>
      </div>
    </Card>
  );
}

function SummaryKpi({ label, value, tone, detail }: { label: string; value: number; tone: string; detail: string }) {
  return <div className={cn('grid min-w-0 gap-1 rounded-xl border border-navy/10 border-l-4 bg-paper p-3 dark:border-sky/20 dark:bg-navy/30', tones[tone].border)}>
    <div className="flex min-w-0 items-center justify-between gap-2 text-xs font-bold text-ink-2 dark:text-[#9fb2d1]">
      <div className="min-w-0">{label}</div>
    </div>
    <div className={cn('text-3xl font-bold tabular-nums', tones[tone].accent)}>{integerFormat.format(value)}</div>
    <Muted>{detail}</Muted>
  </div>;
}

function PanelHeading({ title, description, count, exportKind, analyses, onExport, exporting }: {
  title: string;
  description: string;
  count: number;
  exportKind: MaintenanceExportKind;
  analyses: readonly MaintenanceAnalysis[];
  onExport?: (analyses: readonly MaintenanceAnalysis[], kind: MaintenanceExportKind) => void;
  exporting?: boolean;
}) {
  return <div className="flex items-start justify-between gap-3">
    <div className="grid min-w-0 flex-1 gap-1"><h3 className="m-0 text-base font-bold text-navy dark:text-white">{title}</h3><Muted>{description}</Muted></div>
    <div className="flex shrink-0 items-center gap-2"><Badge>{count}</Badge>{onExport && count > 0 ? <ExportButton busy={exporting} onClick={() => onExport(analyses, exportKind)}>Descargar XLSX</ExportButton> : null}</div>
  </div>;
}

function PriorityList({
  title,
  description,
  analyses,
  tone,
  empty,
  exportKind,
  onExport,
  exporting,
}: {
  title: string;
  description: string;
  analyses: readonly MaintenanceAnalysis[];
  tone: string;
  empty: string;
  exportKind: MaintenanceExportKind;
  onExport?: (analyses: readonly MaintenanceAnalysis[], kind: MaintenanceExportKind) => void;
  exporting?: boolean;
}) {
  return <div className={cn(panelClass, tones[tone].border)}>
    <PanelHeading title={title} description={description} count={analyses.length} exportKind={exportKind} analyses={analyses} onExport={onExport} exporting={exporting} />
    {analyses.length === 0 ? <Muted className="text-sm">{empty}</Muted> : <div className="grid max-h-96 gap-3 overflow-y-auto pr-1">{analyses.map((analysis, index) => <div className={rowClass} key={`${analysis.serialNumber}-${analysis.modelLabel}-${index}`}>
      <div className="font-mono text-xs text-ink-2 dark:text-[#9fb2d1]">{String(index + 1).padStart(2, '0')}</div>
      <div className="grid min-w-0 gap-0.5"><div className="font-bold text-navy dark:text-white">{analysis.modelLabel}</div><Muted>{analysis.customerName || 'Cliente sin informar'} · {analysis.serialNumber || 'Sin serie'}</Muted><Muted>Prom. {integerFormat.format(analysis.averageCopies)} · óptimo {integerFormat.format(analysis.optimalMonthly)}</Muted></div>
      <div className={cn('text-lg font-bold tabular-nums', tones[tone].accent)}>{Math.round(analysis.ratio * 100)}%</div>
    </div>)}</div>}
  </div>;
}

function MaintenanceSubsetPanel({
  title,
  description,
  analyses,
  tone,
  metric,
  detail,
  empty = 'No hay equipos en esta lista.',
  exportKind,
  onExport,
  exporting,
}: {
  title: string;
  description: string;
  analyses: readonly MaintenanceAnalysis[];
  tone: string;
  metric: (analysis: MaintenanceAnalysis) => string;
  detail: (analysis: MaintenanceAnalysis) => string;
  empty?: string;
  exportKind: MaintenanceExportKind;
  onExport?: (analyses: readonly MaintenanceAnalysis[], kind: MaintenanceExportKind) => void;
  exporting?: boolean;
}) {
  return <div className={cn(panelClass, tones[tone].border)}>
    <PanelHeading title={title} description={description} count={analyses.length} exportKind={exportKind} analyses={analyses} onExport={onExport} exporting={exporting} />
    {analyses.length === 0 ? <Muted className="text-sm">{empty}</Muted> : <div className="grid max-h-96 gap-3 overflow-y-auto pr-1">{analyses.map((analysis, index) => <div className={rowClass} key={`${analysis.serialNumber}-${analysis.modelLabel}-${index}`}>
      <div className="font-mono text-xs text-ink-2 dark:text-[#9fb2d1]">{String(index + 1).padStart(2, '0')}</div>
      <div className="grid min-w-0 gap-0.5"><div className="font-bold text-navy dark:text-white">{analysis.modelLabel}</div><Muted>{detail(analysis)}</Muted></div>
      <div className={cn('text-sm font-bold tabular-nums', tones[tone].accent)}>{metric(analysis)}</div>
    </div>)}</div>}
  </div>;
}
