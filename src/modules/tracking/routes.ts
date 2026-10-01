import type { Express } from 'express';
import { createHash } from 'node:crypto';
import { ImportRepository, SettingsRepository } from '../../db/repositories';
import type { SuiteDatabase } from '../../db/database';
import { siteKey } from './analysis';
import { combineTracking, normalizeIdentity, normalizeTrackingSerial, parseTrackingFile } from './parser';
import type { SiteReference, TrackingReport, TrackingSnapshot, TrackingState } from './types';
import { parseGeocodingResults } from './geocoding';

function uploadedFile(value: unknown): { fileName: string; bytes: Uint8Array } {
  if (!value || typeof value !== 'object') throw new Error('Selecciona ambos archivos.');
  const { fileName, contentBase64 } = value as Record<string, unknown>;
  if (typeof fileName !== 'string' || !/\.(csv|xlsx)$/i.test(fileName) || fileName.length > 255 || /[\\/\u0000]/.test(fileName)) throw new Error('El nombre debe corresponder a un archivo CSV o XLSX.');
  if (typeof contentBase64 !== 'string' || !contentBase64 || contentBase64.length > 24 * 1024 * 1024 || contentBase64.length % 4 !== 0 || !/^[a-zA-Z0-9+/]*={0,2}$/.test(contentBase64)) throw new Error('Archivo inválido o demasiado grande (máximo 18 MB por archivo).');
  const bytes = Buffer.from(contentBase64, 'base64');
  if (!bytes.byteLength) throw new Error('El archivo está vacío.');
  return { fileName, bytes };
}

function reportAssignmentKey(report: TrackingReport): string {
  return JSON.stringify([report.reportId, normalizeIdentity(report.customer)]);
}

