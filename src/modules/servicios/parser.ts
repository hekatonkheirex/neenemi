import { detectFamily, formatDate, formatMonth, safeNumber } from '../consumibles/analysis';
import { buildCompleteSourceDetails, formatSourceValue } from '../../core/source-details';
import type { ParsedServiceRow, ServiceSourceOperational } from './types';
import { cell, findHeaderIndex, readHeaderValue, readWorkbookSourceSheets } from '../consumibles/xlsx-helpers';

type ServiceColumns = {
  serviceNumber: number;
  orderReference: number;
  customer: number;
  serial: number;
  model: number;
  serviceType: number;
  startDate: number;
  date: number;
  contractType: number;
  taskType: number;
  technician: number;
  taskCompleted: number;
  partsUsed: number;
  division: number;
  receptionType: number;
  responseTime: number;
  branch: number;
  workTime: number;
  responseCompliance: number;
  serviceTime: number;
  serviceCompliance: number;
  closed: number;
  requestedService: number;
  finishedAt: number;
  status: number;
  interior: number;
  mobileClosed: number;
  rework: number;
  previousServiceNumber: number;
  previousTechnician: number;
  branchCity: number;
  customerCity: number;
  papers: number;
  counters: number;
};

export type ParsedServicesWorkbook = {
  rows: ParsedServiceRow[];
  skippedOutOfScope: number;
};

export async function parseServicesWorkbook(data: Uint8Array): Promise<ParsedServicesWorkbook> {
  const sheets = await readWorkbookSourceSheets(data);
  const parsed: ParsedServiceRow[] = [];
  let skippedOutOfScope = 0;

  for (const sheet of sheets) {
    const detectedHeaderRow = findServiceHeaderRow(sheet.rows.map((sourceRow) => sourceRow.values));
    const headerRowIndex = detectedHeaderRow >= 0 ? detectedHeaderRow : 0;
    const headers = sheet.rows[headerRowIndex]?.values ?? [];
    const columns = getServiceColumns(headers);

    for (const sourceRow of sheet.rows.slice(headerRowIndex + 1)) {
      const row = sourceRow.values;
      const serialNumber = cell(row, columns.serial);
      if (!serialNumber) continue;

      const modelLabel = cell(row, columns.model);
      const family = detectFamily(modelLabel);
      if (!family) {
        skippedOutOfScope += 1;
        continue;
      }

      const recordedAt = formatDate(row[columns.startDate]) || formatDate(row[columns.date]);
      const sourceDetails = buildCompleteSourceDetails(headers, row, [
        ['División', readHeaderValue(headers, row, ['division', 'unidad de negocio'])],
        ['Tipo de recepción', readHeaderValue(headers, row, ['tipo de recepcion', 'tipo recepcion', 'recepcion'])],
        ['T. Resp', readHeaderValue(headers, row, ['t resp', 'tiempo respuesta', 't respuesta'])],
        ['Sucursal', readHeaderValue(headers, row, ['sucursal', 'sede'])],
        ['H. Trab', readHeaderValue(headers, row, ['h trab', 'horas trabajo', 'h trabajo'])],
        ['Resp', readHeaderValue(headers, row, ['resp', 'cumple respuesta', 'respuesta'])],
        ['T. Serv', readHeaderValue(headers, row, ['t serv', 'tiempo servicio', 't servicio'])],
        ['Serv', readHeaderValue(headers, row, ['serv', 'cumple servicio'])],
        ['Cierre', readHeaderValue(headers, row, ['cierre', 'cerrado'])],
        ['Servicio solicitado', readHeaderValue(headers, row, ['servicio solicitado', 'solicitud servicio'])],
        ['Fch/Hora Fin', readHeaderValue(headers, row, ['fch hora fin', 'fecha hora fin', 'fecha de fin', 'fin servicio'])],
        ['Estado', readHeaderValue(headers, row, ['estado', 'status', 'situacion'])],
        ['ES interior', readHeaderValue(headers, row, ['es interior', 'interior'])],
        ['Cerr Mob', readHeaderValue(headers, row, ['cerr mob', 'cerrado movil', 'cierre movil'])],
        ['Es Retrab', readHeaderValue(headers, row, ['es retrab', 'es retrabajo', 'retrabajo'])],
        ['Nº IS "viene"', readHeaderValue(headers, row, ['n is viene', 'n de is viene', 'numero is viene', 'servicio anterior'])],
        ['Técnico "viene"', readHeaderValue(headers, row, ['tecnico viene', 'tecnico anterior'])],
        ['Ciudad Sucursal', readHeaderValue(headers, row, ['ciudad sucursal', 'ciudad sede'])],
        ['Ciudad Cliente', readHeaderValue(headers, row, ['ciudad cliente', 'localidad cliente'])],
        ['Papeles', readHeaderValue(headers, row, ['papeles', 'documentacion'])],
        ['Contadores', readHeaderValue(headers, row, ['contadores', 'lecturas'])],
      ]);
      const sourceOperational = buildSourceOperational(headers, row);
      parsed.push({
        serviceNumber: Math.max(0, Math.trunc(safeNumber(row[columns.serviceNumber]))),
        orderReference: cell(row, columns.orderReference),
        recordedAt,
        month: recordedAt ? recordedAt.slice(0, 7) : formatMonth(row[columns.date]),
        serviceType: cell(row, columns.serviceType),
        taskType: cell(row, columns.taskType),
        sourceContractType: cell(row, columns.contractType),
        technician: cell(row, columns.technician),
        taskCompleted: cell(row, columns.taskCompleted),
        partsUsed: cell(row, columns.partsUsed),
        modelLabel,
        serialNumber,
        sourceCustomerName: cell(row, columns.customer),
        ...(Object.keys(sourceOperational).length > 0 ? { sourceOperational } : {}),
        ...(sourceDetails.length > 0 ? { sourceDetails } : {}),
        family,
        sourceSheetName: sourceRow.sheetName,
        sourceRowNumber: sourceRow.rowNumber,
      });
    }
  }

  if (parsed.length === 0 && skippedOutOfScope === 0) {
    throw new Error('El archivo no contiene filas de servicios después de la cabecera.');
  }

  return { rows: parsed, skippedOutOfScope };
}

