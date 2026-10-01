import fs from 'node:fs';
import os from 'node:os';
import path from 'node:path';
import type { Server } from 'node:http';
import { afterEach, describe, expect, it } from 'vitest';
import { createServer } from '../../../server';
import type { SuiteDatabase } from '../../db/database';
import { ImportRepository } from '../../db/repositories';
import type { TrackingState } from './types';
import { siteKey, validateEvent } from './analysis';

const resources: { server: Server; database: SuiteDatabase; directory: string }[] = [];
afterEach(async () => {
  for (const resource of resources.splice(0)) {
    await new Promise<void>(resolve => resource.server.close(() => resolve()));
    resource.database.close();
    fs.rmSync(resource.directory, { recursive: true, force: true });
  }
});

describe('tracking persisted analysis', () => {
  it('keeps the previous analysis and confirmed site when either uploaded source is invalid', async () => {
    const directory = fs.mkdtempSync(path.join(os.tmpdir(), 'dcss-tracking-api-'));
    const { app, database } = createServer({ dataDirectory: directory });
    const server = app.listen(0, '127.0.0.1');
    resources.push({ server, database, directory });
    await new Promise<void>(resolve => server.once('listening', resolve));
    const address = server.address();
    if (!address || typeof address === 'string') throw new Error('No listening address');
    const base = `http://127.0.0.1:${address.port}`;
    const reports = 'Nº I.S.,Cliente,Técnico,Sucursal\n1,Cliente,Ana,Centro';
    const gps = 'Nº I.S.,Cliente,Técnico,TS check-in,TS check-out,GPS_IN,GPS_OUT,Tipo Servicio\n1,Cliente,Ana,01/09/2026 08:00,01/09/2026 09:00,"-25,-57","-25.002,-57",En Sitio';
    const payload = { reports: { fileName: 'informes.csv', contentBase64: Buffer.from(reports).toString('base64') }, geolocation: { fileName: 'gps.csv', contentBase64: Buffer.from(gps).toString('base64') } };
    const loaded = await fetch(`${base}/api/tracking/import`, { method: 'POST', headers: { 'content-type': 'application/json' }, body: JSON.stringify(payload) });
    const initial = await loaded.json() as TrackingState;
    expect(initial.snapshot?.visits[0]).toMatchObject({ matchedReport: true, branch: 'Centro' });
    const confirmed = await fetch(`${base}/api/tracking/sites`, { method: 'PUT', headers: { 'content-type': 'application/json' }, body: JSON.stringify({ visitKey: initial.snapshot!.visits[0].key, latitude: -25, longitude: -57, address: 'Referencia independiente' }) });
    expect(confirmed.status).toBe(200);
    const badCoordinate = await fetch(`${base}/api/tracking/sites`, { method: 'PUT', headers: { 'content-type': 'application/json' }, body: JSON.stringify({ visitKey: initial.snapshot!.visits[0].key, latitude: 999, longitude: -57 }) });
    expect(badCoordinate.status).toBe(400);
    const invalid = await fetch(`${base}/api/tracking/import`, { method: 'POST', headers: { 'content-type': 'application/json' }, body: JSON.stringify({ ...payload, geolocation: { fileName: 'bad.csv', contentBase64: Buffer.from('sin encabezados').toString('base64') } }) });
    expect(invalid.status).toBe(400);
    const persisted = await (await fetch(`${base}/api/tracking`)).json() as TrackingState;
    expect(persisted.snapshot?.batchId).toBe(initial.snapshot?.batchId);
    expect(persisted.sites).toEqual([expect.objectContaining({ customer: 'Cliente', branch: 'Centro', latitude: -25, longitude: -57, address: 'Referencia independiente' })]);
    const imports = new ImportRepository(database);
    expect(imports.listBatches().map(batch => batch.status)).toEqual(['applied']);
    const removed = await fetch(`${base}/api/tracking/sites/${encodeURIComponent(persisted.sites[0].key)}`, { method: 'DELETE' });
    expect((await removed.json() as TrackingState).sites).toEqual([]);
  });
  it('reuses a manually confirmed equipment location across reports and later imports', async () => {
    const directory = fs.mkdtempSync(path.join(os.tmpdir(), 'dcss-tracking-serial-api-'));
    const { app, database } = createServer({ dataDirectory: directory });
    const server = app.listen(0, '127.0.0.1');
    resources.push({ server, database, directory });
    await new Promise<void>(resolve => server.once('listening', resolve));
    const address = server.address();
    if (!address || typeof address === 'string') throw new Error('No listening address');
    const base = `http://127.0.0.1:${address.port}`;
    const gps = 'Nº I.S.,Cliente,Técnico,TS check-in,GPS_IN,Tipo Servicio\n1,Cliente,Ana,01/09/2026 08:00,"-25,-57",En Sitio\n1,Cliente,Luis,01/09/2026 08:00,"-25,-57",En Sitio\n2,Cliente,Ana,02/09/2026 08:00,"-25,-57",En Sitio';
    const payload = {
      reports: { fileName: 'informes.csv', contentBase64: Buffer.from('Nº I.S.,Cliente,Técnico\n99,Cliente,Ana').toString('base64') },
      geolocation: { fileName: 'gps.csv', contentBase64: Buffer.from(gps).toString('base64') },
    };
    const first = await (await fetch(`${base}/api/tracking/import`, { method: 'POST', headers: { 'content-type': 'application/json' }, body: JSON.stringify(payload) })).json() as TrackingState;
    const confirmation = await fetch(`${base}/api/tracking/sites`, { method: 'PUT', headers: { 'content-type': 'application/json' }, body: JSON.stringify({ visitKey: first.snapshot!.visits[0].key, serialNumber: ' abc-001 ', latitude: -25, longitude: -57 }) });
    expect(confirmation.status).toBe(200);
    const current = await (await fetch(`${base}/api/tracking`)).json() as TrackingState;
    expect(current.snapshot!.visits.map(v => v.serialNumber)).toEqual(['ABC-001', 'ABC-001', '']);
    expect(current.sites[0]).toMatchObject({ serialNumber: 'ABC-001', latitude: -25, longitude: -57 });
    const nextGps = 'Nº I.S.,Cliente,Técnico,TS check-in,GPS_IN,Tipo Servicio\n2,Cliente,Ana,02/09/2026 08:00,"-25,-57",En Sitio\n3,Cliente,Luis,03/09/2026 08:00,"-25,-57",En Sitio\n4,Cliente,Ana,03/09/2026 09:00,"-25,-57",En Sitio';
    const nextPayload = {
      reports: { fileName: 'informes.csv', contentBase64: Buffer.from('Nº I.S.,Cliente,Técnico,N Serie\n2,Cliente,Ana,ABC-001\n3,Cliente,Luis,ABC-001\n4,Cliente,Ana,ABC-002').toString('base64') },
      geolocation: { fileName: 'gps.csv', contentBase64: Buffer.from(nextGps).toString('base64') },
    };
    const reloaded = await (await fetch(`${base}/api/tracking/import`, { method: 'POST', headers: { 'content-type': 'application/json' }, body: JSON.stringify(nextPayload) })).json() as TrackingState;
    expect(reloaded.snapshot!.visits.map(v => reloaded.sites.find(s => s.key === siteKey(v))?.serialNumber ?? null)).toEqual(['ABC-001', 'ABC-001', null]);
    const corrected = await (await fetch(`${base}/api/tracking/sites`, { method: 'PUT', headers: { 'content-type': 'application/json' }, body: JSON.stringify({ visitKey: reloaded.snapshot!.visits[1].key, serialNumber: 'ABC-001', latitude: -26, longitude: -58 }) })).json() as TrackingState;
    expect(corrected.snapshot!.visits.slice(0, 2).map(v => validateEvent(v.checkIn, v.gpsIn, corrected.sites.find(s => s.key === siteKey(v))).status)).toEqual(['outside', 'outside']);
  });
});
