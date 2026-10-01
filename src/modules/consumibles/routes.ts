import type { Express } from 'express';
import type { SuiteDatabase } from '../../db/database';
import { ImportRepository } from '../../db/repositories';
import type { ImportJobRegistry } from '../../core/import-jobs';
import { OperationsRepository } from '../operaciones/repository';
import { ServiceRepository } from '../servicios/repository';
import { ConsumablesRepository } from './repository';
import { commitConsumablesBundle, getPreparedRowCount, hasZipContainerSignature, parseConsumablesBundleId, parseConsumablesBundleSourceId, prepareConsumablesBundleSource, readConsumablesBundleStaging, removeConsumablesBundleStaging, stageConsumablesBundleSource, type PreparedConsumablesBundleSource } from './bundle-server';
import { type ArchivedImportFile, restoreArchivedImportFiles } from '../../core/import-storage';
import { CONSUMABLES_SOURCE_TYPES, type ConsumablesRecordKind, type ConsumablesSourceType } from './types';
import { archiveBatchImportFiles, enqueueImportJob, storeSpreadsheetImport } from '../../core/import-routes';
import { createHash } from 'node:crypto';
import { decodeBase64, isNonEmptyString, isRecord, queryString } from '../../core/validation';
import { parseListLimit, parseOperationalFilters, parsePageRequest } from '../../core/request-parsing';

function parseConsumablesSourceType(value: unknown): ConsumablesSourceType | null {
  return typeof value === 'string' && CONSUMABLES_SOURCE_TYPES.includes(value as ConsumablesSourceType)
    ? value as ConsumablesSourceType
    : null;
}

function parseConsumablesRecordKind(value: unknown): ConsumablesRecordKind | undefined | null {
  if (value === undefined) return undefined;
  return value === 'consumable' || value === 'part' ? value : null;
}

