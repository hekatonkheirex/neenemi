import { useEffect, useState } from 'react';
import { readJson, toErrorMessage } from '../../core/http';
import { Button } from '../../core/ui/button';
import { Card, CardHeader, Muted } from '../../core/ui/card';
import { StatusLine } from '../../core/ui/status-line';
import { AnnualActivityChart, AnnualCostChart } from './TravelAnnualCharts';
import type { HistoricalSummary } from './types';

type HistoryState =
  | { status: 'loading' }
  | { status: 'error'; message: string }
  | { status: 'ready'; summaries: HistoricalSummary[] };

export default function DashboardTravelCharts({ onNavigate }: { onNavigate: (id: string) => void }) {
  const [state, setState] = useState<HistoryState>({ status: 'loading' });

  useEffect(() => {
    const controller = new AbortController();
    readJson<HistoricalSummary[]>(fetch('/api/travel/historical', { signal: controller.signal }))
      .then((summaries) => {
        if (!controller.signal.aborted) setState({ status: 'ready', summaries: summaries.sort((left, right) => left.year - right.year) });
      })
      .catch((error: unknown) => {
        if (!controller.signal.aborted) setState({ status: 'error', message: toErrorMessage(error) });
      });
    return () => controller.abort();
  }, []);

  const heading = <CardHeader eyebrow="Control de viáticos" title="Actividad y costos de viajes" aside={<Button variant="outline" className="max-w-full whitespace-normal" onClick={() => onNavigate('viaticos')}>Ver Control de viáticos</Button>} />;

  if (state.status !== 'ready' || state.summaries.length === 0) {
    return <Card className="min-w-0 grid-cols-1 @[1400px]:col-span-2" aria-label="Control de viáticos · actividad y costos" aria-busy={state.status === 'loading'}>
      {heading}
      {state.status === 'loading' ? <StatusLine state="pending">Cargando actividad y costos históricos de viáticos…</StatusLine>
        : state.status === 'error' ? <StatusLine state="error">No se pudo cargar el histórico de viáticos. {state.message}</StatusLine>
          : <Muted role="status">No hay resúmenes históricos cargados en Control de viáticos.</Muted>}
    </Card>;
  }

  return <section className="grid min-w-0 gap-4 @[1400px]:col-span-2" aria-label="Control de viáticos · actividad y costos">
    {heading}
    <div className="grid min-w-0 items-stretch gap-6 lg:grid-cols-2">
      <AnnualActivityChart summaries={state.summaries} />
      <AnnualCostChart summaries={state.summaries} />
    </div>
    <Muted>Datos del histórico de Control de viáticos, sin filtros. Servicios y viajes son cantidades; la comparación de gastos usa importes reales en guaraníes. Para evaluar una reducción anual, compara años cerrados: un período en curso es un acumulado parcial, no un ahorro frente a un año completo.</Muted>
  </section>;
}
