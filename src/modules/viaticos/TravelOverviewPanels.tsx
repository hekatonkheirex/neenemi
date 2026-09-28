import type { TravelSummary } from './types';

const moneyFormat = new Intl.NumberFormat('es-PY', { maximumFractionDigits: 0 });
const integerFormat = new Intl.NumberFormat('es-PY', { maximumFractionDigits: 0 });

export default function TravelOverviewPanels({ summary }: { summary: TravelSummary }) {
  const maximumTransportCost = Math.max(...summary.transportTotals.map((item) => item.totalCost), 1);
  const maximumDestinationCost = Math.max(...summary.topDestinations.map((item) => item.totalCost), 1);

  return (
    <div className="travel-overview-panels">
      <section className="sales-card travel-overview-card">
        <div className="card-heading">
          <div><div className="eyebrow">DISTRIBUCIÓN</div><h2>Gasto por medio</h2></div>
          <span className="muted-note">Por costo acumulado</span>
        </div>
        {summary.transportTotals.length === 0 ? <p className="empty-inline">Sin medios de traslado cargados.</p> : <div className="travel-overview-list">
          {summary.transportTotals.map((item) => <div className="travel-overview-row" key={item.key}>
            <div className="travel-overview-row-heading"><strong>{formatTransport(item.key)}</strong><small>{integerFormat.format(item.records)} {item.records === 1 ? 'viaje' : 'viajes'}</small></div>
            <div className="travel-overview-track" aria-hidden="true"><span style={{ width: `${Math.max((item.totalCost / maximumTransportCost) * 100, 3)}%` }} /></div>
            <b>₲ {moneyFormat.format(Math.round(item.totalCost))}</b>
          </div>)}
        </div>}
      </section>

      <section className="sales-card travel-overview-card">
        <div className="card-heading">
          <div><div className="eyebrow">PRIORIDAD</div><h2>Destinos con mayor costo</h2></div>
          <span className="muted-note">Top {summary.topDestinations.length}</span>
        </div>
        {summary.topDestinations.length === 0 ? <p className="empty-inline">Sin destinos cargados.</p> : <div className="travel-overview-list">
          {summary.topDestinations.map((item, index) => <div className="travel-overview-destination" key={item.destination}>
            <span className="travel-overview-rank">{String(index + 1).padStart(2, '0')}</span>
            <div className="travel-overview-destination-content"><div><strong title={item.destination}>{item.destination}</strong><small>{integerFormat.format(item.records)} {item.records === 1 ? 'viaje' : 'viajes'}</small></div><div className="travel-overview-track" aria-hidden="true"><span style={{ width: `${Math.max((item.totalCost / maximumDestinationCost) * 100, 3)}%` }} /></div></div>
            <b>₲ {moneyFormat.format(Math.round(item.totalCost))}</b>
          </div>)}
        </div>}
      </section>
    </div>
  );
}

function formatTransport(value: string): string {
  return value.replace('MOVIL ', 'MÓVIL ');
}
