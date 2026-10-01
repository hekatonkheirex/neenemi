import ExcelJS from 'exceljs';
import { describe, expect, it } from 'vitest';
import { buildTravelWorkbook } from './export';
import { TRAVEL_SOURCE_OPERATIONAL_FIELDS } from './source-operational';
import type { TravelTrip } from './types';

const trip: TravelTrip = {
  id: 'trip-1',
  recordedAt: '2026-08-12',
  serviceNumber: 'IS-100',
  customerName: 'Cliente de prueba',
  destination: 'Encarnación',
  transport: 'MOVIL DATA',
  technician: 'Técnico Uno',
  driver: 'Chofer Uno',
  advance: 100000,
  allowance: 200000,
  lodging: 300000,
  tolls: 40000,
  otherCost: 5000,
  vehiclePayment: 60000,
  technicianPayment: 70000,
  distanceKm: 370,
  fuelCost: 450000,
  notes: 'Nota',
  totalCost: 1225000,
  status: 'pending',
  source: 'xlsx',
  sourceFileName: 'CONTROL DE VIATICO 2026.xlsx',
  sourceSheetName: 'Viajes',
  sourceRowNumber: 12,
  sourceBatchId: null,
  sourceOperational: { mobile: 'Hilux' },
  createdAt: '2026-08-12T00:00:00Z',
  updatedAt: '2026-08-12T00:00:00Z',
};

async function load(trips: TravelTrip[]) {
  const workbook = new ExcelJS.Workbook();
  await workbook.xlsx.load(await buildTravelWorkbook(trips));
  return workbook.getWorksheet('Viajes')!;
}

describe('travel export', () => {
  it('writes a titled header, one row per trip and source traceability', async () => {
    const sheet = await load([trip]);
    const operationalCount = TRAVEL_SOURCE_OPERATIONAL_FIELDS.length;

    expect(sheet.getCell('A1').value).toBe('CONTROL DE VIÁTICOS · EXPORTACIÓN LOCAL');
    expect(sheet.getCell('D2').value).toBe(1);
    expect(sheet.getRow(4).getCell(1).value).toBe('Fecha');
    expect(sheet.getRow(4).getCell(17).value).toBe('Total');
    expect(sheet.getCell('C5').value).toBe('Cliente de prueba');
    expect(sheet.getCell('E5').value).toBe('MÓVIL DATA');
    expect(sheet.getCell('Q5').value).toBe(1225000);
    expect(sheet.getRow(5).getCell(18 + TRAVEL_SOURCE_OPERATIONAL_FIELDS.findIndex((f) => f.key === 'mobile')).value).toBe('Hilux');
    expect(sheet.getRow(5).getCell(18 + operationalCount + 2).value).toBe('CONTROL DE VIATICO 2026.xlsx');
    expect(sheet.getRow(5).getCell(18 + operationalCount + 4).value).toBe(12);
  });

  it('exports an empty list as header only and blanks a missing source row', async () => {
    expect((await load([])).rowCount).toBe(4);
    const sheet = await load([{ ...trip, sourceRowNumber: 0, sourceOperational: undefined }]);
    expect(sheet.getRow(5).getCell(18 + TRAVEL_SOURCE_OPERATIONAL_FIELDS.length + 4).value).toBe('');
    expect(sheet.getRow(5).getCell(18).value).toBe('');
  });
});
