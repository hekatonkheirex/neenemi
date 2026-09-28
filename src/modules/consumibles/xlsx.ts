import {
  classifyCategory,
  classifyCode,
  classifyRecordKind,
  detectFamily,
  detectFamilyFromConsumable,
  descMentionsForeignModel,
  formatDate,
  formatMonth,
  isPaper,
  PYG_TO_USD,
  roundMoney,
} from './analysis';
import { buildCompleteSourceDetails } from '../../core/source-details';
import type { ConsumablesSourceOperational, ConsumablesSourceType, ParsedConsumablesRow } from './types';
import { cell, findHeaderIndex, readHeaderValue, readWorkbookSourceSheets, safeNumber } from './xlsx-helpers';

export type ParsedConsumablesWorkbook = {
  rows: ParsedConsumablesRow[];
  skippedOutOfScope: number;
};

type ConsumablesColumns = {
  date: number;
  model: number;
  serial: number;
  partCode: number;
  description: number;
  quantity: number;
  cost: number;
  sourceId: number;
  customer: number;
  orderReference: number;
  contractType: number;
  month: number;
  division: number;
  dispatchNumber: number;
  technician: number;
  branch: number;
  dataReference: number;
  sourceSector: number;
  sourceCommercialArea: number;
  sourceContractReference: number;
  active: number;
  contractStartsAt: number;
  contractEndsAt: number;
  serviceReportNumber: number;
  taskCompleted: number;
  partsUsed: number;
  unitPrice: number;
  total: number;
};

/**
 * Parses the fixed export layout used by the legacy Consumibles application.
 * Detail exports use date(2), equipment(3), serial(4), code(5), description(6),
 * quantity(7), cost(8), all zero-indexed after the header row. The historical
 * "uso de repuestos" export uses a wider layout with date(4), contract type(9),
 * customer(5), OV(8), equipment(13), month fallback(14), serial(15), code(17),
 * description(20), quantity(21), unit price PYG(22) and total PYG(23).
 */
export async function parseConsumablesWorkbook(
  data: Uint8Array,
  sourceType: ConsumablesSourceType,
): Promise<ParsedConsumablesWorkbook> {
  const sheets = await readWorkbookSourceSheets(data);
  const parsed: ParsedConsumablesRow[] = [];
  let skippedOutOfScope = 0;
  const isUseRepuestos = sourceType === 'uso-repuestos';
  for (const sheet of sheets) {
    const detectedHeaderRow = findConsumablesHeaderRow(sheet.rows.map((sourceRow) => sourceRow.values), isUseRepuestos);
    const headerRowIndex = detectedHeaderRow >= 0 ? detectedHeaderRow : 0;
    const headers = sheet.rows[headerRowIndex]?.values ?? [];
    const columns = getConsumablesColumns(headers, isUseRepuestos);

    for (const sourceRow of sheet.rows.slice(headerRowIndex + 1)) {
      const row = sourceRow.values;
      const modelLabel = cell(row, columns.model);
      const serialNumber = cell(row, columns.serial);
      const partCode = cell(row, columns.partCode);
      const description = cell(row, columns.description);
      if (!modelLabel && !serialNumber && !partCode && !description) continue;

      const equipmentFamily = detectFamily(modelLabel);
      if (!equipmentFamily || !serialNumber || !partCode || isPaper(partCode, description)) {
        skippedOutOfScope += 1;
        continue;
      }

      let family = detectFamilyFromConsumable(partCode, description);
      if (!family) {
        if (descMentionsForeignModel(description)) {
          skippedOutOfScope += 1;
          continue;
        }
        family = equipmentFamily;
      }

      const dateValue = row[columns.date];
      const recordedAt = formatDate(dateValue);
      const month = recordedAt
        ? formatMonth(dateValue)
        : columns.month >= 0
          ? formatMonth(row[columns.month])
          : '';
      const quantity = Math.max(0, safeNumber(row[columns.quantity]));
      const sourceCost = safeNumber(row[columns.cost]);
      const costUsd = isUseRepuestos ? sourceCost * PYG_TO_USD : sourceCost;
      const sourceUnitPricePyg = columns.unitPrice >= 0
        ? Math.max(0, roundMoney(safeNumber(row[columns.unitPrice])))
        : null;
      const sourceTotalPyg = columns.total >= 0
        ? Math.max(0, roundMoney(safeNumber(row[columns.total])))
        : null;
      const sourceOperational = buildSourceOperational(row, columns);
      const sourceDetails = buildCompleteSourceDetails(headers, row, buildConsumablesSourceFields(headers, row));
      parsed.push({
        recordedAt,
        month,
        modelLabel,
        serialNumber,
        partCode,
        description,
        quantity,
        costUsd: Math.max(0, roundMoney(costUsd)),
        recordKind: classifyRecordKind(sourceType, description),
        classification: classifyCode(partCode),
        category: classifyCategory(description),
        family,
        sourceCustomerName: cell(row, columns.customer),
        sourceOrderReference: cell(row, columns.orderReference),
        sourceUnitPricePyg,
        sourceTotalPyg,
        ...(Object.keys(sourceOperational).length > 0 ? { sourceOperational } : {}),
        ...(sourceDetails.length > 0 ? { sourceDetails } : {}),
        sourceSheetName: sourceRow.sheetName,
        sourceRowNumber: sourceRow.rowNumber,
      });
    }
  }

  if (parsed.length === 0 && skippedOutOfScope === 0) {
    throw new Error('El archivo no contiene filas de detalle después de la cabecera.');
  }

  return { rows: parsed, skippedOutOfScope };
}

