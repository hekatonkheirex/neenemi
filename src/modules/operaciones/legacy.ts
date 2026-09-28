import type { CellValue, Worksheet } from 'exceljs';
import { buildCompleteSourceDetails, type SourceDetail } from '../../core/source-details';
import { loadExcelJS } from '../../core/exceljs';
import type { CommercialArea, ContractType, CustomerType } from './repository';

export type LegacyPortfolioRow = {
  customerName: string;
  customerType: CustomerType | null;
  commercialArea: CommercialArea | null;
  contractReference: string;
  orderReference: string | null;
  contractType: ContractType;
  startsAt: string | null;
  endsAt: string | null;
  division: string | null;
  active: boolean | null;
  modelLabel: string;
  brand: string | null;
  description: string | null;
  serialNumber: string | null;
  interior: string | null;
  city: string | null;
  branch: string | null;
  address: string | null;
  location: string | null;
  sourceDetails?: SourceDetail[];
  sourceSheetName?: string;
  sourceRowNumber?: number;
};

export type LegacyPortfolioParseResult = {
  rows: LegacyPortfolioRow[];
  skippedRows: number;
  duplicateRows: number;
  sheets: number;
};

export const LEGACY_FLEET_METADATA_TYPES = ['contracts', 'contract-details', 'classification'] as const;
export type LegacyFleetMetadataType = (typeof LEGACY_FLEET_METADATA_TYPES)[number];

export type LegacyFleetMetadataRow = {
  customerName: string;
  contractReference: string | null;
  orderReference: string | null;
  contractType: ContractType | null;
  startsAt: string | null;
  endsAt: string | null;
  customerType: CustomerType | null;
  commercialArea: CommercialArea | null;
  contractCommercialArea?: CommercialArea | null;
  division: string | null;
  active: boolean | null;
  requiresClosure: boolean | null;
  sourceDetails?: SourceDetail[];
  sourceSheetName?: string;
  sourceRowNumber?: number;
};

export type LegacyFleetMetadataParseResult = {
  sourceType: LegacyFleetMetadataType;
  rows: LegacyFleetMetadataRow[];
  skippedRows: number;
  duplicateRows: number;
  sheets: number;
};

export type CanonDiscontinuationRow = {
  modelLabel: string;
  partCode: string;
  endsAt: string | null;
  voltage?: string | null;
  sourceNotes?: string[];
  source: string;
};

export type CanonDiscontinuationParseResult = {
  items: CanonDiscontinuationRow[];
  skippedRows: number;
  duplicateRows: number;
  sheets: number;
};

export type WaldbottStockRow = {
  modelLabel: string;
  deposit: string;
  quantity: number;
  source: string;
};

export type WaldbottStockParseResult = {
  rows: WaldbottStockRow[];
  skippedRows: number;
  sheets: number;
};

type HeaderIndexes = {
  customer: number;
  customerType: number;
  commercialArea: number;
  contract: number;
  orderReference: number;
  contractType: number;
  startsAt: number;
  endsAt: number;
  division: number;
  active: number;
  model: number;
  brand: number;
  description: number;
  serial: number;
  interior: number;
  city: number;
  branch: number;
  address: number;
  location: number;
};

type FleetMetadataHeaderIndexes = {
  customer: number;
  contract: number;
  orderReference: number;
  contractType: number;
  startsAt: number;
  endsAt: number;
  customerType: number;
  commercialArea: number;
  division: number;
  active: number;
  requiresClosure: number;
};

type ParsedRow = Record<string, unknown>;

const EMPTY_INDEX = -1;

export async function parseLegacyPortfolioWorkbook(data: Uint8Array): Promise<LegacyPortfolioParseResult> {
  const { Workbook } = await loadExcelJS();
  const workbook = new Workbook();
  const exactBuffer = data.buffer.slice(data.byteOffset, data.byteOffset + data.byteLength) as ArrayBuffer;
  await workbook.xlsx.load(exactBuffer);

  const rowsByKey = new Map<string, LegacyPortfolioRow>();
  let skippedRows = 0;
  let duplicateRows = 0;

  for (const sheet of workbook.worksheets) {
    const rows = worksheetToRows(sheet);
    const headerRowIndex = findHeaderRow(rows);
    if (headerRowIndex === EMPTY_INDEX) continue;

    const rawHeaders = rows[headerRowIndex] ?? [];
    const headers = rawHeaders.map((value) => normalizeHeader(value));
    const indexes = findHeaderIndexes(headers);
    for (let rowIndex = headerRowIndex + 1; rowIndex < rows.length; rowIndex += 1) {
      const row = rows[rowIndex] ?? [];
      if (row.every((value) => toText(value) === '')) continue;

      const parsed = parseRow(row, indexes, rawHeaders, sheet.name, rowIndex + 1);
      if (!parsed) {
        skippedRows += 1;
        continue;
      }

      const key = [
        normalizeKey(parsed.customerName),
        normalizeKey(parsed.contractReference),
        normalizeKey(parsed.modelLabel),
        normalizeKey(parsed.serialNumber ?? ''),
      ].join('::');
      const existing = rowsByKey.get(key);
      if (!existing) {
        rowsByKey.set(key, parsed);
        continue;
      }

      duplicateRows += 1;
      existing.customerType ??= parsed.customerType;
      existing.commercialArea ??= parsed.commercialArea;
      existing.startsAt ??= parsed.startsAt;
      existing.endsAt ??= parsed.endsAt;
      existing.serialNumber ??= parsed.serialNumber;
      existing.location ??= parsed.location;
      existing.sourceDetails = mergeSourceDetails(existing.sourceDetails, parsed.sourceDetails);
    }
  }

  return {
    rows: [...rowsByKey.values()],
    skippedRows,
    duplicateRows,
    sheets: workbook.worksheets.length,
  };
}

