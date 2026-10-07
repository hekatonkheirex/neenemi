import fs from 'node:fs';
import os from 'node:os';
import path from 'node:path';
import { afterEach, describe, expect, it } from 'vitest';
import { openDatabase } from '../../db/database';
import { ImportRepository } from '../../db/repositories';
import { OperationsRepository } from '../operaciones/repository';
import { ServiceRepository } from './repository';
import type { ParsedServiceRow } from './types';

const temporaryDirectories: string[] = [];
const databases: Array<ReturnType<typeof openDatabase>> = [];

function makeTemporaryDatabase() {
  const directory = fs.mkdtempSync(path.join(os.tmpdir(), 'datasystems-suite-services-'));
  temporaryDirectories.push(directory);
  const database = openDatabase(path.join(directory, 'dcss.sqlite'));
  databases.push(database);
  return database;
}

afterEach(() => {
  for (const database of databases.splice(0)) database.close();
  for (const directory of temporaryDirectories.splice(0)) {
    fs.rmSync(directory, { recursive: true, force: true });
  }
});

function makeRow(overrides: Partial<ParsedServiceRow> = {}): ParsedServiceRow {
  return {
    serviceNumber: 9003,
    orderReference: 'OV-SERVICE-001',
    recordedAt: '2026-06-01',
    month: '2026-06',
    serviceType: 'En Sitio',
    taskType: 'Reparación',
    sourceContractType: 'Alquiler',
    technician: 'Tec Uno',
    taskCompleted: 'Se reemplazó el fusor',
    partsUsed: 'Fusor',
    modelLabel: 'iR ADV C3325i',
    serialNumber: 'SER-SERVICE-001',
    sourceCustomerName: 'Cliente LAM',
    sourceOperational: {
      division: 'Central',
      branch: 'Sucursal Norte',
      status: 'Finalizado',
      finishedAt: '2026-06-01T10:00:00.000Z',
    },
    sourceDetails: [{ label: 'Estado', value: 'Finalizado' }],
    family: 'GPR53',
    sourceSheetName: 'Servicios',
    sourceRowNumber: 7,
    ...overrides,
  };
}