function findServiceHeaderRow(rows: unknown[][]): number {
  for (let rowIndex = 0; rowIndex < Math.min(rows.length, 30); rowIndex += 1) {
    const headers = rows[rowIndex] ?? [];
    const hasCustomer = findHeaderIndex(headers, ['cliente', 'razon social', 'nombre cliente'], -1) >= 0;
    const hasSerial = findHeaderIndex(headers, ['n serie', 'nro serie', 'numero serie', 'n de serie', 'n serie equipo', 'n de serie equipo', 'serie equipo'], -1) >= 0;
    const hasModel = findHeaderIndex(headers, ['equipo', 'modelo equipo', 'modelo del equipo', 'modelo', 'model'], -1) >= 0;
    const hasDate = findHeaderIndex(headers, ['fecha', 'fecha servicio', 'fecha de servicio', 'fch hora inicio'], -1) >= 0;
    if (hasCustomer && hasSerial && hasModel && hasDate) return rowIndex;
  }
  return -1;
}

function getServiceColumns(headers: unknown[]): ServiceColumns {
  return {
    serviceNumber: findHeaderIndex(headers, ['n i s', 'n is', 'n de i s', 'numero i s', 'n informe servicio', 'informe servicio', 'i s'], 0),
    orderReference: findHeaderIndex(headers, ['n ov', 'n o v', 'nro ov', 'numero ov', 'n de ov', 'orden de venta'], 5),
    customer: findHeaderIndex(headers, ['cliente', 'razon social', 'nombre cliente'], 3),
    serial: findHeaderIndex(headers, ['n serie', 'nro serie', 'numero serie', 'n de serie', 'n serie equipo', 'n de serie equipo', 'serie equipo'], 6),
    model: findHeaderIndex(headers, ['equipo', 'modelo equipo', 'modelo del equipo', 'modelo'], 7),
    serviceType: findHeaderIndex(headers, ['tipo servicio', 'tipo de servicio'], 15),
    startDate: findHeaderIndex(headers, ['fch hora inicio', 'fecha hora inicio', 'fecha de inicio', 'inicio servicio'], 17),
    date: findHeaderIndex(headers, ['fecha', 'fecha servicio', 'fecha de servicio'], 4),
    contractType: findHeaderIndex(headers, ['tipo contrato', 'tipo de contrato'], 19),
    taskType: findHeaderIndex(headers, ['tipo tarea', 'tipo de tarea'], 20),
    technician: findHeaderIndex(headers, ['tecnico', 'técnico', 'tecnico responsable', 'responsable'], 24),
    taskCompleted: findHeaderIndex(headers, ['tarea realizada', 'trabajo realizado', 'detalle trabajo'], 28),
    partsUsed: findHeaderIndex(headers, ['repuestos utilizados', 'repuestos usados', 'piezas utilizadas'], 29),
    division: findHeaderIndex(headers, ['division', 'unidad de negocio'], 1),
    receptionType: findHeaderIndex(headers, ['tipo de recepcion', 'tipo recepcion', 'recepcion'], 2),
    responseTime: findHeaderIndex(headers, ['t resp', 'tiempo respuesta', 't respuesta'], 8),
    branch: findHeaderIndex(headers, ['sucursal', 'sede'], 9),
    workTime: findHeaderIndex(headers, ['h trab', 'horas trabajo', 'h trabajo'], 10),
    responseCompliance: findHeaderIndex(headers, ['resp', 'cumple respuesta', 'respuesta'], 11),
    serviceTime: findHeaderIndex(headers, ['t serv', 'tiempo servicio', 't servicio'], 12),
    serviceCompliance: findHeaderIndex(headers, ['serv', 'cumple servicio'], 13),
    closed: findHeaderIndex(headers, ['cierre', 'cerrado'], 14),
    requestedService: findHeaderIndex(headers, ['servicio solicitado', 'solicitud servicio'], 16),
    finishedAt: findHeaderIndex(headers, ['fch hora fin', 'fecha hora fin', 'fecha de fin', 'fin servicio'], 18),
    status: findHeaderIndex(headers, ['estado', 'status', 'situacion'], 21),
    interior: findHeaderIndex(headers, ['es interior', 'interior'], 22),
    mobileClosed: findHeaderIndex(headers, ['cerr mob', 'cerrado movil', 'cierre movil'], 23),
    rework: findHeaderIndex(headers, ['es retrab', 'es retrabajo', 'retrabajo'], 25),
    previousServiceNumber: findHeaderIndex(headers, ['n is viene', 'n de is viene', 'numero is viene', 'servicio anterior'], 26),
    previousTechnician: findHeaderIndex(headers, ['tecnico viene', 'tecnico anterior'], 27),
    branchCity: findHeaderIndex(headers, ['ciudad sucursal', 'ciudad sede'], 30),
    customerCity: findHeaderIndex(headers, ['ciudad cliente', 'localidad cliente'], 31),
    papers: findHeaderIndex(headers, ['papeles', 'documentacion'], 32),
    counters: findHeaderIndex(headers, ['contadores', 'lecturas'], 33),
  };
}