export async function parseLegacyFleetMetadataWorkbook(
  data: Uint8Array,
  sourceType: LegacyFleetMetadataType,
): Promise<LegacyFleetMetadataParseResult> {
  const { Workbook } = await loadExcelJS();
  const workbook = new Workbook();
  const exactBuffer = data.buffer.slice(data.byteOffset, data.byteOffset + data.byteLength) as ArrayBuffer;
  await workbook.xlsx.load(exactBuffer);

  const rowsByKey = new Map<string, LegacyFleetMetadataRow>();
  let skippedRows = 0;
  let duplicateRows = 0;

  for (const sheet of workbook.worksheets) {
    const rows = worksheetToRows(sheet);
    const headerRowIndex = findFleetMetadataHeaderRow(rows, sourceType);
    if (headerRowIndex === EMPTY_INDEX) continue;

    const rawHeaders = rows[headerRowIndex] ?? [];
    const headers = rawHeaders.map((value) => normalizeHeader(value));
    const indexes = findFleetMetadataHeaderIndexes(headers);
    for (let rowIndex = headerRowIndex + 1; rowIndex < rows.length; rowIndex += 1) {
      const row = rows[rowIndex] ?? [];
      if (row.every((value) => toText(value) === '')) continue;

      const parsed = parseFleetMetadataRow(row, indexes, sourceType, rawHeaders, sheet.name, rowIndex + 1);
      if (!parsed) {
        skippedRows += 1;
        continue;
      }

      const key = sourceType === 'classification'
        ? normalizeKey(parsed.customerName)
        : `${normalizeKey(parsed.customerName)}::${normalizeKey(parsed.contractReference ?? '')}`;
      const existing = rowsByKey.get(key);
      if (!existing) {
        rowsByKey.set(key, parsed);
        continue;
      }

      duplicateRows += 1;
      existing.contractReference ??= parsed.contractReference;
      existing.orderReference ??= parsed.orderReference;
      existing.contractType ??= parsed.contractType;
      existing.startsAt ??= parsed.startsAt;
      existing.endsAt ??= parsed.endsAt;
      existing.customerType ??= parsed.customerType;
      existing.commercialArea ??= parsed.commercialArea;
      existing.contractCommercialArea ??= parsed.contractCommercialArea;
      existing.division ??= parsed.division;
      existing.active ??= parsed.active;
      existing.requiresClosure ??= parsed.requiresClosure;
      existing.sourceDetails = mergeSourceDetails(existing.sourceDetails, parsed.sourceDetails);
    }
  }

  return {
    sourceType,
    rows: [...rowsByKey.values()],
    skippedRows,
    duplicateRows,
    sheets: workbook.worksheets.length,
  };
}

function findFleetMetadataHeaderRow(rows: unknown[][], sourceType: LegacyFleetMetadataType): number {
  for (let index = 0; index < Math.min(rows.length, 30); index += 1) {
    const headers = (rows[index] ?? []).map((value) => normalizeHeader(value));
    const hasCustomer = findHeader(headers, ['cliente', 'customer', 'razon social', 'nombre cliente']) !== EMPTY_INDEX;
    if (!hasCustomer) continue;
    if (sourceType === 'classification') {
      const hasClassification = findHeader(headers, [
        'sector', 'tipo de cliente', 'tipo cliente', 'customer type', 'segmento', 'publico privado',
        'area comercial interna', 'area comercial', 'commercial area', 'business area', 'sales area', 'area',
      ]) !== EMPTY_INDEX;
      if (hasClassification) return index;
      continue;
    }

    const hasContract = findHeader(headers, [
      'ref data', 'numero contrato', 'nro contrato', 'contrato', 'contract', 'id con',
    ]) !== EMPTY_INDEX;
    if (hasContract) return index;
  }
  return EMPTY_INDEX;
}

