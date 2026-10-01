import { normalizeSerial } from '../consumibles/analysis';
import { findHeaderIndex, readWorkbookSheets, type WorkbookSheetRows } from '../consumibles/xlsx-helpers';
import type { Coordinate, TrackingReport, TrackingVisit } from './types';

export function normalizeIdentity(value: string): string {
  return value.normalize('NFD').replace(/[\u0300-\u036f]/g, '').toLowerCase().replace(/\s+/g, ' ').trim();
}

const MISSING_SERIALS: Record<string, true> = { '-': true, 'N/A': true, 'S/N': true, 'SIN SERIE': true, 'SIN NUMERO DE SERIE': true };
export function normalizeTrackingSerial(value: unknown): string {
  const serial = normalizeSerial(String(value ?? '').replace(/^'+/, ''));
  return MISSING_SERIALS[serial] ? '' : serial;
}

export function parseTimestamp(value: unknown): string | null {
  if (value instanceof Date) return Number.isFinite(value.getTime()) ? value.toISOString().slice(0, 19) : null;
  const text = String(value ?? '').trim();
  const iso = text.match(/^(\d{4})-(\d{2})-(\d{2})[ T](\d{2}):(\d{2})(?::(\d{2})(?:\.\d+)?)?$/);
  const local = text.match(/^(\d{2})\/(\d{2})\/(\d{4}) (\d{2}):(\d{2})(?::(\d{2}))?$/);
  const parts = iso ? [iso[1], iso[2], iso[3], iso[4], iso[5], iso[6] ?? '00'] : local ? [local[3], local[2], local[1], local[4], local[5], local[6] ?? '00'] : null;
  if (!parts) return null;
  const [year, month, day, hour, minute, second] = parts.map(Number);
  const date = new Date(Date.UTC(year, month - 1, day, hour, minute, second));
  if (year < 1900 || year > 2200 || date.getUTCFullYear() !== year || date.getUTCMonth() !== month - 1 || date.getUTCDate() !== day || hour > 23 || minute > 59 || second > 59) return null;
  return `${parts[0]}-${parts[1]}-${parts[2]}T${parts[3]}:${parts[4]}:${parts[5]}`;
}

function parseCoordinate(value: string): Coordinate | null {
  const match = value.trim().replace(/^'+/, '').match(/^(-?\d+(?:\.\d+)?)\s*,\s*(-?\d+(?:\.\d+)?)$/);
  if (!match) return null;
  const latitude = Number(match[1]);
  const longitude = Number(match[2]);
  return Math.abs(latitude) <= 90 && Math.abs(longitude) <= 180 ? { latitude, longitude } : null;
}

function parseCsv(content: string): string[][] {
  const text = content.replace(/^\uFEFF/, '');
  const header = text.split(/\r?\n/, 1)[0] ?? '';
  const separator = (header.match(/;/g)?.length ?? 0) > (header.match(/,/g)?.length ?? 0) ? ';' : ',';
  const rows: string[][] = [];
  let row: string[] = [];
  let cell = '';
  let quoted = false;
  for (let index = 0; index < text.length; index += 1) {
    const character = text[index];
    if (character === '"') {
      if (quoted && text[index + 1] === '"') { cell += '"'; index += 1; }
      else quoted = !quoted;
    } else if (character === separator && !quoted) {
      row.push(cell); cell = '';
    } else if ((character === '\n' || character === '\r') && !quoted) {
      if (character === '\r' && text[index + 1] === '\n') index += 1;
      row.push(cell); rows.push(row); row = []; cell = '';
    } else cell += character;
  }
  if (quoted) throw new Error('El CSV tiene un campo entre comillas sin cerrar.');
  if (cell !== '' || row.length) { row.push(cell); rows.push(row); }
  return rows;
}

export async function parseTrackingFile(data: Uint8Array, fileName: string, kind: 'reports' | 'geolocation') {
  const lower = fileName.toLowerCase();
  const sourceSheets: WorkbookSheetRows[] = lower.endsWith('.csv')
    ? [{ name: 'CSV', rows: parseCsv(new TextDecoder('utf-8', { fatal: true }).decode(data)) }]
    : lower.endsWith('.xlsx') ? await readWorkbookSheets(data) : (() => { throw new Error('Selecciona un archivo CSV o XLSX.'); })();
  const reports: TrackingReport[] = [];
  const visits: TrackingVisit[] = [];
  const warnings: string[] = [];
  for (const sheet of sourceSheets) {
    const headerIndex = sheet.rows.findIndex((row) => findHeaderIndex(row, ['Nº I.S.', 'N I S', 'N IS', 'Informe de servicio'], -1) >= 0 && findHeaderIndex(row, ['Cliente'], -1) >= 0);
    if (headerIndex < 0) { warnings.push(`Hoja ${sheet.name}: no contiene encabezados de I.S. y cliente.`); continue; }
    const headers = sheet.rows[headerIndex];
    const columns = {
      reportId: findHeaderIndex(headers, ['Nº I.S.', 'N I S', 'N IS', 'Informe de servicio'], -1),
      customer: findHeaderIndex(headers, ['Cliente'], -1), technician: findHeaderIndex(headers, ['Técnico', 'Tecnicos', 'Responsable'], -1),
      branch: findHeaderIndex(headers, ['Sucursal', 'Sede'], -1), address: findHeaderIndex(headers, ['Dirección', 'Domicilio', 'Dir/Tel'], -1),
      headquartersAddress: findHeaderIndex(headers, ['Dirección Casa Matriz', 'Domicilio Casa Matriz', 'Dirección Matriz', 'Dirección de Casa Matriz'], -1),
      serialNumber: findHeaderIndex(headers, ['Nº de serie', 'N Serie', 'Nro Serie', 'Número de serie', 'Serial', 'Serial Number', 'serialNumber', 'Serie'], -1),
      requestedService: findHeaderIndex(headers, ['Servicio solicitado', 'Descripción del problema'], -1), status: findHeaderIndex(headers, ['Estado'], -1),
      scheduledAt: findHeaderIndex(headers, ['Fecha I.S.', 'Fecha'], -1), serviceType: findHeaderIndex(headers, ['Tipo Servicio'], -1),
      checkIn: findHeaderIndex(headers, ['TS check-in', 'Check-in'], -1), checkOut: findHeaderIndex(headers, ['TS check-out', 'Check-out'], -1),
      // The spaces in GPS IN denote flags; underscores denote coordinate fields in SGS.
      gpsIn: headers.findIndex(h => String(h).trim().toUpperCase() === 'GPS_IN'),
      gpsOut: headers.findIndex(h => String(h).trim().toUpperCase() === 'GPS_OUT'),
    };
    if (columns.technician < 0 || kind === 'geolocation' && columns.checkIn < 0 && columns.checkOut < 0) throw new Error(`Hoja ${sheet.name}: faltan técnico o columnas de marcación.`);
    for (let index = headerIndex + 1; index < sheet.rows.length; index += 1) {
      const row = sheet.rows[index];
      if (row.every(value => String(value ?? '').trim() === '')) continue;
      const reportId = String(row[columns.reportId] ?? '').trim();
      const customer = String(row[columns.customer] ?? '').trim();
      if (!reportId || !customer) throw new Error(`Hoja ${sheet.name}, fila ${index + 1}: falta I.S. o cliente.`);
      const report: TrackingReport = {
        reportId, customer, technician: String(row[columns.technician] ?? '').trim(), branch: String(row[columns.branch] ?? '').trim(),
        address: String(row[columns.address] ?? '').trim() || (!String(row[columns.branch] ?? '').trim() ? String(row[columns.headquartersAddress] ?? '').trim() : ''),
        serialNumber: normalizeTrackingSerial(row[columns.serialNumber]),
        requestedService: String(row[columns.requestedService] ?? '').trim(), status: String(row[columns.status] ?? '').trim(), scheduledAt: parseTimestamp(row[columns.scheduledAt]), sourceSheet: sheet.name, sourceRow: index + 1,
      };
      if (kind === 'reports') { reports.push(report); continue; }
      const checkIn = parseTimestamp(row[columns.checkIn]);
      const checkOut = parseTimestamp(row[columns.checkOut]);
      const gpsInText = String(row[columns.gpsIn] ?? '').trim();
      const gpsOutText = String(row[columns.gpsOut] ?? '').trim();
      const gpsIn = parseCoordinate(gpsInText);
      const gpsOut = parseCoordinate(gpsOutText);
      const issues: string[] = [];
      if (row[columns.checkIn] && !checkIn) issues.push('Check-in inválido');
      if (row[columns.checkOut] && !checkOut) issues.push('Check-out inválido');
      if (gpsInText && !gpsIn) issues.push('GPS de entrada inválido');
      if (gpsOutText && !gpsOut) issues.push('GPS de salida inválido');
      if (!report.technician) issues.push('Sin técnico');
      if (checkIn && checkOut && checkOut < checkIn) issues.push('Check-out anterior al check-in');
      visits.push({ ...report, key: JSON.stringify([reportId, normalizeIdentity(report.technician), sheet.name, index + 1]), serviceType: String(row[columns.serviceType] ?? '').trim(), checkIn, checkOut, gpsIn, gpsOut, matchedReport: false, issues });
    }
  }
  if (!(kind === 'reports' ? reports.length : visits.length)) throw new Error('El archivo no contiene registros utilizables.');
  const invalid = visits.filter(v => v.issues.length).length;
  if (invalid) warnings.push(`${invalid} registros tienen campos inválidos o inconsistentes; consulta el detalle de la visita.`);
  return { reports, visits, warnings, sourceSheets };
}

export function combineTracking(reports: TrackingReport[], originalVisits: TrackingVisit[]) {
  const byId = new Map<string, TrackingReport[]>();
  for (const report of reports) {
    const entries = byId.get(report.reportId) ?? [];
    entries.push(report); byId.set(report.reportId, entries);
  }
  const matched = new Set<TrackingReport>();
  const visits = originalVisits.map(visit => {
    const candidates = (byId.get(visit.reportId) ?? []).filter(report => normalizeIdentity(report.customer) === normalizeIdentity(visit.customer) && (!report.technician || normalizeIdentity(report.technician) === normalizeIdentity(visit.technician)));
    if (candidates.length !== 1) return { ...visit, issues: candidates.length > 1 ? [...visit.issues, 'I.S. ambiguo en detalle de informes'] : visit.issues };
    const report = candidates[0];
    if (report.serialNumber && visit.serialNumber && report.serialNumber !== visit.serialNumber) return { ...visit, issues: [...visit.issues, 'Series distintas entre informe y geolocalización'] };
    matched.add(report);
    return { ...visit, serialNumber: report.serialNumber || visit.serialNumber, branch: report.branch || visit.branch, address: report.address || visit.address, requestedService: report.requestedService || visit.requestedService, status: report.status, matchedReport: true };
  });
  const matchedVisits = visits.filter(v => v.matchedReport).length;
  const unmatchedReports = reports.length - matched.size;
  const warnings: string[] = [];
  if (matchedVisits < visits.length) warnings.push(`${visits.length - matchedVisits} marcaciones no tienen un informe único coincidente por Nº I.S., técnico y cliente; se conserva su detalle de geolocalización.`);
  if (unmatchedReports) warnings.push(`${unmatchedReports} filas de informes no tienen marcaciones vinculadas.`);
  return { reports, visits, warnings, matchedVisits, unmatchedReports };
}
