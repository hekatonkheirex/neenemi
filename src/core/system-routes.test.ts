import fs from 'node:fs';
import path from 'node:path';
import { createHash } from 'node:crypto';
import Database from 'better-sqlite3';
import { describe, expect, it } from 'vitest';
import { createServer } from '../../server';
import { ImportRepository, SettingsRepository } from '../db/repositories';
import { storeImportFile } from './import-storage';
import { openDatabase } from '../db/database';
import { makeTemporaryDataDirectory, resolveImportJob } from '../test-support/api-helpers';

describe('system API', () => {
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
    const settings = new SettingsRepository(database);
    settings.set('ai', 'gemini_api_key', 'secret-key');
    settings.set('keep', 'value', 'ok');
    const server = app.listen(0, '127.0.0.1');

    try {
      await new Promise<void>((resolve) => server.once('listening', () => resolve()));
      const address = server.address();
      const port = typeof address === 'object' && address ? address.port : 0;
      expect((await fetch(`http://127.0.0.1:${port}/api/settings/ai/gemini_api_key`)).status).toBe(403);
      const response = await fetch(`http://127.0.0.1:${port}/api/system/backup`);
      const backup = Buffer.from(await response.arrayBuffer());

      expect(response.status).toBe(200);
      expect(response.headers.get('content-type')).toContain('application/vnd.sqlite3');
      expect(response.headers.get('content-disposition')).toMatch(/dcss-suite-backup-.*\.sqlite/);
      expect(backup.subarray(0, 16).toString()).toBe('SQLite format 3\u0000');

      const downloadedPath = path.join(dataDirectory, 'downloaded-backup-test.sqlite');
      fs.writeFileSync(downloadedPath, backup);
      const downloadedDatabase = new Database(downloadedPath, { readonly: true, fileMustExist: true });
      try {
        const saved = downloadedDatabase.prepare('SELECT content_blob FROM import_files WHERE file_name = ?').get('catalogo.xlsx') as { content_blob: Buffer };
        expect(new Uint8Array(saved.content_blob)).toEqual(original);
        const archived = downloadedDatabase.prepare('SELECT content_blob FROM archived_import_files WHERE id = ?').get(removedFileId) as { content_blob: Buffer };
        expect(new Uint8Array(archived.content_blob)).toEqual(removedOriginal);
        expect(downloadedDatabase.prepare("SELECT COUNT(*) AS n FROM app_settings WHERE namespace = 'ai'").get()).toEqual({ n: 0 });
        expect(downloadedDatabase.prepare("SELECT value_json FROM app_settings WHERE namespace = 'keep'").get()).toEqual({ value_json: '"ok"' });
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
});
