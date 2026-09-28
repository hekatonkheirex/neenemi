import type { MaintenanceAnalysis } from './analysis';

export type MaintenanceExecutiveSummary = {
  total: number;
  normal: number;
  critical: number;
  attention: number;
  unrecognized: number;
  zeroCounters: number;
  overworked: number;
  urgent: readonly MaintenanceAnalysis[];
  caution: readonly MaintenanceAnalysis[];
  urgentAll: readonly MaintenanceAnalysis[];
  cautionAll: readonly MaintenanceAnalysis[];
  unrecognizedList: readonly MaintenanceAnalysis[];
  zeroList: readonly MaintenanceAnalysis[];
  recommendedExceeded: readonly MaintenanceAnalysis[];
  criticalTrend: readonly { period: string; count: number }[];
  insights: readonly string[];
};

export function buildMaintenanceExecutiveSummary(
  analyses: readonly MaintenanceAnalysis[],
): MaintenanceExecutiveSummary {
  const criticalAnalyses = analyses.filter((analysis) => analysis.status === 'CRÍTICO');
  const attentionAnalyses = analyses.filter((analysis) => analysis.status === 'ATENCIÓN');
  const urgentAll = sortByPriority(criticalAnalyses, false);
  const cautionAll = sortByPriority(attentionAnalyses, false);
  const urgent = urgentAll.slice(0, 8);
  const caution = cautionAll.slice(0, 8);
  const unrecognizedList = [...analyses]
    .filter((analysis) => analysis.status === 'NO_RECONOCIDO')
    .sort((left, right) => left.customerName.localeCompare(right.customerName, 'es') || left.modelLabel.localeCompare(right.modelLabel, 'es'));
  const zeroList = [...analyses]
    .filter((analysis) => analysis.averageCopies === 0)
    .sort((left, right) => left.customerName.localeCompare(right.customerName, 'es') || left.modelLabel.localeCompare(right.modelLabel, 'es'));
  const recommendedExceeded = [...analyses]
    .filter((analysis) => analysis.status !== 'NO_RECONOCIDO' && analysis.averageCopies > Math.round(analysis.optimalBase / 0.65))
    .sort((left, right) => right.averageCopies - left.averageCopies || left.customerName.localeCompare(right.customerName, 'es'));
  const criticalByPeriod = new Map<string, number>();
  analyses.forEach((analysis) => {
    analysis.periods.forEach((period) => {
      if (!criticalByPeriod.has(period.period)) criticalByPeriod.set(period.period, 0);
      if (period.status === 'CRÍTICO') criticalByPeriod.set(period.period, (criticalByPeriod.get(period.period) ?? 0) + 1);
    });
  });
  const criticalTrend = [...criticalByPeriod.entries()]
    .sort(([left], [right]) => left.localeCompare(right))
    .slice(-6)
    .map(([period, count]) => ({ period, count }));
  const criticalByClient = new Map<string, { total: number; critical: number }>();
  const criticalByModel = new Map<string, { total: number; critical: number }>();

  for (const analysis of analyses) {
    const client = analysis.customerName || 'Cliente sin informar';
    const model = analysis.matchedModelLabel || analysis.modelLabel || 'Modelo sin informar';
    const clientStats = criticalByClient.get(client) ?? { total: 0, critical: 0 };
    const modelStats = criticalByModel.get(model) ?? { total: 0, critical: 0 };
    clientStats.total += 1;
    modelStats.total += 1;
    if (analysis.status === 'CRÍTICO') {
      clientStats.critical += 1;
      modelStats.critical += 1;
    }
    criticalByClient.set(client, clientStats);
    criticalByModel.set(model, modelStats);
  }

  const insights: string[] = [];
  [...criticalByClient.entries()]
    .filter(([, stats]) => stats.critical > 0)
    .sort((left, right) => right[1].critical - left[1].critical || left[0].localeCompare(right[0], 'es'))
    .slice(0, 3)
    .forEach(([client, stats]) => {
      insights.push(`${client}: ${stats.critical} de ${stats.total} equipo${stats.total === 1 ? '' : 's'} en estado crítico.`);
    });

  [...criticalByModel.entries()]
    .filter(([, stats]) => stats.critical > 1 && stats.critical / stats.total > 0.4)
    .sort((left, right) => right[1].critical / right[1].total - left[1].critical / left[1].total || left[0].localeCompare(right[0], 'es'))
    .slice(0, 2)
    .forEach(([model, stats]) => {
      insights.push(`${model}: ${Math.round(stats.critical / stats.total * 100)}% de las ubicaciones están críticas.`);
    });

  const beyondUsefulLife = analyses.filter((analysis) => analysis.usefulLifePercent >= 1).length;
  if (beyondUsefulLife > 0) {
    insights.push(`${beyondUsefulLife} equipo${beyondUsefulLife === 1 ? '' : 's'} superó el 100% de la vida útil configurada.`);
  }
  if (insights.length === 0 && analyses.length > 0) {
    insights.push('No se detectaron patrones críticos adicionales en el parque analizado.');
  }

  return {
    total: analyses.length,
    normal: analyses.filter((analysis) => analysis.status === 'NORMAL').length,
    critical: criticalAnalyses.length,
    attention: attentionAnalyses.length,
    unrecognized: analyses.filter((analysis) => analysis.status === 'NO_RECONOCIDO').length,
    zeroCounters: analyses.filter((analysis) => analysis.averageCopies === 0).length,
    overworked: analyses.filter((analysis) => analysis.ratio > 1).length,
    urgent,
    caution,
    urgentAll,
    cautionAll,
    unrecognizedList,
    zeroList,
    recommendedExceeded,
    criticalTrend,
    insights,
  };
}

function sortByPriority(analyses: readonly MaintenanceAnalysis[], limit = true): MaintenanceAnalysis[] {
  const sorted = [...analyses]
    .sort((left, right) => right.ratio - left.ratio || left.customerName.localeCompare(right.customerName, 'es'));
  return limit ? sorted.slice(0, 8) : sorted;
}
