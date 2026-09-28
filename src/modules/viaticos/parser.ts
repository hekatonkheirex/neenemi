import { readWorkbookSheets, type WorkbookSheetRows } from '../consumibles/xlsx-helpers';
import { formatSourceValue } from '../../core/source-details';
import { DEFAULT_TRAVEL_COST_CATALOG } from './catalog';
import { DEFAULT_HISTORICAL_SUMMARIES } from './historical';
import type {
  BusFareReference,
  HistoricalSummary,
  ParsedTravelTrip,
  TollRouteReference,
  TravelCostCatalog,
  TravelSourceOperational,
} from './types';

// Increment when a parser correction changes the values persisted in the cost catalog.
// Existing installed databases are repaired by the source metadata backfill.
export const TRAVEL_COST_CATALOG_PARSER_REVISION = 2;

type TravelOperationalColumns = {
  serviceCostBase: number;
  mobile: number;
  averageConsumptionPer100Km: number;
  fuelCostPerLiter: number;
  serviceCostCalculated: number;
  totalServiceCost: number;
  totalFuelCost: number;
  serviceCostAllocation: number;
};

type TravelColumns = {
  count: number;
  date: number;
  serviceNumber: number;
  customer: number;
  destination: number;
  transport: number;
  technician: number;
  driver: number;
  advance: number;
  allowance: number;
  lodging: number;
  tolls: number;
  otherCost: number;
  vehiclePayment: number;
  technicianPayment: number;
  distanceKm: number;
  fuelCost: number;
  totalCost: number;
  operational: TravelOperationalColumns;
};

export type ParsedTravelWorkbook = {
  trips: ParsedTravelTrip[];
  historical: HistoricalSummary[];
  costCatalog: TravelCostCatalog;
  primarySheetName: string;
  sourceSheetNames: string[];
  sourceYear: number | null;
};

export async function parseTravelWorkbook(
  data: Uint8Array,
  sourceName: string,
): Promise<ParsedTravelWorkbook> {
  const sheets = await readWorkbookSheets(data, { preserveMergedValues: true });
  const primary = sheets.find((sheet) => normalizeText(sheet.name).includes('viajes')) ?? sheets[0];
  if (!primary) throw new Error('La planilla no contiene hojas para importar.');

  const sourceYear = yearFromText(sourceName) ?? yearFromText(primary.name);
  const workbookYear = sourceYear ?? new Date().getFullYear();
  return {
    trips: parseTrips(primary.rows, workbookYear, primary.name),
    historical: extractHistoricalSummaries(sheets),
    costCatalog: extractTravelCostCatalog(sheets),
    primarySheetName: primary.name,
    sourceSheetNames: sheets.map((sheet) => sheet.name),
    sourceYear,
  };
}

