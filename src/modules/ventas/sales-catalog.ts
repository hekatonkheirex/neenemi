import type { Worksheet } from 'exceljs';
import { loadExcelJS } from '../../core/exceljs';
import { normalizePartCode } from '../catalogo/normalization';
import type {
  SalesCatalogDiscontinued,
  SalesCatalogItem,
  SalesCatalogKind,
  SalesCatalogMeta,
  SalesCatalogSnapshot,
} from './types';

type Primitive = string | number | boolean | Date | null | undefined;
export type SalesCatalogProgress = {
  phase: 'reading';
  message: string;
  percent: number;
};
type ProgressCallback = (progress: SalesCatalogProgress) => void;

function isRecord(value: unknown): value is Record<string, unknown> {
  return typeof value === 'object' && value !== null && !Array.isArray(value);
}

function cellToPrimitive(value: unknown): Primitive {
  if (value === null || value === undefined) return value;
  if (value instanceof Date) return value;
  if (typeof value !== 'object') {
    return typeof value === 'string' || typeof value === 'number' || typeof value === 'boolean' ? value : undefined;
  }

  if (isRecord(value) && Array.isArray(value.richText)) {
    return value.richText.map((part) => isRecord(part) ? String(part.text ?? '') : '').join('');
  }
  if (isRecord(value) && 'result' in value) return cellToPrimitive(value.result);
  if (isRecord(value) && 'text' in value) return String(value.text ?? '');
  return undefined;
}

function cellToText(value: unknown): string {
  const primitive = cellToPrimitive(value);
  if (primitive instanceof Date) return primitive.toISOString();
  return primitive === null || primitive === undefined ? '' : String(primitive).trim();
}

function normalizeHeader(value: unknown): string {
  return cellToText(value)
    .normalize('NFD')
    .replace(/[\u0300-\u036f]/g, '')
    .toLowerCase()
    .replace(/\s+/g, '')
    .replace(/[_-]/g, '');
}

function isCodeHeader(header: string): boolean {
  return (
    header === 'codigo' ||
    header === 'cod' ||
    header === 'sku' ||
    header.includes('codigo') ||
    header.includes('nroparte') ||
    header.includes('numeroparte') ||
    header.includes('partnumber') ||
    header.includes('partno') ||
    header.includes('itemcodigo')
  );
}

function isDescriptionHeader(header: string): boolean {
  return (
    header.includes('descripcion') ||
    header.includes('description') ||
    header.includes('detalle') ||
    header === 'desc' ||
    header === 'producto' ||
    header === 'parte'
  );
}

function isGroupHeader(header: string): boolean {
  return header.includes('categoria') || header === 'cat' || header.includes('familia') || header.includes('grupo');
}

function isLocalPriceHeader(header: string): boolean {
  return (
    header.includes('preciogs') ||
    header.includes('guarani') ||
    header.includes('pyg') ||
    header.includes('local') ||
    header === 'gs' ||
    header.includes('gs')
  );
}

function isUsdPriceHeader(header: string): boolean {
  return (
    header.includes('usd') ||
    header.includes('dolar') ||
    header.includes('precio$') ||
    header.includes('u$') ||
    header.includes('us$')
  );
}

function isPriceHeader(header: string): boolean {
  return header.includes('precio') || header.includes('price') || header.includes('cost') || header.includes('valor') || header.includes('importe') || header.includes('monto');
}

function isStockHeader(header: string): boolean {
  return header.includes('stock') || header.includes('cantidad') || header.includes('unidades') || header.includes('disponible');
}

function isDiscontinuedHeader(header: string): boolean {
  return header.includes('descontinu') || header.includes('discontinu') || header.includes('baja') || header.includes('inactive') || header.includes('estado');
}

function findIndex(headers: string[], predicate: (header: string) => boolean, excluded = new Set<number>()): number {
  return headers.findIndex((header, index) => header && !excluded.has(index) && predicate(header));
}

function findCodeIndex(headers: string[]): number {
  const preferred = findIndex(headers, (header) => header.includes('nroparte') || header.includes('numeroparte') || header.includes('partnumber') || header.includes('partno'));
  return preferred === -1 ? findIndex(headers, isCodeHeader) : preferred;
}

