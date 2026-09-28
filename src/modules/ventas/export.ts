import type { Workbook as ExcelWorkbook, Worksheet } from 'exceljs';
import { normalizeModelName, type CatalogFamilySummary, type CatalogModelNote, type CatalogServiceItem } from '../catalogo/repository';
import { calculateSalePrice } from './pricing';
import type { PricingSettings, Proforma, ProformaLine, SalesPricePart } from './types';

const XLSX_MIME = 'application/vnd.openxmlformats-officedocument.spreadsheetml.sheet';
const PRICE_HEADERS = ['Código', 'Descripción', 'Modelos', 'Stock', 'Costo USD', 'Venta USD', 'Precio Gs.', 'Estado', 'Grupo', 'Referencia', 'Vida útil'];
type ExcelBuffer = ReturnType<ExcelWorkbook['xlsx']['writeBuffer']> extends Promise<infer Value> ? Value : never;

export const PROFORMA_ITEM_ROWS = 12;
export const PROFORMA_LABOR_ROWS = 7;

const PROFORMA_FIRST_ITEM_ROW = 14;
const PROFORMA_ITEMS_SUBTOTAL_ROW = 26;
const PROFORMA_FIRST_LABOR_ROW = 30;
const PROFORMA_LABOR_TOTAL_ROW = 37;
const PROFORMA_GRAND_TOTAL_ROW = 39;
const PROFORMA_GS_FORMAT = '"Gs. "#,##0';
const PROFORMA_USD_FORMAT = '"US$ "#,##0.00';
const PROFORMA_BLACK = 'FF000000';
const PROFORMA_NAVY = 'FF1A2C4C';
const PROFORMA_NO_FILL = { type: 'pattern' as const, pattern: 'none' as const };
const PROFORMA_COLUMN_WIDTHS = [4.28516, 17.28516, 6.28516, 43.14063, 7.57031, 12.57031, 7.57031, 13, 19.14063];
const PROFORMA_LOGO_URL = '/datasystems-logo.png';
const PROFORMA_LOGO_WIDTH = 134;
const PROFORMA_LOGO_HEIGHT = 36;
const EXCEL_EMU_PER_PIXEL = 9525;
const PROFORMA_LOGO_COLUMN_OFFSET_EMU = 6 * EXCEL_EMU_PER_PIXEL;
const PROFORMA_LOGO_ROW_OFFSET_EMU = Math.floor(0.6 * 10 * 10_000);

type ProformaCellStyle = {
  font?: object;
  fill?: object;
  alignment?: object;
  border?: object;
  numFmt?: string;
};

export async function buildPriceListWorkbook(
  items: readonly SalesPricePart[],
  pricing: PricingSettings,
  selectedModels: readonly string[] = [],
  serviceItems: readonly CatalogServiceItem[] = [],
  modelNotes: readonly CatalogModelNote[] = [],
  familySummaries: readonly CatalogFamilySummary[] = [],
): Promise<ReturnType<ExcelWorkbook['xlsx']['writeBuffer']> extends Promise<infer Value> ? Value : never> {
  const { Workbook } = await import('exceljs');
  const workbook = new Workbook();
  workbook.creator = 'Data Systems Suite';
  const models = normalizeSelectedModels(selectedModels);
  const summaryItems = models.length > 0
    ? uniqueItems(items.filter((item) => models.some((model) => item.models.some((itemModel) => sameModel(itemModel, model)))))
    : uniqueItems(items);
  const summaryServiceItems = models.length > 0
    ? uniqueServiceItems(serviceItems.filter((item) => models.some((model) => sameModel(item.modelName, model))))
    : uniqueServiceItems(serviceItems);

  addPriceListSheet(workbook, models.length > 0 ? 'Resumen' : 'Listado de precios', summaryItems, pricing, {
    selectedModels: models,
    serviceItems: summaryServiceItems,
  });

  const usedSheetNames = new Set(workbook.worksheets.map((sheet) => sheet.name));
  for (const model of models) {
    const modelPricing = pricingForModel(model, pricing, familySummaries);
    const modelItems = uniqueItems(items.filter((item) => item.models.some((itemModel) => sameModel(itemModel, model))))
      .map((item) => ({ ...item, ...calculateSalePrice(item, modelPricing) }));
    const modelServiceItems = uniqueServiceItems(serviceItems.filter((item) => sameModel(item.modelName, model)));
    const modelNote = modelNotes.find((note) => sameModel(note.modelName, model));
    const sheetName = uniqueSheetName(model, usedSheetNames);
    addPriceListSheet(workbook, sheetName, modelItems, modelPricing, {
      modelName: model,
      modelNote: modelNote?.note,
      serviceItems: modelServiceItems,
    });
  }

  return workbook.xlsx.writeBuffer();
}

