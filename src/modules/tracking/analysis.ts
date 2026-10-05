import { normalizeIdentity, normalizeTrackingSerial } from './parser';
import { SUSPECT_VISIT_METERS, TRACKING_RADIUS_METERS, type Coordinate, type DayAnalysis, type EventValidation, type RoadRoute, type RouteEvent, type SiteReference, type TrackingReport, type TrackingVisit, type TravelLeg } from './types';

export function siteKey(report: TrackingReport): string {
  const serial = normalizeTrackingSerial(report.serialNumber);
  if (serial) return JSON.stringify(['serie', serial]);
  return JSON.stringify([normalizeIdentity(report.customer), report.branch ? `sede:${normalizeIdentity(report.branch)}` : `is:${report.reportId}`]);
}

export function distanceMeters(a: Coordinate, b: Coordinate): number {
  const radians = Math.PI / 180;
  const dLat = (b.latitude - a.latitude) * radians;
  const dLon = (b.longitude - a.longitude) * radians;
  const h = Math.sin(dLat / 2) ** 2 + Math.cos(a.latitude * radians) * Math.cos(b.latitude * radians) * Math.sin(dLon / 2) ** 2;
  return 6_371_000 * 2 * Math.atan2(Math.sqrt(Math.min(1, h)), Math.sqrt(Math.max(0, 1 - h)));
}

export function validateEvent(timestamp: string | null, coordinate: Coordinate | null, site: SiteReference | undefined): EventValidation {
  if (!timestamp) return { status: 'missing-event', distanceMeters: null };
  if (!coordinate) return { status: 'missing-gps', distanceMeters: null };
  if (!site) return { status: 'unconfirmed', distanceMeters: null };
  const distance = distanceMeters(coordinate, site);
  return { status: distance <= TRACKING_RADIUS_METERS ? 'inside' : 'outside', distanceMeters: distance };
}

export function analyzeDay(allVisits: TrackingVisit[], technician: string, day: string, onsiteOnly = true): DayAnalysis {
  const visits = allVisits.filter(visit => normalizeIdentity(visit.technician) === normalizeIdentity(technician)
    && (!onsiteOnly || normalizeIdentity(visit.serviceType) === 'en sitio')
    && (visit.checkIn?.slice(0, 10) === day || visit.checkOut?.slice(0, 10) === day))
    .sort((a, b) => (a.checkIn ?? a.checkOut ?? '').localeCompare(b.checkIn ?? b.checkOut ?? '') || a.key.localeCompare(b.key));
  const events: RouteEvent[] = [];
  for (const visit of visits) {
    for (const kind of ['in', 'out'] as const) {
      const timestamp = kind === 'in' ? visit.checkIn : visit.checkOut;
      if (timestamp?.slice(0, 10) === day) events.push({ key: `${visit.key}:${kind}`, visitKey: visit.key, reportId: visit.reportId, customer: visit.customer, kind, timestamp, coordinate: kind === 'in' ? visit.gpsIn : visit.gpsOut });
    }
  }
  events.sort((a, b) => a.timestamp.localeCompare(b.timestamp) || (a.kind === b.kind ? a.key.localeCompare(b.key) : a.kind === 'out' ? -1 : 1));
  const arrivals = visits.filter(v => v.checkIn?.slice(0, 10) === day);
  const legs: TravelLeg[] = [];
  for (let index = 1; index < arrivals.length; index += 1) {
    const from = arrivals[index - 1];
    const to = arrivals[index];
    let issue: string | null = null;
    let elapsedMinutes: number | null = null;
    let distance: number | null = null;
    if (!from.checkOut || from.checkOut.slice(0, 10) !== day) issue = 'Sin salida registrada en este día';
    else if (from.checkOut < from.checkIn! || to.checkOut && to.checkOut < to.checkIn!) issue = 'Marcaciones inconsistentes';
    else if (from.checkOut > to.checkIn!) issue = 'Servicios solapados: no se puede atribuir un traslado';
    else {
      // Literal SGS wall-clock values: UTC here is arithmetic only, not a timezone conversion.
      elapsedMinutes = (Date.parse(`${to.checkIn}Z`) - Date.parse(`${from.checkOut}Z`)) / 60_000;
      if (from.gpsOut && to.gpsIn) distance = distanceMeters(from.gpsOut, to.gpsIn);
      else issue = 'Sin GPS de salida o entrada';
    }
    legs.push({ from, to, distanceMeters: distance, elapsedMinutes, issue });
  }
  const suspectVisitKeys = visits.filter(visit => visit.gpsIn && visit.gpsOut && distanceMeters(visit.gpsIn, visit.gpsOut) > SUSPECT_VISIT_METERS).map(visit => visit.key);
  return { visits, events, legs, suspectVisitKeys };
}

