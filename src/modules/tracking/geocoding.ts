import type { GeocodingCandidate } from './types';

export function parseGeocodingResults(value: unknown): GeocodingCandidate[] {
  if (!value || typeof value !== 'object' || !('features' in value) || !Array.isArray(value.features)) throw new Error('Respuesta de ubicaciones inválida.');
  const results: GeocodingCandidate[] = [];
  for (const feature of value.features.slice(0, 5)) {
    if (!feature || typeof feature !== 'object') continue;
    const coordinates = feature.geometry?.coordinates;
    if (feature.geometry?.type !== 'Point' || !Array.isArray(coordinates)) continue;
    const [longitude, latitude] = coordinates;
    if (typeof latitude !== 'number' || !Number.isFinite(latitude) || Math.abs(latitude) > 85.05112878 || typeof longitude !== 'number' || !Number.isFinite(longitude) || Math.abs(longitude) > 180) continue;
    const properties = feature.properties;
    if (!properties || typeof properties !== 'object') continue;
    const text = (key: string) => typeof properties[key] === 'string' ? properties[key].slice(0, 200) : '';
    const street = [text('street'), text('housenumber')].filter(Boolean).join(' ');
    const label = [...new Set([text('name'), street, text('district'), text('city'), text('state'), text('country')].filter(Boolean))].join(', ');
    if (!label) continue;
    results.push({ latitude, longitude, label, kind: text('type') || text('osm_value') || 'Ubicación aproximada' });
  }
  return results;
}
