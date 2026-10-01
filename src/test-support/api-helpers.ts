import fs from 'node:fs';
import os from 'node:os';
import path from 'node:path';
import ExcelJS from 'exceljs';
import { afterEach, expect } from 'vitest';

const temporaryDirectories: string[] = [];

export function makeTemporaryDataDirectory() {
  const directory = fs.mkdtempSync(path.join(os.tmpdir(), 'datasystems-suite-api-'));
  temporaryDirectories.push(directory);
  return directory;
}

export async function resolveImportJob<T>(baseUrl: string, response: Response): Promise<T> {
  expect(response.status).toBe(202);
  const started = (await response.json()) as { jobId: string };
  for (let attempt = 0; attempt < 300; attempt += 1) {
    const jobResponse = await fetch(`${baseUrl}/api/import-jobs/${started.jobId}`);
    expect(jobResponse.ok).toBe(true);
    const job = (await jobResponse.json()) as { status: string; result?: T; error?: string };
    if (job.status === 'completed') {
      expect(job.result).toBeDefined();
      return job.result as T;
    }
    if (job.status === 'failed') throw new Error(job.error || 'La importación de prueba falló.');
    await new Promise<void>((resolve) => setTimeout(resolve, 25));
  }
  throw new Error('La importación de prueba no terminó a tiempo.');
}

export async function makeConsumablesWorkbook(rows: unknown[][]): Promise<Uint8Array> {
  const workbook = new ExcelJS.Workbook();
  const sheet = workbook.addWorksheet('Detalle');
  sheet.addRow(['ID', 'Contrato', 'Fecha', 'Equipo', 'Serie', 'Código', 'Descripción', 'Cantidad', 'Costo USD']);
  for (const row of rows) sheet.addRow(row);
  return new Uint8Array(await workbook.xlsx.writeBuffer());
}

export async function makeUseRepuestosWorkbook(rows: unknown[][]): Promise<Uint8Array> {
  const workbook = new ExcelJS.Workbook();
  const sheet = workbook.addWorksheet('Uso de repuestos');
  sheet.addRow(Array.from({ length: 24 }, (_, index) => `header-${index}`));
  for (const row of rows) sheet.addRow(row);
  return new Uint8Array(await workbook.xlsx.writeBuffer());
}

export async function makeOutputWorkbook(columnCount: number, rows: unknown[][]): Promise<Uint8Array> {
  const workbook = new ExcelJS.Workbook();
  const sheet = workbook.addWorksheet('Salidas');
  sheet.addRow(Array.from({ length: columnCount }, (_, index) => `header-${index}`));
  for (const row of rows) sheet.addRow(row);
  return new Uint8Array(await workbook.xlsx.writeBuffer());
}

export async function makeServicesWorkbook(headers: unknown[], rows: unknown[][]): Promise<Uint8Array> {
  const workbook = new ExcelJS.Workbook();
  const sheet = workbook.addWorksheet('Servicios');
  sheet.addRow(headers);
  for (const row of rows) sheet.addRow(row);
  return new Uint8Array(await workbook.xlsx.writeBuffer());
}

export async function makeSalesCatalogWorkbook(): Promise<Uint8Array> {
  const workbook = new ExcelJS.Workbook();
  const sheet = workbook.addWorksheet('Catálogo');
  sheet.addRow(['Categoría', 'NroParte', 'Descripción', 'Precio $', 'Precio Gs', 'Stock', 'Descontinuado']);
  sheet.addRow(['Tóner', 'CEXV-55', 'TONER NEGRO', 13, 77740, 4, 'No']);
  return new Uint8Array(await workbook.xlsx.writeBuffer());
}

export async function makeLegacyPortfolioWorkbook(): Promise<Uint8Array> {
  const workbook = new ExcelJS.Workbook();
  const portfolio = workbook.addWorksheet('Cartera');
  portfolio.addRow([
    'Cliente', 'Sector', 'Área comercial interna', 'Ref. DATA', 'Tipo contrato',
    'Fecha inicio', 'Fecha fin', 'Modelo', 'Serie', 'Ubicación',
  ]);
  portfolio.addRow([
    'Cliente Cartera', 'Público', 'Strategic', 'OV-CART-001', 'Alquiler',
    new Date('2026-01-01T12:00:00Z'), '31/12/2026', 'iR ADV C3325i', 'SER-CART-001', 'Casa central',
  ]);
  portfolio.addRow([
    'Cliente Cartera', '', '', 'OV-CART-001', 'Alquiler',
    '', '', 'iR ADV C3325i', 'SER-CART-001', '',
  ]);
  portfolio.addRow([
    'Cliente Cartera', '', '', 'OV-CART-001', 'Alquiler',
    '', '', 'iR ADV C5535i', 'SER-CART-002', 'Sucursal',
  ]);
  portfolio.addRow(['Fila incompleta', '', '', 'OV-CART-002', 'Mantenimiento', '', '', '', '', '']);
  return new Uint8Array(await workbook.xlsx.writeBuffer());
}