export async function exportPriceList(
  items: readonly SalesPricePart[],
  pricing: PricingSettings,
  selectedModels: readonly string[] = [],
  serviceItems: readonly CatalogServiceItem[] = [],
  modelNotes: readonly CatalogModelNote[] = [],
  familySummaries: readonly CatalogFamilySummary[] = [],
): Promise<void> {
  const buffer = await buildPriceListWorkbook(items, pricing, selectedModels, serviceItems, modelNotes, familySummaries);
  download(buffer, `listado-precios-${dateStamp()}.xlsx`);
}

function pricingForModel(
  modelName: string,
  globalPricing: PricingSettings,
  familySummaries: readonly CatalogFamilySummary[],
): PricingSettings {
  const family = familySummaries.find((summary) => summary.modelNames.some((candidate) => sameModel(candidate, modelName)));
  if (!family) return globalPricing;
  const familyOverride = globalPricing.familyExchangeRateOverrides?.[normalizeModelName(family.familyName)];
  return {
    ...globalPricing,
    exchangeRate: familyOverride ?? family.exchangeRate ?? globalPricing.exchangeRate,
    factor: family.factor ?? globalPricing.factor,
  };
}

function addPriceListSheet(
  workbook: ExcelWorkbook,
  name: string,
  items: readonly SalesPricePart[],
  pricing: PricingSettings,
  options: {
    modelName?: string;
    modelNote?: string;
    selectedModels?: readonly string[];
    serviceItems?: readonly CatalogServiceItem[];
  },
): void {
  const sheet = workbook.addWorksheet(name);
  const title = options.modelName ? `Listado de precios · ${options.modelName}` : 'Listado de precios Data Systems';
  sheet.addRow([title]);
  sheet.addRow([
    'Tipo de cambio',
    pricing.exchangeRate,
    'Factor',
    pricing.factor,
    'Mano de obra Gs.',
    pricing.laborPrice,
  ]);
  if (options.modelName) {
    sheet.addRow(['Modelo', options.modelName]);
    if (options.modelNote) sheet.addRow(['Nota técnica', options.modelNote]);
  } else if (options.selectedModels && options.selectedModels.length > 0) {
    sheet.addRow(['Modelos seleccionados', options.selectedModels.join(' · ')]);
  }
  sheet.addRow([]);
  const headerRow = sheet.addRow(PRICE_HEADERS);
  for (const item of items) {
    sheet.addRow([
      item.code,
      item.description,
      options.modelName ?? item.models.join(', '),
      item.stock,
      item.costAvailable === false ? '' : item.priceUsd,
      item.costAvailable === false ? '' : item.salePriceUsd,
      item.salePriceLocal,
      item.discontinuedAt
        ? `Baja ${item.discontinuedAt}`
        : item.costAvailable === false
          ? 'Referencia planilla'
          : 'Activo',
      item.group ?? '',
      item.reference ?? '',
      item.usefulLife ?? '',
    ]);
  }
  const commercialItems = options.serviceItems ?? [];
  if (commercialItems.length > 0) {
    for (const item of commercialItems) {
      const price = item.kind === 'labor' ? pricing.laborPrice : item.fixedPriceLocal ?? 0;
      sheet.addRow([
        '',
        item.description,
        options.modelName ?? `${item.familyName} · ${item.modelName}`,
        '',
        '',
        '',
        price,
        item.kind === 'labor' ? 'Mano de obra' : 'Cargo fijo',
        '',
        '',
        '',
      ]);
    }
  } else {
    sheet.addRow(['', 'Mano de obra', options.modelName ?? 'Servicio general', '', '', '', pricing.laborPrice, 'Tarifa configurada', '', '', '']);
  }

  styleHeader(sheet.getRow(1));
  styleHeader(headerRow);
  sheet.getColumn(1).width = 18;
  sheet.getColumn(2).width = 42;
  sheet.getColumn(3).width = 32;
  sheet.getColumn(4).width = 12;
  sheet.getColumn(5).width = 14;
  sheet.getColumn(6).width = 14;
  sheet.getColumn(7).width = 16;
  sheet.getColumn(8).width = 20;
  sheet.getColumn(9).width = 24;
  sheet.getColumn(10).width = 20;
  sheet.getColumn(11).width = 18;
  sheet.getColumn(5).numFmt = '#,##0.0000';
  sheet.getColumn(6).numFmt = '#,##0.0000';
  sheet.getColumn(7).numFmt = '#,##0';
  sheet.views = [{ state: 'frozen', ySplit: headerRow.number }];
  sheet.autoFilter = {
    from: { row: headerRow.number, column: 1 },
    to: { row: sheet.rowCount, column: PRICE_HEADERS.length },
  };
}

