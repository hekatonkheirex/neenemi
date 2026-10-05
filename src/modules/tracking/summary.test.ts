import { describe, expect, it } from 'vitest';
import { analyzeDay, applyRoads, pairKey, routePairs, summarizeDay } from './analysis';
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
    const far = { latitude: -25.1, longitude: -57 };
    const analysis = analyzeDay([
      visit('1', at('08:00'), at('09:00'), { gpsIn: { latitude: -25.05, longitude: -57 }, gpsOut: far }),
      visit('2', at('10:00'), at('11:00'), { gpsIn: far, gpsOut: far }),
    ], 'Ana', '2026-09-01');
    const pairs = routePairs(analysis);
    expect(pairs.map(p => p.key)).toEqual([pairKey({ latitude: -25.05, longitude: -57 }, far)]);
  });
});
