import { useEffect, useState } from 'react';
import { readJson, toErrorMessage } from '../../core/http';
import { Button } from '../../core/ui/button';
import { Card, CardHeader, Muted } from '../../core/ui/card';
import { Badge } from '../../core/ui/badge';
import { StatusLine } from '../../core/ui/status-line';
import { LegacyHorizontalStackedBars, type LegacyChartSeries } from '../consumibles/LegacyCharts';
import type { MaintenanceAnalysis } from './analysis';
import { buildMaintenanceExecutiveSummary } from './maintenance-summary';

const categories = [
  { label: 'Normal', key: 'normal', color: '#2f8f5b' },
  { label: 'Críticos', key: 'critical', color: '#d92d20' },
  { label: 'Atención', key: 'attention', color: '#e08a00' },
  { label: 'Sin mapeo', key: 'unrecognized', color: '#6b5bd6' },
  { label: 'Contador en cero', key: 'zeroCounters', color: '#73869f' },
  { label: 'Sobre el óptimo', key: 'overworked', color: '#ff6b00' },
] as const;
const labels = categories.map((category) => category.label);
const integerFormat = new Intl.NumberFormat('es-PY', { maximumFractionDigits: 0 });

type AnalysisState =
  | { status: 'loading' }
  | { status: 'error'; message: string }
  | { status: 'ready'; total: number; series: LegacyChartSeries[] };

export default function DashboardMaintenanceChart({ onNavigate }: { onNavigate: (id: string) => void }) {
  const [state, setState] = useState<AnalysisState>({ status: 'loading' });

  useEffect(() => {
    const controller = new AbortController();
    const load = async () => {
      try {
        const analyses = await readJson<MaintenanceAnalysis[]>(fetch('/api/maintenance/analysis', { signal: controller.signal }));
        if (controller.signal.aborted) return;
        const summary = buildMaintenanceExecutiveSummary(analyses);
        // One nonzero value per row keeps the six indicators independent, not stacked.
        const series = categories.map((category, categoryIndex) => ({
          label: category.label,
          color: category.color,
          values: categories.map((_, rowIndex) => rowIndex === categoryIndex ? summary[category.key] : 0),
        }));
        setState({ status: 'ready', total: summary.total, series });
      } catch (error: unknown) {
        if (!controller.signal.aborted) setState({ status: 'error', message: toErrorMessage(error) });
      }
    };
    void load();
    return () => controller.abort();
  }, []);

  return <Card className="min-w-0 grid-cols-1 grid-rows-[auto_auto_1fr] content-start [overflow-wrap:anywhere]" aria-busy={state.status === 'loading'}>
    <CardHeader
      eyebrow="Gestor de mantenimiento"
      title="Estado del parque"
      aside={state.status === 'ready' ? <Badge>{integerFormat.format(state.total)} equipos analizados</Badge> : undefined}
    />
    <Muted>Los seis indicadores del resumen ejecutivo, con las mismas reglas del Gestor de mantenimiento.</Muted>
    {state.status === 'loading' ? <StatusLine state="pending">Cargando análisis de mantenimiento…</StatusLine> : null}
    {state.status === 'error' ? <StatusLine state="error">No se pudo cargar el análisis de mantenimiento: {state.message}</StatusLine> : null}
    {state.status === 'ready' && state.total === 0 ? <Muted role="status">No hay equipos cargados en Gestor de mantenimiento.</Muted> : null}
    {state.status === 'ready' && state.total > 0 ? <>
      <div className="min-w-0 grid content-center overflow-x-auto [&_figcaption]:hidden [&_svg]:min-h-0" role="region" aria-label="Gráfico desplazable del estado del parque" tabIndex={0}>
        <div className="min-w-[600px]">
          <LegacyHorizontalStackedBars
            labels={labels}
            series={state.series}
            valueFormatter={(value) => integerFormat.format(value)}
            ariaLabel="Estado del parque: cantidad de equipos por indicador"
          />
        </div>
      </div>
      <Muted>El análisis usa los últimos 3 meses disponibles por equipo (o menos si no hay 3), no todo el historial.</Muted>
      <Muted>Contador en cero y Sobre el óptimo pueden coincidir con otras categorías. Las barras son independientes: sus cantidades no se suman para obtener el total de equipos.</Muted>
    </> : null}
    <div className="min-w-0"><Button variant="outline" className="max-w-full whitespace-normal" onClick={() => onNavigate('mantenimiento')}>Abrir Gestor de mantenimiento</Button></div>
  </Card>;
}
