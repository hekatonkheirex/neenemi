import { Muted } from '../../core/ui/card';
import { usdToPyg } from './analysis';
import { LegacyHorizontalStackedBars } from './LegacyCharts';
import { CONSUMABLES_COST_COLORS, formatPygValue, type RankingClientRow } from './client-ranking';

export default function ConsumablesClientRankingChart({ rankedClients }: { rankedClients: readonly RankingClientRow[] }) {
  const topClients = rankedClients.slice(0, 10);
  if (topClients.length === 0) return <Muted className="grid min-h-48 place-items-center text-center" role="status">No hay registros de uso normalizados para construir el ranking de clientes.</Muted>;

  return (
    <LegacyHorizontalStackedBars
      labels={topClients.map((row) => row.clientName)}
      series={[
        { label: 'Originales', color: CONSUMABLES_COST_COLORS.original, values: topClients.map((row) => usdToPyg(row.originalCostUsd)) },
        { label: 'Compatibles', color: CONSUMABLES_COST_COLORS.compatible, values: topClients.map((row) => usdToPyg(row.compatibleCostUsd)) },
        { label: 'Repuestos', color: CONSUMABLES_COST_COLORS.parts, values: topClients.map((row) => usdToPyg(row.partCostUsd)) },
      ]}
      valueFormatter={formatPygValue}
      ariaLabel="Top 10 clientes por costo de consumibles y repuestos"
    />
  );
}
