import { describe, expect, it } from 'vitest';
import { createServer } from '../../../server';
import { makeTemporaryDataDirectory, makeTravelWorkbook } from '../../test-support/api-helpers';

describe('travel API', () => {
  it('imports and manages travel records through the shared local database', async () => {
    const dataDirectory = makeTemporaryDataDirectory();
    const { app, database } = createServer({ dataDirectory });
    const server = app.listen(0, '127.0.0.1');

    try {
      await new Promise<void>((resolve) => server.once('listening', () => resolve()));
      const address = server.address();
      const port = typeof address === 'object' && address ? address.port : 0;
      const baseUrl = `http://127.0.0.1:${port}`;
      const headers = { 'content-type': 'application/json' };
      const travelBytes = await makeTravelWorkbook();
      const encodedTravel = Buffer.from(travelBytes).toString('base64');

      const previewResponse = await fetch(`${baseUrl}/api/travel/import-preview`, {
        method: 'POST',
        headers,
        body: JSON.stringify({
          sourceName: 'CONTROL DE VIATICO 2026.xlsx',
          sourceType: 'viaticos',
          contentBase64: encodedTravel,
        }),
      });
      expect(previewResponse.status).toBe(200);
      expect(await previewResponse.json()).toMatchObject({
        duplicate: false,
        sourceType: 'viaticos',
        primarySheetName: 'VIAJES2026',
        sourceSheetNames: ['VIAJES2026', 'CALCULO AUX', 'PASAJES EN BUS'],
        sourceYear: 2026,
        incomingYears: [2026],
        trips: 1,
        historicalSnapshots: 4,
        busFares: 1,
        tollRoutes: 1,
      });

      const importResponse = await fetch(`${baseUrl}/api/travel/import-xlsx`, {
        method: 'POST',
        headers,
        body: JSON.stringify({
          sourceName: 'CONTROL DE VIATICO 2026.xlsx',
          sourceType: 'viaticos',
          contentBase64: encodedTravel,
        }),
      });
      expect(importResponse.status).toBe(201);
      const imported = await importResponse.json() as { batchId: string } & Record<string, unknown>;
      expect(imported).toMatchObject({
        duplicate: false,
        sourceType: 'viaticos',
        accepted: 1,
        duplicates: 0,
        historicalSnapshots: 4,
        sourceSheets: 3,
      });

      const summaryResponse = await fetch(`${baseUrl}/api/travel/summary`);
      expect(await summaryResponse.json()).toMatchObject({
        operationalYear: 2026,
        sourceName: 'CONTROL DE VIATICO 2026.xlsx',
        records: 1,
        totalCost: 506000,
        pending: 0,
        review: 0,
        approved: 1,
        monthlyTotals: [0, 0, 0, 0, 0, 0, 0, 506000, 0, 0, 0, 0],
        transportTotals: [{ key: 'MOVIL PROPIO', records: 1, totalCost: 506000 }],
        topDestinations: [{ destination: 'CDE', records: 1, totalCost: 506000 }],
      });

      const tripsResponse = await fetch(`${baseUrl}/api/travel/trips?query=cliente%20viajes%20api&limit=10`);
      expect(await tripsResponse.json()).toEqual([
        expect.objectContaining({
          customerName: 'Cliente Viajes API',
          destination: 'CDE',
          totalCost: 506000,
          status: 'approved',
          source: 'xlsx',
        }),
      ]);

      const catalogResponse = await fetch(`${baseUrl}/api/travel/cost-catalog`);
      expect(await catalogResponse.json()).toMatchObject({ dailyAllowance: 150000, hotelPerNight: 210000 });

      const estimateResponse = await fetch(`${baseUrl}/api/travel/cost-estimate?destination=CDE&transport=MOVIL%20PROPIO&days=2&nights=1`);
      expect(await estimateResponse.json()).toMatchObject({ dailyAllowance: 300000, lodging: 210000, tolls: 30000 });

      const importedTripsResponse = await fetch(`${baseUrl}/api/travel/trips?limit=10`);
      const importedTrips = await importedTripsResponse.json() as Array<{ id: string }>;
      const importedTripId = importedTrips[0]?.id;
      expect(importedTripId).toBeTruthy();
      const reviewResponse = await fetch(`${baseUrl}/api/travel/trips/${importedTripId}/status`, {
        method: 'PATCH',
        headers,
        body: JSON.stringify({ status: 'review' }),
      });
      expect(reviewResponse.status).toBe(200);

      const replacementBytes = await makeTravelWorkbook('Luque');
      const replacementEncoded = Buffer.from(replacementBytes).toString('base64');
      const replacementPreviewResponse = await fetch(`${baseUrl}/api/travel/import-preview`, {
        method: 'POST',
        headers,
        body: JSON.stringify({
          sourceName: 'CONTROL DE VIATICO 2026 corregido.xlsx',
          sourceType: 'viaticos',
          contentBase64: replacementEncoded,
        }),
      });
      expect(await replacementPreviewResponse.json()).toMatchObject({
        duplicate: false,
        currentSourceBatchId: imported.batchId,
        currentSourceName: 'CONTROL DE VIATICO 2026.xlsx',
      });

      const replacementResponse = await fetch(`${baseUrl}/api/travel/import-xlsx`, {
        method: 'POST',
        headers,
        body: JSON.stringify({
          sourceName: 'CONTROL DE VIATICO 2026 corregido.xlsx',
          sourceType: 'viaticos',
          contentBase64: replacementEncoded,
          replaceBatchId: imported.batchId,
        }),
      });
      expect(replacementResponse.status).toBe(201);
      expect(await replacementResponse.json()).toMatchObject({ duplicate: false, replaced: true, accepted: 1 });
      const replacedTripsResponse = await fetch(`${baseUrl}/api/travel/trips?query=cliente%20viajes%20api&limit=10`);
      expect(await replacedTripsResponse.json()).toEqual([
        expect.objectContaining({ destination: 'Luque', status: 'review', source: 'xlsx' }),
      ]);

      const manualInput = {
        recordedAt: '2026-09-10',
        serviceNumber: 'IS-MANUAL',
        customerName: 'Cliente Manual API',
        destination: 'Encarnación',
        transport: 'BUS',
        technician: 'Tec Dos',
        driver: 'C/CHOFER',
        advance: 0,
        allowance: 100000,
        lodging: 0,
        tolls: 0,
        otherCost: 120000,
        vehiclePayment: 0,
        technicianPayment: 0,
        distanceKm: 0,
        fuelCost: 0,
        notes: 'Comprobante pendiente',
      };
      const manualResponse = await fetch(`${baseUrl}/api/travel/trips`, {
        method: 'POST',
        headers,
        body: JSON.stringify(manualInput),
      });
      expect(manualResponse.status).toBe(201);
      const manual = (await manualResponse.json()) as { id: string; status: string; totalCost: number };
      expect(manual).toMatchObject({ status: 'pending', totalCost: 220000 });

      const updateResponse = await fetch(`${baseUrl}/api/travel/trips/${manual.id}`, {
        method: 'PUT',
        headers,
        body: JSON.stringify({ ...manualInput, destination: 'Luque', allowance: 110000 }),
      });
      expect(updateResponse.status).toBe(200);
      expect(await updateResponse.json()).toMatchObject({ id: manual.id, destination: 'Luque', totalCost: 230000, status: 'pending' });

      const statusResponse = await fetch(`${baseUrl}/api/travel/trips/${manual.id}/status`, {
        method: 'PATCH',
        headers,
        body: JSON.stringify({ status: 'review' }),
      });
      expect(statusResponse.status).toBe(200);
      expect(await statusResponse.json()).toMatchObject({ id: manual.id, status: 'review' });

      const deleteResponse = await fetch(`${baseUrl}/api/travel/trips/${manual.id}`, { method: 'DELETE' });
      expect(deleteResponse.status).toBe(200);
      expect(await deleteResponse.json()).toEqual({ deleted: true });
      const deletedTripsResponse = await fetch(`${baseUrl}/api/travel/trips?query=cliente%20manual%20api&limit=10`);
      expect(await deletedTripsResponse.json()).toEqual([]);

      const historicalResponse = await fetch(`${baseUrl}/api/travel/historical`);
      expect(await historicalResponse.json()).toEqual(expect.arrayContaining([
        expect.objectContaining({ year: 2026, partial: true, services: 3, trips: 1 }),
      ]));

      const duplicateResponse = await fetch(`${baseUrl}/api/travel/import-xlsx`, {
        method: 'POST',
        headers,
        body: JSON.stringify({
          sourceName: 'CONTROL DE VIATICO 2026 corregido.xlsx',
          sourceType: 'viaticos',
          contentBase64: replacementEncoded,
        }),
      });
      expect(duplicateResponse.status).toBe(200);
      expect(await duplicateResponse.json()).toMatchObject({ duplicate: true, sourceType: 'viaticos' });
    } finally {
      await new Promise<void>((resolve) => server.close(() => resolve()));
      database.close();
    }
  });
});