export function registerTrackingRoutes(app: Express, database: SuiteDatabase, storeSource: (batchId: string, fileName: string, bytes: Uint8Array, contentType: string) => { id: string }): void {
  const imports = new ImportRepository(database);
  const settings = new SettingsRepository(database);
  function state(): TrackingState {
    const stored = settings.get<TrackingSnapshot | null>('tracking', 'snapshot', null);
    if (stored) {
      const assignments = settings.get<Record<string, string>>('tracking', 'series-by-report', {});
      for (const report of stored.reports) report.serialNumber = assignments[reportAssignmentKey(report)] ?? normalizeTrackingSerial(report.serialNumber);
      for (const visit of stored.visits) visit.serialNumber = assignments[reportAssignmentKey(visit)] ?? normalizeTrackingSerial(visit.serialNumber);
    }
    return { snapshot: stored && imports.getBatch(stored.batchId)?.status === 'applied' ? stored : null, sites: settings.get<SiteReference[]>('tracking', 'sites', []) };
  }
  app.get('/api/tracking', (_request, response) => response.json(state()));
  let geocodingAvailableAt = 0;
  let geocodingBusy = false;
  app.post('/api/tracking/geocode', async (request, response) => {
    const address = request.body?.address;
    if (typeof address !== 'string' || address.trim().length < 5 || address.length > 500) {
      response.status(400).json({ error: 'Introduce una dirección con ciudad, de 5 a 500 caracteres.' }); return;
    }
    if (geocodingBusy || Date.now() < geocodingAvailableAt) {
      response.status(429).json({ error: 'Espera un momento antes de otra búsqueda de dirección.' }); return;
    }
    geocodingBusy = true;
    geocodingAvailableAt = Date.now() + 1000;
    try {
      const url = new URL('https://photon.komoot.io/api/');
      url.searchParams.set('q', address.trim());
      url.searchParams.set('countrycode', 'PY');
      url.searchParams.set('limit', '5');
      const result = await fetch(url, { redirect: 'error', signal: AbortSignal.timeout(10_000), headers: { 'User-Agent': 'DCSS-Suite Tracking address search', Accept: 'application/json' } });
      if (!result.ok) throw new Error('Proveedor no disponible');
      response.json({ candidates: parseGeocodingResults(await result.json()) });
    } catch {
      response.status(502).json({ error: 'No se pudo consultar Photon/Komoot. Verifica la conexión o ubica la sede manualmente.' });
    } finally { geocodingBusy = false; }
  });
  app.post('/api/tracking/import', async (request, response) => {
    let batchId: string | null = null;
    try {
      const reportsFile = uploadedFile(request.body?.reports);
      const gpsFile = uploadedFile(request.body?.geolocation);
      const [reports, geolocation] = await Promise.all([
        parseTrackingFile(reportsFile.bytes, reportsFile.fileName, 'reports'),
        parseTrackingFile(gpsFile.bytes, gpsFile.fileName, 'geolocation'),
      ]);
      const combined = combineTracking(reports.reports, geolocation.visits);
      const sourceHash = createHash('sha256').update(reportsFile.bytes).update('\0').update(gpsFile.bytes).digest('hex');
      batchId = imports.createBatch({ domain: 'tracking', sourceName: `${reportsFile.fileName} + ${gpsFile.fileName}`, sourceHash });
      const batch = batchId;
      database.transaction(() => {
        for (const [file, parsed] of [[reportsFile, reports], [gpsFile, geolocation]] as const) {
          const stored = storeSource(batch, file.fileName, file.bytes, file.fileName.toLowerCase().endsWith('.csv') ? 'text/csv' : 'application/vnd.openxmlformats-officedocument.spreadsheetml.sheet');
          imports.addSourceRows(batch, stored.id, parsed.sourceSheets);
        }
        const snapshot: TrackingSnapshot = { ...combined, batchId: batch, importedAt: new Date().toISOString(), reportFile: reportsFile.fileName, geolocationFile: gpsFile.fileName, warnings: [...reports.warnings, ...geolocation.warnings, ...combined.warnings] };
        settings.set('tracking', 'snapshot', snapshot);
        imports.markApplied(batch);
      })();
      response.status(201).json(state());
    } catch (error) {
      if (batchId) imports.markFailed(batchId);
      response.status(400).json({ error: error instanceof Error ? error.message : 'No se pudieron importar los archivos.' });
    }
  });
  app.put('/api/tracking/sites', (request, response) => {
    const body = request.body as Record<string, unknown> | null;
    const current = state();
    const visit = current.snapshot?.visits.find(v => v.key === body?.visitKey);
    if (!visit) { response.status(404).json({ error: 'La visita ya no está disponible. Recarga el módulo.' }); return; }
    const latitude = body?.latitude;
    const longitude = body?.longitude;
    if (typeof latitude !== 'number' || !Number.isFinite(latitude) || Math.abs(latitude) > 85.05112878 || typeof longitude !== 'number' || !Number.isFinite(longitude) || Math.abs(longitude) > 180) {
      response.status(400).json({ error: 'Introduce coordenadas válidas: latitud entre −85,051 y 85,051 y longitud entre −180 y 180.' }); return;
    }
    if (body?.address !== undefined && (typeof body.address !== 'string' || body.address.length > 500)) { response.status(400).json({ error: 'La dirección debe tener hasta 500 caracteres.' }); return; }
    if (body?.serialNumber !== undefined && (typeof body.serialNumber !== 'string' || body.serialNumber.length > 100)) {
      response.status(400).json({ error: 'La serie debe ser texto de hasta 100 caracteres.' }); return;
    }
    const serialNumber = normalizeTrackingSerial(body?.serialNumber ?? visit.serialNumber);
    if (!serialNumber && (visit.serialNumber || typeof body?.serialNumber === 'string' && body.serialNumber.trim())) {
      response.status(400).json({ error: 'Introduce una serie válida, no una etiqueta como N/A o Sin serie.' }); return;
    }
    const key = siteKey({ ...visit, serialNumber });
    const reference: SiteReference = { key, serialNumber, customer: visit.customer, branch: visit.branch, address: typeof body?.address === 'string' ? body.address.trim() : visit.address, latitude, longitude, confirmedAt: new Date().toISOString() };
    database.transaction(() => {
      if (serialNumber) {
        const assignments = settings.get<Record<string, string>>('tracking', 'series-by-report', {});
        assignments[reportAssignmentKey(visit)] = serialNumber;
        settings.set('tracking', 'series-by-report', assignments);
      }
      settings.set('tracking', 'sites', [...current.sites.filter(s => s.key !== key), reference]);
    })();
    response.json(state());
  });
  app.delete('/api/tracking/sites/:key', (request, response) => {
    const sites = settings.get<SiteReference[]>('tracking', 'sites', []);
    settings.set('tracking', 'sites', sites.filter(site => site.key !== request.params.key));
    response.json(state());
  });
}
