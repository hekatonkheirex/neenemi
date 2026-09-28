import type { SuiteDatabase } from '../db/database';
import { ImportRepository, type ImportBatch } from '../db/repositories';
import { readStoredImportFile } from './import-storage';
import { backfillNormalizedSourceMetadata } from './source-metadata';
import { parseOutputsWorkbook } from '../modules/consumibles/outputs';
import { parseConsumablesWorkbook } from '../modules/consumibles/xlsx';
import { readWorkbookSheets } from '../modules/consumibles/xlsx-helpers';
import {
  CONSUMABLES_SOURCE_TYPES,
  type ConsumablesSourceType,
} from '../modules/consumibles/types';
import { ConsumablesRepository } from '../modules/consumibles/repository';
import { parseServicesWorkbook } from '../modules/servicios/parser';
import { ServiceRepository } from '../modules/servicios/repository';
import { parseTravelWorkbook } from '../modules/viaticos/parser';
import { TravelRepository } from '../modules/viaticos/repository';

export type SourceMetadataBackfillSummary = {
  batches: number;
  files: number;
  rawSheets: number;
  rawRows: number;
  usageRecords: number;
  outputRecords: number;
  serviceRecords: number;
  travelTrips: number;
  travelCostCatalogs: number;
  skippedFiles: number;
  errors: string[];
};

type SourceMetadataBackfillOptions = {
  dataDirectory: string;
  database: SuiteDatabase;
  imports?: ImportRepository;
};

const NORMALIZED_TABLES = {
  consumibles: 'consumables_usage_records',
  salidas: 'consumables_output_records',
  servicios: 'service_records',
} as const;

export async function backfillStoredSourceMetadata(
  options: SourceMetadataBackfillOptions,
): Promise<SourceMetadataBackfillSummary> {
  const imports = options.imports ?? new ImportRepository(options.database);
  const consumables = new ConsumablesRepository(options.database);
  const services = new ServiceRepository(options.database);
  const travel = new TravelRepository(options.database);
  const summary: SourceMetadataBackfillSummary = {
    batches: 0,
    files: 0,
    rawSheets: 0,
    rawRows: 0,
    usageRecords: 0,
    outputRecords: 0,
    serviceRecords: 0,
    travelTrips: 0,
    travelCostCatalogs: 0,
    skippedFiles: 0,
    errors: [],
  };
  const touchedBatches = new Set<string>();
  const latestTravelBatchId = imports.findLatestApplied('viaticos')?.id;

  for (const batch of [...imports.listApplied('consumibles'), ...imports.listApplied('services'), ...imports.listApplied('viaticos')]) {
    const needsMetadata = batch.domain === 'services'
      ? countMissingMetadata(options.database, NORMALIZED_TABLES.servicios, batch.id, true) > 0
      : batch.domain === 'viaticos'
        ? countMissingTravelOperational(options.database, batch.id) > 0
        : countMissingMetadata(options.database, NORMALIZED_TABLES.consumibles, batch.id) > 0
          || countMissingMetadata(options.database, NORMALIZED_TABLES.salidas, batch.id, true) > 0;
    const needsCostCatalog = batch.domain === 'viaticos'
      && batch.id === latestTravelBatchId
      && travel.needsCostCatalogRefresh(batch.id);
    const sourceSheets = imports.listSourceSheets(batch.id);
    const hydratedFileIds = new Set(sourceSheets.map((source) => source.importFileId));

    for (const file of imports.listFiles(batch.id)) {
      if (!isSpreadsheetFile(file.fileName, file.contentType)) continue;
      if (!needsMetadata && !needsCostCatalog && hydratedFileIds.has(file.id)) continue;
      const contents = imports.getFileContent(file.id)
        ?? readStoredImportFile(options.dataDirectory, file.storedPath);
      if (!contents) {
        summary.skippedFiles += 1;
        continue;
      }

      try {
        const sheets = await readWorkbookSheets(contents);
        summary.files += 1;

        if (!hydratedFileIds.has(file.id)) {
          const raw = imports.addSourceRows(batch.id, file.id, sheets);
          summary.rawSheets += raw.sheets;
          summary.rawRows += raw.rows;
          hydratedFileIds.add(file.id);
          touchedBatches.add(batch.id);
        }

        if (!needsMetadata && !needsCostCatalog) continue;
        if (batch.domain === 'services') {
          const parsed = await parseServicesWorkbook(contents);
          summary.serviceRecords += services.backfillSourceMetadata(batch.id, parsed.rows);
          touchedBatches.add(batch.id);
          continue;
        }
        if (batch.domain === 'viaticos') {
          const parsed = await parseTravelWorkbook(contents, batch.sourceName);
          if (needsMetadata) {
            summary.travelTrips += travel.backfillSourceOperational(batch.id, parsed.trips);
            touchedBatches.add(batch.id);
          }
          if (needsCostCatalog && travel.refreshCostCatalog(batch.id, parsed.costCatalog)) {
            summary.travelCostCatalogs += 1;
            touchedBatches.add(batch.id);
          }
          continue;
        }

        const sourceType = inferConsumablesSourceType(batch, file.fileName);
        if (!sourceType) {
          summary.skippedFiles += 1;
          summary.errors.push(`${batch.sourceName} / ${file.fileName}: no se pudo inferir el tipo de fuente.`);
          continue;
        }
        if (sourceType === 'salida-consumibles' || sourceType === 'salida-repuestos') {
          const parsed = await parseOutputsWorkbook(contents, sourceType);
          summary.outputRecords += consumables.backfillOutputSourceMetadata(batch.id, parsed.rows);
        } else {
          const parsed = await parseConsumablesWorkbook(contents, sourceType);
          summary.usageRecords += consumables.backfillSourceMetadata(batch.id, parsed.rows);
        }
        touchedBatches.add(batch.id);
      } catch (error) {
        summary.skippedFiles += 1;
        summary.errors.push(`${batch.sourceName} / ${file.fileName}: ${error instanceof Error ? error.message : 'error desconocido'}`);
      }
    }
  }

  summary.batches = touchedBatches.size;
  return summary;
}

