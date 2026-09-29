import type { MaintenanceAnalysis } from './analysis';
import { buildMaintenanceExecutiveSummary } from './maintenance-summary';

type MaintenanceExecutivePrintReportProps = {
  analyses: readonly MaintenanceAnalysis[];
  sourceName: string | null;
  analysisMonths: number;
};

const integerFormat = new Intl.NumberFormat('es-PY', { maximumFractionDigits: 0 });

export default function MaintenanceExecutivePrintReport({
  analyses,
  sourceName,
  analysisMonths,
}: MaintenanceExecutivePrintReportProps) {
  const summary = buildMaintenanceExecutiveSummary(analyses);
  const generatedAt = new Intl.DateTimeFormat('es-PY', {
    dateStyle: 'medium',
    timeStyle: 'short',
  }).format(new Date());

  return (
    <section className="maintenance-executive-print-report" aria-label="Resumen ejecutivo de mantenimiento">
      <div className="eyebrow">DATA SYSTEMS / INFORME EJECUTIVO</div>
      <div className="maintenance-executive-print-title-row">
        <div>
          <h1>Dictamen y análisis del parque</h1>
          <p>Lectura local de desgaste dinámico, prioridades y eventos detectados.</p>
        </div>
        <div className="maintenance-executive-print-brand">DATA SYSTEMS</div>
      </div>

      <div className="maintenance-executive-print-meta">
        <div><span>Fuente</span><strong>{sourceName ?? 'Base compartida'}</strong></div>
        <div><span>Ventana de análisis</span><strong>Últimos {analysisMonths} meses</strong></div>
        <div><span>Emisión</span><strong>{generatedAt}</strong></div>
      </div>

      <div className="maintenance-executive-print-kpis">
        <PrintKpi label="Total analizados" value={summary.total} detail="Equipos en la ventana" />
        <PrintKpi label="Normal" value={summary.normal} detail="Dentro del óptimo dinámico" />
        <PrintKpi label="Críticos" value={summary.critical} detail="Superan el volumen base" tone="critical" />
        <PrintKpi label="Atención" value={summary.attention} detail="Revisión preventiva" tone="attention" />
        <PrintKpi label="Sin mapeo" value={summary.unrecognized} detail="Configurar regla" tone="unrecognized" />
        <PrintKpi label="Contador en cero" value={summary.zeroCounters} detail="Auditar telemetría" />
      </div>

      <section className="maintenance-executive-print-section">
        <h2>Definición de categorías</h2>
        <ul className="maintenance-executive-print-definitions">
          <li><strong>Críticos ({integerFormat.format(summary.critical)}):</strong> el promedio mensual supera el óptimo base recomendado.</li>
          <li><strong>Atención ({integerFormat.format(summary.attention)}):</strong> el promedio supera el óptimo mensual ajustado por desgaste.</li>
          <li><strong>Normal ({integerFormat.format(summary.normal)}):</strong> el promedio se mantiene dentro del límite dinámico.</li>
          <li><strong>Sin mapeo ({integerFormat.format(summary.unrecognized)}):</strong> el modelo no tiene una regla de vida útil configurada.</li>
          <li><strong>Contador en cero ({integerFormat.format(summary.zeroCounters)}):</strong> no se observan copias promedio en la ventana.</li>
        </ul>
      </section>

      <section className="maintenance-executive-print-section">
        <h2>Eventos y prioridades detectadas</h2>
        <div className="maintenance-executive-print-grid">
          <MaintenancePrintList title="Equipos críticos" analyses={summary.urgentAll} metric="ratio" empty="No hay equipos críticos." />
          <MaintenancePrintList title="Equipos en atención" analyses={summary.cautionAll} metric="ratio" empty="No hay equipos en atención." />
          <MaintenancePrintList title="Equipos no reconocidos" analyses={summary.unrecognizedList} metric="unrecognized" empty="No hay equipos sin mapeo." />
          <MaintenancePrintList title="Contadores en cero" analyses={summary.zeroList} metric="zero" empty="No hay contadores en cero." />
          <MaintenancePrintList title="Sobre el volumen óptimo recomendado" analyses={summary.recommendedExceeded} metric="recommended" empty="Ningún equipo supera el volumen recomendado." />
        </div>
      </section>

      <section className="maintenance-executive-print-section">
        <h2>Insights operativos</h2>
        <ul className="maintenance-executive-print-insights">
          {summary.insights.map((insight) => <li key={insight}>{insight}</li>)}
        </ul>
      </section>

      <section className="maintenance-executive-print-section maintenance-executive-print-methodology">
        <h2>Metodología</h2>
        <p>
          El análisis calcula el desgaste mensual de forma determinista con la fórmula
          {' '}Merma(contador) = Merma máxima × (contador / vida útil). El óptimo mensual se
          ajusta con el desgaste aplicado a cada equipo. Los datos se leen de la SQLite local
          y cada lectura conserva su archivo, hoja y fila de origen cuando esa información está disponible.
        </p>
      </section>

      <footer className="maintenance-executive-print-footer">Área de planificación y soporte · Generado localmente por DCSS Suite</footer>
    </section>
  );
}

function PrintKpi({
  label,
  value,
  detail,
  tone = '',
}: {
  label: string;
  value: number;
  detail: string;
  tone?: string;
}) {
  return <div className={`maintenance-executive-print-kpi ${tone}`}><span>{label}</span><strong>{integerFormat.format(value)}</strong><small>{detail}</small></div>;
}

function MaintenancePrintList({
  title,
  analyses,
  metric,
  empty,
}: {
  title: string;
  analyses: readonly MaintenanceAnalysis[];
  metric: 'ratio' | 'unrecognized' | 'zero' | 'recommended';
  empty: string;
}) {
  return <section className="maintenance-executive-print-list">
    <div className="maintenance-executive-print-list-heading"><h3>{title}</h3><span>{integerFormat.format(analyses.length)}</span></div>
    {analyses.length === 0 ? <p>{empty}</p> : <table>
      <thead><tr><th>#</th><th>Cliente / modelo</th><th>Serie</th><th className="align-right">Promedio</th><th className="align-right">Óptimo</th><th className="align-right">Resultado</th></tr></thead>
      <tbody>{analyses.map((analysis, index) => <tr key={`${analysis.serialNumber}-${analysis.modelLabel}-${index}`}>
        <td>{String(index + 1).padStart(2, '0')}</td>
        <td><strong>{analysis.customerName || 'Cliente sin informar'}</strong><small>{analysis.modelLabel}</small></td>
        <td>{analysis.serialNumber || 'Sin serie'}</td>
        <td className="align-right">{integerFormat.format(Math.round(analysis.averageCopies))}</td>
        <td className="align-right">{integerFormat.format(Math.round(analysis.optimalMonthly))}</td>
        <td className="align-right">{formatPrintMetric(analysis, metric)}</td>
      </tr>)}</tbody>
    </table>}
  </section>;
}

function formatPrintMetric(analysis: MaintenanceAnalysis, metric: 'ratio' | 'unrecognized' | 'zero' | 'recommended'): string {
  if (metric === 'unrecognized') return 'SIN REGLA';
  if (metric === 'zero') return '0 COPIAS';
  if (metric === 'recommended') {
    const limit = Math.round(analysis.optimalBase / 0.65);
    const exceeded = Math.round((analysis.averageCopies / limit) * 100) - 100;
    return exceeded > 0 ? `+${exceeded}%` : 'EN LÍMITE';
  }
  return `${Math.round(analysis.ratio * 100)}%`;
}
