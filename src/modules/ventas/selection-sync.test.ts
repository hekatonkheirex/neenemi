import { describe, expect, it } from 'vitest';
import { selectionNeedsSave } from './selection-sync';

describe('selectionNeedsSave', () => {
  it('no guarda antes de haber leído la selección del servidor', () => {
    expect(selectionNeedsSave(['A'], null)).toBe(false);
  });
  it('no guarda el mismo valor que se acaba de leer (abrir el módulo no es un cambio de datos)', () => {
    expect(selectionNeedsSave(['imageRUNNER 2425', 'iR-ADV C3926'], ['imageRUNNER 2425', 'iR-ADV C3926'])).toBe(false);
    expect(selectionNeedsSave([], [])).toBe(false);
  });
  it('guarda cuando se agrega, quita o reordena un modelo', () => {
    expect(selectionNeedsSave(['A', 'B'], ['A'])).toBe(true);
    expect(selectionNeedsSave(['A'], ['A', 'B'])).toBe(true);
    expect(selectionNeedsSave(['B', 'A'], ['A', 'B'])).toBe(true);
    expect(selectionNeedsSave(['A'], [])).toBe(true);
  });
});
