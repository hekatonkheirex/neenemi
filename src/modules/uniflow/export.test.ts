import ExcelJS from 'exceljs';
import { describe, expect, it } from 'vitest';
import { buildUniflowWorkbook, uniflowFileName } from './export';
import type { UniflowConfigurationSummary, UniflowSku } from './types';

const sku = (label: string, code: string, price: number): UniflowSku => ({ minQty: 1, maxQty: null, label, sku: code, price });

const summary: UniflowConfigurationSummary = {
  months: 36,
  addedDevices: [{ modelName: 'iR ADV DX 527i', quantity: 3, type: 'T1', color: 'Monocromo', withCIP: true }],
  t1TotalQty: 3, t2TotalQty: 0, t1SKU: sku('1', 'T1-SKU', 10), t2SKU: null,
  t1TotalCost: 30, t2TotalCost: 0,
  t1CIPQty: 3, t2CIPQty: 0, t1CIPSKU: sku('1', 'CIP-SKU', 4), t2CIPSKU: null,
  t1CIPTotalCost: 12, t2CIPTotalCost: 0,
  monthlyTotal: 42, annualTotal: 504, contractTotal: 1512,
};

async function load(results: UniflowConfigurationSummary, client: string) {
  const workbook = new ExcelJS.Workbook();
  await workbook.xlsx.load(await buildUniflowWorkbook(results, client));
  return workbook.getWorksheet('Configuración uniFLOW')!;
}

describe('uniflow export', () => {
  it('lists devices, only licenses with quantity, and the three totals', async () => {
    const sheet = await load(summary, '  Cliente SA ');
    const column = (n: number) => sheet.getColumn(n).values.slice(1);

    expect(sheet.getCell('B2').value).toBe('Cliente SA');
    expect(sheet.getCell('D2').value).toBe(36);
    expect(sheet.getCell('A7').value).toBe('iR ADV DX 527i');
    expect(sheet.getCell('E7').value).toBe('Sí');
    expect(column(1)).toContain('T1-SKU');
    expect(column(1)).toContain('CIP-SKU');
    expect(column(1)).not.toContain('T2-SKU');
    expect(column(5)).toEqual(expect.arrayContaining([42, 504, 1512]));
    expect(column(4)).toContain('Total contrato (36 meses)');
  });

  it('falls back to a placeholder client and skips licenses with zero quantity', async () => {
    const sheet = await load({ ...summary, t1CIPQty: 0 }, '   ');
    expect(sheet.getCell('B2').value).toBe('Sin especificar');
    expect(sheet.getColumn(1).values).not.toContain('CIP-SKU');
  });

  it('builds a safe file name', () => {
    expect(uniflowFileName('A/B: "C" D')).toMatch(/^configuracion-uniflow-AB_C_D-\d{4}-\d{2}-\d{2}\.xlsx$/);
    expect(uniflowFileName('  ')).toMatch(/^configuracion-uniflow-cliente-/);
  });
});
