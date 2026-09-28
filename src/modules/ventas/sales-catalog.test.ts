import ExcelJS from 'exceljs';
import { describe, expect, it } from 'vitest';
import { parseSalesCatalogWorkbook } from './sales-catalog';

async function makeWorkbookBuffer(): Promise<Uint8Array> {
  const workbook = new ExcelJS.Workbook();
  const sheet = workbook.addWorksheet('Catálogo');
  sheet.addRow(['Catálogo de Proformas']);
  sheet.addRow(['Categoría', 'NroParte', 'Descripción', 'Precio $', 'Precio Gs', 'Stock', 'Descontinuado']);
  sheet.addRow(['Tóner', 'CEXV-55', 'TONER NEGRO', '12,50', '74.750', 8, 'No']);
  sheet.addRow(['Tóner', 'CEXV-55', 'TONER NEGRO ACTUALIZADO', '13,00', '77.740', 4, 'No']);
  sheet.addRow(['Tóner', '###', 'Fila inválida', 1, 2, 1, 'No']);
  sheet.addRow(['Tóner', '0488C003BA', 'CILINDRO GPR-55', 966.27, 5874922, 0, 'Sí']);
  return new Uint8Array(await workbook.xlsx.writeBuffer());
}

describe('sales catalog parser', () => {
  it('reads the legacy Proformas catalog with prices, stock, status and duplicate accounting', async () => {
    const parsed = await parseSalesCatalogWorkbook(await makeWorkbookBuffer(), 'consumibles', 'CONSUMIBLES_SISTEMA_ING.xlsx');

    expect(parsed.meta).toMatchObject({
      kind: 'consumibles',
      rowCount: 2,
      invalidRows: 1,
      duplicateRows: 1,
      hasDiscontinuedColumn: true,
    });
    expect(parsed.items).toEqual([
      expect.objectContaining({
        code: 'CEXV-55',
        description: 'TONER NEGRO ACTUALIZADO',
        priceUsd: 13,
        priceLocal: 77740,
        stock: 4,
        discontinued: 'active',
      }),
      expect.objectContaining({
        code: '0488C003BA',
        priceUsd: 966.27,
        priceLocal: 5874922,
        discontinued: 'discontinued',
      }),
    ]);
  });
});
