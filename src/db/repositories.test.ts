import fs from 'node:fs';
import os from 'node:os';
import path from 'node:path';
import { afterEach, describe, expect, it } from 'vitest';
import { openDatabase } from './database';
import { ImportRepository, SettingsRepository } from './repositories';

const temporaryDirectories: string[] = [];

function makeDatabase() {
  const directory = fs.mkdtempSync(path.join(os.tmpdir(), 'datasystems-suite-repository-'));
  temporaryDirectories.push(directory);
  return openDatabase(path.join(directory, 'suite.sqlite'));
}

afterEach(() => {
  for (const directory of temporaryDirectories.splice(0)) {
    fs.rmSync(directory, { recursive: true, force: true });
  }
});

describe('SettingsRepository', () => {
  it('persists typed JSON values by module namespace', () => {
    const database = makeDatabase();
    const settings = new SettingsRepository(database);

    expect(settings.get('catalog', 'exchangeRate', 6350)).toBe(6350);
    settings.set('catalog', 'exchangeRate', 7125);
    settings.set('catalog', 'filters', { stockOnly: true, brand: 'Canon' });

    expect(settings.get('catalog', 'exchangeRate', 0)).toBe(7125);
    expect(settings.get('catalog', 'filters', null)).toEqual({ stockOnly: true, brand: 'Canon' });
    expect(settings.get('other-module', 'filters', { stockOnly: false })).toEqual({ stockOnly: false });
    database.close();
  });
});

describe('ImportRepository', () => {
  it('stores source bytes in SQLite and reports completeness without selecting BLOBs in file listings', () => {
    const database = makeDatabase();
    const imports = new ImportRepository(database);
    const batchId = imports.createBatch({ domain: 'catalog', sourceName: 'catalogo.xlsx' });
    const contents = new TextEncoder().encode('contenido original');
    const fileId = imports.addFile({
      batchId,
      fileName: 'catalogo.xlsx',
      storedPath: 'imports/catalog/catalogo.xlsx',
      contentHash: 'hash-catalogo',
      sizeBytes: contents.byteLength,
      contentBlob: contents,
    });

    expect(imports.getFileContent(fileId)).toEqual(contents);
    expect(imports.listFiles(batchId)).toEqual([
      expect.objectContaining({ id: fileId, fileName: 'catalogo.xlsx' }),
    ]);
    expect(imports.listFiles(batchId)[0]).not.toHaveProperty('contentBlob');
    expect(imports.getFileContentStatus()).toEqual({
      totalFiles: 1,
      embeddedFiles: 1,
      missingFiles: 0,
      totalBytes: contents.byteLength,
      embeddedBytes: contents.byteLength,
    });
    expect(imports.listFilesMissingContent()).toEqual([]);
    database.close();
  });

  it('keeps a batch and its source files in the shared database', () => {
    const database = makeDatabase();
    const imports = new ImportRepository(database);
    const batchId = imports.createBatch({ domain: 'catalog', sourceName: 'catalogo.xlsx', sourceType: 'catalogo' });

    imports.addFile({
      id: 'file-1',
      batchId,
      fileName: 'catalogo.xlsx',
      storedPath: 'imports/catalog/file-1.xlsx',
      contentHash: 'abc123',
      contentType: 'application/vnd.openxmlformats-officedocument.spreadsheetml.sheet',
      sizeBytes: 128,
    });
    imports.markApplied(batchId);

    expect(imports.getBatch(batchId)).toMatchObject({
      id: batchId,
      domain: 'catalog',
      sourceName: 'catalogo.xlsx',
      sourceType: 'catalogo',
      status: 'applied',
    });
    expect(imports.listFiles(batchId)).toEqual([
      expect.objectContaining({ id: 'file-1', fileName: 'catalogo.xlsx', sizeBytes: 128 }),
    ]);
    database.close();
  });

  it('removes only the selected batch and returns its file metadata', () => {
    const database = makeDatabase();
    const imports = new ImportRepository(database);
    const batchId = imports.createBatch({ domain: 'consumibles', sourceName: 'detalle.xlsx', sourceType: 'consumibles' });
    imports.addFile({
      batchId,
      fileName: 'detalle.xlsx',
      storedPath: 'imports/batch/detalle.xlsx',
      contentHash: 'hash-detalle',
      sizeBytes: 12,
    });
    imports.markApplied(batchId);

    expect(imports.removeBatch(batchId)).toEqual({
      batch: expect.objectContaining({ id: batchId, sourceType: 'consumibles', status: 'applied' }),
      files: [expect.objectContaining({ fileName: 'detalle.xlsx', storedPath: 'imports/batch/detalle.xlsx' })],
    });
    expect(imports.getBatch(batchId)).toBeUndefined();
    expect(database.prepare('SELECT COUNT(*) AS count FROM archived_import_files').get()).toEqual({ count: 1 });
    expect(imports.removeBatch(batchId)).toBeUndefined();
    database.close();
  });

  it('retains the original BLOB when a batch is removed', () => {
    const database = makeDatabase();
    const imports = new ImportRepository(database);
    const batchId = imports.createBatch({ domain: 'catalog', sourceName: 'catalogo.xlsx' });
    const contents = new TextEncoder().encode('archivo retirado');
    const fileId = imports.addFile({
      batchId,
      fileName: 'catalogo.xlsx',
      storedPath: 'imports/catalogo.xlsx',
      contentHash: 'hash-original',
      sizeBytes: contents.byteLength,
      contentBlob: contents,
    });

    imports.removeBatch(batchId);

    expect(imports.getFileContent(fileId)).toEqual(contents);
    expect(imports.getFileContentStatus()).toMatchObject({
      totalFiles: 1,
      embeddedFiles: 1,
      missingFiles: 0,
      totalBytes: contents.byteLength,
    });
    database.close();
  });

  it('can backfill an archived source after its batch row has been removed', () => {
    const database = makeDatabase();
    const imports = new ImportRepository(database);
    const batchId = imports.createBatch({ domain: 'catalog', sourceName: 'catalogo.xlsx' });
    const fileId = imports.addFile({
      batchId,
      fileName: 'catalogo.xlsx',
      storedPath: 'imports/catalogo.xlsx',
      contentHash: 'hash-pendiente',
      sizeBytes: 8,
    });
    imports.removeBatch(batchId);

    expect(imports.listFilesMissingContent()).toEqual([
      expect.objectContaining({ id: fileId, fileName: 'catalogo.xlsx' }),
    ]);
    expect(imports.storeFileContent(fileId, new TextEncoder().encode('contenido'))).toBe(true);
    expect(imports.getFileContent(fileId)).toEqual(new TextEncoder().encode('contenido'));
    expect(imports.getFileContentStatus()).toMatchObject({ embeddedFiles: 1, missingFiles: 0 });
    database.close();
  });

  it('clears imported batches without removing manual batches', () => {
    const database = makeDatabase();
    const imports = new ImportRepository(database);
    const importedBatchId = imports.createBatch({ domain: 'operations', sourceName: 'cartera.xlsx' });
    const manualBatchId = imports.createBatch({ domain: 'mps-manual', sourceName: 'Modelos MPS manuales', sourceType: 'manual' });

    imports.markApplied(importedBatchId);
    imports.markApplied(manualBatchId);
    imports.clearImportedBatches([importedBatchId]);

    expect(imports.getBatch(importedBatchId)).toBeUndefined();
    expect(imports.getBatch(manualBatchId)).toMatchObject({
      id: manualBatchId,
      domain: 'mps-manual',
      sourceType: 'manual',
    });
    database.close();
  });
});
