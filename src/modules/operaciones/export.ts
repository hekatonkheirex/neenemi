import type { Workbook as ExcelWorkbook, Worksheet } from 'exceljs';
import type { SourceDetail } from '../../core/source-details';
import type { CustomerRecord } from './repository';

const XLSX_MIME = 'application/vnd.openxmlformats-officedocument.spreadsheetml.sheet';
type ExcelBuffer = ReturnType<ExcelWorkbook['xlsx']['writeBuffer']> extends Promise<infer Value> ? Value : never;
type ExportCell = string | number;
type ExportRow = readonly ExportCell[];

export type OperationsExportData = {
  customers: ExportRow[];
  contracts: ExportRow[];
  equipment: ExportRow[];
  sourceDetails: ExportRow[];
};

export function buildOperationsExportData(customers: readonly CustomerRecord[]): OperationsExportData {
  const customerRows: ExportRow[] = customers.map((customer) => [
    customer.name,
    customer.customerType ?? '',
    customer.commercialArea ?? '',
    customer.contracts.length,
    customer.contracts.reduce((total, contract) => total + contract.equipment.length, 0),
    customer.sourceSheetName,
    sourceRow(customer.sourceRowNumber),
    formatSourceDetails(customer.sourceDetails),
  ]);

  const contractRows: ExportRow[] = [];
  const equipmentRows: ExportRow[] = [];
  const sourceDetailRows: ExportRow[] = [];

  for (const customer of customers) {
    appendSourceDetails(sourceDetailRows, 'Cliente', customer.name, '', null, null, customer.sourceDetails, customer.sourceSheetName, customer.sourceRowNumber);
    for (const contract of customer.contracts) {
      contractRows.push([
        customer.name,
        contract.reference ?? '',
        contract.contractType,
        contract.startsAt ?? '',
        contract.endsAt ?? '',
        contract.orderReference ?? '',
        contract.commercialArea ?? '',
        contract.division ?? '',
        booleanLabel(contract.isActive),
        booleanLabel(contract.requiresClosure),
        contract.equipment.length,
        contract.sourceSheetName,
        sourceRow(contract.sourceRowNumber),
        formatSourceDetails(contract.sourceDetails),
      ]);
      appendSourceDetails(sourceDetailRows, 'Contrato', customer.name, contract.reference ?? '', null, null, contract.sourceDetails, contract.sourceSheetName, contract.sourceRowNumber);

      for (const item of contract.equipment) {
        equipmentRows.push([
          customer.name,
          contract.reference ?? '',
          contract.contractType,
          contract.commercialArea ?? '',
          item.modelLabel,
          item.serialNumber ?? '',
          item.brand ?? '',
          item.description ?? '',
          item.interior ?? '',
          item.location ?? '',
          item.city ?? '',
          item.branch ?? '',
          item.address ?? '',
          booleanLabel(item.isActive),
          item.sourceSheetName,
          sourceRow(item.sourceRowNumber),
          formatSourceDetails(item.sourceDetails),
        ]);
        appendSourceDetails(sourceDetailRows, 'Equipo', customer.name, contract.reference ?? '', item.modelLabel, item.serialNumber, item.sourceDetails, item.sourceSheetName, item.sourceRowNumber);
      }
    }
  }

  return {
    customers: customerRows,
    contracts: contractRows,
    equipment: equipmentRows,
    sourceDetails: sourceDetailRows,
  };
}

