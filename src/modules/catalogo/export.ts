import type { Workbook as ExcelWorkbook } from 'exceljs';
import type { CatalogPart } from './repository';

const XLSX_MIME = 'application/vnd.openxmlformats-officedocument.spreadsheetml.sheet';
type ExcelBuffer = Awaited<ReturnType<ExcelWorkbook['xlsx']['writeBuffer']>>;

export async function buildCatalogWorkbook(parts: readonly CatalogPart[]): Promise<ExcelBuffer> {
  const { Workbook } = await import('exceljs');
  const workbook = new Workbook();
  workbook.creator = 'Data Systems Suite';
  const sheet = workbook.addWorksheet('Catálogo Canon');

  sheet.addRow(['Catálogo Canon · Data Systems Suite']);
  sheet.addRow(['Registros exportados', parts.length]);
  sheet.addRow([]);
  const headerRow = sheet.addRow([
    'N° parte',
    'Descripción',
    'Modelos compatibles',
    'Stock',
    'Precio USD',
    'Precio Gs.',
    'Estado',
    'Grupo',
    'Referencia',
    'Vida útil',
  ]);

  for (const part of parts) {
    sheet.addRow([
      part.code,
      part.description,
      part.models.join(', '),
      part.stock,
      part.costAvailable === false ? '' : part.priceUsd,
      part.priceLocal,
      part.discontinuedAt
        ? `Baja ${part.discontinuedAt}`
        : part.costAvailable === false
          ? 'Referencia planilla'
          : 'Activo',
      part.group ?? '',
      part.reference ?? '',
      part.usefulLife ?? '',
    ]);
  }

  headerRow.font = { bold: true, color: { argb: 'FFFFFFFF' } };
  headerRow.fill = { type: 'pattern', pattern: 'solid', fgColor: { argb: 'FF1A2C4C' } };
  headerRow.alignment = { horizontal: 'center', vertical: 'middle' };
  sheet.getColumn(1).width = 18;
  sheet.getColumn(2).width = 48;
  sheet.getColumn(3).width = 34;
  sheet.getColumn(4).width = 12;
  sheet.getColumn(5).width = 15;
  sheet.getColumn(6).width = 18;
  sheet.getColumn(7).width = 20;
  sheet.getColumn(8).width = 24;
  sheet.getColumn(9).width = 20;
  sheet.getColumn(10).width = 18;
  sheet.getColumn(5).numFmt = '$#,##0.00';
  sheet.getColumn(6).numFmt = '₲ #,##0';
  sheet.autoFilter = { from: 'A4', to: `J${Math.max(4, parts.length + 4)}` };
  sheet.views = [{ state: 'frozen', ySplit: 4 }];

  return workbook.xlsx.writeBuffer();
}

export async function exportCatalogWorkbook(parts: readonly CatalogPart[]): Promise<void> {
  const buffer = await buildCatalogWorkbook(parts);
  const blob = new Blob([buffer as BlobPart], { type: XLSX_MIME });
  const url = URL.createObjectURL(blob);
  const anchor = document.createElement('a');
  anchor.href = url;
  anchor.download = `catalogo-canon-${new Date().toISOString().slice(0, 10)}.xlsx`;
  anchor.click();
  URL.revokeObjectURL(url);
}
