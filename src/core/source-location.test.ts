import { describe, expect, it } from 'vitest';
import { formatSourceLocation } from './source-location';

describe('formatSourceLocation', () => {
  it('formats the file, sheet and row for normalized records', () => {
    expect(formatSourceLocation('uso.xlsx', 'Uso de repuestos', 7))
      .toBe('uso.xlsx · hoja Uso de repuestos · fila 7');
  });

  it('keeps legacy records readable when lineage is not available yet', () => {
    expect(formatSourceLocation('detalles.xlsx', '', 0)).toBe('detalles.xlsx');
  });
});