function findFleetMetadataHeaderIndexes(headers: string[]): FleetMetadataHeaderIndexes {
  return {
    customer: findHeader(headers, ['cliente', 'customer', 'razon social', 'nombre cliente', 'customer name']),
    contract: findHeader(headers, ['ref data', 'numero contrato', 'nro contrato', 'contrato', 'contract', 'id con']),
    orderReference: findHeader(headers, ['n ov', 'n o v', 'nro ov', 'numero ov', 'orden de venta', 'ov']),
    contractType: findHeader(headers, ['tipo contrato', 'tipo de contrato', 'contract type']),
    startsAt: findHeader(headers, ['fecha inicio', 'inicio contrato', 'contract start', 'start date']),
    endsAt: findHeader(headers, ['fecha fin', 'fin contrato', 'vencimiento', 'contract end', 'end date']),
    customerType: findHeader(headers, ['sector', 'tipo de cliente', 'tipo cliente', 'customer type', 'segmento cliente', 'publico privado']),
    commercialArea: findHeader(headers, ['area comercial interna', 'area comercial', 'commercial area', 'business area', 'sales area', 'area']),
    division: findHeader(headers, ['division', 'división', 'unidad de negocio']),
    active: findHeader(headers, ['vigente', 'activo', 'active', 'vigencia']),
    requiresClosure: findHeader(headers, ['requiere cierre', 'requiere cerrar', 'requires closure', 'cierre requerido']),
  };
}

function parseFleetMetadataRow(
  row: unknown[],
  indexes: FleetMetadataHeaderIndexes,
  sourceType: LegacyFleetMetadataType,
  rawHeaders: unknown[],
  sourceSheetName: string,
  sourceRowNumber: number,
): LegacyFleetMetadataRow | null {
  const customerName = toText(readCell(row, indexes.customer));
  if (!customerName) return null;

  const customerType = parseCustomerType(readCell(row, indexes.customerType));
  const commercialArea = parseCommercialArea(readCell(row, indexes.commercialArea));
  if (sourceType === 'classification') {
    if (!customerType && !commercialArea) return null;
    return {
      customerName,
      contractReference: null,
      orderReference: null,
      contractType: null,
      startsAt: null,
      endsAt: null,
      customerType,
      commercialArea,
      division: nullableText(readCell(row, indexes.division)),
      active: parseBoolean(readCell(row, indexes.active)),
      requiresClosure: parseBoolean(readCell(row, indexes.requiresClosure)),
      sourceDetails: buildCompleteSourceDetails(rawHeaders, row, []),
      sourceSheetName,
      sourceRowNumber,
    };
  }

  const contractReference = nullableText(readCell(row, indexes.contract));
  if (!contractReference) return null;
  return {
    customerName,
    contractReference,
    orderReference: nullableText(readCell(row, indexes.orderReference)),
    contractType: nullableText(readCell(row, indexes.contractType)) ? parseContractType(readCell(row, indexes.contractType)) : null,
    startsAt: parseDate(readCell(row, indexes.startsAt)),
    endsAt: parseDate(readCell(row, indexes.endsAt)),
    customerType,
    commercialArea,
    contractCommercialArea: commercialArea,
    division: nullableText(readCell(row, indexes.division)),
    active: parseBoolean(readCell(row, indexes.active)),
    requiresClosure: parseBoolean(readCell(row, indexes.requiresClosure)),
    sourceDetails: buildCompleteSourceDetails(rawHeaders, row, []),
    sourceSheetName,
    sourceRowNumber,
  };
}

function worksheetToRows(sheet: Worksheet): unknown[][] {
  const rows: unknown[][] = [];
  const columnCount = sheet.actualColumnCount || sheet.columnCount;
  sheet.eachRow({ includeEmpty: true }, (row, rowNumber) => {
    rows[rowNumber - 1] = Array.from({ length: columnCount }, (_, index) => cellToPrimitive(row.getCell(index + 1).value));
  });
  return rows;
}

function cellToPrimitive(value: CellValue): string | number | boolean | Date | undefined {
  if (value === null || value === undefined) return undefined;
  if (value instanceof Date) return value;
  if (typeof value !== 'object') return value;
  if ('richText' in value) return value.richText.map((item) => item.text).join('');
  if ('result' in value) return typeof value.result === 'number' || typeof value.result === 'string' ? value.result : undefined;
  if ('text' in value) return String(value.text);
  return undefined;
}

function findHeaderRow(rows: unknown[][]): number {
  for (let index = 0; index < Math.min(rows.length, 20); index += 1) {
    const headers = (rows[index] ?? []).map((value) => normalizeHeader(value));
    const hasCustomer = findHeader(headers, ['cliente', 'customer', 'razon social', 'nombre cliente']) !== EMPTY_INDEX;
    const hasContract = findHeader(headers, ['ref data', 'numero contrato', 'nro contrato', 'contrato', 'contract', 'ov']) !== EMPTY_INDEX;
    const hasModel = findHeader(headers, ['modelo', 'model', 'equipo', 'machine', 'machines']) !== EMPTY_INDEX;
    if (hasCustomer && hasContract && hasModel) return index;
  }
  return EMPTY_INDEX;
}