function parseTrips(rows: unknown[][], fallbackYear: number, sourceSheetName: string): ParsedTravelTrip[] {
  const headerIndex = rows.findIndex((row) => {
    const headers = row.map(normalizeHeader);
    return headers.some((header) => header === 'cant' || header === 'cantidad') && headers.some((header) => header === 'fecha');
  });
  if (headerIndex < 0) throw new Error('No encontré la fila de encabezados Cant / Fecha en la hoja de viajes.');

  const columns = getTravelColumns(rows[headerIndex] ?? []);
  if (columns.date < 0 || columns.customer < 0 || columns.destination < 0) {
    throw new Error('La hoja necesita las columnas Fecha, Cliente y Destino para importar.');
  }

  const imported: ParsedTravelTrip[] = [];
  rows.slice(headerIndex + 1).forEach((row, index) => {
    const rowLabel = normalizeText(row[0]);
    if (rowLabel === 'servicios' || rowLabel.includes('viaje total')) return;
    if (columns.count >= 0 && !text(row[columns.count])) return;
    const date = parseDate(row[columns.date], fallbackYear);
    if (!date) return;

    const input = {
      recordedAt: date,
      serviceNumber: columns.serviceNumber >= 0 ? text(row[columns.serviceNumber]) : '',
      customerName: columns.customer >= 0 ? text(row[columns.customer]) : '',
      destination: columns.destination >= 0 ? text(row[columns.destination]) : '',
      transport: columns.transport >= 0 ? parseTransport(row[columns.transport]) : 'MOVIL PROPIO' as const,
      technician: columns.technician >= 0 ? text(row[columns.technician]) : '',
      driver: columns.driver >= 0 ? text(row[columns.driver]) : '',
      advance: columns.advance >= 0 ? number(row[columns.advance]) : 0,
      allowance: columns.allowance >= 0 ? number(row[columns.allowance]) : 0,
      lodging: columns.lodging >= 0 ? number(row[columns.lodging]) : 0,
      tolls: columns.tolls >= 0 ? number(row[columns.tolls]) : 0,
      otherCost: columns.otherCost >= 0 ? number(row[columns.otherCost]) : 0,
      vehiclePayment: columns.vehiclePayment >= 0 ? number(row[columns.vehiclePayment]) : 0,
      technicianPayment: columns.technicianPayment >= 0 ? number(row[columns.technicianPayment]) : 0,
      distanceKm: columns.distanceKm >= 0 ? number(row[columns.distanceKm]) : 0,
      fuelCost: columns.fuelCost >= 0 ? number(row[columns.fuelCost]) : 0,
      notes: '',
    };
    const sourceTotal = columns.totalCost >= 0 ? number(row[columns.totalCost]) : 0;
    const sourceOperational = buildTravelSourceOperational(columns.operational, row);
    imported.push({
      ...input,
      source: 'xlsx',
      sourceRecordKey: createTravelRecordKey(input),
      sourceRow: headerIndex + index + 2,
      sourceSheetName,
      ...(sourceOperational ? { sourceOperational } : {}),
      totalCost: sourceTotal || calculateTotal(input),
    });
  });

  if (imported.length === 0) throw new Error('No encontré registros de viaje con fecha en la hoja principal.');
  return imported;
}

function getTravelColumns(headers: unknown[]): TravelColumns {
  return {
    count: findHeaderIndex(headers, ['cant', 'cantidad']),
    date: findHeaderIndex(headers, ['fecha']),
    serviceNumber: findHeaderIndex(headers, ['i s', 'is', 'n i s']),
    customer: findHeaderIndex(headers, ['cliente']),
    destination: findHeaderIndex(headers, ['destino', 'ciudad']),
    transport: findHeaderIndex(headers, ['medio']),
    technician: findHeaderIndex(headers, ['tecnicos', 'tecnico']),
    driver: findHeaderIndex(headers, ['chofer asignado', 'chofer']),
    advance: findHeaderIndex(headers, ['monto']),
    allowance: findHeaderIndex(headers, ['viatico']),
    lodging: findHeaderIndex(headers, ['hospedeja', 'hospedaje']),
    tolls: findHeaderIndex(headers, ['peajes']),
    otherCost: findHeaderIndex(headers, ['varios']),
    vehiclePayment: findHeaderIndex(headers, ['pago por uso de vehiculo']),
    technicianPayment: findHeaderIndex(headers, ['pago a tecnicos y chofer']),
    distanceKm: findHeaderIndex(headers, ['km aproximado realizado', 'km recorrido']),
    fuelCost: findHeaderIndex(headers, ['costo combustible por servicio']),
    totalCost: findHeaderIndex(headers, ['gasto total', 'total gasto']),
    operational: getTravelOperationalColumns(headers),
  };
}

function getTravelOperationalColumns(headers: unknown[]): TravelOperationalColumns {
  const serviceCosts = findHeaderIndices(headers, ['costo por servicio']);
  return {
    serviceCostBase: serviceCosts[0] ?? -1,
    mobile: findHeaderIndex(headers, ['movil', 'móvil']),
    averageConsumptionPer100Km: findHeaderIndex(headers, ['promedio de consumo x 100km', 'promedio de consumo por 100km']),
    fuelCostPerLiter: findHeaderIndex(headers, ['costos x lts', 'costo x lts', 'costo por litro']),
    serviceCostCalculated: serviceCosts[1] ?? -1,
    totalServiceCost: findHeaderIndex(headers, ['total costo serv', 'total costo servicio']),
    totalFuelCost: findHeaderIndex(headers, ['total costo comb', 'total costo combustible']),
    serviceCostAllocation: findHeaderIndex(headers, ['c a costo por servicios', 'ca costo por servicios']),
  };
}

