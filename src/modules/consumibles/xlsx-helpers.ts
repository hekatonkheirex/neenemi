import type { Cell, CellValue, Worksheet } from 'exceljs';
import { loadExcelJS } from '../../core/exceljs';

export type WorkbookSheetRows = {
  name: string;
  rows: unknown[][];
};

export type WorkbookReadOptions = {
  preserveMergedValues?: boolean;
};

export type WorkbookSourceRow = {
  values: unknown[];
  sheetName: string;
  rowNumber: number;
};

export type WorkbookSourceSheet = {
  name: string;
  rows: WorkbookSourceRow[];
};

export async function readWorkbookRows(data: Uint8Array): Promise<unknown[][]> {
  const sheets = await readWorkbookSheets(data);
  const firstSheet = sheets[0];
  if (!firstSheet) throw new Error('El archivo no contiene ninguna hoja de cálculo.');
  return firstSheet.rows;
}

export async function readWorkbookRowsWithSource(data: Uint8Array): Promise<WorkbookSourceRow[]> {
  const sheets = await readWorkbookSourceSheets(data);
  return sheets.flatMap((sheet) => sheet.rows);
}

export async function readWorkbookSourceSheets(data: Uint8Array): Promise<WorkbookSourceSheet[]> {
  const sheets = await readWorkbookSheets(data);
  return sheets.map((sheet) => ({
    name: sheet.name,
    rows: sheet.rows.map((values, index) => ({
      values,
      sheetName: sheet.name,
      rowNumber: index + 1,
    })),
  }));
}

export async function readWorkbookSheets(
  data: Uint8Array,
  options: WorkbookReadOptions = {},
): Promise<WorkbookSheetRows[]> {
  const { Workbook } = await loadExcelJS();
  const workbook = new Workbook();
  const exactBuffer = data.buffer.slice(data.byteOffset, data.byteOffset + data.byteLength) as ArrayBuffer;
  await workbook.xlsx.load(exactBuffer);
  if (workbook.worksheets.length === 0) throw new Error('El archivo no contiene ninguna hoja de cálculo.');
  return workbook.worksheets.map((sheet) => ({ name: sheet.name, rows: worksheetToRows(sheet, options) }));
}

export function cell(row: unknown[], index: number): string {
  const value = row[index];
  return value === null || value === undefined ? '' : String(value).trim();
}

export function safeNumber(value: unknown): number {
  if (typeof value === 'number') return Number.isFinite(value) ? value : 0;
  if (value === null || value === undefined || value === '') return 0;
  const normalized = String(value).trim().replace(/[^\d.,-]/g, '');
  if (!normalized) return 0;
  const decimal = normalized.includes(',') && !normalized.includes('.')
    ? normalized.replace(',', '.')
    : normalized.replace(/,/g, '');
  const parsed = Number.parseFloat(decimal);
  return Number.isFinite(parsed) ? parsed : 0;
}

/**
 * Normalizes the small variations used by the historical SGS/Superset exports.
 * The aliases remain explicit in each parser; this only makes punctuation,
 * ordinal abbreviations and common Spanish filler words equivalent.
 */
const normalizedNameCache = new Map<string, string>();

export function normalizeHeader(value: unknown): string {
  const raw = String(value ?? '');
  const cached = normalizedNameCache.get(raw);
  if (cached !== undefined) return cached;
  const normalized = normalizeHeaderUncached(raw);
  // Las cabeceras y alias son pocos; el tope evita crecer sin límite si llegan textos libres.
  if (normalizedNameCache.size < 5000) normalizedNameCache.set(raw, normalized);
  return normalized;
}

function normalizeHeaderUncached(raw: string): string {
  return raw
    .normalize('NFD')
    .replace(/[\u0300-\u036f]/g, '')
    .toLowerCase()
    .replace(/[^a-z0-9]+/g, ' ')
    .replace(/\b(?:de|del|la|el|los|las)\b/g, ' ')
    .replace(/\bfch\b/g, 'fecha')
    .replace(/\b(?:nro|numero)\b/g, 'n')
    .replace(/\s+/g, ' ')
    .trim();
}

