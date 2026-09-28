import ExcelJS from 'exceljs';
import { describe, expect, it } from 'vitest';
import { buildMpsConsumablesWorkbook } from './export';
import type { MpsModel } from './repository';

const model: MpsModel = {
  id: 'mps-1',
  modelId: 'legacy-1',
  brand: 'Canon',
  modelLabel: 'iR ADV C3325i',
  speedPpm: 25,
  isColor: true,
  recVolumeMin: 1000,
  recVolumeMax: 10000,
  isCustom: false,
  isEditable: false,
  consumables: [
    { id: 'toner-k', name: 'Tóner negro', type: 'toner', yieldPages: 36000, color: 'black', sku: 'C-EXV 55 BK' },
    { id: 'drum-k', name: 'Unidad de tambor', type: 'drum', yieldPages: 120000, color: 'monochrome', sku: 'NPG-67 DRUM' },
  ],
};

describe('MPS consumables export', () => {
  it('exports the selected model ficha without requiring a volume projection', async () => {
    const buffer = await buildMpsConsumablesWorkbook(model);
    const workbook = new ExcelJS.Workbook();
    await workbook.xlsx.load(buffer);

    expect(workbook.worksheets.map((sheet) => sheet.name)).toEqual(['Consumibles y Repuestos']);
    const sheet = workbook.getWorksheet('Consumibles y Repuestos');
    expect(sheet?.getCell('A1').value).toBe('LISTADO OFICIAL DE INSUMOS Y PARTES CONSUMIBLES CANON MPS');
    expect(sheet?.getCell('A2').value).toBe('Especificaciones técnicas oficiales de fábrica');
    expect(sheet?.getCell('B4').value).toBe('Canon iR ADV C3325i');
    expect(sheet?.getCell('B5').value).toBe('25 PPM');
    expect(sheet?.getCell('A10').value).toBe('Nombre del Consumible / Repuesto');
    expect(sheet?.getCell('A11').value).toBe('Tóner negro');
    expect(sheet?.getCell('C11').value).toBe('Tóner');
    expect(sheet?.getCell('E12').value).toBe(120000);
  });
});
