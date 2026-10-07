import { useState } from 'react';
import { cn } from '../../core/cn';
import { Badge } from '../../core/ui/badge';
import { Card, CardHeader, Muted } from '../../core/ui/card';
import type { HistoricalSummary } from './types';

const moneyFormat = new Intl.NumberFormat('es-PY', { maximumFractionDigits: 0 });
const compactMoneyFormat = new Intl.NumberFormat('es-PY', { notation: 'compact', maximumFractionDigits: 1 });
const selectClass = 'h-10 w-full min-w-0 rounded-xl border border-navy/20 bg-white px-3 text-sm text-navy focus-visible:outline-2 focus-visible:outline-offset-2 focus-visible:outline-sky disabled:opacity-50 dark:border-sky/30 dark:bg-navy/50 dark:text-white';
const fieldClass = 'grid min-w-0 gap-1.5 text-xs font-semibold text-navy dark:text-white';
const cardClass = 'min-w-0 grid-cols-1 [overflow-wrap:anywhere]';

function compactMoney(value: number): string {
  return compactMoneyFormat.format(Math.round(value));
}

const chartArea = 'grid h-56 min-w-0 auto-cols-fr grid-flow-col items-end gap-3 border-b border-navy/15 pb-1 dark:border-sky/25';

export function AnnualActivityChart({ summaries }: { summaries: HistoricalSummary[] }) {
  const maxValue = Math.max(...summaries.flatMap((summary) => [summary.services, summary.trips]), 1);
  return (
    <Card className={cardClass}>
      <CardHeader eyebrow="Actividad" title="Servicios y viajes" aside={<Badge>Por año</Badge>} />
      <div className={chartArea} role="img" aria-label="Comparativa anual de servicios y viajes">
        {summaries.map((summary) => (
          <div className="grid h-full min-w-0 grid-rows-[minmax(0,1fr)_auto_auto] justify-items-center gap-1" key={summary.year}>
            <div className="flex h-full w-full items-end justify-center gap-1">
              <div className="w-1/3 max-w-8 rounded-t bg-sky" style={{ height: `${summary.services ? Math.max((summary.services / maxValue) * 100, 4) : 0}%` }} title={`${summary.services} servicios`} />
              <div className="w-1/3 max-w-8 rounded-t bg-brand" style={{ height: `${summary.trips ? Math.max((summary.trips / maxValue) * 100, 4) : 0}%` }} title={`${summary.trips} viajes`} />
            </div>
            <div className="text-sm font-bold text-navy dark:text-white">{summary.year}</div>
            <Muted>{summary.partial ? 'En curso' : 'Cerrado'}</Muted>
          </div>
        ))}
      </div>
      <div className="flex flex-wrap gap-4 text-xs text-ink-2 dark:text-[#d6e2f5]"><div className="flex items-center gap-1.5"><i className="size-2.5 rounded-sm bg-sky" />Servicios</div><div className="flex items-center gap-1.5"><i className="size-2.5 rounded-sm bg-brand" />Viajes</div></div>
    </Card>
  );
}

type CostMetric = 'generalCost' | 'fuelCost' | 'renditions';

export function AnnualCostChart({ summaries }: { summaries: HistoricalSummary[] }) {
  const [metric, setMetric] = useState<CostMetric>('generalCost');
  const labels: Record<CostMetric, string> = { generalCost: 'Costo general', fuelCost: 'Combustible', renditions: 'Rendiciones' };
  const maxValue = Math.max(...summaries.map((summary) => summary[metric]), 1);
  return (
    <Card className={cardClass}>
      <CardHeader
        eyebrow="Costos"
        title="Comparativa anual"
        aside={<label className={cn(fieldClass, 'w-44')}>Métrica<select className={selectClass} value={metric} onChange={(event) => setMetric(event.target.value as CostMetric)}><option value="generalCost">Costo general</option><option value="fuelCost">Combustible</option><option value="renditions">Rendiciones</option></select></label>}
      />
      <div className={chartArea} role="img" aria-label={`Comparativa anual de ${labels[metric]}`}>
        {summaries.map((summary) => (
          <div className="grid h-full min-w-0 grid-rows-[auto_minmax(0,1fr)_auto_auto] justify-items-center gap-1" key={summary.year}>
            <div className="text-xs font-semibold tabular-nums text-ink-2 dark:text-[#d6e2f5]">₲ {compactMoney(summary[metric])}</div>
            <div className="flex h-full w-full items-end justify-center"><div className="w-1/2 max-w-12 rounded-t bg-sky" style={{ height: `${summary[metric] ? Math.max((summary[metric] / maxValue) * 100, 4) : 0}%` }} title={`${summary.year}: ₲ ${moneyFormat.format(Math.round(summary[metric]))}`} /></div>
            <div className="text-sm font-bold text-navy dark:text-white">{summary.year}</div>
            <Muted>{summary.partial ? 'En curso' : 'Cerrado'}</Muted>
          </div>
        ))}
      </div>
      <Muted>{labels[metric]} en guaraníes. Cada año indica si está cerrado o en curso; un acumulado parcial no equivale a un año completo.</Muted>
    </Card>
  );
}
