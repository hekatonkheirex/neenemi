import ExcelJS from 'exceljs';
import { describe, expect, it } from 'vitest';
import { DEFAULT_TRAVEL_COST_CATALOG } from './catalog';
import { createTravelIdentityKey, createTravelRecordKey, parseTravelWorkbook } from './parser';

type Cell = string | number | Date | null | undefined;
type Sheets = Record<string, Cell[][]>;

async function build(sheets: Sheets): Promise<Uint8Array> {
  const workbook = new ExcelJS.Workbook();
  for (const [name, rows] of Object.entries(sheets)) {
    const sheet = workbook.addWorksheet(name);
    rows.forEach(row => sheet.addRow(row));
  }
  return new Uint8Array(await workbook.xlsx.writeBuffer());
}

const HEADER: Cell[] = ['Cant', 'Fecha', 'I.S.', 'Cliente', 'Destino', 'Medio', 'Viático', 'Hospedaje', 'Peajes', 'Varios', 'Pago por uso de vehículo', 'Pago a técnicos y chofer', 'Costo Combustible por servicio', 'Gasto total'];
const parseRows = async (rows: Cell[][], fileName = 'VIATICOS 2026.xlsx') => parseTravelWorkbook(await build({ Viajes: [HEADER, ...rows] }), fileName);
const row = (overrides: Record<number, Cell> = {}): Cell[] => {
  const base: Cell[] = [1, '2026-03-02', 'IS-1', 'Cliente', 'CDE', 'BUS', 0, 0, 0, 0, 0, 0, 0, 0];
  Object.entries(overrides).forEach(([index, value]) => { base[Number(index)] = value; });
  return base;
};

describe('parseTravelWorkbook errors', () => {
  it('requires the Cant/Fecha header row', async () => {
    await expect(parseTravelWorkbook(await build({ Viajes: [['A', 'B'], [1, 2]] }), 'x.xlsx')).rejects.toThrow('Cant / Fecha');
  });
  it('requires date, customer and destination columns', async () => {
    await expect(parseTravelWorkbook(await build({ Viajes: [['Cant', 'Fecha', 'Cliente'], [1, '2026-01-01', 'C']] }), 'x.xlsx')).rejects.toThrow('Fecha, Cliente y Destino');
  });
  it('fails when no row has a valid date', async () => {
    await expect(parseRows([row({ 1: 'sin fecha' })])).rejects.toThrow('registros de viaje con fecha');
  });
});

describe('parseTravelWorkbook trip rows', () => {
  it('prefers a sheet whose name contains "viajes" over the first sheet', async () => {
    const parsed = await parseTravelWorkbook(await build({ Otra: [['x']], 'Control Viajes 2025': [HEADER, row()] }), 'x.xlsx');
    expect(parsed.primarySheetName).toBe('Control Viajes 2025');
    expect(parsed.sourceYear).toBe(2025);
  });
  it('skips summary rows and rows without Cant, and reports the 1-based source row', async () => {
    const parsed = await parseRows([row({ 0: '' }), row({ 2: 'IS-2' }), ['SERVICIOS', 5], ['VIAJE TOTAL', 1]]);
    expect(parsed.trips).toHaveLength(1);
    expect(parsed.trips[0]).toMatchObject({ serviceNumber: 'IS-2', sourceRow: 3 });
  });
  it.each([
    ['BUS interurbano', 'BUS'],
    ['Móvil Propio', 'MOVIL PROPIO'],
    ['movil rentado', 'MOVIL RENTADO'],
    ['MOVIL DATA', 'MOVIL DATA'],
    ['', 'MOVIL DATA'],
  ])('maps transport %j to %s', async (value, expected) => {
    expect((await parseRows([row({ 5: value })])).trips[0].transport).toBe(expected);
  });
  it('parses ISO, dd/mm/yyyy, Excel serial and day-month dates (using the file year as fallback)', async () => {
    const parsed = await parseRows([
      row({ 1: '2026-3-2', 2: 'a' }),
      row({ 1: '05/04/2026', 2: 'b' }),
      row({ 1: 46000, 2: 'c' }),
      row({ 1: '7-ago', 2: 'd' }),
      row({ 1: '3 Dic', 2: 'e' }),
      row({ 1: '9-xyz', 2: 'f' }),
    ], 'VIATICOS 2024.xlsx');
    expect(parsed.trips.map(t => t.recordedAt)).toEqual(['2026-03-02', '2026-04-05', '2025-12-09', '2024-08-07', '2024-12-03']);
  });
  it.each([
    [1250000, 1250000],
    ['1.250.000', 1250000],
    ['Gs. 1.234,56', 1234.56],
    ['1,234.56', 1234.56],
    ['1,234', 1234],
    ['12,5', 12.5],
    ['abc', 0],
    [Number.NaN, 0],
  ])('reads amount %j as %d', async (value, expected) => {
    expect((await parseRows([row({ 6: value })])).trips[0].allowance).toBe(expected);
  });
  it('uses the sheet total when present and otherwise sums the cost columns', async () => {
    const parsed = await parseRows([
      row({ 2: 'a', 6: 100, 7: 200, 8: 30, 9: 4, 10: 5, 11: 6, 12: 7, 13: 999 }),
      row({ 2: 'b', 6: 100, 7: 200, 8: 30, 9: 4, 10: 5, 11: 6, 12: 7, 13: null }),
    ]);
    expect(parsed.trips.map(t => t.totalCost)).toEqual([999, 352]);
  });
  it('omits sourceOperational when the sheet has no operational columns or values', async () => {
    expect((await parseRows([row()])).trips[0]).not.toHaveProperty('sourceOperational');
  });
});

