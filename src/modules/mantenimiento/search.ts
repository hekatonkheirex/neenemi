import type { MaintenanceAnalysis } from './analysis';

export function maintenanceAnalysisMatchesSearch(analysis: MaintenanceAnalysis, query: string): boolean {
  const normalizedQuery = normalizeSearchText(query);
  if (!normalizedQuery) return true;

  const searchableText = [
    analysis.customerName,
    analysis.contractReference,
    analysis.modelLabel,
    analysis.serialNumber,
    analysis.matchedModelLabel ?? '',
    analysis.status,
    analysis.recommendedAction,
    ...analysis.periods.flatMap((period) => [
      period.period,
      period.paperType,
      period.copies.toString(),
      period.copies.toLocaleString('es-PY'),
      period.counter.toString(),
      period.counter.toLocaleString('es-PY'),
      period.status,
      period.sourceSheetName ?? '',
      ...(period.sourceDetails ?? []).flatMap((detail) => [detail.label, detail.value]),
    ]),
  ].join(' ');

  return normalizeSearchText(searchableText).includes(normalizedQuery);
}

function normalizeSearchText(value: string): string {
  return value
    .normalize('NFD')
    .replace(/[\u0300-\u036f]/g, '')
    .toLocaleLowerCase()
    .replace(/[^a-z0-9]+/g, ' ')
    .trim();
}
