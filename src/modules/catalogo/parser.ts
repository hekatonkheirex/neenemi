import type { CellValue, Workbook as ExcelWorkbook, Worksheet } from 'exceljs';
import { loadExcelJS } from '../../core/exceljs';
import type {
  CatalogModelFamilyInput,
  CatalogModelNoteInput,
  CatalogPartInput,
  CatalogServiceItemInput,
} from './repository';

export type ParsedCatalog = {
  parts: CatalogPartInput[];
  modelFamilies: CatalogModelFamilyInput[];
  modelNotes: CatalogModelNoteInput[];
  serviceItems: CatalogServiceItemInput[];
  canonCount: number;
  exchangeRate: number;
};

export type ImportProgress = (status: string, percent: number) => void;

const DEFAULT_EXCHANGE_RATE = 6350;

export async function parseCatalogWorkbook(
  data: Uint8Array,
  onProgress?: ImportProgress,
): Promise<ParsedCatalog> {
  onProgress?.('Analizando celdas de Excel...', 15);
  const { Workbook } = await loadExcelJS();
  const workbook = new Workbook();
  const exactBuffer = data.buffer.slice(data.byteOffset, data.byteOffset + data.byteLength) as ArrayBuffer;
  await workbook.xlsx.load(exactBuffer);

  const catalogSheets = findCatalogSheets(workbook);
  if (catalogSheets.length === 0) {
    throw new Error('No se encontró una hoja técnica válida de Canon.');
  }

  const partsByCode = new Map<string, CatalogPartInput>();
  const modelFamiliesByKey = new Map<string, CatalogModelFamilyInput>();
  const modelNotesByName = new Map<string, CatalogModelNoteInput>();
  const serviceItemsByKey = new Map<string, CatalogServiceItemInput>();
  for (const [sheetIndex, catalogSheet] of catalogSheets.entries()) {
    parseCatalogSheet(catalogSheet, partsByCode, modelFamiliesByKey, modelNotesByName, serviceItemsByKey);
    onProgress?.('Procesando productos Canon...', 50 + Math.round(((sheetIndex + 1) / catalogSheets.length) * 25));
  }

  onProgress?.('Deduplicando registros únicos...', 75);
  const parts = [...partsByCode.values()];
  onProgress?.('Catálogo listo.', 100);
  return {
    parts,
    modelFamilies: [...modelFamiliesByKey.values()],
    modelNotes: [...modelNotesByName.values()],
    serviceItems: [...serviceItemsByKey.values()],
    canonCount: parts.length,
    exchangeRate: DEFAULT_EXCHANGE_RATE,
  };
}

