import { describe, expect, it } from 'vitest';
import { parseDescontinuadorUrl, serializeDescontinuadorUrl } from './descontinuador-url';

describe('Descontinuador URL state', () => {
  it('recovers the legacy view, filters, customer and pagination state', () => {
    expect(parseDescontinuadorUrl('/suite?vista=portfolio&buscar=ministerio&buscarTabla=ir-adv&cliente=customer-1&tipo=Mantenimiento&tipoCliente=Publico&areaComercial=Strategic&clientes=100')).toEqual({
      view: 'discontinued',
      query: 'ir-adv',
      customerQuery: 'ministerio',
      selectedCustomerId: 'customer-1',
      contractFilter: 'Mantenimiento',
      customerTypeFilter: 'Publico',
      commercialAreaFilter: 'Strategic',
      visibleCustomerCount: 100,
    });
  });

  it('ignores invalid values and keeps unrelated query parameters', () => {
    const parsed = parseDescontinuadorUrl('/suite?modulo=descontinuador&vista=nope&tipo=nope&clientes=-1');
    expect(parsed.view).toBe('discontinued');
    expect(parsed.contractFilter).toBe('Todos');
    expect(parsed.visibleCustomerCount).toBe(50);

    expect(serializeDescontinuadorUrl('/suite', '?modulo=descontinuador&otro=1', '#cartera', {
      ...parsed,
      view: 'uploads',
      customerQuery: 'ministerio',
      selectedCustomerId: 'customer-1',
      contractFilter: 'Mantenimiento',
      visibleCustomerCount: 100,
    })).toBe('/suite?modulo=descontinuador&otro=1&vista=uploads&buscar=ministerio&cliente=customer-1&tipo=Mantenimiento&clientes=100#cartera');
  });
});
