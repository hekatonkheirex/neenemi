import { describe, expect, it } from 'vitest';
import { buildClientHistory } from './client-history';

describe('client history', () => {
  it('groups previous source customers and preserves their order references', () => {
    const history = buildClientHistory('Cliente actual', [
      { customerName: 'Cliente actual', sourceCustomerName: 'Cliente actual', date: '2026-04-01', orderReference: 'OV-NEW' },
      { customerName: 'Cliente actual', sourceCustomerName: 'Cliente anterior', date: '2025-11-01', orderReference: 'OV-OLD-1' },
      { customerName: 'Cliente actual', sourceCustomerName: 'Cliente anterior', date: '2025-12-01', orderReference: 'OV-OLD-2' },
    ]);

    expect(history).toEqual([{
      customerName: 'Cliente anterior',
      from: '2025-11-01',
      to: '2025-12-01',
      orderReferences: ['OV-OLD-1', 'OV-OLD-2'],
    }]);
  });

  it('ignores the current customer despite accents and spacing differences', () => {
    expect(buildClientHistory('Compañía Actual', [
      { customerName: 'Compañía Actual', sourceCustomerName: '  COMPANIA   ACTUAL ', date: '2026-01-01' },
      { customerName: 'Compañía Actual', sourceCustomerName: 'Cliente previo', date: '2025-01-01' },
    ])).toMatchObject([{ customerName: 'Cliente previo' }]);
  });

  it('uses the normalized customer when the source name is absent', () => {
    expect(buildClientHistory('Cliente actual', [
      { customerName: 'Cliente previo', date: '2025-06-01' },
      { customerName: 'Cliente actual', date: '2026-06-01' },
    ])).toEqual([{
      customerName: 'Cliente previo',
      from: '2025-06-01',
      to: '2025-06-01',
      orderReferences: [],
    }]);
  });

  it('keeps separate periods when a previous customer returns after the current one', () => {
    expect(buildClientHistory('Cliente actual', [
      { customerName: 'Cliente actual', date: '2024-01-01' },
      { customerName: 'Cliente anterior', date: '2025-01-01' },
      { customerName: 'Cliente actual', date: '2026-01-01' },
      { customerName: 'Cliente anterior', date: '2026-06-01' },
    ])).toEqual([
      { customerName: 'Cliente anterior', from: '2025-01-01', to: '2025-01-01', orderReferences: [] },
      { customerName: 'Cliente anterior', from: '2026-06-01', to: '2026-06-01', orderReferences: [] },
    ]);
  });
});
