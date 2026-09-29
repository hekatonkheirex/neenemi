import type { MpsAnalysis } from './analysis';
import type { MpsModel, MpsProjection } from './repository';

type MpsPrintReportProps = {
  model: MpsModel;
  analysis: MpsAnalysis;
  projections: readonly MpsProjection[];
};

const integerFormat = new Intl.NumberFormat('es-PY', { maximumFractionDigits: 0 });
const consumableTypeLabels: Record<string, string> = {
  toner: 'Tóner / Cartucho de tinta',
  drum: 'Unidad de tambor',
  developer: 'Unidad de revelado',
  fuser: 'Unidad de fusor',
  belt: 'Banda de transferencia',
  roller: 'Kit de rodillos',
  other: 'Unidad auxiliar',
};

export default function MpsPrintReport({ model, analysis, projections }: MpsPrintReportProps) {
  const generatedAt = new Intl.DateTimeFormat('es-PY', {
    dateStyle: 'medium',
    timeStyle: 'short',
  }).format(new Date());

  return (
    <section className="mps-print-report" aria-label="Informe MPS para impresión">
      <div className="mps-print-accent" aria-hidden="true" />
      <div className="mps-print-eyebrow">DATA SYSTEMS / INFORME MPS</div>
      <div className="mps-print-title-row">
        <div>
          <h1>Estimación de insumos y suministros Canon</h1>
          <p>Proyección local de reemplazos para planificación comercial y técnica.</p>
        </div>
        <div className="mps-print-brand">MPS</div>
      </div>

      <div className="mps-print-divider" />

      <div className="mps-print-meta-grid">
        <section className="mps-print-meta-card">
          <h2>Información de hardware</h2>
          <dl>
            <div><dt>Marca / modelo</dt><dd>{model.brand} {model.modelLabel}</dd></div>
            <div><dt>Velocidad de impresión</dt><dd>{model.speedPpm === null ? 'N/D' : `${integerFormat.format(model.speedPpm)} ppm`} · {model.isColor ? 'Color' : 'Monocromático'}</dd></div>
            <div><dt>Ciclo mensual de fábrica</dt><dd>{integerFormat.format(model.recVolumeMin)} - {integerFormat.format(model.recVolumeMax)} pág.</dd></div>
          </dl>
        </section>

        <section className="mps-print-meta-card">
          <h2>Parámetros de simulación</h2>
          <dl>
            <div><dt>Volumen mensual del cliente</dt><dd>{integerFormat.format(analysis.monthlyVolume)} páginas/mes</dd></div>
            <div><dt>Volumen anual consolidado</dt><dd>{integerFormat.format(analysis.annualPages)} páginas/año</dd></div>
            <div><dt>Proyección máxima simulada</dt><dd>{integerFormat.format(analysis.fiveYearPages)} páginas · periodo de 5 años</dd></div>
          </dl>
        </section>
      </div>

      <table className="mps-print-table">
        <thead>
          <tr>
            <th>Suministro / repuesto</th>
            <th>Categoría</th>
            <th>Rendimiento</th>
            <th>Año 1</th>
            <th>Año 2</th>
            <th>Año 3</th>
            <th>Año 4</th>
            <th>Año 5</th>
          </tr>
        </thead>
        <tbody>
          {projections.map((projection) => (
            <tr key={projection.consumable.id}>
              <td><strong>{projection.consumable.name} ({projection.consumable.color.toLocaleUpperCase('es-PY')})</strong>{projection.consumable.sku ? <small>{projection.consumable.sku}</small> : null}</td>
              <td>{consumableTypeLabels[projection.consumable.type] ?? projection.consumable.type}</td>
              <td className="align-center">{integerFormat.format(projection.consumable.yieldPages)} pág.</td>
              {Array.from({ length: 5 }, (_, index) => getYear(projection, index + 1)).map((year) => (
                <td className="align-center" key={year.year}>
                  <strong>{formatReplacements(year.replacements)}</strong>
                  <small>({integerFormat.format(year.units)} ud.)</small>
                </td>
              ))}
            </tr>
          ))}
        </tbody>
      </table>

      <div className="mps-print-notes">
        <p>* Nota: los cálculos se estiman cruzando la información declarada por Canon bajo el estándar ISO/IEC 19752/19798.</p>
        <p>Los resultados modelan de forma sugerida la frecuencia de desgaste y re-pedidos, sirviendo para la estructuración de costos en ofertas MPS.</p>
      </div>
      <footer>Generado localmente por DCSS Suite · {generatedAt}</footer>
    </section>
  );
}

function getYear(projection: MpsProjection, year: number): { year: number; replacements: number; units: number } {
  return projection.years.find((entry) => entry.year === year) ?? { year, replacements: 0, units: 0 };
}

function formatReplacements(value: number): string {
  if (value === 0) return '0';
  if (value < 0.1) return '<0,1';
  return value.toFixed(1).replace('.', ',');
}
