type ExcelJSModule = typeof import('exceljs');

let excelJSModulePromise: Promise<ExcelJSModule> | undefined;

/**
 * ExcelJS is only needed while a user reads or writes an XLSX file.
 * Keep it out of the initial renderer graph and share the same lazy load
 * between importers and exporters.
 */
export function loadExcelJS(): Promise<ExcelJSModule> {
  excelJSModulePromise ??= import('exceljs').then(normalizeExcelJSModule);
  return excelJSModulePromise;
}

type ExcelJSRuntimeModule = {
  Workbook?: unknown;
  default?: unknown;
  'module.exports'?: unknown;
};

function normalizeExcelJSModule(module: unknown): ExcelJSModule {
  const runtimeModule = module as ExcelJSRuntimeModule;
  const candidates = [module, runtimeModule.default, runtimeModule['module.exports']];
  const resolved = candidates.find(isExcelJSModule);
  if (!resolved) throw new Error('ExcelJS no expuso un constructor Workbook compatible.');
  return resolved;
}

function isExcelJSModule(module: unknown): module is ExcelJSModule {
  return typeof module === 'object'
    && module !== null
    && 'Workbook' in module
    && typeof module.Workbook === 'function';
}