function buildTravelSourceOperational(
  columns: TravelOperationalColumns,
  row: readonly unknown[],
): TravelSourceOperational | undefined {
  const sourceOperational: TravelSourceOperational = {};
  const fields: Array<[keyof TravelSourceOperational, number]> = [
    ['serviceCostBase', columns.serviceCostBase],
    ['mobile', columns.mobile],
    ['averageConsumptionPer100Km', columns.averageConsumptionPer100Km],
    ['fuelCostPerLiter', columns.fuelCostPerLiter],
    ['serviceCostCalculated', columns.serviceCostCalculated],
    ['totalServiceCost', columns.totalServiceCost],
    ['totalFuelCost', columns.totalFuelCost],
    ['serviceCostAllocation', columns.serviceCostAllocation],
  ];
  fields.forEach(([key, index]) => {
    if (index < 0) return;
    const value = formatSourceValue(row[index]);
    if (value) sourceOperational[key] = value;
  });
  return Object.keys(sourceOperational).length > 0 ? sourceOperational : undefined;
}

function findHeaderIndex(headers: unknown[], candidates: string[]): number {
  const names = new Set(candidates.map(normalizeHeader));
  return headers.findIndex((header) => names.has(normalizeHeader(header)));
}

function findHeaderIndices(headers: unknown[], candidates: string[]): number[] {
  const names = new Set(candidates.map(normalizeHeader));
  return headers.flatMap((header, index) => names.has(normalizeHeader(header)) ? [index] : []);
}

function parseTransport(value: unknown): ParsedTravelTrip['transport'] {
  const normalized = normalizeText(value);
  if (normalized.includes('bus')) return 'BUS';
  if (normalized.includes('propio')) return 'MOVIL PROPIO';
  if (normalized.includes('rent')) return 'MOVIL RENTADO';
  return 'MOVIL DATA';
}

function parseDate(value: unknown, fallbackYear: number): string {
  if (value instanceof Date && !Number.isNaN(value.getTime())) return value.toISOString().slice(0, 10);
  if (typeof value === 'number' && Number.isFinite(value) && value > 1 && value < 100000) {
    return new Date(Date.UTC(1899, 11, 30) + value * 86_400_000).toISOString().slice(0, 10);
  }

  const valueText = text(value);
  const isoMatch = valueText.match(/^(\d{4})[-/]([0-1]?\d)[-/]([0-3]?\d)/);
  if (isoMatch) return `${isoMatch[1]}-${isoMatch[2].padStart(2, '0')}-${isoMatch[3].padStart(2, '0')}`;
  const numericMatch = valueText.match(/^(\d{1,2})[-/]([0-1]?\d)[-/](\d{4})/);
  if (numericMatch) return `${numericMatch[3]}-${numericMatch[2].padStart(2, '0')}-${numericMatch[1].padStart(2, '0')}`;
  const monthMatch = valueText.toLowerCase().match(/^(\d{1,2})[-/\s]([a-záéíóú]{3,})/i);
  if (!monthMatch) return '';
  const month = MONTH_NUMBERS[normalizeText(monthMatch[2]).slice(0, 3)];
  return month ? `${fallbackYear}-${String(month).padStart(2, '0')}-${monthMatch[1].padStart(2, '0')}` : '';
}

function calculateTotal(input: Pick<ParsedTravelTrip, 'allowance' | 'lodging' | 'tolls' | 'otherCost' | 'vehiclePayment' | 'technicianPayment' | 'fuelCost'>): number {
  return input.allowance + input.lodging + input.tolls + input.otherCost + input.vehiclePayment + input.technicianPayment + input.fuelCost;
}

export function createTravelRecordKey(input: Pick<ParsedTravelTrip, 'recordedAt' | 'serviceNumber' | 'customerName' | 'destination' | 'transport'>): string {
  return [input.recordedAt, input.serviceNumber, input.customerName, input.destination, input.transport]
    .map((value) => normalizeText(value).replace(/\s+/g, ' '))
    .join('|');
}

