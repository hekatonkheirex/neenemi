import fs from 'node:fs';
import os from 'node:os';
import path from 'node:path';
import ExcelJS from 'exceljs';
import { afterEach, describe, expect, it } from 'vitest';
import { openDatabase } from '../db/database';
import { ImportRepository } from '../db/repositories';
import { storeImportFile } from './import-storage';
import { backfillStoredSourceMetadata, inferConsumablesSourceType } from './source-metadata-backfill';
import { OperationsRepository } from '../modules/operaciones/repository';
import { ConsumablesRepository } from '../modules/consumibles/repository';
import { parseConsumablesWorkbook } from '../modules/consumibles/xlsx';
import { ServiceRepository } from '../modules/servicios/repository';
import { parseServicesWorkbook } from '../modules/servicios/parser';
import { TravelRepository } from '../modules/viaticos/repository';
import { parseTravelWorkbook } from '../modules/viaticos/parser';

const temporaryDirectories: string[] = [];
const databases: Array<ReturnType<typeof openDatabase>> = [];

afterEach(() => {
  for (const database of databases.splice(0)) database.close();
  for (const directory of temporaryDirectories.splice(0)) {
    fs.rmSync(directory, { recursive: true, force: true });
  }
});

async function makeConsumablesWorkbook(): Promise<Uint8Array> {
  const workbook = new ExcelJS.Workbook();
  const sheet = workbook.addWorksheet('Histórico');
  sheet.addRow(['ID', 'Contrato', 'Fecha', 'Equipo', 'Serie', 'Código', 'Descripción', 'Cantidad', 'Costo USD', 'División']);
  sheet.addRow([1, 'OV-BACKFILL', new Date('2026-08-01T12:00:00Z'), 'iR ADV C3325i', 'SER-BACKFILL', 'CRG-T03', 'Tóner compatible T03', 2, 120, 'MRA']);
  return new Uint8Array(await workbook.xlsx.writeBuffer());
}

async function makeServicesWorkbook(): Promise<Uint8Array> {
  const workbook = new ExcelJS.Workbook();
  const sheet = workbook.addWorksheet('LAM 2026');
  sheet.addRow([
    'N I S', 'División', 'Tipo de recepción', 'Cliente', 'N OV', 'Fecha', 'N Serie', 'Equipo',
    'T Resp', 'Sucursal', 'H Trab', 'Resp', 'T Serv', 'Serv', 'Cierre', 'Tipo Servicio',
    'Servicio solicitado', 'Fch Hora Inicio', 'Fch Hora Fin', 'Tipo Contrato', 'Tipo Tarea',
    'Estado', 'ES interior', 'Cerr Mob', 'Técnico', 'Es Retrab', 'N IS viene', 'Técnico viene',
    'Tarea realizada', 'Repuestos utilizados', 'Ciudad Sucursal', 'Ciudad Cliente', 'Papeles', 'Contadores',
  ]);
  sheet.addRow([
    9004, 'MRA', 'Normal', 'Cliente Backfill', 'OV-BACKFILL', '2026-08-02', 'SER-BACKFILL-SERVICE', 'iR ADV C3325i',
    '2h', 'Asunción', '1h', 'Sí', '3h', 'Sí', 'Sí', 'En sitio', 'Cambio de tóner',
    new Date('2026-08-02T12:00:00Z'), new Date('2026-08-02T14:00:00Z'), 'Mantenimiento', 'Preventivo',
    'Cerrado', 'No', 'Sí', 'Tec Backfill', 'No', 0, '', 'Se cambió el tóner', 'CRG-T03',
    'Asunción', 'Asunción', 'Sí', 25000,
  ]);
  return new Uint8Array(await workbook.xlsx.writeBuffer());
}

