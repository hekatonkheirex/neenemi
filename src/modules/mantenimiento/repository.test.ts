import fs from 'node:fs';
import os from 'node:os';
import path from 'node:path';
import { afterEach, describe, expect, it } from 'vitest';
import { openDatabase } from '../../db/database';
import { ImportRepository } from '../../db/repositories';
import { MaintenanceRepository } from './repository';

const temporaryDirectories: string[] = [];

function makeDatabase() {
  const directory = fs.mkdtempSync(path.join(os.tmpdir(), 'datasystems-suite-maintenance-'));
  temporaryDirectories.push(directory);
  return openDatabase(path.join(directory, 'suite.sqlite'));
}

afterEach(() => {
  for (const directory of temporaryDirectories.splice(0)) {
    fs.rmSync(directory, { recursive: true, force: true });
  }
});

describe('MaintenanceRepository', () => {
  it('imports a legacy JSON shape into shared customers, contracts, equipment and records', () => {
    const database = makeDatabase();
    const imports = new ImportRepository(database);
    const maintenance = new MaintenanceRepository(database);
    const batchId = imports.createBatch({ domain: 'maintenance', sourceName: 'database_sqlite.json', sourceHash: 'hash-1' });
    const sourceFileId = imports.addFile({
      batchId,
      fileName: 'database_sqlite.json',
      storedPath: `imports/${batchId}/database_sqlite.json`,
      contentHash: 'hash-file-1',
      contentType: 'application/json',
      sizeBytes: 256,
    });

    const result = maintenance.importLegacyDatabase(batchId, {
      models: [{ name: 'Canon iR1643', usefulLife: 500_000, optimalBase: 13_000, maxWaste: 0.7 }],
      records: [
        {
          customerName: 'Cliente de prueba',
          contractReference: 'OV-001',
          modelLabel: 'FOTOCOPIADORA CANON IR1643IF II',
          serialNumber: 'SER-001',
          period: '2026-06',
          paperType: 'Negro A4',
          copies: 1_200,
          counter: 10_500,
          sourceSheetName: 'Contadores',
          sourceRowNumber: 8,
          sourceDetails: [{ label: 'División', value: 'MRA' }],
        },
        {
          customerName: 'Cliente de prueba',
          contractReference: 'OV-001',
          modelLabel: 'FOTOCOPIADORA CANON IR1643IF II',
          serialNumber: 'SER-001',
          period: '2026-07',
          paperType: 'Negro A4',
          copies: 1_400,
          counter: 12_000,
        },
      ],
    });

    expect(result).toEqual({
      models: 1,
      records: 2,
      customers: 1,
      contracts: 1,
      equipment: 1,
      matchedRecords: 2,
      unmatchedRecords: 0,
    });
    expect(maintenance.getCurrentSummary()).toMatchObject({
      batchId,
      sourceFileId,
      sourceName: 'database_sqlite.json',
      models: 1,
      records: 2,
      customers: 1,
      contracts: 1,
      equipment: 1,
      matchedRecords: 2,
      unmatchedRecords: 0,
      analyzedEquipment: 1,
    });
    expect(maintenance.listCurrentAnalyses()).toEqual([
      expect.objectContaining({
        serialNumber: 'SER-001',
        customerName: 'Cliente de prueba',
        matchedModelLabel: 'Canon iR1643',
        periods: expect.arrayContaining([expect.objectContaining({
          period: '2026-06',
          sourceSheetName: 'Contadores',
          sourceRowNumber: 8,
          sourceDetails: [{ label: 'División', value: 'MRA' }],
        })]),
      }),
    ]);
    expect(maintenance.listCurrentAnalyses('mra')).toHaveLength(1);
    expect(maintenance.listCurrentAnalyses('negro a4')).toHaveLength(1);
    expect(database.prepare('SELECT status FROM import_batches WHERE id = ?').get(batchId)).toEqual({ status: 'applied' });

    database.close();
  });

  it('edits, adds and removes active model rules while relinking records', () => {
    const database = makeDatabase();
    const imports = new ImportRepository(database);
    const maintenance = new MaintenanceRepository(database);
    const batchId = imports.createBatch({ domain: 'maintenance', sourceName: 'database_sqlite.json', sourceHash: 'hash-rules' });

    maintenance.importLegacyDatabase(batchId, {
      models: [{ name: 'Canon iR1643', usefulLife: 500_000, optimalBase: 13_000, maxWaste: 0.7 }],
      records: [{
        customerName: 'Cliente',
        contractReference: 'OV-1',
        modelLabel: 'Canon iR1643',
        serialNumber: 'SER-1',
        period: '2026-08',
        paperType: 'Negro A4',
        copies: 500,
        counter: 1_000,
      }],
    });

    const original = maintenance.listCurrentRules()[0];
    if (!original) throw new Error('La regla importada no fue creada.');
    const updated = maintenance.saveCurrentRule({
      id: original.id,
      modelLabel: original.modelLabel,
      usefulLife: 600_000,
      optimalBase: 14_000,
      maxWaste: 0.65,
    });
    expect(updated).toMatchObject({ usefulLife: 600_000, optimalBase: 14_000, maxWaste: 0.65 });

    const added = maintenance.saveCurrentRule({
      modelLabel: 'Canon modelo de prueba',
      usefulLife: 100_000,
      optimalBase: 2_000,
      maxWaste: 0.5,
    });
    expect(maintenance.listCurrentRules()).toHaveLength(2);
    expect(maintenance.deleteCurrentRule(added.id)).toBe(true);
    expect(maintenance.listCurrentRules()).toHaveLength(1);
    expect(maintenance.getCurrentSummary()).toMatchObject({ matchedRecords: 1, unmatchedRecords: 0 });

    database.close();
  });

  it('removes imported counter batches while preserving the shared portfolio', () => {
    const database = makeDatabase();
    const imports = new ImportRepository(database);
    const maintenance = new MaintenanceRepository(database);
    const batchId = imports.createBatch({ domain: 'maintenance', sourceName: 'Contadores.csv', sourceHash: 'hash-clear' });

    maintenance.importLegacyDatabase(batchId, {
      models: [{ name: 'Canon iR1643', usefulLife: 500_000, optimalBase: 13_000, maxWaste: 0.7 }],
      records: [{
        customerName: 'Cliente que permanece',
        contractReference: 'OV-CLEAR',
        modelLabel: 'Canon iR1643',
        serialNumber: 'SER-CLEAR',
        period: '2026-08',
        paperType: 'Negro A4',
        copies: 500,
        counter: 1_000,
      }],
    });

    expect(maintenance.removeImportedBatches([batchId])).toBe(1);
    expect(imports.getBatch(batchId)).toBeUndefined();
    expect(maintenance.getCurrentSummary()).toMatchObject({ batchId: null, records: 0, models: 0 });
    expect(maintenance.listCurrentRules()).toEqual([]);
    expect(database.prepare('SELECT COUNT(*) AS count FROM maintenance_counter_records').get()).toEqual({ count: 0 });
    expect(database.prepare('SELECT COUNT(*) AS count FROM maintenance_model_rules').get()).toEqual({ count: 0 });
    expect(database.prepare('SELECT COUNT(*) AS count FROM customers WHERE name = ?').get('Cliente que permanece')).toEqual({ count: 1 });

    database.close();
  });
});