/** Road distance when a route was found, straight-line otherwise. */
export function legDistance(leg: TravelLeg): number | null {
  return leg.road?.distanceMeters ?? leg.distanceMeters;
}

/** Legs inside the site radius are same-place moves: snapping GPS noise to a street would invent distance. */
export function needsRoad(leg: TravelLeg): boolean {
  return leg.distanceMeters !== null && leg.distanceMeters > TRACKING_RADIUS_METERS;
}

/** Doubtful only when both ends belong to services with inconsistent GPS; one doubtful end alone is not enough to discredit the move. */
export function isSuspectLeg(analysis: DayAnalysis, leg: TravelLeg): boolean {
  return analysis.suspectVisitKeys.includes(leg.from.key) && analysis.suspectVisitKeys.includes(leg.to.key);
}
export function isSuspectSegment(analysis: Pick<DayAnalysis, 'suspectVisitKeys'>, from: RouteEvent, to: RouteEvent): boolean {
  return analysis.suspectVisitKeys.includes(from.visitKey) && analysis.suspectVisitKeys.includes(to.visitKey);
}

export const pairKey = (from: Coordinate, to: Coordinate) => `${from.latitude},${from.longitude};${to.latitude},${to.longitude}`;
export const segmentKey = (from: RouteEvent, to: RouteEvent) => `${from.key}>${to.key}`;

/** Every distinct from/to pair that deserves a road route: travel legs plus each consecutive pair of located map events. */
export function routePairs(analysis: DayAnalysis): { key: string; from: Coordinate; to: Coordinate }[] {
  const pairs = new Map<string, { key: string; from: Coordinate; to: Coordinate }>();
  const add = (from: Coordinate, to: Coordinate) => {
    const key = pairKey(from, to);
    if (distanceMeters(from, to) > TRACKING_RADIUS_METERS && !pairs.has(key)) pairs.set(key, { key, from, to });
  };
  for (const leg of analysis.legs) if (needsRoad(leg)) add(leg.from.gpsOut!, leg.to.gpsIn!);
  for (let index = 1; index < analysis.events.length; index += 1) {
    const from = analysis.events[index - 1].coordinate;
    const to = analysis.events[index].coordinate;
    if (from && to) add(from, to);
  }
  return [...pairs.values()];
}

/** `roads` is keyed by `pairKey`; missing or null entries keep the straight-line fallback. */
export function applyRoads(analysis: DayAnalysis, roads: Record<string, RoadRoute | null>): DayAnalysis {
  const legs = analysis.legs.map(leg => {
    const road = needsRoad(leg) ? roads[pairKey(leg.from.gpsOut!, leg.to.gpsIn!)] : null;
    return road ? { ...leg, road } : leg;
  });
  const roadSegments: Record<string, Coordinate[]> = {};
  for (let index = 1; index < analysis.events.length; index += 1) {
    const from = analysis.events[index - 1];
    const to = analysis.events[index];
    const road = from.coordinate && to.coordinate && distanceMeters(from.coordinate, to.coordinate) > TRACKING_RADIUS_METERS ? roads[pairKey(from.coordinate, to.coordinate)] : null;
    if (road) roadSegments[segmentKey(from, to)] = road.geometry;
  }
  return { ...analysis, legs, roadSegments };
}

export function summarizeDay(analysis: DayAnalysis) {
  const suspectLegs = analysis.legs.filter(leg => leg.distanceMeters !== null && isSuspectLeg(analysis, leg)).length;
  const day = analysis.events[0]?.timestamp.slice(0, 10);
  const dayStart = day ? Date.parse(`${day}T00:00:00Z`) : NaN;
  const dayEnd = dayStart + 86_400_000;
  const intervals: [number, number][] = [];
  let excludedServices = 0;
  for (const visit of analysis.visits) {
    const start = visit.checkIn ? Date.parse(`${visit.checkIn}Z`) : NaN;
    const end = visit.checkOut ? Date.parse(`${visit.checkOut}Z`) : NaN;
    if (!Number.isFinite(start) || !Number.isFinite(end) || end < start) {
      excludedServices += 1;
      continue;
    }
    const clippedStart = Math.max(start, dayStart);
    const clippedEnd = Math.min(end, dayEnd);
    if (clippedEnd < clippedStart) continue;
    intervals.push([clippedStart, clippedEnd]);
  }
  intervals.sort((a, b) => a[0] - b[0] || a[1] - b[1]);
  let serviceMilliseconds = 0;
  let coveredUntil = -Infinity;
  for (const [start, end] of intervals) {
    serviceMilliseconds += Math.max(0, end - Math.max(start, coveredUntil));
    coveredUntil = Math.max(coveredUntil, end);
  }
  let distance = 0;
  let measuredLegs = 0;
  let roadLegs = 0;
  let travelMinutes = 0;
  let timedLegs = 0;
  for (const leg of analysis.legs) {
    const legMeters = legDistance(leg);
    if (legMeters !== null) {
      distance += legMeters;
      measuredLegs += 1;
      if (leg.road) roadLegs += 1;
    }
    if (leg.elapsedMinutes !== null) {
      travelMinutes += leg.elapsedMinutes;
      timedLegs += 1;
    }
  }
  return {
    distanceMeters: measuredLegs ? distance : null,
    measuredLegs,
    roadLegs,
    suspectLegs,
    missingLegs: analysis.legs.length - measuredLegs,
    travelMinutes: timedLegs ? travelMinutes : null,
    timedLegs,
    missingTimedLegs: analysis.legs.length - timedLegs,
    serviceMinutes: intervals.length ? serviceMilliseconds / 60_000 : null,
    excludedServices,
  };
}

