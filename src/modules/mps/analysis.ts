import { calculateMpsProjection } from './calculations';
import type { MpsModel, MpsProjection } from './repository';

export type MpsVolumeStatus = 'low' | 'optimal' | 'high';

export type MpsRankingEntry = {
  id: string;
  name: string;
  type: string;
  sku: string;
  units: number;
  replacements: number;
  share: number;
};

export type MpsAnalysis = {
  monthlyVolume: number;
  annualPages: number;
  fiveYearPages: number;
  paperReams: number;
  criticalConsumables: number;
  preventiveKits: number;
  totalUnitsFiveYears: number;
  totalCyclesFiveYears: number;
  volumeStatus: MpsVolumeStatus;
  ranking: readonly MpsRankingEntry[];
};

const ANALYSIS_YEARS = 5;
const RANKING_LIMIT = 8;

export function buildMpsAnalysis(model: MpsModel, monthlyVolume: number): MpsAnalysis | null {
  if (!Number.isFinite(monthlyVolume) || monthlyVolume <= 0) return null;

  const projections = calculateMpsProjection(model, monthlyVolume, ANALYSIS_YEARS);
  const annualPages = monthlyVolume * 12;
  const fiveYearPages = annualPages * ANALYSIS_YEARS;
  const totalUnitsFiveYears = projections.reduce((total, projection) => total + getYear(projection, ANALYSIS_YEARS).units, 0);
  const totalCyclesFiveYears = projections.reduce((total, projection) => total + getYear(projection, ANALYSIS_YEARS).replacements, 0);

  return {
    monthlyVolume,
    annualPages,
    fiveYearPages,
    paperReams: Math.ceil(annualPages / 500),
    criticalConsumables: projections.filter((projection) => getYear(projection, 3).replacements >= 3).length,
    preventiveKits: projections.filter((projection) => projection.consumable.type !== 'toner' && getYear(projection, ANALYSIS_YEARS).replacements >= 1).length,
    totalUnitsFiveYears,
    totalCyclesFiveYears,
    volumeStatus: getVolumeStatus(model, monthlyVolume),
    ranking: buildRanking(projections, totalUnitsFiveYears),
  };
}

export function getMpsVolumeStatus(model: MpsModel, monthlyVolume: number): MpsVolumeStatus {
  return getVolumeStatus(model, monthlyVolume);
}

function buildRanking(projections: readonly MpsProjection[], totalUnits: number): MpsRankingEntry[] {
  return projections
    .map((projection) => {
      const year = getYear(projection, ANALYSIS_YEARS);
      return {
        id: projection.consumable.id,
        name: projection.consumable.name,
        type: projection.consumable.type,
        sku: projection.consumable.sku,
        units: year.units,
        replacements: year.replacements,
        share: totalUnits > 0 ? year.units / totalUnits : 0,
      };
    })
    .sort((left, right) => right.units - left.units || left.name.localeCompare(right.name, 'es'))
    .slice(0, RANKING_LIMIT);
}

function getYear(projection: MpsProjection, year: number): { replacements: number; units: number } {
  return projection.years.find((entry) => entry.year === year) ?? projection.years[projection.years.length - 1] ?? { replacements: 0, units: 0 };
}

function getVolumeStatus(model: MpsModel, monthlyVolume: number): MpsVolumeStatus {
  if (monthlyVolume < model.recVolumeMin) return 'low';
  if (monthlyVolume > model.recVolumeMax) return 'high';
  return 'optimal';
}
