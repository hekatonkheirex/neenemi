import type { Express } from 'express';
import type { SuiteDatabase } from '../db/database';
import { ImportRepository, SettingsRepository } from '../db/repositories';
import { OverviewRepository } from '../db/overview';
import type { ImportJobRegistry } from './import-jobs';
import Database from 'better-sqlite3';
import fs from 'node:fs';
import path from 'node:path';
import { type ArchivedImportFile, restoreArchivedImportFiles } from './import-storage';
import { archiveBatchImportFiles } from './import-routes';
import { backfillImportFileBlobs, getImportOriginalsStatus } from './import-blob-backfill';
import { backfillStoredSourceMetadata } from './source-metadata-backfill';
import { getSourceCoverage } from './source-catalog';
import { isRecord } from './validation';
import { stageDatabaseRestore } from './database-restore';
import { isDataChange, readBackupHealth, recordBackup, recordChange } from './backup-health';

// Claves de API (p. ej. ai/openrouter_api_key): nunca salen de la instalación en respaldos ni lecturas.
export const SECRET_SETTINGS_NAMESPACE = 'ai';

function prepareBackupSnapshot(snapshotPath: string, at: Date): void {
  const snapshot = new Database(snapshotPath);
  try {
    snapshot.prepare('DELETE FROM app_settings WHERE namespace = ?').run(SECRET_SETTINGS_NAMESPACE);
    // La copia debe recordar este respaldo, no el anterior de la base activa.
    recordBackup(snapshot, at);
    snapshot.exec('VACUUM');
  } finally {
    snapshot.close();
  }
}

function makeBackupFileName(): string {
  const timestamp = new Date().toISOString().replaceAll(':', '-').replaceAll('.', '-');
  return `dcss-suite-backup-${timestamp}.sqlite`;
}

function removeTemporaryDirectory(directory: string | null): void {
  if (!directory) return;
  // En Windows el archivo sigue bloqueado unos ms tras enviarse (EBUSY/EPERM); una carpeta temporal
  // que no se borra no debe invalidar un respaldo ya entregado.
  try {
    fs.rmSync(directory, { recursive: true, force: true, maxRetries: 10, retryDelay: 100 });
  } catch {
    // ponytail: se queda un .dcss-backup-* huérfano; barrerlos al arrancar si molesta.
  }
}

export type SystemRouteOptions = {
  onRestorePrepared?: (candidatePath: string) => void;
};

export function registerSystemRoutes(
  app: Express,
  database: SuiteDatabase,
  dataDirectory: string,
  importJobs: ImportJobRegistry,
  options: SystemRouteOptions,
): void {
  const settings = new SettingsRepository(database);
  const imports = new ImportRepository(database);
  const overview = new OverviewRepository(database);
  let archiveBackfillJobId: string | null = null;

  // Toda modificación exitosa de datos (cargas y trabajo manual) deja marca para el aviso de respaldo.
  app.use((request, response, next) => {
    if (isDataChange(request.method, request.path)) {
      response.on('finish', () => {
        if (response.statusCode >= 400) return;
        try { recordChange(database); } catch { /* base cerrada o en restauración */ }
      });
    }
    next();
  });

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
    const startedAt = new Date();
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
      prepareBackupSnapshot(snapshotPath, startedAt);

      response.setHeader('Cache-Control', 'no-store');
      response.setHeader('Content-Type', 'application/vnd.sqlite3');
      response.download(snapshotPath, makeBackupFileName(), (error) => {
        const directory = temporaryDirectory;
        temporaryDirectory = null;
        if (!error) recordBackup(database, startedAt);
        removeTemporaryDirectory(directory);
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

  app.get('/api/system/backup/status', (_request, response) => {
    response.setHeader('Cache-Control', 'no-store');
    response.json(readBackupHealth(database));
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
}
