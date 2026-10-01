import { describe, expect, it } from 'vitest';
import { createServer } from '../../../server';
import { makeTemporaryDataDirectory, makeServicesWorkbook } from '../../test-support/api-helpers';

describe('services API', () => {
  it('imports and searches service interventions through the shared installed base', async () => {
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
        body: JSON.stringify({ name: 'Cliente Servicios API' }),
      });
      const customer = (await customerResponse.json()) as { id: string };
      const contractResponse = await fetch(`${baseUrl}/api/operations/contracts`, {
        method: 'POST',
        headers,
        body: JSON.stringify({
          customerId: customer.id,
          reference: 'OV-SERVICE-API',
          contractType: 'Mantenimiento',
          equipment: [{ modelLabel: 'iR ADV C3325i', serialNumber: 'SER-SERVICE-API' }],
        }),
      });
      expect(contractResponse.status).toBe(201);

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
      serviceRow[1] = 9003;
      serviceRow[4] = 'Cliente LAM';
      serviceRow[5] = new Date('2026-06-02T12:00:00Z');
      serviceRow[6] = 'OV-SERVICE-API';
      serviceRow[7] = 'SER-SERVICE-API';
      serviceRow[8] = 'iR ADV C3325i';
      serviceRow[16] = 'En Sitio';
      serviceRow[18] = new Date('2026-06-01T12:00:00Z');
      serviceRow[20] = 'Alquiler';
      serviceRow[21] = 'Reparación';
      serviceRow[25] = 'Tec API';
      serviceRow[29] = 'Se reemplazó el fusor';
      serviceRow[30] = 'Fusor';
      const serviceBytes = await makeServicesWorkbook(serviceHeaders, [serviceRow]);

      const importResponse = await fetch(`${baseUrl}/api/services/import-xlsx`, {
        method: 'POST',
        headers,
        body: JSON.stringify({
          sourceName: 'Servicios LAM.xlsx',
          sourceType: 'servicios',
          contentBase64: Buffer.from(serviceBytes).toString('base64'),
        }),
      });
      expect(importResponse.status).toBe(201);
      expect(await importResponse.json()).toMatchObject({
        duplicate: false,
        sourceType: 'servicios',
        accepted: 1,
        duplicates: 0,
        skippedNoEquipment: 0,
        skippedContract: 0,
      });

      const summaryResponse = await fetch(`${baseUrl}/api/services/summary`);
      expect(await summaryResponse.json()).toEqual({
        sourceFiles: 1,
        records: 1,
        equipment: 1,
        firstMonth: '2026-06',
        lastMonth: '2026-06',
        taskTypes: [{ key: 'Reparación', records: 1 }],
      });

      const recordsResponse = await fetch(`${baseUrl}/api/services/records?query=SER-SERVICE-API&limit=10`);
      expect(await recordsResponse.json()).toEqual([
        expect.objectContaining({
          serviceNumber: 9003,
          orderReference: 'OV-SERVICE-API',
          recordedAt: '2026-06-01',
          customerName: 'Cliente Servicios API',
          contractReference: 'OV-SERVICE-API',
          serialNumber: 'SER-SERVICE-API',
          taskType: 'Reparación',
          technician: 'Tec API',
        }),
      ]);

      const duplicateResponse = await fetch(`${baseUrl}/api/services/import-xlsx`, {
        method: 'POST',
        headers,
        body: JSON.stringify({
          sourceName: 'Servicios LAM.xlsx',
          sourceType: 'servicios',
          contentBase64: Buffer.from(serviceBytes).toString('base64'),
        }),
      });
      expect(duplicateResponse.status).toBe(200);
      expect(await duplicateResponse.json()).toMatchObject({ duplicate: true });
    } finally {
      await new Promise<void>((resolve) => server.close(() => resolve()));
      database.close();
    }
  });
});
