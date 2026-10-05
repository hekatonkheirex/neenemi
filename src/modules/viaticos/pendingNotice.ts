import type { TravelTrip } from './types';

export type PendingNotice = { pending: number; review: number; pendingCost: number; oldestPendingDays: number | null };

/** Open settlements the team still has to act on. Null when nothing is waiting, so the module shows no banner. */
export function pendingNotice(trips: Pick<TravelTrip, 'status' | 'totalCost' | 'recordedAt'>[], today: Date): PendingNotice | null {
  const pending = trips.filter(trip => trip.status === 'pending');
  const review = trips.filter(trip => trip.status === 'review').length;
  if (!pending.length && !review) return null;
  const midnight = Date.UTC(today.getFullYear(), today.getMonth(), today.getDate());
  const ages = pending.map(trip => Date.parse(`${trip.recordedAt.slice(0, 10)}T00:00:00Z`)).filter(Number.isFinite).map(time => Math.max(0, Math.round((midnight - time) / 86_400_000)));
  return { pending: pending.length, review, pendingCost: pending.reduce((sum, trip) => sum + trip.totalCost, 0), oldestPendingDays: ages.length ? Math.max(...ages) : null };
}
