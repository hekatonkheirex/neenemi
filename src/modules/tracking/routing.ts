import type { Coordinate, RoadRoute } from './types';

const validCoordinate = (value: unknown): value is Coordinate => !!value && typeof value === 'object'
  && typeof (value as Coordinate).latitude === 'number' && Math.abs((value as Coordinate).latitude) <= 85.05112878
  && typeof (value as Coordinate).longitude === 'number' && Math.abs((value as Coordinate).longitude) <= 180;

export function parseRouteLegs(value: unknown): { from: Coordinate; to: Coordinate }[] {
  if (!Array.isArray(value) || value.length > 40) throw new Error('Envía hasta 40 tramos.');
  return value.map(leg => {
    if (!leg || !validCoordinate(leg.from) || !validCoordinate(leg.to)) throw new Error('Tramo con coordenadas inválidas.');
    return { from: { latitude: leg.from.latitude, longitude: leg.from.longitude }, to: { latitude: leg.to.latitude, longitude: leg.to.longitude } };
  });
}

/** Reads an OSRM /route response (geometries=geojson). Returns null when there is no drivable route. */
export function parseOsrmRoute(value: unknown): RoadRoute | null {
  const body = value as { code?: unknown; routes?: { distance?: unknown; geometry?: { coordinates?: unknown } }[] } | null;
  const route = body?.code === 'Ok' ? body.routes?.[0] : undefined;
  const coordinates = route?.geometry?.coordinates;
  if (!route || typeof route.distance !== 'number' || !Number.isFinite(route.distance) || route.distance < 0 || !Array.isArray(coordinates)) return null;
  const geometry: Coordinate[] = [];
  for (const point of coordinates) {
    const [longitude, latitude] = Array.isArray(point) ? point : [];
    if (typeof latitude === 'number' && typeof longitude === 'number') geometry.push({ latitude, longitude });
  }
  return geometry.length > 1 ? { distanceMeters: route.distance, geometry } : null;
}
