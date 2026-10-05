export type Coordinate = { latitude: number; longitude: number };
export type GeocodingCandidate = Coordinate & { label: string; kind: string };
export type TrackingReport = {
  reportId: string; customer: string; technician: string; branch: string; address: string;
  serialNumber: string;
  requestedService: string; status: string; scheduledAt: string | null;
  sourceSheet: string; sourceRow: number;
};
export type TrackingVisit = TrackingReport & {
  key: string; serviceType: string; checkIn: string | null; checkOut: string | null;
  gpsIn: Coordinate | null; gpsOut: Coordinate | null; matchedReport: boolean;
  issues: string[];
};
export type SiteReference = Coordinate & { key: string; serialNumber?: string; customer: string; branch: string; address: string; confirmedAt: string };
export type TrackingSnapshot = {
  batchId: string; importedAt: string; reportFile: string; geolocationFile: string;
  reports: TrackingReport[]; visits: TrackingVisit[]; warnings: string[];
  matchedVisits: number; unmatchedReports: number;
};
export type TrackingState = { snapshot: TrackingSnapshot | null; sites: SiteReference[] };
export type EventValidation = { status: 'inside' | 'outside' | 'missing-gps' | 'missing-event' | 'unconfirmed'; distanceMeters: number | null };
export type RouteEvent = { key: string; visitKey: string; reportId: string; customer: string; kind: 'in' | 'out'; timestamp: string; coordinate: Coordinate | null };
export type RoadRoute = { distanceMeters: number; geometry: Coordinate[] };
export type TravelLeg = { from: TrackingVisit; to: TrackingVisit; distanceMeters: number | null; elapsedMinutes: number | null; issue: string | null; road?: RoadRoute };
export type DayAnalysis = { visits: TrackingVisit[]; events: RouteEvent[]; legs: TravelLeg[]; roadSegments?: Record<string, Coordinate[]> };
export const TRACKING_RADIUS_METERS = 100;
