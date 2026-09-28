import type { MaintenanceAnalysis } from './analysis';
import { buildMaintenanceExecutiveSummary } from './maintenance-summary';

export type MaintenanceExportKind = 'critical' | 'attention' | 'unrecognized' | 'zero' | 'recommended';

type MaintenanceExecutiveSummaryProps = {
  analyses: readonly MaintenanceAnalysis[];
  onExport?: (analyses: readonly MaintenanceAnalysis[], kind: MaintenanceExportKind) => void;
  onPrint?: () => void;
};

const integerFormat = new Intl.NumberFormat('es-PY', { maximumFractionDigits: 0 });

export default function MaintenanceExecutiveSummary({ analyses, onExport, onPrint }: MaintenanceExecutiveSummaryProps) {
  const summary = buildMaintenanceExecutiveSummary(analyses);
  if (summary.total === 0) return null;

  return (
    <section className="sales-card maintenance-executive-card" aria-label="Tablero ejecutivo de mantenimiento">
      <div className="card-heading">
        <div><div className="eyebrow">TABLERO EJECUTIVO</div><h2>Estado del parque</h2><p className="form-hint">Lectura priorizada de las mismas reglas y períodos usados en el análisis por equipo.</p></div>
        <div className="maintenance-executive-heading-actions">
          <span className="muted-note">{integerFormat.format(summary.total)} equipos analizados</span>
          {onPrint ? <button className="secondary-button" type="button" onClick={onPrint}>Imprimir resumen PDF</button> : null}
        </div>
      </div>

      <div className="maintenance-executive-kpis">
        <SummaryKpi label="Normal" value={summary.normal} tone="normal" detail="Dentro del óptimo dinámico" />
        <SummaryKpi label="Críticos" value={summary.critical} tone="critical" detail="Requieren intervención" trend={summary.criticalTrend} />
        <SummaryKpi label="Atención" value={summary.attention} tone="attention" detail="Revisión preventiva" />
        <SummaryKpi label="Sin mapeo" value={summary.unrecognized} tone="unrecognized" detail="Configurar regla" />
        <SummaryKpi label="Contador en cero" value={summary.zeroCounters} tone="idle" detail="Auditar telemetría" />
        <SummaryKpi label="Sobre el óptimo" value={summary.overworked} tone="overworked" detail="Ratio mayor a 1" />
      </div>

      <div className="maintenance-executive-grid">
        <PriorityList
          title="Intervención prioritaria"
          description="Todos los equipos críticos, ordenados por ratio."
          analyses={summary.urgentAll}
          tone="critical"
          empty="No hay equipos críticos en la ventana seleccionada."
          exportKind="critical"
          onExport={onExport}
        />
        <PriorityList
          title="Seguimiento preventivo"
          description="Todos los equipos en atención, ordenados por ratio."
          analyses={summary.cautionAll}
          tone="attention"
          empty="No hay equipos en atención en la ventana seleccionada."
          exportKind="attention"
          onExport={onExport}
        />
      </div>

      <div className="maintenance-secondary-panels">
        {summary.unrecognizedList.length > 0 ? <MaintenanceSubsetPanel
          title="Equipos no reconocidos"
          description="No tienen una regla de vida útil asociada. Configurá el modelo antes de usar el resultado como límite operativo."
          analyses={summary.unrecognizedList}
          tone="unrecognized"
          metric={() => 'SIN REGLA'}
          detail={(analysis) => `${analysis.modelLabel} · ${analysis.customerName || 'Cliente sin informar'}`}
          exportKind="unrecognized"
          onExport={onExport}
        /> : null}
        {summary.zeroList.length > 0 ? <MaintenanceSubsetPanel
          title="Equipos con contador en cero"
          description="Equipos sin copias promedio en la ventana. Revisá telemetría, conectividad o baja operativa."
          analyses={summary.zeroList}
          tone="idle"
          metric={() => '0 COPIAS'}
          detail={(analysis) => `${analysis.modelLabel} · ${analysis.customerName || 'Cliente sin informar'}`}
          exportKind="zero"
          onExport={onExport}
        /> : null}
      </div>

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
        onExport={onExport}
      />

      <div className="maintenance-insight-panel">
        <div><div className="eyebrow">PATRONES DETECTADOS</div><h3>Lectura operativa</h3></div>
        <ul>{summary.insights.map((insight) => <li key={insight}>{insight}</li>)}</ul>
      </div>
    </section>
  );
}

