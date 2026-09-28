import type { MpsModel, MpsProjection } from './repository';

export function calculateMpsProjection(model: MpsModel, monthlyVolume: number, years = 5): MpsProjection[] {
  if (!Number.isFinite(monthlyVolume) || monthlyVolume <= 0) return [];
  const projectionYears = Math.max(1, Math.min(5, Math.floor(years)));
  return model.consumables.map((consumable) => ({
    consumable,
    years: Array.from({ length: projectionYears }, (_, index) => {
      const year = index + 1;
      const replacements = monthlyVolume * 12 * year / consumable.yieldPages;
      return { year, replacements, units: Math.ceil(replacements) };
    }),
  }));
}
