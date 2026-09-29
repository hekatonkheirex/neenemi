import type { Workbook as ExcelWorkbook } from 'exceljs';
import type { MaintenanceAnalysis } from './analysis';
import type { MaintenanceImportSummary } from './repository';

const XLSX_MIME = 'application/vnd.openxmlformats-officedocument.spreadsheetml.sheet';
type ExcelBuffer = ReturnType<ExcelWorkbook['xlsx']['writeBuffer']> extends Promise<infer Value> ? Value : never;

export async function buildMaintenanceWorkbook(
  analyses: readonly MaintenanceAnalysis[],
  summary: MaintenanceImportSummary | null,
  months: number,
): Promise<ExcelBuffer> {
  const { Workbook } = await import('exceljs');
  const workbook = new Workbook();
  workbook.creator = 'DCSS Suite';

  const overview = workbook.addWorksheet('Resumen');
  overview.addRow(['REPORTE DE MANTENIMIENTO DATA SYSTEMS']);
  overview.addRow(['Fuente', summary?.sourceName ?? 'Base compartida']);
  overview.addRow(['Ventana analizada', `Últimos ${months} meses`]);
  overview.addRow(['Equipos en el reporte', analyses.length]);
  overview.addRow(['Críticos', analyses.filter((analysis) => analysis.status === 'CRÍTICO').length]);
  overview.addRow(['En atención', analyses.filter((analysis) => analysis.status === 'ATENCIÓN').length]);
  overview.addRow(['No reconocidos', analyses.filter((analysis) => analysis.status === 'NO_RECONOCIDO').length]);
  overview.addRow([]);
  overview.addRow([
    'Cliente',
    'Contrato / OV',
    'Modelo',
    'Serie',
    'Períodos',
    'Promedio copias',
    'Último contador',
    'Óptimo actual',
    'Ratio',
    'Desgaste aplicado',
    'Estado',
    'Acción recomendada',
  ]);
  analyses.forEach((analysis) => {
    overview.addRow([
      analysis.customerName,
      analysis.contractReference,
      analysis.modelLabel,
      analysis.serialNumber,
      analysis.periods.length,
      analysis.averageCopies,
      analysis.latestCounter,
      analysis.optimalMonthly,
      analysis.ratio,
      analysis.appliedWaste,
      analysis.status,
      analysis.recommendedAction,
    ]);
  });

  const detail = workbook.addWorksheet('Detalle por período');
  detail.addRow(['DETALLE DE LECTURAS Y TRAZABILIDAD']);
  detail.addRow(['Fuente', summary?.sourceName ?? 'Base compartida', 'Ventana', `Últimos ${months} meses`]);
  detail.addRow([]);
  detail.addRow([
    'Cliente',
    'Contrato / OV',
    'Modelo',
    'Serie',
    'Período',
    'Papel',
    'Copias',
    'Contador',
    'Óptimo mensual',
    'Ratio',
    'Desgaste aplicado',
    'Estado',
    'Hoja origen',
    'Fila origen',
    'Campos de origen',
  ]);
  analyses.forEach((analysis) => {
    analysis.periods.forEach((period) => {
      detail.addRow([
        analysis.customerName,
        analysis.contractReference,
        analysis.modelLabel,
        analysis.serialNumber,
        period.period,
        period.paperType,
        period.copies,
        period.counter,
        period.optimalMonthly,
        period.ratio,
        period.appliedWaste,
        period.status,
        period.sourceSheetName ?? '',
        period.sourceRowNumber ?? '',
        (period.sourceDetails ?? []).map((source) => `${source.label}: ${source.value}`).join(' · '),
      ]);
    });
  });

  styleHeader(overview.getRow(1));
  styleHeader(overview.getRow(9));
  styleHeader(detail.getRow(1));
  styleHeader(detail.getRow(4));
  setWidths(overview, [30, 18, 32, 18, 12, 16, 16, 16, 12, 18, 18, 72]);
  setWidths(detail, [30, 18, 32, 18, 12, 18, 14, 14, 16, 12, 18, 18, 20, 12, 72]);
  overview.getColumn(9).numFmt = '0.00';
  overview.getColumn(10).numFmt = '0.00%';
  detail.getColumn(9).numFmt = '0.00';
  detail.getColumn(10).numFmt = '0.00%';
  overview.views = [{ state: 'frozen', ySplit: 9 }];
  detail.views = [{ state: 'frozen', ySplit: 4 }];
  overview.autoFilter = { from: { row: 9, column: 1 }, to: { row: overview.rowCount, column: 12 } };
  detail.autoFilter = { from: { row: 4, column: 1 }, to: { row: detail.rowCount, column: 15 } };

  return workbook.xlsx.writeBuffer();
}

export async function exportMaintenanceWorkbook(
  analyses: readonly MaintenanceAnalysis[],
  summary: MaintenanceImportSummary | null,
  months: number,
  fileNamePrefix = 'mantenimiento',
): Promise<void> {
  const buffer = await buildMaintenanceWorkbook(analyses, summary, months);
  download(buffer, `${fileNamePrefix}-${dateStamp()}.xlsx`);
}

function styleHeader(row: { font: unknown; fill: unknown }): void {
  row.font = { bold: true, color: { argb: 'FFFFFFFF' } };
  row.fill = { type: 'pattern', pattern: 'solid', fgColor: { argb: '2456A6' } };
}

function setWidths(sheet: { getColumn(index: number): { width?: number } }, widths: readonly number[]): void {
  widths.forEach((width, index) => {
    sheet.getColumn(index + 1).width = width;
  });
}

function download(buffer: unknown, fileName: string): void {
  const blob = new Blob([buffer as BlobPart], { type: XLSX_MIME });
  const url = URL.createObjectURL(blob);
  const anchor = document.createElement('a');
  anchor.href = url;
  anchor.download = fileName;
  anchor.click();
  URL.revokeObjectURL(url);
}

function dateStamp(): string {
  return new Date().toISOString().slice(0, 10);
}