function SummaryKpi({ label, value, tone, detail, trend }: { label: string; value: number; tone: string; detail: string; trend?: readonly { period: string; count: number }[] }) {
  return <div className={`maintenance-executive-kpi ${tone}`}>
    <div className="maintenance-executive-kpi-heading">
      <span>{label}</span>
      {trend && trend.length >= 2 ? <CriticalTrend trend={trend} /> : null}
    </div>
    <strong>{integerFormat.format(value)}</strong>
    <small>{detail}</small>
  </div>;
}

function CriticalTrend({ trend }: { trend: readonly { period: string; count: number }[] }) {
  const max = Math.max(...trend.map((item) => item.count), 1);
  const points = trend.map((item, index) => {
    const x = trend.length === 1 ? 0 : (index / (trend.length - 1)) * 64;
    const y = 22 - (item.count / max) * 20;
    return `${x},${y}`;
  }).join(' ');
  const label = trend.map((item) => `${item.period}: ${item.count}`).join(' · ');
  return <svg className="maintenance-critical-trend" viewBox="0 0 64 24" role="img" aria-label={`Tendencia de críticos por período: ${label}`}>
    <polyline fill="none" points={points} />
  </svg>;
}

function PriorityList({
  title,
  description,
  analyses,
  tone,
  empty,
  exportKind,
  onExport,
}: {
  title: string;
  description: string;
  analyses: readonly MaintenanceAnalysis[];
  tone: string;
  empty: string;
  exportKind: MaintenanceExportKind;
  onExport?: (analyses: readonly MaintenanceAnalysis[], kind: MaintenanceExportKind) => void;
}) {
  return <div className={`maintenance-priority-panel ${tone}`}>
    <div className="maintenance-priority-heading">
      <div><h3>{title}</h3><p>{description}</p></div>
      <div className="maintenance-panel-heading-actions"><span>{analyses.length}</span>{onExport && analyses.length > 0 ? <button className="secondary-button maintenance-download-button" type="button" onClick={() => onExport(analyses, exportKind)}>Descargar XLSX</button> : null}</div>
    </div>
    {analyses.length === 0 ? <p className="maintenance-priority-empty">{empty}</p> : <div className="maintenance-priority-list">{analyses.map((analysis, index) => <div className="maintenance-priority-row" key={`${analysis.serialNumber}-${analysis.modelLabel}-${index}`}>
      <span className="maintenance-priority-index">{String(index + 1).padStart(2, '0')}</span>
      <div><strong>{analysis.modelLabel}</strong><small>{analysis.customerName || 'Cliente sin informar'} · {analysis.serialNumber || 'Sin serie'}</small><small>Prom. {integerFormat.format(analysis.averageCopies)} · óptimo {integerFormat.format(analysis.optimalMonthly)}</small></div>
      <b>{Math.round(analysis.ratio * 100)}%</b>
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
}) {
  return <div className={`maintenance-subset-panel ${tone}`}>
    <div className="maintenance-priority-heading">
      <div><h3>{title}</h3><p>{description}</p></div>
      <div className="maintenance-panel-heading-actions"><span>{analyses.length}</span>{onExport && analyses.length > 0 ? <button className="secondary-button maintenance-download-button" type="button" onClick={() => onExport(analyses, exportKind)}>Descargar XLSX</button> : null}</div>
    </div>
    {analyses.length === 0 ? <p className="maintenance-priority-empty">{empty}</p> : <div className="maintenance-subset-list">{analyses.map((analysis, index) => <div className="maintenance-subset-row" key={`${analysis.serialNumber}-${analysis.modelLabel}-${index}`}>
      <span className="maintenance-priority-index">{String(index + 1).padStart(2, '0')}</span>
      <div><strong>{analysis.modelLabel}</strong><small>{detail(analysis)}</small></div>
      <b>{metric(analysis)}</b>
    </div>)}</div>}
  </div>;
}
