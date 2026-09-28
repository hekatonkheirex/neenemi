import { buildCompleteSourceDetails } from '../../core/source-details';
import type { LegacyMaintenanceRecordInput } from './repository';
import { readWorkbookSheets, type WorkbookSheetRows } from '../consumibles/xlsx-helpers';

export type ParsedMaintenanceCounters = {
  records: LegacyMaintenanceRecordInput[];
  skippedRows: number;
  sheets: number;
  sourceSheets: WorkbookSheetRows[];
};

type CounterColumns = {
  customer: number;
  contract: number;
  model: number;
  serial: number;
  period: number;
  paper: number;
  copies: number;
  counter: number;
  division: number;
  branch: number;
  dataReference: number;
  contractType: number;
  active: number;
  serviceReport: number;
  taskCompleted: number;
  partsUsed: number;
};

const EMPTY_INDEX = -1;

export async function parseMaintenanceCounterWorkbook(data: Uint8Array): Promise<ParsedMaintenanceCounters> {
  const sourceSheets = await readWorkbookSheets(data);
  return parseCounterSheets(sourceSheets);
}

export function parseMaintenanceCounterCsv(content: string): ParsedMaintenanceCounters {
  const rows = parseCsvRows(content);
  return parseCounterSheets([{ name: 'CSV', rows }]);
}

function parseCounterSheets(sourceSheets: WorkbookSheetRows[]): ParsedMaintenanceCounters {
  const records: LegacyMaintenanceRecordInput[] = [];
  let skippedRows = 0;

  for (const sheet of sourceSheets) {
    const headerRowIndex = findHeaderRow(sheet.rows);
    if (headerRowIndex === EMPTY_INDEX) continue;
    const rawHeaders = sheet.rows[headerRowIndex] ?? [];
    const headers = rawHeaders.map(normalizeHeader);
    const columns = getCounterColumns(headers);

    for (let rowIndex = headerRowIndex + 1; rowIndex < sheet.rows.length; rowIndex += 1) {
      const row = sheet.rows[rowIndex] ?? [];
      if (row.every((value) => text(value) === '')) continue;

      const customerName = textAt(row, columns.customer);
      const modelLabel = textAt(row, columns.model);
      const serialNumber = textAt(row, columns.serial);
      const period = parsePeriod(row[columns.period]);
      const copies = parseNumber(row[columns.copies]);
      const counter = parseNumber(row[columns.counter]);
      if (!customerName || !modelLabel || !serialNumber || !period || copies === null || counter === null) {
        skippedRows += 1;
        continue;
      }

      const sourceDetails = buildCompleteSourceDetails(rawHeaders, row, [
        ['División', readHeaderValue(headers, row, ['division'])],
        ['Sucursal', readHeaderValue(headers, row, ['sucursal', 'branch'])],
        ['Ref DATA', readHeaderValue(headers, row, ['ref data', 'referencia data'])],
        ['Tipo contrato', readHeaderValue(headers, row, ['tipo contrato', 'tipo de contrato'])],
        ['Vigente', readHeaderValue(headers, row, ['vigente', 'activo'])],
        ['Nº I.S.', readHeaderValue(headers, row, ['n i s', 'n is', 'numero i s'])],
        ['Tarea realizada', readHeaderValue(headers, row, ['tarea realizada'])],
        ['Repuestos utilizados', readHeaderValue(headers, row, ['repuestos utilizados'])],
      ]);

      records.push({
        customerName,
        contractReference: textAt(row, columns.contract),
        modelLabel,
        serialNumber,
        period,
        paperType: textAt(row, columns.paper),
        copies,
        counter,
        sourceSheetName: sheet.name,
        sourceRowNumber: rowIndex + 1,
        ...(sourceDetails.length > 0 ? { sourceDetails } : {}),
      });
    }
  }

  return { records, skippedRows, sheets: sourceSheets.length, sourceSheets };
}

