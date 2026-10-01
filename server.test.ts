import { request as httpRequest } from 'node:http';
import { describe, expect, it } from 'vitest';
import { createServer } from './server';
import { ImportRepository } from './src/db/repositories';
import { makeTemporaryDataDirectory } from './src/test-support/api-helpers';

describe('server middleware', () => {
  it('blocks cross-origin state changes while allowing same-origin maintenance resets', async () => {
    const { app, database } = createServer({ dataDirectory: makeTemporaryDataDirectory() });
    const imports = new ImportRepository(database);
    const maintenanceBatchId = imports.createBatch({
      domain: 'maintenance',
      sourceName: 'Base de mantenimiento',
      sourceType: 'maintenance',
    });
    imports.markApplied(maintenanceBatchId);
    const server = app.listen(0, '127.0.0.1');

    try {
      await new Promise<void>((resolve) => server.once('listening', () => resolve()));
      const address = server.address();
      const port = typeof address === 'object' && address ? address.port : 0;
      const baseUrl = `http://127.0.0.1:${port}`;
      const saveResponse = await fetch(`${baseUrl}/api/maintenance/rules`, {
        method: 'POST',
        headers: { 'content-type': 'application/json', origin: baseUrl },
        body: JSON.stringify({ modelLabel: 'Modelo protegido', usefulLife: 100000, optimalBase: 10000, maxWaste: 0.4 }),
      });
      expect(saveResponse.status).toBe(201);

      const crossOriginResponse = await fetch(`${baseUrl}/api/maintenance/rules/reset`, {
        method: 'POST',
        headers: { origin: 'https://attacker.example', 'content-type': 'application/x-www-form-urlencoded' },
      });
      const forgedHost = `attacker.invalid:${port}`;
      const forgedWrite = await new Promise<number>((resolve, reject) => {
        const req = httpRequest(`${baseUrl}/api/settings/review/probe`, {
          method: 'PUT',
          headers: { host: forgedHost, origin: `http://${forgedHost}`, 'sec-fetch-site': 'same-origin', 'content-type': 'application/json' },
        }, (res) => { res.resume(); res.on('end', () => resolve(res.statusCode ?? 0)); });
        req.on('error', reject);
        req.end(JSON.stringify({ value: 'unexpected' }));
      });
      expect(forgedWrite).toBe(403);
      const forgedRead = await new Promise<number>((resolve, reject) => {
        const req = httpRequest(`${baseUrl}/api/settings/review/probe`, { headers: { host: forgedHost } }, (res) => {
          res.resume();
          res.on('end', () => resolve(res.statusCode ?? 0));
        });
        req.on('error', reject);
        req.end();
      });
      expect(forgedRead).toBe(403);

      expect(crossOriginResponse.status).toBe(403);
      const rulesAfterCrossOriginRequest = await fetch(`${baseUrl}/api/maintenance/rules`);
      expect(await rulesAfterCrossOriginRequest.json()).toEqual([
        expect.objectContaining({ modelLabel: 'Modelo protegido' }),
      ]);

      const sameOriginResponse = await fetch(`${baseUrl}/api/maintenance/rules/reset`, {
        method: 'POST',
        headers: { origin: baseUrl, 'sec-fetch-site': 'same-origin' },
      });
      expect(sameOriginResponse.status).toBe(200);
      const rulesAfterSameOriginRequest = await fetch(`${baseUrl}/api/maintenance/rules`);
      const rulesAfterReset = await rulesAfterSameOriginRequest.json() as Array<{ modelLabel: string }>;
      expect(rulesAfterReset.some((rule) => rule.modelLabel === 'Modelo protegido')).toBe(false);
    } finally {
      await new Promise<void>((resolve) => server.close(() => resolve()));
      database.close();
    }
  });
});