export async function makeCanonDiscontinuationWorkbook(): Promise<Uint8Array> {
  const workbook = new ExcelJS.Workbook();
  const sheet = workbook.addWorksheet('Printer');
  sheet.addRow(['.', 'Printer', 'Parts End Date']);
  sheet.addRow(['.', 'iR ADV C3325i', 'Dec 31, 2025.']);
  sheet.addRow(['.', 'Model', 'Parts Item Code', 'Voltage', 'Support End']);
  sheet.addRow(['.', 'iR ADV C3325i', 'Q30-3325-000', 120, 'Dec-27']);
  sheet.addRow(['.', 'iR ADV C3325i', 'Q30-3325-000', 120, 'Dec-27']);
  return new Uint8Array(await workbook.xlsx.writeBuffer());
}

export async function makeCanonStockSupportWorkbook(): Promise<Uint8Array> {
  const workbook = new ExcelJS.Workbook();
  const sheet = workbook.addWorksheet('Printer');
  sheet.addRow(['.', 'Printer', 'Parts End Date']);
  sheet.addRow(['.', 'iR ADV C5535i', 'Dec 31, 2025.']);
  return new Uint8Array(await workbook.xlsx.writeBuffer());
}

export async function makeWaldbottStockWorkbook(): Promise<Uint8Array> {
  const workbook = new ExcelJS.Workbook();
  const stock = workbook.addWorksheet('Depósito 04');
  stock.addRow(['Artículo', 'Descripción', 'Depósito', 'Cantidad']);
  stock.addRow(['IR-C5535', 'Impresora Laser IR ADV C5535 (120V)', '04', 2]);
  stock.addRow(['IR-C5535-ALT', 'Canon IR ADV C5535', 4, 3]);
  stock.addRow(['OTHER', 'Impresora Laser MF515x', '02', 8]);
  stock.addRow(['PROJECTOR', 'Proyector BenQ MW560', '04', 4]);
  return new Uint8Array(await workbook.xlsx.writeBuffer());
}

export async function makeTravelWorkbook(destination = 'CDE'): Promise<Uint8Array> {
  const workbook = new ExcelJS.Workbook();
  const travel = workbook.addWorksheet('VIAJES2026');
  travel.addRow([
    'Cant', 'Fecha', 'I.S.', 'Cliente', 'Destino', 'Medio', 'Técnicos', 'Chofer asignado',
    'Monto', 'Viático', 'Hospedaje', 'Peajes', 'Varios', 'Pago por uso de vehículo',
    'Pago a técnicos y chofer', 'Km aproximado realizado', 'Costo combustible por servicio', 'Gasto total',
  ]);
  travel.addRow([
    1, new Date('2026-08-04T12:00:00Z'), 'IS-100', 'Cliente Viajes API', destination, 'MOVIL PROPIO',
    'Tec API', 'S/CHOFER', 300000, 130000, 0, 146000, 0, 60000, 90000, 320, 80000, 506000,
  ]);
  travel.addRow(['SERVICIOS', 3, 0, 0, 0, 0, 0, 0, 0, 0, 0, 0, 0]);
  const currentSummary = Array.from({ length: 26 }, () => 0) as unknown[];
  currentSummary[0] = 'VIAJE TOTAL';
  currentSummary[1] = 1;
  currentSummary[17] = 320;
  currentSummary[18] = 80000;
  currentSummary[19] = 60000;
  currentSummary[20] = 90000;
  currentSummary[21] = 400000;
  currentSummary[22] = 506000;
  currentSummary[23] = 506000;
  currentSummary[24] = 506000;
  currentSummary[25] = 506000;
  travel.addRow(currentSummary);

  const calculation = workbook.addWorksheet('CALCULO AUX');
  calculation.addRow(['Viático', '', '', 150000]);
  calculation.addRow(['Hotel', '', '', 210000]);
  calculation.addRow(['Peajes a CDE']);
  calculation.addRow(['Ypacaraí', 'Nueva Londres', 'Total']);
  calculation.addRow([10000, 20000, 30000]);

  const bus = workbook.addWorksheet('PASAJES EN BUS');
  bus.addRow(['Ciudad', 'Empresa', '', 'Pasaje Ida', 'Pasaje Vuelta']);
  bus.addRow(['CDE', 'Empresa Demo', '', 110000, 110000]);
  return new Uint8Array(await workbook.xlsx.writeBuffer());
}

afterEach(() => {
  for (const directory of temporaryDirectories.splice(0)) {
    fs.rmSync(directory, { recursive: true, force: true });
  }
});
