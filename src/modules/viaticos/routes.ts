import type { Express } from 'express';
import { createHash } from 'node:crypto';
import type { SuiteDatabase } from '../../db/database';
import { ImportRepository } from '../../db/repositories';
import { archiveImportFiles, restoreArchivedImportFiles } from '../../core/import-storage';
import { archiveBatchImportFiles, storeSpreadsheetImport } from '../../core/import-routes';
import { MAX_LIST_LIMIT } from '../../core/list-limit';
import { parseListLimit } from '../../core/request-parsing';
import { decodeBase64, isNonEmptyString, isNonNegativeInteger, isNonNegativeNumber, isPositiveInteger, isRecord, queryString } from '../../core/validation';
import { estimateTravelCosts } from './catalog';
import { parseTravelWorkbook } from './parser';
import { TravelRepository } from './repository';
import {
  TRAVEL_SOURCE_TYPES,
  TRAVEL_STATUSES,
  TRAVEL_TRANSPORTS,
  type TravelSourceType,
  type TravelStatus,
  type TravelTransport,
  type TravelTripInput,
} from './types';

function isFiniteNumber(value: unknown): value is number {
  return typeof value === 'number' && Number.isFinite(value);
}

function parseOptionalNonNegativeInteger(value: unknown, fallback: number): number | null {
  if (value === undefined) return fallback;
  if (typeof value !== 'string' || !/^\d+$/.test(value)) return null;
  const parsed = Number(value);
  return isNonNegativeInteger(parsed) ? parsed : null;
}


function parseOptionalPositiveInteger(value: unknown, fallback: number): number | null {
  if (value === undefined) return fallback;
  if (typeof value !== 'string' || !/^\d+$/.test(value)) return null;
  const parsed = Number(value);
  return isPositiveInteger(parsed) ? parsed : null;
}


function parseSaveTravelTripInput(value: unknown): TravelTripInput | null {
  if (!isRecord(value)) return null;
  const textFields = ['recordedAt', 'serviceNumber', 'customerName', 'destination', 'technician', 'driver', 'notes'] as const;
  if (!textFields.every((field) => typeof value[field] === 'string')) return null;
  if (!TRAVEL_TRANSPORTS.includes(value.transport as TravelTransport)) return null;
  if (!isFiniteNumber(value.advance)) return null;
  const numberFields = ['allowance', 'lodging', 'tolls', 'otherCost', 'vehiclePayment', 'technicianPayment', 'distanceKm', 'fuelCost'] as const;
  if (!numberFields.every((field) => isNonNegativeNumber(value[field]))) return null;
  return {
    recordedAt: value.recordedAt as string,
    serviceNumber: value.serviceNumber as string,
    customerName: value.customerName as string,
    destination: value.destination as string,
    transport: value.transport as TravelTransport,
    technician: value.technician as string,
    driver: value.driver as string,
    advance: value.advance as number,
    allowance: value.allowance as number,
    lodging: value.lodging as number,
    tolls: value.tolls as number,
    otherCost: value.otherCost as number,
    vehiclePayment: value.vehiclePayment as number,
    technicianPayment: value.technicianPayment as number,
    distanceKm: value.distanceKm as number,
    fuelCost: value.fuelCost as number,
    notes: value.notes as string,
  };
}


function parseTravelSourceType(value: unknown): TravelSourceType | null {
  return typeof value === 'string' && TRAVEL_SOURCE_TYPES.includes(value as TravelSourceType)
    ? value as TravelSourceType
    : null;
}


function parseTravelStatus(value: unknown): TravelStatus | undefined | null {
  if (value === undefined) return undefined;
  return typeof value === 'string' && TRAVEL_STATUSES.includes(value as TravelStatus)
    ? value as TravelStatus
    : null;
}


function parseTravelTransport(value: unknown): TravelTransport | undefined | null {
  if (value === undefined) return undefined;
  return typeof value === 'string' && TRAVEL_TRANSPORTS.includes(value as TravelTransport)
    ? value as TravelTransport
    : null;
}

