import type { Express } from 'express';
import { createHash } from 'node:crypto';
import type { SuiteDatabase } from '../../db/database';
import { ImportRepository } from '../../db/repositories';
import { restoreArchivedImportFiles, type ArchivedImportFile } from '../../core/import-storage';
import { archiveBatchImportFiles, storeSpreadsheetImport } from '../../core/import-routes';
import { parseListLimit, parseOperationalFilters, parsePageRequest } from '../../core/request-parsing';
import { decodeBase64, isNonEmptyString, isRecord, queryString } from '../../core/validation';
import { ServiceRepository } from './repository';
import { SERVICE_SOURCE_TYPES, type ServiceSourceType } from './types';

function parseServiceSourceType(value: unknown): ServiceSourceType | null {
  return typeof value === 'string' && SERVICE_SOURCE_TYPES.includes(value as ServiceSourceType)
    ? value as ServiceSourceType
    : null;
}

export function registerServiceRoutes(app: Express, database: SuiteDatabase, dataDirectory: string): void {
  const imports = new ImportRepository(database);
  const services = new ServiceRepository(database);

  app.get('/api/services/summary', (request, response) => {
    response.json(services.getSummary(parseOperationalFilters(request.query)));
  });

  app.get('/api/services/records', (request, response) => {
    const paginationRequested = request.query.page !== undefined || request.query.pageSize !== undefined;
    const pageRequest = paginationRequested ? parsePageRequest(request.query.page, request.query.pageSize) : null;
    if (paginationRequested && pageRequest === null) {
      response.status(400).json({ error: 'page debe ser un entero positivo y pageSize un entero entre 1 y 100.' });
      return;
    }
    const query = {
      query: queryString(request.query.query),
      taskType: queryString(request.query.taskType),
      ...parseOperationalFilters(request.query),
    };
    if (pageRequest) {
      response.json(services.listPage({ ...query, ...pageRequest }));
      return;
    }
    const limit = parseListLimit(request.query.limit);
    if (limit === null) {
      response.status(400).json({ error: 'limit debe ser un entero entre 1 y 10000.' });
      return;
    }
    response.json(services.list({ ...query, limit }));
  });

  app.post('/api/services/import-xlsx', async (request, response) => {
    const body = (isRecord(request.body) ? request.body : {}) as {
      sourceName?: unknown;
      sourceType?: unknown;
      contentBase64?: unknown;
      replaceCurrent?: unknown;
    };
    const sourceType = parseServiceSourceType(body.sourceType);
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
      response.status(413).json({ error: 'El archivo de Servicios supera el límite de 35 MB.' });
      return;
    }

    const sourceHash = createHash('sha256').update(contents).digest('hex');
    const existingBatch = imports.findAppliedByHash('services', sourceHash);
    if (existingBatch) {
      response.json({
        duplicate: true,
        batchId: existingBatch.id,
        sourceName: existingBatch.sourceName,
        sourceHash,
        sourceType,
      });
      return;
    }

    const typedReplacementBatches = body.replaceCurrent === true
      ? imports.listAppliedBySourceType('services', sourceType)
      : [];
    const replacementBatches = typedReplacementBatches.length > 0 || body.replaceCurrent !== true
      ? typedReplacementBatches
      : imports.listApplied('services');
    const archivedFiles: ArchivedImportFile[] = [];

    const batchId = imports.createBatch({
      domain: 'services',
      sourceName: body.sourceName,
      sourceType,
      sourceHash,
    });

    try {
      for (const replacementBatch of replacementBatches) {
        archivedFiles.push(...archiveBatchImportFiles(dataDirectory, replacementBatch.id, imports));
      }
      const stored = await storeSpreadsheetImport(dataDirectory, imports, batchId, body.sourceName, contents);
      const result = await services.importWorkbook(batchId, body.sourceName, contents, replacementBatches.map((batch) => batch.id));
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
      response.status(400).json({ error: error instanceof Error ? error.message : 'No se pudo importar Servicios.' });
    }
  });
}
