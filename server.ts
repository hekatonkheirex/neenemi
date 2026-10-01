import express, { type Response } from 'express';
import { createHash } from 'node:crypto';
import fs from 'node:fs';
import path from 'node:path';
import Database from 'better-sqlite3';
import { backfillImportFileBlobs, getImportOriginalsStatus } from './src/core/import-blob-backfill';
import { openDatabase, resolveDatabasePath, type SuiteDatabase } from './src/db/database';
import { ImportRepository, SettingsRepository } from './src/db/repositories';
import { OverviewRepository } from './src/db/overview';
import {
  CatalogRepository,
  type CatalogModelFamilyInput,
  type CatalogModelNoteInput,
  type CatalogPartInput,
  type CatalogServiceItemInput,
} from './src/modules/catalogo/repository';
import { archiveImportFiles, readStoredImportFile, restoreArchivedImportFiles, storeImportFile, storedImportFileExists, writeStoredImportFile, type ArchivedImportFile } from './src/core/import-storage';
import { stageDatabaseRestore, activateStagedDatabaseRestore } from './src/core/database-restore';
import { ImportJobRegistry } from './src/core/import-jobs';
import { backfillStoredSourceMetadata } from './src/core/source-metadata-backfill';
import { readWorkbookSheets, type WorkbookSheetRows } from './src/modules/consumibles/xlsx-helpers';
import { parseOutputsWorkbook } from './src/modules/consumibles/outputs';
import { parseConsumablesWorkbook } from './src/modules/consumibles/xlsx';
import { getSourceCoverage } from './src/core/source-catalog';
import { SalesRepository, type SaveProformaInput } from './src/modules/ventas/repository';
import type {
  ContractPriceCurrency,
  OpenContractSnapshot,
  PricingSettings,
  ProformaLineInput,
  SalesCatalogSnapshot,
} from './src/modules/ventas/types';
import {
  COMMERCIAL_AREAS,
  CONTRACT_TYPES,
  CUSTOMER_TYPES,
  OperationsRepository,
  type SaveContractInput,
  type SaveCustomerInput,
  type SaveEquipmentInput,
} from './src/modules/operaciones/repository';
import {
  LEGACY_FLEET_METADATA_TYPES,
  parseCanonDiscontinuationWorkbook,
  parseLegacyFleetMetadataWorkbook,
  parseLegacyPortfolioWorkbook,
  parseWaldbottStockWorkbook,
  type LegacyFleetMetadataParseResult,
  type LegacyFleetMetadataRow,
  type LegacyPortfolioParseResult,
  type LegacyPortfolioRow,
  type LegacyFleetMetadataType,
} from './src/modules/operaciones/legacy';
import {
  MaintenanceRepository,
  type LegacyMaintenanceDatabaseInput,
  type LegacyMaintenanceModelInput,
  type LegacyMaintenanceRecordInput,
  type SaveMaintenanceRuleInput,
} from './src/modules/mantenimiento/repository';
import { DEFAULT_MAINTENANCE_RULES } from './src/modules/mantenimiento/defaults';
import { parseMaintenanceCounterCsv, parseMaintenanceCounterWorkbook } from './src/modules/mantenimiento/counters-parser';
import { MpsRepository, readLegacyMpsDatabase, type SaveMpsModelInput } from './src/modules/mps/repository';
import { ConsumablesRepository } from './src/modules/consumibles/repository';
import {
  CONSUMABLES_SOURCE_TYPES,
  type ConsumablesRecordKind,
  type ParsedConsumablesOutputRow,
  type ParsedConsumablesRow,
  type ConsumablesSourceType,
} from './src/modules/consumibles/types';
import type { OperationalFilters } from './src/core/operational-filters';
import { ServiceRepository } from './src/modules/servicios/repository';
import { parseServicesWorkbook } from './src/modules/servicios/parser';
import { SERVICE_SOURCE_TYPES, type ParsedServiceRow, type ServiceSourceType } from './src/modules/servicios/types';
import { estimateTravelCosts } from './src/modules/viaticos/catalog';
import { TravelRepository } from './src/modules/viaticos/repository';
import { parseTravelWorkbook } from './src/modules/viaticos/parser';
import {
  TRAVEL_SOURCE_TYPES,
  TRAVEL_STATUSES,
  TRAVEL_TRANSPORTS,
  type TravelSourceType,
  type TravelStatus,
  type TravelTransport,
  type TravelTripInput,
} from './src/modules/viaticos/types';
import { calculateYield, normalizePageCoverage, summarizeDocumentCoverage } from './src/modules/cobertura/calculations';
import { CoverageRepository } from './src/modules/cobertura/repository';
import type { CanonModelDraft, CoverageAnalysis, CoveragePageFailure } from './src/modules/cobertura/types';
import { registerTrackingRoutes } from './src/modules/tracking/routes';
import { registerUniflowRoutes } from './src/modules/uniflow/routes';
import { registerSoftwareSelectorRoutes } from './src/modules/software-selector/routes';
import { registerSlaRoutes } from './src/modules/sla/routes';
import { isNonEmptyString, isPositiveInteger, isRecord } from './src/core/validation';

// Claves de API (p. ej. ai/gemini_api_key): nunca salen de la instalación en respaldos ni lecturas.
const SECRET_SETTINGS_NAMESPACE = 'ai';

function stripSecrets(snapshotPath: string): void {
  const snapshot = new Database(snapshotPath);
  try {
    snapshot.prepare('DELETE FROM app_settings WHERE namespace = ?').run(SECRET_SETTINGS_NAMESPACE);
    snapshot.exec('VACUUM');
  } finally {
    snapshot.close();
  }
}

type ImportJobUpdate = (progress: number, stage: string) => void;

function enqueueImportJob(
  registry: ImportJobRegistry,
  response: Response,
  input: { kind: string; sourceName: string },
  task: (update: ImportJobUpdate) => Promise<unknown>,
): void {
  const job = registry.create(input);
  void (async () => {
    await new Promise<void>((resolve) => setImmediate(resolve));
    registry.update(job.id, { status: 'running', progress: 5, stage: 'Preparando importación…' });
    try {
      const result = await task((progress, stage) => {
        registry.update(job.id, { status: 'running', progress, stage });
      });
      registry.complete(job.id, result);
    } catch (error) {
      registry.fail(job.id, error instanceof Error ? error.message : 'No se pudo completar la importación.');
    }
  })();
  response.status(202).json({ jobId: job.id, kind: input.kind, sourceName: input.sourceName });
}

const moduleDirectory = path.dirname(path.resolve(process.argv[1] || process.cwd()));

export type ServerOptions = {
  dataDirectory: string;
  staticDirectory?: string;
  onRestorePrepared?: (candidatePath: string) => void;
};

export type StartServerOptions = Partial<ServerOptions> & {
  host?: string;
  port?: number;
};

