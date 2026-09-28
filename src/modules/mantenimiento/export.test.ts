import ExcelJS from 'exceljs';
import { describe, expect, it } from 'vitest';
import { buildMaintenanceWorkbook } from './export';
import type { MaintenanceAnalysis } from './analysis';

const analysis: MaintenanceAnalysis = {
  serialNumber: 'SER-001',
  modelLabel: 'Canon iR ADV DX 527i',
  customerName: 'Cliente de prueba',
  contractReference: 'OV-001',
  periods: [
    {
      period: '2026-08',
      paperType: 'Negro A4',
      copies: 15000,
      counter: 800000,
      appliedWaste: 0.34,
      optimalMonthly: 15000,
      ratio: 1,
      status: 'ATENCIÓN',
      sourceSheetName: 'Contadores',
      sourceRowNumber: 12,
      sourceDetails: [{ label: 'Sucursal', value: 'Asunción' }],
    },
  ],
  averageCopies: 15000,
  matchedModelLabel: 'Canon iR ADV DX 527 / 529',
  usefulLife: 1500000,
  optimalBase: 22750,
  maxWaste: 0.68,
  appliedWaste: 0.34,
  optimalMonthly: 15000,
  ratio: 1,
  status: 'ATENCIÓN',
  recommendedAction: 'Programar mantenimiento integral.',
  latestCounter: 800000,
  usefulLifePercent: 0.5333,
};

describe('maintenance export', () => {
  it('exports filtered analysis and period traceability in separate sheets', async () => {
    const workbookBuffer = await buildMaintenanceWorkbook([analysis], null, 3);
    const workbook = new ExcelJS.Workbook();
    await workbook.xlsx.load(workbookBuffer);

    expect(workbook.worksheets.map((sheet) => sheet.name)).toEqual(['Resumen', 'Detalle por período']);
    expect(workbook.getWorksheet('Resumen')?.getCell('A9').value).toBe('Cliente');
    expect(workbook.getWorksheet('Resumen')?.getCell('A10').value).toBe('Cliente de prueba');
    expect(workbook.getWorksheet('Resumen')?.getCell('K10').value).toBe('ATENCIÓN');
    expect(workbook.getWorksheet('Detalle por período')?.getCell('A5').value).toBe('Cliente de prueba');
    expect(workbook.getWorksheet('Detalle por período')?.getCell('F5').value).toBe('Negro A4');
    expect(workbook.getWorksheet('Detalle por período')?.getCell('M5').value).toBe('Contadores');
    expect(workbook.getWorksheet('Detalle por período')?.getCell('O5').value).toBe('Sucursal: Asunción');
  });
});
