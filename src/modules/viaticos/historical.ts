import type { HistoricalSummary } from './types';

function summary(
  year: number,
  costs: Pick<HistoricalSummary, 'distanceKm' | 'fuelCost' | 'vehicleCost' | 'technicianCost' | 'renditions' | 'serviceCost' | 'generalCost' | 'averageMonthlyCost' | 'averageCostPerService'>,
  monthlyServices: number[],
  monthlyTrips: number[],
  transportTrips: HistoricalSummary['transportTrips'],
  partial = false,
): HistoricalSummary {
  return {
    year,
    partial,
    ...costs,
    services: monthlyServices.reduce((total, value) => total + value, 0),
    trips: monthlyTrips.reduce((total, value) => total + value, 0),
    monthlyServices,
    monthlyTrips,
    transportTrips,
    source: 'GRAFICO VIAJES AÑO 23_24_25 / GRAFICO COSTOS AÑO 23_24_25',
  };
}

export const DEFAULT_HISTORICAL_SUMMARIES: HistoricalSummary[] = [
  summary(
    2023,
    { distanceKm: 126687, fuelCost: 94457349, vehicleCost: 9600000, technicianCost: 45700000, renditions: 105792146, serviceCost: 160016146, generalCost: 254572651, averageMonthlyCost: 21214388, averageCostPerService: 207645 },
    [89, 99, 109, 130, 83, 92, 117, 143, 102, 62, 145, 55],
    [14, 16, 17, 18, 15, 18, 14, 16, 21, 22, 20, 12],
    { data: 138, bus: 20, own: 45 },
  ),
  summary(
    2024,
    { distanceKm: 76805, fuelCost: 61888050, vehicleCost: 18400000, technicianCost: 34000000, renditions: 105896323, serviceCost: 158296323, generalCost: 218591873, averageMonthlyCost: 18215989, averageCostPerService: 322883 },
    [48, 46, 41, 62, 77, 44, 29, 67, 56, 87, 94, 40],
    [18, 12, 14, 15, 9, 6, 5, 15, 11, 13, 19, 12],
    { data: 62, bus: 5, own: 82 },
  ),
  summary(
    2025,
    { distanceKm: 79776, fuelCost: 52488170, vehicleCost: 22800000, technicianCost: 30000000, renditions: 66264310, serviceCost: 121664310, generalCost: 171552480, averageMonthlyCost: 14296040, averageCostPerService: 115524 },
    [113, 161, 78, 96, 96, 70, 85, 204, 152, 196, 113, 121],
    [19, 26, 21, 18, 20, 19, 18, 17, 20, 24, 16, 9],
    { data: 49, bus: 37, own: 141 },
  ),
  summary(
    2026,
    { distanceKm: 63418, fuelCost: 50020857, vehicleCost: 26550000, technicianCost: 22000000, renditions: 58731455, serviceCost: 107281455, generalCost: 156529004, averageMonthlyCost: 13044084, averageCostPerService: 142429 },
    [101, 140, 162, 93, 138, 88, 169, 165, 43, 0, 0, 0],
    [12, 24, 10, 15, 13, 11, 5, 13, 0, 0, 0, 0],
    { data: 34, bus: 9, own: 60 },
    true,
  ),
].map((item) => ({
  ...item,
  source: item.year === 2026 ? 'VIAJES2026 · resumen de la planilla' : item.source,
}));