describe('record keys', () => {
  const base = { recordedAt: '2026-03-02', serviceNumber: 'IS-1', customerName: 'Ñandú  Ltda', destination: 'Asunción', transport: 'BUS' as const };
  it('normalizes accents, case and whitespace', () => {
    expect(createTravelRecordKey(base)).toBe('2026-03-02|is-1|nandu ltda|asuncion|bus');
    expect(createTravelRecordKey({ ...base, customerName: 'NANDU LTDA', destination: 'ASUNCION' })).toBe(createTravelRecordKey(base));
  });
  it('identity key ignores the destination', () => {
    expect(createTravelIdentityKey({ ...base, destination: 'Otra' })).toBe(createTravelIdentityKey(base));
    expect(createTravelIdentityKey(base)).toBe('2026-03-02|is-1|nandu ltda|bus');
  });
});

describe('cost catalog and historical extraction', () => {
  it('falls back to the default catalog when the auxiliary sheets are missing', async () => {
    const parsed = await parseRows([row()]);
    expect(parsed.costCatalog).toEqual(DEFAULT_TRAVEL_COST_CATALOG);
  });
  it('groups bus fares by destination, takes the cheapest and joins companies', async () => {
    const parsed = await parseTravelWorkbook(await build({
      Viajes: [HEADER, row()],
      'Pasajes en bus': [
        ['Ciudad', 'Empresa', '', 'Pasaje Ida', 'Pasaje Vuelta'],
        ['Encarnación (centro)', 'A', '', 120000, 100000],
        ['ENCARNACION', 'B', '', 90000, null],
        ['Sin tarifa', 'C', '', null, null],
        ['', 'D', '', 1, 1],
      ],
    }), 'x.xlsx');
    expect(parsed.costCatalog.busFares).toEqual([expect.objectContaining({ destination: 'Encarnación (centro)', outbound: 90000, returnFare: 100000, company: 'A / B' })]);
    expect(parsed.costCatalog.source).toBe('Pasajes en bus');
  });
  it('skips toll routes without checkpoints values or a positive total', async () => {
    const parsed = await parseTravelWorkbook(await build({
      Viajes: [HEADER, row()],
      'Calculo aux': [['Peajes a X'], ['A', 'B', 'Total'], [0, 0, 0], ['Peajes a Y'], ['A', 'Total'], [5000, '']],
    }), 'x.xlsx');
    expect(parsed.costCatalog.tollRoutes).toEqual([expect.objectContaining({ route: 'Y', total: 5000, checkpoints: ['A'] })]);
  });
  it('keeps default historical summaries when no summary sheets exist and overrides 2026 from Viajes2026', async () => {
    expect((await parseRows([row()])).historical.every(summary => summary.year > 0)).toBe(true);
    const month = (n: number) => Array.from({ length: 12 }, () => n);
    const parsed = await parseTravelWorkbook(await build({
      Viajes2026: [HEADER, row(), ['Servicios', ...month(2)], ['Viaje total', ...month(1), 0, 0, 0, 0, 0, 100, 200]],
    }), 'x.xlsx');
    const current = parsed.historical.find(summary => summary.year === 2026)!;
    expect(current).toMatchObject({ partial: true, services: 24, trips: 12 });
    expect(current.monthlyServices).toHaveLength(12);
  });
});
