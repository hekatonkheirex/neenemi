import { describe, expect, it } from 'vitest';
import { compactSourceLocation, formatSourceLocation } from './source-location';

describe('compactSourceLocation', () => {
  it('abrevia a "Planilla · fila N" y conserva la ubicación completa para el tooltip', () => {
    expect(compactSourceLocation('Detalles.xlsx', 'Hoja1', 7084)).toEqual({
      text: 'Planilla · fila 7084',
      title: formatSourceLocation('Detalles.xlsx', 'Hoja1', 7084),
    });
  });

  it('sin fila usa la ubicación tal cual; sin origen devuelve null', () => {
    expect(compactSourceLocation('a.xlsx', '', 0)).toEqual({ text: 'a.xlsx', title: 'a.xlsx' });
    expect(compactSourceLocation('', '', 0)).toBeNull();
  });
});
