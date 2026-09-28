import Database from 'better-sqlite3';
import fs from 'node:fs';
import os from 'node:os';
import path from 'node:path';
import { afterEach, describe, expect, it } from 'vitest';
import { openDatabase } from '../../db/database';
import { ImportRepository } from '../../db/repositories';
import { calculateMpsProjection, MpsRepository, readLegacyMpsDatabase } from './repository';

const temporaryDirectories: string[] = [];
const databases: Database.Database[] = [];

function makeTemporaryDirectory(prefix: string): string {
  const directory = fs.mkdtempSync(path.join(os.tmpdir(), prefix));
  temporaryDirectories.push(directory);
  return directory;
}

afterEach(() => {
  for (const database of databases.splice(0)) database.close();
  for (const directory of temporaryDirectories.splice(0)) {
    fs.rmSync(directory, { recursive: true, force: true });
  }
});

describe('MpsRepository', () => {
  it('reads a legacy SQLite database, links shared models and calculates projections', () => {
    const legacyDirectory = makeTemporaryDirectory('datasystems-suite-mps-legacy-');
    const legacy = new Database(path.join(legacyDirectory, 'canon_mps.db'));
    databases.push(legacy);
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
        color TEXT
      );
    `);
    legacy.prepare('INSERT INTO multifuncionales VALUES (?, ?, ?, ?, ?, ?, ?, ?)').run(
      'legacy-model-1', 'Canon', 'imageRUNNER 1643i', 45, 0, 1500, 20000, 1,
    );
    legacy.prepare('INSERT INTO consumibles VALUES (?, ?, ?, ?, ?, ?)').run(
      'legacy-consumable-1', 'legacy-model-1', 'Tóner Negro T06', 'toner', 20500, 'black',
    );
    const bytes = legacy.serialize();
    legacy.close();
    databases.splice(databases.indexOf(legacy), 1);

    const parsed = readLegacyMpsDatabase(bytes);
    expect(parsed.models).toHaveLength(1);
    expect(parsed.models[0].consumables[0]).toMatchObject({ name: 'Tóner Negro T06', sku: '' });

    const suiteDirectory = makeTemporaryDirectory('datasystems-suite-mps-suite-');
    const suite = openDatabase(path.join(suiteDirectory, 'datasystems.sqlite'));
    databases.push(suite);
    const imports = new ImportRepository(suite);
    const batchId = imports.createBatch({ domain: 'mps', sourceName: 'canon_mps.db' });
    const sourceFileId = imports.addFile({
      batchId,
      fileName: 'canon_mps.db',
      storedPath: `imports/${batchId}/canon_mps.db`,
      contentHash: 'hash-mps',
      contentType: 'application/vnd.sqlite3',
      sizeBytes: 128,
    });
    const repository = new MpsRepository(suite);

    expect(repository.importLegacyDatabase(batchId, parsed)).toEqual({
      models: 1,
      consumables: 1,
      linkedEquipmentModels: 1,
    });
    expect(repository.getCurrentSummary()).toMatchObject({
      models: 1,
      consumables: 1,
      linkedEquipmentModels: 1,
      batchId,
      sourceFileId,
      sourceName: 'canon_mps.db',
    });

    const models = repository.listModels();
    expect(models).toEqual([
      expect.objectContaining({
        modelLabel: 'imageRUNNER 1643i',
        modelId: expect.any(String),
        consumables: [expect.objectContaining({ yieldPages: 20500 })],
      }),
    ]);
    expect(calculateMpsProjection(models[0], 5000, 2)).toEqual([
      expect.objectContaining({
        years: [
          expect.objectContaining({ year: 1, replacements: expect.closeTo(2.926829, 0.000001), units: 3 }),
          expect.objectContaining({ year: 2, replacements: expect.closeTo(5.853658, 0.000001), units: 6 }),
        ],
      }),
    ]);
  });

  it('keeps imported profiles immutable while supporting manual CRUD and cloning', () => {
    const suiteDirectory = makeTemporaryDirectory('datasystems-suite-mps-manual-');
    const suite = openDatabase(path.join(suiteDirectory, 'datasystems.sqlite'));
    databases.push(suite);
    const imports = new ImportRepository(suite);
    const repository = new MpsRepository(suite);
    const importedBatchId = imports.createBatch({ domain: 'mps', sourceName: 'canon_mps.db' });

    repository.importLegacyDatabase(importedBatchId, {
      models: [{
        id: 'imported-model',
        brand: 'Canon',
        model: 'imageRUNNER 1643i',
        speedPpm: 45,
        isColor: false,
        recVolumeMin: 1500,
        recVolumeMax: 20000,
        isCustom: true,
        consumables: [{ id: 'imported-consumable', name: 'Tóner T06', type: 'toner', yieldPages: 20500, color: 'black', sku: '3526C001AA' }],
      }],
    });

    const created = repository.saveCustomModel({
      brand: 'Canon',
      model: 'imageRUNNER C5535i',
      speedPpm: 35,
      isColor: true,
      recVolumeMin: 2000,
      recVolumeMax: 30000,
      consumables: [{ name: 'Tóner negro', type: 'toner', yieldPages: 18000, color: 'black', sku: '5535-BLK' }],
    });
    expect(created).toMatchObject({ modelLabel: 'imageRUNNER C5535i', isCustom: true, isEditable: true });

    const updated = repository.saveCustomModel({
      id: created.id,
      brand: 'Canon',
      model: 'imageRUNNER C5535i',
      speedPpm: 40,
      isColor: true,
      recVolumeMin: 2500,
      recVolumeMax: 35000,
      consumables: [
        { name: 'Tóner negro', type: 'toner', yieldPages: 20000, color: 'black', sku: '5535-BLK-2' },
        { name: 'Tambor color', type: 'drum', yieldPages: 100000, color: 'other', sku: '5535-DRM' },
      ],
    });
    expect(updated).toMatchObject({ speedPpm: 40, recVolumeMin: 2500, consumables: expect.arrayContaining([expect.objectContaining({ sku: '5535-DRM' })]) });

    const clone = repository.saveCustomModel({
      brand: updated.brand,
      model: 'imageRUNNER C5535i Plus',
      speedPpm: updated.speedPpm,
      isColor: updated.isColor,
      recVolumeMin: updated.recVolumeMin,
      recVolumeMax: updated.recVolumeMax,
      consumables: updated.consumables,
    });
    expect(clone.id).not.toBe(updated.id);
    expect(repository.listModels()).toHaveLength(3);

    const imported = repository.listModels().find((model) => model.modelLabel === 'imageRUNNER 1643i');
    expect(imported).toMatchObject({ isEditable: false });
    expect(() => repository.deleteCustomModel(imported?.id ?? '')).toThrow('permanece intacto');
    expect(repository.deleteCustomModel(clone.id)).toBe(true);
    expect(repository.listModels()).toHaveLength(2);

    const reimportedBatchId = imports.createBatch({ domain: 'mps', sourceName: 'canon_mps-v2.db' });
    repository.importLegacyDatabase(reimportedBatchId, {
      models: [{
        id: 'imported-model-v2',
        brand: 'Canon',
        model: 'imageRUNNER 1643i',
        speedPpm: 45,
        isColor: false,
        recVolumeMin: 1500,
        recVolumeMax: 20000,
        isCustom: false,
        consumables: [{ id: 'imported-consumable-v2', name: 'Tóner T06', type: 'toner', yieldPages: 20500, color: 'black', sku: '3526C001AA' }],
      }],
    });
    expect(repository.listModels().map((model) => model.modelLabel)).toEqual(['imageRUNNER 1643i', 'imageRUNNER C5535i']);
    expect(repository.listModels().find((model) => model.modelLabel === 'imageRUNNER C5535i')).toMatchObject({ isEditable: true, speedPpm: 40 });
  });
});
