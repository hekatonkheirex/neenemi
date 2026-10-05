import { describe, expect, it } from 'vitest';
import { analyzeDay, applyRoads, idleByDay, pairKey, routePairs, summarizeDay } from './analysis';
import type { TrackingVisit } from './types';

function visit(key: string, checkIn: string | null, checkOut: string | null, overrides: Partial<TrackingVisit> = {}): TrackingVisit {
  return { key, reportId: key, customer: 'Cliente', technician: 'Ana', branch: '', address: '', serialNumber: '', requestedService: '', status: '', scheduledAt: null, sourceSheet: 'CSV', sourceRow: 2, serviceType: 'En Sitio', checkIn, checkOut, gpsIn: { latitude: -25, longitude: -57 }, gpsOut: { latitude: -25, longitude: -57 }, matchedReport: false, issues: [], ...overrides };
}

const at = (time: string) => `2026-09-01T${time}:00`;

describe('tracking daily summary', () => {
  it('counts overlapping and duplicated service time only once, excluding gaps', () => {
    const analysis = analyzeDay([
      visit('1', at('08:00'), at('10:00')),
      visit('duplicate', at('08:00'), at('10:00')),
      visit('2', at('09:30'), at('11:00')),
      visit('3', at('12:00'), at('13:00'), { gpsIn: { latitude: -25.01, longitude: -57 } }),
    ], 'Ana', '2026-09-01');
    expect(summarizeDay(analysis)).toMatchObject({ travelMinutes: 60, serviceMinutes: 240, measuredLegs: 1, missingLegs: 2, timedLegs: 1, missingTimedLegs: 2, excludedServices: 0 });
    expect(summarizeDay(analysis).distanceMeters).toBeCloseTo(1111.95, 0);
  });

  it('clips services crossing midnight to the selected day', () => {
    const overnight = visit('1', at('23:30'), '2026-09-02T01:30:00');
    expect(summarizeDay(analyzeDay([overnight], 'Ana', '2026-09-01'))).toMatchObject({ travelMinutes: null, serviceMinutes: 30 });
    expect(summarizeDay(analyzeDay([overnight], 'Ana', '2026-09-02'))).toMatchObject({ travelMinutes: null, serviceMinutes: 90 });
  });

  it('distinguishes missing evidence from measured zero and ignores invalid service intervals', () => {
    const incomplete = analyzeDay([visit('1', at('08:00'), null)], 'Ana', '2026-09-01');
    expect(summarizeDay(incomplete)).toMatchObject({ travelMinutes: null, serviceMinutes: null, distanceMeters: null, excludedServices: 1 });
    const invalid = analyzeDay([visit('1', at('09:00'), at('08:00'))], 'Ana', '2026-09-01');
    expect(summarizeDay(invalid)).toMatchObject({ serviceMinutes: null, excludedServices: 1 });
    const valid = analyzeDay([visit('1', at('08:00'), at('09:00')), visit('2', at('09:30'), at('10:00'))], 'Ana', '2026-09-01');
    expect(summarizeDay(valid)).toMatchObject({ distanceMeters: 0, serviceMinutes: 90, travelMinutes: 30, missingLegs: 0 });
    expect(summarizeDay(analyzeDay([], 'Ana', '2026-09-01'))).toMatchObject({ distanceMeters: null, serviceMinutes: null, travelMinutes: null });
  });
  it('sums travel gaps independently of GPS and preserves measured zero intervals', () => {
    const analysis = analyzeDay([
      visit('1', at('08:00'), at('09:00'), { gpsOut: null }),
      visit('2', at('09:20'), at('10:00')),
      visit('3', at('10:00'), at('11:00')),
      visit('4', at('11:45'), null),
    ], 'Ana', '2026-09-01');
    expect(summarizeDay(analysis)).toMatchObject({ travelMinutes: 65, timedLegs: 3, missingTimedLegs: 0, measuredLegs: 2, missingLegs: 1, serviceMinutes: 160 });
  });

  it('uses road distance where a route exists and straight line elsewhere', () => {
    const analysis = analyzeDay([
      visit('1', at('08:00'), at('09:00'), { gpsOut: { latitude: -25, longitude: -57 } }),
      visit('2', at('10:00'), at('11:00'), { gpsIn: { latitude: -25.01, longitude: -57 }, gpsOut: { latitude: -25.01, longitude: -57 } }),
      visit('3', at('12:00'), at('13:00'), { gpsIn: { latitude: -25.02, longitude: -57 } }),
    ], 'Ana', '2026-09-01');
    const road = { distanceMeters: 1800, geometry: [{ latitude: -25, longitude: -57 }, { latitude: -25.01, longitude: -57 }] };
    const routed = applyRoads(analysis, { [pairKey({ latitude: -25, longitude: -57 }, { latitude: -25.01, longitude: -57 })]: road });
    expect(routed.legs[0].road).toBe(road);
    expect(routed.legs[1].road).toBeUndefined();
    const summary = summarizeDay(routed);
    expect(summary).toMatchObject({ measuredLegs: 2, roadLegs: 1 });
    expect(summary.distanceMeters).toBeCloseTo(1800 + 1111.95, 0);
    expect(summarizeDay(analysis).roadLegs).toBe(0);
  });

  it('keeps the straight line for legs inside the site radius', () => {
    const analysis = analyzeDay([
      visit('1', at('08:00'), at('09:00'), { gpsOut: { latitude: -25, longitude: -57 } }),
      visit('2', at('10:00'), at('11:00'), { gpsIn: { latitude: -25.0005, longitude: -57 } }),
    ], 'Ana', '2026-09-01');
    const road = { distanceMeters: 458, geometry: [{ latitude: -25, longitude: -57 }, { latitude: -25.0005, longitude: -57 }] };
    expect(applyRoads(analysis, { [pairKey({ latitude: -25, longitude: -57 }, { latitude: -25.0005, longitude: -57 })]: road }).legs[0].road).toBeUndefined();
  });

  it('requests a route for every consecutive located event pair over 100 m, once per distinct pair', () => {
    const far = { latitude: -25.005, longitude: -57 };
    const analysis = analyzeDay([
      visit('1', at('08:00'), at('09:00'), { gpsIn: { latitude: -25, longitude: -57 }, gpsOut: far }),
      visit('2', at('10:00'), at('11:00'), { gpsIn: far, gpsOut: far }),
    ], 'Ana', '2026-09-01');
    const pairs = routePairs(analysis);
    expect(pairs.map(p => p.key)).toEqual([pairKey({ latitude: -25, longitude: -57 }, far)]);
  });

  it('flags a leg only when both ends are services with check-in and check-out over 5 km apart', () => {
    const analysis = analyzeDay([
      visit('1', at('08:00'), at('09:00'), { gpsIn: { latitude: -25, longitude: -57 }, gpsOut: { latitude: -25, longitude: -57 } }),
      visit('2', at('10:00'), at('11:00'), { gpsIn: { latitude: -25.1, longitude: -57 }, gpsOut: { latitude: -25.2, longitude: -57 } }),
      visit('3', at('12:00'), at('13:00'), { gpsIn: { latitude: -25.3, longitude: -57 }, gpsOut: { latitude: -25.4, longitude: -57 } }),
    ], 'Ana', '2026-09-01');
    expect(analysis.suspectVisitKeys).toEqual(['2', '3']);
    const road = { distanceMeters: 5, geometry: [{ latitude: 0, longitude: 0 }, { latitude: 1, longitude: 1 }] };
    const routed = applyRoads(analysis, Object.fromEntries(routePairs(analysis).map(pair => [pair.key, road])));
    expect(routed.legs.every(leg => leg.road === road)).toBe(true);
    expect(summarizeDay(routed)).toMatchObject({ suspectLegs: 1, measuredLegs: 2, roadLegs: 2 });
  });
});

