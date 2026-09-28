const consumablesParser = await import('../src/modules/consumibles/xlsx.ts');

if (typeof consumablesParser.parseConsumablesWorkbook !== 'function') {
  throw new Error('El parser de Consumibles no se pudo cargar bajo Node ESM.');
}

const excelJS = await import('../src/core/exceljs.ts');
const { Workbook } = await excelJS.loadExcelJS();
const workbook = new Workbook();
workbook.addWorksheet('Fuente').addRow(['Código', 'Descripción']);
const workbookBytes = new Uint8Array(await workbook.xlsx.writeBuffer());
const xlsxHelpers = await import('../src/modules/consumibles/xlsx-helpers.ts');
const sheets = await xlsxHelpers.readWorkbookSheets(workbookBytes);
if (sheets[0]?.rows[0]?.[0] !== 'Código') {
  throw new Error('ExcelJS no pudo leer nuevamente una planilla XLSX bajo Node ESM.');
}

console.log('Node ESM runtime smoke: parser de Consumibles y lectura XLSX disponibles.');