function getCounterColumns(headers: string[]): CounterColumns {
  return {
    customer: findHeader(headers, ['cliente', 'customer', 'client'], 0),
    contract: findHeader(headers, ['n o v', 'nro ov', 'numero ov', 'orden de venta', 'ov'], 1),
    model: findHeader(headers, ['equipo', 'modelo', 'model', 'printer', 'device'], 2),
    serial: findHeader(headers, ['n serie', 'nro serie', 'numero serie', 'nserie', 'serial', 'serie'], 3),
    period: findHeader(headers, ['ano mes', 'periodo', 'mes', 'fecha', 'year month'], 4),
    paper: findHeader(headers, ['papel', 'tipo de papel', 'tipo papel'], 5),
    copies: findHeader(headers, ['copias', 'copia', 'copies', 'cantidad', 'cant'], 6),
    counter: findHeader(headers, ['contador', 'acumulado', 'counter'], 7),
    division: findHeader(headers, ['division'], EMPTY_INDEX),
    branch: findHeader(headers, ['sucursal', 'branch'], EMPTY_INDEX),
    dataReference: findHeader(headers, ['ref data', 'referencia data'], EMPTY_INDEX),
    contractType: findHeader(headers, ['tipo contrato', 'tipo de contrato'], EMPTY_INDEX),
    active: findHeader(headers, ['vigente', 'activo'], EMPTY_INDEX),
    serviceReport: findHeader(headers, ['n i s', 'n is', 'numero i s'], EMPTY_INDEX),
    taskCompleted: findHeader(headers, ['tarea realizada'], EMPTY_INDEX),
    partsUsed: findHeader(headers, ['repuestos utilizados'], EMPTY_INDEX),
  };
}

function findHeaderRow(rows: unknown[][]): number {
  for (let index = 0; index < Math.min(rows.length, 20); index += 1) {
    const headers = (rows[index] ?? []).map(normalizeHeader);
    const hasCustomer = findHeader(headers, ['cliente', 'customer', 'client'], EMPTY_INDEX) !== EMPTY_INDEX;
    const hasModel = findHeader(headers, ['equipo', 'modelo', 'model', 'printer', 'device'], EMPTY_INDEX) !== EMPTY_INDEX;
    const hasSerial = findHeader(headers, ['n serie', 'nro serie', 'numero serie', 'nserie', 'serial', 'serie'], EMPTY_INDEX) !== EMPTY_INDEX;
    const hasMeasurement = findHeader(headers, ['copias', 'copia', 'copies', 'contador', 'acumulado', 'counter'], EMPTY_INDEX) !== EMPTY_INDEX;
    if (hasCustomer && hasModel && hasSerial && hasMeasurement) return index;
  }
  return EMPTY_INDEX;
}

function readHeaderValue(headers: string[], row: unknown[], aliases: readonly string[]): unknown {
  const index = findHeader(headers, aliases, EMPTY_INDEX);
  return index === EMPTY_INDEX ? undefined : row[index];
}

function findHeader(headers: string[], aliases: readonly string[], fallback: number): number {
  const normalizedAliases = aliases.map(normalizeHeader);
  const exact = headers.findIndex((header) => normalizedAliases.includes(header));
  if (exact !== EMPTY_INDEX) return exact;
  const partial = headers.findIndex((header) => normalizedAliases.some((alias) => alias && header.includes(alias)));
  return partial === EMPTY_INDEX ? fallback : partial;
}

function parseCsvRows(content: string): unknown[][] {
  const separator = detectSeparator(content);
  const rows: string[][] = [];
  let currentRow: string[] = [];
  let currentCell = '';
  let inQuotes = false;
  const textContent = content.replace(/^\uFEFF/, '');

  for (let index = 0; index < textContent.length; index += 1) {
    const character = textContent[index];
    if (character === '"') {
      if (inQuotes && textContent[index + 1] === '"') {
        currentCell += '"';
        index += 1;
      } else {
        inQuotes = !inQuotes;
      }
    } else if (character === separator && !inQuotes) {
      currentRow.push(currentCell.trim());
      currentCell = '';
    } else if ((character === '\n' || character === '\r') && !inQuotes) {
      if (character === '\r' && textContent[index + 1] === '\n') index += 1;
      currentRow.push(currentCell.trim());
      currentCell = '';
      if (currentRow.some((value) => value !== '')) rows.push(currentRow);
      currentRow = [];
    } else {
      currentCell += character;
    }
  }

  currentRow.push(currentCell.trim());
  if (currentRow.some((value) => value !== '')) rows.push(currentRow);
  return rows;
}

