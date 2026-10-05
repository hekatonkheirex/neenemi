import fs from 'node:fs';
import os from 'node:os';
import path from 'node:path';
import { afterEach, describe, expect, it, vi } from 'vitest';
import { createServer } from '../../../server';
import { parseOsrmRoute, parseRouteLegs } from './routing';

const osrm = { code: 'Ok', routes: [{ distance: 2345.6, geometry: { coordinates: [[-57.6, -25.3], [-57.61, -25.31], [-57.62, -25.32]] } }] };

describe('OSRM response parsing', () => {
  it('maps distance and GeoJSON [lon, lat] to coordinates', () => {
    expect(parseOsrmRoute(osrm)).toEqual({ distanceMeters: 2345.6, geometry: [{ latitude: -25.3, longitude: -57.6 }, { latitude: -25.31, longitude: -57.61 }, { latitude: -25.32, longitude: -57.62 }] });
  });
  it('returns null for no route or malformed bodies', () => {
    for (const body of [null, {}, { code: 'NoRoute', routes: [] }, { code: 'Ok', routes: [] }, { code: 'Ok', routes: [{ distance: 'x', geometry: { coordinates: [] } }] }, { code: 'Ok', routes: [{ distance: 10, geometry: { coordinates: [[1, 2]] } }] }]) {
      expect(parseOsrmRoute(body)).toBeNull();
    }
  });
  it('rejects invalid legs and more than 200', () => {
    const point = { latitude: -25, longitude: -57 };
    expect(parseRouteLegs([{ from: point, to: point }])).toHaveLength(1);
    expect(() => parseRouteLegs([{ from: point, to: { latitude: 999, longitude: 0 } }])).toThrow();
    expect(() => parseRouteLegs('x')).toThrow();
    expect(() => parseRouteLegs(Array.from({ length: 201 }, () => ({ from: point, to: point })))).toThrow();
  });
});

describe('POST /api/tracking/route', () => {
  const cleanup: (() => void)[] = [];
  afterEach(() => { vi.restoreAllMocks(); cleanup.splice(0).forEach(fn => fn()); });
  it('returns road routes, null on provider failure, and caches successes', async () => {
    const directory = fs.mkdtempSync(path.join(os.tmpdir(), 'dcss-tracking-route-'));
    const { app, database } = createServer({ dataDirectory: directory });
    const server = app.listen(0, '127.0.0.1');
    await new Promise<void>(resolve => server.once('listening', resolve));
    cleanup.push(() => { server.close(); database.close(); fs.rmSync(directory, { recursive: true, force: true }); });
    const { port } = server.address() as { port: number };
    const realFetch = globalThis.fetch;
    let osrmCalls = 0;
    vi.spyOn(globalThis, 'fetch').mockImplementation(async (input, init) => {
      const url = String(input);
      if (!url.startsWith('https://router.project-osrm.org/route/v1/driving/')) return realFetch(input, init);
      osrmCalls += 1;
      if (url.includes('-57.00000,-25.00000;-57.00000,-26.00000')) return new Response('down', { status: 503 });
      return new Response(JSON.stringify(osrm));
    });
    const post = (legs: unknown) => realFetch(`http://127.0.0.1:${port}/api/tracking/route`, { method: 'POST', headers: { 'content-type': 'application/json' }, body: JSON.stringify({ legs }) });
    const good = { from: { latitude: -25.3, longitude: -57.6 }, to: { latitude: -25.32, longitude: -57.62 } };
    const bad = { from: { latitude: -25, longitude: -57 }, to: { latitude: -26, longitude: -57 } };
    const first = await (await post([good, bad])).json() as { routes: unknown[] };
    expect(first.routes[0]).toMatchObject({ distanceMeters: 2345.6 });
    expect(first.routes[1]).toBeNull();
    await post([good]);
    expect(osrmCalls).toBe(2);
    expect((await post('nope')).status).toBe(400);
  });
});