function findConsumablesHeaderRow(rows: unknown[][], isUseRepuestos: boolean): number {
  for (let rowIndex = 0; rowIndex < Math.min(rows.length, 30); rowIndex += 1) {
    const headers = rows[rowIndex] ?? [];
    const hasModel = findHeaderIndex(headers, ['equipo', 'modelo equipo', 'modelo', 'modelo canon', 'equipo instalado'], -1) >= 0;
    const hasSerial = findHeaderIndex(headers, ['nro serie', 'n serie', 'numero serie', 'n de serie', 'n serie equipo', 'n de serie equipo', 'serie equipo'], -1) >= 0;
    const hasCode = findHeaderIndex(headers, ['codigo repuesto', 'codigo de repuesto', 'codigo', 'cod', 'cod repuesto', 'numero de parte'], -1) >= 0;
    const hasDescription = findHeaderIndex(headers, ['descripcion repuesto', 'descripcion del repuesto', 'detalle repuesto', 'descripcion'], -1) >= 0;
    const hasQuantity = findHeaderIndex(headers, ['cantidad', 'cant', 'cantidad utilizada', 'cantidad usada', 'unidades utilizadas'], -1) >= 0;
    if (hasModel && hasSerial && hasCode && hasDescription && hasQuantity) return rowIndex;
    if (isUseRepuestos && hasModel && hasSerial && hasCode && hasDescription) return rowIndex;
  }
  return -1;
}

