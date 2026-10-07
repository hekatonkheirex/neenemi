import { describe, expect, it } from 'vitest';
import { findHeaderIndex, readHeaderValue } from './xlsx-helpers';

describe('findHeaderIndex', () => {
  const headers = ['N° I.S.', 'Cliente', 'Fch/Hora Inicio', 'cliente'];

  it('returns the first header that matches any alias, whatever the alias order', () => {
    expect(findHeaderIndex(headers, ['razon social', 'cliente'], -1)).toBe(1);
    expect(findHeaderIndex(headers, ['fecha hora inicio', 'n i s'], -1)).toBe(0);
  });

  it('falls back when nothing matches', () => {
    expect(findHeaderIndex(headers, ['inexistente'], 7)).toBe(7);
  });

  it('sees headers that change after the first lookup on the same array', () => {
    const mutable: unknown[] = ['A'];
    expect(findHeaderIndex(mutable, ['b'], -1)).toBe(-1);
    mutable.push('B');
    expect(findHeaderIndex(mutable, ['b'], -1)).toBe(1);
  });

  it('reads the value of the matched column', () => {
    expect(readHeaderValue(headers, ['x', 'Acme', 'ayer', 'z'], ['razon social', 'cliente'])).toBe('Acme');
    expect(readHeaderValue(headers, ['x'], ['nada'])).toBeUndefined();
  });
});
