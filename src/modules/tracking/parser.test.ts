import { describe, expect, it } from 'vitest';
import { combineTracking, normalizeIdentity, normalizeTrackingSerial, parseTimestamp, parseTrackingFile } from './parser';
import type { TrackingReport, TrackingVisit } from './types';

const bytes = (value: string) => new TextEncoder().encode(value);
const report = (overrides: Partial<TrackingReport> = {}): TrackingReport => ({ reportId: '1', customer: 'Cliente', technician: 'Ana', branch: '', address: '', serialNumber: '', requestedService: '', status: '', scheduledAt: null, sourceSheet: 'CSV', sourceRow: 2, ...overrides });
const visit = (overrides: Partial<TrackingVisit> = {}): TrackingVisit => ({ ...report(), key: 'v1', serviceType: 'En Sitio', checkIn: null, checkOut: null, gpsIn: null, gpsOut: null, matchedReport: false, issues: [], ...overrides });

describe('normalizeIdentity', () => {
  it('strips accents, case and repeated whitespace', () => {
    expect(normalizeIdentity('  JOSÉ   Peña ')).toBe('jose pena');
  });
});

describe('normalizeTrackingSerial', () => {
  it.each(['-', 'N/A', 'n/a', 'S/N', 'sin serie', 'Sin Numero de Serie', '', null, undefined])('treats %j as a missing serial', value => {
    expect(normalizeTrackingSerial(value)).toBe('');
  });
  it('strips Excel text-prefix apostrophes and keeps leading zeros', () => {
    expect(normalizeTrackingSerial("'000123")).toBe('000123');
  });
});

describe('parseTimestamp', () => {
  it.each([
    ['2026-09-01 08:00', '2026-09-01T08:00:00'],
    ['2026-09-01T08:00:05.123', '2026-09-01T08:00:05'],
    ['01/09/2026 08:00:30', '2026-09-01T08:00:30'],
  ])('parses %s', (input, expected) => expect(parseTimestamp(input)).toBe(expected));
  it('accepts Date instances and rejects invalid ones', () => {
    expect(parseTimestamp(new Date('2026-09-01T08:00:00Z'))).toBe('2026-09-01T08:00:00');
    expect(parseTimestamp(new Date('nope'))).toBeNull();
  });
  it.each(['', null, 'ayer', '31/02/2026 08:00', '2026-13-01 08:00', '01/09/2026 24:00', '01/09/2026 08:60', '01/09/1850 08:00', '2026-09-01'])('rejects %j', input => {
    expect(parseTimestamp(input)).toBeNull();
  });
  it('accepts leap days only in leap years', () => {
    expect(parseTimestamp('29/02/2028 10:00')).toBe('2028-02-29T10:00:00');
    expect(parseTimestamp('29/02/2027 10:00')).toBeNull();
  });
});