function findHeaderIndexes(headers: string[]): HeaderIndexes {
  return {
    customer: findHeader(headers, ['cliente', 'customer', 'razon social', 'nombre cliente', 'customer name']),
    customerType: findHeader(headers, ['sector', 'tipo de cliente', 'tipo cliente', 'customer type', 'segmento', 'segmento cliente', 'publico privado']),
    commercialArea: findHeader(headers, ['area comercial interna', 'area comercial', 'commercial area', 'business area', 'sales area', 'area']),
    contract: findHeader(headers, ['ref data', 'numero contrato', 'nro contrato', 'contrato', 'contract', 'ov']),
    orderReference: findHeader(headers, ['n ov', 'n o v', 'nro ov', 'numero ov', 'orden de venta', 'ov']),
    contractType: findHeader(headers, ['tipo contrato', 'contract type', 'tipo']),
    startsAt: findHeader(headers, ['fecha inicio', 'inicio contrato', 'contract start', 'start date']),
    endsAt: findHeader(headers, ['fecha fin', 'fin contrato', 'vencimiento', 'contract end', 'end date']),
    division: findHeader(headers, ['division', 'división', 'unidad de negocio']),
    active: findHeader(headers, ['vigente', 'activo', 'active', 'vigencia']),
    model: findHeader(headers, ['modelo', 'model', 'equipo', 'machine', 'machines']),
    brand: findHeader(headers, ['marca', 'brand']),
    description: findHeader(headers, ['descripcion', 'descripción', 'description']),
    serial: findHeader(headers, ['serie', 'serial', 'numero de serie', 'número de serie']),
    interior: findHeader(headers, ['interior', 'oficina', 'dependencia']),
    city: findHeader(headers, ['ciudad', 'city', 'municipio']),
    branch: findHeader(headers, ['sucursal', 'branch']),
    address: findHeader(headers, ['direccion', 'dirección', 'address']),
    location: findHeader(headers, ['ubicacion', 'ubicación', 'location', 'sucursal']),
  };
}

function findHeader(headers: string[], aliases: readonly string[]): number {
  const normalizedAliases = aliases.map(normalizeHeader);
  const exact = headers.findIndex((header) => normalizedAliases.includes(header));
  if (exact !== EMPTY_INDEX) return exact;
  return headers.findIndex((header) => normalizedAliases.some((alias) => alias && header.includes(alias)));
}

function parseRow(
  row: unknown[],
  indexes: HeaderIndexes,
  rawHeaders: unknown[],
  sourceSheetName: string,
  sourceRowNumber: number,
): LegacyPortfolioRow | null {
  const customerName = toText(readCell(row, indexes.customer));
  const contractReference = toText(readCell(row, indexes.contract));
  const modelLabel = toText(readCell(row, indexes.model));
  if (!customerName || !contractReference || !modelLabel) return null;

  return {
    customerName,
    customerType: parseCustomerType(readCell(row, indexes.customerType)),
    commercialArea: parseCommercialArea(readCell(row, indexes.commercialArea)),
    contractReference,
    orderReference: nullableText(readCell(row, indexes.orderReference)),
    contractType: parseContractType(readCell(row, indexes.contractType)),
    startsAt: parseDate(readCell(row, indexes.startsAt)),
    endsAt: parseDate(readCell(row, indexes.endsAt)),
    division: nullableText(readCell(row, indexes.division)),
    active: parseBoolean(readCell(row, indexes.active)),
    modelLabel,
    brand: nullableText(readCell(row, indexes.brand)),
    description: nullableText(readCell(row, indexes.description)),
    serialNumber: nullableText(readCell(row, indexes.serial)),
    interior: nullableText(readCell(row, indexes.interior)),
    city: nullableText(readCell(row, indexes.city)),
    branch: nullableText(readCell(row, indexes.branch)),
    address: nullableText(readCell(row, indexes.address)),
    location: nullableText(readCell(row, indexes.location)),
    sourceDetails: buildCompleteSourceDetails(rawHeaders, row, []),
    sourceSheetName,
    sourceRowNumber,
  };
}

function mergeSourceDetails(
  current: SourceDetail[] | undefined,
  incoming: SourceDetail[] | undefined,
): SourceDetail[] | undefined {
  if (!incoming || incoming.length === 0) return current;
  const merged = [...(current ?? [])];
  for (const detail of incoming) {
    if (!merged.some((candidate) => candidate.label === detail.label && candidate.value === detail.value)) {
      merged.push(detail);
    }
  }
  return merged;
}

function readCell(row: unknown[], index: number): unknown {
  return index === EMPTY_INDEX ? undefined : row[index];
}

function parseCustomerType(value: unknown): CustomerType | null {
  const key = normalizeHeader(value);
  if (key.includes('public')) return 'Publico';
  if (key.includes('privad')) return 'Privado';
  return null;
}