function parseCatalogSheet(
  catalogSheet: CatalogSheet,
  partsByCode: Map<string, CatalogPartInput>,
  modelFamiliesByKey: Map<string, CatalogModelFamilyInput>,
  modelNotesByName: Map<string, CatalogModelNoteInput>,
  serviceItemsByKey: Map<string, CatalogServiceItemInput>,
): void {
  const { rows, sheet, headerRowIndexes } = catalogSheet;
  const pricing = readCatalogPricing(rows);
  for (const [blockIndex, headerRowIndex] of headerRowIndexes.entries()) {
    const headers = toHeaderStrings(rows[headerRowIndex] ?? []);
    const partIndex = findPartIndex(headers);
    const descriptionIndex = findDescriptionIndex(headers, partIndex);
    if (partIndex === -1 || descriptionIndex === -1) continue;

    const priceIndex = findPriceIndex(headers, partIndex, descriptionIndex);
    const stockIndex = headers.findIndex(
      (header, index) => index !== partIndex && index !== descriptionIndex && index !== priceIndex && isStockHeader(header),
    );
    const discontinuedIndex = headers.findIndex(
      (header, index) =>
        index !== partIndex &&
        index !== descriptionIndex &&
        index !== priceIndex &&
        index !== stockIndex &&
        isDiscontinuedHeader(header),
    );
    const localPriceIndex = findLocalPriceIndex(headers, partIndex, descriptionIndex, priceIndex);
    const modelIndex = findModelIndex(headers);
    const detailIndexes = new Set([partIndex, descriptionIndex, priceIndex, stockIndex, discontinuedIndex, localPriceIndex, modelIndex]);
    const groupIndex = findOptionalIndex(headers, isGroupHeader, detailIndexes);
    const referenceIndex = findOptionalIndex(headers, isReferenceHeader, new Set([...detailIndexes, groupIndex]));
    const usefulLifeIndex = findOptionalIndex(headers, isUsefulLifeHeader, new Set([...detailIndexes, groupIndex, referenceIndex]));
    const nextHeaderRowIndex = headerRowIndexes[blockIndex + 1];
    const contextStart = findCatalogContextStart(rows, headerRowIndex);
    const nextContextStart = nextHeaderRowIndex === undefined
      ? rows.length
      : findCatalogContextStart(rows, nextHeaderRowIndex);
    const blockEnd = nextHeaderRowIndex === undefined
      ? rows.length
      : Math.min(nextHeaderRowIndex, nextContextStart);
    const context = readCatalogBlockContext(
      rows,
      headerRowIndex,
      contextStart,
      sheet.name,
    );

    if (context.modelName) {
      addModelFamily(modelFamiliesByKey, context.familyName || 'Canon', context.modelName, pricing);
    }

    if (context.note && context.modelName) {
      const modelKey = normalizeLegacyModelName(context.modelName);
      if (!modelNotesByName.has(modelKey)) {
        modelNotesByName.set(modelKey, {
          brand: 'Canon',
          familyName: context.familyName,
          modelName: context.modelName,
          note: context.note,
        });
      }
    }

    for (let rowIndex = headerRowIndex + 1; rowIndex < blockEnd; rowIndex += 1) {
      const row = rows[rowIndex] ?? [];
      const rawCode = row[partIndex];
      const code = catalogText(rawCode);
      const description = catalogText(row[descriptionIndex]);
      if (!code && !description) continue;
      if (isCatalogHeaderRow(row)) continue;

      const modelNames = catalogModelNames(modelIndex === -1 ? undefined : row[modelIndex], context.modelName, sheet.name);
      if (code) {
        const partModels = [...new Set([...modelNames, ...extractCanonModels(description)])];
        for (const modelName of partModels) {
          addModelFamily(modelFamiliesByKey, context.familyName || 'Canon', modelName, pricing);
        }
        const priceUsd = priceIndex === -1 ? 0 : Math.max(0, cleanNumber(row[priceIndex]));
        const priceLocal = localPriceIndex === -1
          ? Math.round(priceUsd * DEFAULT_EXCHANGE_RATE)
          : Math.max(0, cleanNumber(row[localPriceIndex]));
        const stock = stockIndex === -1 ? 0 : Math.max(0, Math.trunc(cleanNumber(row[stockIndex])));
        const rawDiscontinued = discontinuedIndex === -1 ? undefined : row[discontinuedIndex];
        mergeCatalogPart(partsByCode, {
          brand: 'Canon',
          code,
          description,
          models: partModels,
          stock,
          priceUsd,
          priceLocal,
          markup: 0,
          discontinuedAt: parseDiscontinuedValue(rawDiscontinued),
          costAvailable: priceIndex >= 0 && hasCatalogCost(row[priceIndex]),
          group: optionalCatalogText(row[groupIndex]),
          reference: optionalCatalogText(row[referenceIndex]),
          usefulLife: optionalCatalogText(row[usefulLifeIndex]),
        });
        continue;
      }

      const serviceItem = parseCatalogServiceItem(description, row, localPriceIndex);
      if (!serviceItem) continue;
      for (const modelName of modelNames) {
        const familyName = context.familyName || 'Canon';
        addModelFamily(modelFamiliesByKey, familyName, modelName, pricing);
        const key = `${familyName}:${normalizeLegacyModelName(modelName)}:${serviceItem.kind}:${normalizeLegacyModelName(serviceItem.description)}`;
        serviceItemsByKey.set(key, {
          brand: 'Canon',
          familyName,
          modelName,
          kind: serviceItem.kind,
          description: serviceItem.description,
          fixedPriceLocal: serviceItem.fixedPriceLocal,
        });
      }
    }
  }
}

function mergeCatalogPart(partsByCode: Map<string, CatalogPartInput>, incoming: CatalogPartInput): void {
  const key = incoming.code.toUpperCase();
  const current = partsByCode.get(key);
  if (!current) {
    partsByCode.set(key, incoming);
    return;
  }

  current.models = [...new Set([...current.models, ...incoming.models])];
  if (!current.description && incoming.description) current.description = incoming.description;
  if (current.priceUsd === 0 && incoming.priceUsd > 0) current.priceUsd = incoming.priceUsd;
  if (current.priceLocal === 0 && incoming.priceLocal > 0) current.priceLocal = incoming.priceLocal;
  current.costAvailable = (current.costAvailable ?? current.priceUsd > 0) || incoming.costAvailable === true;
  current.stock = Math.max(current.stock, incoming.stock);
  current.discontinuedAt ??= incoming.discontinuedAt;
  current.group ||= incoming.group;
  current.reference ||= incoming.reference;
  current.usefulLife ||= incoming.usefulLife;
}

