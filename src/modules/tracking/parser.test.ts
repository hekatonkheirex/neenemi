import { describe, expect, it } from 'vitest';
import { combineTracking, normalizeIdentity, normalizeTrackingSerial, parseTimestamp, parseTrackingFile } from './parser';

const bytes = (value: string) => new TextEncoder().encode(value);
const GEO_HEADER = 'Nº I.S.,Cliente,Técnico,TS check-in,TS check-out,GPS_IN,GPS_OUT';

describe('tracking identity and serial normalization', () => {
  it('ignores accents, case and repeated spaces in identities', () => {
    expect(normalizeIdentity('  JOSÉ   Núñez ')).toBe('jose nunez');
  });

  it('uppercases serials, drops a leading apostrophe and treats placeholders as missing', () => {
    expect(normalizeTrackingSerial("'00ab12")).toBe('00AB12');
    for (const label of ['N/A', 'n/a', 'Sin serie', 'S/N', '-', '', null, undefined]) {
      expect(normalizeTrackingSerial(label)).toBe('');
    }
  });
});

describe('tracking timestamps', () => {
  it('accepts ISO and SGS local formats as literal local time', () => {
    expect(parseTimestamp('2026-09-01 08:05')).toBe('2026-09-01T08:05:00');
    expect(parseTimestamp('2026-09-01T08:05:09.123')).toBe('2026-09-01T08:05:09');
    expect(parseTimestamp('01/09/2026 08:05:09')).toBe('2026-09-01T08:05:09');
    expect(parseTimestamp(new Date('2026-09-01T08:00:00Z'))).toBe('2026-09-01T08:00:00');
  });

  it('rejects impossible dates, times and years instead of rolling them over', () => {
    for (const value of ['31/02/2026 08:00', '2026-13-01 08:00', '01/09/2026 24:00', '01/09/2026 08:60', '01/09/1800 08:00', 'ayer', '', null, new Date('x')]) {
      expect(parseTimestamp(value)).toBeNull();
    }
  });
});

describe('tracking file parsing', () => {
  it('detects the semicolon separator from the header', async () => {
    const csv = 'Nº I.S.;Cliente;Técnico;TS check-in;TS check-out;GPS_IN;GPS_OUT\n1;Cliente;Ana;01/09/2026 08:00;01/09/2026 09:00;"-25.3,-57.6";"-25.3,-57.6"';
    const parsed = await parseTrackingFile(bytes(csv), 'g.csv', 'geolocation');
    expect(parsed.visits[0]).toMatchObject({ technician: 'Ana', gpsIn: { latitude: -25.3, longitude: -57.6 }, gpsOut: { latitude: -25.3, longitude: -57.6 } });
  });

  it('rejects unsupported extensions, unclosed quotes and non UTF-8 text', async () => {
    await expect(parseTrackingFile(bytes('x'), 'g.txt', 'reports')).rejects.toThrow('CSV o XLSX');
    await expect(parseTrackingFile(bytes(`${GEO_HEADER}\n1,"Cliente,Ana`), 'g.csv', 'geolocation')).rejects.toThrow('sin cerrar');
    await expect(parseTrackingFile(new Uint8Array([0xff, 0xfe, 0x41]), 'g.csv', 'reports')).rejects.toThrow();
  });

  it('fails clearly when headers, technician column or rows are missing', async () => {
    await expect(parseTrackingFile(bytes('A,B\n1,2'), 'g.csv', 'reports')).rejects.toThrow('no contiene registros utilizables');
    await expect(parseTrackingFile(bytes('Nº I.S.,Cliente\n1,Cliente'), 'g.csv', 'reports')).rejects.toThrow('faltan técnico');
    await expect(parseTrackingFile(bytes('Nº I.S.,Cliente,Técnico\n,Cliente,Ana'), 'g.csv', 'reports')).rejects.toThrow('fila 2: falta I.S. o cliente');
    await expect(parseTrackingFile(bytes(`${GEO_HEADER}`), 'g.csv', 'geolocation')).rejects.toThrow('no contiene registros utilizables');
  });

  it('skips blank rows and flags inconsistent marks without dropping the visit', async () => {
    const csv = [
      GEO_HEADER,
      ',,,,,,',
      '1,Cliente,Ana,01/09/2026 10:00,01/09/2026 09:00,"-25,-57",',
      '2,Cliente,,31/02/2026 08:00,,"95,10",',
    ].join('\n');
    const parsed = await parseTrackingFile(bytes(csv), 'g.csv', 'geolocation');
    expect(parsed.visits).toHaveLength(2);
    expect(parsed.visits[0].issues).toEqual(['Check-out anterior al check-in']);
    expect(parsed.visits[1].issues).toEqual(['Check-in inválido', 'GPS de entrada inválido', 'Sin técnico']);
    expect(parsed.visits[1].gpsIn).toBeNull();
    expect(parsed.warnings.some((warning) => warning.startsWith('2 registros'))).toBe(true);
  });

  it('accepts a minimal reports file without warnings', async () => {
    const parsed = await parseTrackingFile(bytes('Nº I.S.,Cliente,Técnico\n1,Cliente,Ana'), 'd.csv', 'reports');
    expect(parsed.reports).toHaveLength(1);
    expect(parsed.warnings).toEqual([]);
  });
});

describe('tracking report matching', () => {
  const report = { reportId: '7', customer: 'Cliente', technician: 'Ana', branch: 'Centro', address: 'Calle 1', serialNumber: 'S1', requestedService: 'Falla', status: '', scheduledAt: null, sourceSheet: 'Detalles', sourceRow: 2 };
  const visit = { ...report, branch: '', address: '', serialNumber: '', requestedService: '', key: 'v', serviceType: '', checkIn: null, checkOut: null, gpsIn: null, gpsOut: null, matchedReport: false, issues: [] as string[] };

  it('counts reports without marks and warns about visits without a unique report', () => {
    const result = combineTracking([report, { ...report, reportId: '8' }], [visit]);
    expect(result.matchedVisits).toBe(1);
    expect(result.unmatchedReports).toBe(1);
    expect(result.visits[0]).toMatchObject({ serialNumber: 'S1', branch: 'Centro', address: 'Calle 1' });
    expect(result.warnings).toEqual(['1 filas de informes no tienen marcaciones vinculadas.']);
    expect(combineTracking([], [visit]).warnings[0]).toContain('1 marcaciones no tienen un informe único');
  });

  it('does not link when both sources name different serials', () => {
    const result = combineTracking([report], [{ ...visit, serialNumber: 'OTRA' }]);
    expect(result.visits[0].matchedReport).toBe(false);
    expect(result.visits[0].issues).toContain('Series distintas entre informe y geolocalización');
  });
});