function parseCommercialArea(value: unknown): CommercialArea | null {
  const key = normalizeHeader(value);
  if (key.includes('strategic') || key.includes('estrateg')) return 'Strategic';
  if (key.includes('commercial') || key.includes('comercial')) return 'Commercial';
  return null;
}

function parseBoolean(value: unknown): boolean | null {
  const key = normalizeHeader(value);
  if (!key) return null;
  if (['si', 's', 'yes', 'y', 'true', '1', 'activo', 'activa', 'vigente'].includes(key)) return true;
  if (['no', 'n', 'not', 'false', '0', 'inactivo', 'inactiva', 'vencido', 'vencida'].includes(key)) return false;
  return null;
}

function parseContractType(value: unknown): ContractType {
  const key = normalizeHeader(value);
  if (key.includes('alquiler')) return 'Alquiler';
  if (key.includes('abierto')) return 'Abierto';
  if (key.includes('leasing')) return 'Leasing';
  return 'Mantenimiento';
}

function parseDate(value: unknown): string | null {
  if (value === undefined || value === null || value === '') return null;
  if (value instanceof Date) return formatDate(value);
  if (typeof value === 'number') {
    if (!Number.isFinite(value) || value <= 0) return null;
    const serialDate = new Date(Date.UTC(1899, 11, 30) + value * 86_400_000);
    const year = serialDate.getUTCFullYear();
    return year >= 1900 && year <= 2200 ? formatDate(serialDate) : null;
  }

  const text = toText(value);
  if (!text || /^\d+(?:\.\d+)?$/.test(text)) return null;
  const iso = text.match(/^(\d{4})[-/](\d{1,2})[-/](\d{1,2})$/);
  if (iso) return buildDate(Number(iso[1]), Number(iso[2]), Number(iso[3]));
  const slash = text.match(/^(\d{1,2})[-/](\d{1,2})[-/](\d{2,4})$/);
  if (slash) {
    const year = Number(slash[3]) < 100 ? 2000 + Number(slash[3]) : Number(slash[3]);
    return buildDate(year, Number(slash[2]), Number(slash[1]));
  }

  const middleOfYear = text.match(/^MID(?:DLE)?\s+(\d{4})$/i);
  if (middleOfYear) return buildDate(Number(middleOfYear[1]), 6, 30);
  const parsed = new Date(text);
  return Number.isNaN(parsed.getTime()) ? null : formatDate(parsed);
}

function buildDate(year: number, month: number, day: number): string | null {
  if (year < 1900 || year > 2200 || month < 1 || month > 12 || day < 1 || day > 31) return null;
  const date = new Date(Date.UTC(year, month - 1, day));
  if (date.getUTCFullYear() !== year || date.getUTCMonth() !== month - 1 || date.getUTCDate() !== day) return null;
  return date.toISOString().slice(0, 10);
}

function formatDate(value: Date): string | null {
  return Number.isNaN(value.getTime()) ? null : value.toISOString().slice(0, 10);
}

function toText(value: unknown): string {
  return String(value ?? '').trim().replace(/\s+/g, ' ');
}

function nullableText(value: unknown): string | null {
  const text = toText(value);
  return text || null;
}

function normalizeHeader(value: unknown): string {
  return toText(value)
    .normalize('NFD')
    .replace(/[\u0300-\u036f]/g, '')
    .toLowerCase()
    .replace(/[^a-z0-9]+/g, ' ')
    .trim()
    .replace(/\s+/g, ' ');
}

function normalizeKey(value: string): string {
  return normalizeHeader(value).replace(/[^a-z0-9]+/g, '');
}

const canonMonthNumbers: Record<string, number> = {
  JAN: 1,
  JANUARY: 1,
  FEB: 2,
  FEBRUARY: 2,
  MAR: 3,
  MARCH: 3,
  APR: 4,
  APRIL: 4,
  MAY: 5,
  JUN: 6,
  JUNE: 6,
  JUL: 7,
  JULY: 7,
  AUG: 8,
  AUGUST: 8,
  SEP: 9,
  SEPT: 9,
  SEPTEMBER: 9,
  OCT: 10,
  OCTOBER: 10,
  NOV: 11,
  NOVEMBER: 11,
  DEC: 12,
  DECEMBER: 12,
};

const canonEndMarker = /\b(?:PARTS\s+(?:SUPPORT\s+)?END(?:\s+DATE)?|SUPPORT\s+END(?:\s+DATE)?|END\s+OF\s+PARTS|END\s+DATE)\s*:?\s*/i;