function detectSeparator(content: string): ',' | ';' {
  const firstLine = content.replace(/^\uFEFF/, '').split(/\r?\n/, 1)[0] ?? '';
  return (firstLine.match(/;/g)?.length ?? 0) > (firstLine.match(/,/g)?.length ?? 0) ? ';' : ',';
}

function parsePeriod(value: unknown): string | null {
  if (value instanceof Date) return validPeriod(value.getUTCFullYear(), value.getUTCMonth() + 1);
  if (typeof value === 'number' && Number.isFinite(value) && value > 0) {
    const date = new Date(Date.UTC(1899, 11, 30) + value * 86_400_000);
    return validPeriod(date.getUTCFullYear(), date.getUTCMonth() + 1);
  }

  const valueText = text(value);
  if (!valueText) return null;
  const yearMonth = valueText.match(/^(\d{4})[-/]([01]?\d)$/);
  if (yearMonth) return validPeriod(Number(yearMonth[1]), Number(yearMonth[2]));
  const dayMonthYear = valueText.match(/^(\d{1,2})[-/](\d{1,2})[-/](\d{2,4})/);
  if (dayMonthYear) {
    const year = Number(dayMonthYear[3]) < 100 ? 2000 + Number(dayMonthYear[3]) : Number(dayMonthYear[3]);
    return validPeriod(year, Number(dayMonthYear[2]));
  }
  const date = new Date(valueText);
  return Number.isNaN(date.getTime()) ? null : validPeriod(date.getUTCFullYear(), date.getUTCMonth() + 1);
}

function validPeriod(year: number, month: number): string | null {
  return year >= 1900 && year <= 2200 && month >= 1 && month <= 12
    ? `${year.toString().padStart(4, '0')}-${month.toString().padStart(2, '0')}`
    : null;
}

function parseNumber(value: unknown): number | null {
  if (typeof value === 'number') return Number.isFinite(value) && value >= 0 ? value : null;
  const valueText = text(value).replace(/[^\d,.-]/g, '');
  if (!valueText) return null;
  const lastComma = valueText.lastIndexOf(',');
  const lastDot = valueText.lastIndexOf('.');
  let normalized = valueText;
  if (lastComma !== EMPTY_INDEX && lastDot !== EMPTY_INDEX) {
    const decimalSeparator = lastComma > lastDot ? ',' : '.';
    normalized = valueText
      .replace(decimalSeparator === ',' ? /\./g : /,/g, '')
      .replace(decimalSeparator, '.');
  } else if (lastComma !== EMPTY_INDEX) {
    normalized = valueText.replace(/\./g, '').replace(',', '.');
  } else if ((valueText.match(/\./g)?.length ?? 0) > 1 || /\.\d{3}$/.test(valueText)) {
    normalized = valueText.replace(/\./g, '');
  }
  const parsed = Number.parseFloat(normalized);
  return Number.isFinite(parsed) && parsed >= 0 ? parsed : null;
}

function textAt(row: unknown[], index: number): string {
  return index === EMPTY_INDEX ? '' : text(row[index]);
}

function text(value: unknown): string {
  return String(value ?? '').trim().replace(/\s+/g, ' ');
}

function normalizeHeader(value: unknown): string {
  return text(value)
    .normalize('NFD')
    .replace(/[\u0300-\u036f]/g, '')
    .toLowerCase()
    .replace(/[^a-z0-9]+/g, ' ')
    .trim()
    .replace(/\s+/g, ' ');
}