export function registerConsumablesRoutes(app: Express, database: SuiteDatabase, dataDirectory: string, importJobs: ImportJobRegistry): void {
  const imports = new ImportRepository(database);
  const operations = new OperationsRepository(database);
  const services = new ServiceRepository(database);
  const consumables = new ConsumablesRepository(database);

  app.delete('/api/consumables/imports', (_request, response) => {
    const batches = imports.listBatches(1000).filter((batch) => batch.domain === 'consumibles');
    const archivedFiles: ArchivedImportFile[] = [];
    try {
      for (const batch of batches) {
        archivedFiles.push(...archiveBatchImportFiles(dataDirectory, batch.id, imports));
      }
      database.transaction(() => {
        for (const batch of batches) {
          if (!imports.removeBatch(batch.id)) throw new Error(`No se pudo quitar la importación ${batch.id}.`);
        }
      })();
      response.json({ ok: true, batches: batches.length, archivedFiles: archivedFiles.length });
    } catch (error) {
      if (archivedFiles.length > 0) restoreArchivedImportFiles(dataDirectory, archivedFiles);
      response.status(500).json({ error: error instanceof Error ? error.message : 'No se pudieron limpiar las cargas de Consumibles.' });
    }
  });

  app.get('/api/consumables/summary', (request, response) => {
    response.json(consumables.getSummary(parseOperationalFilters(request.query)));
  });

  app.get('/api/consumables/quantity-summary', (request, response) => {
    response.json(consumables.getQuantitySummary(parseOperationalFilters(request.query)));
  });

  app.get('/api/consumables/outputs/summary', (request, response) => {
    response.json(consumables.getOutputsSummary(parseOperationalFilters(request.query)));
  });

  app.get('/api/consumables/outputs', (request, response) => {
    const kind = parseConsumablesRecordKind(request.query.kind);
    if (kind === null) {
      response.status(400).json({ error: 'kind debe ser consumable o part.' });
      return;
    }
    const paginationRequested = request.query.page !== undefined || request.query.pageSize !== undefined;
    const pageRequest = paginationRequested ? parsePageRequest(request.query.page, request.query.pageSize) : null;
    if (paginationRequested && pageRequest === null) {
      response.status(400).json({ error: 'page debe ser un entero positivo y pageSize un entero entre 1 y 100.' });
      return;
    }
    const query = {
      query: queryString(request.query.query),
      kind,
      ...parseOperationalFilters(request.query),
    };
    if (pageRequest) {
      response.json(consumables.listOutputsPage({ ...query, ...pageRequest }));
      return;
    }
    const limit = parseListLimit(request.query.limit);
    if (limit === null) {
      response.status(400).json({ error: 'limit debe ser un entero entre 1 y 10000.' });
      return;
    }
    response.json(consumables.listOutputs({ ...query, limit }));
  });

  app.get('/api/consumables/analytics', (request, response) => {
    response.json(consumables.getAnalytics(parseOperationalFilters(request.query)));
  });

  app.get('/api/consumables/records', (request, response) => {
    const kind = parseConsumablesRecordKind(request.query.kind);
    if (kind === null) {
      response.status(400).json({ error: 'kind debe ser consumable o part.' });
      return;
    }
    const paginationRequested = request.query.page !== undefined || request.query.pageSize !== undefined;
    const pageRequest = paginationRequested ? parsePageRequest(request.query.page, request.query.pageSize) : null;
    if (paginationRequested && pageRequest === null) {
      response.status(400).json({ error: 'page debe ser un entero positivo y pageSize un entero entre 1 y 100.' });
      return;
    }
    const query = {
      query: queryString(request.query.query),
      kind,
      ...parseOperationalFilters(request.query),
    };
    if (pageRequest) {
      response.json(consumables.listRecordsPage({ ...query, ...pageRequest }));
      return;
    }
    const limit = parseListLimit(request.query.limit);
    if (limit === null) {
      response.status(400).json({ error: 'limit debe ser un entero entre 1 y 10000.' });
      return;
    }
    response.json(consumables.listRecords({ ...query, limit }));
  });

  app.post('/api/consumables/bundle-preflight', (request, response) => {
    const body = isRecord(request.body) ? request.body : {};
    const sourceId = parseConsumablesBundleSourceId(body.sourceId);
    if (!sourceId || !isNonEmptyString(body.sourceName) || !isNonEmptyString(body.contentBase64)) {
      response.status(400).json({ error: 'sourceId, sourceName y contentBase64 son obligatorios.' });
      return;
    }
    const bundleId = body.bundleId === undefined ? null : parseConsumablesBundleId(body.bundleId);
    if (body.bundleId !== undefined && !bundleId) {
      response.status(400).json({ error: 'bundleId no es válido.' });
      return;
    }

    const contents = decodeBase64(body.contentBase64);
    if (!contents) {
      response.status(400).json({ error: 'contentBase64 no es válido.' });
      return;
    }
    if (contents.byteLength > 35 * 1024 * 1024) {
      response.status(413).json({ error: 'La fuente supera el límite de 35 MB.' });
      return;
    }
    if (!hasZipContainerSignature(contents)) {
      response.status(400).json({ error: 'La fuente no parece ser un archivo XLSX válido.' });
      return;
    }

    try {
      if (bundleId) stageConsumablesBundleSource(dataDirectory, bundleId, sourceId, body.sourceName, contents);
      response.json({ sourceId, sourceName: body.sourceName, ...(bundleId ? { bundleId } : {}), accepted: true });
    } catch (error) {
      response.status(400).json({
        error: error instanceof Error ? error.message : 'No se pudo validar la fuente del paquete.',
      });
    }
  });

  app.delete('/api/consumables/bundle/:bundleId', (request, response) => {
    const bundleId = parseConsumablesBundleId(request.params.bundleId);
    if (!bundleId) {
      response.status(400).json({ error: 'bundleId no es válido.' });
      return;
    }
    removeConsumablesBundleStaging(dataDirectory, bundleId);
    response.json({ ok: true, bundleId });
  });

  app.post('/api/consumables/bundle-commit', (request, response) => {
    const body = isRecord(request.body) ? request.body : {};
    const bundleId = parseConsumablesBundleId(body.bundleId);
    if (!bundleId) {
      response.status(400).json({ error: 'bundleId válido es obligatorio.' });
      return;
    }

    enqueueImportJob(importJobs, response, { kind: 'consumables.bundle', sourceName: 'Paquete de nueve fuentes' }, async (update) => {
      try {
        const stagedSources = readConsumablesBundleStaging(dataDirectory, bundleId);
        const preparedSources: PreparedConsumablesBundleSource[] = [];
        for (const [index, staged] of stagedSources.entries()) {
          update(10 + Math.round(index / stagedSources.length * 45), `Validando fuente ${index + 1} de ${stagedSources.length}: ${staged.sourceName}…`);
          const prepared = await prepareConsumablesBundleSource(staged.sourceId, staged.sourceName, staged.contents);
          if (getPreparedRowCount(prepared) === 0) {
            throw new Error(`${staged.sourceName}: no se encontraron filas válidas para aplicar.`);
          }
          preparedSources.push(prepared);
          update(10 + Math.round((index + 1) / stagedSources.length * 45), `${staged.sourceName}: ${getPreparedRowCount(prepared).toLocaleString('es-PY')} filas listas.`);
          await new Promise<void>((resolve) => setImmediate(resolve));
        }

        update(62, 'Guardando filas originales y registros normalizados…');
        const result = commitConsumablesBundle(
          database,
          dataDirectory,
          imports,
          operations,
          consumables,
          services,
          preparedSources,
        );
        return result;
      } finally {
        removeConsumablesBundleStaging(dataDirectory, bundleId);
      }
    });
  });

  app.post('/api/consumables/import-xlsx', async (request, response) => {
    const body = (isRecord(request.body) ? request.body : {}) as {
      sourceName?: unknown;
      sourceType?: unknown;
      contentBase64?: unknown;
      replaceCurrent?: unknown;
    };
    const sourceType = parseConsumablesSourceType(body.sourceType);
    if (!isNonEmptyString(body.sourceName) || !sourceType || !isNonEmptyString(body.contentBase64)) {
      response.status(400).json({ error: 'sourceName, sourceType y contentBase64 son obligatorios.' });
      return;
    }
    if (body.replaceCurrent !== undefined && typeof body.replaceCurrent !== 'boolean') {
      response.status(400).json({ error: 'replaceCurrent debe ser booleano.' });
      return;
    }

    const contents = decodeBase64(body.contentBase64);
    if (!contents) {
      response.status(400).json({ error: 'contentBase64 no es válido.' });
      return;
    }
    if (contents.byteLength > 35 * 1024 * 1024) {
      response.status(413).json({ error: 'El archivo de Consumibles supera el límite de 35 MB.' });
      return;
    }

    const sourceHash = createHash('sha256').update(contents).digest('hex');
    const existingBatch = imports.findAppliedByHash('consumibles', sourceHash);
    if (existingBatch) {
      response.json({
        ...consumables.getSummary(),
        duplicate: true,
        batchId: existingBatch.id,
        sourceName: existingBatch.sourceName,
        sourceHash,
        sourceType,
      });
      return;
    }

    const replacementBatches = body.replaceCurrent === true
      ? imports.listAppliedBySourceType('consumibles', sourceType)
      : [];
    const archivedFiles: ArchivedImportFile[] = [];

    const batchId = imports.createBatch({
      domain: 'consumibles',
      sourceName: body.sourceName,
      sourceType,
      sourceHash,
    });

    try {
      for (const replacementBatch of replacementBatches) {
        archivedFiles.push(...archiveBatchImportFiles(dataDirectory, replacementBatch.id, imports));
      }
      const stored = await storeSpreadsheetImport(dataDirectory, imports, batchId, body.sourceName, contents);
      const result = await consumables.importWorkbook(batchId, body.sourceName, sourceType, contents, replacementBatches.map((batch) => batch.id));
      response.status(201).json({
        duplicate: false,
        replaced: replacementBatches.length > 0,
        batchId,
        sourceName: body.sourceName,
        sourceHash,
        rawRows: stored.rawRows,
        rawSheets: stored.rawSheets,
        ...result,
      });
    } catch (error) {
      if (archivedFiles) restoreArchivedImportFiles(dataDirectory, archivedFiles);
      imports.markFailed(batchId);
      response.status(400).json({ error: error instanceof Error ? error.message : 'No se pudo importar Consumibles.' });
    }
  });
}