export function parseLegacyCatalogJson(source: string): ParsedCatalog {
  let raw: unknown;
  try {
    raw = JSON.parse(source) as unknown;
  } catch {
    throw new Error('El respaldo JSON del catálogo no tiene una estructura válida.');
  }

  const families = extractLegacyFamilies(raw);
  if (families.length === 0) {
    throw new Error('El respaldo JSON no contiene familias de catálogo.');
  }

  const partsByCode = new Map<string, CatalogPartInput>();
  const modelFamiliesByKey = new Map<string, CatalogModelFamilyInput>();
  const modelNotesByName = new Map<string, CatalogModelNoteInput>();
  const serviceItems: CatalogServiceItemInput[] = [];
  let exchangeRate = DEFAULT_EXCHANGE_RATE;
  for (const family of families) {
    const familyName = legacyText(family.name) || legacyText(family.id) || 'Canon';
    const familyRate = legacyNumber(family.tc);
    const familyFactorValue = legacyNumber(family.factor);
    const familyFactor = familyFactorValue || 1;
    if (familyRate > 0 && exchangeRate === DEFAULT_EXCHANGE_RATE) exchangeRate = familyRate;
    if (!Array.isArray(family.models)) continue;

    for (const model of family.models) {
      if (!isRecord(model)) continue;
      const modelName = legacyText(model.name);
      if (!modelName || !Array.isArray(model.items)) continue;
      addModelFamily(modelFamiliesByKey, familyName, modelName, {
        exchangeRate: familyRate > 0 ? familyRate : null,
        factor: familyFactorValue > 0 ? familyFactorValue : null,
      });
      const modelNote = legacyText(model.note);
      if (modelNote) {
        const modelKey = normalizeLegacyModelName(modelName);
        const currentNote = modelNotesByName.get(modelKey);
        if (!currentNote || currentNote.note.length === 0) {
          modelNotesByName.set(modelKey, {
            brand: 'Canon',
            familyName,
            modelName,
            note: modelNote,
          });
        }
      }

      for (const rawItem of model.items) {
        const serviceItem = parseLegacyServiceItem(rawItem, familyName, modelName);
        if (serviceItem) {
          serviceItems.push(serviceItem);
          continue;
        }
        if (!isLegacyPart(rawItem)) continue;
        const code = legacyText(rawItem.code);
        if (!code) continue;
        const key = code.toUpperCase();
        const priceUsd = Math.max(0, legacyNumber(rawItem.costo));
        const priceLocalValue = legacyNumber(rawItem.ventaGs);
        const priceLocal = priceLocalValue > 0
          ? priceLocalValue
          : Math.round(priceUsd * (familyRate > 0 ? familyRate : DEFAULT_EXCHANGE_RATE) * familyFactor);
        const stock = Math.max(0, Math.trunc(legacyNumber(rawItem.stock)));
        const discontinuedAt = legacyDiscontinuedValue(rawItem.disc);
        const group = optionalLegacyText(rawItem.grupo);
        const reference = optionalLegacyText(rawItem.ref);
        const usefulLife = optionalLegacyText(rawItem.vida);
        const costAvailable = legacyCostAvailable(rawItem.costo);
        const current = partsByCode.get(key);
        if (current) {
          current.models = [...new Set([...current.models, modelName])];
          current.description ||= legacyText(rawItem.desc);
          if (current.priceUsd === 0 && priceUsd > 0) current.priceUsd = priceUsd;
          if (current.priceLocal === 0 && priceLocal > 0) current.priceLocal = priceLocal;
          current.costAvailable = (current.costAvailable ?? current.priceUsd > 0) || costAvailable;
          current.stock = Math.max(current.stock, stock);
          current.discontinuedAt ??= discontinuedAt;
          current.group ||= group;
          current.reference ||= reference;
          current.usefulLife ||= usefulLife;
          continue;
        }

        partsByCode.set(key, {
          brand: 'Canon',
          code,
          description: legacyText(rawItem.desc),
          models: [modelName],
          stock,
          priceUsd,
          priceLocal,
          markup: Math.max(0, familyFactor - 1),
          discontinuedAt,
          costAvailable,
          group,
          reference,
          usefulLife,
        });
      }
    }
  }

  const parts = [...partsByCode.values()];
  if (parts.length === 0) {
    throw new Error('El respaldo JSON no contiene partes de catálogo válidas.');
  }
  return {
    parts,
    modelFamilies: [...modelFamiliesByKey.values()],
    modelNotes: [...modelNotesByName.values()],
    serviceItems,
    canonCount: parts.length,
    exchangeRate,
  };
}

