import fs from 'node:fs';
import net from 'node:net';
import path from 'node:path';
import { describe, expect, it } from 'vitest';
import { isPortFree } from './port-free.mjs';

describe('isPortFree', () => {
  it('detecta un puerto ocupado y uno libre', async () => {
    const holder = net.createServer();
    await new Promise((resolve) => holder.listen(0, '127.0.0.1', resolve));
    const { port } = holder.address();
    expect(await isPortFree(port)).toBe(false);
    await new Promise((resolve) => holder.close(resolve));
    expect(await isPortFree(port)).toBe(true);
  });

  it('desktop-dev.mjs lo ejecuta antes de arrancar la API y el renderer', () => {
    const script = fs.readFileSync(path.join(import.meta.dirname, 'desktop-dev.mjs'), 'utf8');
    const check = script.indexOf('isPortFree(port)');
    expect(check).toBeGreaterThan(-1);
    expect(check).toBeLessThan(script.indexOf('apiProcess = start('));
  });
});
