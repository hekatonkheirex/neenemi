import type { MpsAnalysis } from './analysis';
import type { MpsModel } from './repository';
import { ExportButton } from '../../core/ActionButtons';

type MpsAnalysisPanelsProps = {
  model: MpsModel;
  analysis: MpsAnalysis | null;
  exporting: boolean;
  exportingConsumables: boolean;
  printing: boolean;
  onExport: () => void;
  onExportConsumables: () => void;
  onPrint: () => void;
};

const integerFormat = new Intl.NumberFormat('es-PY', { maximumFractionDigits: 0 });
const decimalFormat = new Intl.NumberFormat('es-PY', { maximumFractionDigits: 1 });

const consumableTypeLabels: Record<string, string> = {
  toner: 'Tóner',
  drum: 'Tambor',
  developer: 'Revelador',
  fuser: 'Fusor',
  belt: 'Banda',
  roller: 'Rodillo',
  other: 'Otro',
};

const consumableColorLabels: Record<string, string> = {
  black: 'Negro',
  cyan: 'Cian',
  magenta: 'Magenta',
  yellow: 'Amarillo',
  monochrome: 'Monocromo',
  other: 'Otro',
};

export default function MpsAnalysisPanels({ model, analysis, exporting, exportingConsumables, printing, onExport, onExportConsumables, onPrint }: MpsAnalysisPanelsProps) {
  const maximumRankingUnits = Math.max(...(analysis?.ranking.map((entry) => entry.units) ?? [1]), 1);

  return <>
    <section className="sales-card mps-profile-card">
      <div className="card-heading">
        <div>
          <div className="eyebrow">FICHA TÉCNICA</div>
          <h2>Especificaciones de fábrica</h2>
          <p className="mps-card-subtitle">Datos del perfil actual y rendimiento declarado de sus componentes.</p>
        </div>
        <div className="mps-analysis-actions">
          <ExportButton busy={exportingConsumables} busyLabel="Preparando…" onClick={onExportConsumables} disabled={model.consumables.length === 0}>Exportar XLSX</ExportButton>
          <span className={`mps-profile-source ${model.isEditable ? 'manual' : 'imported'}`}>
            {model.isEditable ? 'Perfil manual' : 'Fuente importada'}
          </span>
        </div>
      </div>

      <div className="mps-profile-facts">
        <div><span>Marca</span><strong>{model.brand}</strong></div>
        <div><span>Modelo</span><strong>{model.modelLabel}</strong></div>
        <div><span>Velocidad</span><strong>{model.speedPpm === null ? 'No informada' : `${integerFormat.format(model.speedPpm)} ppm`}</strong></div>
        <div><span>Impresión</span><strong>{model.isColor ? 'Color' : 'Monocromática'}</strong></div>
        <div><span>Rango recomendado</span><strong>{integerFormat.format(model.recVolumeMin)}–{integerFormat.format(model.recVolumeMax)} pág./mes</strong></div>
      </div>

      <div className="mps-profile-consumables">
        <div className="mps-profile-section-heading"><div><h3>Rendimiento original</h3><p>Componentes guardados en el perfil MPS.</p></div><span>{model.consumables.length} componentes</span></div>
        <div className="mps-profile-consumable-list">
          {model.consumables.map((consumable) => <div className="mps-profile-consumable" key={consumable.id}>
            <div className="mps-profile-consumable-name"><strong>{consumable.name}</strong><small>{consumableTypeLabels[consumable.type] ?? consumable.type} · {consumableColorLabels[consumable.color] ?? consumable.color}</small></div>
            <div className="mps-profile-consumable-value"><strong>{integerFormat.format(consumable.yieldPages)} pág.</strong><small>{consumable.sku || 'Sin SKU'}</small></div>
          </div>)}
        </div>
      </div>
    </section>

    <section className="sales-card mps-executive-card">
      <div className="card-heading">
        <div>
          <div className="eyebrow">ANÁLISIS EJECUTIVO</div>
          <h2>Demanda estimada</h2>
          <p className="mps-card-subtitle">Lectura de planificación para el volumen mensual aplicado, acumulada a cinco años.</p>
        </div>
        <div className="mps-analysis-actions">
          <button className="secondary-button" type="button" onClick={onPrint} disabled={!analysis || printing}>{printing ? 'Preparando…' : 'Imprimir / PDF'}</button>
          <ExportButton busy={exporting} busyLabel="Preparando…" onClick={onExport} disabled={!analysis}>Exportar Excel</ExportButton>
        </div>
      </div>

      {analysis ? <>
        <div className="mps-analysis-kpis">
          <div className="mps-analysis-kpi accent"><span>Páginas año 1</span><strong>{integerFormat.format(analysis.annualPages)}</strong><small>{integerFormat.format(analysis.paperReams)} resmas equivalentes</small></div>
          <div className="mps-analysis-kpi"><span>Unidades a 5 años</span><strong>{integerFormat.format(analysis.totalUnitsFiveYears)}</strong><small>{decimalFormat.format(analysis.totalCyclesFiveYears)} ciclos acumulados</small></div>
          <div className="mps-analysis-kpi"><span>Insumos críticos</span><strong>{analysis.criticalConsumables}</strong><small>con 3 o más ciclos al año 3</small></div>
          <div className="mps-analysis-kpi"><span>Kits preventivos</span><strong>{analysis.preventiveKits}</strong><small>componentes no tóner hasta año 5</small></div>
        </div>

        <div className="mps-analysis-grid">
          <div className="mps-ranking-panel">
            <div className="mps-profile-section-heading"><div><h3>Componentes con mayor demanda</h3><p>Ordenados por unidades acumuladas a cinco años.</p></div><span>Top {analysis.ranking.length}</span></div>
            <ol className="mps-ranking-list">
              {analysis.ranking.map((entry, index) => <li key={entry.id}>
                <span className="mps-ranking-index">{String(index + 1).padStart(2, '0')}</span>
                <div className="mps-ranking-content"><div className="mps-ranking-label"><strong>{entry.name}</strong><span>{integerFormat.format(entry.units)} ud. · {decimalFormat.format(entry.share * 100)}%</span></div><div className="mps-ranking-track"><span style={{ width: `${Math.max(4, entry.units / maximumRankingUnits * 100)}%` }} /></div></div>
              </li>)}
            </ol>
          </div>

          <div className="mps-analysis-note-panel">
            <div className={`mps-volume-insight ${analysis.volumeStatus}`}><strong>{volumeStatusLabel(analysis)}</strong><span>{volumeStatusDescription(analysis)}</span></div>
            <div className="mps-analysis-note-list"><div><span>Volumen aplicado</span><strong>{integerFormat.format(analysis.monthlyVolume)} pág./mes</strong></div><div><span>Páginas periodo completo</span><strong>{integerFormat.format(analysis.fiveYearPages)}</strong></div><div><span>Recomendación</span><strong>Contrastar con consumo real</strong></div></div>
          </div>
        </div>
        <p className="scope-note mps-export-note">Excel incluye el resumen ejecutivo, la ficha técnica y el detalle anual. Imprimir / PDF guarda el informe con las opciones locales de Electron; si se abre en navegador, muestra el diálogo de impresión. No se envía fuera del equipo.</p>
      </> : <div className="mps-analysis-empty">Calcula una proyección para habilitar el análisis ejecutivo y la exportación.</div>}
    </section>
  </>;
}

function volumeStatusLabel(analysis: MpsAnalysis): string {
  if (analysis.volumeStatus === 'low') return 'Volumen por debajo del rango';
  if (analysis.volumeStatus === 'high') return 'Volumen por encima del rango';
  return 'Volumen dentro del rango';
}

function volumeStatusDescription(analysis: MpsAnalysis): string {
  if (analysis.volumeStatus === 'low') return 'La demanda está debajo del ciclo mensual recomendado por el fabricante.';
  if (analysis.volumeStatus === 'high') return 'La demanda supera el ciclo mensual recomendado y puede acelerar el desgaste.';
  return 'La demanda queda dentro del ciclo mensual recomendado por el fabricante.';
}