function buildSourceOperational(headers: unknown[], row: unknown[]): ServiceSourceOperational {
  const read = (names: readonly string[]): string => formatSourceValue(readHeaderValue(headers, row, names));
  const values: Array<readonly [keyof ServiceSourceOperational, string]> = [
    ['division', read(['division', 'unidad de negocio'])],
    ['receptionType', read(['tipo de recepcion', 'tipo recepcion', 'recepcion'])],
    ['responseTime', read(['t resp', 'tiempo respuesta', 't respuesta'])],
    ['branch', read(['sucursal', 'sede'])],
    ['workTime', read(['h trab', 'horas trabajo', 'h trabajo'])],
    ['responseCompliance', read(['resp', 'cumple respuesta', 'respuesta'])],
    ['serviceTime', read(['t serv', 'tiempo servicio', 't servicio'])],
    ['serviceCompliance', read(['serv', 'cumple servicio'])],
    ['closed', read(['cierre', 'cerrado'])],
    ['requestedService', read(['servicio solicitado', 'solicitud servicio'])],
    ['finishedAt', read(['fch hora fin', 'fecha hora fin', 'fecha de fin', 'fin servicio'])],
    ['status', read(['estado', 'status', 'situacion'])],
    ['interior', read(['es interior', 'interior'])],
    ['mobileClosed', read(['cerr mob', 'cerrado movil', 'cierre movil'])],
    ['rework', read(['es retrab', 'es retrabajo', 'retrabajo'])],
    ['previousServiceNumber', read(['n is viene', 'n de is viene', 'numero is viene', 'servicio anterior'])],
    ['previousTechnician', read(['tecnico viene', 'tecnico anterior'])],
    ['branchCity', read(['ciudad sucursal', 'ciudad sede'])],
    ['customerCity', read(['ciudad cliente', 'localidad cliente'])],
    ['papers', read(['papeles', 'documentacion'])],
    ['counters', read(['contadores', 'lecturas'])],
  ];

  return Object.fromEntries(values.filter(([, value]) => value)) as ServiceSourceOperational;
}
