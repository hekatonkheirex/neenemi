import { describe, expect, it } from 'vitest';
import { compactSourceLabel } from './ViaticosModule';

describe('compactSourceLabel', () => {
  it('abrevia a "Planilla · fila N" y deja la ubicación completa para el tooltip', () => {
    expect(compactSourceLabel({ sourceFileName: 'CONTROL DE VIATICO 2026.xlsx', sourceSheetName: 'VIAJES2026', sourceRowNumber: 1108 })).toEqual({
      text: 'Planilla · fila 1108',
      title: 'CONTROL DE VIATICO 2026.xlsx · hoja VIAJES2026 · fila 1108',
    });
  });

  it('sin número de fila muestra la ubicación tal cual', () => {
    expect(compactSourceLabel({ sourceFileName: 'viajes.xlsx', sourceSheetName: '', sourceRowNumber: 0 })).toEqual({ text: 'viajes.xlsx', title: 'viajes.xlsx' });
  });

  it('un viaje cargado a mano (sin origen) no muestra nada', () => {
    expect(compactSourceLabel({ sourceFileName: '', sourceSheetName: '', sourceRowNumber: 0 })).toBeNull();
  });
});
