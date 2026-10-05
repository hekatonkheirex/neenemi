import { describe, expect, it } from 'vitest';
import { titleForTruncated } from './ellipsisTitles';

const el = (over: Partial<Parameters<typeof titleForTruncated>[0]>) => ({ scrollWidth: 300, clientWidth: 100, title: '', textContent: '  MINISTERIO DE HACIENDA \n - DNIT ', ...over });

describe('titleForTruncated', () => {
  it('devuelve el texto completo, con espacios normalizados, cuando está recortado', () => {
    expect(titleForTruncated(el({}))).toBe('MINISTERIO DE HACIENDA - DNIT');
  });
  it('no hace nada si cabe, si ya tiene título o si no hay texto', () => {
    expect(titleForTruncated(el({ scrollWidth: 100 }))).toBeNull();
    expect(titleForTruncated(el({ scrollWidth: 101 }))).toBeNull(); // tolerancia de 1 px
    expect(titleForTruncated(el({ title: 'ya está' }))).toBeNull();
    expect(titleForTruncated(el({ textContent: '   ' }))).toBeNull();
    expect(titleForTruncated(el({ textContent: null }))).toBeNull();
  });
});