/** Company working hours: Monday to Friday, 07:00 to 18:00. */
export const WORK_START_HOUR = 7;
export const WORK_END_HOUR = 18;
/** Unpaid lunch break, subtracted from the window (its position in the day is unknown). */
export const LUNCH_MINUTES = 60;
export const WORK_MINUTES = (WORK_END_HOUR - WORK_START_HOUR) * 60 - LUNCH_MINUTES;
export type IdleDay = { day: string; serviceMinutes: number; travelMinutes: number; idleMinutes: number; marked: boolean; excludedServices: number };

/**
 * Non-effective time per weekday between the technician's first and last marked day: the working window minus lunch and merged service
 * intervals inside it. Weekdays without marks count as fully non-effective (10 h) (holidays and leave are unknown). Weekends are skipped.
 */
export function idleByDay(visits: TrackingVisit[], technician: string, onsiteOnly = true): IdleDay[] {
  const markedDays = new Set<string>();
  for (const visit of visits) {
    if (normalizeIdentity(visit.technician) !== normalizeIdentity(technician) || onsiteOnly && normalizeIdentity(visit.serviceType) !== 'en sitio') continue;
    for (const stamp of [visit.checkIn, visit.checkOut]) if (stamp) markedDays.add(stamp.slice(0, 10));
  }
  const sorted = [...markedDays].sort();
  if (!sorted.length) return [];
  const rows: IdleDay[] = [];
  const last = Date.parse(`${sorted[sorted.length - 1]}T00:00:00Z`);
  for (let t = Date.parse(`${sorted[0]}T00:00:00Z`); t <= last; t += 86_400_000) {
    const weekday = new Date(t).getUTCDay();
    if (weekday === 0 || weekday === 6) continue;
    const day = new Date(t).toISOString().slice(0, 10);
    const windowStart = t + WORK_START_HOUR * 3_600_000;
    const windowEnd = t + WORK_END_HOUR * 3_600_000;
    const intervals: [number, number][] = [];
    let excludedServices = 0;
    const dayAnalysis = analyzeDay(visits, technician, day, onsiteOnly);
    let travelMs = 0;
    for (const leg of dayAnalysis.legs) {
      if (leg.elapsedMinutes === null) continue;
      travelMs += Math.max(0, Math.min(Date.parse(`${leg.to.checkIn}Z`), windowEnd) - Math.max(Date.parse(`${leg.from.checkOut}Z`), windowStart));
    }
    for (const visit of dayAnalysis.visits) {
      const start = visit.checkIn ? Date.parse(`${visit.checkIn}Z`) : NaN;
      const end = visit.checkOut ? Date.parse(`${visit.checkOut}Z`) : NaN;
      if (!Number.isFinite(start) || !Number.isFinite(end) || end < start) { excludedServices += 1; continue; }
      const clippedStart = Math.max(start, windowStart);
      const clippedEnd = Math.min(end, windowEnd);
      if (clippedEnd > clippedStart) intervals.push([clippedStart, clippedEnd]);
    }
    intervals.sort((a, b) => a[0] - b[0] || a[1] - b[1]);
    let ms = 0;
    let coveredUntil = -Infinity;
    for (const [start, end] of intervals) {
      ms += Math.max(0, end - Math.max(start, coveredUntil));
      coveredUntil = Math.max(coveredUntil, end);
    }
    const serviceMinutes = ms / 60_000;
    rows.push({ day, serviceMinutes, travelMinutes: travelMs / 60_000, idleMinutes: Math.max(0, WORK_MINUTES - serviceMinutes), marked: markedDays.has(day), excludedServices });
  }
  return rows;
}
