import type { UniflowConfigurationSummary } from './types';

const XLSX_MIME = 'application/vnd.openxmlformats-officedocument.spreadsheetml.sheet';

export async function exportUniflowExcel(
  results: UniflowConfigurationSummary,
  clientName: string,
): Promise<void> {
  const { Workbook } = await import('exceljs');
  const workbook = new Workbook();
  workbook.creator = 'Data Systems Suite';
  const sheet = workbook.addWorksheet('Configuración uniFLOW');

  const titleRow = sheet.addRow(['CONFIGURACIÓN UNIFLOW ONLINE']);
  sheet.addRow(['Cliente / proyecto', clientName.trim() || 'Sin especificar', 'Contrato (meses)', results.months]);
  sheet.addRow(['Fecha', new Date().toISOString().slice(0, 10), 'Vigencia', 'Licencia mensual por dispositivo']);
  sheet.addRow([]);
  const devicesTitleRow = sheet.addRow(['Dispositivos seleccionados']);
  const devicesHeaderRow = sheet.addRow(['Modelo', 'Tipo', 'Color', 'Cantidad', 'CIP']);
  results.addedDevices.forEach((device) => {
    sheet.addRow([device.modelName, device.type, device.color, device.quantity, device.withCIP ? 'Sí' : 'No']);
  });
  sheet.addRow([]);
  const licensesTitleRow = sheet.addRow(['Licencias calculadas']);
  const licensesHeaderRow = sheet.addRow(['Código', 'Descripción', 'Cantidad', 'Precio unitario USD / mes', 'Total USD / mes']);
  addLicenseRow(sheet, results.t1SKU, 'UFO CPS T1 · Base', results.t1TotalQty, results.t1TotalCost);
  addLicenseRow(sheet, results.t2SKU, 'UFO CPS T2 · Base', results.t2TotalQty, results.t2TotalCost);
  addLicenseRow(sheet, results.t1CIPSKU, 'UFO CIP T1 · Escaneo avanzado', results.t1CIPQty, results.t1CIPTotalCost);
  addLicenseRow(sheet, results.t2CIPSKU, 'UFO CIP T2 · Escaneo avanzado', results.t2CIPQty, results.t2CIPTotalCost);
  sheet.addRow([]);
  sheet.addRow(['', '', '', 'Total mensual', results.monthlyTotal]);
  sheet.addRow(['', '', '', 'Total anual', results.annualTotal]);
  sheet.addRow(['', '', '', `Total contrato (${results.months} meses)`, results.contractTotal]);

  [titleRow, devicesTitleRow, devicesHeaderRow, licensesTitleRow, licensesHeaderRow].forEach(styleHeader);
  sheet.getColumn(1).width = 30;
  sheet.getColumn(2).width = 34;
  sheet.getColumn(3).width = 18;
  sheet.getColumn(4).width = 24;
  sheet.getColumn(5).width = 20;
  sheet.getColumn(4).numFmt = '#,##0';
  sheet.getColumn(5).numFmt = '$#,##0.00';

  const buffer = await workbook.xlsx.writeBuffer();
  download(buffer, `configuracion-uniflow-${sanitizeFilenamePart(clientName)}-${dateStamp()}.xlsx`);
}

function addLicenseRow(
  sheet: { addRow: (values: unknown[]) => unknown },
  sku: { sku: string; label: string; price: number } | null,
  description: string,
  quantity: number,
  total: number,
): void {
  if (!sku || quantity <= 0) return;
  sheet.addRow([sku.sku, `${description} · Tier ${sku.label}`, quantity, sku.price, total]);
}

function styleHeader(row: { font: unknown; fill: unknown }): void {
  row.font = { bold: true, color: { argb: 'FFFFFFFF' } };
  row.fill = { type: 'pattern', pattern: 'solid', fgColor: { argb: '2456A6' } };
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

function sanitizeFilenamePart(value: string): string {
  return value.trim().replace(/[\\/:*?"<>|]+/g, '').replace(/\s+/g, '_') || 'cliente';
}

function dateStamp(): string {
  return new Date().toISOString().slice(0, 10);
}