function addModelFamily(
  modelFamiliesByKey: Map<string, CatalogModelFamilyInput>,
  familyName: string,
  modelName: string,
  pricing: CatalogFamilyPricingValues = {},
): void {
  const normalizedFamilyName = normalizeLegacyModelName(familyName);
  const normalizedModelName = normalizeLegacyModelName(modelName);
  if (!normalizedFamilyName || !normalizedModelName) return;
  const key = `Canon:${normalizedFamilyName}:${normalizedModelName}`;
  const current = modelFamiliesByKey.get(key);
  if (!current) {
    modelFamiliesByKey.set(key, {
      brand: 'Canon',
      familyName: familyName.trim(),
      modelName: modelName.trim(),
      ...familyPricingFields(pricing),
    });
    return;
  }

  if (current.exchangeRate === undefined && pricing.exchangeRate !== undefined && pricing.exchangeRate !== null) {
    current.exchangeRate = pricing.exchangeRate;
  }
  if (current.factor === undefined && pricing.factor !== undefined && pricing.factor !== null) {
    current.factor = pricing.factor;
  }
}

type CatalogFamilyPricingValues = {
  exchangeRate?: number | null;
  factor?: number | null;
};

function familyPricingFields(pricing: CatalogFamilyPricingValues): CatalogFamilyPricingValues {
  const fields: CatalogFamilyPricingValues = {};
  if (pricing.exchangeRate !== undefined && pricing.exchangeRate !== null) fields.exchangeRate = pricing.exchangeRate;
  if (pricing.factor !== undefined && pricing.factor !== null) fields.factor = pricing.factor;
  return fields;
}

type LegacyRecord = Record<string, unknown>;

function isRecord(value: unknown): value is LegacyRecord {
  return typeof value === 'object' && value !== null && !Array.isArray(value);
}

function extractLegacyFamilies(raw: unknown): LegacyRecord[] {
  if (Array.isArray(raw)) return raw.filter(isRecord);
  if (!isRecord(raw)) return [];
  const candidates = [raw.families, raw.catalog, raw.familias];
  return candidates.find(Array.isArray)?.filter(isRecord) ?? [];
}

function isLegacyPart(value: unknown): value is LegacyRecord {
  if (!isRecord(value)) return false;
  if (value.kind === 'labor' || value.kind === 'fixed' || typeof value.labor === 'string' || typeof value.fixedGs === 'number') return false;
  return value.code !== undefined && value.code !== null;
}

function parseLegacyServiceItem(
  value: unknown,
  familyName: string,
  modelName: string,
): CatalogServiceItemInput | null {
  if (!isRecord(value)) return null;

  const laborDescription = value.kind === 'labor' ? value.desc : value.labor;
  if (typeof laborDescription === 'string' && laborDescription.trim() !== '') {
    return {
      brand: 'Canon',
      familyName,
      modelName,
      kind: 'labor',
      description: legacyText(laborDescription),
      fixedPriceLocal: null,
    };
  }

  const fixedValue = value.fixedGs;
  const hasFixedValue = typeof fixedValue === 'number'
    ? Number.isFinite(fixedValue)
    : typeof fixedValue === 'string' && fixedValue.trim() !== '';
  if (value.kind === 'fixed' || hasFixedValue) {
    const description = legacyText(value.desc);
    if (!description || !hasFixedValue) return null;
    return {
      brand: 'Canon',
      familyName,
      modelName,
      kind: 'fixed',
      description,
      fixedPriceLocal: Math.max(0, legacyNumber(fixedValue)),
    };
  }

  return null;
}

function normalizeLegacyModelName(value: string): string {
  return value.normalize('NFKD').replace(/[\u0300-\u036f]/g, '').trim().replace(/\s+/g, ' ').toUpperCase();
}

function legacyText(value: unknown): string {
  return String(value ?? '').trim().replace(/\s+/g, ' ');
}

function legacyNumber(value: unknown): number {
  if (typeof value === 'number') return Number.isFinite(value) ? value : 0;
  const text = legacyText(value).replace(/\s/g, '').replace(/[^\d,.-]/g, '');
  if (!text) return 0;
  const normalized = text.includes(',') && text.includes('.')
    ? text.lastIndexOf(',') > text.lastIndexOf('.')
      ? text.replace(/\./g, '').replace(',', '.')
      : text.replace(/,/g, '')
    : text.replace(',', '.');
  const parsed = Number(normalized);
  return Number.isFinite(parsed) ? parsed : 0;
}

function hasCatalogCost(value: unknown): boolean {
  if (typeof value === 'number') return Number.isFinite(value);
  const text = catalogText(value);
  if (!text || /(?:no\s+encontrad|sin\s+costo|not\s+found|n\/?a)/i.test(text)) return false;
  return /\d/.test(text) && Number.isFinite(cleanNumber(text));
}