async function makeTravelWorkbook(): Promise<Uint8Array> {
  const workbook = new ExcelJS.Workbook();
  const sheet = workbook.addWorksheet('VIAJES2026');
  sheet.addRow([
    'Cant', 'Fecha', 'I.S.', 'Cliente', 'Destino', 'Medio', 'Técnicos', 'Chofer asignado',
    'Monto', 'Viático', 'Hospedaje', 'Peajes', 'Varios', 'Pago por uso de vehículo',
    'Pago a técnicos y chofer', 'Costo por Servicio', 'Km aproximado realizado', 'Movil',
    'Promedio de Consumo x 100km', 'Costos x Lts', 'Costo Combustible por servicio', 'Costo por Servicio',
    'Gasto total', 'Total Costo Serv', 'Total Costo Comb', 'C.A. COSTO POR SERVICIOS',
  ]);
  sheet.addRow([
    1, new Date('2026-08-04T12:00:00Z'), 'IS-BACKFILL', 'Cliente Viajes', 'CDE', 'MOVIL PROPIO',
    'Tec Uno', 'S/CHOFER', 300000, 130000, 0, 146000, 0, 60000, 90000, 223125, 320,
    'PROPIO', 10, 8260, 80000, 359002, 506000, 400000, 106000, 359002,
  ]);
  return new Uint8Array(await workbook.xlsx.writeBuffer());
}

async function makeTravelWorkbookWithCostCatalog(): Promise<Uint8Array> {
  const workbook = new ExcelJS.Workbook();
  const travelSheet = workbook.addWorksheet('VIAJES2026');
  travelSheet.addRow(['Cant', 'Fecha', 'I.S.', 'Cliente', 'Destino', 'Medio', 'Movil']);
  travelSheet.addRow([1, new Date('2026-08-04T12:00:00Z'), 'IS-CATALOG', 'Cliente Viajes', 'PJC', 'MOVIL PROPIO', 'PROPIO']);

  const calculation = workbook.addWorksheet('CALCULO AUX');
  calculation.addRow(['Viático', '', '', 130000]);
  calculation.addRow(['Hotel', '', '', 200000]);
  calculation.addRow([]);
  calculation.getCell('A4').value = 'Peajes a PJC';
  calculation.mergeCells('A4:C4');
  calculation.getCell('A5').value = '25 de Diciembre';
  calculation.getCell('B5').value = 'Emboscada';
  calculation.getCell('C5').value = 'TOTAL';
  calculation.addRow([10000, 20000, 30000]);
  return new Uint8Array(await workbook.xlsx.writeBuffer());
}

function registerStoredFile(
  dataDirectory: string,
  imports: ImportRepository,
  batchId: string,
  fileName: string,
  contents: Uint8Array,
): string {
  const stored = storeImportFile(dataDirectory, batchId, fileName, contents);
  return imports.addFile({
    batchId,
    fileName,
    storedPath: stored.storedPath,
    contentHash: stored.contentHash,
    sizeBytes: stored.sizeBytes,
    contentBlob: contents,
  });
}

