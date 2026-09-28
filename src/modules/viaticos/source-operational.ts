import type { TravelSourceOperational } from './types';

export const TRAVEL_SOURCE_OPERATIONAL_FIELDS: ReadonlyArray<{
  key: keyof TravelSourceOperational;
  label: string;
}> = [
  { key: 'serviceCostBase', label: 'Costo servicio base' },
  { key: 'mobile', label: 'Móvil del cálculo' },
  { key: 'averageConsumptionPer100Km', label: 'Consumo / 100 km' },
  { key: 'fuelCostPerLiter', label: 'Costo por litro' },
  { key: 'serviceCostCalculated', label: 'Costo servicio calculado' },
  { key: 'totalServiceCost', label: 'Total costo servicios' },
  { key: 'totalFuelCost', label: 'Total costo combustible' },
  { key: 'serviceCostAllocation', label: 'C.A. costo por servicios' },
];

export function travelSourceOperationalEntries(
  sourceOperational: TravelSourceOperational | undefined,
): Array<{ label: string; value: string }> {
  if (!sourceOperational) return [];
  return TRAVEL_SOURCE_OPERATIONAL_FIELDS.flatMap(({ key, label }) => {
    const value = sourceOperational[key]?.trim();
    return value ? [{ label, value }] : [];
  });
}

export function formatTravelSourceOperational(
  sourceOperational: TravelSourceOperational | undefined,
): string {
  return travelSourceOperationalEntries(sourceOperational)
    .map(({ label, value }) => `${label}: ${value}`)
    .join(' · ');
}
