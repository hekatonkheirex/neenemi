import fs from 'node:fs';
import os from 'node:os';
import path from 'node:path';
import { afterEach, describe, expect, it } from 'vitest';
import { createServer } from '../../server';

const KEY = 'sk-or-v1-0123456789abcdef0123456789abcdef';
const saved = process.env.OPENROUTER_API_KEY;
const directories: string[] = [];
afterEach(() => {
  for (const directory of directories.splice(0)) fs.rmSync(directory, { recursive: true, force: true });
  if (saved === undefined) delete process.env.OPENROUTER_API_KEY; else process.env.OPENROUTER_API_KEY = saved;
});

describe('AI configuration API', () => {
  it('reports the source, validates and stores a key without ever returning it, and removes it', async () => {
    delete process.env.OPENROUTER_API_KEY;
    const directory = fs.mkdtempSync(path.join(os.tmpdir(), 'dcss-ai-config-'));
    directories.push(directory);
    const { app, database } = createServer({ dataDirectory: directory });
    const server = app.listen(0, '127.0.0.1');
    try {
      await new Promise<void>((resolve) => server.once('listening', () => resolve()));
      const address = server.address();
      const base = `http://127.0.0.1:${typeof address === 'object' && address ? address.port : 0}/api/ai/config`;
      const send = (method: string, body?: unknown) => fetch(base, { method, headers: { 'content-type': 'application/json' }, body: body === undefined ? undefined : JSON.stringify(body) });

      const initial = await (await send('GET')).json() as { configured: boolean; source: string; model: string };
      expect(initial.model).toContain(':free');
      expect(['none', 'installer']).toContain(initial.source);

      for (const bad of [undefined, '', 'abc', 'sk-or- with spaces 0123456789abcdef', 'sk-x-0123456789abcdef0123456789', 42]) {
        expect((await send('PUT', { apiKey: bad })).status).toBe(400);
      }
      expect((await send('PUT', 'no-es-objeto')).status).toBe(400);

      const saved = await send('PUT', { apiKey: `  ${KEY}  ` });
      expect(saved.status).toBe(200);
      const body = await saved.text();
      expect(JSON.parse(body)).toMatchObject({ configured: true, source: 'installation' });
      expect(body).not.toContain(KEY);
      expect(await (await send('GET')).text()).not.toContain(KEY);
      expect((await fetch(`http://127.0.0.1:${typeof address === 'object' && address ? address.port : 0}/api/settings/ai/openrouter_api_key`)).status).toBe(403);

      const removed = await (await send('DELETE')).json() as { source: string };
      expect(removed.source).not.toBe('installation');
    } finally {
      await new Promise<void>((resolve) => server.close(() => resolve()));
      database.close();
    }
  });
});
