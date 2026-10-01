import { describe, expect, it } from 'vitest';
import { createServer } from '../../../server';
import { makeTemporaryDataDirectory } from '../../test-support/api-helpers';

describe('coverage API', () => {
  it('saves PDF-derived coverage and rejects manual coverage input', async () => {
    const { app, database } = createServer({ dataDirectory: makeTemporaryDataDirectory() });
    const server = app.listen(0, '127.0.0.1');

    try {
      await new Promise<void>((resolve) => server.once('listening', () => resolve()));
      const address = server.address();
      const port = typeof address === 'object' && address ? address.port : 0;
      const baseUrl = `http://127.0.0.1:${port}`;
      const pages = [{ page: 1, black: 5, cyan: 0, magenta: 0, yellow: 0 }];

      const manualResponse = await fetch(`${baseUrl}/api/coverage/analyze`, {
        method: 'POST',
        headers: { 'content-type': 'application/json' },
        body: JSON.stringify({ sourceName: 'manual', pages, inputMode: 'manual' }),
      });
      expect(manualResponse.status).toBe(400);

      const pdfResponse = await fetch(`${baseUrl}/api/coverage/analyze`, {
        method: 'POST',
        headers: { 'content-type': 'application/json' },
        body: JSON.stringify({
          sourceName: 'informe-cobertura.pdf',
          pages,
          failedPages: [{ page: 2, message: 'Página dañada.' }],
          inputMode: 'pdf',
        }),
      });
      expect(pdfResponse.status).toBe(200);
      expect(await pdfResponse.json()).toMatchObject({
        analysis: {
          sourceName: 'informe-cobertura.pdf',
          inputMode: 'pdf',
          failedPages: [{ page: 2, message: 'Página dañada.' }],
          coverage: { pages: [{ page: 1, black: 5 }], average: { black: 5 } },
        },
      });

      const lastResponse = await fetch(`${baseUrl}/api/coverage/last`);
      expect(lastResponse.status).toBe(200);
      expect(await lastResponse.json()).toMatchObject({ inputMode: 'pdf', sourceName: 'informe-cobertura.pdf' });
    } finally {
      await new Promise<void>((resolve) => server.close(() => resolve()));
      database.close();
    }
  });
});
