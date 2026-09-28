import type { Worksheet } from 'exceljs';
import { extractPdfTextLinesFromBytes } from './service-report';
import { normalizePartCode } from '../catalogo/normalization';
import { loadExcelJS } from '../../core/exceljs';
import type {
  ContractPriceCurrency,
  OpenContractItem,
  OpenContractMeta,
  OpenContractSnapshot,
} from './types';

type Primitive = string | number | boolean | Date | null | undefined;
export type OpenContractProgress = {
  phase: 'reading';
  message: string;
  percent: number;
};
type ProgressCallback = (progress: OpenContractProgress) => void;

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

function normalizeSearchText(value: string): string {
  return value
    .normalize('NFD')
    .replace(/[\u0300-\u036f]/g, '')
    .toLowerCase();
}

function isCodeHeader(header: string): boolean {
  return (
    header === 'codigo' ||
    header.includes('codigo') ||
    header === 'cod' ||
    header === 'sku' ||
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

function isKindHeader(header: string): boolean {
  return (
    header.includes('tipo') ||
    header.includes('clase') ||
    header.includes('categoria') ||
    header.includes('familia') ||
    header.includes('grupo')
  );
}

function isLocalPriceHeader(header: string): boolean {
  return (
    header.includes('preciogs') ||
    header.includes('guarani') ||
    header.includes('guaranies') ||
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
    header.includes('dolares') ||
    header.includes('precio$') ||
    header.includes('u$') ||
    header.includes('u$s') ||
    header.includes('us$')
  );
}

function isPriceHeader(header: string): boolean {
  return (
    header.includes('precio') ||
    header.includes('price') ||
    header.includes('valor') ||
    header.includes('importe') ||
    header.includes('monto') ||
    header.includes('costo') ||
    header.includes('tarifa') ||
    header.includes('fijo')
  );
}

function findIndex(headers: string[], predicate: (header: string) => boolean, excluded = new Set<number>()): number {
  return headers.findIndex((header, index) => header && !excluded.has(index) && predicate(header));
}

function findCodeIndex(headers: string[]): number {
  const preferred = findIndex(headers, (header) => (
    header.includes('nroparte') ||
    header.includes('numeroparte') ||
    header.includes('partnumber') ||
    header.includes('partno')
  ));
  return preferred !== -1 ? preferred : findIndex(headers, isCodeHeader);
}

function parseNumber(value: Primitive | string): number | null {
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

function parseKind(value: string): OpenContractItem['kind'] | null {
  const normalized = normalizeSearchText(value);
  if (/(consum|toner|cartucho|insumo|kit)/.test(normalized)) return 'consumibles';
  if (/(repuest|parte|pieza|accesorio)/.test(normalized)) return 'repuestos';
  return null;
}

function inferKind(value: string): OpenContractItem['kind'] {
  return parseKind(value) ?? 'repuestos';
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

function createItem(
  code: string,
  description: string,
  kind: OpenContractItem['kind'],
  price: number,
  priceCurrency: ContractPriceCurrency,
  group = '',
): OpenContractItem {
  const normalizedCode = normalizePartCode(code);
  return {
    id: `contrato-${normalizedCode}`,
    kind,
    code: code.trim(),
    description: description.trim(),
    group: group.trim(),
    priceUsd: priceCurrency === 'usd' ? price : null,
    priceLocal: priceCurrency === 'local' ? price : null,
  };
}

function resolvePriceColumn(headers: string[]): { index: number; currency: ContractPriceCurrency } {
  const localIndex = findIndex(headers, isLocalPriceHeader);
  if (localIndex !== -1) return { index: localIndex, currency: 'local' };

  const genericIndex = findIndex(headers, isPriceHeader);
  if (genericIndex !== -1) {
    return { index: genericIndex, currency: isUsdPriceHeader(headers[genericIndex]) ? 'usd' : 'local' };
  }

  const usdIndex = findIndex(headers, isUsdPriceHeader);
  if (usdIndex !== -1) return { index: usdIndex, currency: 'usd' };
  return { index: -1, currency: 'local' };
}

type WorkbookHeader = {
  rowIndex: number;
  codeIndex: number;
  descriptionIndex: number;
  kindIndex: number;
  priceIndex: number;
  priceCurrency: ContractPriceCurrency;
};

function detectWorkbookHeader(matrix: Primitive[][]): WorkbookHeader {
  for (let rowIndex = 0; rowIndex < Math.min(matrix.length, 40); rowIndex += 1) {
    const headers = matrix[rowIndex].map(normalizeHeader);
    const codeIndex = findCodeIndex(headers);
    const descriptionIndex = findIndex(headers, isDescriptionHeader, new Set([codeIndex]));
    const price = resolvePriceColumn(headers);
    if (codeIndex !== -1 && descriptionIndex !== -1 && price.index !== -1) {
      return {
        rowIndex,
        codeIndex,
        descriptionIndex,
        kindIndex: findIndex(headers, isKindHeader, new Set([codeIndex, descriptionIndex, price.index])),
        priceIndex: price.index,
        priceCurrency: price.currency,
      };
    }
  }

  throw new Error('No se encontró una fila de encabezados con código, descripción y precio fijo.');
}

function buildSnapshot(
  items: OpenContractItem[],
  fileName: string,
  sourceFormat: OpenContractMeta['sourceFormat'],
  invalidRows: number,
  duplicateRows: number,
  priceCurrency: ContractPriceCurrency,
  hasKindColumn: boolean,
): OpenContractSnapshot {
  return {
    meta: {
      fileName,
      updatedAt: new Date().toISOString(),
      rowCount: items.length,
      invalidRows,
      duplicateRows,
      sourceFormat,
      priceCurrency,
      hasKindColumn,
    },
    items,
  };
}

function worksheetToRows(sheet: Worksheet): Primitive[][] {
  const rows: Primitive[][] = [];
  const columnCount = Math.max(sheet.actualColumnCount, sheet.columnCount);
  sheet.eachRow({ includeEmpty: true }, (row, rowNumber) => {
    rows[rowNumber - 1] = Array.from({ length: columnCount }, (_, index) => cellToPrimitive(row.getCell(index + 1).value));
  });
  return rows;
}

export async function parseOpenContractWorkbook(
  data: Uint8Array,
  fileName: string,
  onProgress?: ProgressCallback,
): Promise<OpenContractSnapshot> {
  onProgress?.({ phase: 'reading', message: 'Abriendo el contrato…', percent: 8 });
  const { Workbook } = await loadExcelJS();
  const workbook = new Workbook();
  const exactBuffer = data.buffer.slice(data.byteOffset, data.byteOffset + data.byteLength) as ArrayBuffer;
  await workbook.xlsx.load(exactBuffer);
  const sheet = workbook.worksheets[0];
  if (!sheet) throw new Error('La planilla no contiene hojas de cálculo.');

  const matrix = worksheetToRows(sheet);
  if (matrix.length === 0) throw new Error('La planilla no contiene registros.');
  const header = detectWorkbookHeader(matrix);
  const itemsByCode = new Map<string, OpenContractItem>();
  let invalidRows = 0;
  let duplicateRows = 0;

  onProgress?.({ phase: 'reading', message: 'Procesando códigos y precios fijos…', percent: 18 });
  for (let rowIndex = header.rowIndex + 1; rowIndex < matrix.length; rowIndex += 1) {
    const values = matrix[rowIndex] ?? [];
    const code = cellToText(values[header.codeIndex]);
    if (!code) continue;

    const normalizedCode = normalizePartCode(code);
    const price = parseNumber(cellToPrimitive(values[header.priceIndex]));
    if (!normalizedCode || price === null || price < 0) {
      invalidRows += 1;
      continue;
    }

    const description = cellToText(values[header.descriptionIndex]);
    const kindValue = header.kindIndex !== -1 ? cellToText(values[header.kindIndex]) : '';
    const kind = inferKind(`${kindValue} ${description}`);
    if (itemsByCode.has(normalizedCode)) duplicateRows += 1;
    itemsByCode.set(normalizedCode, createItem(code, description, kind, price, header.priceCurrency, kindValue));

    if (rowIndex % 2500 === 0) {
      const percent = 18 + Math.round(((rowIndex - header.rowIndex) / Math.max(1, matrix.length - header.rowIndex)) * 66);
      onProgress?.({ phase: 'reading', message: 'Procesando registros…', percent: Math.min(84, percent) });
      await yieldToBrowser();
    }
  }

  const items = [...itemsByCode.values()];
  if (items.length === 0) throw new Error('No se encontraron filas con código y precio fijo válidos.');

  onProgress?.({ phase: 'reading', message: `${items.length.toLocaleString('es-PY')} registros listos.`, percent: 90 });
  await yieldToBrowser();
  return buildSnapshot(items, fileName, 'xlsx', invalidRows, duplicateRows, header.priceCurrency, header.kindIndex !== -1);
}

function detectPdfHeader(lines: string[]): { lineIndex: number; priceCurrency: ContractPriceCurrency } {
  for (let lineIndex = 0; lineIndex < Math.min(lines.length, 50); lineIndex += 1) {
    const header = normalizeHeader(lines[lineIndex]);
    const hasCode = header.includes('codigo') || header.includes('cod') || header.includes('nroparte') || header.includes('partnumber');
    const hasDescription = header.includes('descripcion') || header.includes('description') || header.includes('detalle') || header.includes('producto');
    const hasPrice = isPriceHeader(header) || isLocalPriceHeader(header) || isUsdPriceHeader(header);
    if (hasCode && hasDescription && hasPrice) {
      return { lineIndex, priceCurrency: isUsdPriceHeader(header) && !isLocalPriceHeader(header) ? 'usd' : 'local' };
    }
  }

  throw new Error('No se encontró una cabecera de código, descripción y precio fijo en el PDF.');
}

function extractTrailingPrice(line: string): { beforePrice: string; price: number } | null {
  const match = /((?:US\$|U\$S|USD|\$|Gs\.?|PYG)?\s*-?\d[\d.,]*\s*(?:US\$|U\$S|USD|\$|Gs\.?|PYG)?)\s*$/i.exec(line);
  if (!match) return null;
  const price = parseNumber(match[1]);
  return price === null || price < 0 ? null : { beforePrice: line.slice(0, match.index).trim(), price };
}

function parsePdfRow(line: string, priceCurrency: ContractPriceCurrency): { item: OpenContractItem; normalizedCode: string } | null {
  const price = extractTrailingPrice(line.replace(/\s+/g, ' ').trim());
  if (!price) return null;

  const tokens = price.beforePrice.split(/\s+/).filter(Boolean);
  if (tokens.length < 2) return null;
  const codeIndex = tokens.findIndex((token) => token.length >= 3 && /\d/.test(token) && /^[A-Za-z0-9][A-Za-z0-9./_-]*$/.test(token));
  const resolvedCodeIndex = codeIndex === -1 ? (tokens[0].match(/^\d+$/) && tokens.length > 2 ? 1 : 0) : codeIndex;
  const code = tokens[resolvedCodeIndex];
  const normalizedCode = normalizePartCode(code);
  if (!normalizedCode) return null;

  const description = tokens.slice(resolvedCodeIndex + 1).join(' ');
  if (!description) return null;
  const kind = inferKind(`${tokens.slice(0, resolvedCodeIndex).join(' ')} ${description}`);
  return { item: createItem(code, description, kind, price.price, priceCurrency), normalizedCode };
}

export async function parseOpenContractPdf(
  data: Uint8Array,
  fileName: string,
  onProgress?: ProgressCallback,
): Promise<OpenContractSnapshot> {
  onProgress?.({ phase: 'reading', message: 'Leyendo el texto del contrato…', percent: 12 });
  const lines = await extractPdfTextLinesFromBytes(data);
  if (lines.length === 0) {
    throw new Error('El PDF no contiene una capa de texto legible. Los contratos escaneados como imagen todavía no se pueden importar automáticamente.');
  }

  const header = detectPdfHeader(lines);
  const itemsByCode = new Map<string, OpenContractItem>();
  let invalidRows = 0;
  let duplicateRows = 0;
  onProgress?.({ phase: 'reading', message: 'Detectando líneas del contrato…', percent: 36 });

  for (let lineIndex = header.lineIndex + 1; lineIndex < lines.length; lineIndex += 1) {
    const line = lines[lineIndex].trim();
    if (!line) continue;
    if (/^(total|subtotal|observaciones?|vigencia|firma|autoriz)/i.test(line)) break;
    const parsed = parsePdfRow(line, header.priceCurrency);
    if (!parsed) {
      if (/\d/.test(line)) invalidRows += 1;
      continue;
    }

    if (itemsByCode.has(parsed.normalizedCode)) duplicateRows += 1;
    itemsByCode.set(parsed.normalizedCode, parsed.item);
  }

  const items = [...itemsByCode.values()];
  if (items.length === 0) throw new Error('No se encontraron líneas con código, descripción y precio fijo en el PDF.');

  onProgress?.({ phase: 'reading', message: `${items.length.toLocaleString('es-PY')} registros listos.`, percent: 90 });
  await yieldToBrowser();
  return buildSnapshot(items, fileName, 'pdf', invalidRows, duplicateRows, header.priceCurrency, false);
}

export async function parseOpenContractFile(
  file: File,
  onProgress?: ProgressCallback,
): Promise<OpenContractSnapshot> {
  const lowerName = file.name.toLowerCase();
  const data = new Uint8Array(await file.arrayBuffer());
  if (lowerName.endsWith('.xlsx')) return parseOpenContractWorkbook(data, file.name, onProgress);
  if (lowerName.endsWith('.pdf')) return parseOpenContractPdf(data, file.name, onProgress);
  throw new Error('Solo se aceptan contratos con extensión .xlsx o .pdf.');
}

function isRecord(value: unknown): value is Record<string, unknown> {
  return typeof value === 'object' && value !== null && !Array.isArray(value);
}
