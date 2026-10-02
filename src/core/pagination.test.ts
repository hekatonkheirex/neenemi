import { describe, expect, it } from 'vitest';
import { buildPaginatedUrl, paginateItems } from './pagination';

const items = Array.from({ length: 120 }, (_, index) => index + 1);

describe('paginateItems', () => {
  it('devuelve la primera página con el total y las páginas', () => {
    const result = paginateItems(items, 1, 50);
    expect(result.items).toHaveLength(50);
    expect(result.items[0]).toBe(1);
    expect(result).toMatchObject({ total: 120, page: 1, pageSize: 50, totalPages: 3 });
  });

  it('la última página trae solo el resto', () => {
    const result = paginateItems(items, 3, 50);
    expect(result.items).toEqual(items.slice(100));
    expect(result.page).toBe(3);
  });

  it('ajusta la página fuera de rango (tras filtrar o borrar)', () => {
    expect(paginateItems(items, 99, 50).page).toBe(3);
    expect(paginateItems(items, 0, 50).page).toBe(1);
    expect(paginateItems(items, -4, 50).page).toBe(1);
    expect(paginateItems(items, Number.NaN, 50).page).toBe(1);
  });

  it('una lista vacía da página 1 y cero páginas', () => {
    expect(paginateItems([], 3, 50)).toEqual({ items: [], total: 0, page: 1, pageSize: 50, totalPages: 0 });
  });

  it('un tamaño de página inválido no rompe ni devuelve todo', () => {
    expect(paginateItems(items, 1, 0).items).toHaveLength(1);
    expect(paginateItems(items, 1, 25.9).pageSize).toBe(25);
  });

  it('no modifica la lista original', () => {
    const copy = [...items];
    paginateItems(items, 2, 10);
    expect(items).toEqual(copy);
  });
});

describe('buildPaginatedUrl', () => {
  it('añade page y pageSize y descarta filtros vacíos', () => {
    expect(buildPaginatedUrl('/api/x', 'a=1', { page: 2, pageSize: 25 }, { q: 'tóner', vacio: '' })).toBe('/api/x?a=1&page=2&pageSize=25&q=t%C3%B3ner');
  });
});
