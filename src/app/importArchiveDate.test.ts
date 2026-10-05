import { describe, expect, it } from 'vitest';
import { formatBatchDate } from './ImportArchivePanel';

describe('formatBatchDate', () => {
  it('usa la fecha de aplicación en cargas aplicadas', () => {
    expect(formatBatchDate({ status: 'applied', createdAt: '2026-10-01T10:00:00', appliedAt: '2026-10-02T14:05:00' })).toBe('Aplicada 02/10/2026, 14:05');
  });
  it('usa la fecha de creación si no se aplicó', () => {
    expect(formatBatchDate({ status: 'staged', createdAt: '2026-10-01T10:00:00', appliedAt: null })).toBe('Cargada 01/10/2026, 10:00');
  });
  it('no falla con una fecha inválida', () => {
    expect(formatBatchDate({ status: 'failed', createdAt: 'x', appliedAt: null })).toBe('Sin fecha');
  });
});