export function inferConsumablesSourceType(
  batch: Pick<ImportBatch, 'sourceName' | 'sourceType'>,
  fileName: string,
): ConsumablesSourceType | null {
  if (isConsumablesSourceType(batch.sourceType)) return batch.sourceType;

  const normalized = normalizeSourceName(`${batch.sourceName} ${fileName}`);
  if (/salida\s+(?:de\s+)?consumibles/.test(normalized)) return 'salida-consumibles';
  if (/salida\s+(?:de\s+)?repuestos/.test(normalized)) return 'salida-repuestos';
  if (/uso\s+(?:de\s+)?repuestos|detalles?\s+de\s+uso\s+de\s+repuestos/.test(normalized)) return 'uso-repuestos';
  if (/detalles?\s+(?:de\s+)?repuestos/.test(normalized)) return 'repuestos';
  if (/detalles?\s+(?:de\s+)?consumibles/.test(normalized)) return 'consumibles';
  return null;
}

function countMissingMetadata(
  database: SuiteDatabase,
  table: (typeof NORMALIZED_TABLES)[keyof typeof NORMALIZED_TABLES],
  batchId: string,
  includeOperational = false,
): number {
  const operationalCondition = includeOperational ? '\n        OR source_operational_json = \'{}\'' : '';
  const row = database.prepare(`
    SELECT COUNT(*) AS count
    FROM ${table}
    WHERE source_batch_id = ?
      AND (
        source_sheet_name = ''
        OR source_row_number = 0
        OR source_details_json = '[]'
        ${operationalCondition}
      )
  `).get(batchId) as { count: number };
  return row.count;
}

function countMissingTravelOperational(database: SuiteDatabase, batchId: string): number {
  const row = database.prepare(`
    SELECT COUNT(*) AS count
    FROM travel_trips
    WHERE source_batch_id = ?
      AND (
        source_sheet_name = ''
        OR source_row_number = 0
        OR source_operational_json = '{}'
      )
  `).get(batchId) as { count: number };
  return row.count;
}

function isConsumablesSourceType(value: string | null): value is ConsumablesSourceType {
  return value !== null && (CONSUMABLES_SOURCE_TYPES as readonly string[]).includes(value);
}

function normalizeSourceName(value: string): string {
  return value
    .normalize('NFD')
    .replace(/[\u0300-\u036f]/g, '')
    .toLocaleLowerCase()
    .replace(/[_-]+/g, ' ')
    .replace(/\s+/g, ' ')
    .trim();
}

function isSpreadsheetFile(fileName: string, contentType?: string | null): boolean {
  return contentType === 'application/vnd.openxmlformats-officedocument.spreadsheetml.sheet'
    || fileName.toLocaleLowerCase().endsWith('.xlsx');
}
