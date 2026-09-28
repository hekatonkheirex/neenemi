import ExcelJS from 'exceljs';
import { describe, expect, it } from 'vitest';
import { parseOpenContractPdf, parseOpenContractWorkbook } from './open-contract';

async function makeWorkbookBuffer() {
  const workbook = new ExcelJS.Workbook();
  const sheet = workbook.addWorksheet('Contrato');
  sheet.addRow(['Tipo', 'Código', 'Descripción', 'Precio Fijo']);
  sheet.addRow(['Repuesto', '0488C003BA', 'Cilindro GPR-55', '5.874.922']);
  sheet.addRow(['Consumible', 'CEXV-55', 'Tóner negro', '125.000']);
  return new Uint8Array(await workbook.xlsx.writeBuffer());
}

function makePdfBuffer() {
  const content = [
    'BT',
    '1 0 0 1 50 700 Tm',
    '(Codigo Descripcion Precio Gs) Tj',
    '1 0 0 1 50 680 Tm',
    '(1 0488C003BA CILINDRO GPR-55 5.874.922) Tj',
    '1 0 0 1 50 660 Tm',
    '(2 CEXV-55 TONER NEGRO 125.000) Tj',
    'ET',
  ].join('\n');
  const pdf = `%PDF-1.4\n1 0 obj\n<< /Length ${content.length} >>\nstream\n${content}endstream\nendobj\n%%EOF`;
  return new TextEncoder().encode(pdf);
}

describe('parseOpenContractWorkbook', () => {
  it('detecta tipo y conserva el precio fijo local', async () => {
    const parsed = await parseOpenContractWorkbook(await makeWorkbookBuffer(), 'contrato.xlsx');

    expect(parsed.meta).toMatchObject({
      rowCount: 2,
      sourceFormat: 'xlsx',
      priceCurrency: 'local',
      hasKindColumn: true,
    });
    expect(parsed.items[0]).toMatchObject({
      code: '0488C003BA',
      kind: 'repuestos',
      priceLocal: 5874922,
      priceUsd: null,
    });
    expect(parsed.items[1]).toMatchObject({ code: 'CEXV-55', kind: 'consumibles', priceLocal: 125000 });
  });

  it('lee filas tabulares de un PDF de texto y clasifica por descripción', async () => {
    const parsed = await parseOpenContractPdf(makePdfBuffer(), 'contrato.pdf');

    expect(parsed.meta).toMatchObject({ rowCount: 2, sourceFormat: 'pdf', priceCurrency: 'local', hasKindColumn: false });
    expect(parsed.items.map((item) => ({ code: item.code, kind: item.kind, price: item.priceLocal }))).toEqual([
      { code: '0488C003BA', kind: 'repuestos', price: 5874922 },
      { code: 'CEXV-55', kind: 'consumibles', price: 125000 },
    ]);
  });

  it('detecta precios en USD cuando el encabezado lo especifica', async () => {
    const workbook = new ExcelJS.Workbook();
    const sheet = workbook.addWorksheet('Contrato');
    sheet.addRow(['Part Number', 'Description', 'Price USD']);
    sheet.addRow(['PART-1', 'Part in dollars', '12.50']);

    const parsed = await parseOpenContractWorkbook(new Uint8Array(await workbook.xlsx.writeBuffer()), 'contrato-usd.xlsx');

    expect(parsed.meta.priceCurrency).toBe('usd');
    expect(parsed.items[0]).toMatchObject({ priceUsd: 12.5, priceLocal: null });
  });
});
