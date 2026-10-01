import fs from 'node:fs';
import path from 'node:path';
import { describe, expect, it } from 'vitest';
import { createServer } from '../../../server';
import { makeTemporaryDataDirectory, makeServicesWorkbook, makeSalesCatalogWorkbook } from '../../test-support/api-helpers';

describe('sales API', () => {
  it('connects the shared catalog to pricing and proformas', async () => {
    const { app, database } = createServer({ dataDirectory: makeTemporaryDataDirectory() });
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
      await fetch(`${baseUrl}/api/catalog/parts`, {
        method: 'POST',
        headers: { 'content-type': 'application/json' },
        body: JSON.stringify({
          batchId: batch.id,
          parts: [{
            brand: 'Canon',
            code: 'FK-123',
            description: 'KIT DE MANTENIMIENTO',
            models: ['iR ADV C3325i'],
            stock: 7,
            priceUsd: 12.5,
            priceLocal: 79375,
            markup: 0,
            discontinuedAt: null,
          }],
          modelFamilies: [{
            brand: 'Canon',
            familyName: 'iR',
            modelName: 'iR ADV C3325i',
            exchangeRate: 6080,
            factor: 1.8,
          }],
        }),
      });

      const pricingResponse = await fetch(`${baseUrl}/api/sales/pricing`, {
        method: 'PUT',
        headers: { 'content-type': 'application/json' },
        body: JSON.stringify({ exchangeRate: 10000, factor: 2, laborPrice: 90000 }),
      });
      expect(pricingResponse.status).toBe(200);

      const priceListResponse = await fetch(`${baseUrl}/api/sales/price-list?query=FK123`);
      const priceList = (await priceListResponse.json()) as Array<{ id: string; salePriceLocal: number }>;
      expect(priceList).toEqual([expect.objectContaining({ salePriceLocal: 250000 })]);

      const familyPriceListResponse = await fetch(`${baseUrl}/api/sales/price-list?familyName=iR&query=FK123`);
      const familyPriceList = (await familyPriceListResponse.json()) as Array<{ salePriceLocal: number }>;
      expect(familyPriceList).toEqual([expect.objectContaining({ salePriceLocal: 136800 })]);

      const proformaResponse = await fetch(`${baseUrl}/api/sales/proformas`, {
        method: 'POST',
        headers: { 'content-type': 'application/json' },
        body: JSON.stringify({
          header: {
            customerName: 'Cliente API',
            customerContact: '',
            serviceReport: '',
            reference: 'API-001',
            issuedAt: '2026-09-10T12:00:00.000Z',
            attendedBy: 'Ventas',
            modelName: 'iR ADV C3325i',
            serialNumber: '',
            mode: 'sin-contrato',
          },
          lines: [
            { kind: 'part', partId: priceList[0].id, quantity: 2 },
            { kind: 'labor', description: 'Instalación', costLocal: 50000, unitPriceLocal: 90000, quantity: 1 },
          ],
        }),
      });
      expect(proformaResponse.status).toBe(201);
      const proforma = (await proformaResponse.json()) as { id: string; totalLocal: number };
      expect(proforma.totalLocal).toBe(590000);

      const historyResponse = await fetch(`${baseUrl}/api/sales/proformas`);
      expect(await historyResponse.json()).toEqual([
        expect.objectContaining({ id: proforma.id, customerName: 'Cliente API', totalLocal: 590000 }),
      ]);
    } finally {
      await new Promise<void>((resolve) => server.close(() => resolve()));
      database.close();
    }
  });

  it('persists the selected price-list models through the local API', async () => {
    const { app, database } = createServer({ dataDirectory: makeTemporaryDataDirectory() });
    const server = app.listen(0, '127.0.0.1');

    try {
      await new Promise<void>((resolve) => server.once('listening', () => resolve()));
      const address = server.address();
      const port = typeof address === 'object' && address ? address.port : 0;
      const baseUrl = `http://127.0.0.1:${port}`;
      const getResponse = await fetch(`${baseUrl}/api/sales/price-list-selection`);
      expect(getResponse.status).toBe(200);
      expect(await getResponse.json()).toEqual({ modelNames: [] });

      const saveResponse = await fetch(`${baseUrl}/api/sales/price-list-selection`, {
        method: 'PUT',
        headers: { 'content-type': 'application/json' },
        body: JSON.stringify({ modelNames: ['iR ADV C5535i', 'iR ADV C3325i', 'iR ADV C5535i'] }),
      });
      expect(saveResponse.status).toBe(200);
      expect(await saveResponse.json()).toEqual({ modelNames: ['iR ADV C3325i', 'iR ADV C5535i'] });

      const invalidResponse = await fetch(`${baseUrl}/api/sales/price-list-selection`, {
        method: 'PUT',
        headers: { 'content-type': 'application/json' },
        body: JSON.stringify({ modelNames: ['válido', 3] }),
      });
      expect(invalidResponse.status).toBe(400);
    } finally {
      await new Promise<void>((resolve) => server.close(() => resolve()));
      database.close();
    }
  });

  it('imports, archives and applies an open contract to fixed-price proformas', async () => {
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
        body: JSON.stringify({
          domain: 'sales-open-contract',
          sourceName: 'contrato-abierto.xlsx',
          sourceType: 'open-contract',
          sourceHash: 'contract-hash-001',
        }),
      });
      expect(batchResponse.status).toBe(201);
      const batch = (await batchResponse.json()) as { id: string };

      const sourceResponse = await fetch(`${baseUrl}/api/imports/${batch.id}/source`, {
        method: 'POST',
        headers: { 'content-type': 'application/json' },
        body: JSON.stringify({
          fileName: 'contrato-abierto.xlsx',
          contentBase64: Buffer.from(await makeServicesWorkbook(
            ['Código', 'Descripción', 'Precio fijo'],
            [['FIJO-1', 'Repuesto contractual', 125000]],
          )).toString('base64'),
          contentType: 'application/vnd.openxmlformats-officedocument.spreadsheetml.sheet',
        }),
      });
      expect(sourceResponse.status).toBe(201);

      const contractResponse = await fetch(`${baseUrl}/api/sales/open-contract`, {
        method: 'POST',
        headers: { 'content-type': 'application/json' },
        body: JSON.stringify({
          batchId: batch.id,
          snapshot: {
            meta: {
              fileName: 'contrato-abierto.xlsx',
              updatedAt: '2026-09-14T12:00:00.000Z',
              rowCount: 1,
              invalidRows: 0,
              duplicateRows: 0,
              sourceFormat: 'xlsx',
              priceCurrency: 'local',
              hasKindColumn: true,
            },
            items: [{
              id: 'contrato-FIJO-1',
              kind: 'repuestos',
              code: 'FIJO-1',
              description: 'Repuesto contractual',
              group: 'Repuestos',
              priceUsd: null,
              priceLocal: 125000,
            }],
          },
        }),
      });
      expect(contractResponse.status).toBe(201);
      expect(await contractResponse.json()).toMatchObject({ meta: { sourceBatchId: batch.id }, items: [{ code: 'FIJO-1' }] });

      const importResponse = await fetch(`${baseUrl}/api/imports/${batch.id}`);
      expect(await importResponse.json()).toMatchObject({
        batch: { status: 'applied', sourceType: 'open-contract' },
        files: [expect.objectContaining({ fileName: 'contrato-abierto.xlsx' })],
      });

      const proformaResponse = await fetch(`${baseUrl}/api/sales/proformas`, {
        method: 'POST',
        headers: { 'content-type': 'application/json' },
        body: JSON.stringify({
          header: {
            customerName: 'Cliente contractual API',
            customerContact: '',
            serviceReport: '',
            reference: 'CON-API-001',
            issuedAt: '2026-09-14T12:00:00.000Z',
            attendedBy: '',
            modelName: '',
            serialNumber: '',
            mode: 'contrato-abierto',
          },
          lines: [{
            kind: 'part',
            code: 'FIJO-1',
            description: 'Repuesto contractual',
            unitPriceLocal: 125000,
            quantity: 2,
          }],
        }),
      });
      expect(proformaResponse.status).toBe(201);
      expect(await proformaResponse.json()).toMatchObject({ mode: 'contrato-abierto', totalLocal: 250000, lines: [{ partId: null }] });

      const usdProformaResponse = await fetch(`${baseUrl}/api/sales/proformas`, {
        method: 'POST',
        headers: { 'content-type': 'application/json' },
        body: JSON.stringify({
          currency: 'USD',
          header: {
            customerName: 'Cliente USD API',
            customerContact: '',
            serviceReport: '',
            reference: 'CON-USD-API',
            issuedAt: '2026-09-14T12:00:00.000Z',
            attendedBy: '',
            modelName: '',
            serialNumber: '',
            mode: 'contrato-abierto',
          },
          lines: [{
            kind: 'part',
            code: 'USD-1',
            description: 'Repuesto contractual USD',
            unitPriceUsd: 12.5,
            quantity: 2,
          }],
        }),
      });
      expect(usdProformaResponse.status).toBe(201);
      expect(await usdProformaResponse.json()).toMatchObject({ currency: 'USD', totalLocal: 149600, lines: [{ unitPriceUsd: 12.5, unitPriceLocal: 74800 }] });
    } finally {
      await new Promise<void>((resolve) => server.close(() => resolve()));
      database.close();
    }
  });

  it('imports separate Proformas catalogs, preserves the source and saves their fixed-price lines', async () => {
    const dataDirectory = makeTemporaryDataDirectory();
    const { app, database } = createServer({ dataDirectory });
    const server = app.listen(0, '127.0.0.1');

    try {
      await new Promise<void>((resolve) => server.once('listening', () => resolve()));
      const address = server.address();
      const port = typeof address === 'object' && address ? address.port : 0;
      const baseUrl = `http://127.0.0.1:${port}`;
      const bytes = await makeSalesCatalogWorkbook();
      const batchResponse = await fetch(`${baseUrl}/api/imports`, {
        method: 'POST',
        headers: { 'content-type': 'application/json' },
        body: JSON.stringify({
          domain: 'sales-catalog',
          sourceName: 'CONSUMIBLES_SISTEMA_ING.xlsx',
          sourceType: 'proformas-catalog-consumibles',
          sourceHash: 'sales-catalog-hash-001',
        }),
      });
      expect(batchResponse.status).toBe(201);
      const batch = (await batchResponse.json()) as { id: string };

      const sourceResponse = await fetch(`${baseUrl}/api/imports/${batch.id}/source`, {
        method: 'POST',
        headers: { 'content-type': 'application/json' },
        body: JSON.stringify({
          fileName: 'CONSUMIBLES_SISTEMA_ING.xlsx',
          contentBase64: Buffer.from(bytes).toString('base64'),
          contentType: 'application/vnd.openxmlformats-officedocument.spreadsheetml.sheet',
        }),
      });
      expect(sourceResponse.status).toBe(201);
      const stored = (await sourceResponse.json()) as { storedPath: string };

      const catalogResponse = await fetch(`${baseUrl}/api/sales/catalogs/consumibles`, {
        method: 'POST',
        headers: { 'content-type': 'application/json' },
        body: JSON.stringify({
          batchId: batch.id,
          snapshot: {
            meta: {
              kind: 'consumibles',
              fileName: 'CONSUMIBLES_SISTEMA_ING.xlsx',
              updatedAt: '2026-09-14T12:00:00.000Z',
              rowCount: 1,
              invalidRows: 0,
              duplicateRows: 0,
              hasDiscontinuedColumn: true,
            },
            items: [{
              id: 'proformas-consumibles-CEXV55',
              kind: 'consumibles',
              code: 'CEXV-55',
              description: 'TONER NEGRO',
              group: 'Tóner',
              priceUsd: 13,
              priceLocal: 77740,
              stock: 4,
              discontinued: 'active',
            }],
          },
        }),
      });
      expect(catalogResponse.status).toBe(201);
      expect(await catalogResponse.json()).toMatchObject({ meta: { kind: 'consumibles', sourceBatchId: batch.id }, items: [{ code: 'CEXV-55', priceLocal: 77740 }] });
      expect(fs.existsSync(path.join(dataDirectory, stored.storedPath))).toBe(true);

      const catalogsResponse = await fetch(`${baseUrl}/api/sales/catalogs`);
      expect(await catalogsResponse.json()).toMatchObject({ consumibles: { items: [{ code: 'CEXV-55' }] }, repuestos: null });
      const importResponse = await fetch(`${baseUrl}/api/imports/${batch.id}`);
      expect(await importResponse.json()).toMatchObject({ batch: { status: 'applied', sourceType: 'proformas-catalog-consumibles' } });

      const proformaResponse = await fetch(`${baseUrl}/api/sales/proformas`, {
        method: 'POST',
        headers: { 'content-type': 'application/json' },
        body: JSON.stringify({
          header: {
            customerName: 'Cliente catálogo Proformas',
            customerContact: '',
            serviceReport: '',
            reference: 'CAT-API-001',
            issuedAt: '2026-09-14T12:00:00.000Z',
            attendedBy: '',
            modelName: '',
            serialNumber: '',
            mode: 'sin-contrato',
          },
          lines: [{
            kind: 'part',
            source: 'proformas',
            code: 'CEXV-55',
            description: 'TONER NEGRO',
            unitPriceUsd: 13,
            unitPriceLocal: 77740,
            quantity: 2,
          }],
        }),
      });
      expect(proformaResponse.status).toBe(201);
      expect(await proformaResponse.json()).toMatchObject({ mode: 'sin-contrato', totalLocal: 155480, lines: [{ partId: null, code: 'CEXV-55' }] });
    } finally {
      await new Promise<void>((resolve) => server.close(() => resolve()));
      database.close();
    }
  });
});
