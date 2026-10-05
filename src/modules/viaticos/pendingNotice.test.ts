import { describe, expect, it } from 'vitest';
import { pendingNotice } from './pendingNotice';

const trip = (status: 'pending' | 'review' | 'approved', recordedAt: string, totalCost: number) => ({ status, recordedAt, totalCost });
const today = new Date(2026, 9, 5);

describe('pendingNotice', () => {
  it('is null when every settlement is approved or there are no trips', () => {
    expect(pendingNotice([], today)).toBeNull();
    expect(pendingNotice([trip('approved', '2026-09-01', 100)], today)).toBeNull();
  });
  it('totals pending cost, counts review and reports the oldest pending age in days', () => {
    expect(pendingNotice([trip('pending', '2026-09-25', 300), trip('pending', '2026-10-01', 200), trip('review', '2026-08-01', 999), trip('approved', '2026-07-01', 1)], today))
      .toEqual({ pending: 2, review: 1, pendingCost: 500, oldestPendingDays: 10 });
  });
  it('reports only review items without an age, and never a negative age', () => {
    expect(pendingNotice([trip('review', '2026-10-01', 5)], today)).toEqual({ pending: 0, review: 1, pendingCost: 0, oldestPendingDays: null });
    expect(pendingNotice([trip('pending', '2026-10-09', 5)], today)?.oldestPendingDays).toBe(0);
  });
});