describe('parseTrackingFile', () => {
  it('rejects unsupported extensions and invalid UTF-8', async () => {
    await expect(parseTrackingFile(bytes('x'), 'datos.txt', 'reports')).rejects.toThrow('CSV o XLSX');
    await expect(parseTrackingFile(new Uint8Array([0xff, 0xfe, 0x00]), 'datos.csv', 'reports')).rejects.toThrow();
  });
  it('rejects an unterminated quoted CSV field', async () => {
    await expect(parseTrackingFile(bytes('Nº I.S.,Cliente,Técnico\n1,"Cliente,Ana'), 'a.csv', 'reports')).rejects.toThrow('sin cerrar');
  });
  it('rejects files without usable rows or required headers', async () => {
    await expect(parseTrackingFile(bytes('Nº I.S.,Cliente,Técnico\n'), 'a.csv', 'reports')).rejects.toThrow('registros utilizables');
    await expect(parseTrackingFile(bytes('A,B\n1,2'), 'a.csv', 'reports')).rejects.toThrow('registros utilizables');
  });
  it('fails when the technician column is missing, or geolocation lacks check-in/out columns', async () => {
    await expect(parseTrackingFile(bytes('Nº I.S.,Cliente\n1,C'), 'a.csv', 'reports')).rejects.toThrow('faltan técnico');
    await expect(parseTrackingFile(bytes('Nº I.S.,Cliente,Técnico\n1,C,Ana'), 'a.csv', 'geolocation')).rejects.toThrow('faltan técnico');
  });
  it('fails on rows missing I.S. or customer, skipping fully blank rows', async () => {
    const ok = await parseTrackingFile(bytes('Nº I.S.,Cliente,Técnico\n,,\n1,C,Ana'), 'a.csv', 'reports');
    expect(ok.reports).toHaveLength(1);
    expect(ok.reports[0].sourceRow).toBe(3);
    await expect(parseTrackingFile(bytes('Nº I.S.,Cliente,Técnico\n1,,Ana'), 'a.csv', 'reports')).rejects.toThrow('fila 2');
  });
  it('detects semicolon separators, BOM and CRLF line endings', async () => {
    const parsed = await parseTrackingFile(bytes('﻿Nº I.S.;Cliente;Técnico\r\n1;"A;B";Ana\r\n2;C;Luis'), 'a.csv', 'reports');
    expect(parsed.reports.map(r => [r.reportId, r.customer, r.technician])).toEqual([['1', 'A;B', 'Ana'], ['2', 'C', 'Luis']]);
  });
  it('unescapes doubled quotes', async () => {
    const parsed = await parseTrackingFile(bytes('Nº I.S.,Cliente,Técnico\n1,"Dijo ""hola""",Ana'), 'a.csv', 'reports');
    expect(parsed.reports[0].customer).toBe('Dijo "hola"');
  });
  it('uses the headquarters address only when there is no branch and no address', async () => {
    const parsed = await parseTrackingFile(bytes('Nº I.S.,Cliente,Técnico,Sucursal,Dirección,Dirección Casa Matriz\n1,C,Ana,,,Matriz 1\n2,C,Ana,Centro,,Matriz 1\n3,C,Ana,,Calle 5,Matriz 1'), 'a.csv', 'reports');
    expect(parsed.reports.map(r => r.address)).toEqual(['Matriz 1', '', 'Calle 5']);
  });
  it('flags inconsistent visits without dropping them', async () => {
    const parsed = await parseTrackingFile(bytes('Nº I.S.,Cliente,Técnico,TS check-in,TS check-out,GPS_IN,GPS_OUT\n1,C,Ana,01/09/2026 10:00,01/09/2026 09:00,"-25.3,-57.6","abc"\n2,C,,01/09/2026 10:00,xx,,'), 'g.csv', 'geolocation');
    expect(parsed.visits[0].issues).toEqual(['GPS de salida inválido', 'Check-out anterior al check-in']);
    expect(parsed.visits[0].gpsIn).toEqual({ latitude: -25.3, longitude: -57.6 });
    expect(parsed.visits[1].issues).toEqual(['Check-out inválido', 'Sin técnico']);
    expect(parsed.warnings.some(w => w.startsWith('2 registros'))).toBe(true);
  });
  it('produces stable, unique visit keys per sheet row', async () => {
    const parsed = await parseTrackingFile(bytes('Nº I.S.,Cliente,Técnico,TS check-in\n1,C,Ana,01/09/2026 08:00\n1,C,Ana,01/09/2026 09:00'), 'g.csv', 'geolocation');
    expect(new Set(parsed.visits.map(v => v.key)).size).toBe(2);
    expect(JSON.parse(parsed.visits[0].key)).toEqual(['1', 'ana', 'CSV', 2]);
  });
});

describe('combineTracking', () => {
  it('copies report data onto the matching visit, ignoring accents and case', () => {
    const result = combineTracking([report({ customer: 'CLIENTÉ', branch: 'Centro', address: 'Calle 1', status: 'Cerrado', serialNumber: 'ABC' })], [visit({ customer: 'cliente' })]);
    expect(result.visits[0]).toMatchObject({ matchedReport: true, branch: 'Centro', address: 'Calle 1', status: 'Cerrado', serialNumber: 'ABC' });
    expect(result.warnings).toEqual([]);
  });
  it('matches reports without technician to any visit technician', () => {
    expect(combineTracking([report({ technician: '' })], [visit({ technician: 'Luis' })]).matchedVisits).toBe(1);
  });
  it('flags conflicting serials instead of joining', () => {
    const result = combineTracking([report({ serialNumber: 'A' })], [visit({ serialNumber: 'B' })]);
    expect(result.visits[0].matchedReport).toBe(false);
    expect(result.visits[0].issues).toContain('Series distintas entre informe y geolocalización');
    expect(result.unmatchedReports).toBe(1);
  });
  it('flags ambiguous matches and warns about unmatched visits and reports', () => {
    const ambiguous = combineTracking([report(), report({ address: 'X' })], [visit()]);
    expect(ambiguous.visits[0].issues).toContain('I.S. ambiguo en detalle de informes');
    expect(ambiguous.warnings).toHaveLength(2);
    expect(combineTracking([report({ reportId: '9' })], [visit()]).warnings).toEqual([expect.stringContaining('1 marcaciones'), expect.stringContaining('1 filas')]);
  });
  it('keeps the visit serial when the report has none', () => {
    expect(combineTracking([report()], [visit({ serialNumber: 'Z' })]).visits[0].serialNumber).toBe('Z');
  });
});
