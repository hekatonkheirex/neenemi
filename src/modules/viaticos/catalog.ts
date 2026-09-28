import type {
  TravelCostCatalog,
  TravelCostEstimate,
  TravelTransport,
} from './types';

const route = (routeName: string, aliases: string[], checkpoints: string[], total: number) => ({
  route: routeName,
  aliases: [routeName, ...aliases],
  checkpoints,
  total,
});

const busFare = (
  destination: string,
  aliases: string[],
  outbound: number | null,
  returnFare: number | null,
  company = '',
) => ({ destination, aliases: [destination, ...aliases], outbound, returnFare, company });

export const DEFAULT_TRAVEL_COST_CATALOG: TravelCostCatalog = {
  source: 'Referencia base · CALCULO AUX · PEAJES · PASAJES EN BUS',
  dailyAllowance: 130000,
  hotelPerNight: 200000,
  tollRoutes: [
    route('CDE', ['Ciudad del Este'], ['Ypacaraí', 'Nueva Londres', 'Juan Manuel Frutos', 'Minga'], 146000),
    route('PJC', ['Pedro Juan Caballero'], ['25 de Diciembre', 'Emboscada', 'Río Verde'], 60000),
    route('Encarnación', [], ['Itá', 'Villa Florida', 'Coronel Bogado'], 60000),
    route('Concepción', [], ['25 de Diciembre', 'Emboscada', 'Horqueta'], 60000),
    route('Pakuri', [], ['Ypacaraí', 'Nueva Londres'], 60000),
    route('Coronel Oviedo', ['Cnel. Oviedo', 'Cnel Oviedo'], ['Ypacaraí', 'Nueva Londres'], 60000),
    route('Villarrica', ['Villarica'], ['Ypacaraí', 'Nueva Londres'], 60000),
    route('Encarnación · Portal de Itapúa', ['Portal de Itapúa'], ['Portal de Itapúa', 'Caapucú'], 40000),
    route('Loma Plata · Boquerón', ['Loma Plata', 'Filadelfia', 'Boquerón'], ['Remanso', 'Pozo Colorado'], 40000),
    route('Saltos del Guairá', [], ['Remanso', 'Pozo Colorado'], 40000),
  ],
  busFares: [
    busFare('Alberdi', [], 45000, 45000, 'Lago Ypoá'),
    busFare('Encarnación', [], 150000, 150000),
    busFare('Villarrica', ['Villarica'], 40000, 40000),
    busFare('Concepción', [], 140000, 170000),
    busFare('Pedro Juan Caballero', ['PJC'], 180000, 180000, 'Tarifa nocturna'),
    busFare('Horqueta', [], 100000, 100000),
    busFare('Santa Rosa del Aguaray', ['San Rosa del Aguaray'], 63000, 63000),
    busFare('San Juan Bautista, Misiones', ['San Juan Bautista Misiones'], 50000, 50000),
    busFare('Ciudad del Este', ['CDE'], 110000, 110000),
    busFare('Coronel Oviedo', ['Cnel. Oviedo', 'Cnel Oviedo'], 45000, 45000),
    busFare('San Estanislao', ['San Estanislao (Santani)', 'Santani'], 50000, 50000, 'La Ovetense / Canindeyú'),
    busFare('Pilar', [], 90000, 70000),
    busFare('Caazapá', [], 75000, 75000),
  ],
};

export function estimateTravelCosts(
  catalog: TravelCostCatalog,
  destination: string,
  transport: TravelTransport,
  parameters: { days?: number; nights?: number; technicians?: number } = {},
): TravelCostEstimate {
  const days = positiveInteger(parameters.days, 1);
  const nights = positiveInteger(parameters.nights, 0);
  const technicians = positiveInteger(parameters.technicians, 1);
  const normalizedDestination = normalizeText(destination);
  const tollRoute = catalog.tollRoutes.find((item) => item.aliases.some((alias) => normalizeText(alias) === normalizedDestination)) ?? null;
  const busReference = catalog.busFares.find((item) => item.aliases.some((alias) => normalizeText(alias) === normalizedDestination)) ?? null;
  const busOutbound = busReference?.outbound ?? null;
  const busReturn = busReference?.returnFare ?? null;

  return {
    dailyAllowance: catalog.dailyAllowance * days * technicians,
    lodging: catalog.hotelPerNight * nights * technicians,
    tolls: transport === 'BUS' ? null : tollRoute?.total ?? null,
    busFare: busOutbound !== null && busReturn !== null ? busOutbound + busReturn : null,
    busOutbound,
    busReturn,
    tollRoute,
    busReference,
  };
}

function positiveInteger(value: number | undefined, fallback: number): number {
  return Number.isFinite(value) ? Math.max(Math.round(value as number), fallback) : fallback;
}

function normalizeText(value: unknown): string {
  return String(value ?? '')
    .normalize('NFD')
    .replace(/[\u0300-\u036f]/g, '')
    .toLowerCase()
    .trim()
    .replace(/\s+/g, ' ');
}
