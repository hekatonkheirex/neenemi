import fs from 'node:fs';
import os from 'node:os';
import path from 'node:path';
import { describe, expect, it } from 'vitest';
import { createServer } from './server';

type Layer = { route?: { path: string; methods: Record<string, boolean> } };

// Red de seguridad para mover rutas entre archivos: cada GET sin parámetros debe responder sin error 5xx
// (un import o validador que falte aparece aquí como ReferenceError => 500).
describe('route smoke test', () => {
  it('serves every parameterless GET route without a server error', async () => {
    const directory = fs.mkdtempSync(path.join(os.tmpdir(), 'dcss-routes-smoke-'));
    const { app, database } = createServer({ dataDirectory: directory });
    const layers = (app as unknown as { _router: { stack: Layer[] } })._router.stack;
    const paths = layers
      .filter((layer) => layer.route?.methods.get && !layer.route.path.includes(':') && layer.route.path.startsWith('/api/'))
      .map((layer) => layer.route!.path);
    expect(paths.length).toBeGreaterThan(40);

    const server = app.listen(0, '127.0.0.1');
    try {
      await new Promise<void>((resolve) => server.once('listening', () => resolve()));
      const address = server.address();
      const port = typeof address === 'object' && address ? address.port : 0;
      const failures: string[] = [];
      for (const route of paths) {
        const response = await fetch(`http://127.0.0.1:${port}${route}`);
        if (response.status >= 500) failures.push(`${response.status} ${route}`);
      }
      expect(failures).toEqual([]);
    } finally {
      await new Promise<void>((resolve) => server.close(() => resolve()));
      database.close();
      fs.rmSync(directory, { recursive: true, force: true });
    }
  });
});