export async function parseCanonDiscontinuationWorkbook(data: Uint8Array, sourceName: string): Promise<CanonDiscontinuationParseResult> {
  const { Workbook } = await loadExcelJS();
  const workbook = new Workbook();
  const exactBuffer = data.buffer.slice(data.byteOffset, data.byteOffset + data.byteLength) as ArrayBuffer;
  await workbook.xlsx.load(exactBuffer);

  const itemsByKey = new Map<string, CanonDiscontinuationRow>();
  let skippedRows = 0;
  let duplicateRows = 0;

  for (const sheet of workbook.worksheets) {
    const rows = worksheetToRows(sheet);
    let accessoriesSection = false;
    let header: CanonHeader | undefined;
    const source = `${sourceName} · ${sheet.name}`;
    for (const row of rows) {
      if (row.every((value) => toText(value) === '')) continue;

      const nextHeader = canonHeaderFromRow(row);
      if (isCanonAccessoriesRow(row)) {
        accessoriesSection = true;
        continue;
      }
      if (nextHeader) {
        header = nextHeader;
        accessoriesSection = false;
        continue;
      }
      if (accessoriesSection) {
        if (isCanonCategoryRow(row)) accessoriesSection = false;
        else continue;
      }

      const item = header ? mappedCanonItem(row, header, source) : compactCanonItem(row, source);
      if (!item) {
        if (!isCanonCategoryRow(row)) skippedRows += 1;
        continue;
      }

      const key = `${normalizeKey(item.modelLabel)}::${normalizeKey(item.partCode)}::${item.endsAt ?? ''}`;
      if (itemsByKey.has(key)) {
        duplicateRows += 1;
        const existing = itemsByKey.get(key);
        if (existing) {
          existing.voltage = mergeCanonText(existing.voltage, item.voltage);
          existing.sourceNotes = mergeCanonNotes(existing.sourceNotes, item.sourceNotes);
        }
        continue;
      }
      itemsByKey.set(key, item);
    }
  }

  return {
    items: [...itemsByKey.values()],
    skippedRows,
    duplicateRows,
    sheets: workbook.worksheets.length,
  };
}

type CanonHeader = {
  modelIndex: number;
  partIndex?: number;
  voltageIndex?: number;
  endIndex?: number;
};

type WaldbottStockHeader = {
  modelIndex: number;
  depositIndex: number;
  quantityIndex: number;
};

function canonToken(value: unknown): string {
  return normalizeHeader(value).replace(/ /g, '').toUpperCase();
}

function isCanonModelHeader(value: unknown): boolean {
  return ['MACHINE', 'MACHINES', 'MODEL', 'MODELO'].includes(canonToken(value));
}

function isCanonPartHeader(value: unknown): boolean {
  const key = canonToken(value);
  return key === 'ITEMCODE' || key === 'PARTCODE' || key.includes('PARTSITEMCODE');
}

function isCanonDateHeader(value: unknown): boolean {
  const key = canonToken(value);
  return key.includes('SUPPORTEND') || key.includes('PARTSEND') || key.includes('ENDDATE') || key.includes('ENDOFPARTS');
}

function isCanonVoltageHeader(value: unknown): boolean {
  const key = canonToken(value);
  return key === 'VOLTAGE' || key === 'VOLT' || key === 'TENSION';
}

function canonHeaderFromRow(row: unknown[]): CanonHeader | undefined {
  const modelIndex = row.findIndex(isCanonModelHeader);
  if (modelIndex < 0) return undefined;
  const partIndex = row.findIndex(isCanonPartHeader);
  const voltageIndex = row.findIndex(isCanonVoltageHeader);
  const endIndex = row.findIndex(isCanonDateHeader);
  if (partIndex < 0 && endIndex < 0) return undefined;
  return {
    modelIndex,
    partIndex: partIndex >= 0 ? partIndex : undefined,
    voltageIndex: voltageIndex >= 0 ? voltageIndex : undefined,
    endIndex: endIndex >= 0 ? endIndex : undefined,
  };
}

function isCanonAccessoriesRow(row: unknown[]): boolean {
  return row.some((value) => canonToken(value) === 'ACCESSORIES');
}

function isCanonPartCode(value: unknown): boolean {
  const valueText = toText(value);
  if (!valueText || valueText.length < 5) return false;
  return valueText.split(/\s+/).every((code) => /^[A-Z0-9]+(?:-[A-Z0-9]+)*$/i.test(code) && /[A-Z]/i.test(code) && /\d/.test(code));
}

function isCanonCategoryRow(row: unknown[]): boolean {
  const values = row.map(toText).filter((value) => value && value !== '.');
  return values.length === 1 && !canonDate(values[0]) && !isCanonPartCode(values[0]);
}

function mappedCanonItem(row: unknown[], header: CanonHeader, source: string): CanonDiscontinuationRow | undefined {
  const rawModel = row[header.modelIndex];
  const modelLabel = canonModel(rawModel);
  const partCode = header.partIndex === undefined ? '' : toText(row[header.partIndex]);
  const endsAt = (header.endIndex === undefined ? null : canonDate(row[header.endIndex])) ?? canonDate(rawModel);
  if (!modelLabel || isCanonModelHeader(modelLabel) || canonToken(modelLabel) === 'ACCESSORIES' || (!partCode && !endsAt)) return undefined;
  return {
    modelLabel,
    partCode,
    endsAt,
    voltage: nullableText(readCell(row, header.voltageIndex ?? EMPTY_INDEX)),
    sourceNotes: canonSourceNotes(row, [header.modelIndex, header.partIndex, header.voltageIndex, header.endIndex]),
    source,
  };
}

