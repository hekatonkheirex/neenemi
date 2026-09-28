import {
  classifyCategory,
  classifyCode,
  classifyRecordKind,
  detectFamily,
  formatDate,
  formatMonth,
  isPaper,
} from './analysis';
import { buildCompleteSourceDetails } from '../../core/source-details';
import type {
  ConsumablesOutputSourceOperational,
  ConsumablesOutputSourceType,
  ParsedConsumablesOutputRow,
} from './types';
import { cell, findHeaderIndex, readHeaderValue, readWorkbookSourceSheets, safeNumber } from './xlsx-helpers';

export type ParsedConsumablesOutputsWorkbook = {
  rows: ParsedConsumablesOutputRow[];
  skippedOutOfScope: number;
};

type OutputColumns = {
  documentNumber: number;
  date: number;
  partCode: number;
  description: number;
  quantity: number;
  yield: number;
  yieldTotal: number;
  serial: number;
  model: number;
  customer: number;
  unitPrice: number;
  totalPrice: number;
  observations: number;
  contact: number;
  sourceSector: number;
  sourceCommercialArea: number;
  technician: number;
  contract: number;
  serviceReportNumber: number;
};

/**
 * Parses the two historical dispatch exports. Both use document number(0),
 * date(1), code(2), description(3) and quantity(4). The consumables export
 * stores yield(6), serial(7), model(8) and customer(11); the parts export
 * stores customer(7), model(8), serial(9), technician(10) and report(12).
 */
export async function parseOutputsWorkbook(
  data: Uint8Array,
  sourceType: ConsumablesOutputSourceType,
): Promise<ParsedConsumablesOutputsWorkbook> {
  const sheets = await readWorkbookSourceSheets(data);
  const isConsumablesOutput = sourceType === 'salida-consumibles';
  const parsed: ParsedConsumablesOutputRow[] = [];
  let skippedOutOfScope = 0;

  for (const sheet of sheets) {
    const detectedHeaderRow = findOutputHeaderRow(sheet.rows.map((sourceRow) => sourceRow.values));
    const headerRowIndex = detectedHeaderRow >= 0 ? detectedHeaderRow : 0;
    const headers = sheet.rows[headerRowIndex]?.values ?? [];
    const columns = getOutputColumns(headers, isConsumablesOutput);

    for (const sourceRow of sheet.rows.slice(headerRowIndex + 1)) {
      const row = sourceRow.values;
      const documentNumber = Math.trunc(safeNumber(row[columns.documentNumber]));
      if (documentNumber <= 0) continue;

      const modelLabel = cell(row, columns.model);
      const serialNumber = cell(row, columns.serial);
      const partCode = cell(row, columns.partCode);
      const description = cell(row, columns.description);
      const family = detectFamily(modelLabel);
      if (!serialNumber || !family || (isConsumablesOutput && isPaper(partCode, description))) {
        skippedOutOfScope += 1;
        continue;
      }

      const recordedAt = formatDate(row[columns.date]);
      const recordKind = isConsumablesOutput ? 'consumable' : classifyRecordKind(sourceType, description);
      const sourceUnitPricePyg = readOptionalNumber(row[columns.unitPrice]);
      const sourceTotalPyg = readOptionalNumber(row[columns.totalPrice]);
      const sourceOperational = buildOutputSourceOperational(row, columns);
      const sourceDetails = buildCompleteSourceDetails(headers, row, isConsumablesOutput
        ? [
            ['Rendimiento', readHeaderValue(headers, row, ['rendimiento', 'rend', 'rend unitario', 'rendimiento unitario'])],
            ['Precio (PYG)', readHeaderValue(headers, row, ['precio', 'precio unitario', 'precio unitario pyg', 'precio unitario gs'])],
            ['Total (PYG)', readHeaderValue(headers, row, ['total', 'total precio', 'precio total', 'total pyg', 'total gs', 'importe total'])],
            ['Observaciones', readHeaderValue(headers, row, ['observaciones', 'observacion'])],
            ['Contacto', readHeaderValue(headers, row, ['contacto'])],
            ['Sector (fuente)', readHeaderValue(headers, row, ['sector', 'tipo cliente', 'tipo de cliente', 'segmento', 'customer type'])],
            ['Área comercial (fuente)', readHeaderValue(headers, row, ['area comercial interna', 'area comercial', 'commercial area', 'business area', 'sales area', 'area'])],
          ]
        : [
            ['Precio (PYG)', readHeaderValue(headers, row, ['precio', 'precio unitario'])],
            ['Total Precio (PYG)', readHeaderValue(headers, row, ['total', 'total precio'])],
            ['Contrato (fuente)', readHeaderValue(headers, row, ['contrato'])],
            ['Sector (fuente)', readHeaderValue(headers, row, ['sector', 'tipo cliente', 'tipo de cliente', 'segmento', 'customer type'])],
            ['Área comercial (fuente)', readHeaderValue(headers, row, ['area comercial interna', 'area comercial', 'commercial area', 'business area', 'sales area', 'area'])],
          ]);
      parsed.push({
        recordKind,
        documentNumber,
        recordedAt,
        month: formatMonth(row[columns.date]),
        modelLabel,
        serialNumber,
        partCode,
        description,
        quantity: Math.max(0, safeNumber(row[columns.quantity])),
        yieldPages: isConsumablesOutput ? Math.max(0, safeNumber(row[columns.yieldTotal])) : 0,
        technician: isConsumablesOutput ? '' : cell(row, columns.technician),
        serviceReportNumber: isConsumablesOutput ? 0 : Math.max(0, Math.trunc(safeNumber(row[columns.serviceReportNumber]))),
        sourceCustomerName: cell(row, columns.customer),
        ...(sourceUnitPricePyg !== null ? { sourceUnitPricePyg } : {}),
        ...(sourceTotalPyg !== null ? { sourceTotalPyg } : {}),
        ...(Object.keys(sourceOperational).length > 0 ? { sourceOperational } : {}),
        ...(sourceDetails.length > 0 ? { sourceDetails } : {}),
        classification: classifyCode(partCode),
        category: recordKind === 'part' ? 'repuesto' : classifyCategory(description),
        family,
        sourceSheetName: sourceRow.sheetName,
        sourceRowNumber: sourceRow.rowNumber,
      });
    }
  }

  if (parsed.length === 0 && skippedOutOfScope === 0) {
    throw new Error('El archivo no contiene filas de salida después de la cabecera.');
  }

  return { rows: parsed, skippedOutOfScope };
}

