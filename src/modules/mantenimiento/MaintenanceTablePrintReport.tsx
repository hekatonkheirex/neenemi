import type { MaintenanceAnalysis } from './analysis';

export type MaintenanceTablePrintReportProps = {
  analyses: readonly MaintenanceAnalysis[];
  sourceName: string | null;
  analysisMonths: number;
};

const integerFormat = new Intl.NumberFormat('es-PY', { maximumFractionDigits: 0 });

export default function MaintenanceTablePrintReport({ analyses, sourceName, analysisMonths }: MaintenanceTablePrintReportProps) {
  return (
    <section className="maintenance-print-table-report" aria-label="Expedientes técnicos de mantenimiento">
      <div className="eyebrow">DATA SYSTEMS / GESTOR DE MANTENIMIENTO</div>
      <h1>Expedientes técnicos</h1>
      <p className="maintenance-print-report-meta">
        Fuente: {sourceName ?? 'Base compartida'} · Últimos {analysisMonths} meses · {integerFormat.format(analyses.length)} equipos seleccionados
      </p>
      <table className="maintenance-print-table">
        <colgroup>
          <col style={{ width: '13%' }} /><col style={{ width: '16%' }} /><col style={{ width: '12%' }} />
          <col style={{ width: '10%' }} /><col style={{ width: '12%' }} /><col style={{ width: '10%' }} /><col style={{ width: '27%' }} />
        </colgroup>
        <thead><tr><th>Cliente</th><th>Modelo de equipo</th><th>Nº serie</th><th className="align-right">Prom. copias</th><th className="align-right">Límite desgastado</th><th>Estado</th><th>Acción sugerida</th></tr></thead>
        <tbody>{analyses.map((analysis) => (
          <tr key={`${analysis.serialNumber}::${analysis.modelLabel}`}>
            <td>{analysis.customerName || 'Sin cliente'}{analysis.contractReference ? <><br />OV {analysis.contractReference}</> : null}</td>
            <td>{analysis.modelLabel}</td>
            <td>{analysis.serialNumber || 'Sin serie'}</td>
            <td className="align-right">{integerFormat.format(analysis.averageCopies)}</td>
            <td className="align-right">{integerFormat.format(analysis.optimalMonthly)} ({Math.round(analysis.appliedWaste * 100)}%)</td>
            <td>{analysis.status}</td>
            <td>{analysis.recommendedAction}</td>
          </tr>
        ))}</tbody>
      </table>
    </section>
  );
}
