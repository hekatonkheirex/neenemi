import { describe, expect, it } from 'vitest';
import { createServer } from '../../../server';
import { makeTemporaryDataDirectory } from '../../test-support/api-helpers';

describe('uniFLOW API', () => {
  it('calculates uniFLOW licenses and persists its editable price catalog', async () => {
    const { app, database } = createServer({ dataDirectory: makeTemporaryDataDirectory() });
    const server = app.listen(0, '127.0.0.1');

    try {
      await new Promise<void>((resolve) => server.once('listening', () => resolve()));
      const address = server.address();
      const port = typeof address === 'object' && address ? address.port : 0;
      const baseUrl = `http://127.0.0.1:${port}`;
      const headers = { 'content-type': 'application/json' };

      const modelsResponse = await fetch(`${baseUrl}/api/uniflow/models`);
      expect(modelsResponse.status).toBe(200);
      expect(await modelsResponse.json()).toHaveLength(20);

      const catalogResponse = await fetch(`${baseUrl}/api/uniflow/catalog`);
      const catalog = await catalogResponse.json() as {
        version: number;
        source: string;
        lastModified: string;
        lists: Record<string, Array<{ minQty: number; maxQty: number | null; label: string; sku: string; price: number }>>;
      };
      expect(catalog.lists.t1[0]).toEqual(expect.objectContaining({ label: '1-9', sku: '3575B792AA', price: 44.37 }));

      const configurationResponse = await fetch(`${baseUrl}/api/uniflow/configure`, {
        method: 'POST',
        headers,
        body: JSON.stringify({
          months: 24,
          devices: [
            { id: 'one', modelName: 'iRADV DX 8905', quantity: 5, withCIP: true },
            { id: 'two', modelName: 'iR 1643iF', quantity: 3 },
          ],
        }),
      });
      expect(configurationResponse.status).toBe(200);
      expect(await configurationResponse.json()).toMatchObject({
        t1TotalQty: 5,
        t2TotalQty: 3,
        t1CIPQty: 5,
        t2CIPQty: 0,
        monthlyTotal: 533.67,
        contractTotal: 12808.08,
        t1SKU: { label: '1-9', sku: '3575B792AA' },
      });

      const editedCatalog = {
        ...catalog,
        source: 'Catálogo uniFLOW editado',
        lastModified: '10/09/26',
        lists: {
          ...catalog.lists,
          t1: catalog.lists.t1.map((item, index) => index === 0 ? { ...item, price: 40 } : item),
        },
      };
      const saveResponse = await fetch(`${baseUrl}/api/uniflow/catalog`, {
        method: 'PUT',
        headers,
        body: JSON.stringify(editedCatalog),
      });
      expect(saveResponse.status).toBe(200);
      const savedCatalog = await saveResponse.json() as { source: string; lastModified: string; lists: { t1: Array<{ price: number }> } };
      expect(savedCatalog).toMatchObject({ source: 'Catálogo uniFLOW editado', lastModified: '10/09/26' });
      expect(savedCatalog.lists.t1[0].price).toBe(40);

      const updatedConfigurationResponse = await fetch(`${baseUrl}/api/uniflow/configure`, {
        method: 'POST',
        headers,
        body: JSON.stringify({ months: 24, devices: [{ id: 'one', modelName: 'iRADV DX 8905', quantity: 5 }] }),
      });
      expect(await updatedConfigurationResponse.json()).toMatchObject({ monthlyTotal: 200, contractTotal: 4800 });
    } finally {
      await new Promise<void>((resolve) => server.close(() => resolve()));
      database.close();
    }
  });
});
