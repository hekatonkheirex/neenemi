import type { Express } from 'express';
import { createHash } from 'node:crypto';
import type { SuiteDatabase } from '../../db/database';
import { ImportRepository } from '../../db/repositories';
import { restoreArchivedImportFiles, storeImportFile, type ArchivedImportFile } from '../../core/import-storage';
import { archiveBatchImportFiles, storeAndRegisterImportFile, storeSpreadsheetImport } from '../../core/import-routes';
import { decodeBase64, isNonEmptyString, isNonNegativeInteger, isNonNegativeNumber, isPositiveInteger, isRecord, queryString } from '../../core/validation';
import { parseMaintenanceCounterCsv, parseMaintenanceCounterWorkbook } from './counters-parser';
import { DEFAULT_MAINTENANCE_RULES } from './defaults';
import {
  MaintenanceRepository,
  type LegacyMaintenanceDatabaseInput,
  type LegacyMaintenanceModelInput,
  type LegacyMaintenanceRecordInput,
  type SaveMaintenanceRuleInput,
} from './repository';

function isFiniteFraction(value: unknown): value is number {
  return typeof value === 'number' && Number.isFinite(value) && value >= 0 && value <= 1;
}

function parseLegacyMaintenanceImport(value: unknown): {
  sourceName: string;
  contentBase64: string;
  database: LegacyMaintenanceDatabaseInput;
} | null {
  if (!isRecord(value) || !isNonEmptyString(value.sourceName) || !isNonEmptyString(value.contentBase64) || !isRecord(value.database)) return null;
  const database = value.database;
  if (!Array.isArray(database.models) || !Array.isArray(database.records)) return null;

  const models: LegacyMaintenanceModelInput[] = [];
  for (const item of database.models) {
    if (!isRecord(item) || !isNonEmptyString(item.name) || !isPositiveInteger(item.vidaUtil) || !isNonNegativeInteger(item.optimoBase) || !isFiniteFraction(item.mermaMax)) return null;
    models.push({ name: item.name, usefulLife: item.vidaUtil, optimalBase: item.optimoBase, maxWaste: item.mermaMax });
  }

  const records: LegacyMaintenanceRecordInput[] = [];
  for (const item of database.records) {
    if (
      !isRecord(item) ||
      !isNonEmptyString(item.cliente) ||
      !isNonEmptyString(item.equipo) ||
      !isNonEmptyString(item.nserie) ||
      !isNonEmptyString(item.periodo) ||
      !isNonNegativeNumber(item.copias) ||
      !isNonNegativeNumber(item.contador) ||
      (item.ov !== undefined && typeof item.ov !== 'string') ||
      (item.papel !== undefined && typeof item.papel !== 'string')
    ) return null;
    records.push({
      customerName: item.cliente,
      contractReference: typeof item.ov === 'string' ? item.ov : '',
      modelLabel: item.equipo,
      serialNumber: item.nserie,
      period: item.periodo,
      paperType: typeof item.papel === 'string' ? item.papel : '',
      copies: item.copias,
      counter: item.contador,
    });
  }

  return { sourceName: value.sourceName, contentBase64: value.contentBase64, database: { models, records } };
}


function parseSaveMaintenanceRuleInput(value: unknown): SaveMaintenanceRuleInput | null {
  if (!isRecord(value) || !isNonEmptyString(value.modelLabel)) return null;
  if (!isPositiveInteger(value.usefulLife) || !isNonNegativeInteger(value.optimalBase) || !isFiniteFraction(value.maxWaste)) return null;
  if (value.id !== undefined && !isNonEmptyString(value.id)) return null;
  return {
    id: typeof value.id === 'string' ? value.id : undefined,
    modelLabel: value.modelLabel,
    usefulLife: value.usefulLife,
    optimalBase: value.optimalBase,
    maxWaste: value.maxWaste,
  };
}