export function registerTravelRoutes(app: Express, database: SuiteDatabase, dataDirectory: string): void {
  const imports = new ImportRepository(database);
  const travel = new TravelRepository(database);

  app.get('/api/travel/summary', (_request, response) => {
    response.json(travel.getSummary());
  });

  app.get('/api/travel/trips', (request, response) => {
    const limit = request.query.limit === undefined ? undefined : parseListLimit(request.query.limit);
    if (limit === null) {
      response.status(400).json({ error: `limit debe ser un entero entre 1 y ${MAX_LIST_LIMIT}.` });
      return;
    }
    const status = parseTravelStatus(request.query.status);
    if (status === null) {
      response.status(400).json({ error: 'status no es válido.' });
      return;
    }
    const transport = parseTravelTransport(request.query.transport);
    if (transport === null) {
      response.status(400).json({ error: 'transport no es válido.' });
      return;
    }
    response.json(travel.list({
      query: queryString(request.query.query),
      status,
      transport,
      month: queryString(request.query.month),
      limit,
    }));
  });

  app.get('/api/travel/historical', (_request, response) => {
    response.json(travel.listHistorical());
  });

  app.get('/api/travel/cost-catalog', (_request, response) => {
    response.json(travel.getCostCatalog());
  });

  app.get('/api/travel/cost-estimate', (request, response) => {
    const destination = queryString(request.query.destination) ?? '';
    const transport = parseTravelTransport(request.query.transport);
    if (!destination || !transport) {
      response.status(400).json({ error: 'destination y transport son obligatorios.' });
      return;
    }
    const days = parseOptionalPositiveInteger(request.query.days, 1);
    const nights = parseOptionalNonNegativeInteger(request.query.nights, 0);
    const technicians = parseOptionalPositiveInteger(request.query.technicians, 1);
    if (days === null || nights === null || technicians === null) {
      response.status(400).json({ error: 'days, nights y technicians deben ser enteros válidos.' });
      return;
    }
    response.json(estimateTravelCosts(travel.getCostCatalog(), destination, transport, { days, nights, technicians }));
  });

  app.post('/api/travel/trips', (request, response) => {
    const input = parseSaveTravelTripInput(request.body);
    if (!input) {
      response.status(400).json({ error: 'Los datos del viaje no son válidos.' });
      return;
    }
    try {
      response.status(201).json(travel.saveTrip(input));
    } catch (error) {
      response.status(400).json({ error: error instanceof Error ? error.message : 'No se pudo guardar el viaje.' });
    }
  });

  app.put('/api/travel/trips/:id', (request, response) => {
    const input = parseSaveTravelTripInput(request.body);
    if (!input) {
      response.status(400).json({ error: 'Los datos del viaje no son válidos.' });
      return;
    }
    try {
      response.json(travel.saveTrip(input, request.params.id));
    } catch (error) {
      response.status(400).json({ error: error instanceof Error ? error.message : 'No se pudo actualizar el viaje.' });
    }
  });

  app.delete('/api/travel/trips/:id', (request, response) => {
    try {
      response.json({ deleted: travel.deleteTrip(request.params.id) });
    } catch (error) {
      response.status(400).json({ error: error instanceof Error ? error.message : 'No se pudo eliminar el viaje.' });
    }
  });

  app.patch('/api/travel/trips/:id/status', (request, response) => {
    const status = parseTravelStatus(isRecord(request.body) ? request.body.status : undefined);
    if (!status) {
      response.status(400).json({ error: 'status no es válido.' });
      return;
    }
    try {
      response.json(travel.updateStatus(request.params.id, status));
    } catch (error) {
      response.status(400).json({ error: error instanceof Error ? error.message : 'No se pudo actualizar la rendición.' });
    }
  });

  app.post('/api/travel/import-preview', async (request, response) => {
    const body = (isRecord(request.body) ? request.body : {}) as {
      sourceName?: unknown;
      sourceType?: unknown;
      contentBase64?: unknown;
    };
    const sourceType = parseTravelSourceType(body.sourceType);
    if (!isNonEmptyString(body.sourceName) || !sourceType || !isNonEmptyString(body.contentBase64)) {
      response.status(400).json({ error: 'sourceName, sourceType y contentBase64 son obligatorios.' });
      return;
    }
    const contents = decodeBase64(body.contentBase64);
    if (!contents) {
      response.status(400).json({ error: 'contentBase64 no es válido.' });
      return;
    }
    if (contents.byteLength > 35 * 1024 * 1024) {
      response.status(413).json({ error: 'La planilla de Viáticos supera el límite de 35 MB.' });
      return;
    }

    try {
      const sourceHash = createHash('sha256').update(contents).digest('hex');
      const parsed = await parseTravelWorkbook(contents, body.sourceName);
      const incomingYears = [...new Set([
        ...parsed.trips.map((trip) => Number(trip.recordedAt.slice(0, 4))).filter((year) => Number.isInteger(year) && year > 0),
        ...(parsed.sourceYear ? [parsed.sourceYear] : []),
      ])].sort((left, right) => left - right);
      const existingBatch = imports.findAppliedByHash('viaticos', sourceHash);
      const currentSourceBatch = imports.findLatestApplied('viaticos');
      response.json({
        duplicate: Boolean(existingBatch),
        existingBatchId: existingBatch?.id ?? null,
        currentSourceBatchId: currentSourceBatch?.id ?? null,
        currentSourceName: travel.getSummary().sourceName,
        sourceName: body.sourceName,
        sourceHash,
        sourceType,
        primarySheetName: parsed.primarySheetName,
        sourceSheetNames: parsed.sourceSheetNames,
        sourceYear: parsed.sourceYear,
        incomingYears,
        trips: parsed.trips.length,
        historicalSnapshots: parsed.historical.length,
        busFares: parsed.costCatalog.busFares.length,
        tollRoutes: parsed.costCatalog.tollRoutes.length,
      });
    } catch (error) {
      response.status(400).json({ error: error instanceof Error ? error.message : 'No se pudo analizar la planilla de Viáticos.' });
    }
  });

  app.post('/api/travel/import-xlsx', async (request, response) => {
    const body = (isRecord(request.body) ? request.body : {}) as {
      sourceName?: unknown;
      sourceType?: unknown;
      contentBase64?: unknown;
      replaceBatchId?: unknown;
    };
    const sourceType = parseTravelSourceType(body.sourceType);
    if (!isNonEmptyString(body.sourceName) || !sourceType || !isNonEmptyString(body.contentBase64)) {
      response.status(400).json({ error: 'sourceName, sourceType y contentBase64 son obligatorios.' });
      return;
    }
    const contents = decodeBase64(body.contentBase64);
    if (!contents) {
      response.status(400).json({ error: 'contentBase64 no es válido.' });
      return;
    }
    if (contents.byteLength > 35 * 1024 * 1024) {
      response.status(413).json({ error: 'La planilla de Viáticos supera el límite de 35 MB.' });
      return;
    }

    if (body.replaceBatchId !== undefined && !isNonEmptyString(body.replaceBatchId)) {
      response.status(400).json({ error: 'replaceBatchId debe ser texto.' });
      return;
    }

    const sourceHash = createHash('sha256').update(contents).digest('hex');
    const existingBatch = imports.findAppliedByHash('viaticos', sourceHash);
    if (existingBatch) {
      const summary = travel.getSummary();
      response.json({
        ...summary,
        duplicate: true,
        batchId: existingBatch.id,
        sourceName: existingBatch.sourceName,
        sourceHash,
        sourceType,
      });
      return;
    }

    const replaceBatchId = typeof body.replaceBatchId === 'string' ? body.replaceBatchId : undefined;
    const replacementBatch = replaceBatchId ? imports.getBatch(replaceBatchId) : undefined;
    if (replaceBatchId && (!replacementBatch || replacementBatch.domain !== 'viaticos' || replacementBatch.status !== 'applied')) {
      response.status(409).json({ error: 'La fuente de Viáticos seleccionada para reemplazar no está aplicada.' });
      return;
    }

    const batchId = imports.createBatch({ domain: 'viaticos', sourceName: body.sourceName, sourceType, sourceHash });
    let archivedReplacementFiles: ReturnType<typeof archiveImportFiles> | undefined;
    try {
      if (replacementBatch) {
        archivedReplacementFiles = archiveBatchImportFiles(dataDirectory, replacementBatch.id, imports);
      }
      const stored = await storeSpreadsheetImport(dataDirectory, imports, batchId, body.sourceName, contents);
      const result = await travel.importWorkbook(batchId, body.sourceName, contents, replaceBatchId);
      response.status(201).json({
        duplicate: false,
        replaced: Boolean(replaceBatchId),
        batchId,
        sourceName: body.sourceName,
        sourceHash,
        rawRows: stored.rawRows,
        rawSheets: stored.rawSheets,
        ...result,
      });
    } catch (error) {
      if (archivedReplacementFiles) restoreArchivedImportFiles(dataDirectory, archivedReplacementFiles);
      imports.markFailed(batchId);
      response.status(400).json({ error: error instanceof Error ? error.message : 'No se pudo importar Viáticos.' });
    }
  });
}
