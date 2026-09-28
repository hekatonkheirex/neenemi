import ExcelJS from 'exceljs';
import { describe, expect, it } from 'vitest';
import { parseTravelWorkbook } from './parser';

type XlsxCell = string | number | Date | undefined;

async function makeWorkbook(): Promise<Uint8Array> {
  const workbook = new ExcelJS.Workbook();
  const travel = workbook.addWorksheet('VIAJES2026');
  travel.addRow([
    'Cant', 'Fecha', 'I.S.', 'Cliente', 'Destino', 'Medio', 'Técnicos', 'Chofer asignado',
    'Monto', 'Viático', 'Hospedaje', 'Peajes', 'Varios', 'Pago por uso de vehículo',
    'Pago a técnicos y chofer', 'Costo por Servicio', 'Km aproximado realizado', 'Movil',
    'Promedio de Consumo x 100km', 'Costos x Lts', 'Costo Combustible por servicio', 'Costo por Servicio',
    'Gasto total', 'Total Costo Serv', 'Total Costo Comb', 'C.A. COSTO POR SERVICIOS',
  ] satisfies XlsxCell[]);
  travel.addRow([
    1, new Date('2026-08-04T12:00:00Z'), 'IS-100', 'Cliente Viajes', 'CDE', 'MOVIL PROPIO',
    'Tec Uno', 'S/CHOFER', 300000, 130000, 0, 146000, 0, 60000, 90000, 223125, 320, 'PROPIO', 10, 8260, 80000, 359002, 506000, 400000, 106000, 359002,
  ] satisfies XlsxCell[]);
  travel.addRow(['SERVICIOS', 3, 0, 0, 0, 0, 0, 0, 0, 0, 0, 0, 0]);
  travel.addRow(['VIAJE TOTAL', 1, 0, 0, 0, 0, 0, 0, 0, 0, 0, 0, 0, 0, 0, 0, 0, 320, 80000, 60000, 90000, 400000, 506000, 506000, 506000]);

  const calculation = workbook.addWorksheet('CALCULO AUX');
  calculation.addRow(['Viático', '', '', 150000]);
  calculation.addRow(['Hotel', '', '', 210000]);
  calculation.addRow(['Peajes a CDE']);
  calculation.addRow(['Ypacaraí', 'Nueva Londres', 'Total']);
  calculation.addRow([10000, 20000, 30000]);

  const bus = workbook.addWorksheet('PASAJES EN BUS');
  bus.addRow(['Ciudad', 'Empresa', '', 'Pasaje Ida', 'Pasaje Vuelta']);
  bus.addRow(['CDE', 'Empresa Demo', '', 110000, 110000]);

  return new Uint8Array(await workbook.xlsx.writeBuffer());
}

async function makeMergedTollWorkbook(): Promise<Uint8Array> {
  const workbook = new ExcelJS.Workbook();
  const travel = workbook.addWorksheet('VIAJES2026');
  travel.addRow(['Cant', 'Fecha', 'Cliente', 'Destino']);
  travel.addRow([1, new Date('2026-08-04T12:00:00Z'), 'Cliente Viajes', 'PJC']);

  const calculation = workbook.addWorksheet('CALCULO AUX');
  calculation.getCell('Q1').value = 'PEAJES A PJC';
  calculation.mergeCells('Q1:T1');
  calculation.getRow(2).values = [
    '', '', '', '', '', '', '', '', '', '', '', '', '', '', '', '',
    '25 DE DICIEMBRE', 'EMBOSCADA', 'RIO VERDE', 'TOTAL',
  ];
  calculation.getRow(3).values = ['', '', '', '', '', '', '', '', '', '', '', '', '', '', '', '', 10000, 10000, 10000, 60000];

  calculation.getCell('K5').value = 'PEAJES A PAKURI';
  calculation.mergeCells('K5:N5');
  calculation.getRow(6).values = ['', '', '', '', '', '', '', '', '', '', 'YPACARAI', 'NUEVA LONDRES', '', 'TOTAL'];
  calculation.getRow(7).values = ['', '', '', '', '', '', '', '', '', '', 15000, 15000, '', 60000];

  return new Uint8Array(await workbook.xlsx.writeBuffer());
}

describe('parseTravelWorkbook', () => {
  it('imports the main travel sheet, cost references and annual summary', async () => {
    const parsed = await parseTravelWorkbook(await makeWorkbook(), 'CONTROL DE VIATICO 2026.xlsx');

    expect(parsed.primarySheetName).toBe('VIAJES2026');
    expect(parsed.sourceYear).toBe(2026);
    expect(parsed.sourceSheetNames).toEqual(['VIAJES2026', 'CALCULO AUX', 'PASAJES EN BUS']);
    expect(parsed.trips).toEqual([expect.objectContaining({
      recordedAt: '2026-08-04',
      serviceNumber: 'IS-100',
      customerName: 'Cliente Viajes',
      destination: 'CDE',
      transport: 'MOVIL PROPIO',
      allowance: 130000,
      tolls: 146000,
      sourceOperational: {
        serviceCostBase: '223125',
        mobile: 'PROPIO',
        averageConsumptionPer100Km: '10',
        fuelCostPerLiter: '8260',
        serviceCostCalculated: '359002',
        totalServiceCost: '400000',
        totalFuelCost: '106000',
        serviceCostAllocation: '359002',
      },
      totalCost: 506000,
      sourceSheetName: 'VIAJES2026',
      sourceRecordKey: '2026-08-04|is-100|cliente viajes|cde|movil propio',
    })]);
    expect(parsed.costCatalog.dailyAllowance).toBe(150000);
    expect(parsed.costCatalog.hotelPerNight).toBe(210000);
    expect(parsed.costCatalog.tollRoutes).toEqual([
      expect.objectContaining({ route: 'CDE', total: 30000 }),
    ]);
    expect(parsed.costCatalog.busFares).toEqual([
      expect.objectContaining({ destination: 'CDE', outbound: 110000, returnFare: 110000 }),
    ]);
    expect(parsed.historical).toEqual(expect.arrayContaining([
      expect.objectContaining({ year: 2026, partial: true, services: 3, trips: 1 }),
    ]));
  });

  it('keeps all checkpoints and the route total when the source uses merged headers', async () => {
    const parsed = await parseTravelWorkbook(await makeMergedTollWorkbook(), 'CONTROL DE VIATICO 2026.xlsx');

    expect(parsed.costCatalog.tollRoutes).toEqual([
      expect.objectContaining({
        route: 'PJC',
        checkpoints: ['25 DE DICIEMBRE', 'EMBOSCADA', 'RIO VERDE'],
        total: 60000,
      }),
      expect.objectContaining({
        route: 'PAKURI',
        checkpoints: ['YPACARAI', 'NUEVA LONDRES'],
        total: 60000,
      }),
    ]);
  });
});