export function registerMaintenanceRoutes(app: Express, database: SuiteDatabase, dataDirectory: string): void {
  const imports = new ImportRepository(database);
  const maintenance = new MaintenanceRepository(database);

  app.get('/api/maintenance/summary', (_request, response) => {
    response.json(maintenance.getCurrentSummary());
  });

  app.delete('/api/maintenance/import', (_request, response) => {
    const batches = imports.listApplied('maintenance');
    const archivedFiles: ArchivedImportFile[] = [];
    try {
      for (const batch of batches) {
        archivedFiles.push(...archiveBatchImportFiles(dataDirectory, batch.id, imports));
      }
      const removed = maintenance.removeImportedBatches(batches.map((batch) => batch.id));
      response.json({ ok: true, batches: removed, archivedFiles: archivedFiles.length });
    } catch (error) {
      if (archivedFiles.length > 0) restoreArchivedImportFiles(dataDirectory, archivedFiles);
      response.status(500).json({ error: error instanceof Error ? error.message : 'No se pudieron limpiar las cargas de mantenimiento.' });
    }
  });

  app.get('/api/maintenance/analysis', (request, response) => {
    response.json(maintenance.listCurrentAnalyses(queryString(request.query.query)));
  });

  app.post('/api/maintenance/import-legacy', (request, response) => {
    const input = parseLegacyMaintenanceImport(request.body);
    if (!input) {
      response.status(400).json({ error: 'El archivo de mantenimiento no tiene el formato esperado.' });
      return;
    }

    const contents = decodeBase64(input.contentBase64);
    if (!contents) {
      response.status(400).json({ error: 'contentBase64 no es válido.' });
      return;
    }
    if (contents.byteLength > 35 * 1024 * 1024) {
      response.status(413).json({ error: 'El archivo de mantenimiento supera el límite de 35 MB.' });
      return;
    }

    const sourceHash = createHash('sha256').update(contents).digest('hex');
    const existingBatch = imports.findAppliedByHash('maintenance', sourceHash);
    if (existingBatch) {
      response.json({
        ...maintenance.getCurrentSummary(),
        duplicate: true,
        batchId: existingBatch.id,
        sourceName: existingBatch.sourceName,
        sourceHash,
      });
      return;
    }

    const batchId = imports.createBatch({
      domain: 'maintenance',
      sourceName: input.sourceName,
      sourceHash,
    });

    try {
      const stored = storeImportFile(dataDirectory, batchId, input.sourceName, contents);
      imports.addFile({
        batchId,
        fileName: input.sourceName,
        storedPath: stored.storedPath,
        contentHash: stored.contentHash,
        contentType: 'application/json',
        sizeBytes: stored.sizeBytes,
        contentBlob: contents,
      });
      const result = maintenance.importLegacyDatabase(batchId, input.database);
      response.status(201).json({
        duplicate: false,
        batchId,
        sourceName: input.sourceName,
        sourceHash,
        ...result,
      });
    } catch (error) {
      imports.markFailed(batchId);
      response.status(400).json({ error: error instanceof Error ? error.message : 'No se pudo importar mantenimiento.' });
    }
  });

  app.get('/api/maintenance/rules', (_request, response) => {
    response.json(maintenance.listCurrentRules());
  });

  app.post('/api/maintenance/rules', (request, response) => {
    const input = parseSaveMaintenanceRuleInput(request.body);
    if (!input) {
      response.status(400).json({ error: 'La regla requiere modelo, vida útil, óptimo base y merma válidos.' });
      return;
    }
    try {
      response.status(input.id ? 200 : 201).json(maintenance.saveCurrentRule(input));
    } catch (error) {
      response.status(400).json({ error: error instanceof Error ? error.message : 'No se pudo guardar la regla.' });
    }
  });

  app.delete('/api/maintenance/rules/:id', (request, response) => {
    if (!isNonEmptyString(request.params.id)) {
      response.status(400).json({ error: 'La regla indicada no es válida.' });
      return;
    }
    try {
      response.json({ deleted: maintenance.deleteCurrentRule(request.params.id) });
    } catch (error) {
      response.status(400).json({ error: error instanceof Error ? error.message : 'No se pudo eliminar la regla.' });
    }
  });

  app.post('/api/maintenance/rules/reset', (_request, response) => {
    try {
      response.json({ rules: maintenance.resetCurrentRules() });
    } catch (error) {
      response.status(400).json({ error: error instanceof Error ? error.message : 'No se pudieron restaurar las reglas.' });
    }
  });

  app.post('/api/maintenance/import-counters', async (request, response) => {
    const body = isRecord(request.body) ? request.body : {};
    if (!isNonEmptyString(body.sourceName) || !isNonEmptyString(body.contentBase64)) {
      response.status(400).json({ error: 'sourceName y contentBase64 son obligatorios.' });
      return;
    }

    const contents = decodeBase64(body.contentBase64);
    if (!contents) {
      response.status(400).json({ error: 'contentBase64 no es válido.' });
      return;
    }
    if (contents.byteLength > 35 * 1024 * 1024) {
      response.status(413).json({ error: 'El archivo de contadores supera el límite de 35 MB.' });
      return;
    }

    const sourceName = body.sourceName;
    const isCsv = sourceName.toLocaleLowerCase().endsWith('.csv');
    const isXlsx = sourceName.toLocaleLowerCase().endsWith('.xlsx');
    if (!isCsv && !isXlsx) {
      response.status(400).json({ error: 'El archivo debe ser CSV o XLSX. El formato XLS antiguo no se puede leer con el motor actual.' });
      return;
    }

    let parsed;
    try {
      parsed = isCsv
        ? parseMaintenanceCounterCsv(new TextDecoder().decode(contents))
        : await parseMaintenanceCounterWorkbook(contents);
    } catch (error) {
      response.status(400).json({ error: error instanceof Error ? error.message : 'No se pudo leer el archivo de contadores.' });
      return;
    }
    if (parsed.records.length === 0) {
      response.status(400).json({ error: parsed.skippedRows > 0 ? `No se encontraron lecturas válidas; se descartaron ${parsed.skippedRows} fila(s).` : 'No se encontraron filas de contadores válidas.' });
      return;
    }

    const sourceHash = createHash('sha256').update(contents).digest('hex');
    const existingBatch = imports.findAppliedByHash('maintenance', sourceHash);
    if (existingBatch) {
      response.json({
        ...maintenance.getCurrentSummary(),
        duplicate: true,
        skippedRows: parsed.skippedRows,
        batchId: existingBatch.id,
        sourceName: existingBatch.sourceName,
        sourceHash,
      });
      return;
    }

    const batchId = imports.createBatch({ domain: 'maintenance', sourceName, sourceHash });
    try {
      if (isCsv) {
        const stored = storeAndRegisterImportFile(dataDirectory, imports, batchId, sourceName, contents, 'text/csv');
        imports.addSourceRows(batchId, stored.id, parsed.sourceSheets);
      } else {
        await storeSpreadsheetImport(dataDirectory, imports, batchId, sourceName, contents);
      }

      const existingRules = maintenance.listCurrentRules();
      const models: LegacyMaintenanceModelInput[] = existingRules.length > 0
        ? existingRules.map((rule) => ({
            name: rule.modelLabel,
            usefulLife: rule.usefulLife,
            optimalBase: rule.optimalBase,
            maxWaste: rule.maxWaste,
          }))
        : DEFAULT_MAINTENANCE_RULES.map((rule) => ({ ...rule }));
      const result = maintenance.importLegacyDatabase(batchId, { models, records: parsed.records });
      response.status(201).json({
        duplicate: false,
        batchId,
        sourceName,
        sourceHash,
        skippedRows: parsed.skippedRows,
        sheets: parsed.sheets,
        ...result,
      });
    } catch (error) {
      imports.markFailed(batchId);
      response.status(400).json({ error: error instanceof Error ? error.message : 'No se pudo importar el archivo de contadores.' });
    }
  });
}