describe('idle hours per day (07:00-18:00, Mon-Fri)', () => {
  // 2026-09-01 is a Tuesday; 09-05 and 09-06 are the weekend; 09-07 is a Monday.
  const on = (day: string, a: string, b: string, key = day + a) => visit(key, `2026-09-${day}T${a}:00`, `2026-09-${day}T${b}:00`);

  it('subtracts merged services from the 11 h window, clips to it, and skips weekends', () => {
    const rows = idleByDay([
      on('01', '06:00', '08:00'), // 1 h inside the window
      on('01', '09:00', '10:00'), on('01', '09:30', '10:30'), // overlap: 1.5 h once
      on('01', '17:00', '19:00'), // 1 h inside the window
      on('04', '08:00', '09:00'), on('05', '08:00', '09:00'), // Friday, then Saturday (ignored)
      on('07', '08:00', '09:00'),
    ], 'Ana');
    expect(rows.map(r => r.day)).toEqual(['2026-09-01', '2026-09-02', '2026-09-03', '2026-09-04', '2026-09-07']);
    expect(rows[0]).toMatchObject({ serviceMinutes: 210, idleMinutes: 450, marked: true });
    expect(rows[1]).toMatchObject({ serviceMinutes: 0, idleMinutes: 660, marked: false });
    expect(rows[3]).toMatchObject({ serviceMinutes: 60, idleMinutes: 600 });
  });

  it('adds travel gaps clipped to the window for the estimated total work time', () => {
    const [row] = idleByDay([on('01', '08:00', '09:00'), on('01', '09:30', '10:00'), on('01', '17:30', '19:00')], 'Ana');
    expect(row).toMatchObject({ serviceMinutes: 120, travelMinutes: 480 });
  });

  it('flags incomplete services, honors the on-site filter and technician', () => {
    const rows = idleByDay([
      on('01', '08:00', '09:00'),
      visit('open', '2026-09-01T10:00:00', null),
      visit('remote', '2026-09-01T11:00:00', '2026-09-01T12:00:00', { serviceType: 'Remoto' }),
      visit('other', '2026-09-01T13:00:00', '2026-09-01T14:00:00', { technician: 'Luis' }),
    ], 'Ana');
    expect(rows).toEqual([{ day: '2026-09-01', serviceMinutes: 60, travelMinutes: 60, idleMinutes: 600, marked: true, excludedServices: 1 }]);
    expect(idleByDay([visit('remote', '2026-09-01T11:00:00', '2026-09-01T12:00:00', { serviceType: 'Remoto' })], 'Ana', false)[0].serviceMinutes).toBe(60);
    expect(idleByDay([], 'Ana')).toEqual([]);
  });
});
