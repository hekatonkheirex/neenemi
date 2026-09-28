import { describe, expect, it } from 'vitest';
import { findLegacySourceHeaderRow } from './LegacySourceDataPanel';

describe('findLegacySourceHeaderRow', () => {
  it('detects the Canon header after introductory rows', () => {
    expect(findLegacySourceHeaderRow([
      ['Canon support list'],
      ['Generated on', '2026-09-15'],
      ['Machine', 'Parts Item Code', 'Parts End Date'],
    ], 'operations-canon')).toBe(2);
  });

  it('detects the Waldbott header without requiring a quantity column', () => {
    expect(findLegacySourceHeaderRow([
      ['Stock Waldbott'],
      ['Artículo', 'Descripción', 'Depósito', 'Ubicación'],
    ], 'operations-waldbott')).toBe(1);
  });

  it('falls back to the first row for an unknown source', () => {
    expect(findLegacySourceHeaderRow([['Modelo', 'Valor']], 'operations-unknown')).toBe(0);
  });
});
