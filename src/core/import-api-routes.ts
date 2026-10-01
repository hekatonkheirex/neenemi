import type { Express } from 'express';
import type { SuiteDatabase } from '../db/database';
import { ImportRepository } from '../db/repositories';
import type { ImportJobRegistry } from './import-jobs';
import { archiveBatchImportFiles, hydrateStoredSpreadsheetRows, isSpreadsheetFile, storeAndRegisterImportFile, storeSpreadsheetImport } from './import-routes';
import { createHash } from 'node:crypto';
import { decodeBase64, isNonEmptyString, isNonNegativeInteger, isRecord, queryString } from './validation';
import { parseRawRowsLimit, parseRawRowsOffset } from './request-parsing';
import { readStoredImportFile, restoreArchivedImportFiles } from './import-storage';

export function registerImportApiRoutes(
  app: Express,
  database: SuiteDatabase,
  dataDirectory: string,
  importJobs: ImportJobRegistry,
): void {
  const imports = new ImportRepository(database);

  app.get('/api/imports', (request, response) => {
    const limitValue = request.query.limit;
    const limit = limitValue === undefined
      ? 200
      : typeof limitValue === 'string' && /^\d+$/.test(limitValue)
        ? Number(limitValue)
        : null;
    if (limit === null || !Number.isInteger(limit) || limit < 1 || limit > 1000) {
      response.status(400).json({ error: 'limit debe ser un entero entre 1 y 1000.' });
      return;
    }

    const batches = imports.listBatches(limit);
    response.json({ batches });
  });

  app.get('/api/import-jobs/:jobId', (request, response) => {
    const job = importJobs.get(request.params.jobId);
    if (!job) {
      response.status(404).json({ error: 'No se encontró el trabajo de importación.' });
      return;
    }
    response.json(job);
  });

  app.delete('/api/imports/:batchId', (request, response) => {
    const batch = imports.getBatch(request.params.batchId);
    if (!batch) {
      response.status(404).json({ error: 'Importación no encontrada.' });
      return;
    }
    if (batch.domain !== 'consumibles') {
      response.status(409).json({ error: 'Solo se pueden quitar cargas directas de Consumibles desde este panel.' });
      return;
    }

    let archivedFiles;
    try {
      archivedFiles = archiveBatchImportFiles(dataDirectory, batch.id, imports);
      const removed = imports.removeBatch(batch.id);
      if (!removed) {
        restoreArchivedImportFiles(dataDirectory, archivedFiles);
        response.status(404).json({ error: 'Importación no encontrada.' });
        return;
      }
      response.json({
        ok: true,
        batchId: removed.batch.id,
        sourceName: removed.batch.sourceName,
        archivedFiles: archivedFiles.length,
      });
    } catch (error) {
      if (archivedFiles) restoreArchivedImportFiles(dataDirectory, archivedFiles);
      response.status(500).json({ error: error instanceof Error ? error.message : 'No se pudo quitar la carga.' });
    }
  });

  app.post('/api/imports', (request, response) => {
    const { domain, sourceName, sourceType, sourceHash } = (isRecord(request.body) ? request.body : {}) as {
      domain?: unknown;
      sourceName?: unknown;
      sourceType?: unknown;
      sourceHash?: unknown;
    };

    if (!isNonEmptyString(domain) || !isNonEmptyString(sourceName)) {
      response.status(400).json({ error: 'domain y sourceName son obligatorios.' });
      return;
    }
    if (sourceHash !== undefined && !isNonEmptyString(sourceHash)) {
      response.status(400).json({ error: 'sourceHash debe ser texto.' });
      return;
    }
    if (sourceType !== undefined && !isNonEmptyString(sourceType)) {
      response.status(400).json({ error: 'sourceType debe ser texto.' });
      return;
    }

    const id = imports.createBatch({
      domain,
      sourceName,
      sourceType,
      sourceHash,
    });
    response.status(201).json({ id });
  });

  app.post('/api/imports/:batchId/files', (request, response) => {
    const batch = imports.getBatch(request.params.batchId);
    if (!batch) {
      response.status(404).json({ error: 'Importación no encontrada.' });
      return;
    }

    const { fileName, storedPath, contentHash, contentType, sizeBytes } = (isRecord(request.body) ? request.body : {}) as {
      fileName?: unknown;
      storedPath?: unknown;
      contentHash?: unknown;
      contentType?: unknown;
      sizeBytes?: unknown;
    };

    if (
      !isNonEmptyString(fileName) ||
      !isNonEmptyString(storedPath) ||
      !isNonEmptyString(contentHash) ||
      !isNonNegativeInteger(sizeBytes)
    ) {
      response.status(400).json({ error: 'Los metadatos del archivo no son válidos.' });
      return;
    }
    if (contentType !== undefined && !isNonEmptyString(contentType)) {
      response.status(400).json({ error: 'contentType debe ser texto.' });
      return;
    }

    const storedContents = readStoredImportFile(dataDirectory, storedPath);
    const contentBlob = storedContents
      && storedContents.byteLength === sizeBytes
      && createHash('sha256').update(storedContents).digest('hex') === contentHash
      ? storedContents
      : undefined;

    const id = imports.addFile({
      batchId: batch.id,
      fileName,
      storedPath,
      contentHash,
      contentType,
      sizeBytes,
      ...(contentBlob ? { contentBlob } : {}),
    });
    response.status(201).json({ id });
  });

  app.post('/api/imports/:batchId/source', async (request, response) => {
    const batch = imports.getBatch(request.params.batchId);
    if (!batch) {
      response.status(404).json({ error: 'Importación no encontrada.' });
      return;
    }

    const { fileName, contentBase64, contentType } = (isRecord(request.body) ? request.body : {}) as {
      fileName?: unknown;
      contentBase64?: unknown;
      contentType?: unknown;
    };
    if (!isNonEmptyString(fileName) || !isNonEmptyString(contentBase64)) {
      response.status(400).json({ error: 'fileName y contentBase64 son obligatorios.' });
      return;
    }
    if (contentType !== undefined && !isNonEmptyString(contentType)) {
      response.status(400).json({ error: 'contentType debe ser texto.' });
      return;
    }

    const contents = decodeBase64(contentBase64);
    if (!contents) {
      response.status(400).json({ error: 'contentBase64 no es válido.' });
      return;
    }
    if (contents.byteLength > 35 * 1024 * 1024) {
      response.status(413).json({ error: 'El archivo de importación supera el límite de 35 MB.' });
      return;
    }

    try {
      const stored = isSpreadsheetFile(fileName, contentType)
        ? await storeSpreadsheetImport(dataDirectory, imports, batch.id, fileName, contents, contentType)
        : storeAndRegisterImportFile(dataDirectory, imports, batch.id, fileName, contents, contentType);
      response.status(201).json(stored);
    } catch (error) {
      response.status(400).json({ error: error instanceof Error ? error.message : 'No se pudo guardar el archivo.' });
    }
  });

  app.post('/api/imports/:batchId/status', (request, response) => {
    const batch = imports.getBatch(request.params.batchId);
    if (!batch) {
      response.status(404).json({ error: 'Importación no encontrada.' });
      return;
    }

    const { status } = (isRecord(request.body) ? request.body : {}) as { status?: unknown };
    if (status === 'applied') {
      imports.markApplied(batch.id);
    } else if (status === 'failed') {
      imports.markFailed(batch.id);
    } else {
      response.status(400).json({ error: 'status debe ser applied o failed.' });
      return;
    }
    response.json({ ok: true });
  });

  app.get('/api/imports/check-current', (request, response) => {
    const domain = queryString(request.query.domain);
    const sourceHash = queryString(request.query.sourceHash);
    const sourceTypeValue = request.query.sourceType;
    const sourceType = sourceTypeValue === undefined ? null : queryString(sourceTypeValue);

    if (!domain || !sourceHash || !/^[a-f\d]{64}$/i.test(sourceHash) || sourceTypeValue !== undefined && !sourceType) {
      response.status(400).json({ error: 'domain y un sourceHash SHA-256 válido son obligatorios.' });
      return;
    }

    const currentBatch = sourceType
      ? imports.findLatestAppliedBySourceType(domain, sourceType)
      : imports.findLatestApplied(domain);
    response.json({
      current: currentBatch?.sourceHash === sourceHash,
      batchId: currentBatch?.sourceHash === sourceHash ? currentBatch.id : null,
    });
  });

  app.get('/api/imports/:batchId', (request, response) => {
    const batch = imports.getBatch(request.params.batchId);
    if (!batch) {
      response.status(404).json({ error: 'Importación no encontrada.' });
      return;
    }
    response.json({ batch, files: imports.listFiles(batch.id) });
  });

  app.get('/api/imports/:batchId/files/:fileId', (request, response) => {
    const batch = imports.getBatch(request.params.batchId);
    if (!batch) {
      response.status(404).json({ error: 'Importación no encontrada.' });
      return;
    }

    const file = imports.listFiles(batch.id).find((candidate) => candidate.id === request.params.fileId);
    if (!file) {
      response.status(404).json({ error: 'Archivo original no encontrado.' });
      return;
    }

    const contentBlob = imports.getFileContent(file.id);
    if (contentBlob) {
      response.type(file.contentType ?? 'application/octet-stream')
        .attachment(file.fileName)
        .send(Buffer.from(contentBlob));
      return;
    }

    const fallback = readStoredImportFile(dataDirectory, file.storedPath);
    if (!fallback) {
      response.status(404).json({ error: 'El archivo original ya no está disponible.' });
      return;
    }
    response.type(file.contentType ?? 'application/octet-stream')
      .attachment(file.fileName)
      .send(Buffer.from(fallback));
  });

  app.get('/api/imports/:batchId/raw-rows', (request, response) => {
    const batch = imports.getBatch(request.params.batchId);
    if (!batch) {
      response.status(404).json({ error: 'Importación no encontrada.' });
      return;
    }

    const limit = parseRawRowsLimit(request.query.limit);
    const offset = parseRawRowsOffset(request.query.offset);
    if (limit === null || offset === null) {
      response.status(400).json({ error: 'limit debe estar entre 1 y 500 y offset entre 0 y 1000000.' });
      return;
    }

    const importFileId = queryString(request.query.fileId);
    const sheetName = queryString(request.query.sheet);
    void hydrateStoredSpreadsheetRows(dataDirectory, imports, batch.id)
      .then(() => {
        response.json({
          batch,
          files: imports.listFiles(batch.id),
          sheets: imports.listSourceSheets(batch.id),
          rows: imports.listSourceRows(batch.id, { importFileId, sheetName, limit, offset }),
          limit,
          offset,
        });
      })
      .catch((error: unknown) => {
        response.status(500).json({ error: error instanceof Error ? error.message : 'No se pudieron leer las filas originales.' });
      });
  });
}
