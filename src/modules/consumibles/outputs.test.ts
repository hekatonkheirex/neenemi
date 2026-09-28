import ExcelJS from 'exceljs';
import { describe, expect, it } from 'vitest';
import { parseOutputsWorkbook } from './outputs';

type XlsxCell = string | number | Date | undefined;

async function makeWorkbook(columnCount: number, rows: XlsxCell[][]): Promise<Uint8Array> {
  const workbook = new ExcelJS.Workbook();
  const sheet = workbook.addWorksheet('Salidas');
  sheet.addRow(Array.from({ length: columnCount }, (_, index) => `header-${index}`));
  for (const row of rows) sheet.addRow(row);
  return new Uint8Array(await workbook.xlsx.writeBuffer());
}

describe('parseOutputsWorkbook', () => {
  it('normalizes dispatch rows from every worksheet', async () => {
    const workbook = new ExcelJS.Workbook();
    for (const [sheetName, documentNumber] of [['Salidas abril', 1004], ['Salidas mayo', 1005]] as const) {
      const sheet = workbook.addWorksheet(sheetName);
      sheet.addRow(Array.from({ length: 12 }, (_, index) => `header-${index}`));
      const row: XlsxCell[] = Array.from({ length: 12 }, () => undefined);
      row[0] = documentNumber;
      row[1] = new Date('2026-04-05');
      row[2] = 'CRG-T03';
      row[3] = 'TONER NEGRO T03';
      row[4] = 1;
      row[7] = `SER-OUT-${documentNumber}`;
      row[8] = 'iR ADV C3325i';
      sheet.addRow(row);
    }

    const parsed = await parseOutputsWorkbook(
      new Uint8Array(await workbook.xlsx.writeBuffer()),
      'salida-consumibles',
    );

    expect(parsed.rows).toHaveLength(2);
    expect(parsed.rows.map((row) => [row.documentNumber, row.sourceSheetName, row.sourceRowNumber])).toEqual([
      [1004, 'Salidas abril', 2],
      [1005, 'Salidas mayo', 2],
    ]);
  });

  it('parses a consumables dispatch with yield and source customer', async () => {
    const row: XlsxCell[] = Array.from({ length: 12 }, () => undefined);
    row[0] = 1001;
    row[1] = new Date('2026-04-05');
    row[2] = 'CRG-T03';
    row[3] = 'TONER NEGRO T03';
    row[4] = 1;
    row[6] = 12000;
    row[7] = 'SER-OUT-001';
    row[8] = 'iR ADV C3325i';
    row[11] = 'Cliente histórico';

    const parsed = await parseOutputsWorkbook(
      await makeWorkbook(12, [row]),
      'salida-consumibles',
    );

    expect(parsed).toEqual({
      skippedOutOfScope: 0,
      rows: [{
        recordKind: 'consumable',
        documentNumber: 1001,
        recordedAt: '2026-04-05',
        month: '2026-04',
        modelLabel: 'iR ADV C3325i',
        serialNumber: 'SER-OUT-001',
        partCode: 'CRG-T03',
        description: 'TONER NEGRO T03',
        quantity: 1,
        yieldPages: 12000,
        technician: '',
        serviceReportNumber: 0,
        sourceCustomerName: 'Cliente histórico',
        classification: 'compatible',
        category: 'toner',
        family: 'GPR53',
        sourceSheetName: 'Salidas',
        sourceRowNumber: 2,
      }],
    });
  });

  it('classifies migrated parts separately from technical parts', async () => {
    const migrating: XlsxCell[] = Array.from({ length: 13 }, () => undefined);
    migrating[0] = 5001;
    migrating[1] = new Date('2026-05-01');
    migrating[2] = 'RP-01';
    migrating[3] = 'CILINDRO DE IMAGEN';
    migrating[4] = 1;
    migrating[7] = 'Cliente histórico';
    migrating[8] = 'iR ADV C3325i';
    migrating[9] = 'SER-OUT-001';
    migrating[10] = 'Tec Uno';
    migrating[12] = 777;

    const technical: XlsxCell[] = Array.from({ length: 13 }, () => undefined);
    technical[0] = 5002;
    technical[1] = new Date('2026-05-02');
    technical[2] = 'RP-02';
    technical[3] = 'FUSOR COMPLETO';
    technical[4] = 1;
    technical[7] = 'Cliente histórico';
    technical[8] = 'iR ADV C3325i';
    technical[9] = 'SER-OUT-001';
    technical[10] = 'Tec Uno';
    technical[12] = 778;

    const parsed = await parseOutputsWorkbook(
      await makeWorkbook(13, [migrating, technical]),
      'salida-repuestos',
    );

    expect(parsed.rows).toEqual([
      expect.objectContaining({
        documentNumber: 5001,
        recordKind: 'consumable',
        category: 'cilindro',
        technician: 'Tec Uno',
        serviceReportNumber: 777,
      }),
      expect.objectContaining({
        documentNumber: 5002,
        recordKind: 'part',
        category: 'repuesto',
        serviceReportNumber: 778,
      }),
    ]);
  });

  it('keeps financial and operational fields from dispatch headers', async () => {
    const headers: XlsxCell[] = [
      'Nº Remisión', 'Fecha', 'Código', 'Descripción', 'Cantidad', 'Rendimiento',
      'Total Rendimiento', 'Nº Serie Equipo', 'Modelo Equipo', 'Precio', 'Total',
      'Cliente', 'Observaciones', 'Contacto',
    ];
    const row: XlsxCell[] = [
      1003, new Date('2026-06-08'), 'CRG-T03', 'TONER NEGRO T03', 2, 5000,
      10000, 'SER-OUT-003', 'iR ADV C3325i', 45000, 90000, 'Cliente fuente',
      'Entregar en recepción', 'Ana · 0981',
    ];
    const workbook = new ExcelJS.Workbook();
    const sheet = workbook.addWorksheet('Salidas');
    sheet.addRow(headers);
    sheet.addRow(row);

    const parsed = await parseOutputsWorkbook(
      new Uint8Array(await workbook.xlsx.writeBuffer()),
      'salida-consumibles',
    );

    expect(parsed.rows[0]).toEqual(expect.objectContaining({
      sourceUnitPricePyg: 45000,
      sourceTotalPyg: 90000,
      sourceOperational: {
        yieldPerUnit: '5000',
        observations: 'Entregar en recepción',
        contact: 'Ana · 0981',
      },
      sourceDetails: expect.arrayContaining([
        { label: 'Rendimiento', value: '5000' },
        { label: 'Precio (PYG)', value: '45000' },
        { label: 'Total (PYG)', value: '90000' },
        { label: 'Observaciones', value: 'Entregar en recepción' },
        { label: 'Contacto', value: 'Ana · 0981' },
      ]),
    }));
  });

  it('recognizes common dispatch header variants', async () => {
    const headers: XlsxCell[] = [
      'Nº de Remisión', 'Fecha de salida', 'Código del repuesto', 'Descripción del repuesto',
      'Cantidad entregada', 'Rend. unitario', 'Total rend.', 'Nº de serie del equipo',
      'Modelo del equipo', 'Precio unitario (Gs.)', 'Total (Gs.)', 'Razón social',
      'Comentarios', 'Contacto cliente', 'Sector', 'Área comercial', 'Referencia contrato',
    ];
    const row: XlsxCell[] = [
      1009, new Date('2026-09-08'), 'CRG-T03', 'TONER NEGRO T03', 2, 6000, 12000,
      'SER-OUTPUT-VARIANT-001', 'iR ADV C3325i', 45000, 90000, 'Cliente despacho variante',
      'Entregar mañana', 'Ana · 0981', 'Privado', 'Comercial', 'CON-OUT-VARIANT-001',
    ];
    const workbook = new ExcelJS.Workbook();
    const sheet = workbook.addWorksheet('Variantes');
    sheet.addRow(headers);
    sheet.addRow(row);

    const parsed = await parseOutputsWorkbook(
      new Uint8Array(await workbook.xlsx.writeBuffer()),
      'salida-consumibles',
    );

    expect(parsed.rows[0]).toEqual(expect.objectContaining({
      documentNumber: 1009,
      recordedAt: '2026-09-08',
      quantity: 2,
      yieldPages: 12000,
      sourceCustomerName: 'Cliente despacho variante',
      sourceUnitPricePyg: 45000,
      sourceTotalPyg: 90000,
      sourceOperational: {
        yieldPerUnit: '6000',
        observations: 'Entregar mañana',
        contact: 'Ana · 0981',
        sourceSector: 'Privado',
        sourceCommercialArea: 'Comercial',
      },
      sourceDetails: expect.arrayContaining([
        { label: 'Sector (fuente)', value: 'Privado' },
        { label: 'Área comercial (fuente)', value: 'Comercial' },
      ]),
    }));
  });

  it('detects the dispatch header after introductory rows and keeps the original row number', async () => {
    const headers: XlsxCell[] = [
      'Nº Remisión', 'Fecha', 'Código', 'Descripción', 'Cantidad', 'Rendimiento',
      'Total Rendimiento', 'Nº Serie Equipo', 'Modelo Equipo', 'Precio', 'Total', 'Cliente',
    ];
    const row: XlsxCell[] = [
      1008, new Date('2026-08-12'), 'CRG-T03', 'Tóner negro T03', 1, 6000,
      6000, 'SER-OUTPUT-HEADER-001', 'iR ADV C3325i', 45000, 45000, 'Cliente despacho',
    ];
    const workbook = new ExcelJS.Workbook();
    const sheet = workbook.addWorksheet('Agosto');
    sheet.addRow(['Salidas de consumibles']);
    sheet.addRow(['Resumen generado por el sistema legado']);
    sheet.addRow(headers);
    sheet.addRow(row);

    const parsed = await parseOutputsWorkbook(
      new Uint8Array(await workbook.xlsx.writeBuffer()),
      'salida-consumibles',
    );

    expect(parsed.rows).toEqual([expect.objectContaining({
      documentNumber: 1008,
      sourceCustomerName: 'Cliente despacho',
      serialNumber: 'SER-OUTPUT-HEADER-001',
      sourceSheetName: 'Agosto',
      sourceRowNumber: 4,
      sourceDetails: expect.arrayContaining([
        { label: 'Rendimiento', value: '6000' },
        { label: 'Cliente', value: 'Cliente despacho' },
      ]),
    })]);
  });
});
