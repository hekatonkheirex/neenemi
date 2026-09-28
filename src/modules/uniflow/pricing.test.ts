import { describe, expect, it } from 'vitest';
import { cloneUniflowPriceCatalog, DEFAULT_UNIFLOW_PRICE_CATALOG } from './catalog';
import { calculateUniflowConfiguration, getUniflowNextTierUpgrade } from './pricing';

describe('uniFLOW pricing', () => {
  it('matches the volume tiers and open-ended top tier', () => {
    const catalog = DEFAULT_UNIFLOW_PRICE_CATALOG;
    expect(calculateUniflowConfiguration([{ id: '1', modelName: 'iRADV DX 8905', quantity: 9 }], 36, catalog).t1SKU?.label).toBe('1-9');
    expect(calculateUniflowConfiguration([{ id: '1', modelName: 'iRADV DX 8905', quantity: 10 }], 36, catalog).t1SKU?.label).toBe('10-24');
    expect(calculateUniflowConfiguration([{ id: '1', modelName: 'iRADV DX 8905', quantity: 5000 }], 36, catalog).t1SKU?.label).toBe('3000+');
  });

  it('aggregates T1, T2 and CIP quantities independently', () => {
    const result = calculateUniflowConfiguration([
      { id: '1', modelName: 'iRADV DX 8905', quantity: 5, withCIP: true },
      { id: '2', modelName: 'iR 1643iF', quantity: 3 },
    ], 24, DEFAULT_UNIFLOW_PRICE_CATALOG);

    expect(result.t1TotalQty).toBe(5);
    expect(result.t2TotalQty).toBe(3);
    expect(result.t1CIPQty).toBe(5);
    expect(result.t2CIPQty).toBe(0);
    expect(result.monthlyTotal).toBeCloseTo(5 * 44.37 + 3 * 22.59 + 5 * 48.81, 5);
    expect(result.contractTotal).toBeCloseTo(result.monthlyTotal * 24, 5);
  });

  it('ignores unknown models instead of guessing a license type', () => {
    const result = calculateUniflowConfiguration([
      { id: '1', modelName: 'Modelo no catalogado', quantity: 4 },
      { id: '2', modelName: 'iR C3326', quantity: 2 },
    ], 12, DEFAULT_UNIFLOW_PRICE_CATALOG);

    expect(result.addedDevices).toEqual([expect.objectContaining({ modelName: 'iR C3326', type: 'T2' })]);
    expect(result.t1TotalQty).toBe(0);
    expect(result.t2TotalQty).toBe(2);
  });

  it('uses the persisted catalog values when calculating the next tier', () => {
    const catalog = cloneUniflowPriceCatalog(DEFAULT_UNIFLOW_PRICE_CATALOG);
    catalog.lists.t1[2] = { ...catalog.lists.t1[2], price: 99.99 };
    expect(getUniflowNextTierUpgrade('T1', 20, catalog)).toEqual({ unitsNeeded: 5, newPrice: 99.99 });
  });

  it('keeps valid contract terms beyond the usual quick presets', () => {
    const result = calculateUniflowConfiguration([
      { id: '1', modelName: 'iR C3326', quantity: 1 },
    ], 240, DEFAULT_UNIFLOW_PRICE_CATALOG);

    expect(result.months).toBe(240);
    expect(result.contractTotal).toBeCloseTo(result.monthlyTotal * 240, 5);
  });
});