export async function buildOperationsWorkbook(customers: readonly CustomerRecord[]): Promise<ExcelBuffer> {
  const { Workbook } = await import('exceljs');
  const workbook = new Workbook();
  workbook.creator = 'DCSS Suite';
  const data = buildOperationsExportData(customers);

  addDataSheet(workbook.addWorksheet('Clientes'), [
    'Cliente',
    'Tipo de cliente',
    'Área comercial',
    'Contratos',
    'Equipos instalados',
    'Hoja origen',
    'Fila origen',
    'Campos de origen',
  ], data.customers, [32, 18, 18, 12, 18, 22, 12, 72]);
  addDataSheet(workbook.addWorksheet('Contratos'), [
    'Cliente',
    'Referencia',
    'Tipo de contrato',
    'Fecha inicio',
    'Fecha fin',
    'OV',
    'Área del contrato',
    'División',
    'Vigente',
    'Requiere cierre',
    'Equipos',
    'Hoja origen',
    'Fila origen',
    'Campos de origen',
  ], data.contracts, [32, 22, 18, 16, 16, 18, 18, 18, 14, 18, 12, 22, 12, 72]);
  addDataSheet(workbook.addWorksheet('Equipos'), [
    'Cliente',
    'Contrato',
    'Tipo de contrato',
    'Área del contrato',
    'Modelo',
    'Serie',
    'Marca',
    'Descripción',
    'Interior',
    'Ubicación',
    'Ciudad',
    'Sucursal',
    'Dirección',
    'Vigente',
    'Hoja origen',
    'Fila origen',
    'Campos de origen',
  ], data.equipment, [32, 22, 18, 18, 32, 20, 16, 42, 22, 22, 18, 18, 42, 14, 22, 12, 72]);
  addDataSheet(workbook.addWorksheet('Detalles de origen'), [
    'Entidad',
    'Cliente',
    'Contrato',
    'Modelo',
    'Serie',
    'Campo',
    'Valor',
    'Hoja origen',
    'Fila origen',
  ], data.sourceDetails, [14, 32, 22, 32, 20, 28, 60, 22, 12]);

  return workbook.xlsx.writeBuffer();
}

export async function exportOperationsWorkbook(customers: readonly CustomerRecord[]): Promise<void> {
  const buffer = await buildOperationsWorkbook(customers);
  download(buffer, `cartera-data-systems-${dateStamp()}.xlsx`);
}

export async function buildCustomerPortfolioWorkbook(customer: CustomerRecord): Promise<ExcelBuffer> {
  const { Workbook } = await import('exceljs');
  const workbook = new Workbook();
  workbook.creator = 'DCSS Suite';
  const sourceDetailRows: ExportRow[] = [];

  appendSourceDetails(
    sourceDetailRows,
    'Cliente',
    customer.name,
    '',
    null,
    null,
    customer.sourceDetails,
    customer.sourceSheetName,
    customer.sourceRowNumber,
  );

  const summary = workbook.addWorksheet('Resumen');
  summary.addRow(['CARTERA DATA SYSTEMS']);
  summary.addRow(['Cliente', customer.name]);
  summary.addRow(['Tipo de cliente', customer.customerType ?? 'Sin clasificar']);
  summary.addRow(['Área comercial', customer.commercialArea ?? 'Sin clasificar']);
  summary.addRow(['Contratos', customer.contracts.length]);
  summary.addRow(['Equipos instalados', customer.contracts.reduce((total, contract) => total + contract.equipment.length, 0)]);
  summary.addRow([]);
  summary.addRow(['Referencia', 'Tipo', 'Inicio', 'Fin', 'OV', 'Área del contrato', 'División', 'Vigente', 'Requiere cierre', 'Equipos']);

  for (const contract of customer.contracts) {
    appendSourceDetails(
      sourceDetailRows,
      'Contrato',
      customer.name,
      contract.reference ?? '',
      null,
      null,
      contract.sourceDetails,
      contract.sourceSheetName,
      contract.sourceRowNumber,
    );
    summary.addRow([
      contract.reference ?? '',
      contract.contractType,
      contract.startsAt ?? '',
      contract.endsAt ?? '',
      contract.orderReference ?? '',
      contract.commercialArea ?? '',
      contract.division ?? '',
      booleanLabel(contract.isActive),
      booleanLabel(contract.requiresClosure),
      contract.equipment.length,
    ]);
  }

  const equipment = workbook.addWorksheet('Equipos');
  equipment.addRow(['Cliente', 'Contrato', 'Tipo', 'Inicio', 'Fin', 'OV', 'Área del contrato', 'División', 'Modelo', 'Serie', 'Marca', 'Descripción', 'Interior', 'Ubicación', 'Ciudad', 'Sucursal', 'Dirección', 'Vigente', 'Hoja origen', 'Fila origen', 'Campos de origen']);
  for (const contract of customer.contracts) {
    for (const item of contract.equipment) {
      appendSourceDetails(
        sourceDetailRows,
        'Equipo',
        customer.name,
        contract.reference ?? '',
        item.modelLabel,
        item.serialNumber,
        item.sourceDetails,
        item.sourceSheetName,
        item.sourceRowNumber,
      );
      equipment.addRow([
        customer.name,
        contract.reference ?? '',
        contract.contractType,
        contract.startsAt ?? '',
          contract.endsAt ?? '',
          contract.orderReference ?? '',
          contract.commercialArea ?? '',
          contract.division ?? '',
        item.modelLabel,
        item.serialNumber ?? '',
        item.brand ?? '',
        item.description ?? '',
        item.interior ?? '',
        item.location ?? '',
        item.city ?? '',
        item.branch ?? '',
        item.address ?? '',
        booleanLabel(item.isActive),
        item.sourceSheetName,
        sourceRow(item.sourceRowNumber),
        formatSourceDetails(item.sourceDetails),
      ]);
    }
  }

  addDataSheet(workbook.addWorksheet('Detalles de origen'), [
    'Entidad',
    'Cliente',
    'Contrato',
    'Modelo',
    'Serie',
    'Campo',
    'Valor',
    'Hoja origen',
    'Fila origen',
  ], sourceDetailRows, [14, 32, 22, 32, 20, 28, 60, 22, 12]);

  styleHeader(summary.getRow(1));
  styleHeader(summary.getRow(8));
  styleHeader(equipment.getRow(1));
  setWidths(summary, [22, 20, 16, 16, 16, 18, 18, 14, 18, 12]);
  setWidths(equipment, [30, 18, 16, 14, 14, 16, 18, 18, 28, 18, 14, 38, 22, 22, 18, 18, 38, 14, 22, 12, 72]);

  return workbook.xlsx.writeBuffer();
}

