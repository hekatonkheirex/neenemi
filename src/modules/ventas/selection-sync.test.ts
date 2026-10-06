import { describe, expect, it } from 'vitest';
import fs from 'node:fs';
import { addToSelection, MAX_PRICE_LIST_SELECTION, selectionNeedsSave } from './selection-sync';

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

describe('addToSelection', () => {
  const key = (value: string) => value.toUpperCase();
  const many = (n: number) => Array.from({ length: n }, (_, i) => `M${String(i).padStart(5, '0')}`);

  it('suma sin duplicar (sin importar mayúsculas) y deja la lista ordenada', () => {
    expect(addToSelection(['b'], ['A', 'B'], key, 10)).toEqual({ selection: ['A', 'b'], skipped: 0 });
  });
  it('no pasa del tope y cuenta los modelos nuevos que quedaron fuera', () => {
    const result = addToSelection(['X'], ['A', 'B', 'C'], key, 3);
    expect(result.selection).toHaveLength(3);
    expect(result.skipped).toBe(1);
  });
  it('con la selección llena no agrega nada, pero tampoco rechaza los que ya estaban', () => {
    expect(addToSelection(['A', 'B'], ['A', 'C'], key, 2)).toEqual({ selection: ['A', 'B'], skipped: 1 });
  });
  it('9.911 modelos visibles producen una selección que el servidor acepta (<= tope)', () => {
    const result = addToSelection([], many(9911), key);
    expect(result.selection).toHaveLength(MAX_PRICE_LIST_SELECTION);
    expect(result.skipped).toBe(9911 - MAX_PRICE_LIST_SELECTION);
  });
  it('el servidor usa el mismo tope que el cliente', () => {
    const routes = fs.readFileSync('src/modules/ventas/routes.ts', 'utf8');
    expect(routes).toContain('value.length > MAX_PRICE_LIST_SELECTION');
    expect(routes).not.toMatch(/value\.length > 500/);
  });
});