function legacyCostAvailable(value: unknown): boolean {
  if (value === null || value === undefined) return false;
  if (typeof value === 'number') return Number.isFinite(value);
  const text = legacyText(value);
  if (!text || /(?:no\s+encontrad|sin\s+costo|not\s+found|n\/?a)/i.test(text)) return false;
  return /\d/.test(text) && Number.isFinite(legacyNumber(text));
}

function legacyDiscontinuedValue(value: unknown): string | null {
  const text = legacyText(value);
  if (!text || ['false', 'activo', 'active', 'no', 'n/a', 'na'].includes(text.toLowerCase())) return null;
  return text;
}

function worksheetToRows(sheet: Worksheet): unknown[][] {
  const rows: unknown[][] = [];
  const columnCount = sheet.actualColumnCount || sheet.columnCount;
  sheet.eachRow({ includeEmpty: true }, (row, rowNumber) => {
    rows[rowNumber - 1] = Array.from({ length: columnCount }, (_, index) =>
      cellToPrimitive(row.getCell(index + 1).value),
    );
  });
  return rows;
}

type CatalogSheet = {
  sheet: Worksheet;
  rows: unknown[][];
  headerRowIndexes: number[];
};

function findCatalogSheets(workbook: ExcelWorkbook): CatalogSheet[] {
  const candidates = workbook.worksheets.flatMap((sheet) => {
    if (isKnownNonCanonSheet(sheet.name)) return [];

    const rows = worksheetToRows(sheet);
    const headerRowIndexes = findHeaderRows(rows);
    if (headerRowIndexes.length === 0) return [];
    return [{ sheet, rows, headerRowIndexes }];
  });

  return [...candidates].sort((left, right) => {
    const leftIsCanon = left.sheet.name.toLowerCase().includes('canon') ? 0 : 1;
    const rightIsCanon = right.sheet.name.toLowerCase().includes('canon') ? 0 : 1;
    return leftIsCanon - rightIsCanon;
  });
}

function isKnownNonCanonSheet(name: string): boolean {
  return /\b(?:pantum|epson|brother|xerox|ricoh|kyocera|lexmark|samsung|sharp|konica(?:\s+minolta)?)\b/i.test(name);
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
  for (let index = 0; index < Math.min(rows.length, 15); index += 1) {
    if (isCatalogHeaderRow(rows[index] ?? [])) return index;
  }
  return 0;
}

function findHeaderRows(rows: unknown[][]): number[] {
  return rows.flatMap((row, index) => (isCatalogHeaderRow(row) ? [index] : []));
}

function isCatalogHeaderRow(row: unknown[]): boolean {
  const headers = toHeaderStrings(row);
  const score = [
    headers.some((header) => isPartHeader(header)),
    headers.some((header) => isDescriptionHeader(header)),
    headers.some((header) => isPriceHeader(header)),
  ].filter(Boolean).length;
  const hasCommercialColumn = headers.some((header) => isPriceHeader(header) || isStockHeader(header));
  return score >= 2 && hasCommercialColumn && findPartIndex(headers) >= 0 && findDescriptionIndex(headers, findPartIndex(headers)) >= 0;
}

function toHeaderStrings(row: unknown[]): string[] {
  return row.map((value) => catalogText(value).toLowerCase());
}

function findCatalogContextStart(rows: unknown[][], headerRowIndex: number): number {
  const minimumIndex = Math.max(0, headerRowIndex - 8);
  for (let index = headerRowIndex - 1; index >= minimumIndex; index -= 1) {
    if (isCatalogContextTitleRow(rows[index] ?? [])) return index;
  }
  return headerRowIndex;
}

function isCatalogContextTitleRow(row: unknown[]): boolean {
  const first = catalogText(row[0]);
  const second = catalogText(row[1]);
  const firstLabel = normalizeCatalogText(first);
  if (firstLabel === 'modelo' || firstLabel === 'modelos' || firstLabel === 'nota tecnica' || firstLabel === 'nota') return true;

  const text = rowText(row);
  if (/^listado de precios\s+·\s+/i.test(text)) return true;
  if (text.includes(' - ')) return true;
  return firstLabel === 'canon' && Boolean(second);
}

type CatalogPricingValues = {
  exchangeRate: number | null;
  factor: number | null;
};

