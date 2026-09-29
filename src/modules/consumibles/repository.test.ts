import fs from 'node:fs';
import os from 'node:os';
import path from 'node:path';
import { afterEach, describe, expect, it } from 'vitest';
import { openDatabase } from '../../db/database';
import { ImportRepository } from '../../db/repositories';
import { OperationsRepository } from '../operaciones/repository';
import { ConsumablesRepository } from './repository';
import type { ParsedConsumablesOutputRow, ParsedConsumablesRow } from './types';

const temporaryDirectories: string[] = [];
const databases: Array<ReturnType<typeof openDatabase>> = [];

function makeTemporaryDatabase() {
  const directory = fs.mkdtempSync(path.join(os.tmpdir(), 'datasystems-suite-consumables-'));
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

function makeRow(overrides: Partial<ParsedConsumablesRow> = {}): ParsedConsumablesRow {
  return {
    recordedAt: '2026-08-01',
    month: '2026-08',
    modelLabel: 'iR ADV C3325i',
    serialNumber: 'SER-CONS-001',
    partCode: 'CRG-T03',
    description: 'Tóner compatible T03',
    quantity: 2,
    costUsd: 120,
    recordKind: 'consumable',
    classification: 'compatible',
    category: 'toner',
    family: 'GPR53',
    ...overrides,
  };
}

function makeOutputRow(overrides: Partial<ParsedConsumablesOutputRow> = {}): ParsedConsumablesOutputRow {
  return {
    recordKind: 'consumable',
    documentNumber: 1001,
    recordedAt: '2026-08-05',
    month: '2026-08',
    modelLabel: 'iR ADV C3325i',
    serialNumber: 'SER-OUT-001',
    partCode: 'CRG-T03',
    description: 'Tóner compatible T03',
    quantity: 1,
    yieldPages: 12000,
    technician: '',
    serviceReportNumber: 0,
    sourceCustomerName: 'Cliente histórico',
    classification: 'compatible',
    category: 'toner',
    family: 'GPR53',
    ...overrides,
  };
}

describe('ConsumablesRepository', () => {
  it('links records to the shared installed base and deduplicates source rows', () => {
    const database = makeTemporaryDatabase();
    const operations = new OperationsRepository(database);
    const customer = operations.saveCustomer({ name: 'Cliente Consumibles', customerType: 'Publico', commercialArea: 'Strategic' });
    operations.saveContract({
      customerId: customer.id,
      reference: 'OV-CONS-001',
      orderReference: 'ORD-CONS-001',
      contractType: 'Mantenimiento',
      division: 'MRA',
      equipment: [{ modelLabel: 'iR ADV C3325i', serialNumber: 'SER-CONS-001' }],
    });
    const imports = new ImportRepository(database);
    const batchId = imports.createBatch({ domain: 'consumibles', sourceName: 'export-renombrado.xlsx', sourceType: 'consumibles' });
    const repository = new ConsumablesRepository(database);

    expect(repository.importRows(batchId, 'export-renombrado.xlsx', 'consumibles', [
      makeRow({
        sourceCustomerName: 'Cliente histórico',
        sourceOrderReference: 'OV-FUENTE-001',
        sourceUnitPricePyg: 30000,
        sourceTotalPyg: 60000,
        sourceOperational: {
          dispatchNumber: '7001',
          technician: 'Tec Uno',
          serviceReportNumber: '9001',
          taskCompleted: 'Cambio de tóner',
          sourceSector: 'Privado',
          sourceCommercialArea: 'Commercial',
          sourceContractReference: 'REF-FUENTE-001',
        },
        sourceDetails: [{ label: 'Técnico', value: 'Tec Uno' }],
        sourceSheetName: 'Uso de repuestos',
        sourceRowNumber: 7,
      }),
      makeRow(),
      makeRow({ serialNumber: 'SER-NO-INSTALADO' }),
    ], 1)).toEqual({
      sourceType: 'consumibles',
      accepted: 1,
      consumables: 1,
      parts: 0,
      duplicates: 1,
      skippedNoEquipment: 1,
      skippedContract: 0,
      skippedOutOfScope: 1,
    });
    expect(repository.getSummary()).toEqual({
      sourceFiles: 1,
      records: 1,
      consumables: 1,
      parts: 0,
      originalRecords: 0,
      compatibleRecords: 1,
      equipment: 1,
      totalCostUsd: 120,
      firstMonth: '2026-08',
      lastMonth: '2026-08',
    });
    expect(repository.getAnalytics()).toEqual({
      monthly: [{
        key: '2026-08',
        label: '2026-08',
        records: 1,
        quantity: 2,
        costUsd: 120,
        originalRecords: 0,
        compatibleRecords: 1,
        equipment: 1,
      }],
      families: [{
        key: 'GPR53',
        label: 'GPR53',
        records: 1,
        quantity: 2,
        costUsd: 120,
        originalRecords: 0,
        compatibleRecords: 1,
        equipment: 1,
      }],
      categories: [{
        key: 'toner',
        label: 'toner',
        records: 1,
        quantity: 2,
        costUsd: 120,
        originalRecords: 0,
        compatibleRecords: 1,
        equipment: 1,
      }],
      contracts: [{
        key: expect.any(String),
        reference: 'OV-CONS-001',
        orderReference: 'ORD-CONS-001',
        contractCommercialArea: '',
        division: 'MRA',
        customerName: 'Cliente Consumibles',
        contractType: 'Mantenimiento',
        records: 1,
        quantity: 2,
        costUsd: 120,
        consumableCostUsd: 120,
        partCostUsd: 0,
        consumableRecords: 1,
        partRecords: 0,
        originalRecords: 0,
        compatibleRecords: 1,
        equipment: 1,
      }],
      topEquipment: [{
        key: expect.any(String),
        label: 'Cliente Consumibles · SER-CONS-001',
        records: 1,
        quantity: 2,
        costUsd: 120,
        originalRecords: 0,
        compatibleRecords: 1,
        equipment: 1,
        equipmentId: expect.any(String),
        customerName: 'Cliente Consumibles',
        modelLabel: 'iR ADV C3325i',
        serialNumber: 'SER-CONS-001',
      }],
      dispatchEquipment: [],
    });
    expect(repository.listRecords({ query: 'cliente consumibles' })).toEqual([
      expect.objectContaining({
        sourceType: 'consumibles',
        customerName: 'Cliente Consumibles',
        customerType: 'Publico',
        commercialArea: 'Strategic',
        contractReference: 'OV-CONS-001',
        orderReference: 'ORD-CONS-001',
        contractCommercialArea: '',
        division: 'MRA',
        partCode: 'CRG-T03',
        sourceCustomerName: 'Cliente histórico',
        sourceOrderReference: 'OV-FUENTE-001',
        sourceUnitPricePyg: 30000,
        sourceTotalPyg: 60000,
        sourceOperational: {
          dispatchNumber: '7001',
          technician: 'Tec Uno',
          serviceReportNumber: '9001',
          taskCompleted: 'Cambio de tóner',
          sourceSector: 'Privado',
          sourceCommercialArea: 'Commercial',
          sourceContractReference: 'REF-FUENTE-001',
        },
        sourceDetails: [{ label: 'Técnico', value: 'Tec Uno' }],
        sourceSheetName: 'Uso de repuestos',
        sourceRowNumber: 7,
      }),
    ]);
    expect(repository.listRecords({ query: 'tec uno', limit: 10 })).toHaveLength(1);
    expect(repository.listRecords({ query: '7001', limit: 10 })).toHaveLength(1);
  });

  it('replaces every previous batch for the selected source', () => {
    const database = makeTemporaryDatabase();
    const operations = new OperationsRepository(database);
    const customer = operations.saveCustomer({ name: 'Cliente Reemplazo Consumibles' });
    operations.saveContract({
      customerId: customer.id,
      reference: 'OV-REPLACE-CONS',
      contractType: 'Mantenimiento',
      equipment: [{ modelLabel: 'iR ADV C3325i', serialNumber: 'SER-REPLACE-CONS' }],
    });
    const imports = new ImportRepository(database);
    const repository = new ConsumablesRepository(database);
    const firstBatchId = imports.createBatch({ domain: 'consumibles', sourceName: 'consumos-1.xlsx', sourceType: 'consumibles' });
    const secondBatchId = imports.createBatch({ domain: 'consumibles', sourceName: 'consumos-2.xlsx', sourceType: 'consumibles' });
    repository.importRows(firstBatchId, 'consumos-1.xlsx', 'consumibles', [makeRow({ serialNumber: 'SER-REPLACE-CONS', recordedAt: '2026-08-01', month: '2026-08', partCode: 'OLD-1' })]);
    repository.importRows(secondBatchId, 'consumos-2.xlsx', 'consumibles', [makeRow({ serialNumber: 'SER-REPLACE-CONS', recordedAt: '2026-08-02', month: '2026-08', partCode: 'OLD-2' })]);

    const replacementBatchId = imports.createBatch({ domain: 'consumibles', sourceName: 'consumos-nuevo.xlsx', sourceType: 'consumibles' });
    expect(repository.importRows(
      replacementBatchId,
      'consumos-nuevo.xlsx',
      'consumibles',
      [makeRow({ serialNumber: 'SER-REPLACE-CONS', recordedAt: '2026-09-01', month: '2026-09', partCode: 'NEW-1' })],
      0,
      [firstBatchId, secondBatchId],
    )).toMatchObject({ accepted: 1, duplicates: 0 });
    expect(imports.getBatch(firstBatchId)).toBeUndefined();
    expect(imports.getBatch(secondBatchId)).toBeUndefined();
    expect(repository.listRecords({ limit: 10 }).map((record) => record.partCode)).toEqual(['NEW-1']);
  });

  it('stores dispatches separately from costed usage records', () => {
    const database = makeTemporaryDatabase();
    const operations = new OperationsRepository(database);
    const customer = operations.saveCustomer({ name: 'Cliente Salidas', customerType: 'Privado', commercialArea: 'Commercial' });
    operations.saveContract({
      customerId: customer.id,
      reference: 'OV-OUT-001',
      orderReference: 'ORD-OUT-001',
      contractType: 'Mantenimiento',
      division: 'MRA',
      equipment: [{ modelLabel: 'iR ADV C3325i', serialNumber: 'SER-OUT-001' }],
    });
    const imports = new ImportRepository(database);
    const batchId = imports.createBatch({ domain: 'consumibles', sourceName: 'salida.xlsx', sourceType: 'salida-consumibles' });
    const repository = new ConsumablesRepository(database);

    expect(repository.importOutputRows(batchId, 'salida.xlsx', 'salida-consumibles', [
      makeOutputRow({
        sourceUnitPricePyg: 45000,
        sourceTotalPyg: 90000,
        sourceOperational: {
          yieldPerUnit: '5000',
          observations: 'Entregar en recepción',
          contact: 'Ana · 0981',
          sourceSector: 'Privado',
          sourceCommercialArea: 'Commercial',
        },
        sourceDetails: [{ label: 'Observaciones', value: 'Entregar en recepción' }],
      }),
      makeOutputRow(),
      makeOutputRow({ serialNumber: 'SER-OUT-UNKNOWN', documentNumber: 1002 }),
    ])).toEqual({
      sourceType: 'salida-consumibles',
      accepted: 1,
      consumables: 1,
      parts: 0,
      duplicates: 1,
      skippedNoEquipment: 1,
      skippedContract: 0,
      skippedOutOfScope: 0,
    });
    expect(repository.getSummary().records).toBe(0);
    expect(repository.getOutputsSummary()).toEqual({
      sourceFiles: 1,
      records: 1,
      consumables: 1,
      parts: 0,
      equipment: 1,
      totalQuantity: 1,
      firstMonth: '2026-08',
      lastMonth: '2026-08',
    });
    expect(repository.listOutputs({ query: 'histórico', limit: 10 })).toEqual([
      expect.objectContaining({
        sourceType: 'salida-consumibles',
        documentNumber: 1001,
        sourceCustomerName: 'Cliente histórico',
        customerName: 'Cliente Salidas',
        customerType: 'Privado',
        commercialArea: 'Commercial',
        contractReference: 'OV-OUT-001',
        orderReference: 'ORD-OUT-001',
        division: 'MRA',
        yieldPages: 12000,
        sourceUnitPricePyg: 45000,
        sourceTotalPyg: 90000,
        sourceOperational: {
          yieldPerUnit: '5000',
          observations: 'Entregar en recepción',
          contact: 'Ana · 0981',
          sourceSector: 'Privado',
          sourceCommercialArea: 'Commercial',
        },
        sourceDetails: [{ label: 'Observaciones', value: 'Entregar en recepción' }],
        sourceSheetName: '',
        sourceRowNumber: 0,
      }),
    ]);
    expect(repository.listOutputs({ query: 'entregar en recepción', limit: 10 })).toHaveLength(1);
    expect(repository.listOutputs({ query: '5000', limit: 10 })).toHaveLength(1);
    expect(repository.getAnalytics().dispatchEquipment).toEqual([{
      key: expect.any(String),
      equipmentId: expect.any(String),
      customerName: 'Cliente Salidas',
      modelLabel: 'iR ADV C3325i',
      serialNumber: 'SER-OUT-001',
      contractReference: 'OV-OUT-001',
      orderReference: 'ORD-OUT-001',
      contractCommercialArea: '',
      division: 'MRA',
      contractType: 'Mantenimiento',
      records: 1,
      consumableRecords: 1,
      partRecords: 0,
      consumableQuantity: 1,
      partQuantity: 0,
      originalRecords: 0,
      compatibleRecords: 1,
      lastRecordedAt: '2026-08-05',
    }]);
  });

  it('applies the legacy sector, department, contract and period filters to every aggregate', () => {
    const database = makeTemporaryDatabase();
    const operations = new OperationsRepository(database);
    const publicCustomer = operations.saveCustomer({ name: 'Cliente Público', customerType: 'Publico', commercialArea: 'Strategic' });
    const privateCustomer = operations.saveCustomer({ name: 'Cliente Privado', customerType: 'Privado', commercialArea: 'Commercial' });
    operations.saveContract({
      customerId: publicCustomer.id,
      reference: 'OV-PUBLICO',
      contractType: 'Mantenimiento',
      equipment: [{ modelLabel: 'iR ADV C3325i', serialNumber: 'SER-PUBLICO' }],
    });
    operations.saveContract({
      customerId: privateCustomer.id,
      reference: 'OV-PRIVADO',
      contractType: 'Leasing',
      equipment: [{ modelLabel: 'iR ADV C3325i', serialNumber: 'SER-PRIVADO' }],
    });
    const imports = new ImportRepository(database);
    const publicBatchId = imports.createBatch({ domain: 'consumibles', sourceName: 'publico.xlsx' });
    const privateBatchId = imports.createBatch({ domain: 'consumibles', sourceName: 'privado.xlsx' });
    const repository = new ConsumablesRepository(database);
    repository.importRows(publicBatchId, 'publico.xlsx', 'consumibles', [makeRow({ serialNumber: 'SER-PUBLICO', recordedAt: '2026-05-01', month: '2026-05' })]);
    repository.importRows(privateBatchId, 'privado.xlsx', 'consumibles', [makeRow({ serialNumber: 'SER-PRIVADO', recordedAt: '2026-08-01', month: '2026-08' })]);

    expect(repository.getSummary({ sector: 'Publico' }).records).toBe(1);
    expect(repository.getSummary({ department: 'Commercial', contractType: 'Leasing', dateFrom: '2026-08', dateTo: '2026-08' }).records).toBe(1);
    expect(repository.listRecords({ sector: 'Privado', dateTo: '2026-07', limit: 10 })).toHaveLength(0);
    expect(repository.getAnalytics({ sector: 'Publico' }).contracts.map((row) => row.reference)).toEqual(['OV-PUBLICO']);
  });

  it('backfills source metadata without changing normalized usage or dispatch values', () => {
    const database = makeTemporaryDatabase();
    const operations = new OperationsRepository(database);
    const customer = operations.saveCustomer({ name: 'Cliente Reindexado' });
    operations.saveContract({
      customerId: customer.id,
      reference: 'OV-REINDEX',
      contractType: 'Mantenimiento',
      equipment: [
        { modelLabel: 'iR ADV C3325i', serialNumber: 'SER-REINDEX-USAGE' },
        { modelLabel: 'iR ADV C3325i', serialNumber: 'SER-REINDEX-OUTPUT' },
      ],
    });
    const imports = new ImportRepository(database);
    const repository = new ConsumablesRepository(database);
    const usageBatchId = imports.createBatch({ domain: 'consumibles', sourceName: 'Detalles de consumibles.xlsx' });
    const usageRow = makeRow({
      serialNumber: 'SER-REINDEX-USAGE',
      sourceDetails: undefined,
      sourceSheetName: undefined,
      sourceRowNumber: undefined,
    });
    repository.importRows(usageBatchId, 'Detalles de consumibles.xlsx', 'consumibles', [usageRow]);

    expect(repository.backfillSourceMetadata(usageBatchId, [{
      ...usageRow,
      sourceDetails: [{ label: 'División', value: 'MRA' }],
      sourceSheetName: 'Histórico',
      sourceRowNumber: 12,
    }])).toBe(1);
    expect(repository.backfillSourceMetadata(usageBatchId, [{
      ...usageRow,
      sourceDetails: [{ label: 'Otra', value: 'No reemplazar' }],
      sourceSheetName: 'Otra hoja',
      sourceRowNumber: 99,
    }])).toBe(0);
    expect(repository.listRecords({ query: 'SER-REINDEX-USAGE', limit: 10 })).toEqual([
      expect.objectContaining({
        quantity: 2,
        costUsd: 120,
        sourceDetails: [{ label: 'División', value: 'MRA' }],
        sourceSheetName: 'Histórico',
        sourceRowNumber: 12,
      }),
    ]);

    const outputBatchId = imports.createBatch({ domain: 'consumibles', sourceName: 'Salida de consumibles.xlsx' });
    const outputRow = makeOutputRow({
      serialNumber: 'SER-REINDEX-OUTPUT',
      sourceDetails: undefined,
      sourceSheetName: undefined,
      sourceRowNumber: undefined,
    });
    repository.importOutputRows(outputBatchId, 'Salida de consumibles.xlsx', 'salida-consumibles', [outputRow]);
    expect(repository.backfillOutputSourceMetadata(outputBatchId, [{
      ...outputRow,
      sourceDetails: [{ label: 'Técnico', value: 'Tec Dos' }],
      sourceSheetName: 'Salidas',
      sourceRowNumber: 8,
    }])).toBe(1);
    expect(repository.listOutputs({ query: 'SER-REINDEX-OUTPUT', limit: 10 })).toEqual([
      expect.objectContaining({
        quantity: 1,
        yieldPages: 12000,
        sourceDetails: [{ label: 'Técnico', value: 'Tec Dos' }],
        sourceSheetName: 'Salidas',
        sourceRowNumber: 8,
      }),
    ]);
  });
});
