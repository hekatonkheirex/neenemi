import ExcelJS from 'exceljs';
import { describe, expect, it } from 'vitest';
import { parseMaintenanceCounterCsv, parseMaintenanceCounterWorkbook } from './counters-parser';

describe('maintenance counter parser', () => {
  it('reads semicolon CSV, localized numbers and operational source fields', () => {
    const parsed = parseMaintenanceCounterCsv([
      'Cliente;Nº O.V.;Equipo;Nº Serie;Año-Mes;Papel;Copias;Contador;División',
      '"Cliente A";"OV-001";"FOTOCOPIADORA CANON IRADV 529i";"SER-001";"2026-08";"Negro A4";"12.500";"1.234.567";"MRA"',
      'fila incompleta;;;;;;;',
    ].join('\n'));

    expect(parsed).toMatchObject({ sheets: 1, skippedRows: 1, records: [{
      customerName: 'Cliente A',
      contractReference: 'OV-001',
      modelLabel: 'FOTOCOPIADORA CANON IRADV 529i',
      serialNumber: 'SER-001',
      period: '2026-08',
      copies: 12500,
      counter: 1234567,
      sourceSheetName: 'CSV',
      sourceRowNumber: 2,
      sourceDetails: expect.arrayContaining([{ label: 'División', value: 'MRA' }]),
    }] });
    expect(parsed.sourceSheets[0]?.rows).toHaveLength(3);
  });

  it('finds the legacy header after a title row in XLSX and keeps sheet location', async () => {
    const workbook = new ExcelJS.Workbook();
    const sheet = workbook.addWorksheet('Contadores agosto');
    sheet.addRow(['Export de Superset']);
    sheet.addRow(['Cliente', 'Nº O.V.', 'Equipo', 'Nº Serie', 'Año-Mes', 'Papel', 'Copias', 'Contador']);
    sheet.addRow(['Cliente B', 'OV-002', 'Canon iR1643', 'SER-002', new Date('2026-08-15T12:00:00Z'), 'Color A4', 900, 20000]);

    const parsed = await parseMaintenanceCounterWorkbook(new Uint8Array(await workbook.xlsx.writeBuffer()));

    expect(parsed).toMatchObject({ sheets: 1, skippedRows: 0, records: [{
      customerName: 'Cliente B',
      period: '2026-08',
      copies: 900,
      counter: 20000,
      sourceSheetName: 'Contadores agosto',
      sourceRowNumber: 3,
    }] });
  });
});