// Los parsers llaman findHeaderIndex/readHeaderValue por fila con el mismo array de cabeceras.
// Normalizar todas las cabeceras en cada llamada era O(filas × lecturas × columnas) y dejaba
// la validación de Servicios LAM minutos al 100% de CPU. Se normaliza una vez por array.
const headerIndexCache = new WeakMap<unknown[], { length: number; firstByName: Map<string, number> }>();

function headerIndexFor(headers: unknown[]): Map<string, number> {
  const cached = headerIndexCache.get(headers);
  if (cached && cached.length === headers.length) return cached.firstByName;
  const firstByName = new Map<string, number>();
  headers.forEach((header, index) => {
    const name = normalizeHeader(header);
    if (!firstByName.has(name)) firstByName.set(name, index);
  });
  headerIndexCache.set(headers, { length: headers.length, firstByName });
  return firstByName;
}

export function findHeaderIndex(headers: unknown[], names: readonly string[], fallback: number): number {
  const firstByName = headerIndexFor(headers);
  let best = -1;
  for (const name of names) {
    const index = firstByName.get(normalizeHeader(name));
    if (index !== undefined && (best < 0 || index < best)) best = index;
  }
  return best >= 0 ? best : fallback;
}

export function readHeaderValue(headers: unknown[], row: unknown[], names: readonly string[]): unknown {
  const index = findHeaderIndex(headers, names, -1);
  return index >= 0 ? row[index] : undefined;
}

function worksheetToRows(sheet: Worksheet, options: WorkbookReadOptions): unknown[][] {
  const rows: unknown[][] = [];
  const columnCount = options.preserveMergedValues
    ? Math.max(sheet.actualColumnCount, sheet.columnCount, ...mergedColumnCounts(sheet))
    : sheet.actualColumnCount || sheet.columnCount;
  sheet.eachRow({ includeEmpty: true }, (row, rowNumber) => {
    rows[rowNumber - 1] = Array.from({ length: columnCount }, (_, index) => {
      const currentCell = row.getCell(index + 1);
      return cellToPrimitive(currentCell.value, currentCell);
    });
  });
  if (options.preserveMergedValues) fillMergedValues(rows, sheet);
  return rows;
}

function mergedColumnCounts(sheet: Worksheet): number[] {
  return (sheet.model.merges ?? []).flatMap((merge) => {
    const endAddress = merge.split(':')[1] ?? merge;
    const end = parseCellAddress(endAddress);
    return end ? [end.column] : [];
  });
}

function fillMergedValues(rows: unknown[][], sheet: Worksheet): void {
  for (const merge of sheet.model.merges ?? []) {
    const [startAddress, endAddress] = merge.split(':');
    const start = parseCellAddress(startAddress);
    const end = parseCellAddress(endAddress ?? startAddress);
    if (!start || !end) continue;

    const sourceCell = sheet.getCell(startAddress);
    const value = cellToPrimitive(sourceCell.value, sourceCell);
    if (value === undefined) continue;

    for (let rowIndex = start.row; rowIndex <= end.row; rowIndex += 1) {
      const row = rows[rowIndex - 1] ?? (rows[rowIndex - 1] = []);
      for (let columnIndex = start.column; columnIndex <= end.column; columnIndex += 1) {
        row[columnIndex - 1] = value;
      }
    }
  }
}

function parseCellAddress(address: string): { row: number; column: number } | null {
  const match = /^\$?([A-Z]+)\$?(\d+)$/i.exec(address.trim());
  if (!match) return null;

  let column = 0;
  for (const character of match[1].toUpperCase()) {
    column = column * 26 + character.charCodeAt(0) - 64;
  }
  const row = Number(match[2]);
  return Number.isInteger(row) && row > 0 && column > 0 ? { row, column } : null;
}

function cellToPrimitive(value: CellValue, currentCell?: Cell): string | number | boolean | Date | undefined {
  if (value === null || value === undefined) return undefined;
  if (value instanceof Date) return value;
  if (typeof value === 'number' && currentCell?.numFmt && /[dmy]/i.test(currentCell.numFmt)) {
    return new Date(Date.UTC(1899, 11, 30) + value * 86_400_000);
  }
  if (typeof value !== 'object') return value;
  if ('richText' in value) return value.richText.map((item) => item.text).join('');
  if ('result' in value) return typeof value.result === 'number' || typeof value.result === 'string' ? value.result : undefined;
  if ('text' in value) return String(value.text);
  return undefined;
}
