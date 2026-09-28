import ExcelJS from 'exceljs';
import { describe, expect, it } from 'vitest';
import { PYG_TO_USD } from './analysis';
import { parseConsumablesWorkbook } from './xlsx';

type XlsxCell = string | number | Date | undefined;

async function makeWorkbook(rows: XlsxCell[][]): Promise<Uint8Array> {
  const workbook = new ExcelJS.Workbook();
  const sheet = workbook.addWorksheet('Uso de repuestos');
  sheet.addRow(Array.from({ length: 24 }, (_, index) => `header-${index}`));
  for (const row of rows) sheet.addRow(row);
  return new Uint8Array(await workbook.xlsx.writeBuffer());
}

function makeUseRepuestosRow(): XlsxCell[] {
  const row: XlsxCell[] = Array.from({ length: 24 }, () => undefined);
  row[5] = 'Cliente fuente';
  row[8] = 'OV-USE-001';
  row[9] = 'Mantenimiento';
  row[13] = 'iR ADV C3325i';
  row[14] = '2026-04';
  row[15] = 'SER-USE-001';
  row[17] = '2725C002AA';
  row[20] = 'TONER NEGRO';
  row[21] = 2;
  row[22] = 30000;
  row[23] = 60000;
  return row;
}

describe('parseConsumablesWorkbook', () => {
  it('normalizes rows from every worksheet and keeps each source location', async () => {
    const workbook = new ExcelJS.Workbook();
    const april = workbook.addWorksheet('Abril');
    april.addRow(Array.from({ length: 24 }, (_, index) => `header-${index}`));
    april.addRow(makeUseRepuestosRow());
    const may = workbook.addWorksheet('Mayo');
    may.addRow(Array.from({ length: 24 }, (_, index) => `header-${index}`));
    const mayRow = makeUseRepuestosRow();
    mayRow[15] = 'SER-USE-002';
    may.addRow(mayRow);

    const parsed = await parseConsumablesWorkbook(
      new Uint8Array(await workbook.xlsx.writeBuffer()),
      'uso-repuestos',
    );

    expect(parsed.rows).toHaveLength(2);
    expect(parsed.rows.map((row) => [row.serialNumber, row.sourceSheetName, row.sourceRowNumber])).toEqual([
      ['SER-USE-001', 'Abril', 2],
      ['SER-USE-002', 'Mayo', 2],
    ]);
  });

  it('parses the historical uso de repuestos layout and converts PYG totals to USD', async () => {
    const workbook = await makeWorkbook([makeUseRepuestosRow()]);
    const parsed = await parseConsumablesWorkbook(workbook, 'uso-repuestos');

    expect(parsed).toEqual({
      skippedOutOfScope: 0,
      rows: [{
        recordedAt: '',
        month: '2026-04',
        modelLabel: 'iR ADV C3325i',
        serialNumber: 'SER-USE-001',
        partCode: '2725C002AA',
        description: 'TONER NEGRO',
        quantity: 2,
        costUsd: Math.round(60000 * PYG_TO_USD * 100) / 100,
        recordKind: 'consumable',
        classification: 'original',
        category: 'toner',
        family: 'GPR53',
        sourceCustomerName: 'Cliente fuente',
        sourceOrderReference: 'OV-USE-001',
        sourceUnitPricePyg: 30000,
        sourceTotalPyg: 60000,
        sourceOperational: { contractType: 'Mantenimiento' },
        sourceSheetName: 'Uso de repuestos',
        sourceRowNumber: 2,
      }],
    });
  });

  it('keeps operational fields when the legacy headers are present', async () => {
    const headers: XlsxCell[] = Array.from({ length: 24 }, (_, index) => `unused-${index}`);
    headers[1] = 'División';
    headers[2] = 'Nº Salida';
    headers[3] = 'Técnico';
    headers[5] = 'Cliente';
    headers[6] = 'Sucursal';
    headers[7] = 'Ref DATA';
    headers[8] = 'Nº OV';
    headers[9] = 'Tipo Contrato';
    headers[10] = 'Vigente';
    headers[11] = 'Fecha Inicio';
    headers[12] = 'Fecha Fin';
    headers[13] = 'Equipo';
    headers[14] = 'Año_Mes';
    headers[15] = 'Nro Serie';
    headers[16] = 'Nº I.S.';
    headers[17] = 'Código Repuesto';
    headers[18] = 'Tarea realizada';
    headers[19] = 'Repuestos utilizados (según I.S.)';
    headers[20] = 'Descripción Repuesto';
    headers[21] = 'Cant';
    headers[22] = 'Precio Unitario';
    headers[23] = 'Precio Total';
    const row = makeUseRepuestosRow();
    row[1] = 'Central';
    row[2] = 7001;
    row[3] = 'Tec Uno';
    row[6] = 'Sucursal Norte';
    row[7] = 'DATA-001';
    row[10] = 'Sí';
    row[11] = new Date('2026-01-01');
    row[12] = new Date('2026-12-31');
    row[16] = 9001;
    row[18] = 'Cambio de tóner';
    row[19] = 'Tóner negro';

    const workbookWithHeaders = await (async () => {
      const result = new ExcelJS.Workbook();
      const sheet = result.addWorksheet('Uso de repuestos');
      sheet.addRow(headers);
      sheet.addRow(row);
      return new Uint8Array(await result.xlsx.writeBuffer());
    })();
    const parsed = await parseConsumablesWorkbook(workbookWithHeaders, 'uso-repuestos');

    expect(parsed.rows[0]).toEqual(expect.objectContaining({
      sourceCustomerName: 'Cliente fuente',
      sourceOrderReference: 'OV-USE-001',
      sourceDetails: expect.arrayContaining([
        { label: 'División', value: 'Central' },
        { label: 'Nº Salida', value: '7001' },
        { label: 'Técnico', value: 'Tec Uno' },
        { label: 'Sucursal', value: 'Sucursal Norte' },
        { label: 'Ref DATA', value: 'DATA-001' },
        { label: 'Tipo Contrato (fuente)', value: 'Mantenimiento' },
        { label: 'Vigente', value: 'Sí' },
        { label: 'Fecha Inicio', value: '2026-01-01' },
        { label: 'Fecha Fin', value: '2026-12-31' },
        { label: 'Nº I.S.', value: '9001' },
        { label: 'Tarea realizada', value: 'Cambio de tóner' },
        { label: 'Repuestos utilizados (según I.S.)', value: 'Tóner negro' },
      ]),
    }));
  });

  it('keeps the repuesto classification and skips paper in the historical layout', async () => {
    const part = makeUseRepuestosRow();
    part[17] = 'RP-001';
    part[20] = 'MOTOR PRINCIPAL';
    const paper = makeUseRepuestosRow();
    paper[17] = 'PAPEL-A4';
    paper[20] = 'RESMA A4';

    const workbook = await makeWorkbook([part, paper]);
    const parsed = await parseConsumablesWorkbook(workbook, 'uso-repuestos');

    expect(parsed.skippedOutOfScope).toBe(1);
    expect(parsed.rows).toEqual([expect.objectContaining({
      partCode: 'RP-001',
      recordKind: 'part',
      family: 'GPR53',
    })]);
  });

  it('projects optional commercial fields from detail and repuesto layouts', async () => {
    const headers: XlsxCell[] = [
      'Interno', 'Id.Cab', 'Fecha', 'Equipo', 'Nro Serie', 'Código', 'Descripción',
      'Cantidad', 'Costo USD', 'Cliente', 'Nº OV', 'División', 'Año-Mes', 'Observaciones',
    ];
    const row: XlsxCell[] = [
      'line-optional', 'CAB-7001', undefined, 'iR ADV C3325i', 'SER-OPTIONAL-001', 'CRG-T03',
      'Tóner compatible T03', 2, 120, 'Cliente fuente', 'OV-FUENTE-7001', 'MRA', '2026-07', 'Entrega urgente',
    ];
    const workbook = new ExcelJS.Workbook();
    const sheet = workbook.addWorksheet('Julio');
    sheet.addRow(headers);
    sheet.addRow(row);

    const parsed = await parseConsumablesWorkbook(
      new Uint8Array(await workbook.xlsx.writeBuffer()),
      'consumibles',
    );

    expect(parsed.rows[0]).toEqual(expect.objectContaining({
      recordedAt: '',
      month: '2026-07',
      sourceCustomerName: 'Cliente fuente',
      sourceOrderReference: 'OV-FUENTE-7001',
      sourceUnitPricePyg: null,
      sourceTotalPyg: null,
      sourceDetails: expect.arrayContaining([
        { label: 'Id.Cab', value: 'CAB-7001' },
        { label: 'Cliente', value: 'Cliente fuente' },
        { label: 'Nº OV', value: 'OV-FUENTE-7001' },
        { label: 'División', value: 'MRA' },
        { label: 'Mes (fuente)', value: '2026-07' },
        { label: 'Observaciones', value: 'Entrega urgente' },
      ]),
    }));
  });

  it('recognizes legacy header variants and keeps their operational values', async () => {
    const headers: XlsxCell[] = Array.from({ length: 24 }, (_, index) => `unused-${index}`);
    headers[0] = 'Sector';
    headers[1] = 'ID de cabecera';
    headers[2] = 'Fecha de salida';
    headers[5] = 'Razón social';
    headers[6] = 'Área comercial';
    headers[7] = 'Referencia contrato';
    headers[8] = 'Nº de O.V.';
    headers[9] = 'Tipo de contrato';
    headers[13] = 'Modelo del equipo';
    headers[15] = 'Nº de serie del equipo';
    headers[17] = 'Código del repuesto';
    headers[20] = 'Descripción del repuesto';
    headers[21] = 'Cantidad utilizada';
    headers[22] = 'Precio unitario (Gs.)';
    headers[23] = 'Precio total (Gs.)';
    const row: XlsxCell[] = Array.from({ length: 24 }, () => undefined);
    row[0] = 'Privado';
    row[1] = 'CAB-VARIANT-001';
    row[2] = new Date('2026-09-04');
    row[5] = 'Cliente variante';
    row[6] = 'Comercial';
    row[7] = 'CON-VARIANT-001';
    row[8] = 'OV-VARIANT-001';
    row[9] = 'Mantenimiento';
    row[13] = 'iR ADV C3325i';
    row[15] = 'SER-VARIANT-001';
    row[17] = 'CRG-T03';
    row[20] = 'Tóner compatible T03';
    row[21] = 3;
    row[22] = 25000;
    row[23] = 75000;
    const workbook = new ExcelJS.Workbook();
    const sheet = workbook.addWorksheet('Variantes');
    sheet.addRow(headers);
    sheet.addRow(row);

    const parsed = await parseConsumablesWorkbook(
      new Uint8Array(await workbook.xlsx.writeBuffer()),
      'uso-repuestos',
    );

    expect(parsed.rows[0]).toEqual(expect.objectContaining({
      recordedAt: '2026-09-04',
      sourceCustomerName: 'Cliente variante',
      sourceOrderReference: 'OV-VARIANT-001',
      modelLabel: 'iR ADV C3325i',
      serialNumber: 'SER-VARIANT-001',
      quantity: 3,
      sourceUnitPricePyg: 25000,
      sourceTotalPyg: 75000,
      sourceOperational: expect.objectContaining({
        sourceSector: 'Privado',
        sourceCommercialArea: 'Comercial',
        sourceContractReference: 'CON-VARIANT-001',
      }),
      sourceDetails: expect.arrayContaining([
        { label: 'Id.Cab', value: 'CAB-VARIANT-001' },
        { label: 'Sector (fuente)', value: 'Privado' },
        { label: 'Área comercial (fuente)', value: 'Comercial' },
        { label: 'Contrato (fuente)', value: 'CON-VARIANT-001' },
      ]),
    }));
  });

  it('detects the detail header after introductory rows and keeps the original row number', async () => {
    const headers: XlsxCell[] = [
      'Id.Cab', 'Fecha', 'Equipo', 'Nro Serie', 'Código', 'Descripción', 'Cantidad', 'Total U$', 'Cliente',
    ];
    const row: XlsxCell[] = [
      'CAB-8001', new Date('2026-08-12'), 'iR ADV C3325i', 'SER-HEADER-001', 'CRG-T03',
      'Tóner negro T03', 1, 125, 'Cliente cabecera',
    ];
    const workbook = new ExcelJS.Workbook();
    const sheet = workbook.addWorksheet('Agosto');
    sheet.addRow(['Detalle histórico de consumibles']);
    sheet.addRow(['Exportado desde el gestor legado']);
    sheet.addRow(headers);
    sheet.addRow(row);

    const parsed = await parseConsumablesWorkbook(
      new Uint8Array(await workbook.xlsx.writeBuffer()),
      'consumibles',
    );

    expect(parsed.rows).toEqual([expect.objectContaining({
      sourceCustomerName: 'Cliente cabecera',
      modelLabel: 'iR ADV C3325i',
      serialNumber: 'SER-HEADER-001',
      partCode: 'CRG-T03',
      sourceSheetName: 'Agosto',
      sourceRowNumber: 4,
      sourceDetails: expect.arrayContaining([
        { label: 'Id.Cab', value: 'CAB-8001' },
        { label: 'Cliente', value: 'Cliente cabecera' },
      ]),
    })]);
  });
});
