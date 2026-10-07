import { describe, expect, it } from 'vitest';
import { latestLoadedBySource } from './bundle';


describe('latestLoadedBySource', () => {
  const base = { sourceType: null, domain: 'consumibles', status: 'applied' };
  it('keeps the newest applied batch per source and ignores staged ones', () => {
    const loaded = latestLoadedBySource([
      { ...base, sourceName: 'Detalles de consumibles.xlsx', createdAt: '2026-10-01T10:00:00.000Z' },
      { ...base, sourceName: 'Detalles de consumibles.xlsx', createdAt: '2026-10-05T10:00:00.000Z' },
      { ...base, sourceName: 'Detalles de consumibles.xlsx', createdAt: '2026-10-06T10:00:00.000Z', status: 'staged' },
    ]);
    expect(loaded['consumibles.detail']?.createdAt).toBe('2026-10-05T10:00:00.000Z');
    expect(loaded['fleet.equipment']).toBeUndefined();
  });
});
