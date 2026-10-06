import { afterEach, describe, expect, it, vi } from 'vitest';
import { getSharedJson, readJson, toErrorMessage } from './http';

const json = (body: unknown, status = 200) => new Response(JSON.stringify(body), { status, headers: { 'content-type': 'application/json' } });

describe('readJson', () => {
  it('devuelve el cuerpo JSON de una respuesta correcta', async () => {
    await expect(readJson<{ a: number }>(json({ a: 1 }))).resolves.toEqual({ a: 1 });
  });

  it('acepta una promesa de Response', async () => {
    await expect(readJson<number[]>(Promise.resolve(json([1, 2])))).resolves.toEqual([1, 2]);
  });

  it('usa el campo error del servidor', async () => {
    await expect(readJson(json({ error: 'Falta el cliente.' }, 400))).rejects.toThrow('Falta el cliente.');
  });

  it('informa el código HTTP si el error no trae JSON (413, 502 con HTML)', async () => {
    await expect(readJson(new Response('<html>Payload Too Large</html>', { status: 413 }))).rejects.toThrow('(413)');
    await expect(readJson(new Response('', { status: 502 }))).rejects.toThrow('(502)');
  });

  it('informa el código HTTP si el JSON de error no tiene error de texto', async () => {
    await expect(readJson(json({ error: 5 }, 500))).rejects.toThrow('(500)');
    await expect(readJson(json({ error: '' }, 500))).rejects.toThrow('(500)');
    await expect(readJson(json(null, 500))).rejects.toThrow('(500)');
  });

  it('una respuesta correcta vacía devuelve undefined; una correcta no JSON falla con claridad', async () => {
    await expect(readJson(new Response(null, { status: 204 }))).resolves.toBeUndefined();
    await expect(readJson(new Response('<html></html>', { status: 200 }))).rejects.toThrow('no es JSON');
  });

  it('un JSON válido null o 0 no se confunde con cuerpo vacío', async () => {
    await expect(readJson(json(null))).resolves.toBeNull();
    await expect(readJson(json(0))).resolves.toBe(0);
  });
});

describe('toErrorMessage', () => {
  it('usa el mensaje del Error', () => {
    expect(toErrorMessage(new Error('Algo falló.'))).toBe('Algo falló.');
  });
  it('usa el texto de respaldo para valores que no son Error o sin mensaje', () => {
    expect(toErrorMessage('x')).toBe('No se pudo completar la operación.');
    expect(toErrorMessage(new Error(''), 'Respaldo.')).toBe('Respaldo.');
  });
  it('traduce el fallo de red de fetch', () => {
    expect(toErrorMessage(new TypeError('Failed to fetch'))).toMatch(/conectar con la API local/);
    expect(toErrorMessage(new TypeError('NetworkError when attempting to fetch resource.'))).toMatch(/conectar/);
  });
  it('no disfraza un TypeError de programación como fallo de red', () => {
    expect(toErrorMessage(new TypeError("Cannot read properties of undefined (reading 'x')"))).toMatch(/Cannot read/);
  });
});

describe('sin copias locales', () => {
  it('ningún archivo redefine readJson: se importa de core/http', async () => {
    const { execSync } = await import('node:child_process');
    const found = execSync("grep -rlE 'function readJson' src --include=*.ts --include=*.tsx || true").toString()
      .split('\n').filter((file) => file && file !== 'src/core/http.ts' && !file.endsWith('.test.ts'));
    expect(found).toEqual([]);
  });
});

describe('getSharedJson', () => {
  afterEach(() => vi.unstubAllGlobals());

  it('dos peticiones simultáneas a la misma URL descargan una sola vez y comparten el resultado', async () => {
    const fetchMock = vi.fn(async () => json([1, 2, 3]));
    vi.stubGlobal('fetch', fetchMock);
    const [first, second] = await Promise.all([getSharedJson<number[]>('/api/x'), getSharedJson<number[]>('/api/x')]);
    expect(fetchMock).toHaveBeenCalledTimes(1);
    expect(first).toBe(second);
  });

  it('URLs distintas no se comparten y, al terminar, una nueva petición vuelve a descargar', async () => {
    const fetchMock = vi.fn(async () => json({ ok: true }));
    vi.stubGlobal('fetch', fetchMock);
    await Promise.all([getSharedJson('/api/a'), getSharedJson('/api/b')]);
    expect(fetchMock).toHaveBeenCalledTimes(2);
    await getSharedJson('/api/a');
    expect(fetchMock).toHaveBeenCalledTimes(3);
  });

  it('un error se propaga a todos y no queda en memoria: el siguiente intento vuelve a pedir', async () => {
    const fetchMock = vi.fn()
      .mockResolvedValueOnce(json({ error: 'Falló.' }, 500))
      .mockResolvedValueOnce(json({ ok: 1 }));
    vi.stubGlobal('fetch', fetchMock);
    const results = await Promise.allSettled([getSharedJson('/api/e'), getSharedJson('/api/e')]);
    expect(results.map((result) => result.status)).toEqual(['rejected', 'rejected']);
    await expect(getSharedJson('/api/e')).resolves.toEqual({ ok: 1 });
    expect(fetchMock).toHaveBeenCalledTimes(2);
  });
});