function getConsumablesColumns(headers: unknown[], isUseRepuestos: boolean): ConsumablesColumns {
  if (isUseRepuestos) {
    return {
      date: findHeaderIndex(headers, ['fecha salida', 'fecha'], 4),
      model: findHeaderIndex(headers, ['equipo', 'modelo equipo', 'modelo', 'modelo canon', 'equipo instalado'], 13),
      serial: findHeaderIndex(headers, ['nro serie', 'n serie', 'numero serie', 'n de serie', 'n serie equipo', 'n de serie equipo', 'serie equipo'], 15),
      partCode: findHeaderIndex(headers, ['codigo repuesto', 'codigo de repuesto', 'codigo', 'cod', 'cod repuesto', 'numero de parte'], 17),
      description: findHeaderIndex(headers, ['descripcion repuesto', 'descripcion del repuesto', 'detalle repuesto', 'descripcion'], 20),
      quantity: findHeaderIndex(headers, ['cant', 'cantidad', 'cantidad utilizada', 'cantidad usada', 'unidades utilizadas'], 21),
      cost: findHeaderIndex(headers, ['precio total', 'precio total pyg', 'precio total gs', 'total pyg', 'total gs', 'total'], 23),
      sourceId: findHeaderIndex(headers, ['id cab', 'id cabecera', 'cabecera id', 'id'], -1),
      customer: findHeaderIndex(headers, ['cliente', 'razon social', 'nombre cliente'], 5),
      orderReference: findHeaderIndex(headers, ['n ov', 'n o v', 'nro ov', 'numero ov', 'n de ov', 'orden de venta', 'ov'], 8),
      contractType: findHeaderIndex(headers, ['tipo contrato', 'tipo de contrato'], 9),
      month: findHeaderIndex(headers, ['ano mes', 'año mes', 'mes'], 14),
      division: findHeaderIndex(headers, ['division', 'división'], 1),
      dispatchNumber: findHeaderIndex(headers, ['n salida', 'numero salida', 'salida'], 2),
      technician: findHeaderIndex(headers, ['tecnico', 'técnico'], 3),
      branch: findHeaderIndex(headers, ['sucursal'], 6),
      dataReference: findHeaderIndex(headers, ['ref data', 'referencia data'], 7),
      sourceSector: findHeaderIndex(headers, ['sector', 'tipo cliente', 'tipo de cliente', 'segmento'], -1),
      sourceCommercialArea: findHeaderIndex(headers, ['area comercial interna', 'area comercial', 'commercial area', 'business area', 'sales area', 'area'], -1),
      sourceContractReference: findHeaderIndex(headers, ['ref contrato', 'referencia contrato', 'id contrato', 'contrato'], -1),
      active: findHeaderIndex(headers, ['vigente', 'activo'], 10),
      contractStartsAt: findHeaderIndex(headers, ['fecha inicio', 'inicio contrato'], 11),
      contractEndsAt: findHeaderIndex(headers, ['fecha fin', 'fin contrato'], 12),
      serviceReportNumber: findHeaderIndex(headers, ['n i s', 'n is', 'n de i s', 'numero i s', 'informe servicio'], 16),
      taskCompleted: findHeaderIndex(headers, ['tarea realizada'], 18),
      partsUsed: findHeaderIndex(headers, ['repuestos utilizados', 'repuestos utilizados segun i s'], 19),
      unitPrice: findHeaderIndex(headers, ['precio unitario', 'precio unitario pyg', 'precio unitario gs', 'precio unitario guarani', 'precio'], 22),
      total: findHeaderIndex(headers, ['precio total', 'precio total pyg', 'precio total gs', 'total pyg', 'total gs', 'total'], 23),
    };
  }

  return {
    date: findHeaderIndex(headers, ['fecha'], 2),
    model: findHeaderIndex(headers, ['equipo', 'modelo equipo', 'modelo', 'modelo canon', 'equipo instalado'], 3),
    serial: findHeaderIndex(headers, ['nro serie', 'n serie', 'numero serie', 'n de serie', 'n serie equipo', 'n de serie equipo', 'serie equipo'], 4),
    partCode: findHeaderIndex(headers, ['codigo', 'codigo repuesto', 'codigo de repuesto', 'cod', 'cod repuesto', 'numero de parte'], 5),
    description: findHeaderIndex(headers, ['descripcion', 'descripcion repuesto', 'descripcion del repuesto', 'detalle repuesto'], 6),
    quantity: findHeaderIndex(headers, ['cantidad', 'cant', 'cantidad utilizada', 'cantidad usada', 'unidades utilizadas'], 7),
    cost: findHeaderIndex(headers, ['total u', 'total u$', 'costo', 'total'], 8),
    sourceId: findHeaderIndex(headers, ['id cab', 'id cabecera', 'cabecera id', 'id'], 1),
    customer: findHeaderIndex(headers, ['cliente', 'clientes', 'customer', 'razon social', 'nombre cliente'], -1),
    orderReference: findHeaderIndex(headers, ['n ov', 'n o v', 'nro ov', 'numero ov', 'n de ov', 'orden de venta', 'ov'], -1),
    contractType: findHeaderIndex(headers, ['tipo contrato', 'tipo de contrato', 'contract type'], -1),
    month: findHeaderIndex(headers, ['ano mes', 'año mes', 'mes', 'periodo', 'período'], -1),
    division: findHeaderIndex(headers, ['division', 'división', 'unidad de negocio'], -1),
    dispatchNumber: findHeaderIndex(headers, ['n salida', 'numero salida', 'n de salida', 'salida', 'n remision', 'remision'], -1),
    technician: findHeaderIndex(headers, ['tecnico', 'técnico'], -1),
    branch: findHeaderIndex(headers, ['sucursal', 'branch'], -1),
    dataReference: findHeaderIndex(headers, ['ref data', 'referencia data'], -1),
    sourceSector: findHeaderIndex(headers, ['sector', 'tipo cliente', 'tipo de cliente', 'segmento', 'customer type'], -1),
    sourceCommercialArea: findHeaderIndex(headers, ['area comercial interna', 'area comercial', 'commercial area', 'business area', 'sales area', 'area'], -1),
    sourceContractReference: findHeaderIndex(headers, ['ref contrato', 'referencia contrato', 'id contrato', 'contrato'], -1),
    active: findHeaderIndex(headers, ['vigente', 'activo', 'vigencia'], -1),
    contractStartsAt: findHeaderIndex(headers, ['fecha inicio', 'inicio contrato'], -1),
    contractEndsAt: findHeaderIndex(headers, ['fecha fin', 'fin contrato', 'vencimiento'], -1),
    serviceReportNumber: findHeaderIndex(headers, ['n i s', 'n is', 'n de i s', 'numero i s', 'informe servicio'], -1),
    taskCompleted: findHeaderIndex(headers, ['tarea realizada'], -1),
    partsUsed: findHeaderIndex(headers, ['repuestos utilizados', 'repuestos utilizados segun i s'], -1),
    unitPrice: findHeaderIndex(headers, ['precio unitario pyg', 'precio unitario gs', 'precio unitario guarani', 'precio unitario (pyg)'], -1),
    total: findHeaderIndex(headers, ['precio total pyg', 'precio total gs', 'total pyg', 'total gs', 'total precio pyg', 'total (pyg)'], -1),
  };
}

