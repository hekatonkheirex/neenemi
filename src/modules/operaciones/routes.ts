import type { Express } from 'express';
import type { SuiteDatabase } from '../../db/database';
import { ImportRepository } from '../../db/repositories';
import type { ImportJobRegistry } from '../../core/import-jobs';
import { type ArchivedImportFile, restoreArchivedImportFiles } from '../../core/import-storage';
import { COMMERCIAL_AREAS, CONTRACT_TYPES, CUSTOMER_TYPES, OperationsRepository, type SaveContractInput, type SaveCustomerInput, type SaveEquipmentInput } from './repository';
import { LEGACY_FLEET_METADATA_TYPES, type LegacyFleetMetadataType, parseCanonDiscontinuationWorkbook, parseLegacyFleetMetadataWorkbook, parseLegacyPortfolioWorkbook, parseWaldbottStockWorkbook } from './legacy';
import { isEquipmentDetailExport } from '../../core/source-catalog';
import { archiveBatchImportFiles, enqueueImportJob, storeSpreadsheetImport } from '../../core/import-routes';
import { createHash } from 'node:crypto';
import { decodeBase64, isNonEmptyString, isRecord, queryString } from '../../core/validation';

const INVALID_VALUE = Symbol('invalid-value');

function parseOptionalEnum<T extends string>(value: unknown, values: readonly T[]): T | null | typeof INVALID_VALUE {
  if (value === undefined || value === null || value === '') return null;
  return typeof value === 'string' && values.includes(value as T) ? value as T : INVALID_VALUE;
}

function isOptionalText(value: unknown): value is string | null | undefined {
  return value === undefined || value === null || typeof value === 'string';
}

function isOptionalBoolean(value: unknown): value is boolean | null | undefined {
  return value === undefined || value === null || typeof value === 'boolean';
}

function optionalText(value: unknown): string | null | undefined {
  if (value === undefined || value === null) return value;
  return typeof value === 'string' ? value.trim() || null : undefined;
}

function optionalBoolean(value: unknown): boolean | null | undefined {
  return value === undefined || value === null || typeof value === 'boolean' ? value : undefined;
}

function parseLegacyFleetMetadataSourceType(value: unknown): LegacyFleetMetadataType | null {
  return typeof value === 'string' && LEGACY_FLEET_METADATA_TYPES.includes(value as LegacyFleetMetadataType)
    ? value as LegacyFleetMetadataType
    : null;
}


function parseSaveContractInput(value: unknown): SaveContractInput | null {
  if (!isRecord(value) || !isNonEmptyString(value.customerId) || !isNonEmptyString(value.contractType)) return null;
  if (value.id !== undefined && !isNonEmptyString(value.id)) return null;
  if (!Array.isArray(value.equipment)) return null;
  if (!isOptionalText(value.reference) || !isOptionalText(value.orderReference) || !isOptionalText(value.startsAt) || !isOptionalText(value.endsAt) || !isOptionalText(value.commercialArea) || !isOptionalText(value.division)) return null;
  if (!isOptionalBoolean(value.isActive) || !isOptionalBoolean(value.requiresClosure)) return null;

  const contractType = CONTRACT_TYPES.includes(value.contractType as (typeof CONTRACT_TYPES)[number])
    ? value.contractType as (typeof CONTRACT_TYPES)[number]
    : null;
  if (!contractType) return null;
  const commercialArea = parseOptionalEnum(value.commercialArea, COMMERCIAL_AREAS);
  if (commercialArea === INVALID_VALUE) return null;

  const equipment: SaveEquipmentInput[] = [];
  for (const item of value.equipment) {
    if (!isRecord(item) || !isNonEmptyString(item.modelLabel)) return null;
    if (item.id !== undefined && !isNonEmptyString(item.id)) return null;
    if (!isOptionalText(item.serialNumber) || !isOptionalText(item.location) || !isOptionalText(item.brand) || !isOptionalText(item.description) || !isOptionalText(item.interior) || !isOptionalText(item.city) || !isOptionalText(item.branch) || !isOptionalText(item.address) || !isOptionalBoolean(item.isActive)) return null;
    equipment.push({
      id: item.id as string | undefined,
      modelLabel: item.modelLabel,
      serialNumber: optionalText(item.serialNumber),
      location: optionalText(item.location),
      brand: optionalText(item.brand),
      description: optionalText(item.description),
      interior: optionalText(item.interior),
      city: optionalText(item.city),
      branch: optionalText(item.branch),
      address: optionalText(item.address),
      isActive: optionalBoolean(item.isActive),
    });
  }

  return {
    id: value.id as string | undefined,
    customerId: value.customerId,
    reference: optionalText(value.reference),
    orderReference: optionalText(value.orderReference),
    contractType,
    startsAt: optionalText(value.startsAt),
    endsAt: optionalText(value.endsAt),
    commercialArea,
    division: optionalText(value.division),
    isActive: optionalBoolean(value.isActive),
    requiresClosure: optionalBoolean(value.requiresClosure),
    equipment,
  };
}


