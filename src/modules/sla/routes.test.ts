import { describe, expect, it } from 'vitest';
import { createServer } from '../../../server';
import { makeTemporaryDataDirectory } from '../../test-support/api-helpers';

describe('SLA API', () => {
  it('analyzes SLA clauses locally and persists the compliance report', async () => {
    const { app, database } = createServer({ dataDirectory: makeTemporaryDataDirectory() });
    const server = app.listen(0, '127.0.0.1');

    try {
      await new Promise<void>((resolve) => server.once('listening', () => resolve()));
      const address = server.address();
      const port = typeof address === 'object' && address ? address.port : 0;
      const baseUrl = `http://127.0.0.1:${port}`;
      const headers = { 'content-type': 'application/json' };

      const referenceResponse = await fetch(`${baseUrl}/api/sla/reference`);
      expect(referenceResponse.status).toBe(200);
      expect(await referenceResponse.json()).toHaveLength(6);

      const analysisResponse = await fetch(`${baseUrl}/api/sla/analyze`, {
        method: 'POST',
        headers,
        body: JSON.stringify({
          fileName: 'pliego-sla.txt',
          text: 'Se requiere atención 24x7, suministro de papel, solución en 4 horas en Asunción, equipo de backup y confidencialidad.',
        }),
      });
      expect(analysisResponse.status).toBe(200);
      const analysis = await analysisResponse.json() as {
        fileName: string;
        overallRisk: string;
        complianceScore: number;
        items: Array<{ id: string; status: string }>;
      };
      expect(analysis).toMatchObject({ fileName: 'pliego-sla.txt', overallRisk: 'high', complianceScore: 50 });
      expect(analysis.items).toEqual(expect.arrayContaining([
        expect.objectContaining({ id: 'paper-supply', status: 'gap' }),
        expect.objectContaining({ id: 'backup-equipment', status: 'complies' }),
      ]));

      const lastResponse = await fetch(`${baseUrl}/api/sla/last`);
      expect(await lastResponse.json()).toMatchObject({ fileName: 'pliego-sla.txt', complianceScore: 50 });
      const clearResponse = await fetch(`${baseUrl}/api/sla/last`, { method: 'DELETE' });
      expect(clearResponse.status).toBe(204);
      const clearedResponse = await fetch(`${baseUrl}/api/sla/last`);
      expect(await clearedResponse.json()).toBeNull();
    } finally {
      await new Promise<void>((resolve) => server.close(() => resolve()));
      database.close();
    }
  });
});
