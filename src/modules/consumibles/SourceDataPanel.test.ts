import { describe, expect, it } from 'vitest';
import { findSourceHeaderRow } from './SourceDataPanel';

describe('findSourceHeaderRow', () => {
  it('detects a fleet header after report metadata', () => {
    expect(findSourceHeaderRow([
      ['Reporte de contratos'],
      ['Generado', '2026-09-15'],
      ['Ref. DATA', 'Nº OV', 'Cliente', 'Vigente', 'División'],
    ], 'contracts', 'Contratos.xlsx')).toBe(2);
  });

  it('uses generic header signals for an unknown archived source', () => {
    expect(findSourceHeaderRow([
      ['Exportación histórica'],
      ['Cliente', 'Modelo', 'Nº Serie', 'Fecha', 'Cantidad'],
    ], null, 'archivo renombrado.xlsx')).toBe(1);
  });

  it('keeps the first row when no header signal exists', () => {
    expect(findSourceHeaderRow([['Modelo', 'Valor']], null, 'archivo.xlsx')).toBe(0);
  });
});