function parseSaveCustomerInput(value: unknown): SaveCustomerInput | null {
  if (!isRecord(value) || !isNonEmptyString(value.name)) return null;
  if (value.id !== undefined && !isNonEmptyString(value.id)) return null;
  if (!isOptionalText(value.customerType) || !isOptionalText(value.commercialArea)) return null;

  const customerType = parseOptionalEnum(value.customerType, CUSTOMER_TYPES);
  const commercialArea = parseOptionalEnum(value.commercialArea, COMMERCIAL_AREAS);
  if (customerType === INVALID_VALUE || commercialArea === INVALID_VALUE) return null;

  return {
    id: value.id as string | undefined,
    name: value.name,
    customerType,
    commercialArea,
  };
}

export function registerOperationsRoutes(app: Express, database: SuiteDatabase, dataDirectory: string, importJobs: ImportJobRegistry): void {
  const imports = new ImportRepository(database);
  const operations = new OperationsRepository(database);

  app.get('/api/operations/customers', (request, response) => {
    response.json(operations.listCustomers(queryString(request.query.query)));
  });

  app.get('/api/operations/portfolio-snapshot', (request, response) => {
    response.json(operations.getPortfolioSnapshot(queryString(request.query.query)));
  });

  app.get('/api/operations/discontinuation-overview', (_request, response) => {
    try {
      response.json(operations.getDiscontinuationOverview());
    } catch (error) {
      response.status(500).json({ error: error instanceof Error ? error.message : 'No se pudo consultar el resumen del Discontinuador.' });
    }
  });

  app.post('/api/operations/customers', (request, response) => {
    const input = parseSaveCustomerInput(request.body);
    if (!input) {
      response.status(400).json({ error: 'El nombre y la clasificación del cliente no son válidos.' });
      return;
    }

    try {
      response.status(201).json(operations.saveCustomer(input));
    } catch (error) {
      response.status(400).json({ error: error instanceof Error ? error.message : 'No se pudo guardar el cliente.' });
    }
  });

  app.get('/api/operations/contracts', (request, response) => {
    response.json(operations.listContracts(queryString(request.query.query)));
  });

  app.post('/api/operations/contracts', (request, response) => {
    const input = parseSaveContractInput(request.body);
    if (!input) {
      response.status(400).json({ error: 'El contrato y sus equipos no son válidos.' });
      return;
    }

    try {
      response.status(201).json(operations.saveContract(input));
    } catch (error) {
      response.status(400).json({ error: error instanceof Error ? error.message : 'No se pudo guardar el contrato.' });
    }
  });

  /**
   * A new load replaces the previous ones of the same card: originals go to the recoverable archive and
   * the old batches are removed. Contracts and equipment the new load no longer includes are deactivated; shared customers stay.
   */
  function replacePreviousBatches(domain: string, sourceType: string, keepBatchId: string, sameCard: (sourceName: string) => boolean): number {
    const previous = imports
      .listApplied(domain)
      .filter((batch) => batch.id !== keepBatchId && batch.sourceType === sourceType && sameCard(batch.sourceName));
    if (previous.length === 0) return 0;
    const archivedFiles: ArchivedImportFile[] = [];
    try {
      for (const batch of previous) archivedFiles.push(...archiveBatchImportFiles(dataDirectory, batch.id, imports));
      database.transaction(() => {
        operations.deactivateRowsNotInReplacement(previous.map((batch) => batch.id));
        for (const batch of previous) {
          if (!imports.removeBatch(batch.id)) throw new Error(`No se pudo quitar la importación ${batch.id}.`);
        }
      })();
      return previous.length;
    } catch (error) {
      if (archivedFiles.length > 0) restoreArchivedImportFiles(dataDirectory, archivedFiles);
      console.warn('No se pudo reemplazar la carga anterior:', error instanceof Error ? error.message : error);
      return 0;
    }
  }

  app.post('/api/operations/import-legacy-portfolio', (request, response) => {
    const body = isRecord(request.body) ? request.body : {};
    if (!isNonEmptyString(body.sourceName) || !isNonEmptyString(body.contentBase64)) {
      response.status(400).json({ error: 'sourceName y contentBase64 son obligatorios.' });
      return;
    }

    const sourceName = body.sourceName;
    const contents = decodeBase64(body.contentBase64);
    if (!contents) {
      response.status(400).json({ error: 'contentBase64 no es válido.' });
      return;
    }
    if (contents.byteLength > 35 * 1024 * 1024) {
      response.status(413).json({ error: 'La cartera supera el límite de 35 MB.' });
      return;
    }

    enqueueImportJob(importJobs, response, { kind: 'fleet.equipment', sourceName }, async (update) => {
      update(10, 'Leyendo cartera XLSX…');
      const parsed = await parseLegacyPortfolioWorkbook(contents);
      if (parsed.rows.length === 0) throw new Error('No se encontraron filas de cartera válidas.');
      update(42, `${parsed.rows.length.toLocaleString('es-PY')} filas leídas; preparando base local…`);

      const sourceHash = createHash('sha256').update(contents).digest('hex');
      const existingBatch = imports.findAppliedByHash('operations', sourceHash);
      const sameCard = (name: string) => isEquipmentDetailExport(name) === isEquipmentDetailExport(sourceName);
      if (existingBatch) {
        const replaced = replacePreviousBatches('operations', 'fleet.equipment', existingBatch.id, sameCard);
        return {
          replaced,
          duplicate: true,
          batchId: existingBatch.id,
          sourceName: existingBatch.sourceName,
          sourceHash,
        };
      }

      const batchId = imports.createBatch({
        domain: 'operations',
        sourceName,
        sourceType: 'fleet.equipment',
        sourceHash,
      });

      try {
        update(58, 'Guardando archivo original…');
        const stored = await storeSpreadsheetImport(dataDirectory, imports, batchId, sourceName, contents);
        update(78, 'Aplicando cartera a la base local…');
        const result = operations.importLegacyPortfolio(batchId, parsed.rows);
        const replaced = replacePreviousBatches('operations', 'fleet.equipment', batchId, sameCard);
        return {
          replaced,
          duplicate: false,
          batchId,
          sourceName,
          sourceHash,
          rows: parsed.rows.length,
          skippedRows: parsed.skippedRows,
          duplicateRows: parsed.duplicateRows,
          sheets: parsed.sheets,
          rawRows: stored.rawRows,
          rawSheets: stored.rawSheets,
          ...result,
        };
      } catch (error) {
        imports.markFailed(batchId);
        throw error;
      }
    });
  });

  app.post('/api/operations/import-fleet-metadata', (request, response) => {
    const body = isRecord(request.body) ? request.body : {};
    const sourceType = parseLegacyFleetMetadataSourceType(body.sourceType);
    if (!sourceType || !isNonEmptyString(body.sourceName) || !isNonEmptyString(body.contentBase64)) {
      response.status(400).json({ error: 'sourceName, sourceType y contentBase64 son obligatorios.' });
      return;
    }

    const sourceName = body.sourceName;
    const contents = decodeBase64(body.contentBase64);
    if (!contents) {
      response.status(400).json({ error: 'contentBase64 no es válido.' });
      return;
    }
    if (contents.byteLength > 35 * 1024 * 1024) {
      response.status(413).json({ error: 'La fuente de cartera supera el límite de 35 MB.' });
      return;
    }

    enqueueImportJob(importJobs, response, { kind: sourceType, sourceName }, async (update) => {
      update(10, 'Leyendo metadatos de cartera…');
      const parsed = await parseLegacyFleetMetadataWorkbook(contents, sourceType);
      if (parsed.rows.length === 0) throw new Error('No se encontraron filas válidas en la fuente seleccionada.');
      update(42, `${parsed.rows.length.toLocaleString('es-PY')} filas leídas; preparando clasificación…`);

      const sourceHash = createHash('sha256').update(contents).digest('hex');
      const domain = `operations-fleet-${sourceType}`;
      const existingBatch = imports.findAppliedByHash(domain, sourceHash);
      if (existingBatch) {
        const replaced = replacePreviousBatches(domain, sourceType, existingBatch.id, () => true);
        return {
          replaced,
          duplicate: true,
          batchId: existingBatch.id,
          sourceName: existingBatch.sourceName,
          sourceHash,
          sourceType,
        };
      }

      const batchId = imports.createBatch({
        domain,
        sourceName,
        sourceType,
        sourceHash,
      });

      try {
        update(58, 'Guardando archivo original…');
        const stored = await storeSpreadsheetImport(dataDirectory, imports, batchId, sourceName, contents);
        update(78, 'Aplicando clasificación a la base local…');
        const result = operations.importLegacyFleetMetadata(batchId, sourceType, parsed.rows);
        const replaced = replacePreviousBatches(domain, sourceType, batchId, () => true);
        return {
          replaced,
          duplicate: false,
          batchId,
          sourceName,
          sourceHash,
          rows: parsed.rows.length,
          skippedRows: parsed.skippedRows,
          duplicateRows: parsed.duplicateRows,
          sheets: parsed.sheets,
          rawRows: stored.rawRows,
          rawSheets: stored.rawSheets,
          ...result,
        };
      } catch (error) {
        imports.markFailed(batchId);
        throw error;
      }
    });
  });

  app.post('/api/operations/import-canon-discontinuation', (request, response) => {
    const body = isRecord(request.body) ? request.body : {};
    if (!isNonEmptyString(body.sourceName) || !isNonEmptyString(body.contentBase64)) {
      response.status(400).json({ error: 'sourceName y contentBase64 son obligatorios.' });
      return;
    }

    const sourceName = body.sourceName;
    const contents = decodeBase64(body.contentBase64);
    if (!contents) {
      response.status(400).json({ error: 'contentBase64 no es válido.' });
      return;
    }
    if (contents.byteLength > 35 * 1024 * 1024) {
      response.status(413).json({ error: 'La lista Canon supera el límite de 35 MB.' });
      return;
    }

    enqueueImportJob(importJobs, response, { kind: 'discontinuation.canon', sourceName }, async (update) => {
      update(10, 'Leyendo lista Canon…');
      const parsed = await parseCanonDiscontinuationWorkbook(contents, sourceName);
      if (parsed.items.length === 0) throw new Error('No se encontraron registros Canon de discontinuación.');
      update(42, `${parsed.items.length.toLocaleString('es-PY')} registros Canon leídos…`);

      const sourceHash = createHash('sha256').update(contents).digest('hex');
      const existingBatch = imports.findAppliedByHash('operations-canon', sourceHash);
      if (existingBatch) {
        return {
          duplicate: true,
          batchId: existingBatch.id,
          sourceName: existingBatch.sourceName,
          sourceHash,
        };
      }

      const batchId = imports.createBatch({
        domain: 'operations-canon',
        sourceName,
        sourceHash,
      });

      try {
        update(58, 'Guardando archivo original…');
        const stored = await storeSpreadsheetImport(dataDirectory, imports, batchId, sourceName, contents);
        update(78, 'Aplicando modelos Canon a la base local…');
        const result = operations.importCanonDiscontinuation(batchId, parsed.items);
        return {
          duplicate: false,
          batchId,
          sourceName,
          sourceHash,
          rows: parsed.items.length,
          skippedRows: parsed.skippedRows,
          duplicateRows: parsed.duplicateRows,
          sheets: parsed.sheets,
          rawRows: stored.rawRows,
          rawSheets: stored.rawSheets,
          ...result,
        };
      } catch (error) {
        imports.markFailed(batchId);
        throw error;
      }
    });
  });

  app.post('/api/operations/import-waldbott-stock', (request, response) => {
    const body = isRecord(request.body) ? request.body : {};
    if (!isNonEmptyString(body.sourceName) || !isNonEmptyString(body.contentBase64)) {
      response.status(400).json({ error: 'sourceName y contentBase64 son obligatorios.' });
      return;
    }

    const sourceName = body.sourceName;
    const contents = decodeBase64(body.contentBase64);
    if (!contents) {
      response.status(400).json({ error: 'contentBase64 no es válido.' });
      return;
    }
    if (contents.byteLength > 35 * 1024 * 1024) {
      response.status(413).json({ error: 'El stock Waldbott supera el límite de 35 MB.' });
      return;
    }

    enqueueImportJob(importJobs, response, { kind: 'discontinuation.waldbott', sourceName }, async (update) => {
      update(10, 'Leyendo stock Waldbott…');
      const parsed = await parseWaldbottStockWorkbook(contents, sourceName);
      if (parsed.rows.length === 0) throw new Error('No se encontraron filas válidas de stock en el Depósito 04.');
      update(42, `${parsed.rows.length.toLocaleString('es-PY')} filas de stock leídas…`);

      const sourceHash = createHash('sha256').update(contents).digest('hex');
      const existingBatch = imports.findAppliedByHash('operations-waldbott', sourceHash);
      if (existingBatch) {
        return {
          duplicate: true,
          batchId: existingBatch.id,
          sourceName: existingBatch.sourceName,
          sourceHash,
        };
      }

      const batchId = imports.createBatch({
        domain: 'operations-waldbott',
        sourceName,
        sourceHash,
      });

      try {
        update(58, 'Guardando archivo original…');
        const stored = await storeSpreadsheetImport(dataDirectory, imports, batchId, sourceName, contents);
        update(78, 'Aplicando stock a la base local…');
        const result = operations.importWaldbottStock(batchId, parsed.rows);
        return {
          duplicate: false,
          batchId,
          sourceName,
          sourceHash,
          rows: parsed.rows.length,
          skippedRows: parsed.skippedRows,
          sheets: parsed.sheets,
          rawRows: stored.rawRows,
          rawSheets: stored.rawSheets,
          ...result,
        };
      } catch (error) {
        imports.markFailed(batchId);
        throw error;
      }
    });
  });

  app.delete('/api/operations/exclusive-imports', (_request, response) => {
    const exclusiveDomains = new Set(['operations-canon', 'operations-waldbott']);
    const batches = imports
      .listBatches(1000)
      .filter((batch) => exclusiveDomains.has(batch.domain));
    const archivedFiles: ArchivedImportFile[] = [];

    try {
      for (const batch of batches) {
        archivedFiles.push(...archiveBatchImportFiles(dataDirectory, batch.id, imports));
      }
      database.transaction(() => {
        for (const batch of batches) {
          if (!imports.removeBatch(batch.id)) throw new Error(`No se pudo quitar la importación ${batch.id}.`);
        }
      })();
      response.json({ ok: true, batches: batches.length, archivedFiles: archivedFiles.length });
    } catch (error) {
      if (archivedFiles.length > 0) restoreArchivedImportFiles(dataDirectory, archivedFiles);
      response.status(500).json({ error: error instanceof Error ? error.message : 'No se pudieron limpiar las listas de Operaciones.' });
    }
  });

  app.get('/api/operations/equipment', (request, response) => {
    response.json(operations.listEquipment(queryString(request.query.query)));
  });

  app.get('/api/operations/model-discontinuation', (_request, response) => {
    try {
      response.json(operations.listModelDiscontinuation());
    } catch (error) {
      response.status(500).json({ error: error instanceof Error ? error.message : 'No se pudo consultar el soporte Canon.' });
    }
  });

  app.get('/api/operations/waldbott-stock', (_request, response) => {
    try {
      response.json(operations.listWaldbottStock());
    } catch (error) {
      response.status(500).json({ error: error instanceof Error ? error.message : 'No se pudo consultar el stock Waldbott.' });
    }
  });
}
