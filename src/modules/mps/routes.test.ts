import path from 'node:path';
import Database from 'better-sqlite3';
import { describe, expect, it } from 'vitest';
import { createServer } from '../../../server';
import { makeTemporaryDataDirectory } from '../../test-support/api-helpers';

describe('MPS API', () => {
  it('imports the legacy MPS SQLite database into the shared API', async () => {
    const dataDirectory = makeTemporaryDataDirectory();
    const legacyDirectory = makeTemporaryDataDirectory();
    const legacy = new Database(path.join(legacyDirectory, 'canon_mps.db'));
    legacy.exec(`
      CREATE TABLE multifuncionales (
        id TEXT PRIMARY KEY,
        brand TEXT,
        model TEXT,
        speedPpm INTEGER,
        isColor INTEGER,
        recVolumeMin INTEGER,
        recVolumeMax INTEGER,
        isCustom INTEGER
      );
      CREATE TABLE consumibles (
        id TEXT PRIMARY KEY,
        modelId TEXT,
        name TEXT,
        type TEXT,
        yieldPages INTEGER,
        color TEXT,
        sku TEXT
      );
    `);
    legacy.prepare('INSERT INTO multifuncionales VALUES (?, ?, ?, ?, ?, ?, ?, ?)').run(
      'mps-model-1', 'Canon', 'imageRUNNER 1643i', 45, 0, 1500, 20000, 1,
    );
    legacy.prepare('INSERT INTO consumibles VALUES (?, ?, ?, ?, ?, ?, ?)').run(
      'mps-consumable-1', 'mps-model-1', 'Tóner Negro T06', 'toner', 20500, 'black', '3526C001AA',
    );
    const legacyBytes = legacy.serialize();
    legacy.close();

    const { app, database } = createServer({ dataDirectory });
    const server = app.listen(0, '127.0.0.1');

    try {
      await new Promise<void>((resolve) => server.once('listening', () => resolve()));
      const address = server.address();
      const port = typeof address === 'object' && address ? address.port : 0;
      const baseUrl = `http://127.0.0.1:${port}`;
      const importResponse = await fetch(`${baseUrl}/api/mps/import-legacy`, {
        method: 'POST',
        headers: { 'content-type': 'application/json' },
        body: JSON.stringify({
          sourceName: 'canon_mps.db',
          contentBase64: Buffer.from(legacyBytes).toString('base64'),
        }),
      });
      expect(importResponse.status).toBe(201);
      expect(await importResponse.json()).toMatchObject({
        duplicate: false,
        models: 1,
        consumables: 1,
        linkedEquipmentModels: 1,
      });

      const modelsResponse = await fetch(`${baseUrl}/api/mps/models?query=1643`);
      expect(await modelsResponse.json()).toEqual([
        expect.objectContaining({
          modelLabel: 'imageRUNNER 1643i',
          consumables: [expect.objectContaining({ sku: '3526C001AA', yieldPages: 20500 })],
        }),
      ]);
    } finally {
      await new Promise<void>((resolve) => server.close(() => resolve()));
      database.close();
    }
  });

  it('exposes manual MPS profile CRUD without modifying imported profiles', async () => {
    const dataDirectory = makeTemporaryDataDirectory();
    const legacyDirectory = makeTemporaryDataDirectory();
    const legacy = new Database(path.join(legacyDirectory, 'canon_mps.db'));
    legacy.exec(`
      CREATE TABLE multifuncionales (
        id TEXT PRIMARY KEY,
        brand TEXT,
        model TEXT,
        speedPpm INTEGER,
        isColor INTEGER,
        recVolumeMin INTEGER,
        recVolumeMax INTEGER,
        isCustom INTEGER
      );
      CREATE TABLE consumibles (
        id TEXT PRIMARY KEY,
        modelId TEXT,
        name TEXT,
        type TEXT,
        yieldPages INTEGER,
        color TEXT,
        sku TEXT
      );
    `);
    legacy.prepare('INSERT INTO multifuncionales VALUES (?, ?, ?, ?, ?, ?, ?, ?)').run(
      'mps-model-crud', 'Canon', 'imageRUNNER 1643i', 45, 0, 1500, 20000, 1,
    );
    legacy.prepare('INSERT INTO consumibles VALUES (?, ?, ?, ?, ?, ?, ?)').run(
      'mps-consumable-crud', 'mps-model-crud', 'Tóner T06', 'toner', 20500, 'black', '3526C001AA',
    );
    const legacyBytes = legacy.serialize();
    legacy.close();

    const { app, database } = createServer({ dataDirectory });
    const server = app.listen(0, '127.0.0.1');

    try {
      await new Promise<void>((resolve) => server.once('listening', () => resolve()));
      const address = server.address();
      const port = typeof address === 'object' && address ? address.port : 0;
      const baseUrl = `http://127.0.0.1:${port}`;
      const headers = { 'content-type': 'application/json' };
      const importResponse = await fetch(`${baseUrl}/api/mps/import-legacy`, {
        method: 'POST',
        headers,
        body: JSON.stringify({ sourceName: 'canon_mps.db', contentBase64: Buffer.from(legacyBytes).toString('base64') }),
      });
      expect(importResponse.status).toBe(201);

      const importedModelsResponse = await fetch(`${baseUrl}/api/mps/models`);
      const importedModels = await importedModelsResponse.json() as Array<{ id: string }>;
      expect(importedModels).toHaveLength(1);

      const createResponse = await fetch(`${baseUrl}/api/mps/models`, {
        method: 'POST',
        headers,
        body: JSON.stringify({
          brand: 'Canon', model: 'imageRUNNER C5535i', speedPpm: 35, isColor: true,
          recVolumeMin: 2000, recVolumeMax: 30000,
          consumables: [{ name: 'Tóner negro', type: 'toner', yieldPages: 18000, color: 'black', sku: '5535-BLK' }],
        }),
      });
      expect(createResponse.status).toBe(201);
      const created = await createResponse.json() as { id: string; modelLabel: string; consumables: Array<{ name: string }> };
      expect(created).toMatchObject({ modelLabel: 'imageRUNNER C5535i', consumables: [expect.objectContaining({ name: 'Tóner negro' })] });

      const updateResponse = await fetch(`${baseUrl}/api/mps/models/${created.id}`, {
        method: 'PUT',
        headers,
        body: JSON.stringify({
          brand: 'Canon', model: 'imageRUNNER C5535i', speedPpm: 40, isColor: true,
          recVolumeMin: 2500, recVolumeMax: 35000,
          consumables: [
            { name: 'Tóner negro', type: 'toner', yieldPages: 20000, color: 'black', sku: '5535-BLK-2' },
            { name: 'Tambor', type: 'drum', yieldPages: 100000, color: 'other', sku: '5535-DRM' },
          ],
        }),
      });
      expect(updateResponse.status).toBe(200);
      expect(await updateResponse.json()).toMatchObject({ speedPpm: 40, recVolumeMin: 2500, consumables: expect.arrayContaining([expect.objectContaining({ sku: '5535-DRM' })]) });

      const importedDeleteResponse = await fetch(`${baseUrl}/api/mps/models/${importedModels[0].id}`, { method: 'DELETE' });
      expect(importedDeleteResponse.status).toBe(409);
      expect(await importedDeleteResponse.json()).toMatchObject({ error: expect.stringContaining('permanece intacto') });

      const cloneResponse = await fetch(`${baseUrl}/api/mps/models`, {
        method: 'POST',
        headers,
        body: JSON.stringify({
          brand: 'Canon', model: 'imageRUNNER C5535i Plus', speedPpm: 40, isColor: true,
          recVolumeMin: 2500, recVolumeMax: 35000,
          consumables: [{ name: 'Tóner negro', type: 'toner', yieldPages: 20000, color: 'black', sku: '5535-BLK-2' }],
        }),
      });
      expect(cloneResponse.status).toBe(201);
      const clone = await cloneResponse.json() as { id: string };
      const deleteResponse = await fetch(`${baseUrl}/api/mps/models/${clone.id}`, { method: 'DELETE' });
      expect(deleteResponse.status).toBe(200);
      expect(await deleteResponse.json()).toEqual({ deleted: true });

      const finalModelsResponse = await fetch(`${baseUrl}/api/mps/models`);
      const finalModels = await finalModelsResponse.json() as Array<{ modelLabel: string; isEditable: boolean }>;
      expect(finalModels).toEqual([
        expect.objectContaining({ modelLabel: 'imageRUNNER 1643i', isEditable: false }),
        expect.objectContaining({ modelLabel: 'imageRUNNER C5535i', isEditable: true }),
      ]);
    } finally {
      await new Promise<void>((resolve) => server.close(() => resolve()));
      database.close();
    }
  });
});
