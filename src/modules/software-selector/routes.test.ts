import { describe, expect, it } from 'vitest';
import { createServer } from '../../../server';
import { makeTemporaryDataDirectory } from '../../test-support/api-helpers';

describe('software selector API', () => {
  it('analyzes software requirements locally and persists the last selection', async () => {
    const { app, database } = createServer({ dataDirectory: makeTemporaryDataDirectory() });
    const server = app.listen(0, '127.0.0.1');

    try {
      await new Promise<void>((resolve) => server.once('listening', () => resolve()));
      const address = server.address();
      const port = typeof address === 'object' && address ? address.port : 0;
      const baseUrl = `http://127.0.0.1:${port}`;
      const headers = { 'content-type': 'application/json' };

      const catalogResponse = await fetch(`${baseUrl}/api/software-selector/catalog`);
      expect(catalogResponse.status).toBe(200);
      const catalog = await catalogResponse.json() as { features: unknown[]; products: unknown[] };
      expect(catalog.features).toHaveLength(35);
      expect(catalog.products).toHaveLength(4);

      const analysisResponse = await fetch(`${baseUrl}/api/software-selector/analyze`, {
        method: 'POST',
        headers,
        body: JSON.stringify({
          fileName: 'pliego.txt',
          text: 'Se requiere impresión Follow-Me, soporte local con servidor de contingencia y Active Directory.',
        }),
      });
      expect(analysisResponse.status).toBe(200);
      const analyzed = await analysisResponse.json() as {
        analysis: { fileName: string; source: string; selectedFeatureIds: string[] };
        recommendations: Array<{ product: { id: string }; score: number }>;
      };
      expect(analyzed.analysis).toMatchObject({ fileName: 'pliego.txt', source: 'heurística local' });
      expect(analyzed.analysis.selectedFeatureIds).toEqual(expect.arrayContaining([
        'print_anywhere',
        'remote_resilience_rps',
        'ad_integration',
      ]));
      expect(analyzed.recommendations[0]).toMatchObject({ product: { id: 'uniflow_hybrid' }, score: 3 });

      const lastResponse = await fetch(`${baseUrl}/api/software-selector/last`);
      expect(await lastResponse.json()).toMatchObject({ analysis: { fileName: 'pliego.txt' } });

      const clearResponse = await fetch(`${baseUrl}/api/software-selector/last`, { method: 'DELETE' });
      expect(clearResponse.status).toBe(204);
      const clearedResponse = await fetch(`${baseUrl}/api/software-selector/last`);
      expect(await clearedResponse.json()).toBeNull();
    } finally {
      await new Promise<void>((resolve) => server.close(() => resolve()));
      database.close();
    }
  });
});
