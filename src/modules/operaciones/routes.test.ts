import { describe, expect, it } from 'vitest';
import { createServer } from '../../../server';
import { makeTemporaryDataDirectory, resolveImportJob, makeLegacyPortfolioWorkbook, makeCanonDiscontinuationWorkbook, makeCanonStockSupportWorkbook, makeWaldbottStockWorkbook } from '../../test-support/api-helpers';

describe('operations API', () => {
  it('persists customers, contracts and installed equipment in the shared database', async () => {
    const { app, database } = createServer({ dataDirectory: makeTemporaryDataDirectory() });
    const server = app.listen(0, '127.0.0.1');

    try {
      await new Promise<void>((resolve) => server.once('listening', () => resolve()));
      const address = server.address();
      const port = typeof address === 'object' && address ? address.port : 0;
      const baseUrl = `http://127.0.0.1:${port}`;
      const headers = { 'content-type': 'application/json' };

      const customerResponse = await fetch(`${baseUrl}/api/operations/customers`, {
        method: 'POST',
        headers,
        body: JSON.stringify({ name: 'Cliente Operaciones', customerType: 'Privado', commercialArea: 'Commercial' }),
      });
      expect(customerResponse.status).toBe(201);
      const customer = (await customerResponse.json()) as { id: string };

      const contractResponse = await fetch(`${baseUrl}/api/operations/contracts`, {
        method: 'POST',
        headers,
        body: JSON.stringify({
          customerId: customer.id,
          reference: 'OV-OPS-001',
          contractType: 'Mantenimiento',
          startsAt: '2026-01-01',
          equipment: [{ modelLabel: 'iR ADV C3325i', serialNumber: 'SER-OPS-001', location: 'Casa central' }],
        }),
      });
      expect(contractResponse.status).toBe(201);

      const customersResponse = await fetch(`${baseUrl}/api/operations/customers?query=operaciones`);
      expect(await customersResponse.json()).toEqual([
        expect.objectContaining({
          id: customer.id,
          name: 'Cliente Operaciones',
          contracts: [expect.objectContaining({
            reference: 'OV-OPS-001',
            equipment: [expect.objectContaining({ serialNumber: 'SER-OPS-001' })],
          })],
        }),
      ]);

      const equipmentResponse = await fetch(`${baseUrl}/api/operations/equipment?query=SER-OPS-001`);
      expect(await equipmentResponse.json()).toEqual([
        expect.objectContaining({ customerId: customer.id, modelLabel: 'iR ADV C3325i', serialNumber: 'SER-OPS-001' }),
      ]);
    } finally {
      await new Promise<void>((resolve) => server.close(() => resolve()));
      database.close();
    }
  });

  it('imports a legacy portfolio into the shared operations tables and deduplicates it', async () => {
    const dataDirectory = makeTemporaryDataDirectory();
    const { app, database } = createServer({ dataDirectory });
    const server = app.listen(0, '127.0.0.1');

    try {
      await new Promise<void>((resolve) => server.once('listening', () => resolve()));
      const address = server.address();
      const port = typeof address === 'object' && address ? address.port : 0;
      const baseUrl = `http://127.0.0.1:${port}`;
      const bytes = await makeLegacyPortfolioWorkbook();
      const payload = {
        sourceName: 'cartera-legacy.xlsx',
        contentBase64: Buffer.from(bytes).toString('base64'),
      };

      const importResponse = await fetch(`${baseUrl}/api/operations/import-legacy-portfolio`, {
        method: 'POST',
        headers: { 'content-type': 'application/json' },
        body: JSON.stringify(payload),
      });
      expect(await resolveImportJob<Record<string, unknown>>(baseUrl, importResponse)).toMatchObject({
        duplicate: false,
        rows: 2,
        skippedRows: 1,
        duplicateRows: 1,
        customers: 1,
        contracts: 1,
        equipment: 2,
      });

      const customersResponse = await fetch(`${baseUrl}/api/operations/customers?query=cartera`);
      expect(await customersResponse.json()).toEqual([
        expect.objectContaining({
          name: 'Cliente Cartera',
          customerType: 'Publico',
          commercialArea: 'Strategic',
          contracts: [expect.objectContaining({
            reference: 'OV-CART-001',
            contractType: 'Alquiler',
            equipment: expect.arrayContaining([
              expect.objectContaining({ serialNumber: 'SER-CART-001' }),
              expect.objectContaining({ serialNumber: 'SER-CART-002', location: 'Sucursal' }),
            ]),
          })],
        }),
      ]);

      const duplicateResponse = await fetch(`${baseUrl}/api/operations/import-legacy-portfolio`, {
        method: 'POST',
        headers: { 'content-type': 'application/json' },
        body: JSON.stringify(payload),
      });
      await expect(resolveImportJob(baseUrl, duplicateResponse)).resolves.toMatchObject({ duplicate: true, sourceName: 'cartera-legacy.xlsx' });
    } finally {
      await new Promise<void>((resolve) => server.close(() => resolve()));
      database.close();
    }
  });

  it('imports the Canon discontinuation list as model support data and deduplicates it', async () => {
    const dataDirectory = makeTemporaryDataDirectory();
    const { app, database } = createServer({ dataDirectory });
    const server = app.listen(0, '127.0.0.1');

    try {
      await new Promise<void>((resolve) => server.once('listening', () => resolve()));
      const address = server.address();
      const port = typeof address === 'object' && address ? address.port : 0;
      const baseUrl = `http://127.0.0.1:${port}`;
      const headers = { 'content-type': 'application/json' };

      const customerResponse = await fetch(`${baseUrl}/api/operations/customers`, {
        method: 'POST',
        headers,
        body: JSON.stringify({ name: 'Cliente Canon Discontinuado' }),
      });
      const customer = (await customerResponse.json()) as { id: string };
      await fetch(`${baseUrl}/api/operations/contracts`, {
        method: 'POST',
        headers,
        body: JSON.stringify({
          customerId: customer.id,
          contractType: 'Mantenimiento',
          equipment: [{ modelLabel: 'iR ADV C3325i', serialNumber: 'SER-CANON-001' }],
        }),
      });

      const bytes = await makeCanonDiscontinuationWorkbook();
      const payload = {
        sourceName: 'MODELOS DISCONTINUOS.xlsx',
        contentBase64: Buffer.from(bytes).toString('base64'),
      };
      const importResponse = await fetch(`${baseUrl}/api/operations/import-canon-discontinuation`, {
        method: 'POST',
        headers,
        body: JSON.stringify(payload),
      });
      expect(await resolveImportJob<Record<string, unknown>>(baseUrl, importResponse)).toMatchObject({
        duplicate: false,
        rows: 2,
        duplicateRows: 1,
        items: 2,
      });

      const modelResponse = await fetch(`${baseUrl}/api/operations/model-discontinuation`);
      expect(await modelResponse.json()).toEqual([
        expect.objectContaining({
          modelLabel: 'iR ADV C3325i',
          partCode: '',
          endsAt: '2025-12-31',
          installedCount: 1,
          installedModels: ['iR ADV C3325i'],
          status: 'discontinued',
        }),
        expect.objectContaining({
          modelLabel: 'iR ADV C3325i',
          partCode: 'Q30-3325-000',
          endsAt: '2027-12-01',
          installedCount: 1,
          status: 'scheduled',
        }),
      ]);

      const duplicateResponse = await fetch(`${baseUrl}/api/operations/import-canon-discontinuation`, {
        method: 'POST',
        headers,
        body: JSON.stringify(payload),
      });
      await expect(resolveImportJob(baseUrl, duplicateResponse)).resolves.toMatchObject({ duplicate: true, sourceName: 'MODELOS DISCONTINUOS.xlsx' });
    } finally {
      await new Promise<void>((resolve) => server.close(() => resolve()));
      database.close();
    }
  });

  it('imports Waldbott Depot 04 stock, keeps the latest model snapshot and exposes the cross-reference', async () => {
    const dataDirectory = makeTemporaryDataDirectory();
    const { app, database } = createServer({ dataDirectory });
    const server = app.listen(0, '127.0.0.1');

    try {
      await new Promise<void>((resolve) => server.once('listening', () => resolve()));
      const address = server.address();
      const port = typeof address === 'object' && address ? address.port : 0;
      const baseUrl = `http://127.0.0.1:${port}`;
      const headers = { 'content-type': 'application/json' };

      const customerResponse = await fetch(`${baseUrl}/api/operations/customers`, {
        method: 'POST',
        headers,
        body: JSON.stringify({ name: 'Cliente Stock Waldbott' }),
      });
      const customer = (await customerResponse.json()) as { id: string };
      await fetch(`${baseUrl}/api/operations/contracts`, {
        method: 'POST',
        headers,
        body: JSON.stringify({
          customerId: customer.id,
          contractType: 'Mantenimiento',
          equipment: [{ modelLabel: 'iR ADV C5535i', serialNumber: 'SER-STOCK-001' }],
        }),
      });

      const canonBytes = await makeCanonStockSupportWorkbook();
      const canonResponse = await fetch(`${baseUrl}/api/operations/import-canon-discontinuation`, {
        method: 'POST',
        headers,
        body: JSON.stringify({
          sourceName: 'canon-stock-test.xlsx',
          contentBase64: Buffer.from(canonBytes).toString('base64'),
        }),
      });
      await resolveImportJob(baseUrl, canonResponse);

      const bytes = await makeWaldbottStockWorkbook();
      const payload = {
        sourceName: 'stock-waldbott.xlsx',
        contentBase64: Buffer.from(bytes).toString('base64'),
      };
      const importResponse = await fetch(`${baseUrl}/api/operations/import-waldbott-stock`, {
        method: 'POST',
        headers,
        body: JSON.stringify(payload),
      });
      expect(await resolveImportJob<Record<string, unknown>>(baseUrl, importResponse)).toMatchObject({
        duplicate: false,
        rows: 2,
        skippedRows: 2,
        items: 2,
        models: 1,
        quantity: 5,
      });

      const stockResponse = await fetch(`${baseUrl}/api/operations/waldbott-stock`);
      expect(await stockResponse.json()).toEqual([
        expect.objectContaining({
          modelLabel: 'Impresora Laser IR ADV C5535 (120V)',
          deposit: '04',
          quantity: 5,
          canonStatus: 'discontinued',
          canonModelLabel: 'iR ADV C5535i',
          installedCount: 1,
        }),
      ]);

      const duplicateResponse = await fetch(`${baseUrl}/api/operations/import-waldbott-stock`, {
        method: 'POST',
        headers,
        body: JSON.stringify(payload),
      });
      await expect(resolveImportJob(baseUrl, duplicateResponse)).resolves.toMatchObject({ duplicate: true, sourceName: 'stock-waldbott.xlsx' });

      const clearResponse = await fetch(`${baseUrl}/api/operations/exclusive-imports`, { method: 'DELETE' });
      expect(clearResponse.status).toBe(200);
      expect(await clearResponse.json()).toMatchObject({ ok: true, batches: 2, archivedFiles: 2 });

      const clearedModelsResponse = await fetch(`${baseUrl}/api/operations/model-discontinuation`);
      expect(await clearedModelsResponse.json()).toEqual([]);
      const clearedStockResponse = await fetch(`${baseUrl}/api/operations/waldbott-stock`);
      expect(await clearedStockResponse.json()).toEqual([]);
      const sharedCustomersResponse = await fetch(`${baseUrl}/api/operations/customers`);
      expect(await sharedCustomersResponse.json()).toHaveLength(1);
    } finally {
      await new Promise<void>((resolve) => server.close(() => resolve()));
      database.close();
    }
  });
});