function buildOutputSourceOperational(
  row: unknown[],
  columns: OutputColumns,
): ConsumablesOutputSourceOperational {
  const values: Array<readonly [keyof ConsumablesOutputSourceOperational, string]> = [
    ['yieldPerUnit', columns.yield >= 0 ? cell(row, columns.yield) : ''],
    ['observations', columns.observations >= 0 ? cell(row, columns.observations) : ''],
    ['contact', columns.contact >= 0 ? cell(row, columns.contact) : ''],
    ['sourceSector', columns.sourceSector >= 0 ? cell(row, columns.sourceSector) : ''],
    ['sourceCommercialArea', columns.sourceCommercialArea >= 0 ? cell(row, columns.sourceCommercialArea) : ''],
    ['sourceContract', columns.contract >= 0 ? cell(row, columns.contract) : ''],
  ];

  return Object.fromEntries(values.filter(([, value]) => value)) as ConsumablesOutputSourceOperational;
}

function findOutputHeaderRow(rows: unknown[][]): number {
  for (let rowIndex = 0; rowIndex < Math.min(rows.length, 30); rowIndex += 1) {
    const headers = rows[rowIndex] ?? [];
    const hasDocument = findHeaderIndex(headers, ['n remision', 'numero remision', 'n de remision', 'remision', 'n comprobante', 'numero comprobante', 'n de comprobante', 'comprobante'], -1) >= 0;
    const hasDate = findHeaderIndex(headers, ['fecha', 'fecha salida', 'fecha de salida'], -1) >= 0;
    const hasCode = findHeaderIndex(headers, ['codigo', 'codigo repuesto', 'codigo de repuesto'], -1) >= 0;
    const hasDescription = findHeaderIndex(headers, ['descripcion', 'descripcion repuesto', 'descripcion del repuesto'], -1) >= 0;
    const hasQuantity = findHeaderIndex(headers, ['cantidad', 'cant', 'cantidad entregada', 'unidades'], -1) >= 0;
    const hasSerial = findHeaderIndex(headers, ['n serie equipo', 'nro serie equipo', 'n serie', 'numero serie', 'n de serie equipo', 'serie equipo'], -1) >= 0;
    const hasModel = findHeaderIndex(headers, ['modelo equipo', 'modelo del equipo', 'modelo', 'modelo canon', 'equipo'], -1) >= 0;
    if (hasDocument && hasDate && hasCode && hasDescription && hasQuantity && hasSerial && hasModel) return rowIndex;
  }
  return -1;
}