function normalizeSelectedModels(values: readonly string[]): string[] {
  const unique = new Map<string, string>();
  for (const value of values) {
    const label = value.trim().replace(/\s+/g, ' ');
    if (label) unique.set(normalizeModelText(label), label);
  }
  return [...unique.values()];
}

function uniqueItems(items: readonly SalesPricePart[]): SalesPricePart[] {
  const unique = new Map<string, SalesPricePart>();
  for (const item of items) unique.set(item.id || normalizeModelText(item.code), item);
  return [...unique.values()];
}

function uniqueServiceItems(items: readonly CatalogServiceItem[]): CatalogServiceItem[] {
  const unique = new Map<string, CatalogServiceItem>();
  for (const item of items) unique.set(item.id || `${item.modelName}:${item.kind}:${item.description}`, item);
  return [...unique.values()];
}

function sameModel(left: string, right: string): boolean {
  return normalizeModelText(left) === normalizeModelText(right);
}

function normalizeModelText(value: string): string {
  return value.normalize('NFKD').replace(/[\u0300-\u036f]/g, '').trim().replace(/\s+/g, ' ').toUpperCase();
}

function uniqueSheetName(model: string, used: Set<string>): string {
  const base = model.replace(/[\\/*?:\[\]]/g, '-').trim().slice(0, 31) || 'Modelo';
  let candidate = base;
  let suffix = 2;
  while (used.has(candidate)) {
    const ending = ` (${suffix})`;
    candidate = `${base.slice(0, Math.max(1, 31 - ending.length))}${ending}`;
    suffix += 1;
  }
  used.add(candidate);
  return candidate;
}

export async function buildProformaWorkbook(proforma: Proforma, logoBase64?: string): Promise<ExcelBuffer> {
  const { Workbook } = await import('exceljs');
  const workbook = new Workbook();
  workbook.creator = 'Data Systems Suite';
  workbook.created = new Date(proforma.createdAt);
  const priceLabel = proformaPriceLabel(proforma.currency);

  const sheet = workbook.addWorksheet('PROFORMA', {
    properties: { defaultRowHeight: 15 },
    views: [{ state: 'normal', activeCell: 'H11', showGridLines: true, showRowColHeaders: true, zoomScale: 80, zoomScaleNormal: 100 }],
    pageSetup: {
      paperSize: 9,
      orientation: 'portrait',
      fitToPage: false,
      fitToWidth: 1,
      fitToHeight: 1,
      scale: 90,
      margins: { left: 0.7, right: 0.7, top: 0.75, bottom: 0.75, header: 0.3, footer: 0.3 },
    },
  });
  sheet.columns = PROFORMA_COLUMN_WIDTHS.map((width) => ({ width }));

  for (let row = 2; row <= 5; row += 1) sheet.getRow(row).height = 10;
  sheet.getRow(1).height = 15;
  if (logoBase64) {
    const logoId = workbook.addImage({ base64: logoBase64, extension: 'png' });
    sheet.addImage(logoId, {
      tl: {
        nativeCol: 0,
        nativeColOff: PROFORMA_LOGO_COLUMN_OFFSET_EMU,
        nativeRow: 1,
        nativeRowOff: PROFORMA_LOGO_ROW_OFFSET_EMU,
      } as never,
      ext: { width: PROFORMA_LOGO_WIDTH, height: PROFORMA_LOGO_HEIGHT },
      editAs: 'oneCell',
    });
    sheet.getCell('A2').border = proformaBorder(true, false, true, false) as never;
    paintProformaRange(sheet, 'A3:A5', { border: proformaBorder(true, false, false, false) });
    for (const column of ['B', 'C']) {
      sheet.getCell(`${column}2`).border = proformaBorder(false, false, true, false) as never;
    }
  } else {
    setProformaValue(sheet, 'A2:C5', 'DS\nData Systems\nSuite local', {
      font: { name: 'Arial', size: 10, bold: true, color: { argb: PROFORMA_NAVY } },
      alignment: { horizontal: 'center', vertical: 'middle', wrapText: true },
      border: proformaBorder(true, false, true, false),
    });
  }
  setProformaValue(sheet, 'D2:E5', 'PRO-FORMA PRESUPUESTO\nSERVICIO TECNICO COPIADORAS', {
    font: { name: 'Arial', size: 10, bold: true, color: { argb: PROFORMA_NAVY } },
    alignment: { horizontal: 'center', vertical: 'middle', wrapText: true },
    border: proformaTopBottomBorder(),
  });
  setProformaValue(sheet, 'I2:I3', 'FL-SER-01', {
    font: { name: 'Arial', size: 11, bold: true, color: { argb: PROFORMA_BLACK } },
    alignment: { horizontal: 'center', vertical: 'middle' },
    border: proformaRightTopBottomBorder(),
  });
  setProformaValue(sheet, 'I4:I5', 'REV.00', {
    font: { name: 'Arial', size: 11, bold: true, color: { argb: PROFORMA_BLACK } },
    alignment: { horizontal: 'center', vertical: 'middle' },
    border: proformaRightTopBottomBorder(),
  });

  const headerLabelStyle: ProformaCellStyle = {
    font: { name: 'Arial', size: 11, bold: true, color: { argb: PROFORMA_BLACK } },
    alignment: { horizontal: 'left', vertical: 'middle', wrapText: true },
    border: proformaThinBorder(),
  };
  const headerReferenceStyle: ProformaCellStyle = {
    font: { name: 'Arial', size: 10, bold: true, color: { argb: PROFORMA_BLACK } },
    alignment: { horizontal: 'center', vertical: 'middle', wrapText: true },
    border: proformaThinBorder(),
  };
  sheet.getRow(6).height = 22.5;
  setProformaValue(sheet, 'A6:I6', `CLIENTE: ${proforma.customerName.trim()}`, headerLabelStyle);
  sheet.getRow(7).height = 27;
  setProformaValue(sheet, 'A7:I7', `Contacto: ${proforma.customerContact.trim()}`, headerLabelStyle);
  sheet.getRow(8).height = 32;
  setProformaValue(sheet, 'A8:E8', `INF. SERVICIO Nº: ${proforma.serviceReportNumber.trim()} · ${proforma.serviceReport.trim()}`, headerLabelStyle);
  setProformaValue(sheet, 'F8:G8', `Ref.: ${proforma.reference.trim()}`, headerReferenceStyle);
  setProformaValue(sheet, 'H8:I8', `Fecha: ${proformaDate(proforma.issuedAt)}`, headerLabelStyle);
  sheet.getRow(9).height = 27;
  setProformaValue(sheet, 'A9:E9', `Atendido por: ${proforma.attendedBy.trim()}`, headerLabelStyle);
  setProformaValue(sheet, 'H9:I9', `Hora: ${proformaTime(proforma.issuedAt)}`, headerLabelStyle);
  sheet.getRow(10).height = 27;
  setProformaValue(sheet, 'A10:E10', `Modelo: ${proforma.modelName.trim()}`, headerLabelStyle);
  setProformaValue(sheet, 'H10:I10', `SERIE Nº: ${proforma.serialNumber.trim()}`, headerLabelStyle);

  setProformaValue(sheet, 'A12:I12', 'REPUESTOS A UTILIZAR', {
    font: { name: 'Arial', size: 10, bold: true, color: { argb: PROFORMA_BLACK } },
    fill: PROFORMA_NO_FILL,
    alignment: { horizontal: 'center', vertical: 'bottom' },
    border: proformaBottomBorder(),
  });
  const tableHeaderStyle: ProformaCellStyle = {
    font: { name: 'Arial', size: 10, bold: true, color: { argb: PROFORMA_BLACK } },
    fill: PROFORMA_NO_FILL,
    alignment: { horizontal: 'center', vertical: 'bottom', wrapText: true },
    border: proformaThinBorder(),
  };
  for (const [range, value] of [
    ['A13', 'Item'],
    ['B13', 'Cod.'],
    ['C13', 'Cant.'],
    ['D13:E13', 'Descripción'],
    ['F13', 'Discon'],
    ['G13', 'Stock'],
    ['H13', 'Costo Unit'],
    ['I13', `P. Venta ${priceLabel}`],
  ] as const) {
    setProformaValue(sheet, range, value, tableHeaderStyle);
  }

  const allPartLines = proforma.lines.filter((line) => line.kind === 'part');
  const partLines = allPartLines.slice(0, PROFORMA_ITEM_ROWS);
  const itemHeights = [21.75, 21.75, 18, 18, 18, 18, 18, 18, 19.5, 17.25, 18, 20.25];
  for (let index = 0; index < PROFORMA_ITEM_ROWS; index += 1) {
    const rowNumber = PROFORMA_FIRST_ITEM_ROW + index;
    const line = partLines[index];
    sheet.getRow(rowNumber).height = itemHeights[index];
    sheet.getCell(`A${rowNumber}`).value = index + 1;
    sheet.mergeCells(`D${rowNumber}:E${rowNumber}`);
    if (line) {
      sheet.getCell(`B${rowNumber}`).value = line.code;
      sheet.getCell(`C${rowNumber}`).value = line.quantity;
      sheet.getCell(`D${rowNumber}`).value = line.description;
      sheet.getCell(`F${rowNumber}`).value = line.sourceDiscontinuedStatus === 'discontinued' ? 'Descontinuado' : '';
      sheet.getCell(`G${rowNumber}`).value = line.sourceStock ?? '';
      sheet.getCell(`I${rowNumber}`).value = proformaFormulaValue(line, `C${rowNumber}`, proforma) as never;
    }
    styleProformaItemRow(sheet, rowNumber, proforma.currency);
  }

  const itemTotal = partLines.reduce((total, line) => total + proformaLineTotal(line, proforma), 0);
  sheet.getRow(PROFORMA_ITEMS_SUBTOTAL_ROW).height = 20.25;
  sheet.getCell(`H${PROFORMA_ITEMS_SUBTOTAL_ROW}`).value = 'Subtotal';
  sheet.getCell(`I${PROFORMA_ITEMS_SUBTOTAL_ROW}`).value = {
    formula: `SUM(I${PROFORMA_FIRST_ITEM_ROW}:I${PROFORMA_FIRST_ITEM_ROW + PROFORMA_ITEM_ROWS - 1})`,
    result: itemTotal,
  };
  styleProformaTotalRow(sheet, PROFORMA_ITEMS_SUBTOTAL_ROW, proforma.currency);

  setProformaValue(sheet, 'A28:I28', 'MANO DE OBRA', {
    font: { name: 'Arial', size: 10, bold: true, color: { argb: PROFORMA_BLACK } },
    fill: PROFORMA_NO_FILL,
    alignment: { horizontal: 'center', vertical: 'bottom' },
    border: proformaBottomBorder(),
  });
  setProformaValue(sheet, 'A29', 'Item', tableHeaderStyle);
  setProformaValue(sheet, 'B29:E29', 'Descripción del Trabajo', tableHeaderStyle);
  setProformaValue(sheet, 'H29', 'C. Unit.', tableHeaderStyle);
  setProformaValue(sheet, 'I29', `P. Venta ${priceLabel}`, tableHeaderStyle);
  paintProformaRange(sheet, 'F29:G29', { ...tableHeaderStyle, border: proformaTopBottomBorder() });

  const allLaborLines = proforma.lines.filter((line) => line.kind === 'labor');
  const laborLines = allLaborLines.slice(0, PROFORMA_LABOR_ROWS);
  const laborHeights = [22.5, 21, 18.75, 19.5, 21, 21.75, 20.25];
  for (let index = 0; index < PROFORMA_LABOR_ROWS; index += 1) {
    const rowNumber = PROFORMA_FIRST_LABOR_ROW + index;
    const line = laborLines[index];
    sheet.getRow(rowNumber).height = laborHeights[index];
    sheet.getCell(`A${rowNumber}`).value = index + 1;
    sheet.mergeCells(`D${rowNumber}:E${rowNumber}`);
    if (line) {
      sheet.getCell(`D${rowNumber}`).value = line.description;
      sheet.getCell(`H${rowNumber}`).value = line.costLocal ?? '';
      sheet.getCell(`I${rowNumber}`).value = proformaUnitPrice(line, proforma) ?? '';
    }
    styleProformaLaborRow(sheet, rowNumber, proforma.currency);
  }

  const laborTotal = laborLines.reduce((total, line) => total + proformaLineTotal(line, proforma), 0);
  sheet.getRow(PROFORMA_LABOR_TOTAL_ROW).height = 20.25;
  sheet.getCell(`E${PROFORMA_LABOR_TOTAL_ROW}`).value = 'Total';
  sheet.getCell(`I${PROFORMA_LABOR_TOTAL_ROW}`).value = {
    formula: `SUM(I${PROFORMA_FIRST_LABOR_ROW}:I${PROFORMA_FIRST_LABOR_ROW + PROFORMA_LABOR_ROWS - 1})`,
    result: laborTotal,
  };
  styleProformaTotalRow(sheet, PROFORMA_LABOR_TOTAL_ROW, proforma.currency);

  const extraLines = [
    ...allPartLines.slice(PROFORMA_ITEM_ROWS).map((line) => ({ type: 'Repuesto', line })),
    ...allLaborLines.slice(PROFORMA_LABOR_ROWS).map((line) => ({ type: 'Mano de obra', line })),
  ];
  const extraTotal = extraLines.reduce((total, entry) => total + proformaLineTotal(entry.line, proforma), 0);
  if (extraLines.length > 0) {
    sheet.getRow(38).height = 18;
    sheet.getCell('H38').value = 'Adicionales · ver hoja';
    sheet.getCell('I38').value = extraTotal;
    styleProformaTotalRow(sheet, 38, proforma.currency);
    addProformaOverflowSheet(workbook, extraLines, proforma);
  }

  sheet.getRow(PROFORMA_GRAND_TOTAL_ROW).height = 20.25;
  setProformaValue(sheet, 'D39:E39', 'TOTAL GRAL', {
    font: { name: 'Arial', size: 11, bold: true, color: { argb: PROFORMA_BLACK } },
    alignment: { horizontal: 'left', vertical: 'middle' },
    border: proformaTopBottomBorder(),
  });
  sheet.getCell(`I${PROFORMA_GRAND_TOTAL_ROW}`).value = {
    formula: extraLines.length > 0
      ? `I${PROFORMA_ITEMS_SUBTOTAL_ROW}+I${PROFORMA_LABOR_TOTAL_ROW}+I38`
      : `I${PROFORMA_ITEMS_SUBTOTAL_ROW}+I${PROFORMA_LABOR_TOTAL_ROW}`,
    result: itemTotal + laborTotal + extraTotal,
  };
  sheet.getCell(`I${PROFORMA_GRAND_TOTAL_ROW}`).font = { name: 'Arial', size: 11, bold: true, color: { argb: PROFORMA_BLACK } };
  sheet.getCell(`I${PROFORMA_GRAND_TOTAL_ROW}`).numFmt = proformaPriceFormat(proforma.currency);
  sheet.getCell(`I${PROFORMA_GRAND_TOTAL_ROW}`).alignment = { vertical: 'bottom' };
  paintProformaRange(sheet, 'F39:G39', { border: proformaTopBottomBorder() });
  paintProformaRange(sheet, 'H39:I39', { border: proformaThinBorder() });

  const signatureStyle: ProformaCellStyle = {
    font: { name: 'Arial', size: 7, color: { argb: PROFORMA_BLACK } },
    alignment: { horizontal: 'left', vertical: 'bottom', wrapText: false },
    border: proformaThinBorder(),
  };
  setProformaValue(sheet, 'A41:D41', `Preparado por: ${proforma.attendedBy.trim()}`, signatureStyle);
  setProformaValue(sheet, 'E41:I41', 'Vº Bº Jefe Soluciones de Impresión:', {
    ...signatureStyle,
    border: proformaTopBottomBorder(),
  });
  setProformaValue(sheet, 'A43:D43', 'Tipo de cambio (Si aplica):', signatureStyle);
  setProformaValue(sheet, 'E43:I43', 'Vº Bº Encargado de Facturación y Cobro:', {
    ...signatureStyle,
    border: proformaTopBottomBorder(),
  });
  sheet.getRow(44).height = 10;

  return workbook.xlsx.writeBuffer();
}

export async function exportProforma(proforma: Proforma): Promise<void> {
  const logoBase64 = await loadProformaLogoBase64();
  const buffer = await buildProformaWorkbook(proforma, logoBase64);
  download(buffer, `proforma-${proforma.id.slice(0, 8)}-${dateStamp()}.xlsx`);
}

async function loadProformaLogoBase64(): Promise<string> {
  const response = await fetch(PROFORMA_LOGO_URL);
  if (!response.ok) throw new Error('No se pudo cargar el logo de la proforma.');

  const bytes = new Uint8Array(await response.arrayBuffer());
  let binary = '';
  const chunkSize = 0x8000;
  for (let offset = 0; offset < bytes.length; offset += chunkSize) {
    binary += String.fromCharCode(...bytes.subarray(offset, offset + chunkSize));
  }
  return `data:image/png;base64,${btoa(binary)}`;
}

function proformaBorder(left = false, right = false, top = false, bottom = false): object {
  const side = { style: 'thin' as const, color: { argb: PROFORMA_BLACK } };
  return {
    ...(left ? { left: side } : {}),
    ...(right ? { right: side } : {}),
    ...(top ? { top: side } : {}),
    ...(bottom ? { bottom: side } : {}),
  };
}

function proformaThinBorder(): object {
  return proformaBorder(true, true, true, true);
}

function proformaTopBottomBorder(): object {
  return proformaBorder(false, false, true, true);
}

function proformaBottomBorder(): object {
  return proformaBorder(false, false, false, true);
}

function proformaRightTopBottomBorder(): object {
  return proformaBorder(false, true, true, true);
}

function paintProformaRange(sheet: Worksheet, range: string, style: ProformaCellStyle): void {
  const [from, to] = range.split(':');
  const start = sheet.getCell(from);
  const end = sheet.getCell(to ?? from);
  for (let row = start.row; row <= end.row; row += 1) {
    for (let column = start.col; column <= end.col; column += 1) {
      const cell = sheet.getCell(row, column);
      if (style.font) cell.font = style.font as never;
      if (style.fill) cell.fill = style.fill as never;
      if (style.alignment) cell.alignment = style.alignment as never;
      if (style.border) cell.border = style.border as never;
      if (style.numFmt) cell.numFmt = style.numFmt;
    }
  }
}

function setProformaValue(sheet: Worksheet, range: string, value: string | number | object, style?: ProformaCellStyle): void {
  const [topLeft, bottomRight] = range.split(':');
  if (bottomRight && bottomRight !== topLeft) sheet.mergeCells(range);
  sheet.getCell(topLeft).value = value as never;
  if (style) paintProformaRange(sheet, range, style);
}

function styleProformaItemRow(sheet: Worksheet, rowNumber: number, currency: Proforma['currency']): void {
  for (const column of ['A', 'B', 'C', 'D', 'E', 'F', 'G', 'H', 'I']) {
    const cell = sheet.getCell(`${column}${rowNumber}`);
    cell.font = { name: 'Calibri', size: column === 'F' ? 8 : column === 'A' ? 11 : 12, color: { argb: PROFORMA_BLACK } };
    cell.border = proformaThinBorder() as never;
    cell.alignment = { vertical: 'bottom', horizontal: column === 'D' ? 'left' : 'center', wrapText: false };
  }
  sheet.getCell(`C${rowNumber}`).numFmt = '0';
  sheet.getCell(`G${rowNumber}`).numFmt = '0';
  sheet.getCell(`H${rowNumber}`).numFmt = proformaPriceFormat(currency);
  sheet.getCell(`I${rowNumber}`).numFmt = proformaPriceFormat(currency);
}

function styleProformaLaborRow(sheet: Worksheet, rowNumber: number, currency: Proforma['currency']): void {
  for (const column of ['A', 'B', 'C', 'D', 'E', 'F', 'G', 'H', 'I']) {
    const cell = sheet.getCell(`${column}${rowNumber}`);
    cell.font = { name: column === 'C' ? 'Calibri' : 'Arial', size: column === 'C' ? 12 : 11, bold: column !== 'C', color: { argb: PROFORMA_BLACK } };
    cell.border = proformaThinBorder() as never;
    cell.alignment = { vertical: 'bottom', horizontal: ['D', 'E'].includes(column) ? 'left' : 'center', wrapText: false };
  }
  sheet.getCell(`H${rowNumber}`).numFmt = proformaPriceFormat(currency);
  sheet.getCell(`I${rowNumber}`).numFmt = proformaPriceFormat(currency);
}

function styleProformaTotalRow(sheet: Worksheet, rowNumber: number, currency: Proforma['currency']): void {
  for (const column of ['E', 'F', 'G', 'H', 'I']) {
    const cell = sheet.getCell(`${column}${rowNumber}`);
    cell.font = { name: 'Arial', size: 11, bold: true, color: { argb: PROFORMA_BLACK } };
    cell.border = proformaThinBorder() as never;
    cell.alignment = { vertical: 'bottom', horizontal: column === 'E' ? 'left' : 'right' };
  }
  sheet.getCell(`H${rowNumber}`).numFmt = proformaPriceFormat(currency);
  sheet.getCell(`I${rowNumber}`).numFmt = proformaPriceFormat(currency);
}

function addProformaOverflowSheet(
  workbook: ExcelWorkbook,
  lines: readonly { type: string; line: ProformaLine }[],
  proforma: Proforma,
): void {
  const sheet = workbook.addWorksheet('Líneas adicionales');
  sheet.addRow(['LÍNEAS ADICIONALES DE LA PROFORMA']);
  sheet.addRow(['La plantilla principal conserva 12 repuestos y 7 líneas de mano de obra; las líneas restantes se detallan aquí.']);
  const priceLabel = proformaPriceLabel(proforma.currency);
  sheet.addRow(['Tipo', 'Código', 'Descripción', 'Cantidad', `Costo unitario ${priceLabel}`, `Precio venta ${priceLabel}`, `Total ${priceLabel}`]);
  lines.forEach(({ type, line }) => {
    sheet.addRow([
      type,
      line.code,
      line.description,
      line.quantity,
      line.costLocal ?? '',
      proformaUnitPrice(line, proforma) ?? '',
      proformaLineTotal(line, proforma),
    ]);
  });
  styleHeader(sheet.getRow(1));
  styleHeader(sheet.getRow(3));
  [18, 20, 52, 12, 20, 20, 18].forEach((width, index) => {
    sheet.getColumn(index + 1).width = width;
  });
  sheet.getColumn(4).numFmt = '0';
  sheet.getColumn(5).numFmt = proformaPriceFormat(proforma.currency);
  sheet.getColumn(6).numFmt = proformaPriceFormat(proforma.currency);
  sheet.getColumn(7).numFmt = proformaPriceFormat(proforma.currency);
  sheet.views = [{ state: 'frozen', ySplit: 3 }];
}

function proformaFormulaValue(line: ProformaLine, quantityCell: string, proforma: Proforma): object | string {
  const unitPrice = proformaUnitPrice(line, proforma);
  if (unitPrice === null || !Number.isFinite(unitPrice)) return '';
  return { formula: `${quantityCell}*${unitPrice}`, result: proformaLineTotal(line, proforma) };
}

function proformaUnitPrice(line: ProformaLine, proforma: Proforma): number | null {
  if (proforma.currency === 'USD') {
    return line.unitPriceUsd ?? (line.unitPriceLocal === null ? null : roundUsd(line.unitPriceLocal / proforma.pricing.exchangeRate));
  }
  return line.unitPriceLocal;
}

function proformaLineTotal(line: ProformaLine, proforma: Proforma): number {
  return (proformaUnitPrice(line, proforma) ?? 0) * line.quantity;
}

function proformaPriceLabel(currency: Proforma['currency']): string {
  return currency === 'USD' ? 'USD' : 'Gs.';
}

function proformaPriceFormat(currency: Proforma['currency']): string {
  return currency === 'USD' ? PROFORMA_USD_FORMAT : PROFORMA_GS_FORMAT;
}

function roundUsd(value: number): number {
  return Math.round(value * 100) / 100;
}

function proformaDate(value: string): string {
  const match = /^(\d{4})-(\d{2})-(\d{2})/.exec(value);
  return match ? `${match[3]}/${match[2]}/${match[1]}` : value.slice(0, 10);
}

function proformaTime(value: string): string {
  const match = /T(\d{2}:\d{2})/.exec(value);
  return match?.[1] ?? '';
}

function styleHeader(row: { font: unknown; fill: unknown }): void {
  row.font = { bold: true, color: { argb: 'FFFFFFFF' } };
  row.fill = { type: 'pattern', pattern: 'solid', fgColor: { argb: '2456A6' } };
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
