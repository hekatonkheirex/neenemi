import type { Express } from 'express';
import { createHash } from 'node:crypto';
import type { SuiteDatabase } from '../../db/database';
import { ImportRepository } from '../../db/repositories';
import { storeImportFile } from '../../core/import-storage';
import { decodeBase64, isNonEmptyString, isNonNegativeInteger, isPositiveInteger, isRecord, queryString } from '../../core/validation';
import { MpsRepository, readLegacyMpsDatabase, type SaveMpsModelInput } from './repository';

function parseSaveMpsModelInput(value: unknown, id?: string): SaveMpsModelInput | null {
  if (!isRecord(value) || !isNonEmptyString(value.brand) || !isNonEmptyString(value.model)) return null;
  if (typeof value.isColor !== 'boolean' || !isNonNegativeInteger(value.recVolumeMin) || !isNonNegativeInteger(value.recVolumeMax)) return null;
  if (value.recVolumeMax < value.recVolumeMin || !Array.isArray(value.consumables) || value.consumables.length === 0) return null;

  const speedPpm = value.speedPpm === undefined || value.speedPpm === null
    ? null
    : isNonNegativeInteger(value.speedPpm)
      ? value.speedPpm
      : undefined;
  if (speedPpm === undefined) return null;

  const consumables = [];
  for (const item of value.consumables) {
    if (!isRecord(item) || !isNonEmptyString(item.name) || !isNonEmptyString(item.type) || !isNonEmptyString(item.color) || !isPositiveInteger(item.yieldPages)) return null;
    if (item.id !== undefined && !isNonEmptyString(item.id)) return null;
    if (item.sku !== undefined && typeof item.sku !== 'string') return null;
    consumables.push({
      id: typeof item.id === 'string' ? item.id : undefined,
      name: item.name,
      type: item.type,
      yieldPages: item.yieldPages,
      color: item.color,
      sku: typeof item.sku === 'string' ? item.sku : '',
    });
  }

  return {
    id,
    brand: value.brand,
    model: value.model,
    speedPpm,
    isColor: value.isColor,
    recVolumeMin: value.recVolumeMin,
    recVolumeMax: value.recVolumeMax,
    consumables,
  };
}


function mpsOperationErrorStatus(message: string): number {
  if (message.startsWith('Ya existe') || message.includes('permanece intacto')) return 409;
  if (message.startsWith('No existe')) return 404;
  return 400;
}

export function registerMpsRoutes(app: Express, database: SuiteDatabase, dataDirectory: string): void {
  const imports = new ImportRepository(database);
  const mps = new MpsRepository(database);

  app.get('/api/mps/summary', (_request, response) => {
    response.json(mps.getCurrentSummary());
  });

  app.get('/api/mps/models', (request, response) => {
    response.json(mps.listModels(queryString(request.query.query)));
  });

  app.post('/api/mps/models', (request, response) => {
    const input = parseSaveMpsModelInput(request.body);
    if (!input) {
      response.status(400).json({ error: 'La marca, el modelo y al menos un consumible son obligatorios; los parámetros deben ser válidos.' });
      return;
    }
    try {
      response.status(201).json(mps.saveCustomModel(input));
    } catch (error) {
      const message = error instanceof Error ? error.message : 'No se pudo crear el perfil MPS.';
      response.status(mpsOperationErrorStatus(message)).json({ error: message });
    }
  });

  app.put('/api/mps/models/:id', (request, response) => {
    if (!isNonEmptyString(request.params.id)) {
      response.status(400).json({ error: 'El perfil MPS indicado no es válido.' });
      return;
    }
    const input = parseSaveMpsModelInput(request.body, request.params.id);
    if (!input) {
      response.status(400).json({ error: 'La marca, el modelo y al menos un consumible son obligatorios; los parámetros deben ser válidos.' });
      return;
    }
    try {
      response.json(mps.saveCustomModel(input));
    } catch (error) {
      const message = error instanceof Error ? error.message : 'No se pudo actualizar el perfil MPS.';
      response.status(mpsOperationErrorStatus(message)).json({ error: message });
    }
  });

  app.delete('/api/mps/models/:id', (request, response) => {
    if (!isNonEmptyString(request.params.id)) {
      response.status(400).json({ error: 'El perfil MPS indicado no es válido.' });
      return;
    }
    try {
      response.json({ deleted: mps.deleteCustomModel(request.params.id) });
    } catch (error) {
      const message = error instanceof Error ? error.message : 'No se pudo eliminar el perfil MPS.';
      response.status(mpsOperationErrorStatus(message)).json({ error: message });
    }
  });

  app.post('/api/mps/import-legacy', (request, response) => {
    const { sourceName, contentBase64 } = (isRecord(request.body) ? request.body : {}) as {
      sourceName?: unknown;
      contentBase64?: unknown;
    };
    if (!isNonEmptyString(sourceName) || !isNonEmptyString(contentBase64)) {
      response.status(400).json({ error: 'sourceName y contentBase64 son obligatorios.' });
      return;
    }

    const contents = decodeBase64(contentBase64);
    if (!contents) {
      response.status(400).json({ error: 'contentBase64 no es válido.' });
      return;
    }
    if (contents.byteLength > 35 * 1024 * 1024) {
      response.status(413).json({ error: 'La base MPS supera el límite de 35 MB.' });
      return;
    }

    const sourceHash = createHash('sha256').update(contents).digest('hex');
    const existingBatch = imports.findAppliedByHash('mps', sourceHash);
    if (existingBatch) {
      response.json({
        ...mps.getCurrentSummary(),
        duplicate: true,
        batchId: existingBatch.id,
        sourceName: existingBatch.sourceName,
        sourceHash,
      });
      return;
    }

    const batchId = imports.createBatch({
      domain: 'mps',
      sourceName,
      sourceHash,
    });

    try {
      const stored = storeImportFile(dataDirectory, batchId, sourceName, contents);
      imports.addFile({
        batchId,
        fileName: sourceName,
        storedPath: stored.storedPath,
        contentHash: stored.contentHash,
        contentType: 'application/vnd.sqlite3',
        sizeBytes: stored.sizeBytes,
        contentBlob: contents,
      });
      const result = mps.importLegacyDatabase(batchId, readLegacyMpsDatabase(contents));
      response.status(201).json({
        duplicate: false,
        batchId,
        sourceName,
        sourceHash,
        ...result,
      });
    } catch (error) {
      imports.markFailed(batchId);
      response.status(400).json({ error: error instanceof Error ? error.message : 'No se pudo importar la base MPS.' });
    }
  });
}
