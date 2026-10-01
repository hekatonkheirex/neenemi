import express from 'express';
import fs from 'node:fs';
import path from 'node:path';
import { openDatabase, resolveDatabasePath, type SuiteDatabase } from './src/db/database';
import { ImportRepository } from './src/db/repositories';
import { activateStagedDatabaseRestore } from './src/core/database-restore';
import { ImportJobRegistry } from './src/core/import-jobs';
import { backfillStoredSourceMetadata } from './src/core/source-metadata-backfill';
import { storeAndRegisterImportFile } from './src/core/import-routes';
import { registerSystemRoutes } from './src/core/system-routes';
import { registerImportApiRoutes } from './src/core/import-api-routes';
import { registerConsumablesRoutes } from './src/modules/consumibles/routes';
import { registerOperationsRoutes } from './src/modules/operaciones/routes';
import { registerCatalogRoutes } from './src/modules/catalogo/routes';
import { registerMaintenanceRoutes } from './src/modules/mantenimiento/routes';
import { registerSalesRoutes } from './src/modules/ventas/routes';
import { registerServiceRoutes } from './src/modules/servicios/routes';
import { registerTravelRoutes } from './src/modules/viaticos/routes';
import { registerMpsRoutes } from './src/modules/mps/routes';
import { registerCoverageRoutes } from './src/modules/cobertura/routes';
import { registerUniflowRoutes } from './src/modules/uniflow/routes';
import { registerSoftwareSelectorRoutes } from './src/modules/software-selector/routes';
import { registerSlaRoutes } from './src/modules/sla/routes';
import { registerTrackingRoutes } from './src/modules/tracking/routes';

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
  const imports = new ImportRepository(database);
  const importJobs = new ImportJobRegistry();

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

  registerSystemRoutes(app, database, dataDirectory, importJobs, options);
  registerImportApiRoutes(app, database, dataDirectory, importJobs);
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
