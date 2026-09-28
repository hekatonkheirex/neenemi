import ExcelJS from 'exceljs';
import { readFileSync } from 'node:fs';
import { describe, expect, it } from 'vitest';
import type { CatalogFamilySummary, CatalogModelNote, CatalogServiceItem } from '../catalogo/repository';
import { buildPriceListWorkbook, buildProformaWorkbook } from './export';
import type { PricingSettings, Proforma, SalesPricePart } from './types';

const pricing: PricingSettings = {
  exchangeRate: 5980,
  factor: 1.8,
  laborPrice: 80000,
};

const items: SalesPricePart[] = [
  {
    id: 'part-1',
    brand: 'Canon',
    code: 'FK-001',
    description: 'Kit de mantenimiento',
    models: ['iR ADV C3325i', 'iR ADV C5535i'],
    stock: 4,
    markup: 0,
    discontinuedAt: null,
    priceUsd: 10,
    priceLocal: 59800,
    salePriceUsd: 18,
    salePriceLocal: 107640,
  },
  {
    id: 'part-2',
    brand: 'Canon',
    code: 'FK-002',
    description: 'Rodillo',
    models: ['iR ADV C5535i'],
    stock: 2,
    markup: 0,
    discontinuedAt: '2028-01-01',
    priceUsd: 20,
    priceLocal: 119600,
    salePriceUsd: 36,
    salePriceLocal: 215280,
  },
];

describe('price list export', () => {
  it('creates a summary and one filtered sheet per selected model', async () => {
    const buffer = await buildPriceListWorkbook(items, pricing, ['iR ADV C3325i', 'iR ADV C5535i']);
    const workbook = new ExcelJS.Workbook();
    await workbook.xlsx.load(buffer);

    expect(workbook.worksheets.map((sheet) => sheet.name)).toEqual([
      'Resumen',
      'iR ADV C3325i',
      'iR ADV C5535i',
    ]);
    expect(workbook.getWorksheet('iR ADV C3325i')?.getCell(6, 1).value).toBe('FK-001');
    expect(workbook.getWorksheet('iR ADV C5535i')?.getCell(6, 1).value).toBe('FK-001');
    expect(workbook.getWorksheet('iR ADV C5535i')?.getCell(7, 1).value).toBe('FK-002');
    expect(workbook.getWorksheet('iR ADV C5535i')?.getCell(7, 8).value).toBe('Baja 2028-01-01');
  });

  it('exports legacy service rows and the selected model note', async () => {
    const serviceItems: CatalogServiceItem[] = [
      {
        id: 'service-1',
        brand: 'Canon',
        familyName: 'iR ADV',
        modelName: 'iR ADV C3325i',
        kind: 'labor',
        description: 'Cambio de kit de rodillos',
        fixedPriceLocal: null,
        sourceBatchId: 'batch-1',
        sourceName: 'semilla.json',
      },
      {
        id: 'service-2',
        brand: 'Canon',
        familyName: 'iR ADV',
        modelName: 'iR ADV C3325i',
        kind: 'fixed',
        description: 'Mantenimiento preventivo',
        fixedPriceLocal: 320000,
        sourceBatchId: 'batch-1',
        sourceName: 'semilla.json',
      },
    ];
    const modelNotes: CatalogModelNote[] = [{
      id: 'note-1',
      brand: 'Canon',
      familyName: 'iR ADV',
      modelName: 'iR ADV C3325i',
      note: 'Usa tóner de alta capacidad.',
      sourceBatchId: 'batch-1',
      sourceName: 'semilla.json',
    }];

    const buffer = await buildPriceListWorkbook(items, pricing, ['iR ADV C3325i'], serviceItems, modelNotes);
    const workbook = new ExcelJS.Workbook();
    await workbook.xlsx.load(buffer);
    const sheet = workbook.getWorksheet('iR ADV C3325i');

    expect(sheet?.getCell('A4').value).toBe('Nota técnica');
    expect(sheet?.getCell('B4').value).toBe('Usa tóner de alta capacidad.');
    expect(sheet?.getCell('B8').value).toBe('Cambio de kit de rodillos');
    expect(sheet?.getCell('G8').value).toBe(pricing.laborPrice);
    expect(sheet?.getCell('H8').value).toBe('Mano de obra');
    expect(sheet?.getCell('B9').value).toBe('Mantenimiento preventivo');
    expect(sheet?.getCell('G9').value).toBe(320000);
    expect(sheet?.getCell('H9').value).toBe('Cargo fijo');
  });

  it('uses the source pricing rules in each selected family sheet', async () => {
    const families: CatalogFamilySummary[] = [{
      familyName: 'iR',
      modelNames: ['iR ADV C3325i'],
      serviceItemCount: 0,
      noteCount: 0,
      exchangeRate: 6080,
      factor: 1.8,
    }];
    const buffer = await buildPriceListWorkbook(items, pricing, ['iR ADV C3325i'], [], [], families);
    const workbook = new ExcelJS.Workbook();
    await workbook.xlsx.load(buffer);
    const sheet = workbook.getWorksheet('iR ADV C3325i');

    expect(sheet?.getCell('B2').value).toBe(6080);
    expect(sheet?.getCell('D2').value).toBe(1.8);
    expect(sheet?.getCell('G6').value).toBe(109400);
  });

  it('uses a saved family exchange-rate override in the selected sheet', async () => {
    const families: CatalogFamilySummary[] = [{
      familyName: 'iR',
      modelNames: ['iR ADV C3325i'],
      serviceItemCount: 0,
      noteCount: 0,
      exchangeRate: 6080,
      factor: 1.8,
    }];
    const overriddenPricing = { ...pricing, familyExchangeRateOverrides: { IR: 7000 } };
    const buffer = await buildPriceListWorkbook(items, overriddenPricing, ['iR ADV C3325i'], [], [], families);
    const workbook = new ExcelJS.Workbook();
    await workbook.xlsx.load(buffer);
    const sheet = workbook.getWorksheet('iR ADV C3325i');

    expect(sheet?.getCell('B2').value).toBe(7000);
    expect(sheet?.getCell('G6').value).toBe(126000);
  });
});