export function createTravelIdentityKey(input: Pick<ParsedTravelTrip, 'recordedAt' | 'serviceNumber' | 'customerName' | 'transport'>): string {
  return [input.recordedAt, input.serviceNumber, input.customerName, input.transport]
    .map((value) => normalizeText(value).replace(/\s+/g, ' '))
    .join('|');
}

function extractTravelCostCatalog(sheets: WorkbookSheetRows[]): TravelCostCatalog {
  const calculation = sheets.find((sheet) => normalizeText(sheet.name).includes('calculo aux'));
  const bus = sheets.find((sheet) => normalizeText(sheet.name).includes('pasajes en bus'));
  const calculationRows = calculation?.rows ?? [];
  const busRows = bus?.rows ?? [];
  const hotelRow = calculationRows.find((row) => compactKey(row[0]) === 'hotel');
  const allowanceRow = calculationRows.find((row) => compactKey(row[0]) === 'viatico');
  const tollRoutes = parseTollRoutes(calculationRows);
  const busFares = parseBusFares(busRows);
  const sources = [calculation?.name, bus?.name].filter((name): name is string => Boolean(name));

  return {
    source: sources.length ? sources.join(' · ') : DEFAULT_TRAVEL_COST_CATALOG.source,
    dailyAllowance: nullableNumber(allowanceRow?.[3]) ?? DEFAULT_TRAVEL_COST_CATALOG.dailyAllowance,
    hotelPerNight: nullableNumber(hotelRow?.[3]) ?? DEFAULT_TRAVEL_COST_CATALOG.hotelPerNight,
    tollRoutes: tollRoutes.length ? tollRoutes : DEFAULT_TRAVEL_COST_CATALOG.tollRoutes,
    busFares: busFares.length ? busFares : DEFAULT_TRAVEL_COST_CATALOG.busFares,
  };
}

function parseTollRoutes(rows: unknown[][]): TollRouteReference[] {
  const routes: TollRouteReference[] = [];
  const parsedHeaders = new Set<string>();
  rows.forEach((row, rowIndex) => {
    row.forEach((value, columnIndex) => {
      const header = text(value);
      if (!normalizeText(header).startsWith('peajes a ')) return;
      const routeName = header.replace(/^peajes\s+a\s+/i, '').trim();
      const headerKey = `${rowIndex}:${compactKey(routeName)}`;
      if (parsedHeaders.has(headerKey)) return;
      parsedHeaders.add(headerKey);
      const checkpointRow = rows[rowIndex + 1] ?? [];
      const checkpoints: string[] = [];
      const totalColumn = checkpointRow.findIndex((checkpoint, index) => index >= columnIndex && normalizeText(checkpoint) === 'total');
      const checkpointEnd = totalColumn >= 0 ? totalColumn : checkpointRow.length;
      for (let index = columnIndex; index < checkpointEnd; index += 1) {
        const checkpoint = text(checkpointRow[index]);
        if (checkpoint) checkpoints.push(checkpoint);
      }
      if (!checkpoints.length) return;
      const valueRow = rows.slice(rowIndex + 2, rowIndex + 5).find((candidate) => {
        const hasCheckpoint = checkpoints.some((_, index) => nullableNumber(candidate[columnIndex + index]) !== null);
        const hasTotal = totalColumn >= 0 && nullableNumber(candidate[totalColumn]) !== null;
        return hasCheckpoint || hasTotal;
      });
      if (!valueRow) return;
      const checkpointTotal = checkpoints.reduce((sum, _, index) => sum + (nullableNumber(valueRow[columnIndex + index]) ?? 0), 0);
      const total = (totalColumn >= 0 ? nullableNumber(valueRow[totalColumn]) : null) ?? checkpointTotal;
      if (!total) return;
      routes.push({ route: routeName, aliases: [routeName, compactKey(routeName)], checkpoints, total });
    });
  });
  return routes;
}

