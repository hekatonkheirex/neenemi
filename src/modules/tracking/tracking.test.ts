import { describe, expect, it } from 'vitest';
import ExcelJS from 'exceljs';
import { parseTrackingFile, combineTracking, parseTimestamp } from './parser';
import { analyzeDay, siteKey, validateEvent } from './analysis';
import type { TrackingVisit } from './types';
const bytes = (value: string) => new TextEncoder().encode(value);
const visit = (overrides: Partial<TrackingVisit> = {}): TrackingVisit => ({ key: 'v1', reportId: '1', customer: 'Cliente', technician: 'Ana', branch: '', address: '', serialNumber: '', requestedService: '', status: '', scheduledAt: null, sourceSheet: 'CSV', sourceRow: 2, serviceType: 'En Sitio', checkIn: '2026-09-01T08:00:00', checkOut: '2026-09-01T09:00:00', gpsIn: { latitude: -25, longitude: -57 }, gpsOut: { latitude: -25, longitude: -57 }, matchedReport: false, issues: [], ...overrides });
describe('tracking imports', () => {
  it('preserves quoted multiline fields and distinguishes coordinates from GPS flags', async () => {
    const parsed = await parseTrackingFile(bytes('Nº I.S.,Cliente,Técnico,TS check-in,TS check-out,GPS IN,GPS_IN,GPS_OUT,Servicio solicitado\r\n1,Cliente,Ana,01/09/2026 08:00,,IN_NO_DATA,"\'-25,-57",,"Primera línea\nSegunda línea"'), 'gps.csv', 'geolocation');
    expect(parsed.visits[0]).toMatchObject({ reportId: '1', checkIn: '2026-09-01T08:00:00', checkOut: null, gpsIn: { latitude: -25, longitude: -57 }, requestedService: 'Primera línea\nSegunda línea' });
    expect(parsed.sourceSheets[0].rows[1][8]).toBe('Primera línea\nSegunda línea');
  });
  it('reads XLSX dates and reports with optional addresses without fabricating joins', async () => {
    const workbook = new ExcelJS.Workbook();
    const sheet = workbook.addWorksheet('Detalles');
    sheet.addRow(['Nº I.S.', 'Cliente', 'Técnico', 'Dirección', 'Sucursal', 'Fecha I.S.']);
    sheet.addRow([1, 'Cliente', 'Ana', 'Calle 1', 'Centro', new Date('2026-09-01T08:00:00Z')]);
    const parsed = await parseTrackingFile(new Uint8Array(await workbook.xlsx.writeBuffer()), 'detalle.xlsx', 'reports');
    const result = combineTracking(parsed.reports, [visit(), visit({ key: 'v2', technician: 'Otro' })]);
    expect(result.visits[0]).toMatchObject({ matchedReport: true, address: 'Calle 1', branch: 'Centro' });
    expect(result.visits[1].matchedReport).toBe(false);
    expect(result.matchedVisits).toBe(1);
  });
  it('does not join ambiguous report rows or a different customer', () => {
    const original = visit();
    const result = combineTracking([original, { ...original, address: 'Otra sede' }], [original]);
    expect(result.visits[0].matchedReport).toBe(false);
    expect(combineTracking([{ ...original, customer: 'Otro' }], [original]).matchedVisits).toBe(0);
  });
  it('retains invalid dates/GPS as unknowns with evidence instead of coercing coordinates', async () => {
    const parsed = await parseTrackingFile(bytes('Nº I.S.;Cliente;Técnico;TS check-in;GPS_IN\n1;Cliente;Ana;31/02/2026 08:00;999,999'), 'gps.csv', 'geolocation');
    expect(parsed.visits[0].gpsIn).toBeNull();
    expect(parsed.visits[0].checkIn).toBeNull();
    expect(parsed.visits[0].issues).toEqual(expect.arrayContaining(['Check-in inválido', 'GPS de entrada inválido']));
    expect(parseTimestamp('01/10/2026 08:30')).toBe('2026-10-01T08:30:00');
  });
  it('reads equipment serials from CSV and XLSX, including leading zeros', async () => {
    const csv = await parseTrackingFile(bytes('Nº I.S.,Cliente,Técnico,Nº de serie\n1,Cliente,Ana,000123'), 'informes.csv', 'reports');
    expect(csv.reports[0].serialNumber).toBe('000123');
    const workbook = new ExcelJS.Workbook();
    const sheet = workbook.addWorksheet('GPS');
    sheet.addRow(['Nº I.S.', 'Cliente', 'Técnico', 'TS check-in', 'Serial']);
    sheet.addRow([1, 'Cliente', 'Ana', '01/09/2026 08:00', ' abc-001 ']);
    const gps = await parseTrackingFile(new Uint8Array(await workbook.xlsx.writeBuffer()), 'gps.xlsx', 'geolocation');
    expect(gps.visits[0].serialNumber).toBe('ABC-001');
    expect(combineTracking(csv.reports, gps.visits).visits[0].matchedReport).toBe(false);
  });
  it('links distinct reports to the same equipment, but never groups missing series', () => {
    expect(siteKey(visit({ serialNumber: 'abc-001' }))).toBe(siteKey(visit({ reportId: '2', branch: 'Otra sede', technician: 'Luis', serialNumber: ' ABC-001 ' })));
    expect(siteKey(visit({ serialNumber: 'ABC-002' }))).not.toBe(siteKey(visit({ serialNumber: 'ABC-001' })));
    expect(siteKey(visit({ serialNumber: 'N/A' }))).toBe(siteKey(visit()));
  });
});
describe('tracking evidence', () => {
  it('validates independent reference coordinates and missing evidence separately', () => {
    const coordinate = { latitude: -25, longitude: -57 };
    const site = { ...coordinate, key: 'site', customer: 'Cliente', branch: '', address: '', confirmedAt: 'now' };
    expect(validateEvent('2026-09-01T08:00:00', coordinate, site).status).toBe('inside');
    expect(validateEvent('2026-09-01T08:00:00', { ...coordinate, latitude: -25.002 }, site).status).toBe('outside');
    expect(validateEvent(null, coordinate, site).status).toBe('missing-event');
    expect(validateEvent('2026-09-01T08:00:00', null, site).status).toBe('missing-gps');
    expect(validateEvent('2026-09-01T08:00:00', coordinate, undefined).status).toBe('unconfirmed');
    expect(siteKey(visit())).not.toBe(siteKey(visit({ reportId: '2' })));
    expect(siteKey(visit({ branch: 'Centro' }))).toBe(siteKey(visit({ reportId: '2', branch: 'Centro' })));
  });
  it('calculates same-day exit-to-entry intervals, not report dates or driving times', () => {
    const next = visit({ key: 'v2', reportId: '2', customer: 'Otro', checkIn: '2026-09-01T09:30:00', checkOut: '2026-09-01T10:00:00', gpsIn: { latitude: -25.01, longitude: -57 } });
    const result = analyzeDay([next, visit()], 'Ana', '2026-09-01');
    expect(result.events.map(e => e.kind)).toEqual(['in', 'out', 'in', 'out']);
    expect(result.legs[0].elapsedMinutes).toBe(30);
    expect(result.legs[0].distanceMeters).toBeCloseTo(1111.95, 0);
    expect(analyzeDay([visit({ checkOut: '2026-09-02T01:00:00' })], 'Ana', '2026-09-02').events.map(e => e.kind)).toEqual(['out']);
  });
  it('reports overlapping or missing departures without manufacturing travel metrics', () => {
    const next = visit({ key: 'v2', reportId: '2', checkIn: '2026-09-01T08:30:00' });
    expect(analyzeDay([visit(), next], 'Ana', '2026-09-01').legs[0]).toMatchObject({ elapsedMinutes: null, distanceMeters: null });
    expect(analyzeDay([visit({ checkOut: null, gpsOut: null }), next], 'Ana', '2026-09-01').legs[0]).toMatchObject({ elapsedMinutes: null, distanceMeters: null });
    expect(analyzeDay([visit({ serviceType: 'Remoto' })], 'Ana', '2026-09-01').events).toEqual([]);
  });
});
