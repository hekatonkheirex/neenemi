import { describe, expect, it } from 'vitest';
import { buildMpsAnalysis } from './analysis';
import type { MpsModel } from './repository';

const model: MpsModel = {
  id: 'model-1',
  modelId: 'equipment-1',
  brand: 'Canon',
  modelLabel: 'imageRUNNER C5535i',
  speedPpm: 35,
  isColor: true,
  recVolumeMin: 2000,
  recVolumeMax: 30000,
  isCustom: false,
  isEditable: false,
  consumables: [
    { id: 'toner', name: 'Tóner negro', type: 'toner', yieldPages: 10000, color: 'black', sku: 'TONER-1' },
    { id: 'drum', name: 'Tambor', type: 'drum', yieldPages: 100000, color: 'monochrome', sku: 'DRUM-1' },
  ],
};

describe('buildMpsAnalysis', () => {
  it('reconstruye indicadores ejecutivos y ranking de cinco años', () => {
    const analysis = buildMpsAnalysis(model, 5000);

    expect(analysis).toMatchObject({
      monthlyVolume: 5000,
      annualPages: 60000,
      fiveYearPages: 300000,
      paperReams: 120,
      criticalConsumables: 1,
      preventiveKits: 1,
      totalUnitsFiveYears: 33,
      volumeStatus: 'optimal',
    });
    expect(analysis?.ranking).toEqual([
      expect.objectContaining({ id: 'toner', units: 30, share: expect.closeTo(30 / 33, 8) }),
      expect.objectContaining({ id: 'drum', units: 3, share: expect.closeTo(3 / 33, 8) }),
    ]);
  });

  it('marca volumen bajo, alto y entradas inválidas de forma determinista', () => {
    expect(buildMpsAnalysis(model, 1000)?.volumeStatus).toBe('low');
    expect(buildMpsAnalysis(model, 50000)?.volumeStatus).toBe('high');
    expect(buildMpsAnalysis(model, 0)).toBeNull();
  });
});
