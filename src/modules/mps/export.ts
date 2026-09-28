import type { MpsAnalysis } from './analysis';
import type { MpsModel, MpsProjection } from './repository';

const XLSX_MIME = 'application/vnd.openxmlformats-officedocument.spreadsheetml.sheet';

export async function exportMpsWorkbook(
  model: MpsModel,
  analysis: MpsAnalysis,
  projections: readonly MpsProjection[],
): Promise<void> {
  const { Workbook } = await import('exceljs');
  const workbook = new Workbook();
  workbook.creator = 'Data Systems Suite';

  const summary = workbook.addWorksheet('Resumen ejecutivo');
  summary.addRow(['REPORTE DE ESTIMACIÓN MPS CANON']);
  summary.addRow(['Modelo', `${model.brand} ${model.modelLabel}`, 'Fecha', dateStamp()]);
  summary.addRow(['Volumen mensual', analysis.monthlyVolume, 'Páginas año 1', analysis.annualPages]);
  summary.addRow(['Páginas en 5 años', analysis.fiveYearPages, 'Resmas equivalentes año 1', analysis.paperReams]);
  summary.addRow(['Unidades de insumos en 5 años', analysis.totalUnitsFiveYears, 'Ciclos acumulados', analysis.totalCyclesFiveYears]);
  summary.addRow(['Estado de volumen', volumeStatusLabel(analysis), 'Insumos críticos año 3', analysis.criticalConsumables]);
  summary.addRow(['Kits preventivos hasta año 5', analysis.preventiveKits]);
  summary.addRow([]);
  summary.addRow(['Ranking de demanda a 5 años']);
  summary.addRow(['Consumible', 'Tipo', 'SKU', 'Unidades', 'Ciclos', 'Participación']);
  analysis.ranking.forEach((entry) => {
    summary.addRow([entry.name, entry.type, entry.sku || 'Sin SKU', entry.units, entry.replacements, entry.share]);
  });

  const profile = workbook.addWorksheet('Ficha técnica');
  profile.addRow(['FICHA TÉCNICA DEL EQUIPO']);
  profile.addRow(['Marca', model.brand, 'Modelo', model.modelLabel]);
  profile.addRow(['Velocidad PPM', model.speedPpm ?? 'N/D', 'Tipo', model.isColor ? 'Color' : 'Monocromático']);
  profile.addRow(['Volumen mínimo mensual', model.recVolumeMin, 'Volumen máximo mensual', model.recVolumeMax]);
  profile.addRow([]);
  profile.addRow(['Consumible', 'Tipo', 'Color', 'SKU', 'Rendimiento (páginas)']);
  model.consumables.forEach((consumable) => {
    profile.addRow([
      consumable.name,
      consumable.type,
      consumable.color,
      consumable.sku || 'Sin SKU',
      consumable.yieldPages,
    ]);
  });

  const projection = workbook.addWorksheet('Proyección');
  projection.addRow(['PROYECCIÓN DE REEMPLAZOS']);
  projection.addRow(['Modelo', `${model.brand} ${model.modelLabel}`, 'Volumen mensual', analysis.monthlyVolume]);
  projection.addRow([]);
  projection.addRow(['Consumible', 'Tipo', 'Color', 'SKU', 'Rendimiento', 'Año', 'Ciclos', 'Unidades']);
  projections.forEach((item) => {
    item.years.forEach((year) => {
      projection.addRow([
        item.consumable.name,
        item.consumable.type,
        item.consumable.color,
        item.consumable.sku || 'Sin SKU',
        item.consumable.yieldPages,
        year.year,
        year.replacements,
        year.units,
      ]);
    });
  });

  styleHeader(summary.getRow(1));
  styleHeader(summary.getRow(10));
  styleHeader(profile.getRow(1));
  styleHeader(profile.getRow(6));
  styleHeader(projection.getRow(1));
  styleHeader(projection.getRow(4));
  setWidths(summary, [34, 20, 22, 20, 16, 18]);
  setWidths(profile, [32, 18, 22, 24, 22]);
  setWidths(projection, [32, 16, 18, 22, 18, 10, 16, 14]);
  summary.getColumn(6).numFmt = '0.0%';
  projection.getColumn(7).numFmt = '0.0';

  const buffer = await workbook.xlsx.writeBuffer();
  download(buffer, `proyeccion-mps-${safeFileName(model.modelLabel)}-${dateStamp()}.xlsx`);
}

export async function exportMpsConsumablesWorkbook(model: MpsModel): Promise<void> {
  const buffer = await buildMpsConsumablesWorkbook(model);
  download(buffer, `consumibles-mps-${safeFileName(model.modelLabel)}-${dateStamp()}.xlsx`);
}

export async function buildMpsConsumablesWorkbook(model: MpsModel): Promise<Uint8Array> {
  const { Workbook } = await import('exceljs');
  const workbook = new Workbook();
  workbook.creator = 'Data Systems Suite';

  const sheet = workbook.addWorksheet('Consumibles y Repuestos');
  sheet.addRow(['LISTADO OFICIAL DE INSUMOS Y PARTES CONSUMIBLES CANON MPS']);
  sheet.addRow(['Especificaciones técnicas oficiales de fábrica']);
  sheet.addRow([]);
  sheet.addRow(['Equipo:', `${model.brand} ${model.modelLabel}`]);
  sheet.addRow(['Velocidad de Impresión:', model.speedPpm === null ? 'N/D' : `${model.speedPpm} PPM`]);
  sheet.addRow(['Rango Mensual Diseñado:', `${model.recVolumeMin} - ${model.recVolumeMax} páginas/mes`]);
  sheet.addRow(['Color / Monocromo:', model.isColor ? 'Color' : 'Monocromo']);
  sheet.addRow(['Fecha de Exportación:', new Date().toLocaleString('es-PY')]);
  sheet.addRow([]);
  sheet.addRow([
    'Nombre del Consumible / Repuesto',
    'SKU / Número de Parte',
    'Categoría de Componente',
    'Color / Identificación',
    'Rendimiento del Componente (páginas)',
  ]);
  model.consumables.forEach((consumable) => {
    sheet.addRow([
      consumable.name,
      consumable.sku || 'N/D',
      consumableTypeLabel(consumable.type),
      consumable.color.toUpperCase(),
      consumable.yieldPages,
    ]);
  });

  styleHeader(sheet.getRow(1));
  styleHeader(sheet.getRow(10));
  setWidths(sheet, [36, 25, 28, 22, 34]);
  sheet.getColumn(5).numFmt = '#,##0';

  return new Uint8Array(await workbook.xlsx.writeBuffer());
}

function consumableTypeLabel(type: string): string {
  return {
    toner: 'Tóner',
    drum: 'Tambor',
    developer: 'Revelador',
    fuser: 'Fusor',
    belt: 'Banda',
    roller: 'Rodillo',
    other: 'Otro',
  }[type] ?? type;
}

function volumeStatusLabel(analysis: MpsAnalysis): string {
  if (analysis.volumeStatus === 'low') return 'Por debajo del rango recomendado';
  if (analysis.volumeStatus === 'high') return 'Por encima del rango recomendado';
  return 'Dentro del rango recomendado';
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

function safeFileName(value: string): string {
  return value
    .normalize('NFD')
    .replace(/[\u0300-\u036f]/g, '')
    .replace(/[^a-zA-Z0-9]+/g, '-')
    .replace(/^-+|-+$/g, '')
    .slice(0, 60)
    .toLowerCase() || 'modelo';
}

function dateStamp(): string {
  return new Date().toISOString().slice(0, 10);
}
