import fs from 'node:fs';
import os from 'node:os';
import path from 'node:path';
import { createHash } from 'node:crypto';
import Database from 'better-sqlite3';
import ExcelJS from 'exceljs';
import { afterEach, describe, expect, it } from 'vitest';
import { createServer } from './server';
import { ImportRepository } from './src/db/repositories';
import { storeImportFile } from './src/core/import-storage';
import { openDatabase } from './src/db/database';
import { PYG_TO_USD } from './src/modules/consumibles/analysis';

const temporaryDirectories: string[] = [];

function makeTemporaryDataDirectory() {
  const directory = fs.mkdtempSync(path.join(os.tmpdir(), 'datasystems-suite-api-'));
  temporaryDirectories.push(directory);
  return directory;
}

async function resolveImportJob<T>(baseUrl: string, response: Response): Promise<T> {
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

async function makeConsumablesWorkbook(rows: unknown[][]): Promise<Uint8Array> {
  const workbook = new ExcelJS.Workbook();
  const sheet = workbook.addWorksheet('Detalle');
  sheet.addRow(['ID', 'Contrato', 'Fecha', 'Equipo', 'Serie', 'Código', 'Descripción', 'Cantidad', 'Costo USD']);
  for (const row of rows) sheet.addRow(row);
  return new Uint8Array(await workbook.xlsx.writeBuffer());
}

async function makeUseRepuestosWorkbook(rows: unknown[][]): Promise<Uint8Array> {
  const workbook = new ExcelJS.Workbook();
  const sheet = workbook.addWorksheet('Uso de repuestos');
  sheet.addRow(Array.from({ length: 24 }, (_, index) => `header-${index}`));
  for (const row of rows) sheet.addRow(row);
  return new Uint8Array(await workbook.xlsx.writeBuffer());
}

async function makeOutputWorkbook(columnCount: number, rows: unknown[][]): Promise<Uint8Array> {
  const workbook = new ExcelJS.Workbook();
  const sheet = workbook.addWorksheet('Salidas');
  sheet.addRow(Array.from({ length: columnCount }, (_, index) => `header-${index}`));
  for (const row of rows) sheet.addRow(row);
  return new Uint8Array(await workbook.xlsx.writeBuffer());
}

async function makeServicesWorkbook(headers: unknown[], rows: unknown[][]): Promise<Uint8Array> {
  const workbook = new ExcelJS.Workbook();
  const sheet = workbook.addWorksheet('Servicios');
  sheet.addRow(headers);
  for (const row of rows) sheet.addRow(row);
  return new Uint8Array(await workbook.xlsx.writeBuffer());
}

async function makeSalesCatalogWorkbook(): Promise<Uint8Array> {
  const workbook = new ExcelJS.Workbook();
  const sheet = workbook.addWorksheet('Catálogo');
  sheet.addRow(['Categoría', 'NroParte', 'Descripción', 'Precio $', 'Precio Gs', 'Stock', 'Descontinuado']);
  sheet.addRow(['Tóner', 'CEXV-55', 'TONER NEGRO', 13, 77740, 4, 'No']);
  return new Uint8Array(await workbook.xlsx.writeBuffer());
}

async function makeLegacyPortfolioWorkbook(): Promise<Uint8Array> {
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

async function makeCanonDiscontinuationWorkbook(): Promise<Uint8Array> {
  const workbook = new ExcelJS.Workbook();
  const sheet = workbook.addWorksheet('Printer');
  sheet.addRow(['.', 'Printer', 'Parts End Date']);
  sheet.addRow(['.', 'iR ADV C3325i', 'Dec 31, 2025.']);
  sheet.addRow(['.', 'Model', 'Parts Item Code', 'Voltage', 'Support End']);
  sheet.addRow(['.', 'iR ADV C3325i', 'Q30-3325-000', 120, 'Dec-27']);
  sheet.addRow(['.', 'iR ADV C3325i', 'Q30-3325-000', 120, 'Dec-27']);
  return new Uint8Array(await workbook.xlsx.writeBuffer());
}

async function makeCanonStockSupportWorkbook(): Promise<Uint8Array> {
  const workbook = new ExcelJS.Workbook();
  const sheet = workbook.addWorksheet('Printer');
  sheet.addRow(['.', 'Printer', 'Parts End Date']);
  sheet.addRow(['.', 'iR ADV C5535i', 'Dec 31, 2025.']);
  return new Uint8Array(await workbook.xlsx.writeBuffer());
}

async function makeWaldbottStockWorkbook(): Promise<Uint8Array> {
  const workbook = new ExcelJS.Workbook();
  const stock = workbook.addWorksheet('Depósito 04');
  stock.addRow(['Artículo', 'Descripción', 'Depósito', 'Cantidad']);
  stock.addRow(['IR-C5535', 'Impresora Laser IR ADV C5535 (120V)', '04', 2]);
  stock.addRow(['IR-C5535-ALT', 'Canon IR ADV C5535', 4, 3]);
  stock.addRow(['OTHER', 'Impresora Laser MF515x', '02', 8]);
  stock.addRow(['PROJECTOR', 'Proyector BenQ MW560', '04', 4]);
  return new Uint8Array(await workbook.xlsx.writeBuffer());
}

async function makeTravelWorkbook(destination = 'CDE'): Promise<Uint8Array> {
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

describe('suite local API', () => {
  it('reports that the shared SQLite database is ready', async () => {
    const { app, database } = createServer({ dataDirectory: makeTemporaryDataDirectory() });
    const server = app.listen(0, '127.0.0.1');

    try {
      await new Promise<void>((resolve) => server.once('listening', () => resolve()));
      const address = server.address();
      const port = typeof address === 'object' && address ? address.port : 0;
      const response = await fetch(`http://127.0.0.1:${port}/api/health`);

      expect(response.status).toBe(200);
      expect(await response.json()).toEqual({ ok: true, database: 'ready' });

      const overviewResponse = await fetch(`http://127.0.0.1:${port}/api/overview`);
      expect(overviewResponse.status).toBe(200);
      expect(await overviewResponse.json()).toMatchObject({
        counts: { parts: 0, customers: 0, contracts: 0, equipment: 0 },
        appliedImports: 0,
        recentImports: [],
      });

      const reindexResponse = await fetch(`http://127.0.0.1:${port}/api/sources/reindex`, { method: 'POST' });
      expect(reindexResponse.status).toBe(200);
      expect(await reindexResponse.json()).toMatchObject({
        batches: 0,
        files: 0,
        rawRows: 0,
        usageRecords: 0,
        outputRecords: 0,
        serviceRecords: 0,
        travelTrips: 0,
        errors: [],
      });
    } finally {
      await new Promise<void>((resolve) => server.close(() => resolve()));
      database.close();
    }
  });

  it('saves PDF-derived coverage and rejects manual coverage input', async () => {
    const { app, database } = createServer({ dataDirectory: makeTemporaryDataDirectory() });
    const server = app.listen(0, '127.0.0.1');

    try {
      await new Promise<void>((resolve) => server.once('listening', () => resolve()));
      const address = server.address();
      const port = typeof address === 'object' && address ? address.port : 0;
      const baseUrl = `http://127.0.0.1:${port}`;
      const pages = [{ page: 1, black: 5, cyan: 0, magenta: 0, yellow: 0 }];

      const manualResponse = await fetch(`${baseUrl}/api/coverage/analyze`, {
        method: 'POST',
        headers: { 'content-type': 'application/json' },
        body: JSON.stringify({ sourceName: 'manual', pages, inputMode: 'manual' }),
      });
      expect(manualResponse.status).toBe(400);

      const pdfResponse = await fetch(`${baseUrl}/api/coverage/analyze`, {
        method: 'POST',
        headers: { 'content-type': 'application/json' },
        body: JSON.stringify({
          sourceName: 'informe-cobertura.pdf',
          pages,
          failedPages: [{ page: 2, message: 'Página dañada.' }],
          inputMode: 'pdf',
        }),
      });
      expect(pdfResponse.status).toBe(200);
      expect(await pdfResponse.json()).toMatchObject({
        analysis: {
          sourceName: 'informe-cobertura.pdf',
          inputMode: 'pdf',
          failedPages: [{ page: 2, message: 'Página dañada.' }],
          coverage: { pages: [{ page: 1, black: 5 }], average: { black: 5 } },
        },
      });

      const lastResponse = await fetch(`${baseUrl}/api/coverage/last`);
      expect(lastResponse.status).toBe(200);
      expect(await lastResponse.json()).toMatchObject({ inputMode: 'pdf', sourceName: 'informe-cobertura.pdf' });
    } finally {
      await new Promise<void>((resolve) => server.close(() => resolve()));
      database.close();
    }
  });

  it('checks whether a source file is still the current applied import for its domain', async () => {
    const { app, database } = createServer({ dataDirectory: makeTemporaryDataDirectory() });
    const imports = new ImportRepository(database);
    const sourceHash = 'a'.repeat(64);
    const batchId = imports.createBatch({
      domain: 'sales-catalog',
      sourceName: 'CONSUMIBLES_SISTEMA_ING.xlsx',
      sourceType: 'proformas-catalog-consumibles',
      sourceHash,
    });
    imports.markApplied(batchId);
    const server = app.listen(0, '127.0.0.1');

    try {
      await new Promise<void>((resolve) => server.once('listening', () => resolve()));
      const address = server.address();
      const port = typeof address === 'object' && address ? address.port : 0;
      const currentResponse = await fetch(
        `http://127.0.0.1:${port}/api/imports/check-current?domain=sales-catalog&sourceType=proformas-catalog-consumibles&sourceHash=${sourceHash}`,
      );

      expect(currentResponse.status).toBe(200);
      expect(await currentResponse.json()).toEqual({ current: true, batchId });

      const otherTypeResponse = await fetch(
        `http://127.0.0.1:${port}/api/imports/check-current?domain=sales-catalog&sourceType=proformas-catalog-repuestos&sourceHash=${sourceHash}`,
      );
      expect(otherTypeResponse.status).toBe(200);
      expect(await otherTypeResponse.json()).toEqual({ current: false, batchId: null });
    } finally {
      await new Promise<void>((resolve) => server.close(() => resolve()));
      database.close();
    }
  });

  it('clears imported data globally and archives original files', async () => {
    const dataDirectory = makeTemporaryDataDirectory();
    const { app, database } = createServer({ dataDirectory });
    const imports = new ImportRepository(database);
    const batchId = imports.createBatch({ domain: 'operations', sourceName: 'cartera.xlsx' });
    const sourcePath = path.join(dataDirectory, 'imports', 'operations', 'cartera.xlsx');
    fs.mkdirSync(path.dirname(sourcePath), { recursive: true });
    fs.writeFileSync(sourcePath, 'original');
    imports.addFile({
      batchId,
      fileName: 'cartera.xlsx',
      storedPath: 'imports/operations/cartera.xlsx',
      contentHash: createHash('sha256').update('original').digest('hex'),
      sizeBytes: 8,
    });
    imports.markApplied(batchId);
    const server = app.listen(0, '127.0.0.1');

    try {
      await new Promise<void>((resolve) => server.once('listening', () => resolve()));
      const address = server.address();
      const port = typeof address === 'object' && address ? address.port : 0;
      const response = await fetch(`http://127.0.0.1:${port}/api/system/imports`, { method: 'DELETE' });

      expect(response.status).toBe(200);
      expect(await response.json()).toMatchObject({ ok: true, batches: 1, files: 1, archivedFiles: 1 });
      expect(imports.getBatch(batchId)).toBeUndefined();
      expect(fs.existsSync(path.join(dataDirectory, 'imports', '.removed', batchId, '001-cartera.xlsx'))).toBe(true);
      const archiveStatus = await fetch(`http://127.0.0.1:${port}/api/system/import-originals/status`);
      expect(await archiveStatus.json()).toMatchObject({ totalFiles: 1, embeddedFiles: 1, missingFiles: 0 });
    } finally {
      await new Promise<void>((resolve) => server.close(() => resolve()));
      database.close();
    }
  });

  it('blocks cross-origin state changes while allowing same-origin maintenance resets', async () => {
    const { app, database } = createServer({ dataDirectory: makeTemporaryDataDirectory() });
    const imports = new ImportRepository(database);
    const maintenanceBatchId = imports.createBatch({
      domain: 'maintenance',
      sourceName: 'Base de mantenimiento',
      sourceType: 'maintenance',
    });
    imports.markApplied(maintenanceBatchId);
    const server = app.listen(0, '127.0.0.1');

    try {
      await new Promise<void>((resolve) => server.once('listening', () => resolve()));
      const address = server.address();
      const port = typeof address === 'object' && address ? address.port : 0;
      const baseUrl = `http://127.0.0.1:${port}`;
      const saveResponse = await fetch(`${baseUrl}/api/maintenance/rules`, {
        method: 'POST',
        headers: { 'content-type': 'application/json', origin: baseUrl },
        body: JSON.stringify({ modelLabel: 'Modelo protegido', usefulLife: 100000, optimalBase: 10000, maxWaste: 0.4 }),
      });
      expect(saveResponse.status).toBe(201);

      const crossOriginResponse = await fetch(`${baseUrl}/api/maintenance/rules/reset`, {
        method: 'POST',
        headers: { origin: 'https://attacker.example', 'content-type': 'application/x-www-form-urlencoded' },
      });
      expect(crossOriginResponse.status).toBe(403);
      const rulesAfterCrossOriginRequest = await fetch(`${baseUrl}/api/maintenance/rules`);
      expect(await rulesAfterCrossOriginRequest.json()).toEqual([
        expect.objectContaining({ modelLabel: 'Modelo protegido' }),
      ]);

      const sameOriginResponse = await fetch(`${baseUrl}/api/maintenance/rules/reset`, {
        method: 'POST',
        headers: { origin: baseUrl, 'sec-fetch-site': 'same-origin' },
      });
      expect(sameOriginResponse.status).toBe(200);
      const rulesAfterSameOriginRequest = await fetch(`${baseUrl}/api/maintenance/rules`);
      const rulesAfterReset = await rulesAfterSameOriginRequest.json() as Array<{ modelLabel: string }>;
      expect(rulesAfterReset.some((rule) => rule.modelLabel === 'Modelo protegido')).toBe(false);
    } finally {
      await new Promise<void>((resolve) => server.close(() => resolve()));
      database.close();
    }
  });

  it('clears more than 1000 imported batches and preserves manual batches', async () => {
    const dataDirectory = makeTemporaryDataDirectory();
    const { app, database } = createServer({ dataDirectory });
    const imports = new ImportRepository(database);
    const firstBatchId = imports.createBatch({
      domain: 'catalog',
      sourceName: 'catalogo-0.xlsx',
      sourceType: 'catalog',
    });
    const contents = new TextEncoder().encode('catalog source rows');
    const stored = storeImportFile(dataDirectory, firstBatchId, 'catalogo-0.xlsx', contents);
    const fileId = imports.addFile({
      batchId: firstBatchId,
      fileName: 'catalogo-0.xlsx',
      storedPath: stored.storedPath,
      contentHash: stored.contentHash,
      sizeBytes: stored.sizeBytes,
      contentBlob: contents,
    });
    imports.addSourceRows(firstBatchId, fileId, [{ name: 'Catalogo', rows: [['Código'], ['P-001']] }]);
    imports.markApplied(firstBatchId);
    for (let index = 1; index < 1001; index += 1) {
      const batchId = imports.createBatch({
        domain: 'catalog',
        sourceName: `catalogo-${index}.xlsx`,
        sourceType: 'catalog',
      });
      imports.markApplied(batchId);
    }
    const manualBatchId = imports.createBatch({
      domain: 'mps-manual',
      sourceName: 'Perfiles MPS manuales',
      sourceType: 'manual',
    });
    imports.markApplied(manualBatchId);

    const server = app.listen(0, '127.0.0.1');
    try {
      await new Promise<void>((resolve) => server.once('listening', () => resolve()));
      const address = server.address();
      const port = typeof address === 'object' && address ? address.port : 0;
      const response = await fetch(`http://127.0.0.1:${port}/api/system/imports`, { method: 'DELETE' });

      expect(response.status).toBe(200);
      expect(await response.json()).toMatchObject({ ok: true, batches: 1001, files: 1, archivedFiles: 1 });
      expect(imports.getBatch(manualBatchId)).toEqual(expect.objectContaining({ sourceType: 'manual', status: 'applied' }));
      expect(database.prepare('SELECT COUNT(*) AS count FROM import_batches WHERE source_type IS NULL OR source_type <> \'manual\'').get()).toEqual({ count: 0 });
      expect(database.prepare('SELECT COUNT(*) AS count FROM import_source_rows').get()).toEqual({ count: 0 });
      expect(database.prepare('SELECT COUNT(*) AS count FROM archived_import_files').get()).toEqual({ count: 1 });
      expect(fs.readdirSync(path.join(dataDirectory, 'imports', '.removed', firstBatchId))).toEqual([
        `001-${path.basename(stored.storedPath)}`,
      ]);
    } finally {
      await new Promise<void>((resolve) => server.close(() => resolve()));
      database.close();
    }
  });

  it('preflights a bundle source without creating import batches', async () => {
    const { app, database } = createServer({ dataDirectory: makeTemporaryDataDirectory() });
    const server = app.listen(0, '127.0.0.1');

    try {
      await new Promise<void>((resolve) => server.once('listening', () => resolve()));
      const address = server.address();
      const port = typeof address === 'object' && address ? address.port : 0;
      const baseUrl = `http://127.0.0.1:${port}`;
      const contents = await makeConsumablesWorkbook([
        ['line-1', 'OV-PREFLIGHT', new Date('2026-08-01T12:00:00Z'), 'iR ADV C3325i', 'SER-PREFLIGHT', 'CRG-T03', 'Tóner T03', 1, 120],
      ]);

      const validResponse = await fetch(`${baseUrl}/api/consumables/bundle-preflight`, {
        method: 'POST',
        headers: { 'content-type': 'application/json' },
        body: JSON.stringify({
          sourceId: 'consumibles.detail',
          sourceName: 'Detalles de consumibles.xlsx',
          contentBase64: Buffer.from(contents).toString('base64'),
        }),
      });
      expect(validResponse.status).toBe(200);
      expect(await validResponse.json()).toEqual({
        sourceId: 'consumibles.detail',
        sourceName: 'Detalles de consumibles.xlsx',
        accepted: true,
      });

      const zipHeaderOnlyResponse = await fetch(`${baseUrl}/api/consumables/bundle-preflight`, {
        method: 'POST',
        headers: { 'content-type': 'application/json' },
        body: JSON.stringify({
          bundleId: 'bundle-header-only',
          sourceId: 'services.lam',
          sourceName: 'Servicios LAM.xlsx',
          contentBase64: Buffer.from([0x50, 0x4b, 0x03, 0x04]).toString('base64'),
        }),
      });
      expect(zipHeaderOnlyResponse.status).toBe(200);
      expect(await zipHeaderOnlyResponse.json()).toMatchObject({ accepted: true, bundleId: 'bundle-header-only' });
      const discardResponse = await fetch(`${baseUrl}/api/consumables/bundle/bundle-header-only`, { method: 'DELETE' });
      expect(discardResponse.ok).toBe(true);

      const invalidResponse = await fetch(`${baseUrl}/api/consumables/bundle-preflight`, {
        method: 'POST',
        headers: { 'content-type': 'application/json' },
        body: JSON.stringify({
          sourceId: 'services.lam',
          sourceName: 'Servicios LAM.xlsx',
          contentBase64: Buffer.from([1, 2, 3, 4]).toString('base64'),
        }),
      });
      expect(invalidResponse.status).toBe(400);
      expect(database.prepare('SELECT COUNT(*) AS count FROM import_batches').get()).toEqual({ count: 0 });
    } finally {
      await new Promise<void>((resolve) => server.close(() => resolve()));
      database.close();
    }
  });

  it('stages all nine bundle sources and applies them atomically as an import job', async () => {
    const dataDirectory = makeTemporaryDataDirectory();
    const { app, database } = createServer({ dataDirectory });
    const server = app.listen(0, '127.0.0.1');

    try {
      await new Promise<void>((resolve) => server.once('listening', () => resolve()));
      const address = server.address();
      const port = typeof address === 'object' && address ? address.port : 0;
      const baseUrl = `http://127.0.0.1:${port}`;
      const headers = { 'content-type': 'application/json' };
      const bundleId = 'bundle-atomic-test';
      const portfolioBytes = await makeLegacyPortfolioWorkbook();
      const detailBytes = await makeConsumablesWorkbook([
        ['line-detail', 'OV-CART-001', new Date('2026-08-01T12:00:00Z'), 'iR ADV C3325i', 'SER-CART-001', 'CRG-T03-BUNDLE', 'Tóner T03', 1, 15],
      ]);
      const partsDetailBytes = await makeConsumablesWorkbook([
        ['line-parts', 'OV-CART-001', new Date('2026-08-02T12:00:00Z'), 'iR ADV C3325i', 'SER-CART-001', 'RPL-BUNDLE', 'Kit de rodillo', 1, 30],
      ]);
      const useRepuestosRow = new Array(24).fill(undefined) as unknown[];
      useRepuestosRow[4] = new Date('2026-08-03T12:00:00Z');
      useRepuestosRow[5] = 'Cliente Cartera';
      useRepuestosRow[8] = 'OV-CART-001';
      useRepuestosRow[9] = 'Alquiler';
      useRepuestosRow[13] = 'iR ADV C3325i';
      useRepuestosRow[14] = '2026-08';
      useRepuestosRow[15] = 'SER-CART-001';
      useRepuestosRow[17] = 'RPL-USE-BUNDLE';
      useRepuestosRow[20] = 'Fusor completo';
      useRepuestosRow[21] = 1;
      useRepuestosRow[22] = 50000;
      useRepuestosRow[23] = 50000;
      const useRepuestosBytes = await makeUseRepuestosWorkbook([useRepuestosRow]);
      const outputConsumablesRow = new Array(12).fill(undefined) as unknown[];
      outputConsumablesRow[0] = 7101;
      outputConsumablesRow[1] = new Date('2026-08-04T12:00:00Z');
      outputConsumablesRow[2] = 'CRG-OUT-BUNDLE';
      outputConsumablesRow[3] = 'Tóner de salida';
      outputConsumablesRow[4] = 1;
      outputConsumablesRow[6] = 12000;
      outputConsumablesRow[7] = 'SER-CART-001';
      outputConsumablesRow[8] = 'iR ADV C3325i';
      outputConsumablesRow[11] = 'Cliente Cartera';
      const outputConsumablesBytes = await makeOutputWorkbook(12, [outputConsumablesRow]);
      const outputPartsRow = new Array(13).fill(undefined) as unknown[];
      outputPartsRow[0] = 7102;
      outputPartsRow[1] = new Date('2026-08-05T12:00:00Z');
      outputPartsRow[2] = 'RPL-OUT-BUNDLE';
      outputPartsRow[3] = 'Fusor de salida';
      outputPartsRow[4] = 1;
      outputPartsRow[7] = 'Cliente Cartera';
      outputPartsRow[8] = 'iR ADV C3325i';
      outputPartsRow[9] = 'SER-CART-001';
      outputPartsRow[10] = 'Técnico paquete';
      outputPartsRow[12] = 9901;
      const outputPartsBytes = await makeOutputWorkbook(13, [outputPartsRow]);
      const serviceHeaders = Array.from({ length: 31 }, (_, index) => `unused-${index}`);
      serviceHeaders[1] = 'Nº I.S.';
      serviceHeaders[4] = 'Cliente';
      serviceHeaders[5] = 'Fecha';
      serviceHeaders[6] = 'Nº OV';
      serviceHeaders[7] = 'Nº Serie';
      serviceHeaders[8] = 'Equipo';
      serviceHeaders[16] = 'Tipo Servicio';
      serviceHeaders[18] = 'Fch/Hora Inicio';
      serviceHeaders[20] = 'Tipo Contrato';
      serviceHeaders[21] = 'Tipo Tarea';
      serviceHeaders[25] = 'Técnico';
      serviceHeaders[29] = 'Tarea realizada';
      serviceHeaders[30] = 'Repuestos utilizados';
      const serviceRow = Array.from({ length: 31 }, () => undefined) as unknown[];
      serviceRow[1] = 9902;
      serviceRow[4] = 'Cliente Cartera';
      serviceRow[5] = new Date('2026-08-06T12:00:00Z');
      serviceRow[6] = 'OV-CART-001';
      serviceRow[7] = 'SER-CART-001';
      serviceRow[8] = 'iR ADV C3325i';
      serviceRow[16] = 'En sitio';
      serviceRow[18] = new Date('2026-08-06T12:00:00Z');
      serviceRow[20] = 'Alquiler';
      serviceRow[21] = 'Reparación';
      serviceRow[25] = 'Técnico paquete';
      serviceRow[29] = 'Cambio de fusor';
      serviceRow[30] = 'Fusor';
      const serviceBytes = await makeServicesWorkbook(serviceHeaders, [serviceRow]);
      const sources = [
        ['fleet.equipment', 'Equipos.xlsx', portfolioBytes],
        ['fleet.contracts', 'Contratos.xlsx', portfolioBytes],
        ['fleet.contract-details', 'Detalles de contratos.xlsx', portfolioBytes],
        ['consumibles.detail', 'Detalles de consumibles.xlsx', detailBytes],
        ['consumibles.parts-detail', 'Detalles de repuestos.xlsx', partsDetailBytes],
        ['consumibles.parts-usage', 'Detalles de uso de repuestos.xlsx', useRepuestosBytes],
        ['consumibles.dispatch', 'Salida de Consumibles.xlsx', outputConsumablesBytes],
        ['consumibles.parts-dispatch', 'Salida de Repuestos.xlsx', outputPartsBytes],
        ['services.lam', 'Servicios LAM.xlsx', serviceBytes],
      ] as const;

      for (const [sourceId, sourceName, contents] of sources) {
        const preflightResponse = await fetch(`${baseUrl}/api/consumables/bundle-preflight`, {
          method: 'POST',
          headers,
          body: JSON.stringify({
            bundleId,
            sourceId,
            sourceName,
            contentBase64: Buffer.from(contents).toString('base64'),
          }),
        });
        const preflightBody = await preflightResponse.text();
        expect(preflightResponse.status, `${sourceId}: ${preflightBody}`).toBe(200);
      }

      expect(database.prepare('SELECT COUNT(*) AS count FROM import_batches').get()).toEqual({ count: 0 });
      const commitResponse = await fetch(`${baseUrl}/api/consumables/bundle-commit`, {
        method: 'POST',
        headers,
        body: JSON.stringify({ bundleId }),
      });
      expect(commitResponse.status).toBe(202);
      const commit = await resolveImportJob<{
        atomic: boolean;
        results: Array<{ sourceId: string; duplicate: boolean }>;
      }>(baseUrl, commitResponse);
      expect(commit.atomic).toBe(true);
      expect(commit.results).toHaveLength(9);
      expect(commit.results.every((result) => !result.duplicate)).toBe(true);
      expect(database.prepare("SELECT COUNT(*) AS count FROM import_batches WHERE status = 'applied'").get()).toEqual({ count: 9 });
      expect(database.prepare('SELECT COUNT(*) AS count FROM consumables_usage_records').get()).toEqual({ count: 3 });
      expect(database.prepare('SELECT COUNT(*) AS count FROM consumables_output_records').get()).toEqual({ count: 2 });
      expect(database.prepare('SELECT COUNT(*) AS count FROM service_records').get()).toEqual({ count: 1 });
      expect(fs.existsSync(path.join(dataDirectory, 'imports', '.staging', bundleId))).toBe(false);

      const staleServiceRow = [...serviceRow];
      staleServiceRow[1] = 9903;
      const staleServiceBytes = await makeServicesWorkbook(serviceHeaders, [staleServiceRow]);
      const staleServiceResponse = await fetch(`${baseUrl}/api/services/import-xlsx`, {
        method: 'POST',
        headers,
        body: JSON.stringify({
          sourceName: 'Servicios LAM versión B.xlsx',
          sourceType: 'servicios',
          contentBase64: Buffer.from(staleServiceBytes).toString('base64'),
        }),
      });
      expect(staleServiceResponse.status).toBe(201);
      const staleService = (await staleServiceResponse.json()) as { batchId: string; accepted: number };
      expect(staleService.accepted).toBe(1);
      expect(database.prepare("SELECT COUNT(*) AS count FROM import_batches WHERE domain = 'services' AND status = 'applied'").get()).toEqual({ count: 2 });
      expect(database.prepare('SELECT COUNT(*) AS count FROM service_records').get()).toEqual({ count: 2 });

      const duplicateBundleId = 'bundle-duplicate-selected-source';
      for (const [sourceId, sourceName, contents] of sources) {
        const preflightResponse = await fetch(`${baseUrl}/api/consumables/bundle-preflight`, {
          method: 'POST',
          headers,
          body: JSON.stringify({
            bundleId: duplicateBundleId,
            sourceId,
            sourceName,
            contentBase64: Buffer.from(contents).toString('base64'),
          }),
        });
        expect(preflightResponse.status, `${sourceId}: ${await preflightResponse.text()}`).toBe(200);
      }
      const duplicateCommitResponse = await fetch(`${baseUrl}/api/consumables/bundle-commit`, {
        method: 'POST',
        headers,
        body: JSON.stringify({ bundleId: duplicateBundleId }),
      });
      const duplicateCommit = await resolveImportJob<{
        atomic: boolean;
        results: Array<{ sourceId: string; duplicate: boolean }>;
      }>(baseUrl, duplicateCommitResponse);
      expect(duplicateCommit.atomic).toBe(true);
      expect(duplicateCommit.results).toHaveLength(9);
      expect(duplicateCommit.results.every((result) => result.duplicate)).toBe(true);
      expect(database.prepare("SELECT source_name FROM import_batches WHERE domain = 'services' AND status = 'applied'").all()).toEqual([
        { source_name: 'Servicios LAM.xlsx' },
      ]);
      expect(database.prepare('SELECT service_number FROM service_records').all()).toEqual([{ service_number: 9902 }]);
      expect(database.prepare('SELECT COUNT(*) AS count FROM archived_import_files WHERE source_batch_id = ?').get(staleService.batchId)).toEqual({ count: 1 });

      const failingBundleId = 'bundle-atomic-failure';
      const failingDetailBytes = await makeConsumablesWorkbook([
        ['line-failure', 'OV-CART-001', new Date('2026-09-01T12:00:00Z'), 'iR ADV C3325i', 'SER-CART-001', 'CRG-T03-FAILURE', 'Tóner T03', 1, 15],
      ]);
      const failingSources = sources.map(([sourceId, sourceName, contents]) => sourceId === 'consumibles.detail'
        ? [sourceId, 'Detalles de consumibles corregidos.xlsx', failingDetailBytes] as const
        : [sourceId, sourceName, contents] as const);
      for (const [sourceId, sourceName, contents] of failingSources) {
        const preflightResponse = await fetch(`${baseUrl}/api/consumables/bundle-preflight`, {
          method: 'POST',
          headers,
          body: JSON.stringify({
            bundleId: failingBundleId,
            sourceId,
            sourceName,
            contentBase64: Buffer.from(contents).toString('base64'),
          }),
        });
        const preflightBody = await preflightResponse.text();
        expect(preflightResponse.status, `${sourceId}: ${preflightBody}`).toBe(200);
      }
      database.exec(`
        CREATE TRIGGER force_bundle_failure
        BEFORE INSERT ON consumables_usage_records
        BEGIN
          SELECT RAISE(ABORT, 'fallo controlado del paquete');
        END;
      `);
      const failingCommitResponse = await fetch(`${baseUrl}/api/consumables/bundle-commit`, {
        method: 'POST',
        headers,
        body: JSON.stringify({ bundleId: failingBundleId }),
      });
      expect(failingCommitResponse.status).toBe(202);
      await expect(resolveImportJob(baseUrl, failingCommitResponse)).rejects.toThrow('fallo controlado del paquete');
      expect(database.prepare("SELECT COUNT(*) AS count FROM import_batches WHERE status = 'applied'").get()).toEqual({ count: 9 });
      expect(database.prepare('SELECT COUNT(*) AS count FROM consumables_usage_records').get()).toEqual({ count: 3 });
      expect(fs.existsSync(path.join(dataDirectory, 'imports', '.staging', failingBundleId))).toBe(false);
    } finally {
      await new Promise<void>((resolve) => server.close(() => resolve()));
      database.close();
    }
  });

  it('downloads a consistent SQLite backup without leaving temporary files', async () => {
    const dataDirectory = makeTemporaryDataDirectory();
    const { app, database } = createServer({ dataDirectory });
    database.prepare('INSERT INTO app_settings (namespace, key, value_json, updated_at) VALUES (?, ?, ?, ?)')
      .run('test', 'backup', JSON.stringify({ ready: true }), '2026-09-10T12:00:00.000Z');
    const imports = new ImportRepository(database);
    const batchId = imports.createBatch({ domain: 'catalog', sourceName: 'catalogo.xlsx' });
    const original = new TextEncoder().encode('original respaldado');
    imports.addFile({
      batchId,
      fileName: 'catalogo.xlsx',
      storedPath: 'imports/catalog/catalogo.xlsx',
      contentHash: createHash('sha256').update(original).digest('hex'),
      sizeBytes: original.byteLength,
      contentBlob: original,
    });
    const removedBatchId = imports.createBatch({ domain: 'catalog', sourceName: 'catalogo-anterior.xlsx' });
    const removedOriginal = new TextEncoder().encode('original de una carga retirada');
    const removedFileId = imports.addFile({
      batchId: removedBatchId,
      fileName: 'catalogo-anterior.xlsx',
      storedPath: 'imports/catalogo-anterior.xlsx',
      contentHash: createHash('sha256').update(removedOriginal).digest('hex'),
      sizeBytes: removedOriginal.byteLength,
      contentBlob: removedOriginal,
    });
    imports.removeBatch(removedBatchId);
    const server = app.listen(0, '127.0.0.1');

    try {
      await new Promise<void>((resolve) => server.once('listening', () => resolve()));
      const address = server.address();
      const port = typeof address === 'object' && address ? address.port : 0;
      const response = await fetch(`http://127.0.0.1:${port}/api/system/backup`);
      const backup = Buffer.from(await response.arrayBuffer());

      expect(response.status).toBe(200);
      expect(response.headers.get('content-type')).toContain('application/vnd.sqlite3');
      expect(response.headers.get('content-disposition')).toMatch(/datasystems-suite-backup-.*\.sqlite/);
      expect(backup.subarray(0, 16).toString()).toBe('SQLite format 3\u0000');

      const downloadedPath = path.join(dataDirectory, 'downloaded-backup-test.sqlite');
      fs.writeFileSync(downloadedPath, backup);
      const downloadedDatabase = new Database(downloadedPath, { readonly: true, fileMustExist: true });
      try {
        const saved = downloadedDatabase.prepare('SELECT content_blob FROM import_files WHERE file_name = ?').get('catalogo.xlsx') as { content_blob: Buffer };
        expect(new Uint8Array(saved.content_blob)).toEqual(original);
        const archived = downloadedDatabase.prepare('SELECT content_blob FROM archived_import_files WHERE id = ?').get(removedFileId) as { content_blob: Buffer };
        expect(new Uint8Array(archived.content_blob)).toEqual(removedOriginal);
      } finally {
        downloadedDatabase.close();
      }

      const temporaryBackups = fs.readdirSync(dataDirectory).filter((name) => name.startsWith('.datasystems-backup-'));
      expect(temporaryBackups).toEqual([]);
    } finally {
      await new Promise<void>((resolve) => server.close(() => resolve()));
      database.close();
    }
  });

  it('blocks a self-contained backup while an original source is missing', async () => {
    const { app, database } = createServer({ dataDirectory: makeTemporaryDataDirectory() });
    const imports = new ImportRepository(database);
    const batchId = imports.createBatch({ domain: 'catalog', sourceName: 'catalogo.xlsx' });
    imports.addFile({
      batchId,
      fileName: 'catalogo.xlsx',
      storedPath: 'imports/catalogo.xlsx',
      contentHash: 'legacy-hash',
      sizeBytes: 12,
    });
    const server = app.listen(0, '127.0.0.1');

    try {
      await new Promise<void>((resolve) => server.once('listening', () => resolve()));
      const address = server.address();
      const port = typeof address === 'object' && address ? address.port : 0;
      const response = await fetch(`http://127.0.0.1:${port}/api/system/backup`);

      expect(response.status).toBe(409);
      expect(await response.json()).toMatchObject({ archiveStatus: { missingFiles: 1 } });
    } finally {
      await new Promise<void>((resolve) => server.close(() => resolve()));
      database.close();
    }
  });

  it('backfills legacy originals through a progress job', async () => {
    const dataDirectory = makeTemporaryDataDirectory();
    const { app, database } = createServer({ dataDirectory });
    const imports = new ImportRepository(database);
    const batchId = imports.createBatch({ domain: 'catalog', sourceName: 'catalogo.xlsx' });
    const original = new TextEncoder().encode('original histórico');
    const stored = storeImportFile(dataDirectory, batchId, 'catalogo.xlsx', original);
    imports.addFile({
      batchId,
      fileName: 'catalogo.xlsx',
      storedPath: stored.storedPath,
      contentHash: stored.contentHash,
      sizeBytes: stored.sizeBytes,
    });
    const removedBatchId = 'batch-from-previous-version';
    const removedOriginal = new TextEncoder().encode('original en archivo histórico');
    const removedHash = createHash('sha256').update(removedOriginal).digest('hex');
    const removedPath = path.join(dataDirectory, 'imports', '.removed', removedBatchId, `001-${removedHash.slice(0, 16)}-anterior.xlsx`);
    fs.mkdirSync(path.dirname(removedPath), { recursive: true });
    fs.writeFileSync(removedPath, removedOriginal);
    const server = app.listen(0, '127.0.0.1');

    try {
      await new Promise<void>((resolve) => server.once('listening', () => resolve()));
      const address = server.address();
      const port = typeof address === 'object' && address ? address.port : 0;
      const baseUrl = `http://127.0.0.1:${port}`;
      const statusResponse = await fetch(`${baseUrl}/api/system/import-originals/status`);
      expect(await statusResponse.json()).toMatchObject({ totalFiles: 2, missingFiles: 2 });
      const blockedBackup = await fetch(`${baseUrl}/api/system/backup`);
      expect(blockedBackup.status).toBe(409);
      const startResponse = await fetch(`${baseUrl}/api/system/import-originals/backfill`, {
        method: 'POST',
        headers: { 'content-type': 'application/json' },
        body: '{}',
      });
      const result = await resolveImportJob<{ total: number; embedded: number; failed: number }>(baseUrl, startResponse);

      expect(result).toEqual({ total: 2, embedded: 2, failed: 0, errors: [] });
      expect(imports.getFileContentStatus()).toMatchObject({ totalFiles: 2, embeddedFiles: 2, missingFiles: 0 });
      expect(fs.existsSync(path.join(dataDirectory, stored.storedPath))).toBe(true);
      expect(fs.existsSync(removedPath)).toBe(true);
    } finally {
      await new Promise<void>((resolve) => server.close(() => resolve()));
      database.close();
    }
  });

  it('stages only a validated full SQLite restore and hands it off after the response', async () => {
    const temporaryDirectory = makeTemporaryDataDirectory();
    const sourceDirectory = path.join(temporaryDirectory, 'source');
    fs.mkdirSync(sourceDirectory, { recursive: true });
    const sourceDatabase = openDatabase(path.join(sourceDirectory, 'source.sqlite'));
    const sourceImports = new ImportRepository(sourceDatabase);
    const sourceBatchId = sourceImports.createBatch({ domain: 'catalog', sourceName: 'catalogo.xlsx' });
    const original = new TextEncoder().encode('restore original');
    sourceImports.addFile({
      batchId: sourceBatchId,
      fileName: 'catalogo.xlsx',
      storedPath: 'imports/catalogo.xlsx',
      contentHash: createHash('sha256').update(original).digest('hex'),
      sizeBytes: original.byteLength,
      contentBlob: original,
    });
    const backupPath = path.join(sourceDirectory, 'full-backup.sqlite');
    await sourceDatabase.backup(backupPath);
    sourceDatabase.close();
    const backupContents = fs.readFileSync(backupPath);

    const activeDirectory = path.join(temporaryDirectory, 'active');
    fs.mkdirSync(activeDirectory, { recursive: true });
    let resolvePrepared: (candidatePath: string) => void = () => undefined;
    const candidatePrepared = new Promise<string>((resolve) => {
      resolvePrepared = resolve;
    });
    const { app, database } = createServer({
      dataDirectory: activeDirectory,
      onRestorePrepared: resolvePrepared,
    });
    const server = app.listen(0, '127.0.0.1');
    let stagedPath: string | undefined;

    try {
      await new Promise<void>((resolve) => server.once('listening', () => resolve()));
      const address = server.address();
      const port = typeof address === 'object' && address ? address.port : 0;
      const response = await fetch(`http://127.0.0.1:${port}/api/system/restore`, {
        method: 'POST',
        headers: { 'content-type': 'application/vnd.sqlite3' },
        body: backupContents,
      });
      expect(response.status).toBe(202);
      expect(await response.json()).toMatchObject({ ok: true });
      stagedPath = await candidatePrepared;
      expect(fs.existsSync(stagedPath)).toBe(true);
      expect(fs.existsSync(path.join(activeDirectory, 'backups'))).toBe(false);
      expect(database.open).toBe(true);
    } finally {
      await new Promise<void>((resolve) => server.close(() => resolve()));
      database.close();
      if (stagedPath) fs.rmSync(stagedPath, { force: true });
    }
  });

  it('persists settings and import metadata through the local API', async () => {
    const { app, database } = createServer({ dataDirectory: makeTemporaryDataDirectory() });
    const server = app.listen(0, '127.0.0.1');

    try {
      await new Promise<void>((resolve) => server.once('listening', () => resolve()));
      const address = server.address();
      const port = typeof address === 'object' && address ? address.port : 0;
      const baseUrl = `http://127.0.0.1:${port}`;

      const settingsResponse = await fetch(`${baseUrl}/api/settings/catalog/exchange-rate`, {
        method: 'PUT',
        headers: { 'content-type': 'application/json' },
        body: JSON.stringify({ value: 7125 }),
      });
      expect(settingsResponse.status).toBe(200);

      const storedSettingsResponse = await fetch(`${baseUrl}/api/settings/catalog/exchange-rate`);
      expect(await storedSettingsResponse.json()).toEqual({ value: 7125 });

      const batchResponse = await fetch(`${baseUrl}/api/imports`, {
        method: 'POST',
        headers: { 'content-type': 'application/json' },
        body: JSON.stringify({ domain: 'catalog', sourceName: 'catalogo.xlsx', sourceHash: 'abc123' }),
      });
      expect(batchResponse.status).toBe(201);
      const batch = (await batchResponse.json()) as { id: string };

      const fileResponse = await fetch(`${baseUrl}/api/imports/${batch.id}/files`, {
        method: 'POST',
        headers: { 'content-type': 'application/json' },
        body: JSON.stringify({
          fileName: 'catalogo.xlsx',
          storedPath: 'imports/catalog/catalogo.xlsx',
          contentHash: 'abc123',
          contentType: 'application/vnd.openxmlformats-officedocument.spreadsheetml.sheet',
          sizeBytes: 128,
        }),
      });
      expect(fileResponse.status).toBe(201);

      const statusResponse = await fetch(`${baseUrl}/api/imports/${batch.id}/status`, {
        method: 'POST',
        headers: { 'content-type': 'application/json' },
        body: JSON.stringify({ status: 'applied' }),
      });
      expect(statusResponse.status).toBe(200);

      const importResponse = await fetch(`${baseUrl}/api/imports/${batch.id}`);
      expect(await importResponse.json()).toMatchObject({
        batch: {
          id: batch.id,
          domain: 'catalog',
          sourceName: 'catalogo.xlsx',
          sourceHash: 'abc123',
          status: 'applied',
        },
        files: [expect.objectContaining({ fileName: 'catalogo.xlsx', sizeBytes: 128 })],
      });
    } finally {
      await new Promise<void>((resolve) => server.close(() => resolve()));
      database.close();
    }
  });

  it('archives and removes a selected Consumibles load without touching shared loads', async () => {
    const dataDirectory = makeTemporaryDataDirectory();
    const { app, database } = createServer({ dataDirectory });
    const server = app.listen(0, '127.0.0.1');

    try {
      await new Promise<void>((resolve) => server.once('listening', () => resolve()));
      const address = server.address();
      const port = typeof address === 'object' && address ? address.port : 0;
      const baseUrl = `http://127.0.0.1:${port}`;
      const createResponse = await fetch(`${baseUrl}/api/imports`, {
        method: 'POST',
        headers: { 'content-type': 'application/json' },
        body: JSON.stringify({ domain: 'consumibles', sourceName: 'exportacion-renombrada.xlsx', sourceType: 'consumibles' }),
      });
      const batch = (await createResponse.json()) as { id: string };
      const contents = await makeConsumablesWorkbook([]);
      const sourceResponse = await fetch(`${baseUrl}/api/imports/${batch.id}/source`, {
        method: 'POST',
        headers: { 'content-type': 'application/json' },
        body: JSON.stringify({
          fileName: 'exportacion-renombrada.xlsx',
          contentBase64: Buffer.from(contents).toString('base64'),
          contentType: 'application/vnd.openxmlformats-officedocument.spreadsheetml.sheet',
        }),
      });
      expect(sourceResponse.status).toBe(201);
      const stored = (await sourceResponse.json()) as { id: string; storedPath: string };
      const statusResponse = await fetch(`${baseUrl}/api/imports/${batch.id}/status`, {
        method: 'POST',
        headers: { 'content-type': 'application/json' },
        body: JSON.stringify({ status: 'applied' }),
      });
      expect(statusResponse.status).toBe(200);
      expect(fs.existsSync(path.join(dataDirectory, stored.storedPath))).toBe(true);

      const archiveStatusResponse = await fetch(`${baseUrl}/api/system/import-originals/status`);
      expect(await archiveStatusResponse.json()).toMatchObject({ totalFiles: 1, embeddedFiles: 1, missingFiles: 0 });
      const sourcePath = path.join(dataDirectory, stored.storedPath);
      const temporarilyMovedPath = path.join(dataDirectory, '.test-source-temporary');
      fs.renameSync(sourcePath, temporarilyMovedPath);
      const originalResponse = await fetch(`${baseUrl}/api/imports/${batch.id}/files/${stored.id}`);
      expect(originalResponse.status).toBe(200);
      expect(Buffer.from(await originalResponse.arrayBuffer())).toEqual(Buffer.from(contents));
      fs.renameSync(temporarilyMovedPath, sourcePath);

      fs.rmSync(sourcePath);
      const removeResponse = await fetch(`${baseUrl}/api/imports/${batch.id}`, { method: 'DELETE' });
      expect(removeResponse.status).toBe(200);
      expect(await removeResponse.json()).toMatchObject({ ok: true, batchId: batch.id, archivedFiles: 1 });
      expect(fs.existsSync(path.join(dataDirectory, stored.storedPath))).toBe(false);
      const archivedDirectory = path.join(dataDirectory, 'imports', '.removed');
      expect(fs.readdirSync(archivedDirectory, { recursive: true }).some((entry) => String(entry).endsWith(path.basename(stored.storedPath)))).toBe(true);

      const metadataResponse = await fetch(`${baseUrl}/api/imports/${batch.id}`);
      expect(metadataResponse.status).toBe(404);
      expect(database.prepare('SELECT COUNT(*) AS count FROM import_batches WHERE id = ?').get(batch.id)).toEqual({ count: 0 });
    } finally {
      await new Promise<void>((resolve) => server.close(() => resolve()));
      database.close();
    }
  });

  it('clears all direct Consumibles loads while keeping related imports', async () => {
    const dataDirectory = makeTemporaryDataDirectory();
    const { app, database } = createServer({ dataDirectory });
    const server = app.listen(0, '127.0.0.1');

    try {
      await new Promise<void>((resolve) => server.once('listening', () => resolve()));
      const address = server.address();
      const port = typeof address === 'object' && address ? address.port : 0;
      const baseUrl = `http://127.0.0.1:${port}`;
      const directResponse = await fetch(`${baseUrl}/api/imports`, {
        method: 'POST',
        headers: { 'content-type': 'application/json' },
        body: JSON.stringify({ domain: 'consumibles', sourceName: 'detalles-directos.xlsx', sourceType: 'consumibles' }),
      });
      const directBatch = (await directResponse.json()) as { id: string };
      const contents = await makeConsumablesWorkbook([]);
      const sourceResponse = await fetch(`${baseUrl}/api/imports/${directBatch.id}/source`, {
        method: 'POST',
        headers: { 'content-type': 'application/json' },
        body: JSON.stringify({
          fileName: 'detalles-directos.xlsx',
          contentBase64: Buffer.from(contents).toString('base64'),
          contentType: 'application/vnd.openxmlformats-officedocument.spreadsheetml.sheet',
        }),
      });
      expect(sourceResponse.status).toBe(201);
      const sharedResponse = await fetch(`${baseUrl}/api/imports`, {
        method: 'POST',
        headers: { 'content-type': 'application/json' },
        body: JSON.stringify({ domain: 'services', sourceName: 'Servicios LAM.xlsx', sourceType: 'servicios' }),
      });
      const sharedBatch = (await sharedResponse.json()) as { id: string };

      const clearResponse = await fetch(`${baseUrl}/api/consumables/imports`, { method: 'DELETE' });
      expect(clearResponse.status).toBe(200);
      expect(await clearResponse.json()).toMatchObject({ ok: true, batches: 1, archivedFiles: 1 });
      expect((await fetch(`${baseUrl}/api/imports/${directBatch.id}`)).status).toBe(404);
      expect((await fetch(`${baseUrl}/api/imports/${sharedBatch.id}`)).status).toBe(200);
      expect(database.prepare('SELECT COUNT(*) AS count FROM import_batches WHERE domain = ?').get('consumibles')).toEqual({ count: 0 });
    } finally {
      await new Promise<void>((resolve) => server.close(() => resolve()));
      database.close();
    }
  });

  it('imports and searches normalized catalog parts through the local API', async () => {
    const dataDirectory = makeTemporaryDataDirectory();
    const { app, database } = createServer({ dataDirectory });
    const server = app.listen(0, '127.0.0.1');

    try {
      await new Promise<void>((resolve) => server.once('listening', () => resolve()));
      const address = server.address();
      const port = typeof address === 'object' && address ? address.port : 0;
      const baseUrl = `http://127.0.0.1:${port}`;

      const batchResponse = await fetch(`${baseUrl}/api/imports`, {
        method: 'POST',
        headers: { 'content-type': 'application/json' },
        body: JSON.stringify({ domain: 'catalog', sourceName: 'catalogo.xlsx' }),
      });
      const batch = (await batchResponse.json()) as { id: string };

      const sourceResponse = await fetch(`${baseUrl}/api/imports/${batch.id}/source`, {
        method: 'POST',
        headers: { 'content-type': 'application/json' },
        body: JSON.stringify({
          fileName: 'catalogo.xlsx',
          contentBase64: Buffer.from(await makeConsumablesWorkbook([])).toString('base64'),
          contentType: 'application/vnd.openxmlformats-officedocument.spreadsheetml.sheet',
        }),
      });
      expect(sourceResponse.status).toBe(201);
      const storedSource = (await sourceResponse.json()) as { storedPath: string };
      expect(fs.existsSync(path.join(dataDirectory, storedSource.storedPath))).toBe(true);

      const importResponse = await fetch(`${baseUrl}/api/catalog/parts`, {
        method: 'POST',
        headers: { 'content-type': 'application/json' },
        body: JSON.stringify({
          batchId: batch.id,
          parts: [
            {
              brand: 'Canon',
              code: ' FK-123 ',
              description: 'KIT DE MANTENIMIENTO',
              models: ['iR ADV C3325i'],
              stock: 7,
              priceUsd: 12.5,
              priceLocal: 79375,
              markup: 0,
              discontinuedAt: null,
            },
          ],
        }),
      });
      expect(importResponse.status).toBe(200);
      expect(await importResponse.json()).toEqual({ parts: 1, models: 1 });

      const sourceMetadataResponse = await fetch(`${baseUrl}/api/catalog/source`);
      expect(sourceMetadataResponse.status).toBe(200);
      expect(await sourceMetadataResponse.json()).toMatchObject({
        batchId: batch.id,
        fileName: 'catalogo.xlsx',
      });

      const searchResponse = await fetch(`${baseUrl}/api/catalog/parts?query=fk123&stockOnly=true`);
      expect(await searchResponse.json()).toEqual([
        expect.objectContaining({ code: 'FK-123', stock: 7, models: ['iR ADV C3325i'] }),
      ]);

      const seedBatchResponse = await fetch(`${baseUrl}/api/imports`, {
        method: 'POST',
        headers: { 'content-type': 'application/json' },
        body: JSON.stringify({ domain: 'catalog', sourceName: 'Listado de precios 2024 (semilla heredada).json', sourceType: 'catalog-seed' }),
      });
      const seedBatch = (await seedBatchResponse.json()) as { id: string };
      const seedImportResponse = await fetch(`${baseUrl}/api/catalog/parts`, {
        method: 'POST',
        headers: { 'content-type': 'application/json' },
        body: JSON.stringify({
          batchId: seedBatch.id,
          replaceAll: true,
          parts: [{
            brand: 'Canon',
            code: 'SEED-001',
            description: 'Parte de semilla heredada',
            models: ['iR ADV C3325i'],
            stock: 2,
            priceUsd: 4,
            priceLocal: 43000,
            markup: 0,
            discontinuedAt: null,
          }],
          modelNotes: [{
            brand: 'Canon',
            familyName: 'iR ADV',
            modelName: 'iR ADV C3325i',
            note: 'Usa tóner de alta capacidad.',
          }],
          serviceItems: [{
            brand: 'Canon',
            familyName: 'iR ADV',
            modelName: 'iR ADV C3325i',
            kind: 'labor',
            description: 'Cambio de kit de rodillos',
            fixedPriceLocal: null,
          }, {
            brand: 'Canon',
            familyName: 'iR ADV',
            modelName: 'iR ADV C3325i',
            kind: 'fixed',
            description: 'Mantenimiento preventivo',
            fixedPriceLocal: 320000,
          }],
        }),
      });
      expect(seedImportResponse.status).toBe(200);
      expect(await (await fetch(`${baseUrl}/api/catalog/parts`)).json()).toEqual([
        expect.objectContaining({ code: 'SEED-001', description: 'Parte de semilla heredada' }),
      ]);
      expect(await (await fetch(`${baseUrl}/api/catalog/model-notes`)).json()).toEqual([
        expect.objectContaining({ modelName: 'iR ADV C3325i', note: 'Usa tóner de alta capacidad.' }),
      ]);
      expect(await (await fetch(`${baseUrl}/api/catalog/service-items?modelName=iR%20ADV%20C3325i`)).json()).toEqual([
        expect.objectContaining({ kind: 'labor', description: 'Cambio de kit de rodillos' }),
        expect.objectContaining({ kind: 'fixed', description: 'Mantenimiento preventivo', fixedPriceLocal: 320000 }),
      ]);
    } finally {
      await new Promise<void>((resolve) => server.close(() => resolve()));
      database.close();
    }
  });

  it('persists customers, contracts and installed equipment in the shared database', async () => {
    const { app, database } = createServer({ dataDirectory: makeTemporaryDataDirectory() });
    const server = app.listen(0, '127.0.0.1');

    try {
      await new Promise<void>((resolve) => server.once('listening', () => resolve()));
      const address = server.address();
      const port = typeof address === 'object' && address ? address.port : 0;
      const baseUrl = `http://127.0.0.1:${port}`;
      const headers = { 'content-type': 'application/json' };

      const customerResponse = await fetch(`${baseUrl}/api/operations/customers`, {
        method: 'POST',
        headers,
        body: JSON.stringify({ name: 'Cliente Operaciones', customerType: 'Privado', commercialArea: 'Commercial' }),
      });
      expect(customerResponse.status).toBe(201);
      const customer = (await customerResponse.json()) as { id: string };

      const contractResponse = await fetch(`${baseUrl}/api/operations/contracts`, {
        method: 'POST',
        headers,
        body: JSON.stringify({
          customerId: customer.id,
          reference: 'OV-OPS-001',
          contractType: 'Mantenimiento',
          startsAt: '2026-01-01',
          equipment: [{ modelLabel: 'iR ADV C3325i', serialNumber: 'SER-OPS-001', location: 'Casa central' }],
        }),
      });
      expect(contractResponse.status).toBe(201);

      const customersResponse = await fetch(`${baseUrl}/api/operations/customers?query=operaciones`);
      expect(await customersResponse.json()).toEqual([
        expect.objectContaining({
          id: customer.id,
          name: 'Cliente Operaciones',
          contracts: [expect.objectContaining({
            reference: 'OV-OPS-001',
            equipment: [expect.objectContaining({ serialNumber: 'SER-OPS-001' })],
          })],
        }),
      ]);

      const equipmentResponse = await fetch(`${baseUrl}/api/operations/equipment?query=SER-OPS-001`);
      expect(await equipmentResponse.json()).toEqual([
        expect.objectContaining({ customerId: customer.id, modelLabel: 'iR ADV C3325i', serialNumber: 'SER-OPS-001' }),
      ]);
    } finally {
      await new Promise<void>((resolve) => server.close(() => resolve()));
      database.close();
    }
  });

  it('imports a legacy portfolio into the shared operations tables and deduplicates it', async () => {
    const dataDirectory = makeTemporaryDataDirectory();
    const { app, database } = createServer({ dataDirectory });
    const server = app.listen(0, '127.0.0.1');

    try {
      await new Promise<void>((resolve) => server.once('listening', () => resolve()));
      const address = server.address();
      const port = typeof address === 'object' && address ? address.port : 0;
      const baseUrl = `http://127.0.0.1:${port}`;
      const bytes = await makeLegacyPortfolioWorkbook();
      const payload = {
        sourceName: 'cartera-legacy.xlsx',
        contentBase64: Buffer.from(bytes).toString('base64'),
      };

      const importResponse = await fetch(`${baseUrl}/api/operations/import-legacy-portfolio`, {
        method: 'POST',
        headers: { 'content-type': 'application/json' },
        body: JSON.stringify(payload),
      });
      expect(await resolveImportJob<Record<string, unknown>>(baseUrl, importResponse)).toMatchObject({
        duplicate: false,
        rows: 2,
        skippedRows: 1,
        duplicateRows: 1,
        customers: 1,
        contracts: 1,
        equipment: 2,
      });

      const customersResponse = await fetch(`${baseUrl}/api/operations/customers?query=cartera`);
      expect(await customersResponse.json()).toEqual([
        expect.objectContaining({
          name: 'Cliente Cartera',
          customerType: 'Publico',
          commercialArea: 'Strategic',
          contracts: [expect.objectContaining({
            reference: 'OV-CART-001',
            contractType: 'Alquiler',
            equipment: expect.arrayContaining([
              expect.objectContaining({ serialNumber: 'SER-CART-001' }),
              expect.objectContaining({ serialNumber: 'SER-CART-002', location: 'Sucursal' }),
            ]),
          })],
        }),
      ]);

      const duplicateResponse = await fetch(`${baseUrl}/api/operations/import-legacy-portfolio`, {
        method: 'POST',
        headers: { 'content-type': 'application/json' },
        body: JSON.stringify(payload),
      });
      await expect(resolveImportJob(baseUrl, duplicateResponse)).resolves.toMatchObject({ duplicate: true, sourceName: 'cartera-legacy.xlsx' });
    } finally {
      await new Promise<void>((resolve) => server.close(() => resolve()));
      database.close();
    }
  });

  it('imports the Canon discontinuation list as model support data and deduplicates it', async () => {
    const dataDirectory = makeTemporaryDataDirectory();
    const { app, database } = createServer({ dataDirectory });
    const server = app.listen(0, '127.0.0.1');

    try {
      await new Promise<void>((resolve) => server.once('listening', () => resolve()));
      const address = server.address();
      const port = typeof address === 'object' && address ? address.port : 0;
      const baseUrl = `http://127.0.0.1:${port}`;
      const headers = { 'content-type': 'application/json' };

      const customerResponse = await fetch(`${baseUrl}/api/operations/customers`, {
        method: 'POST',
        headers,
        body: JSON.stringify({ name: 'Cliente Canon Discontinuado' }),
      });
      const customer = (await customerResponse.json()) as { id: string };
      await fetch(`${baseUrl}/api/operations/contracts`, {
        method: 'POST',
        headers,
        body: JSON.stringify({
          customerId: customer.id,
          contractType: 'Mantenimiento',
          equipment: [{ modelLabel: 'iR ADV C3325i', serialNumber: 'SER-CANON-001' }],
        }),
      });

      const bytes = await makeCanonDiscontinuationWorkbook();
      const payload = {
        sourceName: 'MODELOS DISCONTINUOS.xlsx',
        contentBase64: Buffer.from(bytes).toString('base64'),
      };
      const importResponse = await fetch(`${baseUrl}/api/operations/import-canon-discontinuation`, {
        method: 'POST',
        headers,
        body: JSON.stringify(payload),
      });
      expect(await resolveImportJob<Record<string, unknown>>(baseUrl, importResponse)).toMatchObject({
        duplicate: false,
        rows: 2,
        duplicateRows: 1,
        items: 2,
      });

      const modelResponse = await fetch(`${baseUrl}/api/operations/model-discontinuation`);
      expect(await modelResponse.json()).toEqual([
        expect.objectContaining({
          modelLabel: 'iR ADV C3325i',
          partCode: '',
          endsAt: '2025-12-31',
          installedCount: 1,
          installedModels: ['iR ADV C3325i'],
          status: 'discontinued',
        }),
        expect.objectContaining({
          modelLabel: 'iR ADV C3325i',
          partCode: 'Q30-3325-000',
          endsAt: '2027-12-01',
          installedCount: 1,
          status: 'scheduled',
        }),
      ]);

      const duplicateResponse = await fetch(`${baseUrl}/api/operations/import-canon-discontinuation`, {
        method: 'POST',
        headers,
        body: JSON.stringify(payload),
      });
      await expect(resolveImportJob(baseUrl, duplicateResponse)).resolves.toMatchObject({ duplicate: true, sourceName: 'MODELOS DISCONTINUOS.xlsx' });
    } finally {
      await new Promise<void>((resolve) => server.close(() => resolve()));
      database.close();
    }
  });

  it('imports Waldbott Depot 04 stock, keeps the latest model snapshot and exposes the cross-reference', async () => {
    const dataDirectory = makeTemporaryDataDirectory();
    const { app, database } = createServer({ dataDirectory });
    const server = app.listen(0, '127.0.0.1');

    try {
      await new Promise<void>((resolve) => server.once('listening', () => resolve()));
      const address = server.address();
      const port = typeof address === 'object' && address ? address.port : 0;
      const baseUrl = `http://127.0.0.1:${port}`;
      const headers = { 'content-type': 'application/json' };

      const customerResponse = await fetch(`${baseUrl}/api/operations/customers`, {
        method: 'POST',
        headers,
        body: JSON.stringify({ name: 'Cliente Stock Waldbott' }),
      });
      const customer = (await customerResponse.json()) as { id: string };
      await fetch(`${baseUrl}/api/operations/contracts`, {
        method: 'POST',
        headers,
        body: JSON.stringify({
          customerId: customer.id,
          contractType: 'Mantenimiento',
          equipment: [{ modelLabel: 'iR ADV C5535i', serialNumber: 'SER-STOCK-001' }],
        }),
      });

      const canonBytes = await makeCanonStockSupportWorkbook();
      const canonResponse = await fetch(`${baseUrl}/api/operations/import-canon-discontinuation`, {
        method: 'POST',
        headers,
        body: JSON.stringify({
          sourceName: 'canon-stock-test.xlsx',
          contentBase64: Buffer.from(canonBytes).toString('base64'),
        }),
      });
      await resolveImportJob(baseUrl, canonResponse);

      const bytes = await makeWaldbottStockWorkbook();
      const payload = {
        sourceName: 'stock-waldbott.xlsx',
        contentBase64: Buffer.from(bytes).toString('base64'),
      };
      const importResponse = await fetch(`${baseUrl}/api/operations/import-waldbott-stock`, {
        method: 'POST',
        headers,
        body: JSON.stringify(payload),
      });
      expect(await resolveImportJob<Record<string, unknown>>(baseUrl, importResponse)).toMatchObject({
        duplicate: false,
        rows: 2,
        skippedRows: 2,
        items: 2,
        models: 1,
        quantity: 5,
      });

      const stockResponse = await fetch(`${baseUrl}/api/operations/waldbott-stock`);
      expect(await stockResponse.json()).toEqual([
        expect.objectContaining({
          modelLabel: 'Impresora Laser IR ADV C5535 (120V)',
          deposit: '04',
          quantity: 5,
          canonStatus: 'discontinued',
          canonModelLabel: 'iR ADV C5535i',
          installedCount: 1,
        }),
      ]);

      const duplicateResponse = await fetch(`${baseUrl}/api/operations/import-waldbott-stock`, {
        method: 'POST',
        headers,
        body: JSON.stringify(payload),
      });
      await expect(resolveImportJob(baseUrl, duplicateResponse)).resolves.toMatchObject({ duplicate: true, sourceName: 'stock-waldbott.xlsx' });

      const clearResponse = await fetch(`${baseUrl}/api/operations/exclusive-imports`, { method: 'DELETE' });
      expect(clearResponse.status).toBe(200);
      expect(await clearResponse.json()).toMatchObject({ ok: true, batches: 2, archivedFiles: 2 });

      const clearedModelsResponse = await fetch(`${baseUrl}/api/operations/model-discontinuation`);
      expect(await clearedModelsResponse.json()).toEqual([]);
      const clearedStockResponse = await fetch(`${baseUrl}/api/operations/waldbott-stock`);
      expect(await clearedStockResponse.json()).toEqual([]);
      const sharedCustomersResponse = await fetch(`${baseUrl}/api/operations/customers`);
      expect(await sharedCustomersResponse.json()).toHaveLength(1);
    } finally {
      await new Promise<void>((resolve) => server.close(() => resolve()));
      database.close();
    }
  });

  it('imports the legacy maintenance database and exposes equipment analysis', async () => {
    const dataDirectory = makeTemporaryDataDirectory();
    const { app, database } = createServer({ dataDirectory });
    const server = app.listen(0, '127.0.0.1');

    try {
      await new Promise<void>((resolve) => server.once('listening', () => resolve()));
      const address = server.address();
      const port = typeof address === 'object' && address ? address.port : 0;
      const baseUrl = `http://127.0.0.1:${port}`;
      const legacyDatabase = {
        models: [{ name: 'iR ADV C3325i', vidaUtil: 100000, optimoBase: 22000, mermaMax: 0.3 }],
        records: [
          {
            cliente: 'Cliente Histórico',
            ov: 'OV-HIST-001',
            equipo: 'iR ADV C3325i',
            nserie: 'SER-HIST-001',
            periodo: '2026-01',
            papel: 'Negro A4',
            copias: 20000,
            contador: 10000,
          },
          {
            cliente: 'Cliente Histórico',
            ov: 'OV-HIST-001',
            equipo: 'iR ADV C3325i',
            nserie: 'SER-HIST-001',
            periodo: '2026-02',
            papel: 'Negro A4',
            copias: 30000,
            contador: 20000,
          },
        ],
      };
      const content = JSON.stringify(legacyDatabase);
      const payload = {
        sourceName: 'database_sqlite.json',
        contentBase64: Buffer.from(content).toString('base64'),
        database: legacyDatabase,
      };

      const importResponse = await fetch(`${baseUrl}/api/maintenance/import-legacy`, {
        method: 'POST',
        headers: { 'content-type': 'application/json' },
        body: JSON.stringify(payload),
      });
      expect(importResponse.status).toBe(201);
      const imported = await importResponse.json();
      expect(imported).toMatchObject({
        duplicate: false,
        models: 1,
        records: 2,
        customers: 1,
        contracts: 1,
        equipment: 1,
        matchedRecords: 2,
        unmatchedRecords: 0,
      });

      const summaryResponse = await fetch(`${baseUrl}/api/maintenance/summary`);
      expect(await summaryResponse.json()).toMatchObject({
        sourceName: 'database_sqlite.json',
        models: 1,
        records: 2,
        analyzedEquipment: 1,
      });

      const analysisResponse = await fetch(`${baseUrl}/api/maintenance/analysis?months=2&query=SER-HIST-001`);
      expect(await analysisResponse.json()).toEqual([
        expect.objectContaining({
          serialNumber: 'SER-HIST-001',
          matchedModelLabel: 'iR ADV C3325i',
          averageCopies: 25000,
          status: 'CRÍTICO',
          periods: expect.arrayContaining([
            expect.objectContaining({ period: '2026-01' }),
            expect.objectContaining({ period: '2026-02' }),
          ]),
        }),
      ]);

      const duplicateResponse = await fetch(`${baseUrl}/api/maintenance/import-legacy`, {
        method: 'POST',
        headers: { 'content-type': 'application/json' },
        body: JSON.stringify(payload),
      });
      expect(duplicateResponse.status).toBe(200);
      expect(await duplicateResponse.json()).toMatchObject({ duplicate: true, batchId: imported.batchId });
      const metadataResponse = await fetch(`${baseUrl}/api/imports/${imported.batchId}`);
      const metadata = (await metadataResponse.json()) as { files: Array<{ id: string; fileName: string; storedPath: string }> };
      expect(metadata.files).toHaveLength(1);
      expect(fs.existsSync(path.join(dataDirectory, metadata.files[0].storedPath))).toBe(true);

      const originalResponse = await fetch(`${baseUrl}/api/imports/${imported.batchId}/files/${metadata.files[0].id}`);
      expect(originalResponse.status).toBe(200);
      expect(originalResponse.headers.get('content-disposition')).toContain('database_sqlite.json');
      expect(await originalResponse.text()).toBe(content);

      const countersCsv = [
        'Cliente;Nº O.V.;Equipo;Nº Serie;Año-Mes;Papel;Copias;Contador;División',
        'Cliente CSV;OV-CSV-001;iR ADV C3325i;SER-CSV-001;2026-08;Negro A4;1200;25000;MRA',
      ].join('\n');
      const counterImportResponse = await fetch(`${baseUrl}/api/maintenance/import-counters`, {
        method: 'POST',
        headers: { 'content-type': 'application/json' },
        body: JSON.stringify({
          sourceName: 'Contadores.csv',
          contentBase64: Buffer.from(countersCsv).toString('base64'),
        }),
      });
      expect(counterImportResponse.status).toBe(201);
      const counterImport = await counterImportResponse.json();
      expect(counterImport).toMatchObject({
        duplicate: false,
        sourceName: 'Contadores.csv',
        records: 1,
        skippedRows: 0,
        matchedRecords: 1,
      });

      const counterRawResponse = await fetch(`${baseUrl}/api/imports/${counterImport.batchId}/raw-rows`);
      expect(await counterRawResponse.json()).toMatchObject({
        sheets: [expect.objectContaining({ sheetName: 'CSV', rowCount: 2 })],
        rows: [
          expect.objectContaining({ rowNumber: 1, values: expect.arrayContaining(['Cliente']) }),
          expect.objectContaining({ rowNumber: 2, values: expect.arrayContaining(['Cliente CSV']) }),
        ],
      });

      const rulesResponse = await fetch(`${baseUrl}/api/maintenance/rules`);
      const rules = await rulesResponse.json();
      expect(rules).toEqual([expect.objectContaining({ modelLabel: 'iR ADV C3325i' })]);

      const clearResponse = await fetch(`${baseUrl}/api/maintenance/import`, { method: 'DELETE' });
      expect(clearResponse.status).toBe(200);
      expect(await clearResponse.json()).toEqual({ ok: true, batches: 2, archivedFiles: 2 });

      const clearedSummaryResponse = await fetch(`${baseUrl}/api/maintenance/summary`);
      expect(await clearedSummaryResponse.json()).toMatchObject({
        batchId: null,
        sourceName: null,
        records: 0,
        models: 0,
      });
      expect(fs.readdirSync(path.join(dataDirectory, 'imports', '.removed', imported.batchId))).toHaveLength(1);
      expect(fs.readdirSync(path.join(dataDirectory, 'imports', '.removed', counterImport.batchId))).toHaveLength(1);
      const sharedPortfolioResponse = await fetch(`${baseUrl}/api/operations/customers`);
      expect(await sharedPortfolioResponse.json()).toHaveLength(2);
    } finally {
      await new Promise<void>((resolve) => server.close(() => resolve()));
      database.close();
    }
  });

  it('imports the legacy MPS SQLite database into the shared API', async () => {
    const dataDirectory = makeTemporaryDataDirectory();
    const legacyDirectory = makeTemporaryDataDirectory();
    const legacy = new Database(path.join(legacyDirectory, 'canon_mps.db'));
    legacy.exec(`
      CREATE TABLE multifuncionales (
        id TEXT PRIMARY KEY,
        brand TEXT,
        model TEXT,
        speedPpm INTEGER,
        isColor INTEGER,
        recVolumeMin INTEGER,
        recVolumeMax INTEGER,
        isCustom INTEGER
      );
      CREATE TABLE consumibles (
        id TEXT PRIMARY KEY,
        modelId TEXT,
        name TEXT,
        type TEXT,
        yieldPages INTEGER,
        color TEXT,
        sku TEXT
      );
    `);
    legacy.prepare('INSERT INTO multifuncionales VALUES (?, ?, ?, ?, ?, ?, ?, ?)').run(
      'mps-model-1', 'Canon', 'imageRUNNER 1643i', 45, 0, 1500, 20000, 1,
    );
    legacy.prepare('INSERT INTO consumibles VALUES (?, ?, ?, ?, ?, ?, ?)').run(
      'mps-consumable-1', 'mps-model-1', 'Tóner Negro T06', 'toner', 20500, 'black', '3526C001AA',
    );
    const legacyBytes = legacy.serialize();
    legacy.close();

    const { app, database } = createServer({ dataDirectory });
    const server = app.listen(0, '127.0.0.1');

    try {
      await new Promise<void>((resolve) => server.once('listening', () => resolve()));
      const address = server.address();
      const port = typeof address === 'object' && address ? address.port : 0;
      const baseUrl = `http://127.0.0.1:${port}`;
      const importResponse = await fetch(`${baseUrl}/api/mps/import-legacy`, {
        method: 'POST',
        headers: { 'content-type': 'application/json' },
        body: JSON.stringify({
          sourceName: 'canon_mps.db',
          contentBase64: Buffer.from(legacyBytes).toString('base64'),
        }),
      });
      expect(importResponse.status).toBe(201);
      expect(await importResponse.json()).toMatchObject({
        duplicate: false,
        models: 1,
        consumables: 1,
        linkedEquipmentModels: 1,
      });

      const modelsResponse = await fetch(`${baseUrl}/api/mps/models?query=1643`);
      expect(await modelsResponse.json()).toEqual([
        expect.objectContaining({
          modelLabel: 'imageRUNNER 1643i',
          consumables: [expect.objectContaining({ sku: '3526C001AA', yieldPages: 20500 })],
        }),
      ]);
    } finally {
      await new Promise<void>((resolve) => server.close(() => resolve()));
      database.close();
    }
  });

  it('exposes manual MPS profile CRUD without modifying imported profiles', async () => {
    const dataDirectory = makeTemporaryDataDirectory();
    const legacyDirectory = makeTemporaryDataDirectory();
    const legacy = new Database(path.join(legacyDirectory, 'canon_mps.db'));
    legacy.exec(`
      CREATE TABLE multifuncionales (
        id TEXT PRIMARY KEY,
        brand TEXT,
        model TEXT,
        speedPpm INTEGER,
        isColor INTEGER,
        recVolumeMin INTEGER,
        recVolumeMax INTEGER,
        isCustom INTEGER
      );
      CREATE TABLE consumibles (
        id TEXT PRIMARY KEY,
        modelId TEXT,
        name TEXT,
        type TEXT,
        yieldPages INTEGER,
        color TEXT,
        sku TEXT
      );
    `);
    legacy.prepare('INSERT INTO multifuncionales VALUES (?, ?, ?, ?, ?, ?, ?, ?)').run(
      'mps-model-crud', 'Canon', 'imageRUNNER 1643i', 45, 0, 1500, 20000, 1,
    );
    legacy.prepare('INSERT INTO consumibles VALUES (?, ?, ?, ?, ?, ?, ?)').run(
      'mps-consumable-crud', 'mps-model-crud', 'Tóner T06', 'toner', 20500, 'black', '3526C001AA',
    );
    const legacyBytes = legacy.serialize();
    legacy.close();

    const { app, database } = createServer({ dataDirectory });
    const server = app.listen(0, '127.0.0.1');

    try {
      await new Promise<void>((resolve) => server.once('listening', () => resolve()));
      const address = server.address();
      const port = typeof address === 'object' && address ? address.port : 0;
      const baseUrl = `http://127.0.0.1:${port}`;
      const headers = { 'content-type': 'application/json' };
      const importResponse = await fetch(`${baseUrl}/api/mps/import-legacy`, {
        method: 'POST',
        headers,
        body: JSON.stringify({ sourceName: 'canon_mps.db', contentBase64: Buffer.from(legacyBytes).toString('base64') }),
      });
      expect(importResponse.status).toBe(201);

      const importedModelsResponse = await fetch(`${baseUrl}/api/mps/models`);
      const importedModels = await importedModelsResponse.json() as Array<{ id: string }>;
      expect(importedModels).toHaveLength(1);

      const createResponse = await fetch(`${baseUrl}/api/mps/models`, {
        method: 'POST',
        headers,
        body: JSON.stringify({
          brand: 'Canon', model: 'imageRUNNER C5535i', speedPpm: 35, isColor: true,
          recVolumeMin: 2000, recVolumeMax: 30000,
          consumables: [{ name: 'Tóner negro', type: 'toner', yieldPages: 18000, color: 'black', sku: '5535-BLK' }],
        }),
      });
      expect(createResponse.status).toBe(201);
      const created = await createResponse.json() as { id: string; modelLabel: string; consumables: Array<{ name: string }> };
      expect(created).toMatchObject({ modelLabel: 'imageRUNNER C5535i', consumables: [expect.objectContaining({ name: 'Tóner negro' })] });

      const updateResponse = await fetch(`${baseUrl}/api/mps/models/${created.id}`, {
        method: 'PUT',
        headers,
        body: JSON.stringify({
          brand: 'Canon', model: 'imageRUNNER C5535i', speedPpm: 40, isColor: true,
          recVolumeMin: 2500, recVolumeMax: 35000,
          consumables: [
            { name: 'Tóner negro', type: 'toner', yieldPages: 20000, color: 'black', sku: '5535-BLK-2' },
            { name: 'Tambor', type: 'drum', yieldPages: 100000, color: 'other', sku: '5535-DRM' },
          ],
        }),
      });
      expect(updateResponse.status).toBe(200);
      expect(await updateResponse.json()).toMatchObject({ speedPpm: 40, recVolumeMin: 2500, consumables: expect.arrayContaining([expect.objectContaining({ sku: '5535-DRM' })]) });

      const importedDeleteResponse = await fetch(`${baseUrl}/api/mps/models/${importedModels[0].id}`, { method: 'DELETE' });
      expect(importedDeleteResponse.status).toBe(409);
      expect(await importedDeleteResponse.json()).toMatchObject({ error: expect.stringContaining('permanece intacto') });

      const cloneResponse = await fetch(`${baseUrl}/api/mps/models`, {
        method: 'POST',
        headers,
        body: JSON.stringify({
          brand: 'Canon', model: 'imageRUNNER C5535i Plus', speedPpm: 40, isColor: true,
          recVolumeMin: 2500, recVolumeMax: 35000,
          consumables: [{ name: 'Tóner negro', type: 'toner', yieldPages: 20000, color: 'black', sku: '5535-BLK-2' }],
        }),
      });
      expect(cloneResponse.status).toBe(201);
      const clone = await cloneResponse.json() as { id: string };
      const deleteResponse = await fetch(`${baseUrl}/api/mps/models/${clone.id}`, { method: 'DELETE' });
      expect(deleteResponse.status).toBe(200);
      expect(await deleteResponse.json()).toEqual({ deleted: true });

      const finalModelsResponse = await fetch(`${baseUrl}/api/mps/models`);
      const finalModels = await finalModelsResponse.json() as Array<{ modelLabel: string; isEditable: boolean }>;
      expect(finalModels).toEqual([
        expect.objectContaining({ modelLabel: 'imageRUNNER 1643i', isEditable: false }),
        expect.objectContaining({ modelLabel: 'imageRUNNER C5535i', isEditable: true }),
      ]);
    } finally {
      await new Promise<void>((resolve) => server.close(() => resolve()));
      database.close();
    }
  });

  it('imports consumables XLSX rows through the shared installed base', async () => {
    const dataDirectory = makeTemporaryDataDirectory();
    const { app, database } = createServer({ dataDirectory });
    const server = app.listen(0, '127.0.0.1');

    try {
      await new Promise<void>((resolve) => server.once('listening', () => resolve()));
      const address = server.address();
      const port = typeof address === 'object' && address ? address.port : 0;
      const baseUrl = `http://127.0.0.1:${port}`;
      const headers = { 'content-type': 'application/json' };

      const customerResponse = await fetch(`${baseUrl}/api/operations/customers`, {
        method: 'POST',
        headers,
        body: JSON.stringify({ name: 'Cliente Consumo API' }),
      });
      const customer = (await customerResponse.json()) as { id: string };
      await fetch(`${baseUrl}/api/operations/contracts`, {
        method: 'POST',
        headers,
        body: JSON.stringify({
          customerId: customer.id,
          reference: 'OV-CONS-API',
          contractType: 'Mantenimiento',
          equipment: [{ modelLabel: 'iR ADV C3325i', serialNumber: 'SER-CONS-API' }],
        }),
      });

      const consumablesBytes = await makeConsumablesWorkbook([
        ['line-1', 'OV-CONS-API', new Date('2026-08-01T12:00:00Z'), 'iR ADV C3325i', 'SER-CONS-API', 'CRG-T03', 'Tóner compatible', 2, 120],
      ]);
      const firstImportResponse = await fetch(`${baseUrl}/api/consumables/import-xlsx`, {
        method: 'POST',
        headers,
        body: JSON.stringify({
          sourceName: 'Detalles de consumibles.xlsx',
          sourceType: 'consumibles',
          contentBase64: Buffer.from(consumablesBytes).toString('base64'),
        }),
      });
      expect(firstImportResponse.status).toBe(201);
      expect(await firstImportResponse.json()).toMatchObject({
        duplicate: false,
        accepted: 1,
        consumables: 1,
        parts: 0,
        skippedNoEquipment: 0,
      });

      const partsBytes = await makeConsumablesWorkbook([
        ['line-2', 'OV-CONS-API', new Date('2026-09-01T12:00:00Z'), 'iR ADV C3325i', 'SER-CONS-API', 'ROLLER-1', 'KIT DE RODILLO', 1, 40],
        ['line-3', 'OV-CONS-API', new Date('2026-09-02T12:00:00Z'), 'iR ADV C3325i', 'SER-CONS-API', 'MOTOR-1', 'MOTOR PRINCIPAL', 1, 80],
      ]);
      const secondImportResponse = await fetch(`${baseUrl}/api/consumables/import-xlsx`, {
        method: 'POST',
        headers,
        body: JSON.stringify({
          sourceName: 'Detalles de repuestos.xlsx',
          sourceType: 'repuestos',
          contentBase64: Buffer.from(partsBytes).toString('base64'),
        }),
      });
      expect(secondImportResponse.status).toBe(201);
      expect(await secondImportResponse.json()).toMatchObject({
        duplicate: false,
        accepted: 2,
        consumables: 1,
        parts: 1,
      });

      const useRepuestosRow = new Array(24).fill(undefined) as unknown[];
      useRepuestosRow[5] = 'Cliente Consumo API';
      useRepuestosRow[8] = 'OV-CONS-API';
      useRepuestosRow[9] = 'Mantenimiento';
      useRepuestosRow[13] = 'iR ADV C3325i';
      useRepuestosRow[14] = '2026-10';
      useRepuestosRow[15] = 'SER-CONS-API';
      useRepuestosRow[17] = '2725C002AA';
      useRepuestosRow[20] = 'TONER NEGRO';
      useRepuestosRow[21] = 2;
      useRepuestosRow[22] = 30000;
      useRepuestosRow[23] = 60000;
      const useRepuestosResponse = await fetch(`${baseUrl}/api/consumables/import-xlsx`, {
        method: 'POST',
        headers,
        body: JSON.stringify({
          sourceName: 'Detalles de uso de repuestos.xlsx',
          sourceType: 'uso-repuestos',
          contentBase64: Buffer.from(await makeUseRepuestosWorkbook([useRepuestosRow])).toString('base64'),
        }),
      });
      expect(useRepuestosResponse.status).toBe(201);
      expect(await useRepuestosResponse.json()).toMatchObject({
        duplicate: false,
        accepted: 1,
        consumables: 1,
        parts: 0,
      });

      const salidaConsumiblesRow = new Array(12).fill(undefined) as unknown[];
      salidaConsumiblesRow[0] = 7001;
      salidaConsumiblesRow[1] = new Date('2026-11-01T12:00:00Z');
      salidaConsumiblesRow[2] = 'CRG-T03';
      salidaConsumiblesRow[3] = 'TONER NEGRO T03';
      salidaConsumiblesRow[4] = 1;
      salidaConsumiblesRow[6] = 12000;
      salidaConsumiblesRow[7] = 'SER-CONS-API';
      salidaConsumiblesRow[8] = 'iR ADV C3325i';
      salidaConsumiblesRow[11] = 'Cliente Consumo API';
      const salidaConsumiblesResponse = await fetch(`${baseUrl}/api/consumables/import-xlsx`, {
        method: 'POST',
        headers,
        body: JSON.stringify({
          sourceName: 'Salida de Consumibles.xlsx',
          sourceType: 'salida-consumibles',
          contentBase64: Buffer.from(await makeOutputWorkbook(12, [salidaConsumiblesRow])).toString('base64'),
        }),
      });
      expect(salidaConsumiblesResponse.status).toBe(201);
      expect(await salidaConsumiblesResponse.json()).toMatchObject({
        duplicate: false,
        accepted: 1,
        consumables: 1,
        parts: 0,
      });

      const salidaRepuestosConsumible = new Array(13).fill(undefined) as unknown[];
      salidaRepuestosConsumible[0] = 7002;
      salidaRepuestosConsumible[1] = new Date('2026-11-02T12:00:00Z');
      salidaRepuestosConsumible[2] = 'RP-ROLLER';
      salidaRepuestosConsumible[3] = 'CILINDRO DE IMAGEN';
      salidaRepuestosConsumible[4] = 1;
      salidaRepuestosConsumible[7] = 'Cliente Consumo API';
      salidaRepuestosConsumible[8] = 'iR ADV C3325i';
      salidaRepuestosConsumible[9] = 'SER-CONS-API';
      salidaRepuestosConsumible[10] = 'Tec API';
      salidaRepuestosConsumible[12] = 8801;
      const salidaRepuestosPart = new Array(13).fill(undefined) as unknown[];
      salidaRepuestosPart[0] = 7003;
      salidaRepuestosPart[1] = new Date('2026-11-03T12:00:00Z');
      salidaRepuestosPart[2] = 'RP-FUSER';
      salidaRepuestosPart[3] = 'FUSOR COMPLETO';
      salidaRepuestosPart[4] = 1;
      salidaRepuestosPart[7] = 'Cliente Consumo API';
      salidaRepuestosPart[8] = 'iR ADV C3325i';
      salidaRepuestosPart[9] = 'SER-CONS-API';
      salidaRepuestosPart[10] = 'Tec API';
      salidaRepuestosPart[12] = 8802;
      const salidaRepuestosResponse = await fetch(`${baseUrl}/api/consumables/import-xlsx`, {
        method: 'POST',
        headers,
        body: JSON.stringify({
          sourceName: 'Salida de Repuestos.xlsx',
          sourceType: 'salida-repuestos',
          contentBase64: Buffer.from(await makeOutputWorkbook(13, [salidaRepuestosConsumible, salidaRepuestosPart])).toString('base64'),
        }),
      });
      expect(salidaRepuestosResponse.status).toBe(201);
      expect(await salidaRepuestosResponse.json()).toMatchObject({
        duplicate: false,
        accepted: 2,
        consumables: 1,
        parts: 1,
      });

      const outputsSummaryResponse = await fetch(`${baseUrl}/api/consumables/outputs/summary`);
      expect(await outputsSummaryResponse.json()).toMatchObject({
        sourceFiles: 2,
        records: 3,
        consumables: 2,
        parts: 1,
        equipment: 1,
        totalQuantity: 3,
        firstMonth: '2026-11',
        lastMonth: '2026-11',
      });
      const outputsResponse = await fetch(`${baseUrl}/api/consumables/outputs?query=SER-CONS-API&limit=10`);
      expect(await outputsResponse.json()).toEqual(expect.arrayContaining([
        expect.objectContaining({ documentNumber: 7001, recordKind: 'consumable', yieldPages: 12000 }),
        expect.objectContaining({ documentNumber: 7002, recordKind: 'consumable', serviceReportNumber: 8801 }),
        expect.objectContaining({ documentNumber: 7003, recordKind: 'part', serviceReportNumber: 8802 }),
      ]));

      const summaryResponse = await fetch(`${baseUrl}/api/consumables/summary`);
      expect(await summaryResponse.json()).toMatchObject({
        sourceFiles: 3,
        records: 4,
        consumables: 3,
        parts: 1,
        equipment: 1,
        totalCostUsd: 250.05,
      });

      const analyticsResponse = await fetch(`${baseUrl}/api/consumables/analytics`);
      expect(analyticsResponse.status).toBe(200);
      const analytics = await analyticsResponse.json() as {
        monthly: Array<Record<string, unknown>>;
        families: Array<Record<string, unknown>>;
        categories: Array<Record<string, unknown>>;
        topEquipment: Array<Record<string, unknown>>;
        contracts: Array<Record<string, unknown>>;
        dispatchEquipment: Array<Record<string, unknown>>;
      };
      expect(analytics.monthly).toEqual([
        expect.objectContaining({ key: '2026-08', records: 1, quantity: 2, costUsd: 120 }),
        expect.objectContaining({ key: '2026-09', records: 2, quantity: 2, costUsd: 120 }),
        expect.objectContaining({ key: '2026-10', records: 1, quantity: 2, costUsd: Math.round(60000 * PYG_TO_USD * 100) / 100 }),
      ]);
      expect(analytics.families).toEqual([
        expect.objectContaining({ key: 'GPR53', records: 3, quantity: 4, costUsd: 130.05, equipment: 1 }),
        expect.objectContaining({ key: 'T03', records: 1, quantity: 2, costUsd: 120, equipment: 1 }),
      ]);
      expect(analytics.categories).toEqual([
        expect.objectContaining({ key: 'toner', records: 3, quantity: 5, costUsd: 210.05 }),
        expect.objectContaining({ key: 'rodillo', records: 1, quantity: 1, costUsd: 40 }),
      ]);
      expect(analytics.topEquipment).toEqual([
        expect.objectContaining({
          customerName: 'Cliente Consumo API',
          modelLabel: 'iR ADV C3325i',
          serialNumber: 'SER-CONS-API',
          records: 4,
          costUsd: 250.05,
        }),
      ]);
      expect(analytics.contracts).toEqual([
        expect.objectContaining({
          reference: 'OV-CONS-API',
          customerName: 'Cliente Consumo API',
          records: 4,
          quantity: 6,
          costUsd: 250.05,
          consumableCostUsd: 170.05,
          partCostUsd: 80,
          consumableRecords: 3,
          partRecords: 1,
          originalRecords: 1,
          compatibleRecords: 3,
          equipment: 1,
        }),
      ]);
      expect(analytics.dispatchEquipment).toEqual([
        expect.objectContaining({
          customerName: 'Cliente Consumo API',
          modelLabel: 'iR ADV C3325i',
          serialNumber: 'SER-CONS-API',
          contractReference: 'OV-CONS-API',
          records: 3,
          consumableRecords: 2,
          partRecords: 1,
          consumableQuantity: 2,
          partQuantity: 1,
          compatibleRecords: 3,
          lastRecordedAt: '2026-11-03',
        }),
      ]);

      const recordsResponse = await fetch(`${baseUrl}/api/consumables/records?query=SER-CONS-API&limit=10`);
      const records = await recordsResponse.json();
      expect(records).toHaveLength(4);
      expect(records).toEqual(expect.arrayContaining([
        expect.objectContaining({ partCode: 'ROLLER-1', recordKind: 'consumable', family: 'GPR53' }),
        expect.objectContaining({ partCode: 'MOTOR-1', recordKind: 'part', family: 'GPR53' }),
      ]));

      const duplicateResponse = await fetch(`${baseUrl}/api/consumables/import-xlsx`, {
        method: 'POST',
        headers,
        body: JSON.stringify({
          sourceName: 'Detalles de consumibles.xlsx',
          sourceType: 'consumibles',
          contentBase64: Buffer.from(consumablesBytes).toString('base64'),
        }),
      });
      expect(duplicateResponse.status).toBe(200);
      expect(await duplicateResponse.json()).toMatchObject({ duplicate: true });
    } finally {
      await new Promise<void>((resolve) => server.close(() => resolve()));
      database.close();
    }
  });

  it('replaces all applied batches for one Consumibles source when requested', async () => {
    const dataDirectory = makeTemporaryDataDirectory();
    const { app, database } = createServer({ dataDirectory });
    const server = app.listen(0, '127.0.0.1');

    try {
      await new Promise<void>((resolve) => server.once('listening', () => resolve()));
      const address = server.address();
      const port = typeof address === 'object' && address ? address.port : 0;
      const baseUrl = `http://127.0.0.1:${port}`;
      const headers = { 'content-type': 'application/json' };
      const customerResponse = await fetch(`${baseUrl}/api/operations/customers`, {
        method: 'POST',
        headers,
        body: JSON.stringify({ name: 'Cliente Reemplazo API' }),
      });
      const customer = (await customerResponse.json()) as { id: string };
      await fetch(`${baseUrl}/api/operations/contracts`, {
        method: 'POST',
        headers,
        body: JSON.stringify({
          customerId: customer.id,
          reference: 'OV-REPLACE-API',
          contractType: 'Mantenimiento',
          equipment: [{ modelLabel: 'iR ADV C3325i', serialNumber: 'SER-REPLACE-API' }],
        }),
      });

      const importSource = async (sourceName: string, date: string, partCode: string, replaceCurrent = false) => {
        const bytes = await makeConsumablesWorkbook([
          ['line', 'OV-REPLACE-API', new Date(`${date}T12:00:00Z`), 'iR ADV C3325i', 'SER-REPLACE-API', partCode, 'Tóner compatible T03', 1, 50],
        ]);
        return fetch(`${baseUrl}/api/consumables/import-xlsx`, {
          method: 'POST',
          headers,
          body: JSON.stringify({
            sourceName,
            sourceType: 'consumibles',
            contentBase64: Buffer.from(bytes).toString('base64'),
            replaceCurrent,
          }),
        });
      };

      const firstResponse = await importSource('consumos-v1.xlsx', '2026-08-01', 'CRG-T03-V1');
      expect(firstResponse.status).toBe(201);
      await firstResponse.arrayBuffer();
      const secondResponse = await importSource('consumos-v2.xlsx', '2026-08-02', 'CRG-T03-V2');
      expect(secondResponse.status).toBe(201);
      await secondResponse.arrayBuffer();
      const replacementResponse = await importSource('consumos-nuevo.xlsx', '2026-09-01', 'CRG-T03-NUEVO', true);
      expect(replacementResponse.status).toBe(201);
      expect(await replacementResponse.json()).toMatchObject({ replaced: true, accepted: 1 });
      expect(database.prepare("SELECT COUNT(*) AS count FROM import_batches WHERE domain = 'consumibles' AND source_type = 'consumibles' AND status = 'applied'").get()).toEqual({ count: 1 });

      const recordsResponse = await fetch(`${baseUrl}/api/consumables/records?limit=10`);
      expect(await recordsResponse.json()).toEqual([
        expect.objectContaining({ partCode: 'CRG-T03-NUEVO', recordedAt: '2026-09-01' }),
      ]);
      const archivedDirectory = path.join(dataDirectory, 'imports', '.removed');
      expect(fs.readdirSync(archivedDirectory, { recursive: true }).filter((entry) => String(entry).endsWith('.xlsx'))).toHaveLength(2);
    } finally {
      await new Promise<void>((resolve) => server.close(() => resolve()));
      database.close();
    }
  });

  it('imports and searches service interventions through the shared installed base', async () => {
    const dataDirectory = makeTemporaryDataDirectory();
    const { app, database } = createServer({ dataDirectory });
    const server = app.listen(0, '127.0.0.1');

    try {
      await new Promise<void>((resolve) => server.once('listening', () => resolve()));
      const address = server.address();
      const port = typeof address === 'object' && address ? address.port : 0;
      const baseUrl = `http://127.0.0.1:${port}`;
      const headers = { 'content-type': 'application/json' };

      const customerResponse = await fetch(`${baseUrl}/api/operations/customers`, {
        method: 'POST',
        headers,
        body: JSON.stringify({ name: 'Cliente Servicios API' }),
      });
      const customer = (await customerResponse.json()) as { id: string };
      const contractResponse = await fetch(`${baseUrl}/api/operations/contracts`, {
        method: 'POST',
        headers,
        body: JSON.stringify({
          customerId: customer.id,
          reference: 'OV-SERVICE-API',
          contractType: 'Mantenimiento',
          equipment: [{ modelLabel: 'iR ADV C3325i', serialNumber: 'SER-SERVICE-API' }],
        }),
      });
      expect(contractResponse.status).toBe(201);

      const serviceHeaders = Array.from({ length: 31 }, (_, index) => `unused-${index}`);
      serviceHeaders[1] = 'Nº I.S.';
      serviceHeaders[4] = 'Cliente';
      serviceHeaders[5] = 'Fecha';
      serviceHeaders[6] = 'Nº OV';
      serviceHeaders[7] = 'Nº Serie';
      serviceHeaders[8] = 'Equipo';
      serviceHeaders[16] = 'Tipo Servicio';
      serviceHeaders[18] = 'Fch/Hora Inicio';
      serviceHeaders[20] = 'Tipo Contrato';
      serviceHeaders[21] = 'Tipo Tarea';
      serviceHeaders[25] = 'Técnico';
      serviceHeaders[29] = 'Tarea realizada';
      serviceHeaders[30] = 'Repuestos utilizados';
      const serviceRow = Array.from({ length: 31 }, () => undefined) as unknown[];
      serviceRow[1] = 9003;
      serviceRow[4] = 'Cliente LAM';
      serviceRow[5] = new Date('2026-06-02T12:00:00Z');
      serviceRow[6] = 'OV-SERVICE-API';
      serviceRow[7] = 'SER-SERVICE-API';
      serviceRow[8] = 'iR ADV C3325i';
      serviceRow[16] = 'En Sitio';
      serviceRow[18] = new Date('2026-06-01T12:00:00Z');
      serviceRow[20] = 'Alquiler';
      serviceRow[21] = 'Reparación';
      serviceRow[25] = 'Tec API';
      serviceRow[29] = 'Se reemplazó el fusor';
      serviceRow[30] = 'Fusor';
      const serviceBytes = await makeServicesWorkbook(serviceHeaders, [serviceRow]);

      const importResponse = await fetch(`${baseUrl}/api/services/import-xlsx`, {
        method: 'POST',
        headers,
        body: JSON.stringify({
          sourceName: 'Servicios LAM.xlsx',
          sourceType: 'servicios',
          contentBase64: Buffer.from(serviceBytes).toString('base64'),
        }),
      });
      expect(importResponse.status).toBe(201);
      expect(await importResponse.json()).toMatchObject({
        duplicate: false,
        sourceType: 'servicios',
        accepted: 1,
        duplicates: 0,
        skippedNoEquipment: 0,
        skippedContract: 0,
      });

      const summaryResponse = await fetch(`${baseUrl}/api/services/summary`);
      expect(await summaryResponse.json()).toEqual({
        sourceFiles: 1,
        records: 1,
        equipment: 1,
        firstMonth: '2026-06',
        lastMonth: '2026-06',
        taskTypes: [{ key: 'Reparación', records: 1 }],
      });

      const recordsResponse = await fetch(`${baseUrl}/api/services/records?query=SER-SERVICE-API&limit=10`);
      expect(await recordsResponse.json()).toEqual([
        expect.objectContaining({
          serviceNumber: 9003,
          orderReference: 'OV-SERVICE-API',
          recordedAt: '2026-06-01',
          customerName: 'Cliente Servicios API',
          contractReference: 'OV-SERVICE-API',
          serialNumber: 'SER-SERVICE-API',
          taskType: 'Reparación',
          technician: 'Tec API',
        }),
      ]);

      const duplicateResponse = await fetch(`${baseUrl}/api/services/import-xlsx`, {
        method: 'POST',
        headers,
        body: JSON.stringify({
          sourceName: 'Servicios LAM.xlsx',
          sourceType: 'servicios',
          contentBase64: Buffer.from(serviceBytes).toString('base64'),
        }),
      });
      expect(duplicateResponse.status).toBe(200);
      expect(await duplicateResponse.json()).toMatchObject({ duplicate: true });
    } finally {
      await new Promise<void>((resolve) => server.close(() => resolve()));
      database.close();
    }
  });

  it('imports and manages travel records through the shared local database', async () => {
    const dataDirectory = makeTemporaryDataDirectory();
    const { app, database } = createServer({ dataDirectory });
    const server = app.listen(0, '127.0.0.1');

    try {
      await new Promise<void>((resolve) => server.once('listening', () => resolve()));
      const address = server.address();
      const port = typeof address === 'object' && address ? address.port : 0;
      const baseUrl = `http://127.0.0.1:${port}`;
      const headers = { 'content-type': 'application/json' };
      const travelBytes = await makeTravelWorkbook();
      const encodedTravel = Buffer.from(travelBytes).toString('base64');

      const previewResponse = await fetch(`${baseUrl}/api/travel/import-preview`, {
        method: 'POST',
        headers,
        body: JSON.stringify({
          sourceName: 'CONTROL DE VIATICO 2026.xlsx',
          sourceType: 'viaticos',
          contentBase64: encodedTravel,
        }),
      });
      expect(previewResponse.status).toBe(200);
      expect(await previewResponse.json()).toMatchObject({
        duplicate: false,
        sourceType: 'viaticos',
        primarySheetName: 'VIAJES2026',
        sourceSheetNames: ['VIAJES2026', 'CALCULO AUX', 'PASAJES EN BUS'],
        sourceYear: 2026,
        incomingYears: [2026],
        trips: 1,
        historicalSnapshots: 4,
        busFares: 1,
        tollRoutes: 1,
      });

      const importResponse = await fetch(`${baseUrl}/api/travel/import-xlsx`, {
        method: 'POST',
        headers,
        body: JSON.stringify({
          sourceName: 'CONTROL DE VIATICO 2026.xlsx',
          sourceType: 'viaticos',
          contentBase64: encodedTravel,
        }),
      });
      expect(importResponse.status).toBe(201);
      const imported = await importResponse.json() as { batchId: string } & Record<string, unknown>;
      expect(imported).toMatchObject({
        duplicate: false,
        sourceType: 'viaticos',
        accepted: 1,
        duplicates: 0,
        historicalSnapshots: 4,
        sourceSheets: 3,
      });

      const summaryResponse = await fetch(`${baseUrl}/api/travel/summary`);
      expect(await summaryResponse.json()).toMatchObject({
        operationalYear: 2026,
        sourceName: 'CONTROL DE VIATICO 2026.xlsx',
        records: 1,
        totalCost: 506000,
        pending: 0,
        review: 0,
        approved: 1,
        monthlyTotals: [0, 0, 0, 0, 0, 0, 0, 506000, 0, 0, 0, 0],
        transportTotals: [{ key: 'MOVIL PROPIO', records: 1, totalCost: 506000 }],
        topDestinations: [{ destination: 'CDE', records: 1, totalCost: 506000 }],
      });

      const tripsResponse = await fetch(`${baseUrl}/api/travel/trips?query=cliente%20viajes%20api&limit=10`);
      expect(await tripsResponse.json()).toEqual([
        expect.objectContaining({
          customerName: 'Cliente Viajes API',
          destination: 'CDE',
          totalCost: 506000,
          status: 'approved',
          source: 'xlsx',
        }),
      ]);

      const catalogResponse = await fetch(`${baseUrl}/api/travel/cost-catalog`);
      expect(await catalogResponse.json()).toMatchObject({ dailyAllowance: 150000, hotelPerNight: 210000 });

      const estimateResponse = await fetch(`${baseUrl}/api/travel/cost-estimate?destination=CDE&transport=MOVIL%20PROPIO&days=2&nights=1`);
      expect(await estimateResponse.json()).toMatchObject({ dailyAllowance: 300000, lodging: 210000, tolls: 30000 });

      const importedTripsResponse = await fetch(`${baseUrl}/api/travel/trips?limit=10`);
      const importedTrips = await importedTripsResponse.json() as Array<{ id: string }>;
      const importedTripId = importedTrips[0]?.id;
      expect(importedTripId).toBeTruthy();
      const reviewResponse = await fetch(`${baseUrl}/api/travel/trips/${importedTripId}/status`, {
        method: 'PATCH',
        headers,
        body: JSON.stringify({ status: 'review' }),
      });
      expect(reviewResponse.status).toBe(200);

      const replacementBytes = await makeTravelWorkbook('Luque');
      const replacementEncoded = Buffer.from(replacementBytes).toString('base64');
      const replacementPreviewResponse = await fetch(`${baseUrl}/api/travel/import-preview`, {
        method: 'POST',
        headers,
        body: JSON.stringify({
          sourceName: 'CONTROL DE VIATICO 2026 corregido.xlsx',
          sourceType: 'viaticos',
          contentBase64: replacementEncoded,
        }),
      });
      expect(await replacementPreviewResponse.json()).toMatchObject({
        duplicate: false,
        currentSourceBatchId: imported.batchId,
        currentSourceName: 'CONTROL DE VIATICO 2026.xlsx',
      });

      const replacementResponse = await fetch(`${baseUrl}/api/travel/import-xlsx`, {
        method: 'POST',
        headers,
        body: JSON.stringify({
          sourceName: 'CONTROL DE VIATICO 2026 corregido.xlsx',
          sourceType: 'viaticos',
          contentBase64: replacementEncoded,
          replaceBatchId: imported.batchId,
        }),
      });
      expect(replacementResponse.status).toBe(201);
      expect(await replacementResponse.json()).toMatchObject({ duplicate: false, replaced: true, accepted: 1 });
      const replacedTripsResponse = await fetch(`${baseUrl}/api/travel/trips?query=cliente%20viajes%20api&limit=10`);
      expect(await replacedTripsResponse.json()).toEqual([
        expect.objectContaining({ destination: 'Luque', status: 'review', source: 'xlsx' }),
      ]);

      const manualInput = {
        recordedAt: '2026-09-10',
        serviceNumber: 'IS-MANUAL',
        customerName: 'Cliente Manual API',
        destination: 'Encarnación',
        transport: 'BUS',
        technician: 'Tec Dos',
        driver: 'C/CHOFER',
        advance: 0,
        allowance: 100000,
        lodging: 0,
        tolls: 0,
        otherCost: 120000,
        vehiclePayment: 0,
        technicianPayment: 0,
        distanceKm: 0,
        fuelCost: 0,
        notes: 'Comprobante pendiente',
      };
      const manualResponse = await fetch(`${baseUrl}/api/travel/trips`, {
        method: 'POST',
        headers,
        body: JSON.stringify(manualInput),
      });
      expect(manualResponse.status).toBe(201);
      const manual = (await manualResponse.json()) as { id: string; status: string; totalCost: number };
      expect(manual).toMatchObject({ status: 'pending', totalCost: 220000 });

      const updateResponse = await fetch(`${baseUrl}/api/travel/trips/${manual.id}`, {
        method: 'PUT',
        headers,
        body: JSON.stringify({ ...manualInput, destination: 'Luque', allowance: 110000 }),
      });
      expect(updateResponse.status).toBe(200);
      expect(await updateResponse.json()).toMatchObject({ id: manual.id, destination: 'Luque', totalCost: 230000, status: 'pending' });

      const statusResponse = await fetch(`${baseUrl}/api/travel/trips/${manual.id}/status`, {
        method: 'PATCH',
        headers,
        body: JSON.stringify({ status: 'review' }),
      });
      expect(statusResponse.status).toBe(200);
      expect(await statusResponse.json()).toMatchObject({ id: manual.id, status: 'review' });

      const deleteResponse = await fetch(`${baseUrl}/api/travel/trips/${manual.id}`, { method: 'DELETE' });
      expect(deleteResponse.status).toBe(200);
      expect(await deleteResponse.json()).toEqual({ deleted: true });
      const deletedTripsResponse = await fetch(`${baseUrl}/api/travel/trips?query=cliente%20manual%20api&limit=10`);
      expect(await deletedTripsResponse.json()).toEqual([]);

      const historicalResponse = await fetch(`${baseUrl}/api/travel/historical`);
      expect(await historicalResponse.json()).toEqual(expect.arrayContaining([
        expect.objectContaining({ year: 2026, partial: true, services: 3, trips: 1 }),
      ]));

      const duplicateResponse = await fetch(`${baseUrl}/api/travel/import-xlsx`, {
        method: 'POST',
        headers,
        body: JSON.stringify({
          sourceName: 'CONTROL DE VIATICO 2026 corregido.xlsx',
          sourceType: 'viaticos',
          contentBase64: replacementEncoded,
        }),
      });
      expect(duplicateResponse.status).toBe(200);
      expect(await duplicateResponse.json()).toMatchObject({ duplicate: true, sourceType: 'viaticos' });
    } finally {
      await new Promise<void>((resolve) => server.close(() => resolve()));
      database.close();
    }
  });

  it('calculates uniFLOW licenses and persists its editable price catalog', async () => {
    const { app, database } = createServer({ dataDirectory: makeTemporaryDataDirectory() });
    const server = app.listen(0, '127.0.0.1');

    try {
      await new Promise<void>((resolve) => server.once('listening', () => resolve()));
      const address = server.address();
      const port = typeof address === 'object' && address ? address.port : 0;
      const baseUrl = `http://127.0.0.1:${port}`;
      const headers = { 'content-type': 'application/json' };

      const modelsResponse = await fetch(`${baseUrl}/api/uniflow/models`);
      expect(modelsResponse.status).toBe(200);
      expect(await modelsResponse.json()).toHaveLength(20);

      const catalogResponse = await fetch(`${baseUrl}/api/uniflow/catalog`);
      const catalog = await catalogResponse.json() as {
        version: number;
        source: string;
        lastModified: string;
        lists: Record<string, Array<{ minQty: number; maxQty: number | null; label: string; sku: string; price: number }>>;
      };
      expect(catalog.lists.t1[0]).toEqual(expect.objectContaining({ label: '1-9', sku: '3575B792AA', price: 44.37 }));

      const configurationResponse = await fetch(`${baseUrl}/api/uniflow/configure`, {
        method: 'POST',
        headers,
        body: JSON.stringify({
          months: 24,
          devices: [
            { id: 'one', modelName: 'iRADV DX 8905', quantity: 5, withCIP: true },
            { id: 'two', modelName: 'iR 1643iF', quantity: 3 },
          ],
        }),
      });
      expect(configurationResponse.status).toBe(200);
      expect(await configurationResponse.json()).toMatchObject({
        t1TotalQty: 5,
        t2TotalQty: 3,
        t1CIPQty: 5,
        t2CIPQty: 0,
        monthlyTotal: 533.67,
        contractTotal: 12808.08,
        t1SKU: { label: '1-9', sku: '3575B792AA' },
      });

      const editedCatalog = {
        ...catalog,
        source: 'Catálogo uniFLOW editado',
        lastModified: '10/09/26',
        lists: {
          ...catalog.lists,
          t1: catalog.lists.t1.map((item, index) => index === 0 ? { ...item, price: 40 } : item),
        },
      };
      const saveResponse = await fetch(`${baseUrl}/api/uniflow/catalog`, {
        method: 'PUT',
        headers,
        body: JSON.stringify(editedCatalog),
      });
      expect(saveResponse.status).toBe(200);
      const savedCatalog = await saveResponse.json() as { source: string; lastModified: string; lists: { t1: Array<{ price: number }> } };
      expect(savedCatalog).toMatchObject({ source: 'Catálogo uniFLOW editado', lastModified: '10/09/26' });
      expect(savedCatalog.lists.t1[0].price).toBe(40);

      const updatedConfigurationResponse = await fetch(`${baseUrl}/api/uniflow/configure`, {
        method: 'POST',
        headers,
        body: JSON.stringify({ months: 24, devices: [{ id: 'one', modelName: 'iRADV DX 8905', quantity: 5 }] }),
      });
      expect(await updatedConfigurationResponse.json()).toMatchObject({ monthlyTotal: 200, contractTotal: 4800 });
    } finally {
      await new Promise<void>((resolve) => server.close(() => resolve()));
      database.close();
    }
  });

  it('analyzes software requirements locally and persists the last selection', async () => {
    const { app, database } = createServer({ dataDirectory: makeTemporaryDataDirectory() });
    const server = app.listen(0, '127.0.0.1');

    try {
      await new Promise<void>((resolve) => server.once('listening', () => resolve()));
      const address = server.address();
      const port = typeof address === 'object' && address ? address.port : 0;
      const baseUrl = `http://127.0.0.1:${port}`;
      const headers = { 'content-type': 'application/json' };

      const catalogResponse = await fetch(`${baseUrl}/api/software-selector/catalog`);
      expect(catalogResponse.status).toBe(200);
      const catalog = await catalogResponse.json() as { features: unknown[]; products: unknown[] };
      expect(catalog.features).toHaveLength(35);
      expect(catalog.products).toHaveLength(4);

      const analysisResponse = await fetch(`${baseUrl}/api/software-selector/analyze`, {
        method: 'POST',
        headers,
        body: JSON.stringify({
          fileName: 'pliego.txt',
          text: 'Se requiere impresión Follow-Me, soporte local con servidor de contingencia y Active Directory.',
        }),
      });
      expect(analysisResponse.status).toBe(200);
      const analyzed = await analysisResponse.json() as {
        analysis: { fileName: string; source: string; selectedFeatureIds: string[] };
        recommendations: Array<{ product: { id: string }; score: number }>;
      };
      expect(analyzed.analysis).toMatchObject({ fileName: 'pliego.txt', source: 'heurística local' });
      expect(analyzed.analysis.selectedFeatureIds).toEqual(expect.arrayContaining([
        'print_anywhere',
        'remote_resilience_rps',
        'ad_integration',
      ]));
      expect(analyzed.recommendations[0]).toMatchObject({ product: { id: 'uniflow_hybrid' }, score: 3 });

      const lastResponse = await fetch(`${baseUrl}/api/software-selector/last`);
      expect(await lastResponse.json()).toMatchObject({ analysis: { fileName: 'pliego.txt' } });

      const clearResponse = await fetch(`${baseUrl}/api/software-selector/last`, { method: 'DELETE' });
      expect(clearResponse.status).toBe(204);
      const clearedResponse = await fetch(`${baseUrl}/api/software-selector/last`);
      expect(await clearedResponse.json()).toBeNull();
    } finally {
      await new Promise<void>((resolve) => server.close(() => resolve()));
      database.close();
    }
  });

  it('analyzes SLA clauses locally and persists the compliance report', async () => {
    const { app, database } = createServer({ dataDirectory: makeTemporaryDataDirectory() });
    const server = app.listen(0, '127.0.0.1');

    try {
      await new Promise<void>((resolve) => server.once('listening', () => resolve()));
      const address = server.address();
      const port = typeof address === 'object' && address ? address.port : 0;
      const baseUrl = `http://127.0.0.1:${port}`;
      const headers = { 'content-type': 'application/json' };

      const referenceResponse = await fetch(`${baseUrl}/api/sla/reference`);
      expect(referenceResponse.status).toBe(200);
      expect(await referenceResponse.json()).toHaveLength(6);

      const analysisResponse = await fetch(`${baseUrl}/api/sla/analyze`, {
        method: 'POST',
        headers,
        body: JSON.stringify({
          fileName: 'pliego-sla.txt',
          text: 'Se requiere atención 24x7, suministro de papel, solución en 4 horas en Asunción, equipo de backup y confidencialidad.',
        }),
      });
      expect(analysisResponse.status).toBe(200);
      const analysis = await analysisResponse.json() as {
        fileName: string;
        overallRisk: string;
        complianceScore: number;
        items: Array<{ id: string; status: string }>;
      };
      expect(analysis).toMatchObject({ fileName: 'pliego-sla.txt', overallRisk: 'high', complianceScore: 50 });
      expect(analysis.items).toEqual(expect.arrayContaining([
        expect.objectContaining({ id: 'paper-supply', status: 'gap' }),
        expect.objectContaining({ id: 'backup-equipment', status: 'complies' }),
      ]));

      const lastResponse = await fetch(`${baseUrl}/api/sla/last`);
      expect(await lastResponse.json()).toMatchObject({ fileName: 'pliego-sla.txt', complianceScore: 50 });
      const clearResponse = await fetch(`${baseUrl}/api/sla/last`, { method: 'DELETE' });
      expect(clearResponse.status).toBe(204);
      const clearedResponse = await fetch(`${baseUrl}/api/sla/last`);
      expect(await clearedResponse.json()).toBeNull();
    } finally {
      await new Promise<void>((resolve) => server.close(() => resolve()));
      database.close();
    }
  });

  it('connects the shared catalog to pricing and proformas', async () => {
    const { app, database } = createServer({ dataDirectory: makeTemporaryDataDirectory() });
    const server = app.listen(0, '127.0.0.1');

    try {
      await new Promise<void>((resolve) => server.once('listening', () => resolve()));
      const address = server.address();
      const port = typeof address === 'object' && address ? address.port : 0;
      const baseUrl = `http://127.0.0.1:${port}`;

      const batchResponse = await fetch(`${baseUrl}/api/imports`, {
        method: 'POST',
        headers: { 'content-type': 'application/json' },
        body: JSON.stringify({ domain: 'catalog', sourceName: 'catalogo.xlsx' }),
      });
      const batch = (await batchResponse.json()) as { id: string };
      await fetch(`${baseUrl}/api/catalog/parts`, {
        method: 'POST',
        headers: { 'content-type': 'application/json' },
        body: JSON.stringify({
          batchId: batch.id,
          parts: [{
            brand: 'Canon',
            code: 'FK-123',
            description: 'KIT DE MANTENIMIENTO',
            models: ['iR ADV C3325i'],
            stock: 7,
            priceUsd: 12.5,
            priceLocal: 79375,
            markup: 0,
            discontinuedAt: null,
          }],
          modelFamilies: [{
            brand: 'Canon',
            familyName: 'iR',
            modelName: 'iR ADV C3325i',
            exchangeRate: 6080,
            factor: 1.8,
          }],
        }),
      });

      const pricingResponse = await fetch(`${baseUrl}/api/sales/pricing`, {
        method: 'PUT',
        headers: { 'content-type': 'application/json' },
        body: JSON.stringify({ exchangeRate: 10000, factor: 2, laborPrice: 90000 }),
      });
      expect(pricingResponse.status).toBe(200);

      const priceListResponse = await fetch(`${baseUrl}/api/sales/price-list?query=FK123`);
      const priceList = (await priceListResponse.json()) as Array<{ id: string; salePriceLocal: number }>;
      expect(priceList).toEqual([expect.objectContaining({ salePriceLocal: 250000 })]);

      const familyPriceListResponse = await fetch(`${baseUrl}/api/sales/price-list?familyName=iR&query=FK123`);
      const familyPriceList = (await familyPriceListResponse.json()) as Array<{ salePriceLocal: number }>;
      expect(familyPriceList).toEqual([expect.objectContaining({ salePriceLocal: 136800 })]);

      const proformaResponse = await fetch(`${baseUrl}/api/sales/proformas`, {
        method: 'POST',
        headers: { 'content-type': 'application/json' },
        body: JSON.stringify({
          header: {
            customerName: 'Cliente API',
            customerContact: '',
            serviceReport: '',
            reference: 'API-001',
            issuedAt: '2026-09-10T12:00:00.000Z',
            attendedBy: 'Ventas',
            modelName: 'iR ADV C3325i',
            serialNumber: '',
            mode: 'sin-contrato',
          },
          lines: [
            { kind: 'part', partId: priceList[0].id, quantity: 2 },
            { kind: 'labor', description: 'Instalación', costLocal: 50000, unitPriceLocal: 90000, quantity: 1 },
          ],
        }),
      });
      expect(proformaResponse.status).toBe(201);
      const proforma = (await proformaResponse.json()) as { id: string; totalLocal: number };
      expect(proforma.totalLocal).toBe(590000);

      const historyResponse = await fetch(`${baseUrl}/api/sales/proformas`);
      expect(await historyResponse.json()).toEqual([
        expect.objectContaining({ id: proforma.id, customerName: 'Cliente API', totalLocal: 590000 }),
      ]);
    } finally {
      await new Promise<void>((resolve) => server.close(() => resolve()));
      database.close();
    }
  });

  it('persists the selected price-list models through the local API', async () => {
    const { app, database } = createServer({ dataDirectory: makeTemporaryDataDirectory() });
    const server = app.listen(0, '127.0.0.1');

    try {
      await new Promise<void>((resolve) => server.once('listening', () => resolve()));
      const address = server.address();
      const port = typeof address === 'object' && address ? address.port : 0;
      const baseUrl = `http://127.0.0.1:${port}`;
      const getResponse = await fetch(`${baseUrl}/api/sales/price-list-selection`);
      expect(getResponse.status).toBe(200);
      expect(await getResponse.json()).toEqual({ modelNames: [] });

      const saveResponse = await fetch(`${baseUrl}/api/sales/price-list-selection`, {
        method: 'PUT',
        headers: { 'content-type': 'application/json' },
        body: JSON.stringify({ modelNames: ['iR ADV C5535i', 'iR ADV C3325i', 'iR ADV C5535i'] }),
      });
      expect(saveResponse.status).toBe(200);
      expect(await saveResponse.json()).toEqual({ modelNames: ['iR ADV C3325i', 'iR ADV C5535i'] });

      const invalidResponse = await fetch(`${baseUrl}/api/sales/price-list-selection`, {
        method: 'PUT',
        headers: { 'content-type': 'application/json' },
        body: JSON.stringify({ modelNames: ['válido', 3] }),
      });
      expect(invalidResponse.status).toBe(400);
    } finally {
      await new Promise<void>((resolve) => server.close(() => resolve()));
      database.close();
    }
  });

  it('imports, archives and applies an open contract to fixed-price proformas', async () => {
    const dataDirectory = makeTemporaryDataDirectory();
    const { app, database } = createServer({ dataDirectory });
    const server = app.listen(0, '127.0.0.1');

    try {
      await new Promise<void>((resolve) => server.once('listening', () => resolve()));
      const address = server.address();
      const port = typeof address === 'object' && address ? address.port : 0;
      const baseUrl = `http://127.0.0.1:${port}`;

      const batchResponse = await fetch(`${baseUrl}/api/imports`, {
        method: 'POST',
        headers: { 'content-type': 'application/json' },
        body: JSON.stringify({
          domain: 'sales-open-contract',
          sourceName: 'contrato-abierto.xlsx',
          sourceType: 'open-contract',
          sourceHash: 'contract-hash-001',
        }),
      });
      expect(batchResponse.status).toBe(201);
      const batch = (await batchResponse.json()) as { id: string };

      const sourceResponse = await fetch(`${baseUrl}/api/imports/${batch.id}/source`, {
        method: 'POST',
        headers: { 'content-type': 'application/json' },
        body: JSON.stringify({
          fileName: 'contrato-abierto.xlsx',
          contentBase64: Buffer.from(await makeServicesWorkbook(
            ['Código', 'Descripción', 'Precio fijo'],
            [['FIJO-1', 'Repuesto contractual', 125000]],
          )).toString('base64'),
          contentType: 'application/vnd.openxmlformats-officedocument.spreadsheetml.sheet',
        }),
      });
      expect(sourceResponse.status).toBe(201);

      const contractResponse = await fetch(`${baseUrl}/api/sales/open-contract`, {
        method: 'POST',
        headers: { 'content-type': 'application/json' },
        body: JSON.stringify({
          batchId: batch.id,
          snapshot: {
            meta: {
              fileName: 'contrato-abierto.xlsx',
              updatedAt: '2026-09-14T12:00:00.000Z',
              rowCount: 1,
              invalidRows: 0,
              duplicateRows: 0,
              sourceFormat: 'xlsx',
              priceCurrency: 'local',
              hasKindColumn: true,
            },
            items: [{
              id: 'contrato-FIJO-1',
              kind: 'repuestos',
              code: 'FIJO-1',
              description: 'Repuesto contractual',
              group: 'Repuestos',
              priceUsd: null,
              priceLocal: 125000,
            }],
          },
        }),
      });
      expect(contractResponse.status).toBe(201);
      expect(await contractResponse.json()).toMatchObject({ meta: { sourceBatchId: batch.id }, items: [{ code: 'FIJO-1' }] });

      const importResponse = await fetch(`${baseUrl}/api/imports/${batch.id}`);
      expect(await importResponse.json()).toMatchObject({
        batch: { status: 'applied', sourceType: 'open-contract' },
        files: [expect.objectContaining({ fileName: 'contrato-abierto.xlsx' })],
      });

      const proformaResponse = await fetch(`${baseUrl}/api/sales/proformas`, {
        method: 'POST',
        headers: { 'content-type': 'application/json' },
        body: JSON.stringify({
          header: {
            customerName: 'Cliente contractual API',
            customerContact: '',
            serviceReport: '',
            reference: 'CON-API-001',
            issuedAt: '2026-09-14T12:00:00.000Z',
            attendedBy: '',
            modelName: '',
            serialNumber: '',
            mode: 'contrato-abierto',
          },
          lines: [{
            kind: 'part',
            code: 'FIJO-1',
            description: 'Repuesto contractual',
            unitPriceLocal: 125000,
            quantity: 2,
          }],
        }),
      });
      expect(proformaResponse.status).toBe(201);
      expect(await proformaResponse.json()).toMatchObject({ mode: 'contrato-abierto', totalLocal: 250000, lines: [{ partId: null }] });

      const usdProformaResponse = await fetch(`${baseUrl}/api/sales/proformas`, {
        method: 'POST',
        headers: { 'content-type': 'application/json' },
        body: JSON.stringify({
          currency: 'USD',
          header: {
            customerName: 'Cliente USD API',
            customerContact: '',
            serviceReport: '',
            reference: 'CON-USD-API',
            issuedAt: '2026-09-14T12:00:00.000Z',
            attendedBy: '',
            modelName: '',
            serialNumber: '',
            mode: 'contrato-abierto',
          },
          lines: [{
            kind: 'part',
            code: 'USD-1',
            description: 'Repuesto contractual USD',
            unitPriceUsd: 12.5,
            quantity: 2,
          }],
        }),
      });
      expect(usdProformaResponse.status).toBe(201);
      expect(await usdProformaResponse.json()).toMatchObject({ currency: 'USD', totalLocal: 149600, lines: [{ unitPriceUsd: 12.5, unitPriceLocal: 74800 }] });
    } finally {
      await new Promise<void>((resolve) => server.close(() => resolve()));
      database.close();
    }
  });

  it('imports separate Proformas catalogs, preserves the source and saves their fixed-price lines', async () => {
    const dataDirectory = makeTemporaryDataDirectory();
    const { app, database } = createServer({ dataDirectory });
    const server = app.listen(0, '127.0.0.1');

    try {
      await new Promise<void>((resolve) => server.once('listening', () => resolve()));
      const address = server.address();
      const port = typeof address === 'object' && address ? address.port : 0;
      const baseUrl = `http://127.0.0.1:${port}`;
      const bytes = await makeSalesCatalogWorkbook();
      const batchResponse = await fetch(`${baseUrl}/api/imports`, {
        method: 'POST',
        headers: { 'content-type': 'application/json' },
        body: JSON.stringify({
          domain: 'sales-catalog',
          sourceName: 'CONSUMIBLES_SISTEMA_ING.xlsx',
          sourceType: 'proformas-catalog-consumibles',
          sourceHash: 'sales-catalog-hash-001',
        }),
      });
      expect(batchResponse.status).toBe(201);
      const batch = (await batchResponse.json()) as { id: string };

      const sourceResponse = await fetch(`${baseUrl}/api/imports/${batch.id}/source`, {
        method: 'POST',
        headers: { 'content-type': 'application/json' },
        body: JSON.stringify({
          fileName: 'CONSUMIBLES_SISTEMA_ING.xlsx',
          contentBase64: Buffer.from(bytes).toString('base64'),
          contentType: 'application/vnd.openxmlformats-officedocument.spreadsheetml.sheet',
        }),
      });
      expect(sourceResponse.status).toBe(201);
      const stored = (await sourceResponse.json()) as { storedPath: string };

      const catalogResponse = await fetch(`${baseUrl}/api/sales/catalogs/consumibles`, {
        method: 'POST',
        headers: { 'content-type': 'application/json' },
        body: JSON.stringify({
          batchId: batch.id,
          snapshot: {
            meta: {
              kind: 'consumibles',
              fileName: 'CONSUMIBLES_SISTEMA_ING.xlsx',
              updatedAt: '2026-09-14T12:00:00.000Z',
              rowCount: 1,
              invalidRows: 0,
              duplicateRows: 0,
              hasDiscontinuedColumn: true,
            },
            items: [{
              id: 'proformas-consumibles-CEXV55',
              kind: 'consumibles',
              code: 'CEXV-55',
              description: 'TONER NEGRO',
              group: 'Tóner',
              priceUsd: 13,
              priceLocal: 77740,
              stock: 4,
              discontinued: 'active',
            }],
          },
        }),
      });
      expect(catalogResponse.status).toBe(201);
      expect(await catalogResponse.json()).toMatchObject({ meta: { kind: 'consumibles', sourceBatchId: batch.id }, items: [{ code: 'CEXV-55', priceLocal: 77740 }] });
      expect(fs.existsSync(path.join(dataDirectory, stored.storedPath))).toBe(true);

      const catalogsResponse = await fetch(`${baseUrl}/api/sales/catalogs`);
      expect(await catalogsResponse.json()).toMatchObject({ consumibles: { items: [{ code: 'CEXV-55' }] }, repuestos: null });
      const importResponse = await fetch(`${baseUrl}/api/imports/${batch.id}`);
      expect(await importResponse.json()).toMatchObject({ batch: { status: 'applied', sourceType: 'proformas-catalog-consumibles' } });

      const proformaResponse = await fetch(`${baseUrl}/api/sales/proformas`, {
        method: 'POST',
        headers: { 'content-type': 'application/json' },
        body: JSON.stringify({
          header: {
            customerName: 'Cliente catálogo Proformas',
            customerContact: '',
            serviceReport: '',
            reference: 'CAT-API-001',
            issuedAt: '2026-09-14T12:00:00.000Z',
            attendedBy: '',
            modelName: '',
            serialNumber: '',
            mode: 'sin-contrato',
          },
          lines: [{
            kind: 'part',
            source: 'proformas',
            code: 'CEXV-55',
            description: 'TONER NEGRO',
            unitPriceUsd: 13,
            unitPriceLocal: 77740,
            quantity: 2,
          }],
        }),
      });
      expect(proformaResponse.status).toBe(201);
      expect(await proformaResponse.json()).toMatchObject({ mode: 'sin-contrato', totalLocal: 155480, lines: [{ partId: null, code: 'CEXV-55' }] });
    } finally {
      await new Promise<void>((resolve) => server.close(() => resolve()));
      database.close();
    }
  });
});