function getOutputColumns(headers: unknown[], isConsumablesOutput: boolean): OutputColumns {
  return {
    documentNumber: findHeaderIndex(headers, ['n remision', 'numero remision', 'n de remision', 'remision', 'n comprobante', 'numero comprobante', 'n de comprobante', 'comprobante'], 0),
    date: findHeaderIndex(headers, ['fecha', 'fecha salida', 'fecha de salida'], 1),
    partCode: findHeaderIndex(headers, ['codigo', 'codigo repuesto', 'codigo de repuesto'], 2),
    description: findHeaderIndex(headers, ['descripcion', 'descripcion repuesto', 'descripcion del repuesto'], 3),
    quantity: findHeaderIndex(headers, ['cantidad', 'cant', 'cantidad entregada', 'unidades'], 4),
    yield: isConsumablesOutput ? findHeaderIndex(headers, ['rendimiento', 'rend', 'rend unitario', 'rendimiento unitario'], 5) : -1,
    yieldTotal: isConsumablesOutput ? findHeaderIndex(headers, ['tot rendimient', 'total rendimiento', 'total rend', 'rend total'], 6) : -1,
    serial: findHeaderIndex(headers, ['n serie equipo', 'nro serie equipo', 'n serie', 'numero serie', 'n de serie equipo', 'serie equipo'], isConsumablesOutput ? 7 : 9),
    model: findHeaderIndex(headers, ['modelo equipo', 'modelo del equipo', 'modelo', 'modelo canon', 'equipo'], 8),
    customer: findHeaderIndex(headers, ['cliente', 'clientes', 'customer', 'razon social', 'nombre cliente'], isConsumablesOutput ? 11 : 7),
    unitPrice: findHeaderIndex(headers, ['precio', 'precio unitario', 'precio unitario pyg', 'precio unitario gs', 'valor unitario'], isConsumablesOutput ? 9 : 5),
    totalPrice: findHeaderIndex(headers, ['total', 'total precio', 'precio total', 'total pyg', 'total gs', 'importe total'], isConsumablesOutput ? 10 : 6),
    observations: isConsumablesOutput ? findHeaderIndex(headers, ['observaciones', 'observacion', 'comentarios', 'notas'], 12) : -1,
    contact: isConsumablesOutput ? findHeaderIndex(headers, ['contacto', 'contacto cliente'], 13) : -1,
    sourceSector: findHeaderIndex(headers, ['sector', 'tipo cliente', 'tipo de cliente', 'segmento', 'customer type'], -1),
    sourceCommercialArea: findHeaderIndex(headers, ['area comercial interna', 'area comercial', 'commercial area', 'business area', 'sales area', 'area'], -1),
    technician: isConsumablesOutput ? -1 : findHeaderIndex(headers, ['tecnico', 'técnico', 'responsable tecnico', 'responsable'], 10),
    contract: isConsumablesOutput ? -1 : findHeaderIndex(headers, ['contrato', 'referencia contrato', 'nro contrato'], 11),
    serviceReportNumber: isConsumablesOutput ? -1 : findHeaderIndex(headers, ['n informe servicio', 'numero informe servicio', 'n de informe', 'nro informe', 'informe', 'i s'], 12),
  };
}

function readOptionalNumber(value: unknown): number | null {
  if (value === undefined || value === null || value === '') return null;
  const parsed = safeNumber(value);
  return Number.isFinite(parsed) ? Math.max(0, parsed) : null;
}