export async function exportCustomerPortfolio(customer: CustomerRecord): Promise<void> {
  const buffer = await buildCustomerPortfolioWorkbook(customer);
  download(buffer, `cartera-${safeFileName(customer.name)}-${dateStamp()}.xlsx`);
}

function addDataSheet(
  sheet: Worksheet,
  headers: readonly string[],
  rows: readonly ExportRow[],
  widths: readonly number[],
): void {
  sheet.addRow(headers);
  rows.forEach((row) => sheet.addRow(row));
  styleHeader(sheet.getRow(1));
  widths.forEach((width, index) => {
    sheet.getColumn(index + 1).width = width;
  });
  sheet.views = [{ state: 'frozen', ySplit: 1 }];
  sheet.autoFilter = { from: { row: 1, column: 1 }, to: { row: sheet.rowCount, column: headers.length } };
}

function appendSourceDetails(
  rows: ExportRow[],
  entity: string,
  customerName: string,
  contractReference: string,
  modelLabel: string | null,
  serialNumber: string | null,
  details: readonly SourceDetail[],
  sheetName: string,
  rowNumber: number,
): void {
  for (const detail of details) {
    rows.push([
      entity,
      customerName,
      contractReference,
      modelLabel ?? '',
      serialNumber ?? '',
      detail.label,
      detail.value,
      sheetName,
      sourceRow(rowNumber),
    ]);
  }
}

function formatSourceDetails(details: readonly SourceDetail[]): string {
  return details.map((detail) => `${detail.label}: ${detail.value}`).join(' · ');
}

function sourceRow(value: number): ExportCell {
  return value > 0 ? value : '';
}

function booleanLabel(value: boolean | null): string {
  if (value === true) return 'Sí';
  if (value === false) return 'No';
  return 'No informado';
}

function styleHeader(row: { font: unknown; fill: unknown }): void {
  row.font = { bold: true, color: { argb: 'FFFFFFFF' } };
  row.fill = { type: 'pattern', pattern: 'solid', fgColor: { argb: '2456A6' } };
}

function setWidths(sheet: { getColumn(index: number): { width?: number } }, widths: readonly number[]): void {
  widths.forEach((width, index) => {
    sheet.getColumn(index + 1).width = width;
  });
}

function download(buffer: unknown, fileName: string): void {
  const blob = new Blob([buffer as BlobPart], { type: XLSX_MIME });
  const url = URL.createObjectURL(blob);
  const anchor = document.createElement('a');
  anchor.href = url;
  anchor.download = fileName;
  anchor.click();
  URL.revokeObjectURL(url);
}

function safeFileName(value: string): string {
  return value
    .normalize('NFD')
    .replace(/[\u0300-\u036f]/g, '')
    .toLowerCase()
    .replace(/[^a-z0-9]+/g, '-')
    .replace(/^-+|-+$/g, '')
    .slice(0, 60) || 'cliente';
}

function dateStamp(): string {
  return new Date().toISOString().slice(0, 10);
}
