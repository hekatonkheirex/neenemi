import { describe, expect, it } from 'vitest';
import { findTravelSourceHeaderRow } from './TravelViews';

describe('Viáticos source viewer', () => {
  it('finds the real header after an introductory row', () => {
    expect(findTravelSourceHeaderRow([
      ['CONTROL DE VIÁTICOS'],
      ['Cant', 'Fecha', 'I.S.', 'CLIENTE', 'Destino'],
      [1, '2026-01-05', '123', 'Cliente', 'Asunción'],
    ])).toBe(1);
  });

  it('uses the first meaningful row for auxiliary sheets without a standard header', () => {
    expect(findTravelSourceHeaderRow([
      [undefined, undefined, undefined],
      ['Hotel', undefined, 200000],
      ['Viático', undefined, 130000],
    ])).toBe(1);
  });
});