describe('stored source metadata backfill', () => {
  it('hydrates raw rows and restores metadata for old Consumibles and Services batches', async () => {
    const dataDirectory = fs.mkdtempSync(path.join(os.tmpdir(), 'datasystems-suite-backfill-'));
    temporaryDirectories.push(dataDirectory);
    const database = openDatabase(path.join(dataDirectory, 'dcss.sqlite'));
    databases.push(database);
    const imports = new ImportRepository(database);
    const operations = new OperationsRepository(database);
    const customer = operations.saveCustomer({ name: 'Cliente Backfill' });
    operations.saveContract({
      customerId: customer.id,
      reference: 'OV-BACKFILL',
      contractType: 'Mantenimiento',
      equipment: [
        { modelLabel: 'iR ADV C3325i', serialNumber: 'SER-BACKFILL' },
        { modelLabel: 'iR ADV C3325i', serialNumber: 'SER-BACKFILL-SERVICE' },
      ],
    });

    const consumablesContents = await makeConsumablesWorkbook();
    const parsedConsumables = await parseConsumablesWorkbook(consumablesContents, 'consumibles');
    const consumablesBatchId = imports.createBatch({ domain: 'consumibles', sourceName: 'Detalles de consumibles.xlsx' });
    const consumablesFileId = registerStoredFile(dataDirectory, imports, consumablesBatchId, 'Detalles de consumibles.xlsx', consumablesContents);
    expect(imports.getFileContent(consumablesFileId)).toEqual(consumablesContents);
    fs.unlinkSync(path.join(dataDirectory, imports.listFiles(consumablesBatchId)[0].storedPath));
    const consumables = new ConsumablesRepository(database);
    consumables.importRows(consumablesBatchId, 'Detalles de consumibles.xlsx', 'consumibles', parsedConsumables.rows.map((row) => ({
      ...row,
      sourceDetails: undefined,
      sourceSheetName: undefined,
      sourceRowNumber: undefined,
    })));

    const servicesContents = await makeServicesWorkbook();
    const parsedServices = await parseServicesWorkbook(servicesContents);
    const servicesBatchId = imports.createBatch({ domain: 'services', sourceName: 'Servicios LAM.xlsx' });
    registerStoredFile(dataDirectory, imports, servicesBatchId, 'Servicios LAM.xlsx', servicesContents);
    const services = new ServiceRepository(database);
    services.importRows(servicesBatchId, 'Servicios LAM.xlsx', parsedServices.rows.map((row) => ({
      ...row,
      sourceOperational: undefined,
      sourceDetails: undefined,
      sourceSheetName: undefined,
      sourceRowNumber: undefined,
    })));

    const result = await backfillStoredSourceMetadata({ dataDirectory, database, imports });

    expect(result).toMatchObject({
      batches: 2,
      files: 2,
      rawSheets: 2,
      rawRows: 4,
      usageRecords: 1,
      outputRecords: 0,
      serviceRecords: 1,
      skippedFiles: 0,
      errors: [],
    });
    expect(imports.listSourceSheets(consumablesBatchId)).toEqual([
      expect.objectContaining({ sheetName: 'Histórico', rowCount: 2 }),
    ]);
    expect(consumables.listRecords({ query: 'SER-BACKFILL', limit: 10 })).toEqual([
      expect.objectContaining({
        sourceDetails: expect.arrayContaining([{ label: 'División', value: 'MRA' }]),
        sourceSheetName: 'Histórico',
        sourceRowNumber: 2,
      }),
    ]);
    expect(services.list({ query: 'SER-BACKFILL-SERVICE', limit: 10 })).toEqual([
      expect.objectContaining({
        sourceOperational: expect.objectContaining({
          division: 'MRA',
          status: 'Cerrado',
        }),
        sourceDetails: expect.arrayContaining([
          { label: 'División', value: 'MRA' },
          { label: 'Estado', value: 'Cerrado' },
        ]),
        sourceSheetName: 'LAM 2026',
        sourceRowNumber: 2,
      }),
    ]);

    const secondRun = await backfillStoredSourceMetadata({ dataDirectory, database, imports });
    expect(secondRun).toMatchObject({ batches: 0, files: 0, rawSheets: 0, rawRows: 0, usageRecords: 0, serviceRecords: 0 });
  });

  it('infers the historical Consumibles source type only from known names', () => {
    expect(inferConsumablesSourceType({ sourceName: 'Salida de consumibles.xlsx', sourceType: null }, 'archivo.xlsx'))
      .toBe('salida-consumibles');
    expect(inferConsumablesSourceType({ sourceName: 'Salida de repuestos.xlsx', sourceType: null }, 'archivo.xlsx'))
      .toBe('salida-repuestos');
    expect(inferConsumablesSourceType({ sourceName: 'Detalles de uso de repuestos.xlsx', sourceType: null }, 'archivo.xlsx'))
      .toBe('uso-repuestos');
    expect(inferConsumablesSourceType({ sourceName: 'fuente desconocida.xlsx', sourceType: null }, 'archivo.xlsx'))
      .toBeNull();
  });

  it('restores calculated Viáticos columns for old imported trips', async () => {
    const dataDirectory = fs.mkdtempSync(path.join(os.tmpdir(), 'datasystems-suite-travel-backfill-'));
    temporaryDirectories.push(dataDirectory);
    const database = openDatabase(path.join(dataDirectory, 'dcss.sqlite'));
    databases.push(database);
    const imports = new ImportRepository(database);
    const contents = await makeTravelWorkbook();
    const parsed = await parseTravelWorkbook(contents, 'CONTROL DE VIATICO 2026.xlsx');
    const batchId = imports.createBatch({ domain: 'viaticos', sourceName: 'CONTROL DE VIATICO 2026.xlsx' });
    registerStoredFile(dataDirectory, imports, batchId, 'CONTROL DE VIATICO 2026.xlsx', contents);
    const travel = new TravelRepository(database);
    travel.importRows(batchId, 'CONTROL DE VIATICO 2026.xlsx', parsed.trips.map((trip) => ({
      ...trip,
      sourceOperational: undefined,
      sourceSheetName: undefined,
      sourceRow: 0,
    })));

    const result = await backfillStoredSourceMetadata({ dataDirectory, database, imports });

    expect(result).toMatchObject({
      batches: 1,
      files: 1,
      rawSheets: 1,
      rawRows: 2,
      travelTrips: 1,
      errors: [],
    });
    expect(travel.list({ query: '8260', limit: 10 })).toEqual([
      expect.objectContaining({
        sourceSheetName: 'VIAJES2026',
        sourceRowNumber: 2,
        sourceOperational: expect.objectContaining({
          mobile: 'PROPIO',
          averageConsumptionPer100Km: '10',
          fuelCostPerLiter: '8260',
        }),
      }),
    ]);

    const secondRun = await backfillStoredSourceMetadata({ dataDirectory, database, imports });
    expect(secondRun).toMatchObject({ batches: 0, files: 0, rawSheets: 0, rawRows: 0, travelTrips: 0 });
  });

  it('repairs an outdated Viáticos cost catalog from its archived source', async () => {
    const dataDirectory = fs.mkdtempSync(path.join(os.tmpdir(), 'datasystems-suite-travel-catalog-backfill-'));
    temporaryDirectories.push(dataDirectory);
    const database = openDatabase(path.join(dataDirectory, 'dcss.sqlite'));
    databases.push(database);
    const imports = new ImportRepository(database);
    const contents = await makeTravelWorkbookWithCostCatalog();
    const parsed = await parseTravelWorkbook(contents, 'CONTROL DE VIATICO 2026.xlsx');
    const batchId = imports.createBatch({ domain: 'viaticos', sourceName: 'CONTROL DE VIATICO 2026.xlsx' });
    registerStoredFile(dataDirectory, imports, batchId, 'CONTROL DE VIATICO 2026.xlsx', contents);
    const travel = new TravelRepository(database);
    travel.importRows(batchId, 'CONTROL DE VIATICO 2026.xlsx', parsed.trips, [], {
      ...parsed.costCatalog,
      tollRoutes: [],
    });
    database.prepare('UPDATE travel_cost_catalog SET parser_revision = 1').run();

    const result = await backfillStoredSourceMetadata({ dataDirectory, database, imports });

    expect(result).toMatchObject({
      batches: 1,
      files: 1,
      travelTrips: 0,
      travelCostCatalogs: 1,
      errors: [],
    });
    expect(travel.getCostCatalog().tollRoutes).toEqual([
      expect.objectContaining({ route: 'PJC', checkpoints: ['25 de Diciembre', 'Emboscada'], total: 30000 }),
    ]);

    const secondRun = await backfillStoredSourceMetadata({ dataDirectory, database, imports });
    expect(secondRun).toMatchObject({ batches: 0, files: 0, travelTrips: 0, travelCostCatalogs: 0 });
  });
});
