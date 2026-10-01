import { describe, expect, it } from 'vitest';
import { parseGeocodingResults } from './geocoding';
import { parseTrackingFile } from './parser';

const feature = (coordinates: unknown[], properties = { name: 'Sede', street: 'Calle Pública', housenumber: '100', city: 'Asunción', country: 'Paraguay', type: 'house' }) => ({ geometry: { type: 'Point', coordinates }, properties });

describe('tracking address proposals', () => {
  it('uses headquarters only without a branch and prefers the service address', async () => {
    const csv = 'Nº I.S.,Cliente,Técnico,Sucursal,Dirección,Dirección Casa Matriz\n1,Cliente,Ana,,,Matriz\n2,Cliente,Ana,Sucursal,,Matriz\n3,Cliente,Ana,,Dirección de servicio,Matriz';
    const parsed = await parseTrackingFile(new TextEncoder().encode(csv), 'reports.csv', 'reports');
    expect(parsed.reports.map(report => report.address)).toEqual(['Matriz', '', 'Dirección de servicio']);
  });

  it('converts longitude/latitude correctly and discards unusable locations', () => {
    const results = parseGeocodingResults({ features: [feature([-57.6, -25.3]), feature([181, -25]), feature([-57, NaN]), feature([-57, 90]), { geometry: { type: 'LineString', coordinates: [-57, -25] } }] });
    expect(results).toEqual([{ latitude: -25.3, longitude: -57.6, label: 'Sede, Calle Pública 100, Asunción, Paraguay', kind: 'house' }]);
  });

  it('distinguishes no matches from an invalid provider response', () => {
    expect(parseGeocodingResults({ features: [] })).toEqual([]);
    expect(() => parseGeocodingResults({ error: 'Provider failed' })).toThrow('Respuesta de ubicaciones inválida');
  });
});