function parseNumber(value: Primitive): number | null {
  if (value === null || value === undefined || value === '') return null;
  if (typeof value === 'number') return Number.isFinite(value) ? value : null;
  if (typeof value === 'boolean' || value instanceof Date) return null;

  const raw = String(value).trim().replace(/[^\d,.-]/g, '');
  if (!raw || raw === '-' || raw === '.' || raw === ',') return null;

  const commaIndex = raw.lastIndexOf(',');
  const dotIndex = raw.lastIndexOf('.');
  let normalized = raw;
  if (commaIndex !== -1 && dotIndex !== -1) {
    const decimalIndex = Math.max(commaIndex, dotIndex);
    const decimalDigits = raw.length - decimalIndex - 1;
    if (decimalDigits === 3) {
      normalized = raw.replace(/[.,]/g, '');
    } else {
      const decimalSeparator = raw[decimalIndex];
      const thousandsSeparator = decimalSeparator === ',' ? '.' : ',';
      normalized = raw.replaceAll(thousandsSeparator, '').replace(decimalSeparator, '.');
    }
  } else if (commaIndex !== -1 || dotIndex !== -1) {
    const separator = commaIndex !== -1 ? ',' : '.';
    const parts = raw.split(separator);
    const lastPart = parts.at(-1) ?? '';
    const looksLikeThousands = parts.length > 1 && lastPart.length === 3 && parts.slice(0, -1).every((part) => part.length <= 3);
    normalized = looksLikeThousands ? raw.replaceAll(separator, '') : raw.replace(separator, '.');
  }

  const parsed = Number(normalized);
  return Number.isFinite(parsed) ? parsed : null;
}

function parseDiscontinued(value: Primitive): SalesCatalogDiscontinued {
  if (value === null || value === undefined || value === '') return 'unknown';
  if (typeof value === 'boolean') return value ? 'discontinued' : 'active';
  if (value instanceof Date) return 'discontinued';
  if (typeof value === 'number') return value === 0 ? 'active' : 'discontinued';

  const normalized = String(value)
    .normalize('NFD')
    .replace(/[\u0300-\u036f]/g, '')
    .trim()
    .toLowerCase();
  if (['no', 'false', '0', 'activo', 'active', 'vigente', 'n/a', 'na'].includes(normalized)) return 'active';
  if (['si', 'true', '1', 'descontinuado', 'discontinuado', 'baja', 'inactivo', 'inactive'].includes(normalized)) return 'discontinued';
  return 'discontinued';
}

function yieldToBrowser(): Promise<void> {
  return new Promise((resolve) => {
    if (typeof window !== 'undefined' && typeof window.requestAnimationFrame === 'function') {
      window.requestAnimationFrame(() => resolve());
    } else {
      setTimeout(resolve, 0);
    }
  });
}

function worksheetToRows(sheet: Worksheet): Primitive[][] {
  const rows: Primitive[][] = [];
  const columnCount = Math.max(sheet.actualColumnCount, sheet.columnCount);
  sheet.eachRow({ includeEmpty: true }, (row, rowNumber) => {
    rows[rowNumber - 1] = Array.from({ length: columnCount }, (_, index) => cellToPrimitive(row.getCell(index + 1).value));
  });
  return rows;
}

function detectHeader(rows: Primitive[][]): { rowIndex: number; headers: string[] } {
  for (let rowIndex = 0; rowIndex < Math.min(rows.length, 40); rowIndex += 1) {
    const headers = (rows[rowIndex] ?? []).map(normalizeHeader);
    const hasCode = headers.some(isCodeHeader);
    const hasDescription = headers.some(isDescriptionHeader);
    const hasPriceOrStock = headers.some((header) => isPriceHeader(header) || isStockHeader(header));
    if (hasCode && hasDescription && hasPriceOrStock) return { rowIndex, headers };
  }
  throw new Error('No se encontró una fila de encabezados con código, descripción y precio o stock.');
}

function createSnapshot(
  kind: SalesCatalogKind,
  fileName: string,
  items: SalesCatalogItem[],
  invalidRows: number,
  duplicateRows: number,
  hasDiscontinuedColumn: boolean,
): SalesCatalogSnapshot {
  const meta: SalesCatalogMeta = {
    kind,
    fileName,
    updatedAt: new Date().toISOString(),
    rowCount: items.length,
    invalidRows,
    duplicateRows,
    hasDiscontinuedColumn,
  };
  return { meta, items };
}