function buildConsumablesSourceFields(
  headers: unknown[],
  row: unknown[],
): Array<readonly [string, unknown]> {
  const read = (names: readonly string[]): unknown => readHeaderValue(headers, row, names);
  return [
    ['Id.Cab', read(['id cab', 'id cabecera', 'cabecera id', 'id'])],
    ['Cliente', read(['cliente', 'clientes', 'customer', 'razon social', 'nombre cliente'])],
    ['Nº OV', read(['n ov', 'n o v', 'nro ov', 'numero ov', 'n de ov', 'orden de venta', 'ov'])],
    ['Tipo Contrato (fuente)', read(['tipo contrato', 'tipo de contrato', 'contract type'])],
    ['Mes (fuente)', read(['ano mes', 'año mes', 'mes', 'periodo', 'período'])],
    ['División', read(['division', 'división', 'unidad de negocio'])],
    ['Nº Salida', read(['n salida', 'numero salida', 'n de salida', 'salida', 'n remision', 'remision'])],
    ['Técnico', read(['tecnico', 'técnico'])],
    ['Sucursal', read(['sucursal', 'branch'])],
    ['Ref DATA', read(['ref data', 'referencia data'])],
    ['Sector (fuente)', read(['sector', 'tipo cliente', 'tipo de cliente', 'segmento', 'customer type'])],
    ['Área comercial (fuente)', read(['area comercial interna', 'area comercial', 'commercial area', 'business area', 'sales area', 'area'])],
    ['Contrato (fuente)', read(['ref contrato', 'referencia contrato', 'id contrato', 'contrato'])],
    ['Vigente', read(['vigente', 'activo', 'vigencia'])],
    ['Fecha Inicio', formatDate(read(['fecha inicio', 'inicio contrato']))],
    ['Fecha Fin', formatDate(read(['fecha fin', 'fin contrato', 'vencimiento']))],
    ['Nº I.S.', read(['n i s', 'n is', 'n de i s', 'numero i s', 'informe servicio'])],
    ['Tarea realizada', read(['tarea realizada'])],
    ['Repuestos utilizados (según I.S.)', read(['repuestos utilizados', 'repuestos utilizados segun i s'])],
    ['Precio Unitario (PYG)', read(['precio unitario pyg', 'precio unitario gs', 'precio unitario guarani', 'precio unitario (pyg)'])],
    ['Precio Total (PYG)', read(['precio total pyg', 'precio total gs', 'total pyg', 'total gs', 'total precio pyg', 'total (pyg)'])],
  ];
}

function buildSourceOperational(
  row: unknown[],
  columns: ConsumablesColumns,
): ConsumablesSourceOperational {
  const values: Array<readonly [keyof ConsumablesSourceOperational, string]> = [
    ['cabId', cell(row, columns.sourceId)],
    ['division', cell(row, columns.division)],
    ['dispatchNumber', cell(row, columns.dispatchNumber)],
    ['technician', cell(row, columns.technician)],
    ['branch', cell(row, columns.branch)],
    ['dataReference', cell(row, columns.dataReference)],
    ['sourceSector', cell(row, columns.sourceSector)],
    ['sourceCommercialArea', cell(row, columns.sourceCommercialArea)],
    ['sourceContractReference', cell(row, columns.sourceContractReference)],
    ['active', cell(row, columns.active)],
    ['contractType', cell(row, columns.contractType)],
    ['contractStartsAt', columns.contractStartsAt >= 0 ? formatDate(row[columns.contractStartsAt]) : ''],
    ['contractEndsAt', columns.contractEndsAt >= 0 ? formatDate(row[columns.contractEndsAt]) : ''],
    ['serviceReportNumber', cell(row, columns.serviceReportNumber)],
    ['taskCompleted', cell(row, columns.taskCompleted)],
    ['partsUsed', cell(row, columns.partsUsed)],
  ];

  return Object.fromEntries(values.filter(([, value]) => value)) as ConsumablesSourceOperational;
}
