import fs from 'node:fs';
import path from 'node:path';
import { describe, expect, it } from 'vitest';
import { createServer } from '../../../server';
import { makeTemporaryDataDirectory } from '../../test-support/api-helpers';

describe('maintenance API', () => {
  it('imports the legacy maintenance database and exposes equipment analysis', async () => {
    const dataDirectory = makeTemporaryDataDirectory();
    const { app, database } = createServer({ dataDirectory });
    const server = app.listen(0, '127.0.0.1');

    try {
      await new Promise<void>((resolve) => server.once('listening', () => resolve()));
      const address = server.address();
      const port = typeof address === 'object' && address ? address.port : 0;
      const baseUrl = `http://127.0.0.1:${port}`;
      const legacyDatabase = {
        models: [{ name: 'iR ADV C3325i', vidaUtil: 100000, optimoBase: 22000, mermaMax: 0.3 }],
        records: [
          {
            cliente: 'Cliente Histórico',
            ov: 'OV-HIST-001',
            equipo: 'iR ADV C3325i',
            nserie: 'SER-HIST-001',
            periodo: '2026-01',
            papel: 'Negro A4',
            copias: 20000,
            contador: 10000,
          },
          {
            cliente: 'Cliente Histórico',
            ov: 'OV-HIST-001',
            equipo: 'iR ADV C3325i',
            nserie: 'SER-HIST-001',
            periodo: '2026-02',
            papel: 'Negro A4',
            copias: 30000,
            contador: 20000,
          },
        ],
      };
      const content = JSON.stringify(legacyDatabase);
      const payload = {
        sourceName: 'database_sqlite.json',
        contentBase64: Buffer.from(content).toString('base64'),
        database: legacyDatabase,
      };

      const importResponse = await fetch(`${baseUrl}/api/maintenance/import-legacy`, {
        method: 'POST',
        headers: { 'content-type': 'application/json' },
        body: JSON.stringify(payload),
      });
      expect(importResponse.status).toBe(201);
      const imported = await importResponse.json();
      expect(imported).toMatchObject({
        duplicate: false,
        models: 1,
        records: 2,
        customers: 1,
        contracts: 1,
        equipment: 1,
        matchedRecords: 2,
        unmatchedRecords: 0,
      });

      const summaryResponse = await fetch(`${baseUrl}/api/maintenance/summary`);
      expect(await summaryResponse.json()).toMatchObject({
        sourceName: 'database_sqlite.json',
        models: 1,
        records: 2,
        analyzedEquipment: 1,
      });

      const analysisResponse = await fetch(`${baseUrl}/api/maintenance/analysis?query=SER-HIST-001`);
      expect(await analysisResponse.json()).toEqual([
        expect.objectContaining({
          serialNumber: 'SER-HIST-001',
          matchedModelLabel: 'iR ADV C3325i',
          averageCopies: 25000,
          status: 'CRÍTICO',
          periods: expect.arrayContaining([
            expect.objectContaining({ period: '2026-01' }),
            expect.objectContaining({ period: '2026-02' }),
          ]),
        }),
      ]);

      const duplicateResponse = await fetch(`${baseUrl}/api/maintenance/import-legacy`, {
        method: 'POST',
        headers: { 'content-type': 'application/json' },
        body: JSON.stringify(payload),
      });
      expect(duplicateResponse.status).toBe(200);
      expect(await duplicateResponse.json()).toMatchObject({ duplicate: true, batchId: imported.batchId });
      const metadataResponse = await fetch(`${baseUrl}/api/imports/${imported.batchId}`);
      const metadata = (await metadataResponse.json()) as { files: Array<{ id: string; fileName: string; storedPath: string }> };
      expect(metadata.files).toHaveLength(1);
      expect(fs.existsSync(path.join(dataDirectory, metadata.files[0].storedPath))).toBe(true);

      const originalResponse = await fetch(`${baseUrl}/api/imports/${imported.batchId}/files/${metadata.files[0].id}`);
      expect(originalResponse.status).toBe(200);
      expect(originalResponse.headers.get('content-disposition')).toContain('database_sqlite.json');
      expect(await originalResponse.text()).toBe(content);

      const countersCsv = [
        'Cliente;Nº O.V.;Equipo;Nº Serie;Año-Mes;Papel;Copias;Contador;División',
        'Cliente CSV;OV-CSV-001;iR ADV C3325i;SER-CSV-001;2026-08;Negro A4;1200;25000;MRA',
      ].join('\n');
      const counterImportResponse = await fetch(`${baseUrl}/api/maintenance/import-counters`, {
        method: 'POST',
        headers: { 'content-type': 'application/json' },
        body: JSON.stringify({
          sourceName: 'Contadores.csv',
          contentBase64: Buffer.from(countersCsv).toString('base64'),
        }),
      });
      expect(counterImportResponse.status).toBe(201);
      const counterImport = await counterImportResponse.json();
      expect(counterImport).toMatchObject({
        duplicate: false,
        sourceName: 'Contadores.csv',
        records: 1,
        skippedRows: 0,
        matchedRecords: 1,
      });

      const counterRawResponse = await fetch(`${baseUrl}/api/imports/${counterImport.batchId}/raw-rows`);
      expect(await counterRawResponse.json()).toMatchObject({
        sheets: [expect.objectContaining({ sheetName: 'CSV', rowCount: 2 })],
        rows: [
          expect.objectContaining({ rowNumber: 1, values: expect.arrayContaining(['Cliente']) }),
          expect.objectContaining({ rowNumber: 2, values: expect.arrayContaining(['Cliente CSV']) }),
        ],
      });

      const rulesResponse = await fetch(`${baseUrl}/api/maintenance/rules`);
      const rules = await rulesResponse.json();
      expect(rules).toEqual([expect.objectContaining({ modelLabel: 'iR ADV C3325i' })]);

      const clearResponse = await fetch(`${baseUrl}/api/maintenance/import`, { method: 'DELETE' });
      expect(clearResponse.status).toBe(200);
      expect(await clearResponse.json()).toEqual({ ok: true, batches: 2, archivedFiles: 2 });

      const clearedSummaryResponse = await fetch(`${baseUrl}/api/maintenance/summary`);
      expect(await clearedSummaryResponse.json()).toMatchObject({
        batchId: null,
        sourceName: null,
        records: 0,
        models: 0,
      });
      expect(fs.readdirSync(path.join(dataDirectory, 'imports', '.removed', imported.batchId))).toHaveLength(1);
      expect(fs.readdirSync(path.join(dataDirectory, 'imports', '.removed', counterImport.batchId))).toHaveLength(1);
      const sharedPortfolioResponse = await fetch(`${baseUrl}/api/operations/customers`);
      expect(await sharedPortfolioResponse.json()).toHaveLength(2);
    } finally {
      await new Promise<void>((resolve) => server.close(() => resolve()));
      database.close();
    }
  });
});
