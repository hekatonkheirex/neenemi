import ExcelJS from 'exceljs';
import { describe, expect, it } from 'vitest';
import { parseCatalogWorkbook, parseLegacyCatalogJson } from './parser';

describe('parseCatalogWorkbook', () => {
  it('normalizes the Canon sheet into catalog records', async () => {
    const workbook = new ExcelJS.Workbook();
    const sheet = workbook.addWorksheet('Canon');
    sheet.addRow(['N° Parte', 'Descripción', 'Precio USD', 'Stock', 'Discontinuado']);
    sheet.addRow([' FK-123 ', 'KIT DE MANTENIMIENTO iR ADV C3325i', 12.5, 7, '']);
    sheet.addRow(['FC-456', 'RODILLO iR ADV C3325i', 4, 0, '2026-01-10']);

    const buffer = await workbook.xlsx.writeBuffer();
    const parsed = await parseCatalogWorkbook(new Uint8Array(buffer));

    expect(parsed.exchangeRate).toBe(6350);
    expect(parsed.modelFamilies).toEqual([
      expect.objectContaining({ familyName: 'Canon', modelName: 'iR ADV C3325i' }),
    ]);
    expect(parsed.parts).toEqual([
      expect.objectContaining({
        brand: 'Canon',
        code: 'FK-123',
        description: 'KIT DE MANTENIMIENTO iR ADV C3325i',
        models: ['iR ADV C3325i'],
        stock: 7,
        priceUsd: 12.5,
        priceLocal: 79375,
        costAvailable: true,
        discontinuedAt: null,
      }),
      expect.objectContaining({
        code: 'FC-456',
        stock: 0,
        priceLocal: 25400,
        costAvailable: true,
        discontinuedAt: '2026-01-10',
      }),
    ]);
  });

  it('accepts the XLSX exported by the legacy browser catalog', async () => {
    const workbook = new ExcelJS.Workbook();
    const sheet = workbook.addWorksheet('iR ADV C3325i');
    sheet.addRow(['N° Parte', 'Descripción', 'Stock', 'Precio USD', 'Precio Gs.', 'Discontinuado']);
    sheet.addRow(['FK-123', 'KIT DE MANTENIMIENTO', 3, 10, 78000, 'Activo']);

    const parsed = await parseCatalogWorkbook(new Uint8Array(await workbook.xlsx.writeBuffer()));

    expect(parsed.parts).toEqual([
      expect.objectContaining({
        code: 'FK-123',
        models: ['iR ADV C3325i'],
        stock: 3,
        priceUsd: 10,
        priceLocal: 78000,
        discontinuedAt: null,
      }),
    ]);
  });

  it('keeps the Lista Canon sheet generic and preserves date-only discontinuations', async () => {
    const workbook = new ExcelJS.Workbook();
    const sheet = workbook.addWorksheet('Lista Canon');
    sheet.addRow(['Número', 'Descripción', 'Equivalencia', 'Recálculo PPP ME', 'Unidades en Stock', 'Discontinuado']);
    sheet.addRow(['0005C002AA', 'Impresora iPF 830', '', 4801.4, 2, new Date('2023-12-31T00:00:00Z')]);

    const parsed = await parseCatalogWorkbook(new Uint8Array(await workbook.xlsx.writeBuffer()));

    expect(parsed.parts).toEqual([
      expect.objectContaining({
        code: '0005C002AA',
        models: ['iPF 830'],
        priceUsd: 4801.4,
        priceLocal: 30488890,
        discontinuedAt: '2023-12-31',
      }),
    ]);
  });

  it('uses the Equivalencia column as a model association in the general Canon list', async () => {
    const workbook = new ExcelJS.Workbook();
    const sheet = workbook.addWorksheet('Lista Canon');
    sheet.addRow(['Número', 'Descripción', 'Equivalencia', 'Recálculo PPP ME', 'Unidades en Stock']);
    sheet.addRow(['FE8-9296-010', 'Rodillo de transferencia', 'IRADV 4545', 12, 3]);
    sheet.addRow(['FM4-1234-000', 'Rodillo de alimentación', 'IR2525/2535', 8, 1]);

    const parsed = await parseCatalogWorkbook(new Uint8Array(await workbook.xlsx.writeBuffer()));

    expect(parsed.parts).toEqual([
      expect.objectContaining({
        code: 'FE8-9296-010',
        models: ['IRADV 4545'],
        stock: 3,
        priceUsd: 12,
        priceLocal: 76200,
      }),
      expect.objectContaining({
        code: 'FM4-1234-000',
        models: ['IR2525', 'IR2535'],
        stock: 1,
        priceUsd: 8,
        priceLocal: 50800,
      }),
    ]);
  });

  it('imports every repeated legacy model block and restores its commercial rows', async () => {
    const workbook = new ExcelJS.Workbook();
    const sheet = workbook.addWorksheet('Listado de precios');
    const headers = ['Código', 'Descripción', 'Disc', 'Stock', 'Costo USD', 'Venta USD', 'Precio Gs', 'Precio venta Gs'];
    sheet.addRow(['Canon', 'iR ADV C3325i']);
    sheet.addRow(['Usa tóner de alta capacidad.']);
    sheet.addRow(['T.C.: 5980 · Factor: 1.8 · Mano de obra: Gs 80000']);
    sheet.addRow([]);
    sheet.addRow(headers);
    sheet.addRow(['FK-123', 'KIT DE MANTENIMIENTO', '', 3, 10, 18, 107400, 107400]);
    sheet.addRow(['', 'Mano de obra por cambio de kit', '', '', '', '', 80000, 80000]);
    sheet.addRow(['', 'Mantenimiento preventivo', '', '', '', '', 320000, 320000]);
    sheet.addRow([]);
    sheet.addRow(['Canon', 'iR ADV C5535i']);
    sheet.addRow(['Nota del segundo modelo']);
    sheet.addRow(['T.C.: 5980 · Factor: 1.8 · Mano de obra: Gs 80000']);
    sheet.addRow([]);
    sheet.addRow(headers);
    sheet.addRow(['FK-123', 'KIT DE MANTENIMIENTO', '', 4, 10, 18, 107400, 107400]);
    sheet.addRow(['FK-555', 'RODILLO DE ARRASTRE', '', 1, 4, 7.2, 42912, 42912]);
    const secondSheet = workbook.addWorksheet('iR ADV C6730i');
    secondSheet.addRow(headers);
    secondSheet.addRow(['FK-888', 'KIT DE MANTENIMIENTO', '', 2, 8, 14.4, 85824, 85824]);
    const pantumSheet = workbook.addWorksheet('Lista de Pantum');
    pantumSheet.addRow(headers);
    pantumSheet.addRow(['PT-001', 'REPUESTO PANTUM', '', 9, 2, 3.6, 21420, 21420]);

    const parsed = await parseCatalogWorkbook(new Uint8Array(await workbook.xlsx.writeBuffer()));

    expect(parsed.parts).toEqual([
      expect.objectContaining({ code: 'FK-123', models: ['iR ADV C3325i', 'iR ADV C5535i'], stock: 4 }),
      expect.objectContaining({ code: 'FK-555', models: ['iR ADV C5535i'] }),
      expect.objectContaining({ code: 'FK-888', models: ['iR ADV C6730i'] }),
    ]);
    expect(parsed.parts.some((part) => part.code === 'PT-001')).toBe(false);
    expect(parsed.modelNotes).toEqual([
      expect.objectContaining({ modelName: 'iR ADV C3325i', note: 'Usa tóner de alta capacidad.' }),
      expect.objectContaining({ modelName: 'iR ADV C5535i', note: 'Nota del segundo modelo' }),
    ]);
    expect(parsed.modelFamilies).toEqual(expect.arrayContaining([
      expect.objectContaining({ familyName: 'Canon', modelName: 'iR ADV C3325i', exchangeRate: 5980, factor: 1.8 }),
      expect.objectContaining({ familyName: 'Canon', modelName: 'iR ADV C5535i', exchangeRate: 5980, factor: 1.8 }),
      expect.objectContaining({ familyName: 'Canon', modelName: 'iR ADV C6730i' }),
    ]));
    expect(parsed.serviceItems).toEqual([
      expect.objectContaining({ modelName: 'iR ADV C3325i', kind: 'labor', description: 'Mano de obra por cambio de kit' }),
      expect.objectContaining({ modelName: 'iR ADV C3325i', kind: 'fixed', fixedPriceLocal: 320000 }),
    ]);
  });

  it('recovers part families from the legacy Listado de Precios JSON shape', () => {
    const parsed = parseLegacyCatalogJson(JSON.stringify([
      {
        id: 'canon',
        name: 'Canon',
        tc: 7000,
        factor: 1.8,
        models: [
          {
            name: 'iR ADV C3325i',
            items: [
              { kind: 'part', code: 'FK-123', desc: 'KIT DE MANTENIMIENTO', stock: '2', costo: 10, ventaGs: 126000, disc: null, grupo: 'GPR-53', ref: 'REF-123', vida: '50.000 páginas' },
              { kind: 'labor', desc: 'Instalación' },
              { kind: 'fixed', desc: 'Mantenimiento preventivo', fixedGs: 320000 },
            ],
          },
          {
            name: 'iR ADV C5535i',
            items: [{ code: 'FK-123', desc: 'KIT DE MANTENIMIENTO', stock: 4, costo: null, ventaGs: null, disc: null }],
          },
        ],
      },
    ]));

    expect(parsed).toMatchObject({ canonCount: 1, exchangeRate: 7000 });
    expect(parsed.parts).toEqual([
      expect.objectContaining({
        code: 'FK-123',
        models: ['iR ADV C3325i', 'iR ADV C5535i'],
        stock: 4,
        priceUsd: 10,
        costAvailable: true,
        priceLocal: 126000,
        markup: 0.8,
        discontinuedAt: null,
        group: 'GPR-53',
        reference: 'REF-123',
        usefulLife: '50.000 páginas',
      }),
    ]);
    expect(parsed.modelFamilies).toEqual(expect.arrayContaining([
      expect.objectContaining({ familyName: 'Canon', modelName: 'iR ADV C3325i', exchangeRate: 7000, factor: 1.8 }),
      expect.objectContaining({ familyName: 'Canon', modelName: 'iR ADV C5535i', exchangeRate: 7000, factor: 1.8 }),
    ]));
    expect(parsed.modelNotes).toEqual([]);
    expect(parsed.serviceItems).toEqual([
      expect.objectContaining({ kind: 'labor', modelName: 'iR ADV C3325i', description: 'Instalación', fixedPriceLocal: null }),
      expect.objectContaining({ kind: 'fixed', modelName: 'iR ADV C3325i', description: 'Mantenimiento preventivo', fixedPriceLocal: 320000 }),
    ]);
  });

  it('keeps technical model notes from the legacy family JSON', () => {
    const parsed = parseLegacyCatalogJson(JSON.stringify({
      families: [{
        id: 'canon',
        name: 'Canon',
        models: [{
          name: 'iR ADV C3325i',
          note: 'Usa tóner de alta capacidad.',
          items: [{ code: 'FK-123', desc: 'Kit', stock: 1, costo: 1, ventaGs: 7000 }],
        }],
      }],
    }));

    expect(parsed.modelNotes).toEqual([
      expect.objectContaining({ familyName: 'Canon', modelName: 'iR ADV C3325i', note: 'Usa tóner de alta capacidad.' }),
    ]);
  });

  it('keeps a planilla price when the source has no USD cost', () => {
    const parsed = parseLegacyCatalogJson(JSON.stringify({
      families: [{
        id: 'canon',
        name: 'Canon',
        models: [{
          name: 'iR ADV C3325i',
          items: [{ code: 'FK-999', desc: 'Parte sin costo', stock: 1, costo: null, ventaGs: 135500 }],
        }],
      }],
    }));

    expect(parsed.parts).toEqual([
      expect.objectContaining({
        code: 'FK-999',
        priceUsd: 0,
        priceLocal: 135500,
        costAvailable: false,
      }),
    ]);
  });

  it('rejects workbooks without a recognizable catalog sheet', async () => {
    const workbook = new ExcelJS.Workbook();
    workbook.addWorksheet('Other').addRow(['Part Number', 'Description']);
    const buffer = await workbook.xlsx.writeBuffer();

    await expect(parseCatalogWorkbook(new Uint8Array(buffer))).rejects.toThrow(
      'No se encontró una hoja técnica válida de Canon.',
    );
  });
});
