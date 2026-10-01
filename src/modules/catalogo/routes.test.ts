import fs from 'node:fs';
import path from 'node:path';
import { describe, expect, it } from 'vitest';
import { createServer } from '../../../server';
import { makeTemporaryDataDirectory, makeConsumablesWorkbook } from '../../test-support/api-helpers';

describe('catalog API', () => {
  it('imports and searches normalized catalog parts through the local API', async () => {
    const dataDirectory = makeTemporaryDataDirectory();
    const { app, database } = createServer({ dataDirectory });
    const server = app.listen(0, '127.0.0.1');

    try {
      await new Promise<void>((resolve) => server.once('listening', () => resolve()));
      const address = server.address();
      const port = typeof address === 'object' && address ? address.port : 0;
      const baseUrl = `http://127.0.0.1:${port}`;

      const batchResponse = await fetch(`${baseUrl}/api/imports`, {
        method: 'POST',
        headers: { 'content-type': 'application/json' },
        body: JSON.stringify({ domain: 'catalog', sourceName: 'catalogo.xlsx' }),
      });
      const batch = (await batchResponse.json()) as { id: string };

      const sourceResponse = await fetch(`${baseUrl}/api/imports/${batch.id}/source`, {
        method: 'POST',
        headers: { 'content-type': 'application/json' },
        body: JSON.stringify({
          fileName: 'catalogo.xlsx',
          contentBase64: Buffer.from(await makeConsumablesWorkbook([])).toString('base64'),
          contentType: 'application/vnd.openxmlformats-officedocument.spreadsheetml.sheet',
        }),
      });
      expect(sourceResponse.status).toBe(201);
      const storedSource = (await sourceResponse.json()) as { storedPath: string };
      expect(fs.existsSync(path.join(dataDirectory, storedSource.storedPath))).toBe(true);

      const importResponse = await fetch(`${baseUrl}/api/catalog/parts`, {
        method: 'POST',
        headers: { 'content-type': 'application/json' },
        body: JSON.stringify({
          batchId: batch.id,
          parts: [
            {
              brand: 'Canon',
              code: ' FK-123 ',
              description: 'KIT DE MANTENIMIENTO',
              models: ['iR ADV C3325i'],
              stock: 7,
              priceUsd: 12.5,
              priceLocal: 79375,
              markup: 0,
              discontinuedAt: null,
            },
          ],
        }),
      });
      expect(importResponse.status).toBe(200);
      expect(await importResponse.json()).toEqual({ parts: 1, models: 1 });

      const sourceMetadataResponse = await fetch(`${baseUrl}/api/catalog/source`);
      expect(sourceMetadataResponse.status).toBe(200);
      expect(await sourceMetadataResponse.json()).toMatchObject({
        batchId: batch.id,
        fileName: 'catalogo.xlsx',
      });

      const searchResponse = await fetch(`${baseUrl}/api/catalog/parts?query=fk123&stockOnly=true`);
      expect(await searchResponse.json()).toEqual([
        expect.objectContaining({ code: 'FK-123', stock: 7, models: ['iR ADV C3325i'] }),
      ]);

      const seedBatchResponse = await fetch(`${baseUrl}/api/imports`, {
        method: 'POST',
        headers: { 'content-type': 'application/json' },
        body: JSON.stringify({ domain: 'catalog', sourceName: 'Listado de precios 2024 (semilla heredada).json', sourceType: 'catalog-seed' }),
      });
      const seedBatch = (await seedBatchResponse.json()) as { id: string };
      const seedImportResponse = await fetch(`${baseUrl}/api/catalog/parts`, {
        method: 'POST',
        headers: { 'content-type': 'application/json' },
        body: JSON.stringify({
          batchId: seedBatch.id,
          replaceAll: true,
          parts: [{
            brand: 'Canon',
            code: 'SEED-001',
            description: 'Parte de semilla heredada',
            models: ['iR ADV C3325i'],
            stock: 2,
            priceUsd: 4,
            priceLocal: 43000,
            markup: 0,
            discontinuedAt: null,
          }],
          modelNotes: [{
            brand: 'Canon',
            familyName: 'iR ADV',
            modelName: 'iR ADV C3325i',
            note: 'Usa tóner de alta capacidad.',
          }],
          serviceItems: [{
            brand: 'Canon',
            familyName: 'iR ADV',
            modelName: 'iR ADV C3325i',
            kind: 'labor',
            description: 'Cambio de kit de rodillos',
            fixedPriceLocal: null,
          }, {
            brand: 'Canon',
            familyName: 'iR ADV',
            modelName: 'iR ADV C3325i',
            kind: 'fixed',
            description: 'Mantenimiento preventivo',
            fixedPriceLocal: 320000,
          }],
        }),
      });
      expect(seedImportResponse.status).toBe(200);
      expect(await (await fetch(`${baseUrl}/api/catalog/parts`)).json()).toEqual([
        expect.objectContaining({ code: 'SEED-001', description: 'Parte de semilla heredada' }),
      ]);
      expect(await (await fetch(`${baseUrl}/api/catalog/model-notes`)).json()).toEqual([
        expect.objectContaining({ modelName: 'iR ADV C3325i', note: 'Usa tóner de alta capacidad.' }),
      ]);
      expect(await (await fetch(`${baseUrl}/api/catalog/service-items?modelName=iR%20ADV%20C3325i`)).json()).toEqual([
        expect.objectContaining({ kind: 'labor', description: 'Cambio de kit de rodillos' }),
        expect.objectContaining({ kind: 'fixed', description: 'Mantenimiento preventivo', fixedPriceLocal: 320000 }),
      ]);
    } finally {
      await new Promise<void>((resolve) => server.close(() => resolve()));
      database.close();
    }
  });
});
