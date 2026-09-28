import ExcelJS from 'exceljs';
import { describe, expect, it } from 'vitest';
import { buildCatalogWorkbook } from './export';
import type { CatalogPart } from './repository';

const parts: CatalogPart[] = [{
  id: 'part-1',
  brand: 'Canon',
  code: 'FK-001',
  description: 'Kit de mantenimiento',
  models: ['iR ADV C3325i', 'iR ADV C5535i'],
  stock: 4,
  priceUsd: 10,
  priceLocal: 63500,
  markup: 0,
  discontinuedAt: null,
  group: 'GPR-53',
  reference: 'REF-123',
  usefulLife: '50.000 páginas',
}];

describe('catalog export', () => {
  it('exports the filtered catalog with both currencies and model associations', async () => {
    const buffer = await buildCatalogWorkbook(parts);
    const workbook = new ExcelJS.Workbook();
    await workbook.xlsx.load(buffer);
    const sheet = workbook.getWorksheet('Catálogo Canon');

    expect(sheet?.getCell('A4').value).toBe('N° parte');
    expect(sheet?.getCell('C5').value).toBe('iR ADV C3325i, iR ADV C5535i');
    expect(sheet?.getCell('E5').value).toBe(10);
    expect(sheet?.getCell('F5').value).toBe(63500);
    expect(sheet?.getCell('G5').value).toBe('Activo');
    expect(sheet?.getCell('H5').value).toBe('GPR-53');
    expect(sheet?.getCell('I5').value).toBe('REF-123');
    expect(sheet?.getCell('J5').value).toBe('50.000 páginas');
  });
});
