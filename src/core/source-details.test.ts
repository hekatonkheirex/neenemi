import { describe, expect, it } from 'vitest';
import { buildCompleteSourceDetails, parseSourceDetails, sourceOperationalValues } from './source-details';

describe('source detail helpers', () => {
  it('adds populated original columns without duplicating projected fields', () => {
    const details = buildCompleteSourceDetails(
      ['Cliente', 'Estado', 'unused-2', 'Observaciones'],
      ['Cliente A', 'Activo', 'no mostrar', 'Entregar en recepción'],
      [['Estado', 'Activo']],
    );

    expect(details).toEqual([
      { label: 'Estado', value: 'Activo' },
      { label: 'Cliente', value: 'Cliente A' },
      { label: 'Observaciones', value: 'Entregar en recepción' },
    ]);
  });

  it('does not expose generated labels for columns without a source header', () => {
    const details = buildCompleteSourceDetails(
      [undefined, 'Columna 2', 'Cliente'],
      ['sin encabezado', 'otra columna', 'Cliente A'],
      [],
    );

    expect(details).toEqual([{ label: 'Cliente', value: 'Cliente A' }]);
  });

  it('filters generated placeholder labels from details already stored', () => {
    expect(parseSourceDetails(JSON.stringify([
      { label: 'Columna 1', value: 'dato legado' },
      { label: 'Estado', value: 'Activo' },
    ]))).toEqual([{ label: 'Estado', value: 'Activo' }]);
  });

  it('exposes populated values from structured operational source fields for searching', () => {
    expect(sourceOperationalValues({ division: 'Central', empty: '', count: 3 })).toEqual(['Central', '3']);
    expect(sourceOperationalValues(null)).toEqual([]);
  });
});