export function createServer(options: ServerOptions): { app: express.Express; database: SuiteDatabase } {
  const dataDirectory = path.resolve(options.dataDirectory);
  const database = openDatabase(resolveDatabasePath(dataDirectory));
  const app = express();
  const settings = new SettingsRepository(database);
  const imports = new ImportRepository(database);
  const importJobs = new ImportJobRegistry();
  let archiveBackfillJobId: string | null = null;
  const overview = new OverviewRepository(database);
  const catalog = new CatalogRepository(database);
  const sales = new SalesRepository(database);
  const operations = new OperationsRepository(database);
  const maintenance = new MaintenanceRepository(database);
  const mps = new MpsRepository(database);
  const consumables = new ConsumablesRepository(database);
  const services = new ServiceRepository(database);
  const travel = new TravelRepository(database);
  const coverage = new CoverageRepository(database);

  // Reject DNS-rebinding hosts on reads as well as writes: backups and settings are readable.
  app.use((request, response, next) => {
    const host = request.get('host');
    if (host && /^(?:127\.0\.0\.1|localhost):(?:[1-9]\d{0,4})$/.test(host)
      && Number(host.slice(host.lastIndexOf(':') + 1)) <= 65535) {
      next();
      return;
    }
    response.status(403).json({ error: 'La API local solo acepta conexiones con destino local.' });
  });

  app.use((request, response, next) => {
    const method = request.method.toUpperCase();
    if (method === 'GET' || method === 'HEAD' || method === 'OPTIONS') return next();

    const fetchSite = request.get('sec-fetch-site');
    if (fetchSite && fetchSite !== 'same-origin' && fetchSite !== 'none') {
      response.status(403).json({ error: 'La API local no acepta cambios desde otro origen.' });
      return;
    }

    const origin = request.get('origin');
    if (!origin) return next();

    try {
      const host = request.get('host');
      if (host && new URL(origin).origin === new URL(`${request.protocol}://${host}`).origin) return next();
    } catch {
      // Un Origin mal formado tampoco puede autorizar una modificación.
    }

    response.status(403).json({ error: 'La API local no acepta cambios desde otro origen.' });
  });

  app.use(express.json({ limit: '50mb' }));

  registerUniflowRoutes(app, database);
  registerSoftwareSelectorRoutes(app, database);
  registerSlaRoutes(app, database);
  registerTrackingRoutes(app, database, (batchId, fileName, bytes, contentType) =>
    storeAndRegisterImportFile(dataDirectory, imports, batchId, fileName, bytes, contentType));

  app.get('/api/health', (_request, response) => {
    const result = database.prepare('SELECT 1 AS ok').get() as { ok: number };
    response.json({ ok: result.ok === 1, database: 'ready' });
  });

  app.get('/api/overview', (_request, response) => {
    response.json(overview.get());
  });

  app.get('/api/sources', (_request, response) => {
    response.json({ sources: getSourceCoverage(database) });
  });

  app.post('/api/sources/reindex', async (_request, response) => {
    try {
      const summary = await backfillStoredSourceMetadata({ dataDirectory, database, imports });
      response.json(summary);
    } catch (error) {
      response.status(500).json({
        error: error instanceof Error
          ? `No se pudieron reindexar las fuentes archivadas: ${error.message}`
          : 'No se pudieron reindexar las fuentes archivadas.',
      });
    }
  });

  app.get('/api/system/backup', async (_request, response) => {
    let temporaryDirectory: string | null = null;
    try {
      const archiveStatus = getImportOriginalsStatus(dataDirectory, imports);
      if (archiveStatus.missingFiles > 0) {
        response.status(409).json({
          error: `Faltan ${archiveStatus.missingFiles.toLocaleString('es-PY')} originales por incorporar a SQLite.`,
          archiveStatus,
        });
        return;
      }

      temporaryDirectory = fs.mkdtempSync(path.join(dataDirectory, '.dcss-backup-'));
      const snapshotPath = path.join(temporaryDirectory, 'dcss.sqlite');
      await database.backup(snapshotPath);
      stripSecrets(snapshotPath);

      response.setHeader('Cache-Control', 'no-store');
      response.setHeader('Content-Type', 'application/vnd.sqlite3');
      response.download(snapshotPath, makeBackupFileName(), (error) => {
        removeTemporaryDirectory(temporaryDirectory);
        temporaryDirectory = null;
        if (error && !response.headersSent) {
          response.status(500).json({ error: 'No se pudo descargar el respaldo SQLite.' });
        }
      });
    } catch (error) {
      removeTemporaryDirectory(temporaryDirectory);
      response.status(500).json({
        error: error instanceof Error ? `No se pudo generar el respaldo SQLite: ${error.message}` : 'No se pudo generar el respaldo SQLite.',
      });
    }
  });

  app.get('/api/system/import-originals/status', (_request, response) => {
    response.json(getImportOriginalsStatus(dataDirectory, imports));
  });

  app.post('/api/system/import-originals/backfill', (_request, response) => {
    if (archiveBackfillJobId) {
      const activeJob = importJobs.get(archiveBackfillJobId);
      if (activeJob && (activeJob.status === 'queued' || activeJob.status === 'running')) {
        response.status(202).json({ jobId: activeJob.id, kind: activeJob.kind, sourceName: activeJob.sourceName });
        return;
      }
      archiveBackfillJobId = null;
    }

    const job = importJobs.create({ kind: 'originals-backfill', sourceName: 'Archivar originales importados en SQLite' });
    archiveBackfillJobId = job.id;
    importJobs.update(job.id, { status: 'running', stage: 'Preparando archivos originales' });
    response.status(202).json({ jobId: job.id, kind: job.kind, sourceName: job.sourceName });

    void backfillImportFileBlobs(dataDirectory, imports, (completed, total, fileName) => {
      importJobs.update(job.id, {
        progress: total > 0 ? completed / total * 100 : 100,
        stage: `Verificado ${completed.toLocaleString('es-PY')} de ${total.toLocaleString('es-PY')}: ${fileName}`,
      });
    }).then((result) => {
      importJobs.complete(job.id, result);
    }).catch((error: unknown) => {
      importJobs.fail(job.id, error instanceof Error ? error.message : 'No se pudieron archivar los originales.');
    });
  });

  app.post('/api/system/restore', async (request, response) => {
    if (!options.onRestorePrepared) {
      response.status(503).json({ error: 'La restauración requiere reiniciar el servicio local y no está disponible en este proceso.' });
      return;
    }
    if (!['application/vnd.sqlite3', 'application/octet-stream'].includes(request.get('content-type')?.split(';')[0] ?? '')) {
      response.status(415).json({ error: 'Selecciona un respaldo SQLite válido.' });
      return;
    }

    let candidatePath: string | null = null;
    try {
      candidatePath = await stageDatabaseRestore(dataDirectory, request);
      response.status(202).json({ ok: true, message: 'Respaldo validado. Se reiniciará la Suite para activar la base.' });
      let handedOff = false;
      const preparedPath = candidatePath;
      response.once('finish', () => {
        handedOff = true;
        options.onRestorePrepared?.(preparedPath);
      });
      response.once('close', () => {
        if (!handedOff) fs.rmSync(preparedPath, { force: true });
      });
    } catch (error) {
      if (candidatePath) fs.rmSync(candidatePath, { force: true });
      response.status(400).json({ error: error instanceof Error ? error.message : 'No se pudo validar el respaldo SQLite.' });
    }
  });

  app.delete('/api/system/imports', (_request, response) => {
    const batches = imports.listNonManualBatches();
    const files = batches.flatMap((batch) => imports.listFiles(batch.id));
    const archivedFiles: ArchivedImportFile[] = [];

    try {
      for (const batch of batches) {
        archivedFiles.push(...archiveBatchImportFiles(dataDirectory, batch.id, imports));
      }
      imports.clearImportedBatches(batches.map((batch) => batch.id));
      settings.remove('tracking', 'snapshot');
      response.json({
        ok: true,
        batches: batches.length,
        files: files.length,
        archivedFiles: archivedFiles.length,
      });
    } catch (error) {
      if (archivedFiles.length > 0) restoreArchivedImportFiles(dataDirectory, archivedFiles);
      response.status(500).json({ error: error instanceof Error ? error.message : 'No se pudieron limpiar las cargas importadas.' });
    }
  });

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

    const files = imports.listFiles(batch.id);
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

  app.get('/api/settings/:namespace/:key', (request, response) => {
    if (request.params.namespace === SECRET_SETTINGS_NAMESPACE) {
      response.status(403).json({ error: 'Esta configuración no se puede leer desde la interfaz.' });
      return;
    }
    const value = settings.get(request.params.namespace, request.params.key, null);
    response.json({ value });
  });

  app.put('/api/settings/:namespace/:key', (request, response) => {
    if (!isRecord(request.body) || !Object.prototype.hasOwnProperty.call(request.body, 'value')) {
      response.status(400).json({ error: 'El cuerpo debe incluir value.' });
      return;
    }

    settings.set(request.params.namespace, request.params.key, request.body.value);
    response.json({ ok: true });
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

  app.post('/api/catalog/parts', (request, response) => {
    const { batchId, parts, modelFamilies, modelNotes, serviceItems, replaceAll } = (isRecord(request.body) ? request.body : {}) as {
      batchId?: unknown;
      parts?: unknown;
      modelFamilies?: unknown;
      modelNotes?: unknown;
      serviceItems?: unknown;
      replaceAll?: unknown;
    };
    const parsedParts = parseCatalogParts(parts);
    const parsedModelFamilies = parseCatalogModelFamilies(modelFamilies);
    const parsedModelNotes = parseCatalogModelNotes(modelNotes);
    const parsedServiceItems = parseCatalogServiceItems(serviceItems);
    if (!isNonEmptyString(batchId) || !parsedParts || !parsedModelFamilies || !parsedModelNotes || !parsedServiceItems || replaceAll !== undefined && typeof replaceAll !== 'boolean') {
      response.status(400).json({ error: 'batchId, parts y datos comerciales del catálogo deben ser válidos.' });
      return;
    }

    try {
      response.json(catalog.replaceFromBatch(batchId, parsedParts, {
        replaceAll: replaceAll === true,
        modelFamilies: parsedModelFamilies,
        modelNotes: parsedModelNotes,
        serviceItems: parsedServiceItems,
      }));
    } catch (error) {
      response.status(400).json({ error: error instanceof Error ? error.message : 'Importación inválida.' });
    }
  });

  app.get('/api/catalog/parts', (request, response) => {
    response.json(catalog.list({
      query: queryString(request.query.query),
      modelName: queryString(request.query.modelName),
      modelLinkedOnly: request.query.modelLinkedOnly === 'true',
      stockOnly: request.query.stockOnly === 'true',
      excludeDiscontinued: request.query.excludeDiscontinued === 'true',
    }));
  });

  app.get('/api/catalog/source', (_request, response) => {
    response.json(catalog.getLatestSourceFile());
  });

  app.get('/api/catalog/model-notes', (_request, response) => {
    response.json(catalog.listModelNotes());
  });

  app.get('/api/catalog/families', (_request, response) => {
    response.json(catalog.listFamilySummaries());
  });

  app.get('/api/catalog/service-items', (request, response) => {
    response.json(catalog.listServiceItems({
      query: queryString(request.query.query),
      modelName: queryString(request.query.modelName),
    }));
  });

  app.get('/api/operations/customers', (request, response) => {
    response.json(operations.listCustomers(queryString(request.query.query)));
  });

  app.get('/api/operations/portfolio-snapshot', (request, response) => {
    response.json(operations.getPortfolioSnapshot(queryString(request.query.query)));
  });

  app.get('/api/operations/discontinuation-overview', (_request, response) => {
    try {
      response.json(operations.getDiscontinuationOverview());
    } catch (error) {
      response.status(500).json({ error: error instanceof Error ? error.message : 'No se pudo consultar el resumen del Discontinuador.' });
    }
  });

  app.post('/api/operations/customers', (request, response) => {
    const input = parseSaveCustomerInput(request.body);
    if (!input) {
      response.status(400).json({ error: 'El nombre y la clasificación del cliente no son válidos.' });
      return;
    }

    try {
      response.status(201).json(operations.saveCustomer(input));
    } catch (error) {
      response.status(400).json({ error: error instanceof Error ? error.message : 'No se pudo guardar el cliente.' });
    }
  });

  app.get('/api/operations/contracts', (request, response) => {
    response.json(operations.listContracts(queryString(request.query.query)));
  });

  app.post('/api/operations/contracts', (request, response) => {
    const input = parseSaveContractInput(request.body);
    if (!input) {
      response.status(400).json({ error: 'El contrato y sus equipos no son válidos.' });
      return;
    }

    try {
      response.status(201).json(operations.saveContract(input));
    } catch (error) {
      response.status(400).json({ error: error instanceof Error ? error.message : 'No se pudo guardar el contrato.' });
    }
  });

  app.post('/api/operations/import-legacy-portfolio', (request, response) => {
    const body = isRecord(request.body) ? request.body : {};
    if (!isNonEmptyString(body.sourceName) || !isNonEmptyString(body.contentBase64)) {
      response.status(400).json({ error: 'sourceName y contentBase64 son obligatorios.' });
      return;
    }

    const sourceName = body.sourceName;
    const contents = decodeBase64(body.contentBase64);
    if (!contents) {
      response.status(400).json({ error: 'contentBase64 no es válido.' });
      return;
    }
    if (contents.byteLength > 35 * 1024 * 1024) {
      response.status(413).json({ error: 'La cartera supera el límite de 35 MB.' });
      return;
    }

    enqueueImportJob(importJobs, response, { kind: 'fleet.equipment', sourceName }, async (update) => {
      update(10, 'Leyendo cartera XLSX…');
      const parsed = await parseLegacyPortfolioWorkbook(contents);
      if (parsed.rows.length === 0) throw new Error('No se encontraron filas de cartera válidas.');
      update(42, `${parsed.rows.length.toLocaleString('es-PY')} filas leídas; preparando base local…`);

      const sourceHash = createHash('sha256').update(contents).digest('hex');
      const existingBatch = imports.findAppliedByHash('operations', sourceHash);
      if (existingBatch) {
        return {
          duplicate: true,
          batchId: existingBatch.id,
          sourceName: existingBatch.sourceName,
          sourceHash,
        };
      }

      const batchId = imports.createBatch({
        domain: 'operations',
        sourceName,
        sourceType: 'fleet.equipment',
        sourceHash,
      });

      try {
        update(58, 'Guardando archivo original…');
        const stored = await storeSpreadsheetImport(dataDirectory, imports, batchId, sourceName, contents);
        update(78, 'Aplicando cartera a la base local…');
        const result = operations.importLegacyPortfolio(batchId, parsed.rows);
        return {
          duplicate: false,
          batchId,
          sourceName,
          sourceHash,
          rows: parsed.rows.length,
          skippedRows: parsed.skippedRows,
          duplicateRows: parsed.duplicateRows,
          sheets: parsed.sheets,
          rawRows: stored.rawRows,
          rawSheets: stored.rawSheets,
          ...result,
        };
      } catch (error) {
        imports.markFailed(batchId);
        throw error;
      }
    });
  });

  app.post('/api/operations/import-fleet-metadata', (request, response) => {
    const body = isRecord(request.body) ? request.body : {};
    const sourceType = parseLegacyFleetMetadataSourceType(body.sourceType);
    if (!sourceType || !isNonEmptyString(body.sourceName) || !isNonEmptyString(body.contentBase64)) {
      response.status(400).json({ error: 'sourceName, sourceType y contentBase64 son obligatorios.' });
      return;
    }

    const sourceName = body.sourceName;
    const contents = decodeBase64(body.contentBase64);
    if (!contents) {
      response.status(400).json({ error: 'contentBase64 no es válido.' });
      return;
    }
    if (contents.byteLength > 35 * 1024 * 1024) {
      response.status(413).json({ error: 'La fuente de cartera supera el límite de 35 MB.' });
      return;
    }

    enqueueImportJob(importJobs, response, { kind: sourceType, sourceName }, async (update) => {
      update(10, 'Leyendo metadatos de cartera…');
      const parsed = await parseLegacyFleetMetadataWorkbook(contents, sourceType);
      if (parsed.rows.length === 0) throw new Error('No se encontraron filas válidas en la fuente seleccionada.');
      update(42, `${parsed.rows.length.toLocaleString('es-PY')} filas leídas; preparando clasificación…`);

      const sourceHash = createHash('sha256').update(contents).digest('hex');
      const domain = `operations-fleet-${sourceType}`;
      const existingBatch = imports.findAppliedByHash(domain, sourceHash);
      if (existingBatch) {
        return {
          duplicate: true,
          batchId: existingBatch.id,
          sourceName: existingBatch.sourceName,
          sourceHash,
          sourceType,
        };
      }

      const batchId = imports.createBatch({
        domain,
        sourceName,
        sourceType,
        sourceHash,
      });

      try {
        update(58, 'Guardando archivo original…');
        const stored = await storeSpreadsheetImport(dataDirectory, imports, batchId, sourceName, contents);
        update(78, 'Aplicando clasificación a la base local…');
        const result = operations.importLegacyFleetMetadata(batchId, sourceType, parsed.rows);
        return {
          duplicate: false,
          batchId,
          sourceName,
          sourceHash,
          rows: parsed.rows.length,
          skippedRows: parsed.skippedRows,
          duplicateRows: parsed.duplicateRows,
          sheets: parsed.sheets,
          rawRows: stored.rawRows,
          rawSheets: stored.rawSheets,
          ...result,
        };
      } catch (error) {
        imports.markFailed(batchId);
        throw error;
      }
    });
  });

  app.post('/api/operations/import-canon-discontinuation', (request, response) => {
    const body = isRecord(request.body) ? request.body : {};
    if (!isNonEmptyString(body.sourceName) || !isNonEmptyString(body.contentBase64)) {
      response.status(400).json({ error: 'sourceName y contentBase64 son obligatorios.' });
      return;
    }

    const sourceName = body.sourceName;
    const contents = decodeBase64(body.contentBase64);
    if (!contents) {
      response.status(400).json({ error: 'contentBase64 no es válido.' });
      return;
    }
    if (contents.byteLength > 35 * 1024 * 1024) {
      response.status(413).json({ error: 'La lista Canon supera el límite de 35 MB.' });
      return;
    }

    enqueueImportJob(importJobs, response, { kind: 'discontinuation.canon', sourceName }, async (update) => {
      update(10, 'Leyendo lista Canon…');
      const parsed = await parseCanonDiscontinuationWorkbook(contents, sourceName);
      if (parsed.items.length === 0) throw new Error('No se encontraron registros Canon de discontinuación.');
      update(42, `${parsed.items.length.toLocaleString('es-PY')} registros Canon leídos…`);

      const sourceHash = createHash('sha256').update(contents).digest('hex');
      const existingBatch = imports.findAppliedByHash('operations-canon', sourceHash);
      if (existingBatch) {
        return {
          duplicate: true,
          batchId: existingBatch.id,
          sourceName: existingBatch.sourceName,
          sourceHash,
        };
      }

      const batchId = imports.createBatch({
        domain: 'operations-canon',
        sourceName,
        sourceHash,
      });

      try {
        update(58, 'Guardando archivo original…');
        const stored = await storeSpreadsheetImport(dataDirectory, imports, batchId, sourceName, contents);
        update(78, 'Aplicando modelos Canon a la base local…');
        const result = operations.importCanonDiscontinuation(batchId, parsed.items);
        return {
          duplicate: false,
          batchId,
          sourceName,
          sourceHash,
          rows: parsed.items.length,
          skippedRows: parsed.skippedRows,
          duplicateRows: parsed.duplicateRows,
          sheets: parsed.sheets,
          rawRows: stored.rawRows,
          rawSheets: stored.rawSheets,
          ...result,
        };
      } catch (error) {
        imports.markFailed(batchId);
        throw error;
      }
    });
  });

  app.post('/api/operations/import-waldbott-stock', (request, response) => {
    const body = isRecord(request.body) ? request.body : {};
    if (!isNonEmptyString(body.sourceName) || !isNonEmptyString(body.contentBase64)) {
      response.status(400).json({ error: 'sourceName y contentBase64 son obligatorios.' });
      return;
    }

    const sourceName = body.sourceName;
    const contents = decodeBase64(body.contentBase64);
    if (!contents) {
      response.status(400).json({ error: 'contentBase64 no es válido.' });
      return;
    }
    if (contents.byteLength > 35 * 1024 * 1024) {
      response.status(413).json({ error: 'El stock Waldbott supera el límite de 35 MB.' });
      return;
    }

    enqueueImportJob(importJobs, response, { kind: 'discontinuation.waldbott', sourceName }, async (update) => {
      update(10, 'Leyendo stock Waldbott…');
      const parsed = await parseWaldbottStockWorkbook(contents, sourceName);
      if (parsed.rows.length === 0) throw new Error('No se encontraron filas válidas de stock en el Depósito 04.');
      update(42, `${parsed.rows.length.toLocaleString('es-PY')} filas de stock leídas…`);

      const sourceHash = createHash('sha256').update(contents).digest('hex');
      const existingBatch = imports.findAppliedByHash('operations-waldbott', sourceHash);
      if (existingBatch) {
        return {
          duplicate: true,
          batchId: existingBatch.id,
          sourceName: existingBatch.sourceName,
          sourceHash,
        };
      }

      const batchId = imports.createBatch({
        domain: 'operations-waldbott',
        sourceName,
        sourceHash,
      });

      try {
        update(58, 'Guardando archivo original…');
        const stored = await storeSpreadsheetImport(dataDirectory, imports, batchId, sourceName, contents);
        update(78, 'Aplicando stock a la base local…');
        const result = operations.importWaldbottStock(batchId, parsed.rows);
        return {
          duplicate: false,
          batchId,
          sourceName,
          sourceHash,
          rows: parsed.rows.length,
          skippedRows: parsed.skippedRows,
          sheets: parsed.sheets,
          rawRows: stored.rawRows,
          rawSheets: stored.rawSheets,
          ...result,
        };
      } catch (error) {
        imports.markFailed(batchId);
        throw error;
      }
    });
  });

  app.delete('/api/operations/exclusive-imports', (_request, response) => {
    const exclusiveDomains = new Set(['operations-canon', 'operations-waldbott']);
    const batches = imports
      .listBatches(1000)
      .filter((batch) => exclusiveDomains.has(batch.domain));
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
      response.status(500).json({ error: error instanceof Error ? error.message : 'No se pudieron limpiar las listas de Operaciones.' });
    }
  });

  app.get('/api/operations/equipment', (request, response) => {
    response.json(operations.listEquipment(queryString(request.query.query)));
  });

  app.get('/api/operations/model-discontinuation', (_request, response) => {
    try {
      response.json(operations.listModelDiscontinuation());
    } catch (error) {
      response.status(500).json({ error: error instanceof Error ? error.message : 'No se pudo consultar el soporte Canon.' });
    }
  });

  app.get('/api/operations/waldbott-stock', (_request, response) => {
    try {
      response.json(operations.listWaldbottStock());
    } catch (error) {
      response.status(500).json({ error: error instanceof Error ? error.message : 'No se pudo consultar el stock Waldbott.' });
    }
  });

  app.get('/api/maintenance/summary', (_request, response) => {
    response.json(maintenance.getCurrentSummary());
  });

  app.delete('/api/maintenance/import', (_request, response) => {
    const batches = imports.listApplied('maintenance');
    const archivedFiles: ArchivedImportFile[] = [];
    try {
      for (const batch of batches) {
        archivedFiles.push(...archiveBatchImportFiles(dataDirectory, batch.id, imports));
      }
      const removed = maintenance.removeImportedBatches(batches.map((batch) => batch.id));
      response.json({ ok: true, batches: removed, archivedFiles: archivedFiles.length });
    } catch (error) {
      if (archivedFiles.length > 0) restoreArchivedImportFiles(dataDirectory, archivedFiles);
      response.status(500).json({ error: error instanceof Error ? error.message : 'No se pudieron limpiar las cargas de mantenimiento.' });
    }
  });

  app.get('/api/maintenance/analysis', (request, response) => {
    const months = parseAnalysisMonths(request.query.months);
    if (!months) {
      response.status(400).json({ error: 'months debe ser un entero entre 1 y 12.' });
      return;
    }
    response.json(maintenance.listCurrentAnalyses(queryString(request.query.query), months));
  });

  app.post('/api/maintenance/import-legacy', (request, response) => {
    const input = parseLegacyMaintenanceImport(request.body);
    if (!input) {
      response.status(400).json({ error: 'El archivo de mantenimiento no tiene el formato esperado.' });
      return;
    }

    const contents = decodeBase64(input.contentBase64);
    if (!contents) {
      response.status(400).json({ error: 'contentBase64 no es válido.' });
      return;
    }
    if (contents.byteLength > 35 * 1024 * 1024) {
      response.status(413).json({ error: 'El archivo de mantenimiento supera el límite de 35 MB.' });
      return;
    }

    const sourceHash = createHash('sha256').update(contents).digest('hex');
    const existingBatch = imports.findAppliedByHash('maintenance', sourceHash);
    if (existingBatch) {
      response.json({
        ...maintenance.getCurrentSummary(),
        duplicate: true,
        batchId: existingBatch.id,
        sourceName: existingBatch.sourceName,
        sourceHash,
      });
      return;
    }

    const batchId = imports.createBatch({
      domain: 'maintenance',
      sourceName: input.sourceName,
      sourceHash,
    });

    try {
      const stored = storeImportFile(dataDirectory, batchId, input.sourceName, contents);
      imports.addFile({
        batchId,
        fileName: input.sourceName,
        storedPath: stored.storedPath,
        contentHash: stored.contentHash,
        contentType: 'application/json',
        sizeBytes: stored.sizeBytes,
        contentBlob: contents,
      });
      const result = maintenance.importLegacyDatabase(batchId, input.database);
      response.status(201).json({
        duplicate: false,
        batchId,
        sourceName: input.sourceName,
        sourceHash,
        ...result,
      });
    } catch (error) {
      imports.markFailed(batchId);
      response.status(400).json({ error: error instanceof Error ? error.message : 'No se pudo importar mantenimiento.' });
    }
  });

  app.get('/api/maintenance/rules', (_request, response) => {
    response.json(maintenance.listCurrentRules());
  });

  app.post('/api/maintenance/rules', (request, response) => {
    const input = parseSaveMaintenanceRuleInput(request.body);
    if (!input) {
      response.status(400).json({ error: 'La regla requiere modelo, vida útil, óptimo base y merma válidos.' });
      return;
    }
    try {
      response.status(input.id ? 200 : 201).json(maintenance.saveCurrentRule(input));
    } catch (error) {
      response.status(400).json({ error: error instanceof Error ? error.message : 'No se pudo guardar la regla.' });
    }
  });

  app.delete('/api/maintenance/rules/:id', (request, response) => {
    if (!isNonEmptyString(request.params.id)) {
      response.status(400).json({ error: 'La regla indicada no es válida.' });
      return;
    }
    try {
      response.json({ deleted: maintenance.deleteCurrentRule(request.params.id) });
    } catch (error) {
      response.status(400).json({ error: error instanceof Error ? error.message : 'No se pudo eliminar la regla.' });
    }
  });

  app.post('/api/maintenance/rules/reset', (_request, response) => {
    try {
      response.json({ rules: maintenance.resetCurrentRules() });
    } catch (error) {
      response.status(400).json({ error: error instanceof Error ? error.message : 'No se pudieron restaurar las reglas.' });
    }
  });

  app.post('/api/maintenance/import-counters', async (request, response) => {
    const body = isRecord(request.body) ? request.body : {};
    if (!isNonEmptyString(body.sourceName) || !isNonEmptyString(body.contentBase64)) {
      response.status(400).json({ error: 'sourceName y contentBase64 son obligatorios.' });
      return;
    }

    const contents = decodeBase64(body.contentBase64);
    if (!contents) {
      response.status(400).json({ error: 'contentBase64 no es válido.' });
      return;
    }
    if (contents.byteLength > 35 * 1024 * 1024) {
      response.status(413).json({ error: 'El archivo de contadores supera el límite de 35 MB.' });
      return;
    }

    const sourceName = body.sourceName;
    const isCsv = sourceName.toLocaleLowerCase().endsWith('.csv');
    const isXlsx = sourceName.toLocaleLowerCase().endsWith('.xlsx');
    if (!isCsv && !isXlsx) {
      response.status(400).json({ error: 'El archivo debe ser CSV o XLSX. El formato XLS antiguo no se puede leer con el motor actual.' });
      return;
    }

    let parsed;
    try {
      parsed = isCsv
        ? parseMaintenanceCounterCsv(new TextDecoder().decode(contents))
        : await parseMaintenanceCounterWorkbook(contents);
    } catch (error) {
      response.status(400).json({ error: error instanceof Error ? error.message : 'No se pudo leer el archivo de contadores.' });
      return;
    }
    if (parsed.records.length === 0) {
      response.status(400).json({ error: parsed.skippedRows > 0 ? `No se encontraron lecturas válidas; se descartaron ${parsed.skippedRows} fila(s).` : 'No se encontraron filas de contadores válidas.' });
      return;
    }

    const sourceHash = createHash('sha256').update(contents).digest('hex');
    const existingBatch = imports.findAppliedByHash('maintenance', sourceHash);
    if (existingBatch) {
      response.json({
        ...maintenance.getCurrentSummary(),
        duplicate: true,
        skippedRows: parsed.skippedRows,
        batchId: existingBatch.id,
        sourceName: existingBatch.sourceName,
        sourceHash,
      });
      return;
    }

    const batchId = imports.createBatch({ domain: 'maintenance', sourceName, sourceHash });
    try {
      if (isCsv) {
        const stored = storeAndRegisterImportFile(dataDirectory, imports, batchId, sourceName, contents, 'text/csv');
        imports.addSourceRows(batchId, stored.id, parsed.sourceSheets);
      } else {
        await storeSpreadsheetImport(dataDirectory, imports, batchId, sourceName, contents);
      }

      const existingRules = maintenance.listCurrentRules();
      const models: LegacyMaintenanceModelInput[] = existingRules.length > 0
        ? existingRules.map((rule) => ({
            name: rule.modelLabel,
            usefulLife: rule.usefulLife,
            optimalBase: rule.optimalBase,
            maxWaste: rule.maxWaste,
          }))
        : DEFAULT_MAINTENANCE_RULES.map((rule) => ({ ...rule }));
      const result = maintenance.importLegacyDatabase(batchId, { models, records: parsed.records });
      response.status(201).json({
        duplicate: false,
        batchId,
        sourceName,
        sourceHash,
        skippedRows: parsed.skippedRows,
        sheets: parsed.sheets,
        ...result,
      });
    } catch (error) {
      imports.markFailed(batchId);
      response.status(400).json({ error: error instanceof Error ? error.message : 'No se pudo importar el archivo de contadores.' });
    }
  });

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

  app.get('/api/travel/summary', (_request, response) => {
    response.json(travel.getSummary());
  });

  app.get('/api/travel/trips', (request, response) => {
    const limit = request.query.limit === undefined ? undefined : parseListLimit(request.query.limit);
    if (limit === null) {
      response.status(400).json({ error: 'limit debe ser un entero entre 1 y 10000.' });
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

  app.get('/api/coverage/models', (_request, response) => {
    response.json(coverage.listModels());
  });

  app.post('/api/coverage/models', (request, response) => {
    const draft = parseCoverageModelDraft(request.body);
    if (!draft) {
      response.status(400).json({ error: 'El modelo Canon y sus rendimientos no son válidos.' });
      return;
    }
    try {
      response.status(201).json(coverage.saveModel(draft));
    } catch (error) {
      response.status(400).json({ error: error instanceof Error ? error.message : 'No se pudo guardar el modelo Canon.' });
    }
  });

  app.put('/api/coverage/models/:id', (request, response) => {
    const draft = parseCoverageModelDraft(request.body);
    if (!draft) {
      response.status(400).json({ error: 'El modelo Canon y sus rendimientos no son válidos.' });
      return;
    }
    try {
      response.json(coverage.saveModel(draft, request.params.id));
    } catch (error) {
      response.status(400).json({ error: error instanceof Error ? error.message : 'No se pudo actualizar el modelo Canon.' });
    }
  });

  app.delete('/api/coverage/models/:id', (request, response) => {
    try {
      coverage.removeModel(request.params.id);
      response.status(204).end();
    } catch (error) {
      response.status(404).json({ error: error instanceof Error ? error.message : 'El modelo Canon no existe.' });
    }
  });

  app.get('/api/coverage/last', (_request, response) => {
    response.json(coverage.getLastAnalysis());
  });

  app.post('/api/coverage/analyze', (request, response) => {
    const input = parseCoverageAnalysisInput(request.body);
    if (!input) {
      response.status(400).json({ error: 'Selecciona un PDF válido con páginas de cobertura analizables.' });
      return;
    }
    const documentCoverage = summarizeDocumentCoverage(input.pages);
    const analysis: CoverageAnalysis = coverage.saveAnalysis({
      sourceName: input.sourceName,
      coverage: documentCoverage,
      analyzedAt: new Date().toISOString(),
      inputMode: 'pdf',
      failedPages: input.failedPages,
    });
    const model = input.modelId ? coverage.listModels().find((item) => item.id === input.modelId) : undefined;
    response.json({ analysis, yieldEstimate: model ? calculateYield(model, documentCoverage.average) : null });
  });

  app.delete('/api/coverage/last', (_request, response) => {
    coverage.clearLastAnalysis();
    response.status(204).end();
  });

  app.get('/api/sales/pricing', (_request, response) => {
    response.json(sales.getPricing());
  });

  app.put('/api/sales/pricing', (request, response) => {
    const pricing = parsePricing(request.body);
    if (!pricing) {
      response.status(400).json({ error: 'exchangeRate, factor y laborPrice deben ser números válidos.' });
      return;
    }

    try {
      response.json(sales.savePricing(pricing));
    } catch (error) {
      response.status(400).json({ error: error instanceof Error ? error.message : 'No se pudo guardar la configuración.' });
    }
  });

  app.get('/api/sales/price-list', (request, response) => {
    response.json(sales.listPrice({
      query: queryString(request.query.query),
      familyName: queryString(request.query.familyName),
      modelName: queryString(request.query.modelName),
      stockOnly: request.query.stockOnly === 'true',
    }));
  });

  app.get('/api/sales/price-list-selection', (_request, response) => {
    response.json({ modelNames: sales.getPriceListSelection() });
  });

  app.put('/api/sales/price-list-selection', (request, response) => {
    const modelNames = parsePriceListSelection(isRecord(request.body) ? request.body.modelNames : undefined);
    if (!modelNames) {
      response.status(400).json({ error: 'La selección debe contener nombres de modelos válidos.' });
      return;
    }

    response.json({ modelNames: sales.savePriceListSelection(modelNames) });
  });

  app.get('/api/sales/catalogs', (_request, response) => {
    response.json(sales.getSalesCatalogs());
  });

  app.post('/api/sales/catalogs/:kind', (request, response) => {
    const kind = request.params.kind === 'consumibles' || request.params.kind === 'repuestos' ? request.params.kind : null;
    const body = isRecord(request.body) ? request.body : {};
    const snapshot = parseSalesCatalogSnapshot(body.snapshot, kind);
    const batchId = body.batchId === undefined ? undefined : body.batchId;
    if (!kind || !snapshot || batchId !== undefined && !isNonEmptyString(batchId)) {
      response.status(400).json({ error: 'El snapshot del catálogo de Proformas no es válido.' });
      return;
    }

    const batch = batchId ? imports.getBatch(batchId) : undefined;
    if (batchId && (!batch || batch.domain !== 'sales-catalog' || batch.status !== 'staged')) {
      response.status(409).json({ error: 'La importación del catálogo de Proformas no está disponible para aplicar.' });
      return;
    }

    try {
      const saved = sales.saveSalesCatalog({
        ...snapshot,
        meta: {
          ...snapshot.meta,
          ...(batchId ? { sourceBatchId: batchId } : {}),
        },
      });
      if (batchId) imports.markApplied(batchId);
      response.status(201).json(saved);
    } catch (error) {
      if (batchId) imports.markFailed(batchId);
      response.status(400).json({ error: error instanceof Error ? error.message : 'No se pudo guardar el catálogo de Proformas.' });
    }
  });

  app.get('/api/sales/open-contract', (_request, response) => {
    response.json(sales.getOpenContract());
  });

  app.post('/api/sales/open-contract', (request, response) => {
    const body = isRecord(request.body) ? request.body : {};
    const snapshot = parseOpenContractSnapshot(body.snapshot);
    const batchId = body.batchId === undefined ? undefined : body.batchId;
    if (!snapshot || batchId !== undefined && !isNonEmptyString(batchId)) {
      response.status(400).json({ error: 'El snapshot del contrato abierto no es válido.' });
      return;
    }

    const batch = batchId ? imports.getBatch(batchId) : undefined;
    if (batchId && (!batch || batch.domain !== 'sales-open-contract' || batch.status !== 'staged')) {
      response.status(409).json({ error: 'La importación del contrato abierto no está disponible para aplicar.' });
      return;
    }

    try {
      const saved = sales.saveOpenContract({
        ...snapshot,
        meta: {
          ...snapshot.meta,
          ...(batchId ? { sourceBatchId: batchId } : {}),
        },
      });
      if (batchId) imports.markApplied(batchId);
      response.status(201).json(saved);
    } catch (error) {
      if (batchId) imports.markFailed(batchId);
      response.status(400).json({ error: error instanceof Error ? error.message : 'No se pudo guardar el contrato abierto.' });
    }
  });

  app.get('/api/sales/proformas', (_request, response) => {
    response.json(sales.listProformas());
  });

  app.get('/api/sales/proformas/:id', (request, response) => {
    const proforma = sales.getProforma(request.params.id);
    if (!proforma) {
      response.status(404).json({ error: 'Proforma no encontrada.' });
      return;
    }
    response.json(proforma);
  });

  app.post('/api/sales/proformas', (request, response) => {
    const input = parseSaveProformaInput(request.body);
    if (!input) {
      response.status(400).json({ error: 'La cabecera y las líneas de la proforma no son válidas.' });
      return;
    }

    try {
      response.status(201).json(sales.saveProforma(input));
    } catch (error) {
      response.status(400).json({ error: error instanceof Error ? error.message : 'No se pudo guardar la proforma.' });
    }
  });

  if (options.staticDirectory && fs.existsSync(options.staticDirectory)) {
    app.use(express.static(options.staticDirectory));
    app.get('*', (request, response) => {
      if (request.path.startsWith('/api/')) {
        response.status(404).json({ error: 'Ruta API no encontrada.' });
        return;
      }
      response.sendFile(path.join(options.staticDirectory!, 'index.html'));
    });
  }

  return { app, database };
}

function storeAndRegisterImportFile(
  dataDirectory: string,
  imports: ImportRepository,
  batchId: string,
  fileName: string,
  contents: Uint8Array,
  contentType?: string,
) {
  const stored = storeImportFile(dataDirectory, batchId, fileName, contents);
  const id = imports.addFile({
    batchId,
    fileName,
    storedPath: stored.storedPath,
    contentHash: stored.contentHash,
    contentType,
    sizeBytes: stored.sizeBytes,
    contentBlob: contents,
  });
  return { id, ...stored };
}

function archiveBatchImportFiles(
  dataDirectory: string,
  batchId: string,
  imports: ImportRepository,
): ArchivedImportFile[] {
  const files = imports.listFiles(batchId);
  for (const file of files) {
    const storedContents = imports.getFileContent(file.id);
    const contents = storedContents ?? readStoredImportFile(dataDirectory, file.storedPath);
    if (!contents) {
      throw new Error(`No se puede archivar “${file.fileName}”: no está la copia física ni el original en SQLite.`);
    }
    if (contents.byteLength !== file.sizeBytes
      || createHash('sha256').update(contents).digest('hex') !== file.contentHash) {
      throw new Error(`No se puede archivar “${file.fileName}”: el original no coincide con su hash o tamaño.`);
    }
    if (!storedContents) imports.storeFileContent(file.id, contents);

    if (storedImportFileExists(dataDirectory, file.storedPath)) {
      const physicalContents = readStoredImportFile(dataDirectory, file.storedPath);
      if (!physicalContents
        || physicalContents.byteLength !== file.sizeBytes
        || createHash('sha256').update(physicalContents).digest('hex') !== file.contentHash) {
        throw new Error(`No se puede archivar “${file.fileName}”: la copia física no coincide con su original.`);
      }
    } else {
      writeStoredImportFile(dataDirectory, file.storedPath, contents);
    }
  }
  return archiveImportFiles(dataDirectory, batchId, files);
}

async function storeSpreadsheetImport(
  dataDirectory: string,
  imports: ImportRepository,
  batchId: string,
  fileName: string,
  contents: Uint8Array,
  contentType = 'application/vnd.openxmlformats-officedocument.spreadsheetml.sheet',
) {
  const sheets = await readWorkbookSheets(contents);
  const stored = storeImportFile(dataDirectory, batchId, fileName, contents);
  const id = imports.addFile({
    batchId,
    fileName,
    storedPath: stored.storedPath,
    contentHash: stored.contentHash,
    contentType,
    sizeBytes: stored.sizeBytes,
    contentBlob: contents,
  });
  const raw = imports.addSourceRows(batchId, id, sheets);
  return { id, ...stored, rawRows: raw.rows, rawSheets: raw.sheets };
}

async function hydrateStoredSpreadsheetRows(
  dataDirectory: string,
  imports: ImportRepository,
  batchId: string,
): Promise<void> {
  const hydratedFileIds = new Set(imports.listSourceSheets(batchId).map((source) => source.importFileId));

  for (const file of imports.listFiles(batchId)) {
    if (!isSpreadsheetFile(file.fileName, file.contentType)) continue;
    if (hydratedFileIds.has(file.id)) continue;
    const contents = imports.getFileContent(file.id)
      ?? readStoredImportFile(dataDirectory, file.storedPath);
    if (!contents) continue;

    const sheets = await readWorkbookSheets(contents);
    imports.addSourceRows(batchId, file.id, sheets);
    hydratedFileIds.add(file.id);
  }
}

function isSpreadsheetFile(fileName: string, contentType?: string | null): boolean {
  return contentType === 'application/vnd.openxmlformats-officedocument.spreadsheetml.sheet'
    || fileName.toLocaleLowerCase().endsWith('.xlsx');
}

function isNonNegativeInteger(value: unknown): value is number {
  return typeof value === 'number' && Number.isInteger(value) && value >= 0;
}

function isNonNegativeNumber(value: unknown): value is number {
  return typeof value === 'number' && Number.isFinite(value) && value >= 0;
}

function isOptionalNonNegativeNumber(value: unknown): value is number | null | undefined {
  return value === undefined || value === null || isNonNegativeNumber(value);
}

function isFiniteNumber(value: unknown): value is number {
  return typeof value === 'number' && Number.isFinite(value);
}

function isPositiveNumber(value: unknown): value is number {
  return typeof value === 'number' && Number.isFinite(value) && value > 0;
}

function decodeBase64(value: string): Uint8Array | null {
  if (!/^[a-zA-Z0-9+/]*={0,2}$/.test(value) || value.length % 4 !== 0) return null;
  const contents = Buffer.from(value, 'base64');
  return contents.byteLength > 0 ? new Uint8Array(contents) : null;
}

type ConsumablesBundleSourceId =
  | 'fleet.equipment'
  | 'fleet.contracts'
  | 'fleet.contract-details'
  | 'consumibles.detail'
  | 'consumibles.parts-detail'
  | 'consumibles.parts-usage'
  | 'consumibles.dispatch'
  | 'consumibles.parts-dispatch'
  | 'services.lam';

const CONSUMABLES_BUNDLE_SOURCE_IDS: readonly ConsumablesBundleSourceId[] = [
  'fleet.equipment',
  'fleet.contracts',
  'fleet.contract-details',
  'consumibles.detail',
  'consumibles.parts-detail',
  'consumibles.parts-usage',
  'consumibles.dispatch',
  'consumibles.parts-dispatch',
  'services.lam',
];

type PreparedBundleSource<
  SourceId extends ConsumablesBundleSourceId,
  Parsed,
> = {
  sourceId: SourceId;
  sourceName: string;
  contents: Uint8Array;
  sheets: WorkbookSheetRows[];
  parsed: Parsed;
};

type PreparedConsumablesBundleSource =
  | PreparedBundleSource<'fleet.equipment', LegacyPortfolioParseResult>
  | PreparedBundleSource<'fleet.contracts' | 'fleet.contract-details', LegacyFleetMetadataParseResult>
  | PreparedBundleSource<'consumibles.detail' | 'consumibles.parts-detail' | 'consumibles.parts-usage', {
    rows: ParsedConsumablesRow[];
    skippedOutOfScope: number;
  }>
  | PreparedBundleSource<'consumibles.dispatch' | 'consumibles.parts-dispatch', {
    rows: ParsedConsumablesOutputRow[];
    skippedOutOfScope: number;
  }>
  | PreparedBundleSource<'services.lam', {
    rows: ParsedServiceRow[];
    skippedOutOfScope: number;
  }>;

type StagedConsumablesBundleSource = {
  sourceId: ConsumablesBundleSourceId;
  sourceName: string;
  contents: Uint8Array;
};

type ConsumablesBundleCommitResult = {
  atomic: true;
  results: Array<Record<string, unknown> & {
    sourceId: ConsumablesBundleSourceId;
    sourceName: string;
    duplicate: boolean;
  }>;
};

function parseConsumablesBundleSourceId(value: unknown): ConsumablesBundleSourceId | null {
  return value === 'fleet.equipment'
    || value === 'fleet.contracts'
    || value === 'fleet.contract-details'
    || value === 'consumibles.detail'
    || value === 'consumibles.parts-detail'
    || value === 'consumibles.parts-usage'
    || value === 'consumibles.dispatch'
    || value === 'consumibles.parts-dispatch'
    || value === 'services.lam'
    ? value
    : null;
}

async function prepareConsumablesBundleSource(
  sourceId: ConsumablesBundleSourceId,
  sourceName: string,
  contents: Uint8Array,
): Promise<PreparedConsumablesBundleSource> {
  const sheets = await readWorkbookSheets(contents);
  switch (sourceId) {
    case 'fleet.equipment': {
      const parsed = await parseLegacyPortfolioWorkbook(contents);
      return { sourceId, sourceName, contents, sheets, parsed };
    }
    case 'fleet.contracts':
    case 'fleet.contract-details': {
      const sourceType = sourceId === 'fleet.contracts' ? 'contracts' : 'contract-details';
      const parsed = await parseLegacyFleetMetadataWorkbook(contents, sourceType);
      return { sourceId, sourceName, contents, sheets, parsed };
    }
    case 'consumibles.detail':
    case 'consumibles.parts-detail':
    case 'consumibles.parts-usage': {
      const sourceType = sourceId === 'consumibles.detail'
        ? 'consumibles'
        : sourceId === 'consumibles.parts-detail' ? 'repuestos' : 'uso-repuestos';
      const parsed = await parseConsumablesWorkbook(contents, sourceType);
      return { sourceId, sourceName, contents, sheets, parsed };
    }
    case 'consumibles.dispatch':
    case 'consumibles.parts-dispatch': {
      const sourceType = sourceId === 'consumibles.dispatch' ? 'salida-consumibles' : 'salida-repuestos';
      const parsed = await parseOutputsWorkbook(contents, sourceType);
      return { sourceId, sourceName, contents, sheets, parsed };
    }
    case 'services.lam': {
      const parsed = await parseServicesWorkbook(contents);
      return { sourceId, sourceName, contents, sheets, parsed };
    }
    default:
      throw new Error(`No existe una fuente de paquete para ${sourceName}.`);
  }
}

function getPreparedRowCount(source: PreparedConsumablesBundleSource): number {
  return source.parsed.rows.length;
}

function getPreparedSkippedRows(source: PreparedConsumablesBundleSource): number {
  return 'skippedRows' in source.parsed ? source.parsed.skippedRows : source.parsed.skippedOutOfScope;
}

function parseConsumablesBundleId(value: unknown): string | null {
  return typeof value === 'string' && /^[a-zA-Z0-9_-]{1,80}$/.test(value) ? value : null;
}

function hasZipContainerSignature(contents: Uint8Array): boolean {
  return contents.length >= 4
    && contents[0] === 0x50
    && contents[1] === 0x4b
    && ((contents[2] === 0x03 && contents[3] === 0x04)
      || (contents[2] === 0x05 && contents[3] === 0x06)
      || (contents[2] === 0x07 && contents[3] === 0x08));
}

function bundleStagingDirectory(dataDirectory: string, bundleId: string): string {
  return path.join(path.resolve(dataDirectory), 'imports', '.staging', bundleId);
}

function bundleStagedSourcePath(dataDirectory: string, bundleId: string, sourceId: ConsumablesBundleSourceId): string {
  const safeSourceId = sourceId.replaceAll('.', '_');
  return path.join(bundleStagingDirectory(dataDirectory, bundleId), `${safeSourceId}.xlsx`);
}

function bundleManifestPath(dataDirectory: string, bundleId: string): string {
  return path.join(bundleStagingDirectory(dataDirectory, bundleId), 'manifest.json');
}

function stageConsumablesBundleSource(
  dataDirectory: string,
  bundleId: string,
  sourceId: ConsumablesBundleSourceId,
  sourceName: string,
  contents: Uint8Array,
): void {
  const directory = bundleStagingDirectory(dataDirectory, bundleId);
  fs.mkdirSync(directory, { recursive: true });
  fs.writeFileSync(bundleStagedSourcePath(dataDirectory, bundleId, sourceId), Buffer.from(contents));

  let manifest: Partial<Record<ConsumablesBundleSourceId, { sourceName: string }>> = {};
  const manifestFile = bundleManifestPath(dataDirectory, bundleId);
  if (fs.existsSync(manifestFile)) {
    try {
      const parsed = JSON.parse(fs.readFileSync(manifestFile, 'utf8')) as unknown;
      if (isRecord(parsed)) {
        manifest = parsed as Partial<Record<ConsumablesBundleSourceId, { sourceName: string }>>;
      }
    } catch {
      manifest = {};
    }
  }
  manifest[sourceId] = { sourceName };
  fs.writeFileSync(manifestFile, JSON.stringify(manifest), 'utf8');
}

function readConsumablesBundleStaging(
  dataDirectory: string,
  bundleId: string,
): StagedConsumablesBundleSource[] {
  const manifestFile = bundleManifestPath(dataDirectory, bundleId);
  if (!fs.existsSync(manifestFile)) throw new Error('El paquete no tiene fuentes preparadas. Volvé a seleccionar los nueve archivos.');

  let manifest: unknown;
  try {
    manifest = JSON.parse(fs.readFileSync(manifestFile, 'utf8')) as unknown;
  } catch {
    throw new Error('El paquete temporal está dañado. Volvé a seleccionar los nueve archivos.');
  }
  if (!isRecord(manifest)) throw new Error('El manifiesto temporal del paquete no es válido.');

  return CONSUMABLES_BUNDLE_SOURCE_IDS.map((sourceId) => {
    const entry = manifest[sourceId];
    if (!isRecord(entry) || !isNonEmptyString(entry.sourceName)) {
      throw new Error(`Falta la fuente ${sourceId} en el paquete preparado.`);
    }
    const sourcePath = bundleStagedSourcePath(dataDirectory, bundleId, sourceId);
    if (!fs.existsSync(sourcePath)) throw new Error(`No se encuentra el archivo temporal de ${sourceId}.`);
    const contents = new Uint8Array(fs.readFileSync(sourcePath));
    if (contents.byteLength === 0) throw new Error(`El archivo temporal de ${sourceId} está vacío.`);
    if (contents.byteLength > 35 * 1024 * 1024) throw new Error(`La fuente ${sourceId} supera el límite de 35 MB.`);
    return { sourceId, sourceName: entry.sourceName, contents };
  });
}

function removeConsumablesBundleStaging(dataDirectory: string, bundleId: string): void {
  try {
    fs.rmSync(bundleStagingDirectory(dataDirectory, bundleId), { recursive: true, force: true });
  } catch {
    // La carga ya quedó protegida por la transacción; un staging huérfano no cambia sus datos.
  }
}

function commitConsumablesBundle(
  database: SuiteDatabase,
  dataDirectory: string,
  imports: ImportRepository,
  operations: OperationsRepository,
  consumables: ConsumablesRepository,
  services: ServiceRepository,
  sources: readonly PreparedConsumablesBundleSource[],
): ConsumablesBundleCommitResult {
  if (sources.length !== CONSUMABLES_BUNDLE_SOURCE_IDS.length) {
    throw new Error('El paquete debe contener exactamente las nueve fuentes preparadas.');
  }

  const plans = sources.map((source) => {
    const sourceHash = createHash('sha256').update(source.contents).digest('hex');
    const domain = bundleSourceDomain(source.sourceId);
    const existingBatch = imports.findAppliedByHash(domain, sourceHash);
    const sourceReplacementBatches = bundleReplacementBatches(imports, source.sourceId);
    return {
      source,
      sourceHash,
      existingBatch,
      replacementBatches: sourceReplacementBatches.filter((batch) => batch.id !== existingBatch?.id),
    };
  });
  const replacementBatches = new Map<string, ReturnType<ImportRepository['getBatch']>>();
  for (const plan of plans) {
    for (const batch of plan.replacementBatches) replacementBatches.set(batch.id, batch);
  }

  const archivedFiles: ArchivedImportFile[] = [];
  const storedFiles: Array<{ storedPath: string }> = [];
  try {
    for (const batch of replacementBatches.values()) {
      if (!batch) continue;
      archivedFiles.push(...archiveBatchImportFiles(dataDirectory, batch.id, imports));
    }

    const results = database.transaction(() => plans.map((plan) => {
      const { source, sourceHash, existingBatch } = plan;
      const rowCount = getPreparedRowCount(source);
      const skippedRows = getPreparedSkippedRows(source);
      if (existingBatch) {
        for (const replacementBatch of plan.replacementBatches) {
          imports.removeBatch(replacementBatch.id);
        }
        return {
          sourceId: source.sourceId,
          sourceName: source.sourceName,
          duplicate: true,
          batchId: existingBatch.id,
          sourceHash,
          rows: rowCount,
          skippedRows,
        };
      }

      const batchId = imports.createBatch({
        domain: bundleSourceDomain(source.sourceId),
        sourceName: source.sourceName,
        sourceType: bundleSourceType(source.sourceId),
        sourceHash,
      });
      const stored = storePreparedSpreadsheetImport(dataDirectory, imports, batchId, source.sourceName, source.contents, source.sheets);
      storedFiles.push({ storedPath: stored.storedPath });

      let imported: object;
      switch (source.sourceId) {
        case 'fleet.equipment':
          imported = operations.importLegacyPortfolio(batchId, source.parsed.rows);
          break;
        case 'fleet.contracts':
        case 'fleet.contract-details':
          imported = operations.importLegacyFleetMetadata(batchId, source.parsed.sourceType, source.parsed.rows);
          break;
        case 'consumibles.detail':
        case 'consumibles.parts-detail':
        case 'consumibles.parts-usage':
          imported = consumables.importRows(
            batchId,
            source.sourceName,
            bundleConsumablesSourceType(source.sourceId),
            source.parsed.rows,
            source.parsed.skippedOutOfScope,
            plan.replacementBatches.map((batch) => batch.id),
          );
          break;
        case 'consumibles.dispatch':
        case 'consumibles.parts-dispatch':
          imported = consumables.importOutputRows(
            batchId,
            source.sourceName,
            bundleConsumablesSourceType(source.sourceId),
            source.parsed.rows,
            source.parsed.skippedOutOfScope,
            plan.replacementBatches.map((batch) => batch.id),
          );
          break;
        case 'services.lam':
          imported = services.importRows(
            batchId,
            source.sourceName,
            source.parsed.rows,
            source.parsed.skippedOutOfScope,
            plan.replacementBatches.map((batch) => batch.id),
          );
          break;
      }

      return {
        sourceId: source.sourceId,
        sourceName: source.sourceName,
        duplicate: false,
        batchId,
        sourceHash,
        rows: rowCount,
        skippedRows,
        rawRows: stored.rawRows,
        rawSheets: stored.rawSheets,
        ...imported,
      };
    }))();

    return { atomic: true, results };
  } catch (error) {
    restoreArchivedImportFiles(dataDirectory, archivedFiles);
    removeStoredImportFiles(dataDirectory, storedFiles);
    throw error;
  }
}

function storePreparedSpreadsheetImport(
  dataDirectory: string,
  imports: ImportRepository,
  batchId: string,
  fileName: string,
  contents: Uint8Array,
  sheets: readonly WorkbookSheetRows[],
) {
  const stored = storeImportFile(
    dataDirectory,
    batchId,
    fileName,
    contents,
  );
  try {
    const id = imports.addFile({
      batchId,
      fileName,
      storedPath: stored.storedPath,
      contentHash: stored.contentHash,
      contentType: 'application/vnd.openxmlformats-officedocument.spreadsheetml.sheet',
      sizeBytes: stored.sizeBytes,
      contentBlob: contents,
    });
    const raw = imports.addSourceRows(batchId, id, sheets);
    return { id, ...stored, rawRows: raw.rows, rawSheets: raw.sheets };
  } catch (error) {
    removeStoredImportFiles(dataDirectory, [stored]);
    throw error;
  }
}

function removeStoredImportFiles(dataDirectory: string, files: readonly { storedPath: string }[]): void {
  const dataRoot = path.resolve(dataDirectory);
  for (const file of files) {
    const absolutePath = path.resolve(dataRoot, file.storedPath);
    const relativePath = path.relative(dataRoot, absolutePath);
    if (!relativePath || relativePath.startsWith('..') || path.isAbsolute(relativePath)) continue;
    if (fs.existsSync(absolutePath)) fs.unlinkSync(absolutePath);
  }
}

function bundleSourceDomain(sourceId: ConsumablesBundleSourceId): string {
  if (sourceId === 'fleet.equipment') return 'operations';
  if (sourceId === 'fleet.contracts') return 'operations-fleet-contracts';
  if (sourceId === 'fleet.contract-details') return 'operations-fleet-contract-details';
  if (sourceId === 'services.lam') return 'services';
  return 'consumibles';
}

function bundleSourceType(sourceId: ConsumablesBundleSourceId): string {
  if (sourceId === 'fleet.equipment') return 'fleet.equipment';
  if (sourceId === 'fleet.contracts') return 'contracts';
  if (sourceId === 'fleet.contract-details') return 'contract-details';
  if (sourceId === 'services.lam') return 'servicios';
  return bundleConsumablesSourceType(sourceId);
}

function bundleConsumablesSourceType(
  sourceId: Exclude<ConsumablesBundleSourceId, 'fleet.equipment' | 'fleet.contracts' | 'fleet.contract-details' | 'services.lam'>,
): ConsumablesSourceType {
  switch (sourceId) {
    case 'consumibles.detail': return 'consumibles';
    case 'consumibles.parts-detail': return 'repuestos';
    case 'consumibles.parts-usage': return 'uso-repuestos';
    case 'consumibles.dispatch': return 'salida-consumibles';
    case 'consumibles.parts-dispatch': return 'salida-repuestos';
  }
}

function bundleReplacementBatches(
  imports: ImportRepository,
  sourceId: ConsumablesBundleSourceId,
): ReturnType<ImportRepository['listAppliedBySourceType']> {
  if (sourceId === 'services.lam') {
    const typed = imports.listAppliedBySourceType('services', 'servicios');
    return typed.length > 0 ? typed : imports.listApplied('services');
  }
  const sourceType = sourceId === 'fleet.equipment'
    || sourceId === 'fleet.contracts'
    || sourceId === 'fleet.contract-details'
    ? null
    : bundleConsumablesSourceType(sourceId);
  return sourceType ? imports.listAppliedBySourceType('consumibles', sourceType) : [];
}

function makeBackupFileName(): string {
  const timestamp = new Date().toISOString().replaceAll(':', '-').replaceAll('.', '-');
  return `dcss-suite-backup-${timestamp}.sqlite`;
}

function removeTemporaryDirectory(directory: string | null): void {
  if (!directory) return;
  fs.rmSync(directory, { recursive: true, force: true });
}

function parseCatalogParts(value: unknown): CatalogPartInput[] | null {
  if (!Array.isArray(value)) return null;

  const parsed: CatalogPartInput[] = [];
  for (const item of value) {
    if (!isRecord(item)) return null;
    const models = item.models;
    const discontinuedAt = item.discontinuedAt;
    const legacyTextFields = ['group', 'reference', 'usefulLife'] as const;
    if (
      !isNonEmptyString(item.brand) ||
      typeof item.description !== 'string' ||
      !isNonEmptyString(item.code) ||
      !Array.isArray(models) ||
      !models.every(isNonEmptyString) ||
      !isNonNegativeInteger(item.stock) ||
      !isNonNegativeNumber(item.priceUsd) ||
      !isNonNegativeNumber(item.priceLocal) ||
      !isNonNegativeNumber(item.markup) ||
      (item.costAvailable !== undefined && typeof item.costAvailable !== 'boolean') ||
      (discontinuedAt !== null && discontinuedAt !== undefined && !isNonEmptyString(discontinuedAt))
      || !legacyTextFields.every((field) => isOptionalCatalogText(item[field]))
    ) {
      return null;
    }

    parsed.push({
      brand: item.brand,
      code: item.code,
      description: item.description,
      models,
      stock: item.stock,
      priceUsd: item.priceUsd,
      priceLocal: item.priceLocal,
      markup: item.markup,
      discontinuedAt: discontinuedAt === undefined ? null : discontinuedAt,
      costAvailable: item.costAvailable === undefined ? undefined : item.costAvailable,
      group: parseOptionalCatalogText(item.group),
      reference: parseOptionalCatalogText(item.reference),
      usefulLife: parseOptionalCatalogText(item.usefulLife),
    });
  }
  return parsed;
}

function isOptionalCatalogText(value: unknown): boolean {
  return value === undefined || value === null || isNonEmptyString(value) && value.length <= 500;
}

function parseOptionalCatalogText(value: unknown): string | null | undefined {
  if (value === undefined) return undefined;
  if (value === null) return null;
  return (value as string).trim();
}

function parseCatalogModelFamilies(value: unknown): CatalogModelFamilyInput[] | null {
  if (value === undefined) return [];
  if (!Array.isArray(value) || value.length > 100_000) return null;

  const parsed: CatalogModelFamilyInput[] = [];
  for (const item of value) {
    if (!isRecord(item)
      || !isNonEmptyString(item.brand)
      || !isNonEmptyString(item.familyName)
      || !isNonEmptyString(item.modelName)
      || item.brand.length > 500
      || item.familyName.length > 500
      || item.modelName.length > 500
      || !isOptionalPositiveNumber(item.exchangeRate)
      || !isOptionalPositiveNumber(item.factor)) {
      return null;
    }
    parsed.push({
      brand: item.brand,
      familyName: item.familyName,
      modelName: item.modelName,
      exchangeRate: parseOptionalPositiveNumber(item.exchangeRate),
      factor: parseOptionalPositiveNumber(item.factor),
    });
  }
  return parsed;
}

function isOptionalPositiveNumber(value: unknown): value is number | null | undefined {
  return value === undefined || value === null || isNonNegativeNumber(value) && value > 0;
}

function parseOptionalPositiveNumber(value: unknown): number | null | undefined {
  if (value === undefined) return undefined;
  if (value === null) return null;
  return value as number;
}

function parseCatalogModelNotes(value: unknown): CatalogModelNoteInput[] | null {
  if (value === undefined) return [];
  if (!Array.isArray(value) || value.length > 20_000) return null;

  const parsed: CatalogModelNoteInput[] = [];
  for (const item of value) {
    if (!isRecord(item)
      || !isNonEmptyString(item.brand)
      || !isNonEmptyString(item.familyName)
      || !isNonEmptyString(item.modelName)
      || !isNonEmptyString(item.note)
      || item.note.length > 5_000) {
      return null;
    }
    parsed.push({
      brand: item.brand,
      familyName: item.familyName,
      modelName: item.modelName,
      note: item.note,
    });
  }
  return parsed;
}

function parseCatalogServiceItems(value: unknown): CatalogServiceItemInput[] | null {
  if (value === undefined) return [];
  if (!Array.isArray(value) || value.length > 100_000) return null;

  const parsed: CatalogServiceItemInput[] = [];
  for (const item of value) {
    if (!isRecord(item)
      || !isNonEmptyString(item.brand)
      || !isNonEmptyString(item.familyName)
      || !isNonEmptyString(item.modelName)
      || !isNonEmptyString(item.description)
      || item.description.length > 5_000
      || (item.kind !== 'labor' && item.kind !== 'fixed')) {
      return null;
    }

    const fixedPriceLocal = item.fixedPriceLocal === undefined ? null : item.fixedPriceLocal;
    if (!isOptionalNonNegativeNumber(fixedPriceLocal)
      || item.kind === 'fixed' && fixedPriceLocal === null) {
      return null;
    }

    parsed.push({
      brand: item.brand,
      familyName: item.familyName,
      modelName: item.modelName,
      kind: item.kind,
      description: item.description,
      fixedPriceLocal,
    });
  }
  return parsed;
}

function queryString(value: unknown): string | undefined {
  return typeof value === 'string' ? value : undefined;
}

function parseOperationalFilters(value: unknown): OperationalFilters {
  if (!isRecord(value)) return {};
  return {
    sector: queryString(value.sector),
    department: queryString(value.department),
    contractType: queryString(value.contractType),
    dateFrom: queryString(value.dateFrom),
    dateTo: queryString(value.dateTo),
  };
}

function parseAnalysisMonths(value: unknown): number | null {
  if (value === undefined) return 3;
  if (typeof value !== 'string' || !/^\d+$/.test(value)) return null;
  const months = Number(value);
  return Number.isInteger(months) && months >= 1 && months <= 12 ? months : null;
}

function parseConsumablesSourceType(value: unknown): ConsumablesSourceType | null {
  return typeof value === 'string' && CONSUMABLES_SOURCE_TYPES.includes(value as ConsumablesSourceType)
    ? value as ConsumablesSourceType
    : null;
}

function parseServiceSourceType(value: unknown): ServiceSourceType | null {
  return typeof value === 'string' && SERVICE_SOURCE_TYPES.includes(value as ServiceSourceType)
    ? value as ServiceSourceType
    : null;
}

function parseLegacyFleetMetadataSourceType(value: unknown): LegacyFleetMetadataType | null {
  return typeof value === 'string' && LEGACY_FLEET_METADATA_TYPES.includes(value as LegacyFleetMetadataType)
    ? value as LegacyFleetMetadataType
    : null;
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

function parseOptionalPositiveInteger(value: unknown, fallback: number): number | null {
  if (value === undefined) return fallback;
  if (typeof value !== 'string' || !/^\d+$/.test(value)) return null;
  const parsed = Number(value);
  return isPositiveInteger(parsed) ? parsed : null;
}

function parseOptionalNonNegativeInteger(value: unknown, fallback: number): number | null {
  if (value === undefined) return fallback;
  if (typeof value !== 'string' || !/^\d+$/.test(value)) return null;
  const parsed = Number(value);
  return isNonNegativeInteger(parsed) ? parsed : null;
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

function parseCoverageModelDraft(value: unknown): CanonModelDraft | null {
  if (!isRecord(value) || !isNonEmptyString(value.name) || (value.colorType !== 'mono' && value.colorType !== 'color')) return null;
  if (!isRecord(value.nominalYield) || !isPositiveNumber(value.nominalYield.black)) return null;
  const nominalYield = value.nominalYield;
  if (value.colorType === 'color' && (!isPositiveNumber(nominalYield.cyan) || !isPositiveNumber(nominalYield.magenta) || !isPositiveNumber(nominalYield.yellow))) return null;
  return {
    name: value.name,
    colorType: value.colorType,
    nominalYield: value.colorType === 'mono'
      ? { black: nominalYield.black as number }
      : { black: nominalYield.black as number, cyan: nominalYield.cyan as number, magenta: nominalYield.magenta as number, yellow: nominalYield.yellow as number },
  };
}

function parseCoverageAnalysisInput(value: unknown): { sourceName: string; pages: ReturnType<typeof normalizePageCoverage>[]; failedPages: CoveragePageFailure[]; modelId?: string } | null {
  if (!isRecord(value) || value.inputMode !== 'pdf' || !isNonEmptyString(value.sourceName) || !Array.isArray(value.pages) || value.pages.length === 0 || value.pages.length > 2000) return null;
  if (value.modelId !== undefined && !isNonEmptyString(value.modelId)) return null;
  if (value.failedPages !== undefined && (!Array.isArray(value.failedPages) || value.failedPages.length > 2000)) return null;
  const pages = [] as ReturnType<typeof normalizePageCoverage>[];
  for (const item of value.pages) {
    if (!isRecord(item) || !isPositiveInteger(item.page) || !isNonNegativeNumber(item.black) || !isNonNegativeNumber(item.cyan) || !isNonNegativeNumber(item.magenta) || !isNonNegativeNumber(item.yellow)) return null;
    try {
      pages.push(normalizePageCoverage({ page: item.page, black: item.black, cyan: item.cyan, magenta: item.magenta, yellow: item.yellow }));
    } catch {
      return null;
    }
  }
  const failedPages: CoveragePageFailure[] = [];
  for (const item of value.failedPages ?? []) {
    if (!isRecord(item) || !isPositiveInteger(item.page) || !isNonEmptyString(item.message)) return null;
    failedPages.push({ page: item.page, message: item.message.slice(0, 1000) });
  }
  return { sourceName: value.sourceName, pages, failedPages, modelId: value.modelId as string | undefined };
}

function parseConsumablesRecordKind(value: unknown): ConsumablesRecordKind | undefined | null {
  if (value === undefined) return undefined;
  return value === 'consumable' || value === 'part' ? value : null;
}

function parseListLimit(value: unknown): number | null {
  if (value === undefined) return 500;
  if (typeof value !== 'string' || !/^\d+$/.test(value)) return null;
  const limit = Number(value);
  return Number.isInteger(limit) && limit >= 1 && limit <= 10000 ? limit : null;
}

function parsePageRequest(pageValue: unknown, pageSizeValue: unknown): { page: number; pageSize: number } | null {
  const page = pageValue === undefined ? 1 : parsePositiveInteger(pageValue);
  const pageSize = pageSizeValue === undefined ? 50 : parsePositiveInteger(pageSizeValue);
  if (page === null || page > 1_000_000 || pageSize === null || pageSize > 100) return null;
  return { page, pageSize };
}

function parsePositiveInteger(value: unknown): number | null {
  if (typeof value !== 'string' || !/^\d+$/.test(value)) return null;
  const number = Number(value);
  return Number.isSafeInteger(number) && number >= 1 ? number : null;
}

function parseRawRowsLimit(value: unknown): number | null {
  if (value === undefined) return 100;
  if (typeof value !== 'string' || !/^\d+$/.test(value)) return null;
  const limit = Number(value);
  return Number.isInteger(limit) && limit >= 1 && limit <= 500 ? limit : null;
}

function parseRawRowsOffset(value: unknown): number | null {
  if (value === undefined) return 0;
  if (typeof value !== 'string' || !/^\d+$/.test(value)) return null;
  const offset = Number(value);
  return Number.isInteger(offset) && offset >= 0 && offset <= 1_000_000 ? offset : null;
}

function parseLegacyMaintenanceImport(value: unknown): {
  sourceName: string;
  contentBase64: string;
  database: LegacyMaintenanceDatabaseInput;
} | null {
  if (!isRecord(value) || !isNonEmptyString(value.sourceName) || !isNonEmptyString(value.contentBase64) || !isRecord(value.database)) return null;
  const database = value.database;
  if (!Array.isArray(database.models) || !Array.isArray(database.records)) return null;

  const models: LegacyMaintenanceModelInput[] = [];
  for (const item of database.models) {
    if (!isRecord(item) || !isNonEmptyString(item.name) || !isPositiveInteger(item.vidaUtil) || !isNonNegativeInteger(item.optimoBase) || !isFiniteFraction(item.mermaMax)) return null;
    models.push({ name: item.name, usefulLife: item.vidaUtil, optimalBase: item.optimoBase, maxWaste: item.mermaMax });
  }

  const records: LegacyMaintenanceRecordInput[] = [];
  for (const item of database.records) {
    if (
      !isRecord(item) ||
      !isNonEmptyString(item.cliente) ||
      !isNonEmptyString(item.equipo) ||
      !isNonEmptyString(item.nserie) ||
      !isNonEmptyString(item.periodo) ||
      !isNonNegativeNumber(item.copias) ||
      !isNonNegativeNumber(item.contador) ||
      (item.ov !== undefined && typeof item.ov !== 'string') ||
      (item.papel !== undefined && typeof item.papel !== 'string')
    ) return null;
    records.push({
      customerName: item.cliente,
      contractReference: typeof item.ov === 'string' ? item.ov : '',
      modelLabel: item.equipo,
      serialNumber: item.nserie,
      period: item.periodo,
      paperType: typeof item.papel === 'string' ? item.papel : '',
      copies: item.copias,
      counter: item.contador,
    });
  }

  return { sourceName: value.sourceName, contentBase64: value.contentBase64, database: { models, records } };
}

function parseSaveMaintenanceRuleInput(value: unknown): SaveMaintenanceRuleInput | null {
  if (!isRecord(value) || !isNonEmptyString(value.modelLabel)) return null;
  if (!isPositiveInteger(value.usefulLife) || !isNonNegativeInteger(value.optimalBase) || !isFiniteFraction(value.maxWaste)) return null;
  if (value.id !== undefined && !isNonEmptyString(value.id)) return null;
  return {
    id: typeof value.id === 'string' ? value.id : undefined,
    modelLabel: value.modelLabel,
    usefulLife: value.usefulLife,
    optimalBase: value.optimalBase,
    maxWaste: value.maxWaste,
  };
}

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

function isFiniteFraction(value: unknown): value is number {
  return typeof value === 'number' && Number.isFinite(value) && value >= 0 && value <= 1;
}

function parsePricing(value: unknown): PricingSettings | null {
  if (!isRecord(value)) return null;
  if (
    !isPositiveNumber(value.exchangeRate) ||
    !isPositiveNumber(value.factor) ||
    !isNonNegativeNumber(value.laborPrice)
  ) {
    return null;
  }
  return {
    exchangeRate: value.exchangeRate,
    factor: value.factor,
    laborPrice: value.laborPrice,
  };
}

function parsePriceListSelection(value: unknown): string[] | null {
  if (!Array.isArray(value) || value.length > 500) return null;
  const modelNames: string[] = [];
  for (const item of value) {
    if (!isNonEmptyString(item) || item.trim().length > 160) return null;
    const normalized = item.trim().replace(/\s+/g, ' ');
    if (!modelNames.some((current) => current.localeCompare(normalized, undefined, { sensitivity: 'base' }) === 0)) {
      modelNames.push(normalized);
    }
  }
  return modelNames;
}

function parseSaveCustomerInput(value: unknown): SaveCustomerInput | null {
  if (!isRecord(value) || !isNonEmptyString(value.name)) return null;
  if (value.id !== undefined && !isNonEmptyString(value.id)) return null;
  if (!isOptionalText(value.customerType) || !isOptionalText(value.commercialArea)) return null;

  const customerType = parseOptionalEnum(value.customerType, CUSTOMER_TYPES);
  const commercialArea = parseOptionalEnum(value.commercialArea, COMMERCIAL_AREAS);
  if (customerType === INVALID_VALUE || commercialArea === INVALID_VALUE) return null;

  return {
    id: value.id as string | undefined,
    name: value.name,
    customerType,
    commercialArea,
  };
}

function parseSaveContractInput(value: unknown): SaveContractInput | null {
  if (!isRecord(value) || !isNonEmptyString(value.customerId) || !isNonEmptyString(value.contractType)) return null;
  if (value.id !== undefined && !isNonEmptyString(value.id)) return null;
  if (!Array.isArray(value.equipment)) return null;
  if (!isOptionalText(value.reference) || !isOptionalText(value.orderReference) || !isOptionalText(value.startsAt) || !isOptionalText(value.endsAt) || !isOptionalText(value.commercialArea) || !isOptionalText(value.division)) return null;
  if (!isOptionalBoolean(value.isActive) || !isOptionalBoolean(value.requiresClosure)) return null;

  const contractType = CONTRACT_TYPES.includes(value.contractType as (typeof CONTRACT_TYPES)[number])
    ? value.contractType as (typeof CONTRACT_TYPES)[number]
    : null;
  if (!contractType) return null;
  const commercialArea = parseOptionalEnum(value.commercialArea, COMMERCIAL_AREAS);
  if (commercialArea === INVALID_VALUE) return null;

  const equipment: SaveEquipmentInput[] = [];
  for (const item of value.equipment) {
    if (!isRecord(item) || !isNonEmptyString(item.modelLabel)) return null;
    if (item.id !== undefined && !isNonEmptyString(item.id)) return null;
    if (!isOptionalText(item.serialNumber) || !isOptionalText(item.location) || !isOptionalText(item.brand) || !isOptionalText(item.description) || !isOptionalText(item.interior) || !isOptionalText(item.city) || !isOptionalText(item.branch) || !isOptionalText(item.address) || !isOptionalBoolean(item.isActive)) return null;
    equipment.push({
      id: item.id as string | undefined,
      modelLabel: item.modelLabel,
      serialNumber: optionalText(item.serialNumber),
      location: optionalText(item.location),
      brand: optionalText(item.brand),
      description: optionalText(item.description),
      interior: optionalText(item.interior),
      city: optionalText(item.city),
      branch: optionalText(item.branch),
      address: optionalText(item.address),
      isActive: optionalBoolean(item.isActive),
    });
  }

  return {
    id: value.id as string | undefined,
    customerId: value.customerId,
    reference: optionalText(value.reference),
    orderReference: optionalText(value.orderReference),
    contractType,
    startsAt: optionalText(value.startsAt),
    endsAt: optionalText(value.endsAt),
    commercialArea,
    division: optionalText(value.division),
    isActive: optionalBoolean(value.isActive),
    requiresClosure: optionalBoolean(value.requiresClosure),
    equipment,
  };
}

const INVALID_VALUE = Symbol('invalid-value');

function parseOptionalEnum<T extends string>(value: unknown, values: readonly T[]): T | null | typeof INVALID_VALUE {
  if (value === undefined || value === null || value === '') return null;
  return typeof value === 'string' && values.includes(value as T) ? value as T : INVALID_VALUE;
}

function isOptionalText(value: unknown): value is string | null | undefined {
  return value === undefined || value === null || typeof value === 'string';
}

function isOptionalBoolean(value: unknown): value is boolean | null | undefined {
  return value === undefined || value === null || typeof value === 'boolean';
}

function optionalText(value: unknown): string | null | undefined {
  if (value === undefined || value === null) return value;
  return typeof value === 'string' ? value.trim() || null : undefined;
}

function optionalBoolean(value: unknown): boolean | null | undefined {
  return value === undefined || value === null || typeof value === 'boolean' ? value : undefined;
}

function parseSalesCatalogSnapshot(value: unknown, expectedKind: 'consumibles' | 'repuestos' | null): SalesCatalogSnapshot | null {
  if (!expectedKind || !isRecord(value) || !isRecord(value.meta) || !Array.isArray(value.items)) return null;
  const meta = value.meta;
  if (
    meta.kind !== expectedKind ||
    !isNonEmptyString(meta.fileName) ||
    !isNonEmptyString(meta.updatedAt) ||
    !isNonNegativeInteger(meta.rowCount) ||
    !isNonNegativeInteger(meta.invalidRows) ||
    !isNonNegativeInteger(meta.duplicateRows) ||
    typeof meta.hasDiscontinuedColumn !== 'boolean'
  ) {
    return null;
  }

  const items: SalesCatalogSnapshot['items'] = [];
  for (const valueItem of value.items) {
    if (!isRecord(valueItem)) return null;
    const priceUsd = valueItem.priceUsd === null || valueItem.priceUsd === undefined
      ? null
      : isNonNegativeNumber(valueItem.priceUsd) ? valueItem.priceUsd : undefined;
    const priceLocal = valueItem.priceLocal === null || valueItem.priceLocal === undefined
      ? null
      : isNonNegativeNumber(valueItem.priceLocal) ? valueItem.priceLocal : undefined;
    const stock = valueItem.stock === null || valueItem.stock === undefined
      ? null
      : isNonNegativeNumber(valueItem.stock) ? valueItem.stock : undefined;
    if (
      !isNonEmptyString(valueItem.id) ||
      !isNonEmptyString(valueItem.code) ||
      typeof valueItem.description !== 'string' ||
      typeof valueItem.group !== 'string' ||
      valueItem.kind !== expectedKind ||
      valueItem.discontinued !== 'active' && valueItem.discontinued !== 'discontinued' && valueItem.discontinued !== 'unknown' ||
      priceUsd === undefined ||
      priceLocal === undefined ||
      stock === undefined
    ) {
      return null;
    }
    items.push({
      id: valueItem.id,
      kind: expectedKind,
      code: valueItem.code,
      description: valueItem.description,
      group: valueItem.group,
      priceUsd,
      priceLocal,
      stock,
      discontinued: valueItem.discontinued,
    });
  }

  if (items.length === 0) return null;
  return {
    meta: {
      kind: expectedKind,
      fileName: meta.fileName,
      updatedAt: meta.updatedAt,
      rowCount: meta.rowCount,
      invalidRows: meta.invalidRows,
      duplicateRows: meta.duplicateRows,
      hasDiscontinuedColumn: meta.hasDiscontinuedColumn,
      ...(isNonEmptyString(meta.sourceBatchId) ? { sourceBatchId: meta.sourceBatchId } : {}),
    },
    items,
  };
}

function parseOpenContractSnapshot(value: unknown): OpenContractSnapshot | null {
  if (!isRecord(value) || !isRecord(value.meta) || !Array.isArray(value.items)) return null;
  const meta = value.meta;
  const priceCurrency: ContractPriceCurrency | null = meta.priceCurrency === 'local' || meta.priceCurrency === 'usd'
    ? meta.priceCurrency
    : null;
  const sourceFormat = meta.sourceFormat === 'xlsx' || meta.sourceFormat === 'pdf' ? meta.sourceFormat : null;
  if (
    !isNonEmptyString(meta.fileName) ||
    !isNonEmptyString(meta.updatedAt) ||
    !isNonNegativeInteger(meta.invalidRows) ||
    !isNonNegativeInteger(meta.duplicateRows) ||
    typeof meta.hasKindColumn !== 'boolean' ||
    !priceCurrency ||
    !sourceFormat
  ) {
    return null;
  }

  const items: OpenContractSnapshot['items'] = [];
  for (const valueItem of value.items) {
    if (!isRecord(valueItem)) return null;
    const priceUsd = valueItem.priceUsd === null || valueItem.priceUsd === undefined
      ? null
      : isNonNegativeNumber(valueItem.priceUsd) ? valueItem.priceUsd : undefined;
    const priceLocal = valueItem.priceLocal === null || valueItem.priceLocal === undefined
      ? null
      : isNonNegativeNumber(valueItem.priceLocal) ? valueItem.priceLocal : undefined;
    if (
      !isNonEmptyString(valueItem.id) ||
      !isNonEmptyString(valueItem.code) ||
      typeof valueItem.description !== 'string' ||
      typeof valueItem.group !== 'string' ||
      (valueItem.kind !== 'consumibles' && valueItem.kind !== 'repuestos') ||
      priceUsd === undefined ||
      priceLocal === undefined ||
      priceUsd === null && priceLocal === null ||
      priceCurrency === 'usd' && priceUsd === null ||
      priceCurrency === 'local' && priceLocal === null
    ) {
      return null;
    }
    items.push({
      id: valueItem.id,
      kind: valueItem.kind,
      code: valueItem.code,
      description: valueItem.description,
      group: valueItem.group,
      priceUsd,
      priceLocal,
    });
  }

  if (items.length === 0) return null;
  return {
    meta: {
      fileName: meta.fileName,
      updatedAt: meta.updatedAt,
      rowCount: items.length,
      invalidRows: meta.invalidRows,
      duplicateRows: meta.duplicateRows,
      sourceFormat,
      priceCurrency,
      hasKindColumn: meta.hasKindColumn,
      ...(isNonEmptyString(meta.sourceBatchId) ? { sourceBatchId: meta.sourceBatchId } : {}),
    },
    items,
  };
}

function parseSaveProformaInput(value: unknown): SaveProformaInput | null {
  if (!isRecord(value) || !isRecord(value.header) || !Array.isArray(value.lines)) return null;
  const header = value.header;
  const mode = header.mode === 'contrato-abierto' ? 'contrato-abierto' : header.mode === 'sin-contrato' ? 'sin-contrato' : null;
  if (!mode) return null;

    const lines: ProformaLineInput[] = [];
    for (const line of value.lines) {
      if (!isRecord(line) || !isPositiveInteger(line.quantity)) return null;
      if (line.kind === 'labor') {
        if (line.description !== undefined && typeof line.description !== 'string') return null;
        if (!isOptionalNonNegativeNumber(line.costLocal)
          || !isOptionalNonNegativeNumber(line.unitPriceUsd)
          || !isOptionalNonNegativeNumber(line.unitPriceLocal)) return null;
        lines.push({
          kind: 'labor',
          description: line.description,
          costLocal: line.costLocal === undefined ? null : line.costLocal,
          unitPriceUsd: line.unitPriceUsd === undefined ? null : line.unitPriceUsd,
          unitPriceLocal: line.unitPriceLocal === undefined ? null : line.unitPriceLocal,
          quantity: line.quantity,
        });
      continue;
    }
    if (line.kind !== 'part') return null;
    if (isNonEmptyString(line.partId)) {
      if (line.source !== undefined && line.source !== 'shared') return null;
      lines.push({ kind: 'part', partId: line.partId, quantity: line.quantity });
      continue;
    }
    const isContractLine = mode === 'contrato-abierto' && (line.source === undefined || line.source === 'contract');
    const isProformasCatalogLine = mode === 'sin-contrato' && line.source === 'proformas';
    if ((!isContractLine && !isProformasCatalogLine) || !isNonEmptyString(line.code) || typeof line.description !== 'string') return null;
    if (!isOptionalNonNegativeNumber(line.unitPriceUsd) || !isOptionalNonNegativeNumber(line.unitPriceLocal)) return null;
    if (line.unitPriceUsd == null && line.unitPriceLocal == null) return null;
    lines.push({
      kind: 'part',
      source: isProformasCatalogLine ? 'proformas' : 'contract',
      code: line.code,
      description: line.description,
      unitPriceUsd: line.unitPriceUsd === undefined ? null : line.unitPriceUsd,
      unitPriceLocal: line.unitPriceLocal === undefined ? null : line.unitPriceLocal,
      quantity: line.quantity,
    });
  }

  const status = value.status === undefined ? undefined : value.status === 'issued' || value.status === 'draft' ? value.status : null;
  if (status === null) return null;
  const currency = value.currency === undefined
    ? undefined
    : value.currency === 'USD' || value.currency === 'PYG' ? value.currency : null;
  if (currency === null) return null;

  return {
    id: value.id === undefined ? undefined : isNonEmptyString(value.id) ? value.id : undefined,
    header: {
      customerName: optionalString(header.customerName),
      customerContact: optionalString(header.customerContact),
      serviceReport: optionalString(header.serviceReport),
      serviceReportNumber: optionalString(header.serviceReportNumber),
      reference: optionalString(header.reference),
      issuedAt: optionalString(header.issuedAt),
      attendedBy: optionalString(header.attendedBy),
      modelName: optionalString(header.modelName),
      serialNumber: optionalString(header.serialNumber),
      mode,
    },
    lines,
    status,
    currency,
  };
}

function optionalString(value: unknown): string {
  return typeof value === 'string' ? value : '';
}

export function startServer(options: StartServerOptions = {}) {
  const dataDirectory = options.dataDirectory || process.env.DS_DATA_DIR || path.join(process.cwd(), 'data');
  const staticDirectory = options.staticDirectory || (process.env.NODE_ENV === 'production'
    ? [moduleDirectory, path.join(moduleDirectory, 'dist')]
        .find((candidate) => fs.existsSync(path.join(candidate, 'index.html')))
    : undefined);
  const port = options.port ?? (Number(process.env.PORT) || 3210);
  const host = options.host || '127.0.0.1';
  let server: ReturnType<express.Express['listen']> | undefined;
  let restoringDatabase = false;
  const { app, database } = createServer({
    dataDirectory,
    staticDirectory,
    onRestorePrepared: (candidatePath) => {
      if (!server || restoringDatabase) return;
      restoringDatabase = true;
      server.close(() => {
        void activateStagedDatabaseRestore(dataDirectory, database, candidatePath)
          .then(() => exitForDatabaseRestart(0))
          .catch((error: unknown) => {
            console.error(`No se pudo activar el respaldo SQLite: ${error instanceof Error ? error.message : 'error desconocido'}`);
            exitForDatabaseRestart(1);
          });
      });
    },
  });
  server = app.listen(port, host, () => {
    const address = server?.address();
    const actualPort = typeof address === 'object' && address ? address.port : port;
    console.log(`DCSS Suite API: http://127.0.0.1:${actualPort}`);
  });

  void backfillStoredSourceMetadata({ dataDirectory, database }).then((summary) => {
    if (summary.batches === 0 && summary.rawRows === 0) return;
    console.log(
      `DCSS Suite: reindexadas ${summary.usageRecords} filas de Consumibles, `
      + `${summary.outputRecords} salidas, ${summary.serviceRecords} servicios y ${summary.travelTrips} viajes; `
      + `actualizados ${summary.travelCostCatalogs} catálogos de Viáticos; `
      + `recuperadas ${summary.rawRows} filas originales.`,
    );
    if (summary.errors.length > 0) {
      console.warn(`DCSS Suite: ${summary.errors.length} archivos no pudieron reindexarse.`);
    }
  }).catch((error: unknown) => {
    console.warn(
      `DCSS Suite: no se pudo completar la reindexación de fuentes: ${error instanceof Error ? error.message : 'error desconocido'}`,
    );
  });

  const close = () => {
    server?.close(() => database.close());
  };
  process.once('SIGINT', close);
  process.once('SIGTERM', close);
  return server;
}

function exitForDatabaseRestart(code: number): void {
  const notifyAndExit = () => process.exit(code);
  if (typeof process.send === 'function') {
    process.send({ type: 'restart-after-restore' }, notifyAndExit);
    return;
  }
  notifyAndExit();
}

if (!process.env.VITEST && process.env.DS_SERVER_AUTOSTART !== 'false') startServer();
