import { Badge } from '../../core/ui/badge';
import { Card, CardHeader, Muted } from '../../core/ui/card';
import type { TravelSummary } from './types';

const moneyFormat = new Intl.NumberFormat('es-PY', { maximumFractionDigits: 0 });
const integerFormat = new Intl.NumberFormat('es-PY', { maximumFractionDigits: 0 });

const rowClass = 'grid min-w-0 items-center gap-x-3 gap-y-1 border-t border-navy/10 pt-3 first:border-0 first:pt-0 dark:border-sky/15';

export default function TravelOverviewPanels({ summary }: { summary: TravelSummary }) {
  const maximumTransportCost = Math.max(...summary.transportTotals.map((item) => item.totalCost), 1);
  const maximumDestinationCost = Math.max(...summary.topDestinations.map((item) => item.totalCost), 1);

  return (
    <div className="grid min-w-0 gap-4 @container">
      <div className="grid min-w-0 gap-4 @[48rem]:grid-cols-2">
        <Card className="min-w-0 grid-cols-1 content-start [overflow-wrap:anywhere]">
          <CardHeader eyebrow="Distribución" title="Gasto por medio" aside={<Badge>Por costo acumulado</Badge>} />
          {summary.transportTotals.length === 0 ? <Muted className="text-sm">Sin medios de traslado cargados.</Muted> : <div className="grid gap-3">
            {summary.transportTotals.map((item) => <div className={`${rowClass} grid-cols-[minmax(0,1fr)_auto]`} key={item.key}>
              <div className="min-w-0"><div className="font-bold text-navy dark:text-white">{formatTransport(item.key)}</div><Muted>{integerFormat.format(item.records)} {item.records === 1 ? 'viaje' : 'viajes'}</Muted></div>
              <div className="text-right font-bold tabular-nums text-navy dark:text-white">₲ {moneyFormat.format(Math.round(item.totalCost))}</div>
              <Track className="col-span-2" ratio={item.totalCost / maximumTransportCost} />
            </div>)}
          </div>}
        </Card>

        <Card className="min-w-0 grid-cols-1 content-start [overflow-wrap:anywhere]">
          <CardHeader eyebrow="Prioridad" title="Destinos con mayor costo" aside={<Badge>Top {summary.topDestinations.length}</Badge>} />
          {summary.topDestinations.length === 0 ? <Muted className="text-sm">Sin destinos cargados.</Muted> : <div className="grid gap-3">
            {summary.topDestinations.map((item, index) => <div className={`${rowClass} grid-cols-[1.75rem_minmax(0,1fr)_auto]`} key={item.destination}>
              <div className="font-mono text-xs text-ink-2 dark:text-[#9fb2d1]">{String(index + 1).padStart(2, '0')}</div>
              <div className="min-w-0"><div className="font-bold text-navy dark:text-white" title={item.destination}>{item.destination}</div><Muted>{integerFormat.format(item.records)} {item.records === 1 ? 'viaje' : 'viajes'}</Muted></div>
              <div className="text-right font-bold tabular-nums text-navy dark:text-white">₲ {moneyFormat.format(Math.round(item.totalCost))}</div>
              <Track className="col-span-3 col-start-1" ratio={item.totalCost / maximumDestinationCost} />
            </div>)}
          </div>}
        </Card>
      </div>
    </div>
  );
}

function Track({ ratio, className }: { ratio: number; className?: string }) {
  return <div className={`h-2 overflow-hidden rounded-full bg-navy/10 dark:bg-white/10 ${className ?? ''}`} aria-hidden="true"><div className="h-full rounded-full bg-sky" style={{ width: `${Math.max(ratio * 100, 3)}%` }} /></div>;
}

function formatTransport(value: string): string {
  return value.replace('MOVIL ', 'MÓVIL ');
}