function parseBusFares(rows: unknown[][]): BusFareReference[] {
  const headerIndex = rows.findIndex((row) => compactKey(row[0]) === 'ciudad' && compactKey(row[3]) === 'pasaje ida');
  if (headerIndex < 0) return [];
  const groups = new Map<string, { destination: string; outbound: number[]; returnFare: number[]; companies: string[] }>();
  rows.slice(headerIndex + 1).forEach((row) => {
    const destination = text(row[0]);
    if (!destination) return;
    const outbound = nullableNumber(row[3]);
    const returnFare = nullableNumber(row[4]);
    if (outbound === null && returnFare === null) return;
    const key = compactKey(destination);
    const current = groups.get(key) ?? { destination, outbound: [], returnFare: [], companies: [] };
    if (outbound !== null) current.outbound.push(outbound);
    if (returnFare !== null) current.returnFare.push(returnFare);
    const company = text(row[1]);
    if (company && !current.companies.includes(company)) current.companies.push(company);
    groups.set(key, current);
  });
  return [...groups.values()].map((group) => ({
    destination: group.destination,
    aliases: [group.destination, compactKey(group.destination)],
    outbound: group.outbound.length ? Math.min(...group.outbound) : null,
    returnFare: group.returnFare.length ? Math.min(...group.returnFare) : null,
    company: group.companies.join(' / '),
  }));
}

function extractHistoricalSummaries(sheets: WorkbookSheetRows[]): HistoricalSummary[] {
  const overrides = new Map<number, Partial<HistoricalSummary>>();
  const travelGraph = sheets.find((sheet) => normalizeText(sheet.name).includes('grafico viajes'));
  if (travelGraph) {
    const rows = travelGraph.rows;
    [2023, 2024, 2025].forEach((year) => {
      const yearIndex = findLastRow(rows, (row) => number(row[0]) === year);
      if (yearIndex < 0) return;
      const block = rows.slice(yearIndex, yearIndex + 8);
      const serviceRow = block.find((row) => normalizeText(row[0]).includes('serv') && !normalizeText(row[0]).includes('viaje'));
      const tripRow = block.find((row) => normalizeText(row[0]).includes('viaje'));
      if (!serviceRow || !tripRow) return;
      const dataRow = block.find((row) => normalizeText(row[0]).includes('data'));
      const busRow = block.find((row) => normalizeText(row[0]).includes('bus'));
      const ownRow = block.find((row) => normalizeText(row[0]).includes('propio'));
      const monthlyServices = monthlyValues(serviceRow);
      const monthlyTrips = monthlyValues(tripRow);
      overrides.set(year, {
        services: monthlyServices.reduce((sum, value) => sum + value, 0),
        trips: monthlyTrips.reduce((sum, value) => sum + value, 0),
        monthlyServices,
        monthlyTrips,
        transportTrips: {
          data: monthlyValues(dataRow).reduce((sum, value) => sum + value, 0),
          bus: monthlyValues(busRow).reduce((sum, value) => sum + value, 0),
          own: monthlyValues(ownRow).reduce((sum, value) => sum + value, 0),
        },
        source: `${travelGraph.name} · bloque anual completo`,
      });
    });
  }

  const costGraph = sheets.find((sheet) => normalizeText(sheet.name).includes('grafico costos'));
  if (costGraph) {
    const blocks: number[][] = [];
    costGraph.rows.forEach((row) => {
      for (let start = 0; start <= row.length - 9; start += 1) {
        const values = row.slice(start, start + 9).map(number);
        const looksLikeCostBlock = values[0] >= 10000 && values[0] <= 500000
          && values[1] > 1000000 && values[2] > 100000 && values[3] > 100000
          && values[4] > 1000000 && values[5] > 1000000 && values[6] > 1000000
          && values[7] > 1000000 && values[8] > 10000 && values[8] < 1000000;
        if (looksLikeCostBlock && !blocks.some((block) => block.every((value, index) => value === values[index]))) blocks.push(values);
      }
    });
    blocks.slice(0, 3).forEach((values, index) => {
      overrides.set(2023 + index, {
        distanceKm: values[0],
        fuelCost: values[1],
        vehicleCost: values[2],
        technicianCost: values[3],
        renditions: values[4],
        serviceCost: values[5],
        generalCost: values[6],
        averageMonthlyCost: values[7],
        averageCostPerService: values[8],
        source: `${costGraph.name} · resumen anual`,
      });
    });
  }

  const currentSheet = sheets.find((sheet) => normalizeText(sheet.name) === 'viajes2026');
  const currentSummary = currentSheet ? parseCurrentSummary(currentSheet) : undefined;
  if (currentSummary) overrides.set(2026, currentSummary);

  return DEFAULT_HISTORICAL_SUMMARIES.map((summary) => ({
    ...summary,
    ...(overrides.get(summary.year) ?? {}),
  }));
}

