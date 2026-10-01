import { normalizeIdentity, normalizeTrackingSerial } from './parser';
import { TRACKING_RADIUS_METERS, type Coordinate, type DayAnalysis, type EventValidation, type RouteEvent, type SiteReference, type TrackingReport, type TrackingVisit, type TravelLeg } from './types';

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
  return { visits, events, legs };
}

export function summarizeDay(analysis: DayAnalysis) {
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
  let travelMinutes = 0;
  let timedLegs = 0;
  for (const leg of analysis.legs) {
    if (leg.distanceMeters !== null) {
      distance += leg.distanceMeters;
      measuredLegs += 1;
    }
    if (leg.elapsedMinutes !== null) {
      travelMinutes += leg.elapsedMinutes;
      timedLegs += 1;
    }
  }
  return {
    distanceMeters: measuredLegs ? distance : null,
    measuredLegs,
    missingLegs: analysis.legs.length - measuredLegs,
    travelMinutes: timedLegs ? travelMinutes : null,
    timedLegs,
    missingTimedLegs: analysis.legs.length - timedLegs,
    serviceMinutes: intervals.length ? serviceMilliseconds / 60_000 : null,
    excludedServices,
  };
}
