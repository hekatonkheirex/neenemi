import express from 'express';
import { createHash } from 'node:crypto';
import fs from 'node:fs';
import path from 'node:path';
import Database from 'better-sqlite3';
import { backfillImportFileBlobs, getImportOriginalsStatus } from './src/core/import-blob-backfill';
import { openDatabase, resolveDatabasePath, type SuiteDatabase } from './src/db/database';
import { ImportRepository, SettingsRepository } from './src/db/repositories';
import { OverviewRepository } from './src/db/overview';
import { readStoredImportFile, restoreArchivedImportFiles, type ArchivedImportFile} from './src/core/import-storage';
import { stageDatabaseRestore, activateStagedDatabaseRestore } from './src/core/database-restore';
import { ImportJobRegistry } from './src/core/import-jobs';
import { backfillStoredSourceMetadata } from './src/core/source-metadata-backfill';
import { getSourceCoverage } from './src/core/source-catalog';
import { registerTrackingRoutes } from './src/modules/tracking/routes';
import { registerConsumablesRoutes } from './src/modules/consumibles/routes';
import { registerOperationsRoutes } from './src/modules/operaciones/routes';
import { registerCatalogRoutes } from './src/modules/catalogo/routes';
import { registerMaintenanceRoutes } from './src/modules/mantenimiento/routes';
import { registerSalesRoutes } from './src/modules/ventas/routes';
import { registerServiceRoutes } from './src/modules/servicios/routes';
import { registerTravelRoutes } from './src/modules/viaticos/routes';
import { archiveBatchImportFiles, hydrateStoredSpreadsheetRows, isSpreadsheetFile, storeAndRegisterImportFile, storeSpreadsheetImport} from './src/core/import-routes';
import { parseRawRowsLimit, parseRawRowsOffset} from './src/core/request-parsing';
import { registerMpsRoutes } from './src/modules/mps/routes';
import { registerCoverageRoutes } from './src/modules/cobertura/routes';
import { registerUniflowRoutes } from './src/modules/uniflow/routes';
import { registerSoftwareSelectorRoutes } from './src/modules/software-selector/routes';
import { registerSlaRoutes } from './src/modules/sla/routes';
import { decodeBase64, isNonEmptyString, isNonNegativeInteger, isRecord, queryString } from './src/core/validation';

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

  registerConsumablesRoutes(app, database, dataDirectory, importJobs);
  registerOperationsRoutes(app, database, dataDirectory, importJobs);
  registerCatalogRoutes(app, database);
  registerMaintenanceRoutes(app, database, dataDirectory);
  registerSalesRoutes(app, database);
  registerServiceRoutes(app, database, dataDirectory);
  registerTravelRoutes(app, database, dataDirectory);
  registerMpsRoutes(app, database, dataDirectory);
  registerCoverageRoutes(app, database);
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

function makeBackupFileName(): string {
  const timestamp = new Date().toISOString().replaceAll(':', '-').replaceAll('.', '-');
  return `dcss-suite-backup-${timestamp}.sqlite`;
}

function removeTemporaryDirectory(directory: string | null): void {
  if (!directory) return;
  fs.rmSync(directory, { recursive: true, force: true });
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