export async function parseSalesCatalogWorkbook(
  data: Uint8Array,
  kind: SalesCatalogKind,
  fileName: string,
  onProgress?: ProgressCallback,
): Promise<SalesCatalogSnapshot> {
  onProgress?.({ phase: 'reading', message: 'Abriendo la planilla…', percent: 8 });
  const { Workbook } = await loadExcelJS();
  const workbook = new Workbook();
  const exactBuffer = data.buffer.slice(data.byteOffset, data.byteOffset + data.byteLength) as ArrayBuffer;
  await workbook.xlsx.load(exactBuffer);
  const sheet = workbook.worksheets[0];
  if (!sheet) throw new Error('La planilla no contiene hojas de cálculo.');

  const rows = worksheetToRows(sheet);
  if (rows.length === 0) throw new Error('La planilla no contiene registros.');
  const { rowIndex: headerRow, headers } = detectHeader(rows);
  const codeIndex = findCodeIndex(headers);
  const descriptionIndex = findIndex(headers, isDescriptionHeader, new Set([codeIndex]));
  const groupIndex = findIndex(headers, isGroupHeader, new Set([codeIndex, descriptionIndex]));
  const excludedPriceColumns = new Set([codeIndex, descriptionIndex, groupIndex]);
  const usdPriceIndex = findIndex(headers, isUsdPriceHeader, excludedPriceColumns);
  const localPriceIndex = findIndex(headers, isLocalPriceHeader, new Set([...excludedPriceColumns, usdPriceIndex]));
  const genericPriceIndex = findIndex(headers, isPriceHeader, new Set([...excludedPriceColumns, usdPriceIndex, localPriceIndex]));
  const stockIndex = findIndex(headers, isStockHeader, new Set([...excludedPriceColumns, usdPriceIndex, localPriceIndex, genericPriceIndex]));
  const discontinuedIndex = findIndex(headers, isDiscontinuedHeader, new Set([...excludedPriceColumns, usdPriceIndex, localPriceIndex, genericPriceIndex, stockIndex]));

  if (codeIndex === -1 || descriptionIndex === -1) {
    throw new Error('La planilla debe contener columnas de código y descripción.');
  }

  const itemsByCode = new Map<string, SalesCatalogItem>();
  let invalidRows = 0;
  let duplicateRows = 0;
  onProgress?.({ phase: 'reading', message: 'Procesando códigos, precios y stock…', percent: 18 });

  for (let rowIndex = headerRow + 1; rowIndex < rows.length; rowIndex += 1) {
    const values = rows[rowIndex] ?? [];
    const code = cellToText(values[codeIndex]);
    if (!code) continue;

    const normalizedCode = normalizePartCode(code);
    if (!normalizedCode) {
      invalidRows += 1;
      continue;
    }

    const priceUsd = usdPriceIndex !== -1 ? parseNumber(cellToPrimitive(values[usdPriceIndex])) : null;
    const priceLocal = localPriceIndex !== -1 ? parseNumber(cellToPrimitive(values[localPriceIndex])) : null;
    const fallbackPrice = genericPriceIndex !== -1 ? parseNumber(cellToPrimitive(values[genericPriceIndex])) : null;
    const hasCurrencySpecificPrice = priceUsd !== null || priceLocal !== null;
    const genericHeader = genericPriceIndex !== -1 ? headers[genericPriceIndex] : '';
    const resolvedPriceUsd = priceUsd ?? (!hasCurrencySpecificPrice && (genericHeader.includes('$') || isUsdPriceHeader(genericHeader)) ? fallbackPrice : null);
    const resolvedPriceLocal = priceLocal ?? (!hasCurrencySpecificPrice && !genericHeader.includes('$') && !isUsdPriceHeader(genericHeader) ? fallbackPrice : null);

    if (itemsByCode.has(normalizedCode)) duplicateRows += 1;
    itemsByCode.set(normalizedCode, {
      id: `proformas-${kind}-${normalizedCode}`,
      kind,
      code,
      description: cellToText(values[descriptionIndex]),
      group: groupIndex !== -1 ? cellToText(values[groupIndex]) : '',
      priceUsd: resolvedPriceUsd,
      priceLocal: resolvedPriceLocal,
      stock: stockIndex !== -1 ? parseNumber(cellToPrimitive(values[stockIndex])) : null,
      discontinued: discontinuedIndex !== -1 ? parseDiscontinued(cellToPrimitive(values[discontinuedIndex])) : 'unknown',
    });

    if (rowIndex % 2500 === 0) {
      const percent = 18 + Math.round(((rowIndex - headerRow) / Math.max(1, rows.length - headerRow)) * 66);
      onProgress?.({ phase: 'reading', message: 'Procesando registros…', percent: Math.min(84, percent) });
      await yieldToBrowser();
    }
  }

  const items = [...itemsByCode.values()];
  if (items.length === 0) throw new Error('No se encontraron registros con códigos válidos en la planilla.');
  onProgress?.({ phase: 'reading', message: `${items.length.toLocaleString('es-PY')} registros listos.`, percent: 90 });
  await yieldToBrowser();
  return createSnapshot(kind, fileName, items, invalidRows, duplicateRows, discontinuedIndex !== -1);
}

export async function parseSalesCatalogFile(
  file: File,
  kind: SalesCatalogKind,
  onProgress?: ProgressCallback,
): Promise<SalesCatalogSnapshot> {
  return parseSalesCatalogWorkbook(new Uint8Array(await file.arrayBuffer()), kind, file.name, onProgress);
}
