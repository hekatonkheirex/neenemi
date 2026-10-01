import { describe, expect, it } from 'vitest';
import { createServer } from '../../server';
import { ImportRepository } from '../db/repositories';
import { makeTemporaryDataDirectory } from '../test-support/api-helpers';

describe('imports API', () => {
  it('checks whether a source file is still the current applied import for its domain', async () => {
    const { app, database } = createServer({ dataDirectory: makeTemporaryDataDirectory() });
    const imports = new ImportRepository(database);
    const sourceHash = 'a'.repeat(64);
    const batchId = imports.createBatch({
      domain: 'sales-catalog',
      sourceName: 'CONSUMIBLES_SISTEMA_ING.xlsx',
      sourceType: 'proformas-catalog-consumibles',
      sourceHash,
    });
    imports.markApplied(batchId);
    const server = app.listen(0, '127.0.0.1');

    try {
      await new Promise<void>((resolve) => server.once('listening', () => resolve()));
      const address = server.address();
      const port = typeof address === 'object' && address ? address.port : 0;
      const currentResponse = await fetch(
        `http://127.0.0.1:${port}/api/imports/check-current?domain=sales-catalog&sourceType=proformas-catalog-consumibles&sourceHash=${sourceHash}`,
      );

      expect(currentResponse.status).toBe(200);
      expect(await currentResponse.json()).toEqual({ current: true, batchId });

      const otherTypeResponse = await fetch(
        `http://127.0.0.1:${port}/api/imports/check-current?domain=sales-catalog&sourceType=proformas-catalog-repuestos&sourceHash=${sourceHash}`,
      );
      expect(otherTypeResponse.status).toBe(200);
      expect(await otherTypeResponse.json()).toEqual({ current: false, batchId: null });
    } finally {
      await new Promise<void>((resolve) => server.close(() => resolve()));
      database.close();
    }
  });

  it('persists settings and import metadata through the local API', async () => {
    const { app, database } = createServer({ dataDirectory: makeTemporaryDataDirectory() });
    const server = app.listen(0, '127.0.0.1');

    try {
      await new Promise<void>((resolve) => server.once('listening', () => resolve()));
      const address = server.address();
      const port = typeof address === 'object' && address ? address.port : 0;
      const baseUrl = `http://127.0.0.1:${port}`;

      const settingsResponse = await fetch(`${baseUrl}/api/settings/catalog/exchange-rate`, {
        method: 'PUT',
        headers: { 'content-type': 'application/json' },
        body: JSON.stringify({ value: 7125 }),
      });
      expect(settingsResponse.status).toBe(200);

      const storedSettingsResponse = await fetch(`${baseUrl}/api/settings/catalog/exchange-rate`);
      expect(await storedSettingsResponse.json()).toEqual({ value: 7125 });

      const batchResponse = await fetch(`${baseUrl}/api/imports`, {
        method: 'POST',
        headers: { 'content-type': 'application/json' },
        body: JSON.stringify({ domain: 'catalog', sourceName: 'catalogo.xlsx', sourceHash: 'abc123' }),
      });
      expect(batchResponse.status).toBe(201);
      const batch = (await batchResponse.json()) as { id: string };

      const fileResponse = await fetch(`${baseUrl}/api/imports/${batch.id}/files`, {
        method: 'POST',
        headers: { 'content-type': 'application/json' },
        body: JSON.stringify({
          fileName: 'catalogo.xlsx',
          storedPath: 'imports/catalog/catalogo.xlsx',
          contentHash: 'abc123',
          contentType: 'application/vnd.openxmlformats-officedocument.spreadsheetml.sheet',
          sizeBytes: 128,
        }),
      });
      expect(fileResponse.status).toBe(201);

      const statusResponse = await fetch(`${baseUrl}/api/imports/${batch.id}/status`, {
        method: 'POST',
        headers: { 'content-type': 'application/json' },
        body: JSON.stringify({ status: 'applied' }),
      });
      expect(statusResponse.status).toBe(200);

      const importResponse = await fetch(`${baseUrl}/api/imports/${batch.id}`);
      expect(await importResponse.json()).toMatchObject({
        batch: {
          id: batch.id,
          domain: 'catalog',
          sourceName: 'catalogo.xlsx',
          sourceHash: 'abc123',
          status: 'applied',
        },
        files: [expect.objectContaining({ fileName: 'catalogo.xlsx', sizeBytes: 128 })],
      });
    } finally {
      await new Promise<void>((resolve) => server.close(() => resolve()));
      database.close();
    }
  });
});
