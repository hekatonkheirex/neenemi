import type { MpsAnalysis } from './analysis';
import type { MpsModel } from './repository';
import { ExportButton, PrintButton } from '../../core/ActionButtons';
import { Badge } from '../../core/ui/badge';
import { Button } from '../../core/ui/button';
import { Card, CardHeader, Muted } from '../../core/ui/card';
import { Table, TableBody, TableCell, TableHead, TableHeader, TableRow } from '../../core/ui/table';

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
    <Card className="min-w-0">
      <CardHeader eyebrow="FICHA TÉCNICA" title="Especificaciones de fábrica" aside={
        <div className="flex flex-wrap items-center gap-2">
          <Badge>{model.isEditable ? 'Perfil manual' : 'Fuente importada'}</Badge>
          <ExportButton busy={exportingConsumables} busyLabel="Preparando…" onClick={onExportConsumables} disabled={model.consumables.length === 0}>Exportar consumibles</ExportButton>
        </div>
      } />
      <Muted>Datos del perfil actual y rendimiento declarado de sus componentes.</Muted>
      <dl className="m-0 grid gap-3 sm:grid-cols-2 xl:grid-cols-3">
        <ProfileFact label="Marca" value={model.brand} />
        <ProfileFact label="Modelo" value={model.modelLabel} />
        <ProfileFact label="Velocidad" value={model.speedPpm === null ? 'No informada' : `${integerFormat.format(model.speedPpm)} ppm`} />
        <ProfileFact label="Impresión" value={model.isColor ? 'Color' : 'Monocromática'} />
        <ProfileFact label="Rango recomendado" value={`${integerFormat.format(model.recVolumeMin)}–${integerFormat.format(model.recVolumeMax)} pág./mes`} />
      </dl>
      <div className="flex flex-wrap items-center justify-between gap-3 border-t border-navy/10 pt-4 dark:border-sky/20">
        <div className="grid gap-1"><h3 className="m-0 text-sm font-bold text-navy dark:text-white">Rendimiento original</h3><Muted>Componentes guardados en el perfil MPS.</Muted></div>
        <Badge>{model.consumables.length} componentes</Badge>
      </div>
      <Table className="min-w-[32rem]" aria-label="Ficha de consumibles">
        <TableHeader><TableRow><TableHead>Consumible</TableHead><TableHead>Tipo / color</TableHead><TableHead className="text-right">Rendimiento</TableHead><TableHead>SKU</TableHead></TableRow></TableHeader>
        <TableBody>{model.consumables.map((consumable) => <TableRow key={consumable.id}>
          <TableCell className="max-w-64 break-words font-semibold">{consumable.name}</TableCell>
          <TableCell>{consumableTypeLabels[consumable.type] ?? consumable.type} · {consumableColorLabels[consumable.color] ?? consumable.color}</TableCell>
          <TableCell className="text-right whitespace-nowrap tabular-nums">{integerFormat.format(consumable.yieldPages)} pág.</TableCell>
          <TableCell className="break-all text-xs">{consumable.sku || 'Sin SKU'}</TableCell>
        </TableRow>)}</TableBody>
      </Table>
    </Card>

    <Card className="min-w-0">
      <CardHeader eyebrow="ANÁLISIS EJECUTIVO" title="Demanda estimada" aside={
        <div className="flex flex-wrap gap-2">
          <PrintButton busy={printing} onClick={onPrint} disabled={!analysis} />
          <ExportButton busy={exporting} busyLabel="Preparando…" onClick={onExport} disabled={!analysis}>Exportar análisis</ExportButton>
        </div>
      } />
      <Muted>Lectura de planificación para el volumen mensual aplicado, acumulada a cinco años.</Muted>
      {analysis ? <>
        <div className="grid gap-3 sm:grid-cols-2 xl:grid-cols-4">
          <AnalysisKpi label="Páginas año 1" value={integerFormat.format(analysis.annualPages)} note={`${integerFormat.format(analysis.paperReams)} resmas equivalentes`} accent />
          <AnalysisKpi label="Unidades a 5 años" value={integerFormat.format(analysis.totalUnitsFiveYears)} note={`${decimalFormat.format(analysis.totalCyclesFiveYears)} ciclos acumulados`} />
          <AnalysisKpi label="Insumos críticos" value={String(analysis.criticalConsumables)} note="con 3 o más ciclos al año 3" />
          <AnalysisKpi label="Kits preventivos" value={String(analysis.preventiveKits)} note="componentes no tóner hasta año 5" />
        </div>
        <div className="grid items-start gap-4 lg:grid-cols-[minmax(0,1.25fr)_minmax(0,0.75fr)]">
          <div className="grid min-w-0 gap-4 rounded-xl border border-navy/10 p-4 dark:border-sky/20">
            <div className="flex flex-wrap items-start justify-between gap-2">
              <div className="grid gap-1"><h3 className="m-0 text-sm font-bold text-navy dark:text-white">Componentes con mayor demanda</h3><Muted>Ordenados por unidades acumuladas a cinco años.</Muted></div>
              <Badge>Top {analysis.ranking.length}</Badge>
            </div>
            <div className="grid gap-4" role="list" aria-label="Ranking de demanda de consumibles">
              {analysis.ranking.map((entry, index) => <div className="flex min-w-0 items-start gap-3" role="listitem" key={entry.id}>
                <Badge>{String(index + 1).padStart(2, '0')}</Badge>
                <div className="grid min-w-0 flex-1 gap-2">
                  <div className="flex flex-wrap items-baseline justify-between gap-x-3 gap-y-1"><strong className="break-words text-xs text-navy dark:text-white">{entry.name}</strong><Muted className="tabular-nums">{integerFormat.format(entry.units)} ud. · {decimalFormat.format(entry.share * 100)}%</Muted></div>
                  <div className="h-1.5 overflow-hidden rounded-full bg-navy/10 dark:bg-sky/15" aria-hidden="true"><div className="h-full rounded-full bg-sky" style={{ width: `${Math.max(4, entry.units / maximumRankingUnits * 100)}%` }} /></div>
                </div>
              </div>)}
            </div>
          </div>
          <div className="grid min-w-0 gap-4 rounded-xl border border-navy/10 p-4 dark:border-sky/20">
            <Badge className="w-fit whitespace-normal" tone={analysis.volumeStatus === 'optimal' ? 'success' : 'warning'}>{volumeStatusLabel(analysis)}</Badge>
            <Muted>{volumeStatusDescription(analysis)}</Muted>
            <dl className="m-0 grid gap-3">
              <ProfileFact label="Volumen aplicado" value={`${integerFormat.format(analysis.monthlyVolume)} pág./mes`} />
              <ProfileFact label="Páginas periodo completo" value={integerFormat.format(analysis.fiveYearPages)} />
              <ProfileFact label="Recomendación" value="Contrastar con consumo real" />
            </dl>
          </div>
        </div>
        <Muted>Excel incluye el resumen ejecutivo, la ficha técnica y el detalle anual. Imprimir / PDF guarda el informe con las opciones locales de Electron; si se abre en navegador, muestra el diálogo de impresión. No se envía fuera del equipo.</Muted>
      </> : <Muted className="rounded-xl border border-dashed border-navy/20 p-6 text-center dark:border-sky/30">Calcula una proyección para habilitar el análisis ejecutivo y la exportación.</Muted>}
    </Card>
  </>;
}

function ProfileFact({ label, value }: { label: string; value: string }) {
  return <div className="grid content-start gap-1 rounded-xl border border-navy/10 bg-paper/60 p-3 dark:border-sky/15 dark:bg-navy/30"><dt className="text-xs text-ink-2 dark:text-[#9fb2d1]">{label}</dt><dd className="m-0 break-words text-sm font-semibold text-navy dark:text-white">{value}</dd></div>;
}

function AnalysisKpi({ label, value, note, accent = false }: { label: string; value: string; note: string; accent?: boolean }) {
  return <div className={`grid min-w-0 content-start gap-2 rounded-xl border p-4 [container-type:inline-size] ${accent ? 'border-sky/40 bg-sky/10' : 'border-navy/10 bg-paper/60 dark:border-sky/20 dark:bg-navy/30'}`}><Muted>{label}</Muted><strong className="break-all text-[clamp(1.1rem,10cqi,1.75rem)] font-bold tabular-nums text-navy dark:text-white">{value}</strong><Muted>{note}</Muted></div>;
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
