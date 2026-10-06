import { describe, expect, it } from 'vitest';
import { countItemsByModel } from './model-counts';

const normalize = (value: string) => value.normalize('NFKD').replace(/[̀-ͯ]/g, '').trim().replace(/\s+/g, ' ').toUpperCase();

describe('countItemsByModel', () => {
  it('cuenta ítems por modelo normalizado y un ítem una sola vez por modelo', () => {
    const items = [
      { models: ['iR C3525', 'ir  c3525', 'iR C3530'] },
      { models: ['IR C3525'] },
      { models: [] },
    ];
    const counts = countItemsByModel(items, (item) => item.models, normalize);
    expect(counts.get('IR C3525')).toBe(2);
    expect(counts.get('IR C3530')).toBe(1);
    expect(counts.get('OTRO')).toBeUndefined();
  });

  it('da lo mismo que contar con el filtro ingenuo por cada modelo (la versión lenta de la pantalla)', () => {
    const labels = Array.from({ length: 40 }, (_, index) => `Modelo ${index % 25}`);
    const items = Array.from({ length: 500 }, (_, index) => ({ models: [labels[index % 40], labels[(index * 7) % 40], ` modelo ${index % 25} `] }));
    const counts = countItemsByModel(items, (item) => item.models, normalize);
    for (const model of new Set(labels)) {
      const naive = items.filter((item) => item.models.some((itemModel) => normalize(itemModel) === normalize(model))).length;
      expect(counts.get(normalize(model)) ?? 0, model).toBe(naive);
    }
  });
});
