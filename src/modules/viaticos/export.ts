import type { TravelTrip } from './types';
import { TRAVEL_SOURCE_OPERATIONAL_FIELDS } from './source-operational';

const XLSX_MIME = 'application/vnd.openxmlformats-officedocument.spreadsheetml.sheet';

export async function buildTravelWorkbook(trips: readonly TravelTrip[]) {
  const { Workbook } = await import('exceljs');
  const workbook = new Workbook();
  workbook.creator = 'DCSS Suite';
  const sheet = workbook.addWorksheet('Viajes');
  sheet.addRow(['CONTROL DE VIÁTICOS · EXPORTACIÓN LOCAL']);
  sheet.addRow(['Generado', new Date().toISOString().slice(0, 10), 'Registros', trips.length]);
  sheet.addRow([]);
  sheet.addRow([
    'Fecha', 'I.S.', 'Cliente', 'Destino', 'Medio', 'Técnico', 'Chofer', 'Anticipo',
    'Viático', 'Hospedaje', 'Peajes', 'Varios', 'Uso de vehículo', 'Técnico / chofer',
    'Kilómetros', 'Combustible', 'Total', ...TRAVEL_SOURCE_OPERATIONAL_FIELDS.map(({ label }) => label),
    'Estado', 'Notas', 'Fuente', 'Hoja', 'Fila',
  ]);
  trips.forEach((trip) => {
    sheet.addRow([
      trip.recordedAt,
      trip.serviceNumber,
      trip.customerName,
      trip.destination,
      trip.transport.replace('MOVIL ', 'MÓVIL '),
      trip.technician,
      trip.driver,
      trip.advance,
      trip.allowance,
      trip.lodging,
      trip.tolls,
      trip.otherCost,
      trip.vehiclePayment,
      trip.technicianPayment,
      trip.distanceKm,
      trip.fuelCost,
      trip.totalCost,
      ...TRAVEL_SOURCE_OPERATIONAL_FIELDS.map(({ key }) => trip.sourceOperational?.[key] ?? ''),
      trip.status,
      trip.notes,
      trip.sourceFileName,
      trip.sourceSheetName,
      trip.sourceRowNumber || '',
    ]);
  });

  const titleRow = sheet.getRow(1);
  const headerRow = sheet.getRow(4);
  [titleRow, headerRow].forEach((row) => {
    row.font = { bold: true, color: { argb: 'FFFFFFFF' } };
    row.fill = { type: 'pattern', pattern: 'solid', fgColor: { argb: '1A2C4C' } };
  });
  sheet.getColumn(1).width = 14;
  sheet.getColumn(2).width = 14;
  sheet.getColumn(3).width = 32;
  sheet.getColumn(4).width = 20;
  sheet.getColumn(5).width = 18;
  sheet.getColumn(6).width = 22;
  sheet.getColumn(7).width = 18;
  for (let index = 8; index <= 17; index += 1) sheet.getColumn(index).width = 16;
  for (let index = 18; index <= 25; index += 1) sheet.getColumn(index).width = 20;
  sheet.getColumn(26).width = 14;
  sheet.getColumn(27).width = 32;
  sheet.getColumn(28).width = 30;
  sheet.getColumn(29).width = 20;
  sheet.getColumn(30).width = 10;
  for (let index = 8; index <= 13; index += 1) sheet.getColumn(index).numFmt = '#,##0';
  sheet.getColumn(14).numFmt = '#,##0';
  sheet.getColumn(16).numFmt = '#,##0';
  sheet.getColumn(17).numFmt = '#,##0';
  sheet.views = [{ state: 'frozen', ySplit: 4 }];

  return workbook.xlsx.writeBuffer();
}

export async function exportTravelTrips(trips: readonly TravelTrip[]): Promise<void> {
  const buffer = await buildTravelWorkbook(trips);
  download(buffer, `control-viaticos-${new Date().toISOString().slice(0, 10)}.xlsx`);
}

function download(buffer: unknown, fileName: string): void {
  const blob = new Blob([buffer as BlobPart], { type: XLSX_MIME });
  const url = URL.createObjectURL(blob);
  const anchor = document.createElement('a');
  anchor.href = url;
  anchor.download = fileName;
  anchor.click();
  URL.revokeObjectURL(url);
}