function readCatalogPricing(rows: unknown[][]): CatalogPricingValues {
  let exchangeRate: number | null = null;
  let factor: number | null = null;

  for (const row of rows.slice(0, 8)) {
    const text = normalizeCatalogText(rowText(row));
    const numbers = row.filter((value): value is number => typeof value === 'number' && Number.isFinite(value));
    if (exchangeRate === null && /t\.?\s*c\.?\s*:|tipo de cambio/.test(text)) {
      const value = numbers.find((number) => number > 1000);
      const textValue = text.match(/t\.?\s*c\.?\s*:\s*([\d.,]+)/)?.[1]
        ?? text.match(/tipo de cambio\s*:\s*([\d.,]+)/)?.[1];
      if (value !== undefined) exchangeRate = Math.round(value);
      else if (textValue) {
        const parsed = parseCatalogParameterNumber(textValue);
        if (parsed > 1000) exchangeRate = Math.round(parsed);
      }
    }
    if (factor === null && /factor|puesto en dpto/.test(text)) {
      const value = numbers.find((number) => number > 0 && number <= 5);
      const textValue = text.match(/factor\s*:\s*([\d.,]+)/)?.[1];
      if (value !== undefined) factor = value;
      else if (textValue) {
        const parsed = parseCatalogParameterNumber(textValue);
        if (parsed > 0 && parsed <= 5) factor = parsed;
      }
    }
  }

  return { exchangeRate, factor };
}

function parseCatalogParameterNumber(value: string): number {
  const text = value.replace(/\s/g, '');
  if (!text) return 0;
  const parts = text.split(/[.,]/);
  if (parts.length === 2 && parts[1].length === 3 && parts[0].length <= 2) {
    return Number(`${parts[0]}${parts[1]}`) || 0;
  }
  const normalized = text.includes(',') && text.includes('.')
    ? text.lastIndexOf(',') > text.lastIndexOf('.')
      ? text.replace(/\./g, '').replace(',', '.')
      : text.replace(/,/g, '')
    : text.replace(',', '.');
  return Number(normalized) || 0;
}

type CatalogBlockContext = {
  familyName: string;
  modelName: string;
  note: string;
};

function readCatalogBlockContext(
  rows: unknown[][],
  headerRowIndex: number,
  blockStart: number,
  sheetName: string,
): CatalogBlockContext {
  let familyName = '';
  let modelName = '';
  let note = '';
  let titleRowIndex = -1;

  for (let index = blockStart; index < headerRowIndex; index += 1) {
    const row = rows[index] ?? [];
    const first = catalogText(row[0]);
    const firstLabel = normalizeCatalogText(first);
    const second = catalogText(row[1]);
    if (firstLabel === 'modelo' || firstLabel === 'modelos') {
      if (!modelName) modelName = second || catalogText(row.slice(1).find((value) => catalogText(value)));
      continue;
    }
    if (firstLabel === 'nota tecnica' || firstLabel === 'nota') {
      if (!note) note = second || catalogText(row.slice(1).find((value) => catalogText(value)));
      continue;
    }

    if (!modelName && first && second && !isCatalogCalculationText(`${first} ${second}`)) {
      familyName = first;
      modelName = second;
      titleRowIndex = index;
      continue;
    }

    const text = rowText(row);
    if (!text || isCatalogCalculationText(text)) continue;
    if (titleRowIndex === -1 && text.includes(' - ')) {
      titleRowIndex = index;
      const separator = text.indexOf(' - ');
      familyName = text.slice(0, separator).trim();
      if (!modelName) modelName = text.slice(separator + 3).trim();
    } else if (titleRowIndex === -1) {
      const titleMatch = text.match(/^listado de precios\s+·\s+(.+)$/i);
      if (titleMatch) {
        titleRowIndex = index;
        familyName = 'Canon';
        if (!modelName) modelName = titleMatch[1].trim();
      }
    }
  }

  if (titleRowIndex >= 0 && !note) {
    for (let index = titleRowIndex + 1; index < headerRowIndex; index += 1) {
      const text = rowText(rows[index] ?? []);
      if (text && !isCatalogCalculationText(text)) {
        note = text;
        break;
      }
    }
  }

  return {
    familyName: familyName || 'Canon',
    modelName: modelName.trim(),
    note: note.trim(),
  };
}

function findModelIndex(headers: string[]): number {
  return headers.findIndex((header) => /^(model|modelos|modelo equipo|modelos compatibles|equivalencia)$/.test(normalizeCatalogText(header)));
}

function findLocalPriceIndex(headers: string[], partIndex: number, descriptionIndex: number, priceIndex: number): number {
  const localIndexes = headers.flatMap((header, index) => (
    index !== partIndex &&
    index !== descriptionIndex &&
    index !== priceIndex &&
    isLocalPriceHeader(header)
      ? [index]
      : []
  ));
  return localIndexes.find((index) => /venta/.test(normalizeCatalogText(headers[index]))) ?? localIndexes[0] ?? -1;
}

