import ExcelJS from 'exceljs';
import { describe, expect, it } from 'vitest';
import {
  parseLegacyFleetMetadataWorkbook,
  parseCanonDiscontinuationWorkbook,
  parseLegacyPortfolioWorkbook,
  parseWaldbottStockWorkbook,
} from './legacy';

describe('parseLegacyPortfolioWorkbook', () => {
  it('normalizes a portfolio workbook and deduplicates repeated equipment', async () => {
    const workbook = new ExcelJS.Workbook();
    const sheet = workbook.addWorksheet('Cartera');
    sheet.addRow([
      'Cliente', 'Sector', 'Área comercial interna', 'Ref. DATA', 'Tipo contrato',
      'Fecha inicio', 'Fecha fin', 'Modelo', 'Serie', 'Ubicación',
    ]);
    sheet.addRow([
      '  Municipalidad  Central ', 'Público', 'Strategic', 'OV-001', 'Alquiler',
      new Date('2026-01-01T12:00:00Z'), '31/12/2026', 'iR ADV C3325i', 'SER-001', 'Casa central',
    ]);
    sheet.addRow([
      'Municipalidad Central', '', '', 'OV-001', 'Alquiler',
      '', '', 'iR ADV C3325i', 'SER-001', '',
    ]);
    sheet.addRow(['Fila incompleta', '', 'Commercial', 'OV-002', 'Mantenimiento', '', '', '', '', '']);

    const parsed = await parseLegacyPortfolioWorkbook(new Uint8Array(await workbook.xlsx.writeBuffer()));

    expect(parsed).toMatchObject({ sheets: 1, skippedRows: 1, duplicateRows: 1 });
    expect(parsed.rows).toEqual([
      expect.objectContaining({
        customerName: 'Municipalidad Central',
        customerType: 'Publico',
        commercialArea: 'Strategic',
        contractReference: 'OV-001',
        orderReference: null,
        contractType: 'Alquiler',
        startsAt: '2026-01-01',
        endsAt: '2026-12-31',
        division: null,
        active: null,
        modelLabel: 'iR ADV C3325i',
        brand: null,
        description: null,
        serialNumber: 'SER-001',
        interior: null,
        city: null,
        branch: null,
        address: null,
        location: 'Casa central',
      }),
    ]);
    expect(parsed.rows[0]).toMatchObject({
      sourceSheetName: 'Cartera',
      sourceRowNumber: 2,
      sourceDetails: expect.arrayContaining([
        { label: 'Cliente', value: 'Municipalidad Central' },
        { label: 'Ref. DATA', value: 'OV-001' },
      ]),
    });
  });

  it('ignores sheets without the portfolio header contract', async () => {
    const workbook = new ExcelJS.Workbook();
    workbook.addWorksheet('Resumen').addRow(['Cliente', 'Modelo', 'Notas']);

    const parsed = await parseLegacyPortfolioWorkbook(new Uint8Array(await workbook.xlsx.writeBuffer()));

    expect(parsed.rows).toEqual([]);
    expect(parsed.skippedRows).toBe(0);
    expect(parsed.sheets).toBe(1);
  });
});

