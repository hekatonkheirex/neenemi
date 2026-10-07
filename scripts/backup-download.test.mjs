import { createRequire } from 'node:module';
import http from 'node:http';
import fs from 'node:fs/promises';
import os from 'node:os';
import path from 'node:path';
import { describe, expect, it } from 'vitest';

const { saveBackupFile } = createRequire(import.meta.url)('../electron/backup-download.cjs');

describe('backup file safety', () => {
  it.each(['interrupted', 'server-error'])('preserves the previous backup when transfer is %s', async (failure) => {
    const directory = await fs.mkdtemp(path.join(os.tmpdir(), 'dcss-download-test-'));
    const destination = path.join(directory, 'backup.sqlite');
    await fs.writeFile(destination, 'previous complete backup');
    const server = http.createServer((_request, response) => {
      if (failure === 'server-error') {
        response.writeHead(409, { 'content-type': 'application/json' });
        response.end(JSON.stringify({ error: 'Falta un archivo original.' }));
      } else {
        response.writeHead(200, { 'content-type': 'application/vnd.sqlite3', 'content-length': '100000' });
        response.write('SQLite format 3\0');
        setImmediate(() => response.destroy());
      }
    });
    server.listen(0, '127.0.0.1');
    await new Promise(resolve => server.once('listening', resolve));
    try {
      const url = `http://127.0.0.1:${server.address().port}/api/system/backup`;
      await expect(saveBackupFile(url, destination)).rejects.toThrow();
      expect(await fs.readFile(destination, 'utf8')).toBe('previous complete backup');
      expect(await fs.readdir(directory)).toEqual(['backup.sqlite']);
    } finally {
      await new Promise(resolve => server.close(resolve));
      await fs.rm(directory, { recursive: true, force: true });
    }
  });
});