function catalogModelNames(value: unknown, fallback: string, sheetName: string): string[] {
  const text = catalogText(value);
  if (!text && fallback) return [fallback];
  if (!text) {
    const normalizedSheet = normalizeCatalogText(sheetName);
    return [
      'resumen',
      'listado de precios',
      'canon',
      'lista canon',
      'lista de canon',
      'catalogo',
      'catalog',
    ].includes(normalizedSheet)
      ? []
      : sheetName.trim()
        ? [sheetName.trim()]
        : [];
  }

  const candidates = text
    .split(/\s*,\s*/)
    .map((item) => item.trim())
    .filter(Boolean)
    .map((item) => {
      const parts = item.split(/\s+·\s+/).map((part) => part.trim()).filter(Boolean);
      return parts.length === 2 ? parts[1] : item;
    })
    .flatMap(expandCatalogModelGroup);
  return [...new Set(candidates)];
}

/**
 * Equivalencia often groups several compatible models in one cell, for
 * example `IR2525/2535` or `M6500/ M6550/ M6600 Series`. Keep the source row
 * untouched in import_source_rows, but create one searchable association per
 * model so the catalog filter and downstream joins can use the individual
 * model codes.
 */
function expandCatalogModelGroup(value: string): string[] {
  if (!value.includes('/')) return [value];

  const models: string[] = [];
  let inheritedPrefix = '';
  for (const rawToken of value.split(/\s*\/\s*/)) {
    const token = cleanCatalogModelToken(rawToken);
    if (!token) continue;

    const expandedToken = /^\d{3,5}[A-Z0-9]*$/i.test(token) && inheritedPrefix
      ? `${inheritedPrefix}${token}`
      : token;
    models.push(expandedToken);

    const prefix = expandedToken.match(/^[A-Z]+(?=\d)/i)?.[0];
    if (prefix) inheritedPrefix = prefix;
  }

  return models.length > 0 ? models : [value];
}

function cleanCatalogModelToken(value: string): string {
  let token = value.trim();
  token = token.replace(/^\d{2,3}\s*V\s*[-–—\s]*/i, '');
  token = token.replace(/^(?:(?:non\s+)?europe|(?:non\s+)?airprint)\s*[-–—]\s*/i, '');
  token = token.replace(/^\d{3,4}\s*[-–—]\s*(?=[A-Z])/i, '');
  token = token.replace(/\s+series\b.*$/i, '');
  token = token.replace(/\s+\d{4}.*$/i, '');
  return token.trim().replace(/[()]+/g, '').trim();
}

function parseCatalogServiceItem(
  description: string,
  row: unknown[],
  localPriceIndex: number,
): { kind: CatalogServiceItemInput['kind']; description: string; fixedPriceLocal: number | null } | null {
  if (/^(mano\s+de\s+obra|cambio\s+de)\b/i.test(description)) {
    return { kind: 'labor', description, fixedPriceLocal: null };
  }
  if (localPriceIndex === -1) return null;
  const fixedPriceLocal = cleanNumber(row[localPriceIndex]);
  if (!Number.isFinite(fixedPriceLocal) || fixedPriceLocal < 0 || !hasNumericValue(row[localPriceIndex])) return null;
  return { kind: 'fixed', description, fixedPriceLocal };
}

function hasNumericValue(value: unknown): boolean {
  if (typeof value === 'number') return Number.isFinite(value);
  return typeof value === 'string' && value.trim() !== '' && cleanNumber(value) >= 0;
}

function rowText(row: unknown[]): string {
  return row
    .map((value) => catalogText(value))
    .filter(Boolean)
    .join(' · ')
    .trim();
}

function isCatalogCalculationText(value: string): boolean {
  return /^t\.?\s*c\.?\s*:/i.test(value) || /\btipo de cambio\b/i.test(value);
}

function catalogText(value: unknown): string {
  if (value === undefined || value === null) return '';
  if (value instanceof Date) return formatDate(value);
  return String(value).trim().replace(/\s+/g, ' ');
}

function optionalCatalogText(value: unknown): string | null {
  const text = catalogText(value);
  return text || null;
}

function optionalLegacyText(value: unknown): string | null {
  const text = legacyText(value);
  return text || null;
}

function normalizeCatalogText(value: string): string {
  return value
    .normalize('NFD')
    .replace(/[\u0300-\u036f]/g, '')
    .toLowerCase()
    .replace(/\s+/g, ' ')
    .trim();
}

function findOptionalIndex(
  headers: string[],
  predicate: (header: string) => boolean,
  excluded: Set<number>,
): number {
  return headers.findIndex((header, index) => !excluded.has(index) && predicate(header));
}

function findPartIndex(headers: string[]): number {
  return headers.findIndex(isPartHeader);
}