describe('parseLegacyFleetMetadataWorkbook', () => {
  it('lee Contratos.xlsx y Detalles de contratos.xlsx con sus metadatos', async () => {
    const contracts = new ExcelJS.Workbook();
    const contractsSheet = contracts.addWorksheet('Contratos');
    contractsSheet.addRow(['Ref. DATA', 'Nº O.V.', 'Tipo de Contrato', 'Cliente', 'Vigente', 'División']);
    contractsSheet.addRow(['REF-001', 'OV-001', 'Leasing', 'Cliente Uno', 'Sí', 'MRA']);

    const details = new ExcelJS.Workbook();
    const detailsSheet = details.addWorksheet('Detalle');
    detailsSheet.addRow(['Ref. DATA', 'Nº OV', 'ID Con', 'División', 'Area', 'Tipo Contrato', 'Cliente', 'Fecha Inicio', 'Fecha Fin', 'Vigente', 'Requiere Cierre']);
    detailsSheet.addRow(['REF-001', 'OV-001', 'ID-99', 'MRA', 'Commercial', 'Leasing', 'Cliente Uno', '01/01/2026', '31/12/2026', 'Vigente', 'No']);

    const contractsResult = await parseLegacyFleetMetadataWorkbook(
      new Uint8Array(await contracts.xlsx.writeBuffer()),
      'contracts',
    );
    const detailsResult = await parseLegacyFleetMetadataWorkbook(
      new Uint8Array(await details.xlsx.writeBuffer()),
      'contract-details',
    );

    expect(contractsResult.rows).toEqual([expect.objectContaining({
      customerName: 'Cliente Uno',
      contractReference: 'REF-001',
      orderReference: 'OV-001',
      contractType: 'Leasing',
      division: 'MRA',
      active: true,
      sourceSheetName: 'Contratos',
      sourceRowNumber: 2,
      sourceDetails: expect.arrayContaining([{ label: 'Ref. DATA', value: 'REF-001' }]),
    })]);
    expect(detailsResult.rows).toEqual([expect.objectContaining({
      customerName: 'Cliente Uno',
      contractReference: 'REF-001',
      orderReference: 'OV-001',
      startsAt: '2026-01-01',
      endsAt: '2026-12-31',
      commercialArea: 'Commercial',
      contractCommercialArea: 'Commercial',
      requiresClosure: false,
      sourceSheetName: 'Detalle',
      sourceRowNumber: 2,
      sourceDetails: expect.arrayContaining([{ label: 'ID Con', value: 'ID-99' }]),
    })]);
  });

  it('importa la clasificación separada y combina filas repetidas', async () => {
    const workbook = new ExcelJS.Workbook();
    const sheet = workbook.addWorksheet('Clasificación');
    sheet.addRow(['Cliente', 'Tipo de cliente', 'Área comercial interna']);
    sheet.addRow(['Cliente Público', 'Público', '']);
    sheet.addRow(['Cliente Público', '', 'Strategic']);
    sheet.addRow(['Cliente Privado', 'Privado', 'Commercial']);

    const parsed = await parseLegacyFleetMetadataWorkbook(
      new Uint8Array(await workbook.xlsx.writeBuffer()),
      'classification',
    );

    expect(parsed).toMatchObject({ sheets: 1, duplicateRows: 1, skippedRows: 0 });
    expect(parsed.rows).toEqual(expect.arrayContaining([
      expect.objectContaining({ customerName: 'Cliente Público', customerType: 'Publico', commercialArea: 'Strategic' }),
      expect.objectContaining({ customerName: 'Cliente Privado', customerType: 'Privado', commercialArea: 'Commercial' }),
    ]));
  });
});

