import { describe, expect, it } from 'vitest';
import { buildClientRows, formatPygValue, rankClientRows } from './client-ranking';
import type { ConsumablesRecord } from './types';

const rec = (over: Partial<ConsumablesRecord>) => ({ customerName: 'A', customerType: '', commercialArea: '', equipmentId: 'E1', serialNumber: 'S1', quantity: 1, costUsd: 10, recordKind: 'consumable', classification: 'original', ...over }) as ConsumablesRecord;

describe('client-ranking', () => {
  it('separa originales, compatibles y repuestos y suma el total por cliente', () => {
    const [row] = buildClientRows([
      rec({ costUsd: 10, quantity: 2 }),
      rec({ classification: 'compatible', costUsd: 5 }),
      rec({ recordKind: 'part', costUsd: 7, quantity: 3 }),
    ]);
    expect(row).toMatchObject({ originalCostUsd: 10, originalQuantity: 2, compatibleCostUsd: 5, partCostUsd: 7, partQuantity: 3, totalCostUsd: 22, records: 3 });
  });

  it('cuenta equipos únicos y agrupa sin cliente', () => {
    const rows = buildClientRows([rec({ customerName: '', equipmentId: 'E1' }), rec({ customerName: '', equipmentId: 'E1' }), rec({ customerName: '', equipmentId: 'E2' })]);
    expect(rows).toHaveLength(1);
    expect(rows[0]).toMatchObject({ clientName: 'Sin cliente', equipment: 2 });
  });

  it('ordena por costo descendente y conserva el orden de aparición en empates', () => {
    const rows = rankClientRows(buildClientRows([rec({ customerName: 'B', costUsd: 5 }), rec({ customerName: 'C', costUsd: 9 }), rec({ customerName: 'D', costUsd: 5 })]));
    expect(rows.map((row) => row.clientName)).toEqual(['C', 'B', 'D']);
  });

  it('formatea guaraníes enteros', () => {
    expect(formatPygValue(1234567.6)).toBe('₲ 1.234.568');
  });
});
