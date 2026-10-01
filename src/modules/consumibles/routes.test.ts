import fs from 'node:fs';
import path from 'node:path';
import { describe, expect, it } from 'vitest';
import { createServer } from '../../../server';
import { PYG_TO_USD } from './analysis';
import { makeTemporaryDataDirectory, resolveImportJob, makeConsumablesWorkbook, makeUseRepuestosWorkbook, makeOutputWorkbook, makeServicesWorkbook, makeLegacyPortfolioWorkbook } from '../../test-support/api-helpers';

describe('consumables API', () => {
  it('preflights a bundle source without creating import batches', async () => {
    const { app, database } = createServer({ dataDirectory: makeTemporaryDataDirectory() });
    const server = app.listen(0, '127.0.0.1');

    try {
      await new Promise<void>((resolve) => server.once('listening', () => resolve()));
      const address = server.address();
      const port = typeof address === 'object' && address ? address.port : 0;
      const baseUrl = `http://127.0.0.1:${port}`;
      const contents = await makeConsumablesWorkbook([
        ['line-1', 'OV-PREFLIGHT', new Date('2026-08-01T12:00:00Z'), 'iR ADV C3325i', 'SER-PREFLIGHT', 'CRG-T03', 'Tóner T03', 1, 120],
      ]);

      const validResponse = await fetch(`${baseUrl}/api/consumables/bundle-preflight`, {
        method: 'POST',
        headers: { 'content-type': 'application/json' },
        body: JSON.stringify({
          sourceId: 'consumibles.detail',
          sourceName: 'Detalles de consumibles.xlsx',
          contentBase64: Buffer.from(contents).toString('base64'),
        }),
      });
      expect(validResponse.status).toBe(200);
      expect(await validResponse.json()).toEqual({
        sourceId: 'consumibles.detail',
        sourceName: 'Detalles de consumibles.xlsx',
        accepted: true,
      });

      const zipHeaderOnlyResponse = await fetch(`${baseUrl}/api/consumables/bundle-preflight`, {
        method: 'POST',
        headers: { 'content-type': 'application/json' },
        body: JSON.stringify({
          bundleId: 'bundle-header-only',
          sourceId: 'services.lam',
          sourceName: 'Servicios LAM.xlsx',
          contentBase64: Buffer.from([0x50, 0x4b, 0x03, 0x04]).toString('base64'),
        }),
      });
      expect(zipHeaderOnlyResponse.status).toBe(200);
      expect(await zipHeaderOnlyResponse.json()).toMatchObject({ accepted: true, bundleId: 'bundle-header-only' });
      const discardResponse = await fetch(`${baseUrl}/api/consumables/bundle/bundle-header-only`, { method: 'DELETE' });
      expect(discardResponse.ok).toBe(true);

      const invalidResponse = await fetch(`${baseUrl}/api/consumables/bundle-preflight`, {
        method: 'POST',
        headers: { 'content-type': 'application/json' },
        body: JSON.stringify({
          sourceId: 'services.lam',
          sourceName: 'Servicios LAM.xlsx',
          contentBase64: Buffer.from([1, 2, 3, 4]).toString('base64'),
        }),
      });
      expect(invalidResponse.status).toBe(400);
      expect(database.prepare('SELECT COUNT(*) AS count FROM import_batches').get()).toEqual({ count: 0 });
    } finally {
      await new Promise<void>((resolve) => server.close(() => resolve()));
      database.close();
    }
  });

  it('stages all nine bundle sources and applies them atomically as an import job', async () => {
    const dataDirectory = makeTemporaryDataDirectory();
    const { app, database } = createServer({ dataDirectory });
    const server = app.listen(0, '127.0.0.1');

    try {
      await new Promise<void>((resolve) => server.once('listening', () => resolve()));
      const address = server.address();
      const port = typeof address === 'object' && address ? address.port : 0;
      const baseUrl = `http://127.0.0.1:${port}`;
      const headers = { 'content-type': 'application/json' };
      const bundleId = 'bundle-atomic-test';
      const portfolioBytes = await makeLegacyPortfolioWorkbook();
      const detailBytes = await makeConsumablesWorkbook([
        ['line-detail', 'OV-CART-001', new Date('2026-08-01T12:00:00Z'), 'iR ADV C3325i', 'SER-CART-001', 'CRG-T03-BUNDLE', 'Tóner T03', 1, 15],
      ]);
      const partsDetailBytes = await makeConsumablesWorkbook([
        ['line-parts', 'OV-CART-001', new Date('2026-08-02T12:00:00Z'), 'iR ADV C3325i', 'SER-CART-001', 'RPL-BUNDLE', 'Kit de rodillo', 1, 30],
      ]);
      const useRepuestosRow = new Array(24).fill(undefined) as unknown[];
      useRepuestosRow[4] = new Date('2026-08-03T12:00:00Z');
      useRepuestosRow[5] = 'Cliente Cartera';
      useRepuestosRow[8] = 'OV-CART-001';
      useRepuestosRow[9] = 'Alquiler';
      useRepuestosRow[13] = 'iR ADV C3325i';
      useRepuestosRow[14] = '2026-08';
      useRepuestosRow[15] = 'SER-CART-001';
      useRepuestosRow[17] = 'RPL-USE-BUNDLE';
      useRepuestosRow[20] = 'Fusor completo';
      useRepuestosRow[21] = 1;
      useRepuestosRow[22] = 50000;
      useRepuestosRow[23] = 50000;
      const useRepuestosBytes = await makeUseRepuestosWorkbook([useRepuestosRow]);
      const outputConsumablesRow = new Array(12).fill(undefined) as unknown[];
      outputConsumablesRow[0] = 7101;
      outputConsumablesRow[1] = new Date('2026-08-04T12:00:00Z');
      outputConsumablesRow[2] = 'CRG-OUT-BUNDLE';
      outputConsumablesRow[3] = 'Tóner de salida';
      outputConsumablesRow[4] = 1;
      outputConsumablesRow[6] = 12000;
      outputConsumablesRow[7] = 'SER-CART-001';
      outputConsumablesRow[8] = 'iR ADV C3325i';
      outputConsumablesRow[11] = 'Cliente Cartera';
      const outputConsumablesBytes = await makeOutputWorkbook(12, [outputConsumablesRow]);
      const outputPartsRow = new Array(13).fill(undefined) as unknown[];
      outputPartsRow[0] = 7102;
      outputPartsRow[1] = new Date('2026-08-05T12:00:00Z');
      outputPartsRow[2] = 'RPL-OUT-BUNDLE';
      outputPartsRow[3] = 'Fusor de salida';
      outputPartsRow[4] = 1;
      outputPartsRow[7] = 'Cliente Cartera';
      outputPartsRow[8] = 'iR ADV C3325i';
      outputPartsRow[9] = 'SER-CART-001';
      outputPartsRow[10] = 'Técnico paquete';
      outputPartsRow[12] = 9901;
      const outputPartsBytes = await makeOutputWorkbook(13, [outputPartsRow]);
      const serviceHeaders = Array.from({ length: 31 }, (_, index) => `unused-${index}`);
      serviceHeaders[1] = 'Nº I.S.';
      serviceHeaders[4] = 'Cliente';
      serviceHeaders[5] = 'Fecha';
      serviceHeaders[6] = 'Nº OV';
      serviceHeaders[7] = 'Nº Serie';
      serviceHeaders[8] = 'Equipo';
      serviceHeaders[16] = 'Tipo Servicio';
      serviceHeaders[18] = 'Fch/Hora Inicio';
      serviceHeaders[20] = 'Tipo Contrato';
      serviceHeaders[21] = 'Tipo Tarea';
      serviceHeaders[25] = 'Técnico';
      serviceHeaders[29] = 'Tarea realizada';
      serviceHeaders[30] = 'Repuestos utilizados';
      const serviceRow = Array.from({ length: 31 }, () => undefined) as unknown[];
      serviceRow[1] = 9902;
      serviceRow[4] = 'Cliente Cartera';
      serviceRow[5] = new Date('2026-08-06T12:00:00Z');
      serviceRow[6] = 'OV-CART-001';
      serviceRow[7] = 'SER-CART-001';
      serviceRow[8] = 'iR ADV C3325i';
      serviceRow[16] = 'En sitio';
      serviceRow[18] = new Date('2026-08-06T12:00:00Z');
      serviceRow[20] = 'Alquiler';
      serviceRow[21] = 'Reparación';
      serviceRow[25] = 'Técnico paquete';
      serviceRow[29] = 'Cambio de fusor';
      serviceRow[30] = 'Fusor';
      const serviceBytes = await makeServicesWorkbook(serviceHeaders, [serviceRow]);
      const sources = [
        ['fleet.equipment', 'Equipos.xlsx', portfolioBytes],
        ['fleet.contracts', 'Contratos.xlsx', portfolioBytes],
        ['fleet.contract-details', 'Detalles de contratos.xlsx', portfolioBytes],
        ['consumibles.detail', 'Detalles de consumibles.xlsx', detailBytes],
        ['consumibles.parts-detail', 'Detalles de repuestos.xlsx', partsDetailBytes],
        ['consumibles.parts-usage', 'Detalles de uso de repuestos.xlsx', useRepuestosBytes],
        ['consumibles.dispatch', 'Salida de Consumibles.xlsx', outputConsumablesBytes],
        ['consumibles.parts-dispatch', 'Salida de Repuestos.xlsx', outputPartsBytes],
        ['services.lam', 'Servicios LAM.xlsx', serviceBytes],
      ] as const;

      for (const [sourceId, sourceName, contents] of sources) {
        const preflightResponse = await fetch(`${baseUrl}/api/consumables/bundle-preflight`, {
          method: 'POST',
          headers,
          body: JSON.stringify({
            bundleId,
            sourceId,
            sourceName,
            contentBase64: Buffer.from(contents).toString('base64'),
          }),
        });
        const preflightBody = await preflightResponse.text();
        expect(preflightResponse.status, `${sourceId}: ${preflightBody}`).toBe(200);
      }

      expect(database.prepare('SELECT COUNT(*) AS count FROM import_batches').get()).toEqual({ count: 0 });
      const commitResponse = await fetch(`${baseUrl}/api/consumables/bundle-commit`, {
        method: 'POST',
        headers,
        body: JSON.stringify({ bundleId }),
      });
      expect(commitResponse.status).toBe(202);
      const commit = await resolveImportJob<{
        atomic: boolean;
        results: Array<{ sourceId: string; duplicate: boolean }>;
      }>(baseUrl, commitResponse);
      expect(commit.atomic).toBe(true);
      expect(commit.results).toHaveLength(9);
      expect(commit.results.every((result) => !result.duplicate)).toBe(true);
      expect(database.prepare("SELECT COUNT(*) AS count FROM import_batches WHERE status = 'applied'").get()).toEqual({ count: 9 });
      expect(database.prepare('SELECT COUNT(*) AS count FROM consumables_usage_records').get()).toEqual({ count: 3 });
      expect(database.prepare('SELECT COUNT(*) AS count FROM consumables_output_records').get()).toEqual({ count: 2 });
      expect(database.prepare('SELECT COUNT(*) AS count FROM service_records').get()).toEqual({ count: 1 });
      expect(fs.existsSync(path.join(dataDirectory, 'imports', '.staging', bundleId))).toBe(false);

      const staleServiceRow = [...serviceRow];
      staleServiceRow[1] = 9903;
      const staleServiceBytes = await makeServicesWorkbook(serviceHeaders, [staleServiceRow]);
      const staleServiceResponse = await fetch(`${baseUrl}/api/services/import-xlsx`, {
        method: 'POST',
        headers,
        body: JSON.stringify({
          sourceName: 'Servicios LAM versión B.xlsx',
          sourceType: 'servicios',
          contentBase64: Buffer.from(staleServiceBytes).toString('base64'),
        }),
      });
      expect(staleServiceResponse.status).toBe(201);
      const staleService = (await staleServiceResponse.json()) as { batchId: string; accepted: number };
      expect(staleService.accepted).toBe(1);
      expect(database.prepare("SELECT COUNT(*) AS count FROM import_batches WHERE domain = 'services' AND status = 'applied'").get()).toEqual({ count: 2 });
      expect(database.prepare('SELECT COUNT(*) AS count FROM service_records').get()).toEqual({ count: 2 });

      const duplicateBundleId = 'bundle-duplicate-selected-source';
      for (const [sourceId, sourceName, contents] of sources) {
        const preflightResponse = await fetch(`${baseUrl}/api/consumables/bundle-preflight`, {
          method: 'POST',
          headers,
          body: JSON.stringify({
            bundleId: duplicateBundleId,
            sourceId,
            sourceName,
            contentBase64: Buffer.from(contents).toString('base64'),
          }),
        });
        expect(preflightResponse.status, `${sourceId}: ${await preflightResponse.text()}`).toBe(200);
      }
      const duplicateCommitResponse = await fetch(`${baseUrl}/api/consumables/bundle-commit`, {
        method: 'POST',
        headers,
        body: JSON.stringify({ bundleId: duplicateBundleId }),
      });
      const duplicateCommit = await resolveImportJob<{
        atomic: boolean;
        results: Array<{ sourceId: string; duplicate: boolean }>;
      }>(baseUrl, duplicateCommitResponse);
      expect(duplicateCommit.atomic).toBe(true);
      expect(duplicateCommit.results).toHaveLength(9);
      expect(duplicateCommit.results.every((result) => result.duplicate)).toBe(true);
      expect(database.prepare("SELECT source_name FROM import_batches WHERE domain = 'services' AND status = 'applied'").all()).toEqual([
        { source_name: 'Servicios LAM.xlsx' },
      ]);
      expect(database.prepare('SELECT service_number FROM service_records').all()).toEqual([{ service_number: 9902 }]);
      expect(database.prepare('SELECT COUNT(*) AS count FROM archived_import_files WHERE source_batch_id = ?').get(staleService.batchId)).toEqual({ count: 1 });

      const failingBundleId = 'bundle-atomic-failure';
      const failingDetailBytes = await makeConsumablesWorkbook([
        ['line-failure', 'OV-CART-001', new Date('2026-09-01T12:00:00Z'), 'iR ADV C3325i', 'SER-CART-001', 'CRG-T03-FAILURE', 'Tóner T03', 1, 15],
      ]);
      const failingSources = sources.map(([sourceId, sourceName, contents]) => sourceId === 'consumibles.detail'
        ? [sourceId, 'Detalles de consumibles corregidos.xlsx', failingDetailBytes] as const
        : [sourceId, sourceName, contents] as const);
      for (const [sourceId, sourceName, contents] of failingSources) {
        const preflightResponse = await fetch(`${baseUrl}/api/consumables/bundle-preflight`, {
          method: 'POST',
          headers,
          body: JSON.stringify({
            bundleId: failingBundleId,
            sourceId,
            sourceName,
            contentBase64: Buffer.from(contents).toString('base64'),
          }),
        });
        const preflightBody = await preflightResponse.text();
        expect(preflightResponse.status, `${sourceId}: ${preflightBody}`).toBe(200);
      }
      database.exec(`
        CREATE TRIGGER force_bundle_failure
        BEFORE INSERT ON consumables_usage_records
        BEGIN
          SELECT RAISE(ABORT, 'fallo controlado del paquete');
        END;
      `);
      const failingCommitResponse = await fetch(`${baseUrl}/api/consumables/bundle-commit`, {
        method: 'POST',
        headers,
        body: JSON.stringify({ bundleId: failingBundleId }),
      });
      expect(failingCommitResponse.status).toBe(202);
      await expect(resolveImportJob(baseUrl, failingCommitResponse)).rejects.toThrow('fallo controlado del paquete');
      expect(database.prepare("SELECT COUNT(*) AS count FROM import_batches WHERE status = 'applied'").get()).toEqual({ count: 9 });
      expect(database.prepare('SELECT COUNT(*) AS count FROM consumables_usage_records').get()).toEqual({ count: 3 });
      expect(fs.existsSync(path.join(dataDirectory, 'imports', '.staging', failingBundleId))).toBe(false);
    } finally {
      await new Promise<void>((resolve) => server.close(() => resolve()));
      database.close();
    }
  });

  it('archives and removes a selected Consumibles load without touching shared loads', async () => {
    const dataDirectory = makeTemporaryDataDirectory();
    const { app, database } = createServer({ dataDirectory });
    const server = app.listen(0, '127.0.0.1');

    try {
      await new Promise<void>((resolve) => server.once('listening', () => resolve()));
      const address = server.address();
      const port = typeof address === 'object' && address ? address.port : 0;
      const baseUrl = `http://127.0.0.1:${port}`;
      const createResponse = await fetch(`${baseUrl}/api/imports`, {
        method: 'POST',
        headers: { 'content-type': 'application/json' },
        body: JSON.stringify({ domain: 'consumibles', sourceName: 'exportacion-renombrada.xlsx', sourceType: 'consumibles' }),
      });
      const batch = (await createResponse.json()) as { id: string };
      const contents = await makeConsumablesWorkbook([]);
      const sourceResponse = await fetch(`${baseUrl}/api/imports/${batch.id}/source`, {
        method: 'POST',
        headers: { 'content-type': 'application/json' },
        body: JSON.stringify({
          fileName: 'exportacion-renombrada.xlsx',
          contentBase64: Buffer.from(contents).toString('base64'),
          contentType: 'application/vnd.openxmlformats-officedocument.spreadsheetml.sheet',
        }),
      });
      expect(sourceResponse.status).toBe(201);
      const stored = (await sourceResponse.json()) as { id: string; storedPath: string };
      const statusResponse = await fetch(`${baseUrl}/api/imports/${batch.id}/status`, {
        method: 'POST',
        headers: { 'content-type': 'application/json' },
        body: JSON.stringify({ status: 'applied' }),
      });
      expect(statusResponse.status).toBe(200);
      expect(fs.existsSync(path.join(dataDirectory, stored.storedPath))).toBe(true);

      const archiveStatusResponse = await fetch(`${baseUrl}/api/system/import-originals/status`);
      expect(await archiveStatusResponse.json()).toMatchObject({ totalFiles: 1, embeddedFiles: 1, missingFiles: 0 });
      const sourcePath = path.join(dataDirectory, stored.storedPath);
      const temporarilyMovedPath = path.join(dataDirectory, '.test-source-temporary');
      fs.renameSync(sourcePath, temporarilyMovedPath);
      const originalResponse = await fetch(`${baseUrl}/api/imports/${batch.id}/files/${stored.id}`);
      expect(originalResponse.status).toBe(200);
      expect(Buffer.from(await originalResponse.arrayBuffer())).toEqual(Buffer.from(contents));
      fs.renameSync(temporarilyMovedPath, sourcePath);

      fs.rmSync(sourcePath);
      const removeResponse = await fetch(`${baseUrl}/api/imports/${batch.id}`, { method: 'DELETE' });
      expect(removeResponse.status).toBe(200);
      expect(await removeResponse.json()).toMatchObject({ ok: true, batchId: batch.id, archivedFiles: 1 });
      expect(fs.existsSync(path.join(dataDirectory, stored.storedPath))).toBe(false);
      const archivedDirectory = path.join(dataDirectory, 'imports', '.removed');
      expect(fs.readdirSync(archivedDirectory, { recursive: true }).some((entry) => String(entry).endsWith(path.basename(stored.storedPath)))).toBe(true);

      const metadataResponse = await fetch(`${baseUrl}/api/imports/${batch.id}`);
      expect(metadataResponse.status).toBe(404);
      expect(database.prepare('SELECT COUNT(*) AS count FROM import_batches WHERE id = ?').get(batch.id)).toEqual({ count: 0 });
    } finally {
      await new Promise<void>((resolve) => server.close(() => resolve()));
      database.close();
    }
  });

  it('clears all direct Consumibles loads while keeping related imports', async () => {
    const dataDirectory = makeTemporaryDataDirectory();
    const { app, database } = createServer({ dataDirectory });
    const server = app.listen(0, '127.0.0.1');

    try {
      await new Promise<void>((resolve) => server.once('listening', () => resolve()));
      const address = server.address();
      const port = typeof address === 'object' && address ? address.port : 0;
      const baseUrl = `http://127.0.0.1:${port}`;
      const directResponse = await fetch(`${baseUrl}/api/imports`, {
        method: 'POST',
        headers: { 'content-type': 'application/json' },
        body: JSON.stringify({ domain: 'consumibles', sourceName: 'detalles-directos.xlsx', sourceType: 'consumibles' }),
      });
      const directBatch = (await directResponse.json()) as { id: string };
      const contents = await makeConsumablesWorkbook([]);
      const sourceResponse = await fetch(`${baseUrl}/api/imports/${directBatch.id}/source`, {
        method: 'POST',
        headers: { 'content-type': 'application/json' },
        body: JSON.stringify({
          fileName: 'detalles-directos.xlsx',
          contentBase64: Buffer.from(contents).toString('base64'),
          contentType: 'application/vnd.openxmlformats-officedocument.spreadsheetml.sheet',
        }),
      });
      expect(sourceResponse.status).toBe(201);
      const sharedResponse = await fetch(`${baseUrl}/api/imports`, {
        method: 'POST',
        headers: { 'content-type': 'application/json' },
        body: JSON.stringify({ domain: 'services', sourceName: 'Servicios LAM.xlsx', sourceType: 'servicios' }),
      });
      const sharedBatch = (await sharedResponse.json()) as { id: string };

      const clearResponse = await fetch(`${baseUrl}/api/consumables/imports`, { method: 'DELETE' });
      expect(clearResponse.status).toBe(200);
      expect(await clearResponse.json()).toMatchObject({ ok: true, batches: 1, archivedFiles: 1 });
      expect((await fetch(`${baseUrl}/api/imports/${directBatch.id}`)).status).toBe(404);
      expect((await fetch(`${baseUrl}/api/imports/${sharedBatch.id}`)).status).toBe(200);
      expect(database.prepare('SELECT COUNT(*) AS count FROM import_batches WHERE domain = ?').get('consumibles')).toEqual({ count: 0 });
    } finally {
      await new Promise<void>((resolve) => server.close(() => resolve()));
      database.close();
    }
  });

  it('imports consumables XLSX rows through the shared installed base', async () => {
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
        body: JSON.stringify({ name: 'Cliente Consumo API' }),
      });
      const customer = (await customerResponse.json()) as { id: string };
      await fetch(`${baseUrl}/api/operations/contracts`, {
        method: 'POST',
        headers,
        body: JSON.stringify({
          customerId: customer.id,
          reference: 'OV-CONS-API',
          contractType: 'Mantenimiento',
          equipment: [{ modelLabel: 'iR ADV C3325i', serialNumber: 'SER-CONS-API' }],
        }),
      });

      const consumablesBytes = await makeConsumablesWorkbook([
        ['line-1', 'OV-CONS-API', new Date('2026-08-01T12:00:00Z'), 'iR ADV C3325i', 'SER-CONS-API', 'CRG-T03', 'Tóner compatible', 2, 120],
      ]);
      const firstImportResponse = await fetch(`${baseUrl}/api/consumables/import-xlsx`, {
        method: 'POST',
        headers,
        body: JSON.stringify({
          sourceName: 'Detalles de consumibles.xlsx',
          sourceType: 'consumibles',
          contentBase64: Buffer.from(consumablesBytes).toString('base64'),
        }),
      });
      expect(firstImportResponse.status).toBe(201);
      expect(await firstImportResponse.json()).toMatchObject({
        duplicate: false,
        accepted: 1,
        consumables: 1,
        parts: 0,
        skippedNoEquipment: 0,
      });

      const partsBytes = await makeConsumablesWorkbook([
        ['line-2', 'OV-CONS-API', new Date('2026-09-01T12:00:00Z'), 'iR ADV C3325i', 'SER-CONS-API', 'ROLLER-1', 'KIT DE RODILLO', 1, 40],
        ['line-3', 'OV-CONS-API', new Date('2026-09-02T12:00:00Z'), 'iR ADV C3325i', 'SER-CONS-API', 'MOTOR-1', 'MOTOR PRINCIPAL', 1, 80],
      ]);
      const secondImportResponse = await fetch(`${baseUrl}/api/consumables/import-xlsx`, {
        method: 'POST',
        headers,
        body: JSON.stringify({
          sourceName: 'Detalles de repuestos.xlsx',
          sourceType: 'repuestos',
          contentBase64: Buffer.from(partsBytes).toString('base64'),
        }),
      });
      expect(secondImportResponse.status).toBe(201);
      expect(await secondImportResponse.json()).toMatchObject({
        duplicate: false,
        accepted: 2,
        consumables: 1,
        parts: 1,
      });

      const useRepuestosRow = new Array(24).fill(undefined) as unknown[];
      useRepuestosRow[5] = 'Cliente Consumo API';
      useRepuestosRow[8] = 'OV-CONS-API';
      useRepuestosRow[9] = 'Mantenimiento';
      useRepuestosRow[13] = 'iR ADV C3325i';
      useRepuestosRow[14] = '2026-10';
      useRepuestosRow[15] = 'SER-CONS-API';
      useRepuestosRow[17] = '2725C002AA';
      useRepuestosRow[20] = 'TONER NEGRO';
      useRepuestosRow[21] = 2;
      useRepuestosRow[22] = 30000;
      useRepuestosRow[23] = 60000;
      const useRepuestosResponse = await fetch(`${baseUrl}/api/consumables/import-xlsx`, {
        method: 'POST',
        headers,
        body: JSON.stringify({
          sourceName: 'Detalles de uso de repuestos.xlsx',
          sourceType: 'uso-repuestos',
          contentBase64: Buffer.from(await makeUseRepuestosWorkbook([useRepuestosRow])).toString('base64'),
        }),
      });
      expect(useRepuestosResponse.status).toBe(201);
      expect(await useRepuestosResponse.json()).toMatchObject({
        duplicate: false,
        accepted: 1,
        consumables: 1,
        parts: 0,
      });

      const salidaConsumiblesRow = new Array(12).fill(undefined) as unknown[];
      salidaConsumiblesRow[0] = 7001;
      salidaConsumiblesRow[1] = new Date('2026-11-01T12:00:00Z');
      salidaConsumiblesRow[2] = 'CRG-T03';
      salidaConsumiblesRow[3] = 'TONER NEGRO T03';
      salidaConsumiblesRow[4] = 1;
      salidaConsumiblesRow[6] = 12000;
      salidaConsumiblesRow[7] = 'SER-CONS-API';
      salidaConsumiblesRow[8] = 'iR ADV C3325i';
      salidaConsumiblesRow[11] = 'Cliente Consumo API';
      const salidaConsumiblesResponse = await fetch(`${baseUrl}/api/consumables/import-xlsx`, {
        method: 'POST',
        headers,
        body: JSON.stringify({
          sourceName: 'Salida de Consumibles.xlsx',
          sourceType: 'salida-consumibles',
          contentBase64: Buffer.from(await makeOutputWorkbook(12, [salidaConsumiblesRow])).toString('base64'),
        }),
      });
      expect(salidaConsumiblesResponse.status).toBe(201);
      expect(await salidaConsumiblesResponse.json()).toMatchObject({
        duplicate: false,
        accepted: 1,
        consumables: 1,
        parts: 0,
      });

      const salidaRepuestosConsumible = new Array(13).fill(undefined) as unknown[];
      salidaRepuestosConsumible[0] = 7002;
      salidaRepuestosConsumible[1] = new Date('2026-11-02T12:00:00Z');
      salidaRepuestosConsumible[2] = 'RP-ROLLER';
      salidaRepuestosConsumible[3] = 'CILINDRO DE IMAGEN';
      salidaRepuestosConsumible[4] = 1;
      salidaRepuestosConsumible[7] = 'Cliente Consumo API';
      salidaRepuestosConsumible[8] = 'iR ADV C3325i';
      salidaRepuestosConsumible[9] = 'SER-CONS-API';
      salidaRepuestosConsumible[10] = 'Tec API';
      salidaRepuestosConsumible[12] = 8801;
      const salidaRepuestosPart = new Array(13).fill(undefined) as unknown[];
      salidaRepuestosPart[0] = 7003;
      salidaRepuestosPart[1] = new Date('2026-11-03T12:00:00Z');
      salidaRepuestosPart[2] = 'RP-FUSER';
      salidaRepuestosPart[3] = 'FUSOR COMPLETO';
      salidaRepuestosPart[4] = 1;
      salidaRepuestosPart[7] = 'Cliente Consumo API';
      salidaRepuestosPart[8] = 'iR ADV C3325i';
      salidaRepuestosPart[9] = 'SER-CONS-API';
      salidaRepuestosPart[10] = 'Tec API';
      salidaRepuestosPart[12] = 8802;
      const salidaRepuestosResponse = await fetch(`${baseUrl}/api/consumables/import-xlsx`, {
        method: 'POST',
        headers,
        body: JSON.stringify({
          sourceName: 'Salida de Repuestos.xlsx',
          sourceType: 'salida-repuestos',
          contentBase64: Buffer.from(await makeOutputWorkbook(13, [salidaRepuestosConsumible, salidaRepuestosPart])).toString('base64'),
        }),
      });
      expect(salidaRepuestosResponse.status).toBe(201);
      expect(await salidaRepuestosResponse.json()).toMatchObject({
        duplicate: false,
        accepted: 2,
        consumables: 1,
        parts: 1,
      });

      const outputsSummaryResponse = await fetch(`${baseUrl}/api/consumables/outputs/summary`);
      expect(await outputsSummaryResponse.json()).toMatchObject({
        sourceFiles: 2,
        records: 3,
        consumables: 2,
        parts: 1,
        equipment: 1,
        totalQuantity: 3,
        firstMonth: '2026-11',
        lastMonth: '2026-11',
      });
      const outputsResponse = await fetch(`${baseUrl}/api/consumables/outputs?query=SER-CONS-API&limit=10`);
      expect(await outputsResponse.json()).toEqual(expect.arrayContaining([
        expect.objectContaining({ documentNumber: 7001, recordKind: 'consumable', yieldPages: 12000 }),
        expect.objectContaining({ documentNumber: 7002, recordKind: 'consumable', serviceReportNumber: 8801 }),
        expect.objectContaining({ documentNumber: 7003, recordKind: 'part', serviceReportNumber: 8802 }),
      ]));

      const summaryResponse = await fetch(`${baseUrl}/api/consumables/summary`);
      expect(await summaryResponse.json()).toMatchObject({
        sourceFiles: 3,
        records: 4,
        consumables: 3,
        parts: 1,
        equipment: 1,
        totalCostUsd: 250.05,
      });

      const analyticsResponse = await fetch(`${baseUrl}/api/consumables/analytics`);
      expect(analyticsResponse.status).toBe(200);
      const analytics = await analyticsResponse.json() as {
        monthly: Array<Record<string, unknown>>;
        families: Array<Record<string, unknown>>;
        categories: Array<Record<string, unknown>>;
        topEquipment: Array<Record<string, unknown>>;
        contracts: Array<Record<string, unknown>>;
        dispatchEquipment: Array<Record<string, unknown>>;
      };
      expect(analytics.monthly).toEqual([
        expect.objectContaining({ key: '2026-08', records: 1, quantity: 2, costUsd: 120 }),
        expect.objectContaining({ key: '2026-09', records: 2, quantity: 2, costUsd: 120 }),
        expect.objectContaining({ key: '2026-10', records: 1, quantity: 2, costUsd: Math.round(60000 * PYG_TO_USD * 100) / 100 }),
      ]);
      expect(analytics.families).toEqual([
        expect.objectContaining({ key: 'GPR53', records: 3, quantity: 4, costUsd: 130.05, equipment: 1 }),
        expect.objectContaining({ key: 'T03', records: 1, quantity: 2, costUsd: 120, equipment: 1 }),
      ]);
      expect(analytics.categories).toEqual([
        expect.objectContaining({ key: 'toner', records: 3, quantity: 5, costUsd: 210.05 }),
        expect.objectContaining({ key: 'rodillo', records: 1, quantity: 1, costUsd: 40 }),
      ]);
      expect(analytics.topEquipment).toEqual([
        expect.objectContaining({
          customerName: 'Cliente Consumo API',
          modelLabel: 'iR ADV C3325i',
          serialNumber: 'SER-CONS-API',
          records: 4,
          costUsd: 250.05,
        }),
      ]);
      expect(analytics.contracts).toEqual([
        expect.objectContaining({
          reference: 'OV-CONS-API',
          customerName: 'Cliente Consumo API',
          records: 4,
          quantity: 6,
          costUsd: 250.05,
          consumableCostUsd: 170.05,
          partCostUsd: 80,
          consumableRecords: 3,
          partRecords: 1,
          originalRecords: 1,
          compatibleRecords: 3,
          equipment: 1,
        }),
      ]);
      expect(analytics.dispatchEquipment).toEqual([
        expect.objectContaining({
          customerName: 'Cliente Consumo API',
          modelLabel: 'iR ADV C3325i',
          serialNumber: 'SER-CONS-API',
          contractReference: 'OV-CONS-API',
          records: 3,
          consumableRecords: 2,
          partRecords: 1,
          consumableQuantity: 2,
          partQuantity: 1,
          compatibleRecords: 3,
          lastRecordedAt: '2026-11-03',
        }),
      ]);

      const recordsResponse = await fetch(`${baseUrl}/api/consumables/records?query=SER-CONS-API&limit=10`);
      const records = await recordsResponse.json();
      expect(records).toHaveLength(4);
      expect(records).toEqual(expect.arrayContaining([
        expect.objectContaining({ partCode: 'ROLLER-1', recordKind: 'consumable', family: 'GPR53' }),
        expect.objectContaining({ partCode: 'MOTOR-1', recordKind: 'part', family: 'GPR53' }),
      ]));

      const duplicateResponse = await fetch(`${baseUrl}/api/consumables/import-xlsx`, {
        method: 'POST',
        headers,
        body: JSON.stringify({
          sourceName: 'Detalles de consumibles.xlsx',
          sourceType: 'consumibles',
          contentBase64: Buffer.from(consumablesBytes).toString('base64'),
        }),
      });
      expect(duplicateResponse.status).toBe(200);
      expect(await duplicateResponse.json()).toMatchObject({ duplicate: true });
    } finally {
      await new Promise<void>((resolve) => server.close(() => resolve()));
      database.close();
    }
  });

  it('replaces all applied batches for one Consumibles source when requested', async () => {
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
        body: JSON.stringify({ name: 'Cliente Reemplazo API' }),
      });
      const customer = (await customerResponse.json()) as { id: string };
      await fetch(`${baseUrl}/api/operations/contracts`, {
        method: 'POST',
        headers,
        body: JSON.stringify({
          customerId: customer.id,
          reference: 'OV-REPLACE-API',
          contractType: 'Mantenimiento',
          equipment: [{ modelLabel: 'iR ADV C3325i', serialNumber: 'SER-REPLACE-API' }],
        }),
      });

      const importSource = async (sourceName: string, date: string, partCode: string, replaceCurrent = false) => {
        const bytes = await makeConsumablesWorkbook([
          ['line', 'OV-REPLACE-API', new Date(`${date}T12:00:00Z`), 'iR ADV C3325i', 'SER-REPLACE-API', partCode, 'Tóner compatible T03', 1, 50],
        ]);
        return fetch(`${baseUrl}/api/consumables/import-xlsx`, {
          method: 'POST',
          headers,
          body: JSON.stringify({
            sourceName,
            sourceType: 'consumibles',
            contentBase64: Buffer.from(bytes).toString('base64'),
            replaceCurrent,
          }),
        });
      };

      const firstResponse = await importSource('consumos-v1.xlsx', '2026-08-01', 'CRG-T03-V1');
      expect(firstResponse.status).toBe(201);
      await firstResponse.arrayBuffer();
      const secondResponse = await importSource('consumos-v2.xlsx', '2026-08-02', 'CRG-T03-V2');
      expect(secondResponse.status).toBe(201);
      await secondResponse.arrayBuffer();
      const replacementResponse = await importSource('consumos-nuevo.xlsx', '2026-09-01', 'CRG-T03-NUEVO', true);
      expect(replacementResponse.status).toBe(201);
      expect(await replacementResponse.json()).toMatchObject({ replaced: true, accepted: 1 });
      expect(database.prepare("SELECT COUNT(*) AS count FROM import_batches WHERE domain = 'consumibles' AND source_type = 'consumibles' AND status = 'applied'").get()).toEqual({ count: 1 });

      const recordsResponse = await fetch(`${baseUrl}/api/consumables/records?limit=10`);
      expect(await recordsResponse.json()).toEqual([
        expect.objectContaining({ partCode: 'CRG-T03-NUEVO', recordedAt: '2026-09-01' }),
      ]);
      const archivedDirectory = path.join(dataDirectory, 'imports', '.removed');
      expect(fs.readdirSync(archivedDirectory, { recursive: true }).filter((entry) => String(entry).endsWith('.xlsx'))).toHaveLength(2);
    } finally {
      await new Promise<void>((resolve) => server.close(() => resolve()));
      database.close();
    }
  });
});
