import { describe, expect, it, vi } from 'vitest';
import { memoizeString } from './memoize';

describe('memoizeString', () => {
  it('calcula una sola vez por clave y devuelve el mismo valor', () => {
    const compute = vi.fn((key: string) => key.toUpperCase());
    const memo = memoizeString(compute);
    expect([memo('a'), memo('a'), memo('b'), memo('a')]).toEqual(['A', 'A', 'B', 'A']);
    expect(compute).toHaveBeenCalledTimes(2);
  });

  it('guarda también resultados undefined y falsos sin recalcular', () => {
    const compute = vi.fn((key: string) => (key === 'x' ? undefined : ''));
    const memo = memoizeString(compute);
    memo('x'); memo('x'); memo('y'); memo('y');
    expect(compute).toHaveBeenCalledTimes(2);
  });

  it('al llegar al tope se vacía y sigue devolviendo valores correctos', () => {
    const compute = vi.fn((key: string) => key + '!');
    const memo = memoizeString(compute, 3);
    for (const key of ['a', 'b', 'c', 'd', 'a']) expect(memo(key)).toBe(key + '!');
    expect(compute.mock.calls.length).toBeLessThanOrEqual(5);
  });
});