function findDescriptionIndex(headers: string[], partIndex: number): number {
  return headers.findIndex((header, index) => index !== partIndex && isDescriptionHeader(header));
}

function findPriceIndex(headers: string[], partIndex: number, descriptionIndex: number): number {
  return headers.findIndex(
    (header, index) => index !== partIndex && index !== descriptionIndex && isPriceHeader(header) && !isLocalPriceHeader(header),
  );
}

function isPartHeader(header: string): boolean {
  return /número|numero|part|coding|código|codigo|nº|n°/.test(header);
}

function isDescriptionHeader(header: string): boolean {
  return /descripción|descripcion|desc|artículo|articulo/.test(header);
}

function isPriceHeader(header: string): boolean {
  return /recalculo|recálculo|usd|u\$s|precio|p\.unit|p\.u|^me$|m\.e\.|m\/e/.test(header);
}

function isStockHeader(header: string): boolean {
  return /stock|unidades|cant|cantidad/.test(header);
}

function isDiscontinuedHeader(header: string): boolean {
  return /discontinuado|disc|baja/.test(header);
}

function isLocalPriceHeader(header: string): boolean {
  return /(?:precio|price).*(?:gs|pyg|guarani|local)|(?:gs|pyg|guarani)/.test(header);
}

function isGroupHeader(header: string): boolean {
  return /grupo|group|familia|categor[ií]a|category/.test(normalizeCatalogText(header));
}

function isReferenceHeader(header: string): boolean {
  return /^(?:ref\.?|referencia|reference)$/.test(normalizeCatalogText(header));
}

function isUsefulLifeHeader(header: string): boolean {
  return /vida|rendimiento|yield|duraci[oó]n|life/.test(normalizeCatalogText(header));
}

function cleanNumber(value: unknown): number {
  if (typeof value === 'number') return Number.isFinite(value) ? value : 0;
  if (value === undefined || value === null || value === '') return 0;
  const text = String(value).trim().replace(/[^\d.,-]/g, '');
  if (!text) return 0;
  const normalized = text.includes(',') && !text.includes('.') ? text.replace(',', '.') : text.replace(/,/g, '');
  return Number.parseFloat(normalized) || 0;
}

function parseDiscontinuedValue(value: unknown): string | null {
  if (value === undefined || value === null || value === '') return null;
  if (value instanceof Date) return formatDate(value);
  if (typeof value === 'number') return excelDateToISO(value);

  const text = String(value).trim();
  if (!text || text === '0' || ['false', 'activo', 'active', 'no', 'n/a', 'na'].includes(text.toLowerCase()) || text.includes('#N')) return null;
  return text;
}

function excelDateToISO(serial: number): string {
  const date = new Date(Math.round((serial - 25569) * 86400 * 1000));
  return Number.isNaN(date.getTime()) ? String(serial) : formatDate(date);
}

function formatDate(date: Date): string {
  return `${date.getUTCFullYear()}-${String(date.getUTCMonth() + 1).padStart(2, '0')}-${String(date.getUTCDate()).padStart(2, '0')}`;
}

function extractCanonModels(description: string): string[] {
  const candidates = [
    ...description.matchAll(/\biR\s*ADV\s*C?\s*[-–—]?\s*\d{3,4}\s*[A-Z]*/gi),
    ...description.matchAll(/\bADV\s*[-–—]?\s*C\s*[-–—]?\s*\d{3,4}\s*[A-Z]*/gi),
    ...description.matchAll(/\b(?:IR|MF|LBP|iPF)\s*[-–—]?\s*\d{3,4}\s*[A-Z]*/gi),
  ];

  const normalized = new Map<string, string>();
  for (const candidate of candidates) {
    const model = normalizeModel(candidate[0]);
    if (model) normalized.set(model.toUpperCase(), model);
  }

  const fullNames = new Set(
    [...normalized.values()]
      .filter((model) => /^iR ADV C\d+/i.test(model))
      .map((model) => model.replace(/\D/g, '')),
  );
  return [...normalized.values()].filter(
    (model) => !/^ADV C\d+/i.test(model) || !fullNames.has(model.replace(/\D/g, '')),
  );
}

function normalizeModel(model: string): string {
  const normalized = model.trim().replace(/\s+/g, ' ');
  const irAdv = normalized.match(/^iR\s*ADV\s*C?\s*[-–—]?\s*(\d{3,4})\s*([A-Z]*)$/i);
  if (irAdv) return `iR ADV C${irAdv[1]}${irAdv[2]}`;

  const adv = normalized.match(/^ADV\s*[-–—]?\s*C\s*[-–—]?\s*(\d{3,4})\s*([A-Z]*)$/i);
  if (adv) return `ADV C${adv[1]}${adv[2]}`;
  return normalized;
}