function compactCanonItem(row: unknown[], source: string): CanonDiscontinuationRow | undefined {
  const modelIndex = row.findIndex((value) => {
    const valueText = toText(value);
    return valueText !== '' && valueText !== '.';
  });
  if (modelIndex < 0) return undefined;
  const rawModel = row[modelIndex];
  const modelLabel = canonModel(rawModel);
  if (!modelLabel || modelLabel === '.' || isCanonModelHeader(modelLabel) || canonToken(modelLabel) === 'ACCESSORIES') return undefined;

  let endsAt = canonDate(rawModel);
  let dateIndex = endsAt ? modelIndex : -1;
  for (let index = modelIndex + 1; index < row.length && !endsAt; index += 1) {
    const candidate = canonDate(row[index]);
    if (!candidate) continue;
    endsAt = candidate;
    dateIndex = index;
  }

  const partIndex = row.findIndex((value, index) => index !== modelIndex && index !== dateIndex && isCanonPartCode(value));
  const partCode = partIndex === EMPTY_INDEX ? undefined : row[partIndex];
  const normalizedPartCode = partCode ? toText(partCode) : '';
  if (!endsAt && !normalizedPartCode) return undefined;
  return {
    modelLabel,
    partCode: normalizedPartCode,
    endsAt,
    sourceNotes: canonSourceNotes(row, [modelIndex, partIndex, dateIndex]),
    source,
  };
}

function canonSourceNotes(row: unknown[], excludedIndexes: readonly (number | undefined)[]): string[] {
  const excluded = new Set(excludedIndexes.filter((index): index is number => index !== undefined && index !== EMPTY_INDEX));
  return [...new Set(row
    .filter((_value, index) => !excluded.has(index))
    .map(toText)
    .filter((value) => value && value !== '.'))];
}

function mergeCanonText(current: string | null | undefined, incoming: string | null | undefined): string | null {
  const values = [...new Set([current, incoming].filter((value): value is string => Boolean(value && value.trim())).map((value) => value.trim()))];
  return values.length === 0 ? null : values.join(' / ');
}

function mergeCanonNotes(current: string[] | undefined, incoming: string[] | undefined): string[] {
  return [...new Set([...(current ?? []), ...(incoming ?? [])])];
}

function canonDate(value: unknown): string | null {
  if (value === undefined || value === null || value === '') return null;
  if (value instanceof Date) return formatDate(value);
  if (typeof value === 'number') {
    if (!Number.isFinite(value) || value <= 0) return null;
    return formatDate(new Date(Date.UTC(1899, 11, 30) + value * 86_400_000));
  }

  const valueText = toText(value).replace(/[.]+$/, '');
  const marker = valueText.match(canonEndMarker);
  const candidate = marker && marker.index !== undefined ? valueText.slice(marker.index + marker[0].length) : valueText;
  if (!candidate || /^\d+(?:\.\d+)?$/.test(candidate)) return null;

  const middleOfYear = candidate.match(/^MID(?:DLE)?\s+(\d{4})$/i);
  if (middleOfYear) return buildDate(Number(middleOfYear[1]), 6, 30);

  const iso = candidate.match(/^(\d{4})[-/](\d{1,2})[-/](\d{1,2})$/);
  if (iso) return buildDate(Number(iso[1]), Number(iso[2]), Number(iso[3]));
  const isoTimestamp = candidate.match(/^(\d{4})[-/](\d{1,2})[-/](\d{1,2})(?:[T\s].*)?$/);
  if (isoTimestamp) return buildDate(Number(isoTimestamp[1]), Number(isoTimestamp[2]), Number(isoTimestamp[3]));

  const slash = candidate.match(/^(\d{1,2})[-/](\d{1,2})[-/](\d{2,4})$/);
  if (slash) {
    const first = Number(slash[1]);
    const second = Number(slash[2]);
    const month = first > 12 ? second : first;
    const day = first > 12 ? first : second;
    const year = Number(slash[3]) < 100 ? 2000 + Number(slash[3]) : Number(slash[3]);
    return buildDate(year, month, day);
  }

  const monthPattern = Object.keys(canonMonthNumbers).join('|');
  const monthDayYear = candidate.match(new RegExp(`\\b(${monthPattern})\\s+(\\d{1,2})(?:st|nd|rd|th)?[\\s,/-]+(\\d{2,4})\\b`, 'i'));
  if (monthDayYear) {
    const rawYear = Number(monthDayYear[3]);
    return buildDate(rawYear < 100 ? 2000 + rawYear : rawYear, canonMonthNumbers[monthDayYear[1].toUpperCase()], Number(monthDayYear[2]));
  }

  const monthYear = candidate.match(new RegExp(`\\b(${monthPattern})\\s*[-/,\\s]+(\\d{2,4})\\b`, 'i'));
  if (monthYear) {
    const rawYear = Number(monthYear[2]);
    return buildDate(rawYear < 100 ? 2000 + rawYear : rawYear, canonMonthNumbers[monthYear[1].toUpperCase()], 1);
  }

  return null;
}