describe('proforma export', () => {
  it('keeps the legacy fixed layout with capped parts and seven labor rows', async () => {
    const proforma: Proforma = {
      id: 'proforma-12345678',
      customerName: 'Cliente de prueba',
      customerContact: '0981 000000',
      serviceReport: 'Revisión preventiva',
      serviceReportNumber: '2921689',
      reference: 'REF-001',
      issuedAt: '2026-09-14T12:00:00.000Z',
      attendedBy: 'Técnico Data Systems',
      modelName: 'iR ADV C3325i',
      serialNumber: 'ABC123',
      mode: 'sin-contrato',
      status: 'draft',
      currency: 'PYG',
      pricing,
      createdAt: '2026-09-14T12:00:00.000Z',
      updatedAt: '2026-09-14T12:00:00.000Z',
      lines: [
        ...Array.from({ length: 13 }, (_, index) => ({
          id: `part-${index + 1}`,
          partId: `catalog-${index + 1}`,
          kind: 'part' as const,
          code: `PART-${String(index + 1).padStart(2, '0')}`,
          description: `Repuesto ${index + 1}`,
          quantity: index + 1,
          sourceStock: index === 0 ? 4 : 2,
          sourceDiscontinuedStatus: index === 1 ? 'discontinued' as const : 'active' as const,
          costLocal: null,
          unitPriceUsd: 10,
          unitPriceLocal: 1000,
          lineTotalLocal: (index + 1) * 1000,
        })),
        ...Array.from({ length: 8 }, (_, index) => ({
          id: `labor-${index + 1}`,
          partId: null,
          kind: 'labor' as const,
          code: '',
          description: `Trabajo ${index + 1}`,
          quantity: 1,
          costLocal: 500,
          unitPriceUsd: null,
          unitPriceLocal: 800,
          lineTotalLocal: 800,
        })),
      ],
      totalLocal: 91 * 1000 + 8 * 800,
    };

    const buffer = await buildProformaWorkbook(proforma);
    const workbook = new ExcelJS.Workbook();
    await workbook.xlsx.load(buffer);
    const sheet = workbook.getWorksheet('PROFORMA');

    expect(sheet).toBeDefined();
    expect(sheet?.getCell('D2').value).toContain('PRO-FORMA PRESUPUESTO');
    expect(sheet?.getCell('A8').value).toContain('INF. SERVICIO Nº: 2921689');
    expect(sheet?.getCell('F8').value).toContain('Ref.: REF-001');
    expect(sheet?.getCell('A14').value).toBe(1);
    expect(sheet?.getCell('B25').value).toBe('PART-12');
    expect(sheet?.getCell('B26').value).toBeNull();
    expect(sheet?.getCell('F14').value).toBe('');
    expect(sheet?.getCell('G14').value).toBe(4);
    expect(sheet?.getCell('F15').value).toBe('Descontinuado');
    expect(sheet?.getCell('G15').value).toBe(2);
    expect(sheet?.getCell('I14').value).toMatchObject({ formula: 'C14*1000', result: 1000 });
    expect(sheet?.getCell('D30').value).toBe('Trabajo 1');
    expect(sheet?.getCell('D36').value).toBe('Trabajo 7');
    expect(sheet?.getCell('E37').value).toBe('Total');
    expect(sheet?.getCell('I26').value).toMatchObject({ formula: 'SUM(I14:I25)', result: 78000 });
    expect(sheet?.getCell('I37').value).toMatchObject({ formula: 'SUM(I30:I36)', result: 5600 });
    expect(sheet?.getCell('I38').value).toBe(13800);
    expect(sheet?.getCell('I39').value).toMatchObject({ formula: 'I26+I37+I38', result: proforma.totalLocal });
    expect(workbook.getWorksheet('Líneas adicionales')?.getCell('B4').value).toBe('PART-13');
    expect(workbook.getWorksheet('Líneas adicionales')?.getCell('A5').value).toBe('Mano de obra');

    const logoBase64 = readFileSync(new URL('../../../public/datasystems-logo.png', import.meta.url)).toString('base64');
    const workbookWithLogo = new ExcelJS.Workbook();
    await workbookWithLogo.xlsx.load(await buildProformaWorkbook(proforma, `data:image/png;base64,${logoBase64}`));
    expect((workbookWithLogo as unknown as { model: { media?: unknown[] } }).model.media).toHaveLength(1);
  });

  it('mantiene USD en un contrato abierto detectado con esa moneda', async () => {
    const proforma: Proforma = {
      id: 'proforma-usd-123456',
      customerName: 'Cliente contractual',
      customerContact: '',
      serviceReport: '',
      serviceReportNumber: '',
      reference: 'CON-USD',
      issuedAt: '2026-09-14T12:00:00.000Z',
      attendedBy: '',
      modelName: '',
      serialNumber: '',
      mode: 'contrato-abierto',
      status: 'draft',
      currency: 'USD',
      pricing,
      createdAt: '2026-09-14T12:00:00.000Z',
      updatedAt: '2026-09-14T12:00:00.000Z',
      lines: [{
        id: 'usd-line-1',
        partId: null,
        kind: 'part',
        catalogKind: 'repuestos',
        code: 'USD-1',
        description: 'Repuesto contractual USD',
        quantity: 2,
        sourceStock: null,
        sourceDiscontinuedStatus: 'unknown',
        costLocal: null,
        unitPriceUsd: 12.5,
        unitPriceLocal: 74750,
        lineTotalLocal: 149500,
      }],
      totalLocal: 149500,
    };

    const workbook = new ExcelJS.Workbook();
    await workbook.xlsx.load(await buildProformaWorkbook(proforma));
    const sheet = workbook.getWorksheet('PROFORMA');

    expect(sheet?.getCell('I13').value).toBe('P. Venta USD');
    expect(sheet?.getCell('I14').value).toMatchObject({ formula: 'C14*12.5', result: 25 });
    expect(sheet?.getCell('I39').value).toMatchObject({ result: 25 });
    expect(sheet?.getCell('I39').numFmt).toBe('"US$ "#,##0.00');
  });
});