describe('ServiceRepository', () => {
  it('links interventions to the shared installed base and deduplicates service rows', () => {
    const database = makeTemporaryDatabase();
    const operations = new OperationsRepository(database);
    const customer = operations.saveCustomer({ name: 'Cliente Servicios', customerType: 'Publico', commercialArea: 'Strategic' });
    operations.saveContract({
      customerId: customer.id,
      reference: 'OV-SERVICE-001',
      contractType: 'Mantenimiento',
      equipment: [{ modelLabel: 'iR ADV C3325i', serialNumber: 'SER-SERVICE-001' }],
    });
    const imports = new ImportRepository(database);
    const batchId = imports.createBatch({ domain: 'services', sourceName: 'Servicios LAM.xlsx' });
    const repository = new ServiceRepository(database);

    expect(repository.importRows(batchId, 'Servicios LAM.xlsx', [
      makeRow(),
      makeRow(),
      makeRow({ serviceNumber: 9004, serialNumber: 'SER-NO-INSTALADO' }),
    ], 1)).toEqual({
      sourceType: 'servicios',
      accepted: 1,
      duplicates: 1,
      skippedNoEquipment: 1,
      skippedContract: 0,
      skippedOutOfScope: 1,
    });
    expect(imports.getBatch(batchId)?.status).toBe('applied');
    expect(repository.getSummary()).toEqual({
      sourceFiles: 1,
      records: 1,
      equipment: 1,
      firstMonth: '2026-06',
      lastMonth: '2026-06',
      taskTypes: [{ key: 'Reparación', records: 1 }],
    });
    expect(repository.list({ query: 'cliente servicios', taskType: 'Reparación', limit: 10 })).toEqual([
      expect.objectContaining({
        serviceNumber: 9003,
        customerName: 'Cliente Servicios',
        customerType: 'Publico',
        commercialArea: 'Strategic',
        contractReference: 'OV-SERVICE-001',
        serialNumber: 'SER-SERVICE-001',
        taskCompleted: 'Se reemplazó el fusor',
        sourceOperational: {
          division: 'Central',
          branch: 'Sucursal Norte',
          status: 'Finalizado',
          finishedAt: '2026-06-01T10:00:00.000Z',
        },
        sourceDetails: [{ label: 'Estado', value: 'Finalizado' }],
        sourceSheetName: 'Servicios',
        sourceRowNumber: 7,
      }),
    ]);
    expect(repository.list({ query: 'finalizado', limit: 10 })).toHaveLength(1);
    expect(repository.list({ query: 'sucursal norte', limit: 10 })).toHaveLength(1);
  });

  it('lists more than 10 000 services when asked, so analysis views keep the oldest months', () => {
    const database = makeTemporaryDatabase();
    const operations = new OperationsRepository(database);
    const customer = operations.saveCustomer({ name: 'Cliente Historial', customerType: 'Publico', commercialArea: 'Strategic' });
    operations.saveContract({
      customerId: customer.id,
      reference: 'OV-HISTORY',
      contractType: 'Mantenimiento',
      equipment: [{ modelLabel: 'iR ADV C3325i', serialNumber: 'SER-HISTORY' }],
    });
    const batchId = new ImportRepository(database).createBatch({ domain: 'services', sourceName: 'Historial.xlsx' });
    const repository = new ServiceRepository(database);
    const rows = Array.from({ length: 10500 }, (_, index) => makeRow({
      serialNumber: 'SER-HISTORY',
      serviceNumber: 100000 + index,
      month: index === 0 ? '2024-01' : '2026-06',
      recordedAt: index === 0 ? '2024-01-02' : '2026-06-01',
    }));

    repository.importRows(batchId, 'Historial.xlsx', rows);

    const listed = repository.list({ limit: 100000 });
    expect(listed).toHaveLength(10500);
    expect(listed.some((record) => record.month === '2024-01')).toBe(true);
  });

  it('applies the shared operational filters to service history', () => {
    const database = makeTemporaryDatabase();
    const operations = new OperationsRepository(database);
    const customer = operations.saveCustomer({ name: 'Cliente Servicios Privado', customerType: 'Privado', commercialArea: 'Commercial' });
    operations.saveContract({
      customerId: customer.id,
      reference: 'OV-SERVICE-FILTER',
      contractType: 'Leasing',
      equipment: [{ modelLabel: 'iR ADV C3325i', serialNumber: 'SER-SERVICE-FILTER' }],
    });
    const imports = new ImportRepository(database);
    const batchId = imports.createBatch({ domain: 'services', sourceName: 'Servicios filtrados.xlsx' });
    const repository = new ServiceRepository(database);
    repository.importRows(batchId, 'Servicios filtrados.xlsx', [makeRow({ serialNumber: 'SER-SERVICE-FILTER', month: '2026-08', recordedAt: '2026-08-01' })]);

    expect(repository.getSummary({ sector: 'Privado', department: 'Commercial', contractType: 'Leasing', dateFrom: '2026-08', dateTo: '2026-08' }).records).toBe(1);
    expect(repository.list({ sector: 'Publico', limit: 10 })).toHaveLength(0);
  });

  it('backfills source metadata without changing the normalized intervention', () => {
    const database = makeTemporaryDatabase();
    const operations = new OperationsRepository(database);
    const customer = operations.saveCustomer({ name: 'Cliente Servicio Reindexado' });
    operations.saveContract({
      customerId: customer.id,
      reference: 'OV-REINDEX-SERVICE',
      contractType: 'Mantenimiento',
      equipment: [{ modelLabel: 'iR ADV C3325i', serialNumber: 'SER-REINDEX-SERVICE' }],
    });
    const imports = new ImportRepository(database);
    const batchId = imports.createBatch({ domain: 'services', sourceName: 'Servicios LAM.xlsx' });
    const repository = new ServiceRepository(database);
    const row = makeRow({
      serialNumber: 'SER-REINDEX-SERVICE',
      sourceDetails: undefined,
      sourceSheetName: undefined,
      sourceRowNumber: undefined,
    });
    repository.importRows(batchId, 'Servicios LAM.xlsx', [row]);

    expect(repository.backfillSourceMetadata(batchId, [{
      ...row,
      sourceDetails: [{ label: 'Estado', value: 'Cerrado' }],
      sourceSheetName: 'LAM 2026',
      sourceRowNumber: 44,
    }])).toBe(1);
    expect(repository.list({ query: 'SER-REINDEX-SERVICE', limit: 10 })).toEqual([
      expect.objectContaining({
        serviceNumber: 9003,
        taskCompleted: 'Se reemplazó el fusor',
        sourceDetails: [{ label: 'Estado', value: 'Cerrado' }],
        sourceSheetName: 'LAM 2026',
        sourceRowNumber: 44,
      }),
    ]);
  });

  it('replaces all previous service batches while keeping the new source rows', () => {
    const database = makeTemporaryDatabase();
    const operations = new OperationsRepository(database);
    const customer = operations.saveCustomer({ name: 'Cliente Reemplazo Servicios' });
    operations.saveContract({
      customerId: customer.id,
      reference: 'OV-REPLACE-SERVICE',
      contractType: 'Mantenimiento',
      equipment: [{ modelLabel: 'iR ADV C3325i', serialNumber: 'SER-REPLACE-SERVICE' }],
    });
    const imports = new ImportRepository(database);
    const repository = new ServiceRepository(database);
    const firstBatchId = imports.createBatch({ domain: 'services', sourceName: 'servicios-1.xlsx', sourceType: 'servicios' });
    const secondBatchId = imports.createBatch({ domain: 'services', sourceName: 'servicios-2.xlsx', sourceType: 'servicios' });
    repository.importRows(firstBatchId, 'servicios-1.xlsx', [makeRow({ serialNumber: 'SER-REPLACE-SERVICE', serviceNumber: 9101 })]);
    repository.importRows(secondBatchId, 'servicios-2.xlsx', [makeRow({ serialNumber: 'SER-REPLACE-SERVICE', serviceNumber: 9102 })]);

    const replacementBatchId = imports.createBatch({ domain: 'services', sourceName: 'servicios-nuevo.xlsx', sourceType: 'servicios' });
    expect(repository.importRows(
      replacementBatchId,
      'servicios-nuevo.xlsx',
      [makeRow({ serialNumber: 'SER-REPLACE-SERVICE', serviceNumber: 9201 })],
      0,
      [firstBatchId, secondBatchId],
    )).toMatchObject({ accepted: 1, duplicates: 0 });
    expect(imports.getBatch(firstBatchId)).toBeUndefined();
    expect(imports.getBatch(secondBatchId)).toBeUndefined();
    expect(repository.list({ limit: 10 }).map((record) => record.serviceNumber)).toEqual([9201]);
  });
});
