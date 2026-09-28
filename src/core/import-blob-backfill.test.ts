import fs from 'node:fs';
import os from 'node:os';
import path from 'node:path';
import { createHash } from 'node:crypto';
import { afterEach, describe, expect, it } from 'vitest';
import { openDatabase } from '../db/database';
import { ImportRepository } from '../db/repositories';
import { storeImportFile } from './import-storage';
import { backfillImportFileBlobs, getImportOriginalsStatus } from './import-blob-backfill';

const temporaryDirectories: string[] = [];
const openDatabases: Array<ReturnType<typeof openDatabase>> = [];

afterEach(() => {
  for (const database of openDatabases.splice(0)) {
    if (database.open) database.close();
  }
  for (const directory of temporaryDirectories.splice(0)) {
    fs.rmSync(directory, { recursive: true, force: true });
  }
});

describe('backfillImportFileBlobs', () => {
  it('verifies and resumes legacy file backfill without removing external copies', async () => {
    const dataDirectory = fs.mkdtempSync(path.join(os.tmpdir(), 'datasystems-suite-originals-'));
    temporaryDirectories.push(dataDirectory);
    const database = openDatabase(path.join(dataDirectory, 'datasystems.sqlite'));
    openDatabases.push(database);
    const imports = new ImportRepository(database);
    const batchId = imports.createBatch({ domain: 'catalog', sourceName: 'legacy.xlsx' });
    const saved = storeImportFile(dataDirectory, batchId, 'catalogo.xlsx', new TextEncoder().encode('archivo catalogo'));
    const readyFileId = imports.addFile({
      batchId,
      fileName: 'catalogo.xlsx',
      storedPath: saved.storedPath,
      contentHash: saved.contentHash,
      sizeBytes: saved.sizeBytes,
    });
    const missingContents = new TextEncoder().encode('original pendiente');
    const missingPath = 'imports/legacy/original-pendiente.xlsx';
    imports.addFile({
      batchId,
      fileName: 'original-pendiente.xlsx',
      storedPath: missingPath,
      contentHash: createHash('sha256').update(missingContents).digest('hex'),
      sizeBytes: missingContents.byteLength,
    });

    const firstRun = await backfillImportFileBlobs(dataDirectory, imports);
    expect(firstRun).toMatchObject({ total: 2, embedded: 1, failed: 1 });
    expect(imports.getFileContentStatus()).toMatchObject({ totalFiles: 2, embeddedFiles: 1, missingFiles: 1 });
    expect(imports.getFileContent(readyFileId)).toEqual(new TextEncoder().encode('archivo catalogo'));
    expect(fs.existsSync(path.join(dataDirectory, saved.storedPath))).toBe(true);

    const missingAbsolutePath = path.join(dataDirectory, missingPath);
    fs.mkdirSync(path.dirname(missingAbsolutePath), { recursive: true });
    fs.writeFileSync(missingAbsolutePath, missingContents);
    const resumedRun = await backfillImportFileBlobs(dataDirectory, imports);

    expect(resumedRun).toMatchObject({ total: 1, embedded: 1, failed: 0 });
    expect(imports.getFileContentStatus()).toMatchObject({ totalFiles: 2, embeddedFiles: 2, missingFiles: 0 });
    expect(fs.readFileSync(path.join(dataDirectory, saved.storedPath), 'utf8')).toBe('archivo catalogo');
    database.close();
    openDatabases.splice(openDatabases.indexOf(database), 1);
  });

  it('backfills a retained original after its import batch was removed', async () => {
    const dataDirectory = fs.mkdtempSync(path.join(os.tmpdir(), 'datasystems-suite-archived-original-'));
    temporaryDirectories.push(dataDirectory);
    const database = openDatabase(path.join(dataDirectory, 'datasystems.sqlite'));
    openDatabases.push(database);
    const imports = new ImportRepository(database);
    const batchId = imports.createBatch({ domain: 'catalog', sourceName: 'legacy.xlsx' });
    const original = new TextEncoder().encode('original archivado en disco');
    const stored = storeImportFile(dataDirectory, batchId, 'catalogo.xlsx', original);
    const fileId = imports.addFile({
      batchId,
      fileName: 'catalogo.xlsx',
      storedPath: stored.storedPath,
      contentHash: stored.contentHash,
      sizeBytes: stored.sizeBytes,
    });
    imports.removeBatch(batchId);

    const result = await backfillImportFileBlobs(dataDirectory, imports);

    expect(result).toEqual({ total: 1, embedded: 1, failed: 0, errors: [] });
    expect(imports.getFileContent(fileId)).toEqual(original);
    expect(imports.getFileContentStatus()).toMatchObject({ totalFiles: 1, embeddedFiles: 1, missingFiles: 0 });
    database.close();
    openDatabases.splice(openDatabases.indexOf(database), 1);
  });

  it('discovers and adopts old removed-folder files idempotently', async () => {
    const dataDirectory = fs.mkdtempSync(path.join(os.tmpdir(), 'datasystems-suite-old-archive-'));
    temporaryDirectories.push(dataDirectory);
    const database = openDatabase(path.join(dataDirectory, 'datasystems.sqlite'));
    openDatabases.push(database);
    const imports = new ImportRepository(database);
    const sourceBatchId = 'batch-from-previous-version';
    const original = new TextEncoder().encode('original retirado antes de la migración');
    const contentHash = createHash('sha256').update(original).digest('hex');
    const fileName = `001-${contentHash.slice(0, 16)}-catalogo.xlsx`;
    const storedPath = path.posix.join('imports', '.removed', sourceBatchId, fileName);
    const absolutePath = path.join(dataDirectory, storedPath);
    fs.mkdirSync(path.dirname(absolutePath), { recursive: true });
    fs.writeFileSync(absolutePath, original);

    expect(getImportOriginalsStatus(dataDirectory, imports)).toMatchObject({
      totalFiles: 1,
      embeddedFiles: 0,
      missingFiles: 1,
      totalBytes: original.byteLength,
    });

    const firstRun = await backfillImportFileBlobs(dataDirectory, imports);
    expect(firstRun).toEqual({ total: 1, embedded: 1, failed: 0, errors: [] });
    const archived = database.prepare('SELECT id, content_blob FROM archived_import_files').get() as { id: string; content_blob: Buffer };
    expect(archived.id).toMatch(/^removed-/);
    expect(new Uint8Array(archived.content_blob)).toEqual(original);
    expect(getImportOriginalsStatus(dataDirectory, imports)).toMatchObject({ missingFiles: 0, embeddedFiles: 1 });

    const secondRun = await backfillImportFileBlobs(dataDirectory, imports);
    expect(secondRun).toEqual({ total: 0, embedded: 0, failed: 0, errors: [] });
    expect(fs.readFileSync(absolutePath)).toEqual(Buffer.from(original));
    database.close();
    openDatabases.splice(openDatabases.indexOf(database), 1);
  });
});