function canonModel(value: unknown): string {
  const valueText = toText(value);
  const marker = valueText.match(canonEndMarker);
  return marker && marker.index !== undefined
    ? valueText.slice(0, marker.index).replace(/[-:]\s*$/, '').trim()
    : valueText;
}

export async function parseWaldbottStockWorkbook(data: Uint8Array, sourceName: string): Promise<WaldbottStockParseResult> {
  const { Workbook } = await loadExcelJS();
  const workbook = new Workbook();
  const exactBuffer = data.buffer.slice(data.byteOffset, data.byteOffset + data.byteLength) as ArrayBuffer;
  await workbook.xlsx.load(exactBuffer);

  const rows: WaldbottStockRow[] = [];
  let skippedRows = 0;

  for (const sheet of workbook.worksheets) {
    const sheetRows = worksheetToRows(sheet);
    const headerRowIndex = findWaldbottStockHeaderRow(sheetRows);
    if (headerRowIndex === EMPTY_INDEX) continue;

    const headers = (sheetRows[headerRowIndex] ?? []).map((value) => normalizeHeader(value));
    const header = waldbottStockHeaderFromRow(headers);
    if (!header) continue;

    const source = `${sourceName} · ${sheet.name}`;
    for (let rowIndex = headerRowIndex + 1; rowIndex < sheetRows.length; rowIndex += 1) {
      const row = sheetRows[rowIndex] ?? [];
      if (row.every((value) => toText(value) === '')) continue;

      const modelLabel = toText(readCell(row, header.modelIndex));
      const deposit = toText(readCell(row, header.depositIndex));
      if (!modelLabel || !isWaldbottStockDeposit(deposit) || isExcludedWaldbottStockModel(modelLabel)) {
        skippedRows += 1;
        continue;
      }

      rows.push({
        modelLabel,
        deposit: '04',
        quantity: positiveWaldbottNumber(readCell(row, header.quantityIndex)),
        source,
      });
    }
  }

  return {
    rows,
    skippedRows,
    sheets: workbook.worksheets.length,
  };
}

function findWaldbottStockHeaderRow(rows: unknown[][]): number {
  for (let index = 0; index < Math.min(rows.length, 20); index += 1) {
    const headers = (rows[index] ?? []).map((value) => normalizeHeader(value));
    if (waldbottStockHeaderFromRow(headers)) return index;
  }
  return EMPTY_INDEX;
}

function waldbottStockHeaderFromRow(headers: string[]): WaldbottStockHeader | undefined {
  const modelIndex = findHeader(headers, [
    'descripción', 'descripcion', 'modelo', 'model', 'machine', 'machines',
    'equipment model', 'modelo de equipo',
  ]);
  const depositIndex = findHeader(headers, [
    'depósito', 'deposito', 'deposits', 'deposit', 'warehouse', 'almacen',
  ]);
  if (modelIndex === EMPTY_INDEX || depositIndex === EMPTY_INDEX) return undefined;
  return {
    modelIndex,
    depositIndex,
    quantityIndex: findHeader(headers, ['cantidad', 'quantity', 'qty', 'units', 'unidades', 'stock']),
  };
}

function positiveWaldbottNumber(value: unknown): number {
  if (typeof value === 'number' && Number.isFinite(value) && value > 0) return value;
  const valueText = toText(value).replace(/\s/g, '');
  if (!valueText) return 1;
  const normalizedNumber = valueText.includes(',') && valueText.includes('.')
    ? valueText.replace(/\./g, '').replace(',', '.')
    : valueText.replace(',', '.');
  const parsed = Number(normalizedNumber);
  return Number.isFinite(parsed) && parsed > 0 ? parsed : 1;
}

export function isWaldbottStockDeposit(value: unknown): boolean {
  const key = toText(value).replace(/\s/g, '');
  return key === '04' || key === '4';
}

export function isExcludedWaldbottStockModel(value: unknown): boolean {
  const key = normalizeKey(toText(value)).toUpperCase();
  const isProjector = key.includes('PROYECTOR') || key.includes('PROJECTOR');
  const isCasioOrBenq = key.includes('CASIO') || key.includes('BENQ');
  const isInteractiveScreen = (key.includes('PANTALLA') && key.includes('INTERACT'))
    || (key.includes('INTERACTIVE') && (key.includes('DISPLAY') || key.includes('SCREEN')));
  return isProjector || isCasioOrBenq || isInteractiveScreen || key.includes('EPSON');
}