describe('parseCanonDiscontinuationWorkbook', () => {
  it('reads Canon header and compact rows, keeps model-only records, and deduplicates them', async () => {
    const workbook = new ExcelJS.Workbook();
    const printer = workbook.addWorksheet('Printer');
    printer.addRow(['.', 'Printer', 'Parts End Date']);
    printer.addRow(['.', 'PIXMA IP100', 'Jun 30, 2020.']);
    printer.addRow(['.', 'Model', 'Parts Item Code', 'Voltage', 'Support End']);
    printer.addRow(['.', 'MAXIFY IB4020', 'Q30-4720-000', 120, 'Dec-21', 'Fuente histórica 2021']);
    printer.addRow(['.', 'MAXIFY IB4020', 'Q30-4720-000', 120, 'Dec-21']);
    printer.addRow(['.', 'ACCESSORIES']);
    printer.addRow(['.', 'ACCESSORY MODEL', 'Q30-4720-001', 120, 'Dec-21']);
    printer.addRow(['.', 'Printer']);

    const compact = workbook.addWorksheet('Graphic CiRC');
    compact.addRow(['C iR C2620 (120V) Parts End Date: 12/31/13']);
    compact.addRow(['iR C5800 (120V)', 'Q30-5800-000']);
    compact.addRow(['IR 3235 (120V)', 'Parts End Date: 12/31/19']);
    compact.addRow(['Modelo sin fecha ni código']);

    const historicalVariants = workbook.addWorksheet('2024-2030');
    historicalVariants.addRow(['Model', 'Parts Item Code', 'Voltage', 'End Date']);
    historicalVariants.addRow(['imageRUNNER ADVANCE DX C3926i', 'FM4-1234-000', '220', new Date('2027-06-30T00:00:00Z')]);
    historicalVariants.addRow(['Machine', 'Parts Item Code', 'Voltage', 'end of parts']);
    historicalVariants.addRow(['imageRUNNER ADVANCE DX C3930i', 'FM4-5678-000', '110', 'Dec-28']);

    const parsed = await parseCanonDiscontinuationWorkbook(
      new Uint8Array(await workbook.xlsx.writeBuffer()),
      'canon.xlsx',
    );

    expect(parsed).toMatchObject({ sheets: 3, duplicateRows: 1 });
    expect(parsed.items).toEqual(expect.arrayContaining([
      expect.objectContaining({ modelLabel: 'PIXMA IP100', partCode: '', endsAt: '2020-06-30', source: 'canon.xlsx · Printer' }),
      expect.objectContaining({
        modelLabel: 'MAXIFY IB4020',
        partCode: 'Q30-4720-000',
        endsAt: '2021-12-01',
        voltage: '120',
        sourceNotes: ['Fuente histórica 2021'],
      }),
      expect.objectContaining({ modelLabel: 'C iR C2620 (120V)', partCode: '', endsAt: '2013-12-31', source: 'canon.xlsx · Graphic CiRC' }),
      expect.objectContaining({ modelLabel: 'iR C5800 (120V)', partCode: 'Q30-5800-000', endsAt: null }),
      expect.objectContaining({ modelLabel: 'IR 3235 (120V)', partCode: '', endsAt: '2019-12-31', sourceNotes: [] }),
      expect.objectContaining({
        modelLabel: 'imageRUNNER ADVANCE DX C3926i',
        partCode: 'FM4-1234-000',
        endsAt: '2027-06-30',
        voltage: '220',
        source: 'canon.xlsx · 2024-2030',
      }),
      expect.objectContaining({
        modelLabel: 'imageRUNNER ADVANCE DX C3930i',
        partCode: 'FM4-5678-000',
        endsAt: '2028-12-01',
        voltage: '110',
        source: 'canon.xlsx · 2024-2030',
      }),
    ]));
    expect(parsed.items).toHaveLength(7);
    expect(parsed.skippedRows).toBeGreaterThan(0);
  });
});

describe('parseWaldbottStockWorkbook', () => {
  it('keeps only Depot 04 stock and excludes non-printer families', async () => {
    const workbook = new ExcelJS.Workbook();
    const sheet = workbook.addWorksheet('Depósito');
    sheet.addRow(['Artículo', 'Descripción', 'Depósito', 'Cantidad']);
    sheet.addRow(['0281C003AA', 'Impresora Laser LBP253x', '04', '']);
    sheet.addRow(['0292C005AA', 'Impresora Laser MF515x', 4, '2']);
    sheet.addRow(['0292C005AA', 'Impresora Laser MF515x', '02', 8]);
    sheet.addRow(['PROJECTOR MW536 WHITE', 'Proyector BenQ MW560', '04', 3]);
    sheet.addRow(['CASIO-001', 'Proyector Casio XJ-F210WN', '04', 1]);
    sheet.addRow(['SCREEN-001', 'Pantalla Interactiva Smart', '04', 1]);
    sheet.addRow(['EPSON-001', 'Impresora Epson L3250', '04', 1]);
    workbook.addWorksheet('Resumen').addRow(['Sin', 'encabezado', 'de', 'stock']);

    const parsed = await parseWaldbottStockWorkbook(
      new Uint8Array(await workbook.xlsx.writeBuffer()),
      'stock.xlsx',
    );

    expect(parsed).toMatchObject({ sheets: 2, skippedRows: 5 });
    expect(parsed.rows).toEqual([
      { modelLabel: 'Impresora Laser LBP253x', deposit: '04', quantity: 1, source: 'stock.xlsx · Depósito' },
      { modelLabel: 'Impresora Laser MF515x', deposit: '04', quantity: 2, source: 'stock.xlsx · Depósito' },
    ]);
  });
});
