import { describe, expect, it, vi } from 'vitest';
import { askOpenRouter, extractJson, OpenRouterError, openRouterErrorMessage, openRouterErrorStatus } from './openrouter';

const ok = (content: string) => new Response(JSON.stringify({ choices: [{ message: { content } }] }), { status: 200 });
const fail = (status: number, body = 'error') => new Response(body, { status });
const options = (fetchImpl: typeof fetch) => ({ fetchImpl, retryDelayMs: 1 });

describe('extractJson', () => {
  it('reads plain JSON and fenced JSON with surrounding prose', () => {
    expect(extractJson('{"a":1,"b":[2]}')).toEqual({ a: 1, b: [2] });
    expect(extractJson('Claro:\n```json\n[{"section":"1"}]\n```\nListo.')).toEqual([{ section: '1' }]);
    expect(extractJson('Resultado: [1, 2, 3] fin')).toEqual([1, 2, 3]);
  });

  it('unwraps an object that only holds one array (a common model habit)', () => {
    expect(extractJson('{"requisitos":[{"excerpt":"x"}]}')).toEqual([{ excerpt: 'x' }]);
    expect(extractJson('{"features":["a"],"nota":"b"}')).toEqual({ features: ['a'], nota: 'b' });
  });

  it('fails with a typed error when there is no usable JSON', () => {
    expect(() => extractJson('sin datos')).toThrow('no contiene JSON');
    expect(() => extractJson('{"a":')).toThrow(OpenRouterError);
    expect(() => extractJson('{"a": nope}')).toThrow('no es un JSON válido');
  });
});

describe('askOpenRouter', () => {
  it('sends the key, model and a JSON-only instruction and returns the content', async () => {
    const fetchImpl = vi.fn(async () => ok('{"ok":true}'));
    expect(await askOpenRouter('k', 'm:free', 'hola', options(fetchImpl as unknown as typeof fetch))).toBe('{"ok":true}');
    const [url, init] = fetchImpl.mock.calls[0] as unknown as [string, RequestInit];
    expect(url).toBe('https://openrouter.ai/api/v1/chat/completions');
    expect((init.headers as Record<string, string>).Authorization).toBe('Bearer k');
    const body = JSON.parse(init.body as string);
    expect(body).toMatchObject({ model: 'm:free', temperature: 0 });
    expect(body.messages[0].content).toContain('únicamente con JSON');
  });

  it('retries 429 and 5xx and then succeeds', async () => {
    const fetchImpl = vi.fn().mockResolvedValueOnce(fail(429)).mockResolvedValueOnce(fail(503)).mockResolvedValueOnce(ok('[]'));
    expect(await askOpenRouter('k', 'm:free', 'p', options(fetchImpl as unknown as typeof fetch))).toBe('[]');
    expect(fetchImpl).toHaveBeenCalledTimes(3);
  });

  it('does not retry client errors such as an invalid key or missing credit', async () => {
    for (const status of [401, 402]) {
      const fetchImpl = vi.fn(async () => fail(status, 'nope'));
      const error = await askOpenRouter('k', 'm', 'p', options(fetchImpl as unknown as typeof fetch)).catch((e: unknown) => e);
      expect(openRouterErrorStatus(error)).toBe(status);
      expect(fetchImpl).toHaveBeenCalledTimes(1);
    }
  });

  it('keeps the last status when every attempt is rate limited, and treats empty content as a failure', async () => {
    const limited = vi.fn(async () => fail(429));
    const error = await askOpenRouter('k', 'm', 'p', { ...options(limited as unknown as typeof fetch), attempts: 2 }).catch((e: unknown) => e);
    expect(openRouterErrorStatus(error)).toBe(429);
    expect(limited).toHaveBeenCalledTimes(2);
    const empty = vi.fn(async () => ok('  '));
    await expect(askOpenRouter('k', 'm', 'p', { ...options(empty as unknown as typeof fetch), attempts: 1 })).rejects.toThrow('respuesta vacía');
  });
});

describe('openRouterErrorMessage', () => {
  it('explains the common statuses in Spanish', () => {
    expect(openRouterErrorMessage(new OpenRouterError(401, 'x'))).toContain('clave');
    expect(openRouterErrorMessage(new OpenRouterError(402, 'x'))).toContain(':free');
    expect(openRouterErrorMessage(new OpenRouterError(429, 'x'))).toContain('límite');
    expect(openRouterErrorMessage(new OpenRouterError(503, 'x'))).toContain('no disponible');
    expect(openRouterErrorMessage(new OpenRouterError(undefined, 'Mensaje propio'))).toBe('Mensaje propio');
    expect(openRouterErrorMessage(new Error('x'))).toContain('OpenRouter');
  });
});