function parseCurrentSummary(sheet: WorkbookSheetRows): Partial<HistoricalSummary> | undefined {
  const serviceRow = sheet.rows.find((row) => normalizeText(row[0]).includes('serv') && !normalizeText(row[0]).includes('viaje'));
  const tripRow = sheet.rows.find((row) => normalizeText(row[0]).includes('viaje total'));
  if (!serviceRow || !tripRow) return undefined;
  const monthlyServices = monthlyValues(serviceRow);
  const monthlyTrips = monthlyValues(tripRow);
  const costs = Array.from({ length: 9 }, (_, index) => number(tripRow[17 + index]));
  return {
    year: 2026,
    partial: true,
    services: monthlyServices.reduce((sum, value) => sum + value, 0),
    trips: monthlyTrips.reduce((sum, value) => sum + value, 0),
    distanceKm: costs[0],
    fuelCost: costs[1],
    vehicleCost: costs[2],
    technicianCost: costs[3],
    renditions: costs[4],
    serviceCost: costs[5],
    generalCost: costs[6],
    averageMonthlyCost: costs[7],
    averageCostPerService: costs[8],
    monthlyServices,
    monthlyTrips,
    source: `${sheet.name} · resumen de la planilla`,
  };
}

function findLastRow(rows: unknown[][], predicate: (row: unknown[]) => boolean): number {
  let match = -1;
  rows.forEach((row, index) => {
    if (predicate(row)) match = index;
  });
  return match;
}

function monthlyValues(row: unknown[] | undefined): number[] {
  return Array.from({ length: 12 }, (_, index) => number(row?.[index + 1]));
}

function yearFromText(value: string | undefined): number | null {
  const match = value?.match(/20\d{2}/);
  return match ? Number(match[0]) : null;
}

function text(value: unknown): string {
  return value === null || value === undefined ? '' : String(value).trim();
}

function number(value: unknown): number {
  if (typeof value === 'number') return Number.isFinite(value) ? value : 0;
  const raw = text(value).replace(/[^\d,.-]/g, '');
  if (!raw) return 0;
  const lastComma = raw.lastIndexOf(',');
  const lastDot = raw.lastIndexOf('.');
  let normalized = raw;
  if (lastComma >= 0 && lastDot >= 0) {
    normalized = lastComma > lastDot ? raw.replace(/\./g, '').replace(',', '.') : raw.replace(/,/g, '');
  } else if (lastComma >= 0) {
    normalized = raw.replace(/,(?=\d{3}(?:$|\D))/g, '').replace(',', '.');
  } else if ((raw.match(/\./g) ?? []).length > 1 || /\.\d{3}$/.test(raw)) {
    normalized = raw.replace(/\./g, '');
  }
  const parsed = Number.parseFloat(normalized);
  return Number.isFinite(parsed) ? parsed : 0;
}

function nullableNumber(value: unknown): number | null {
  const valueText = text(value);
  if (!valueText) return null;
  const parsed = number(valueText);
  return parsed > 0 ? parsed : null;
}

function compactKey(value: unknown): string {
  return normalizeText(value).replace(/\([^)]*\)/g, ' ').replace(/[^a-z0-9]+/g, ' ').replace(/\s+/g, ' ').trim();
}

function normalizeHeader(value: unknown): string {
  return normalizeText(value).replace(/[^a-z0-9]+/g, ' ').replace(/\s+/g, ' ').trim();
}

function normalizeText(value: unknown): string {
  return String(value ?? '').normalize('NFD').replace(/[\u0300-\u036f]/g, '').toLowerCase().trim();
}

const MONTH_NUMBERS: Record<string, number> = {
  ene: 1,
  jan: 1,
  feb: 2,
  mar: 3,
  abr: 4,
  apr: 4,
  may: 5,
  jun: 6,
  jul: 7,
  ago: 8,
  aug: 8,
  sep: 9,
  oct: 10,
  nov: 11,
  dic: 12,
  dec: 12,
};
