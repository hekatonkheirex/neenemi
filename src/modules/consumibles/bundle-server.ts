
export type ConsumablesBundleSourceId =
  | 'fleet.equipment'
  | 'fleet.contracts'
  | 'fleet.contract-details'
  | 'consumibles.detail'
  | 'consumibles.parts-detail'
  | 'consumibles.parts-usage'
  | 'consumibles.dispatch'
  | 'consumibles.parts-dispatch'
  | 'services.lam';
import fs from 'node:fs';
import path from 'node:path';
import { type ArchivedImportFile, restoreArchivedImportFiles, storeImportFile } from '../../core/import-storage';
import { ConsumablesRepository } from './repository';
import { type ConsumablesSourceType, type ParsedConsumablesOutputRow, type ParsedConsumablesRow } from './types';
import { ImportRepository } from '../../db/repositories';
import { type LegacyFleetMetadataParseResult, type LegacyPortfolioParseResult, parseLegacyFleetMetadataWorkbook, parseLegacyPortfolioWorkbook } from '../operaciones/legacy';
import { OperationsRepository } from '../operaciones/repository';
import { type ParsedServiceRow } from '../servicios/types';
import { ServiceRepository } from '../servicios/repository';
import { type SuiteDatabase } from '../../db/database';
import { type WorkbookSheetRows, readWorkbookSheets } from './xlsx-helpers';
import { archiveBatchImportFiles } from '../../core/import-routes';
import { createHash } from 'node:crypto';
import { isNonEmptyString, isRecord } from '../../core/validation';
import { parseConsumablesWorkbook } from './xlsx';
import { parseOutputsWorkbook } from './outputs';
import { parseServicesWorkbook } from '../servicios/parser';

export const CONSUMABLES_BUNDLE_SOURCE_IDS: readonly ConsumablesBundleSourceId[] = [
  'fleet.equipment',
  'fleet.contracts',
  'fleet.contract-details',
  'consumibles.detail',
  'consumibles.parts-detail',
  'consumibles.parts-usage',
  'consumibles.dispatch',
  'consumibles.parts-dispatch',
  'services.lam',
];

export type PreparedBundleSource<
  SourceId extends ConsumablesBundleSourceId,
  Parsed,
> = {
  sourceId: SourceId;
  sourceName: string;
  contents: Uint8Array;
  sheets: WorkbookSheetRows[];
  parsed: Parsed;
};

export type PreparedConsumablesBundleSource =
  | PreparedBundleSource<'fleet.equipment', LegacyPortfolioParseResult>
  | PreparedBundleSource<'fleet.contracts' | 'fleet.contract-details', LegacyFleetMetadataParseResult>
  | PreparedBundleSource<'consumibles.detail' | 'consumibles.parts-detail' | 'consumibles.parts-usage', {
    rows: ParsedConsumablesRow[];
    skippedOutOfScope: number;
  }>
  | PreparedBundleSource<'consumibles.dispatch' | 'consumibles.parts-dispatch', {
    rows: ParsedConsumablesOutputRow[];
    skippedOutOfScope: number;
  }>
  | PreparedBundleSource<'services.lam', {
    rows: ParsedServiceRow[];
    skippedOutOfScope: number;
  }>;

export type StagedConsumablesBundleSource = {
  sourceId: ConsumablesBundleSourceId;
  sourceName: string;
  contents: Uint8Array;
};

export type ConsumablesBundleCommitResult = {
  atomic: true;
  results: Array<Record<string, unknown> & {
    sourceId: ConsumablesBundleSourceId;
    sourceName: string;
    duplicate: boolean;
  }>;
};

export function parseConsumablesBundleSourceId(value: unknown): ConsumablesBundleSourceId | null {
  return value === 'fleet.equipment'
    || value === 'fleet.contracts'
    || value === 'fleet.contract-details'
    || value === 'consumibles.detail'
    || value === 'consumibles.parts-detail'
    || value === 'consumibles.parts-usage'
    || value === 'consumibles.dispatch'
    || value === 'consumibles.parts-dispatch'
    || value === 'services.lam'
    ? value
    : null;
}

export async function prepareConsumablesBundleSource(
  sourceId: ConsumablesBundleSourceId,
  sourceName: string,
  contents: Uint8Array,
): Promise<PreparedConsumablesBundleSource> {
  const sheets = await readWorkbookSheets(contents);
  switch (sourceId) {
    case 'fleet.equipment': {
      const parsed = await parseLegacyPortfolioWorkbook(contents);
      return { sourceId, sourceName, contents, sheets, parsed };
    }
    case 'fleet.contracts':
    case 'fleet.contract-details': {
      const sourceType = sourceId === 'fleet.contracts' ? 'contracts' : 'contract-details';
      const parsed = await parseLegacyFleetMetadataWorkbook(contents, sourceType);
      return { sourceId, sourceName, contents, sheets, parsed };
    }
    case 'consumibles.detail':
    case 'consumibles.parts-detail':
    case 'consumibles.parts-usage': {
      const sourceType = sourceId === 'consumibles.detail'
        ? 'consumibles'
        : sourceId === 'consumibles.parts-detail' ? 'repuestos' : 'uso-repuestos';
      const parsed = await parseConsumablesWorkbook(contents, sourceType);
      return { sourceId, sourceName, contents, sheets, parsed };
    }
    case 'consumibles.dispatch':
    case 'consumibles.parts-dispatch': {
      const sourceType = sourceId === 'consumibles.dispatch' ? 'salida-consumibles' : 'salida-repuestos';
      const parsed = await parseOutputsWorkbook(contents, sourceType);
      return { sourceId, sourceName, contents, sheets, parsed };
    }
    case 'services.lam': {
      const parsed = await parseServicesWorkbook(contents);
      return { sourceId, sourceName, contents, sheets, parsed };
    }
    default:
      throw new Error(`No existe una fuente de paquete para ${sourceName}.`);
  }
}

export function getPreparedRowCount(source: PreparedConsumablesBundleSource): number {
  return source.parsed.rows.length;
}

export function getPreparedSkippedRows(source: PreparedConsumablesBundleSource): number {
  return 'skippedRows' in source.parsed ? source.parsed.skippedRows : source.parsed.skippedOutOfScope;
}

export function parseConsumablesBundleId(value: unknown): string | null {
  return typeof value === 'string' && /^[a-zA-Z0-9_-]{1,80}$/.test(value) ? value : null;
}

export function hasZipContainerSignature(contents: Uint8Array): boolean {
  return contents.length >= 4
    && contents[0] === 0x50
    && contents[1] === 0x4b
    && ((contents[2] === 0x03 && contents[3] === 0x04)
      || (contents[2] === 0x05 && contents[3] === 0x06)
      || (contents[2] === 0x07 && contents[3] === 0x08));
}

export function bundleStagingDirectory(dataDirectory: string, bundleId: string): string {
  return path.join(path.resolve(dataDirectory), 'imports', '.staging', bundleId);
}

export function bundleStagedSourcePath(dataDirectory: string, bundleId: string, sourceId: ConsumablesBundleSourceId): string {
  const safeSourceId = sourceId.replaceAll('.', '_');
  return path.join(bundleStagingDirectory(dataDirectory, bundleId), `${safeSourceId}.xlsx`);
}

export function bundleManifestPath(dataDirectory: string, bundleId: string): string {
  return path.join(bundleStagingDirectory(dataDirectory, bundleId), 'manifest.json');
}

export function stageConsumablesBundleSource(
  dataDirectory: string,
  bundleId: string,
  sourceId: ConsumablesBundleSourceId,
  sourceName: string,
  contents: Uint8Array,
): void {
  const directory = bundleStagingDirectory(dataDirectory, bundleId);
  fs.mkdirSync(directory, { recursive: true });
  fs.writeFileSync(bundleStagedSourcePath(dataDirectory, bundleId, sourceId), Buffer.from(contents));

  let manifest: Partial<Record<ConsumablesBundleSourceId, { sourceName: string }>> = {};
  const manifestFile = bundleManifestPath(dataDirectory, bundleId);
  if (fs.existsSync(manifestFile)) {
    try {
      const parsed = JSON.parse(fs.readFileSync(manifestFile, 'utf8')) as unknown;
      if (isRecord(parsed)) {
        manifest = parsed as Partial<Record<ConsumablesBundleSourceId, { sourceName: string }>>;
      }
    } catch {
      manifest = {};
    }
  }
  manifest[sourceId] = { sourceName };
  fs.writeFileSync(manifestFile, JSON.stringify(manifest), 'utf8');
}

export function readConsumablesBundleStaging(
  dataDirectory: string,
  bundleId: string,
): StagedConsumablesBundleSource[] {
  const manifestFile = bundleManifestPath(dataDirectory, bundleId);
  if (!fs.existsSync(manifestFile)) throw new Error('El paquete no tiene fuentes preparadas. Volvé a seleccionar los nueve archivos.');

  let manifest: unknown;
  try {
    manifest = JSON.parse(fs.readFileSync(manifestFile, 'utf8')) as unknown;
  } catch {
    throw new Error('El paquete temporal está dañado. Volvé a seleccionar los nueve archivos.');
  }
  if (!isRecord(manifest)) throw new Error('El manifiesto temporal del paquete no es válido.');

  return CONSUMABLES_BUNDLE_SOURCE_IDS.map((sourceId) => {
    const entry = manifest[sourceId];
    if (!isRecord(entry) || !isNonEmptyString(entry.sourceName)) {
      throw new Error(`Falta la fuente ${sourceId} en el paquete preparado.`);
    }
    const sourcePath = bundleStagedSourcePath(dataDirectory, bundleId, sourceId);
    if (!fs.existsSync(sourcePath)) throw new Error(`No se encuentra el archivo temporal de ${sourceId}.`);
    const contents = new Uint8Array(fs.readFileSync(sourcePath));
    if (contents.byteLength === 0) throw new Error(`El archivo temporal de ${sourceId} está vacío.`);
    if (contents.byteLength > 35 * 1024 * 1024) throw new Error(`La fuente ${sourceId} supera el límite de 35 MB.`);
    return { sourceId, sourceName: entry.sourceName, contents };
  });
}

export function removeConsumablesBundleStaging(dataDirectory: string, bundleId: string): void {
  try {
    fs.rmSync(bundleStagingDirectory(dataDirectory, bundleId), { recursive: true, force: true });
  } catch {
    // La carga ya quedó protegida por la transacción; un staging huérfano no cambia sus datos.
  }
}

export function commitConsumablesBundle(
  database: SuiteDatabase,
  dataDirectory: string,
  imports: ImportRepository,
  operations: OperationsRepository,
  consumables: ConsumablesRepository,
  services: ServiceRepository,
  sources: readonly PreparedConsumablesBundleSource[],
): ConsumablesBundleCommitResult {
  if (sources.length !== CONSUMABLES_BUNDLE_SOURCE_IDS.length) {
    throw new Error('El paquete debe contener exactamente las nueve fuentes preparadas.');
  }

  const plans = sources.map((source) => {
    const sourceHash = createHash('sha256').update(source.contents).digest('hex');
    const domain = bundleSourceDomain(source.sourceId);
    const existingBatch = imports.findAppliedByHash(domain, sourceHash);
    const sourceReplacementBatches = bundleReplacementBatches(imports, source.sourceId);
    return {
      source,
      sourceHash,
      existingBatch,
      replacementBatches: sourceReplacementBatches.filter((batch) => batch.id !== existingBatch?.id),
    };
  });
  const replacementBatches = new Map<string, ReturnType<ImportRepository['getBatch']>>();
  for (const plan of plans) {
    for (const batch of plan.replacementBatches) replacementBatches.set(batch.id, batch);
  }

  const archivedFiles: ArchivedImportFile[] = [];
  const storedFiles: Array<{ storedPath: string }> = [];
  try {
    for (const batch of replacementBatches.values()) {
      if (!batch) continue;
      archivedFiles.push(...archiveBatchImportFiles(dataDirectory, batch.id, imports));
    }

    const results = database.transaction(() => plans.map((plan) => {
      const { source, sourceHash, existingBatch } = plan;
      const rowCount = getPreparedRowCount(source);
      const skippedRows = getPreparedSkippedRows(source);
      if (existingBatch) {
        for (const replacementBatch of plan.replacementBatches) {
          imports.removeBatch(replacementBatch.id);
        }
        return {
          sourceId: source.sourceId,
          sourceName: source.sourceName,
          duplicate: true,
          batchId: existingBatch.id,
          sourceHash,
          rows: rowCount,
          skippedRows,
        };
      }

      const batchId = imports.createBatch({
        domain: bundleSourceDomain(source.sourceId),
        sourceName: source.sourceName,
        sourceType: bundleSourceType(source.sourceId),
        sourceHash,
      });
      const stored = storePreparedSpreadsheetImport(dataDirectory, imports, batchId, source.sourceName, source.contents, source.sheets);
      storedFiles.push({ storedPath: stored.storedPath });

      let imported: object;
      switch (source.sourceId) {
        case 'fleet.equipment':
          imported = operations.importLegacyPortfolio(batchId, source.parsed.rows);
          break;
        case 'fleet.contracts':
        case 'fleet.contract-details':
          imported = operations.importLegacyFleetMetadata(batchId, source.parsed.sourceType, source.parsed.rows);
          break;
        case 'consumibles.detail':
        case 'consumibles.parts-detail':
        case 'consumibles.parts-usage':
          imported = consumables.importRows(
            batchId,
            source.sourceName,
            bundleConsumablesSourceType(source.sourceId),
            source.parsed.rows,
            source.parsed.skippedOutOfScope,
            plan.replacementBatches.map((batch) => batch.id),
          );
          break;
        case 'consumibles.dispatch':
        case 'consumibles.parts-dispatch':
          imported = consumables.importOutputRows(
            batchId,
            source.sourceName,
            bundleConsumablesSourceType(source.sourceId),
            source.parsed.rows,
            source.parsed.skippedOutOfScope,
            plan.replacementBatches.map((batch) => batch.id),
          );
          break;
        case 'services.lam':
          imported = services.importRows(
            batchId,
            source.sourceName,
            source.parsed.rows,
            source.parsed.skippedOutOfScope,
            plan.replacementBatches.map((batch) => batch.id),
          );
          break;
      }

      return {
        sourceId: source.sourceId,
        sourceName: source.sourceName,
        duplicate: false,
        batchId,
        sourceHash,
        rows: rowCount,
        skippedRows,
        rawRows: stored.rawRows,
        rawSheets: stored.rawSheets,
        ...imported,
      };
    }))();

    return { atomic: true, results };
  } catch (error) {
    restoreArchivedImportFiles(dataDirectory, archivedFiles);
    removeStoredImportFiles(dataDirectory, storedFiles);
    throw error;
  }
}

export function storePreparedSpreadsheetImport(
  dataDirectory: string,
  imports: ImportRepository,
  batchId: string,
  fileName: string,
  contents: Uint8Array,
  sheets: readonly WorkbookSheetRows[],
) {
  const stored = storeImportFile(
    dataDirectory,
    batchId,
    fileName,
    contents,
  );
  try {
    const id = imports.addFile({
      batchId,
      fileName,
      storedPath: stored.storedPath,
      contentHash: stored.contentHash,
      contentType: 'application/vnd.openxmlformats-officedocument.spreadsheetml.sheet',
      sizeBytes: stored.sizeBytes,
      contentBlob: contents,
    });
    const raw = imports.addSourceRows(batchId, id, sheets);
    return { id, ...stored, rawRows: raw.rows, rawSheets: raw.sheets };
  } catch (error) {
    removeStoredImportFiles(dataDirectory, [stored]);
    throw error;
  }
}

export function removeStoredImportFiles(dataDirectory: string, files: readonly { storedPath: string }[]): void {
  const dataRoot = path.resolve(dataDirectory);
  for (const file of files) {
    const absolutePath = path.resolve(dataRoot, file.storedPath);
    const relativePath = path.relative(dataRoot, absolutePath);
    if (!relativePath || relativePath.startsWith('..') || path.isAbsolute(relativePath)) continue;
    if (fs.existsSync(absolutePath)) fs.unlinkSync(absolutePath);
  }
}

export function bundleSourceDomain(sourceId: ConsumablesBundleSourceId): string {
  if (sourceId === 'fleet.equipment') return 'operations';
  if (sourceId === 'fleet.contracts') return 'operations-fleet-contracts';
  if (sourceId === 'fleet.contract-details') return 'operations-fleet-contract-details';
  if (sourceId === 'services.lam') return 'services';
  return 'consumibles';
}

export function bundleSourceType(sourceId: ConsumablesBundleSourceId): string {
  if (sourceId === 'fleet.equipment') return 'fleet.equipment';
  if (sourceId === 'fleet.contracts') return 'contracts';
  if (sourceId === 'fleet.contract-details') return 'contract-details';
  if (sourceId === 'services.lam') return 'servicios';
  return bundleConsumablesSourceType(sourceId);
}

export function bundleConsumablesSourceType(
  sourceId: Exclude<ConsumablesBundleSourceId, 'fleet.equipment' | 'fleet.contracts' | 'fleet.contract-details' | 'services.lam'>,
): ConsumablesSourceType {
  switch (sourceId) {
    case 'consumibles.detail': return 'consumibles';
    case 'consumibles.parts-detail': return 'repuestos';
    case 'consumibles.parts-usage': return 'uso-repuestos';
    case 'consumibles.dispatch': return 'salida-consumibles';
    case 'consumibles.parts-dispatch': return 'salida-repuestos';
  }
}

export function bundleReplacementBatches(
  imports: ImportRepository,
  sourceId: ConsumablesBundleSourceId,
): ReturnType<ImportRepository['listAppliedBySourceType']> {
  if (sourceId === 'services.lam') {
    const typed = imports.listAppliedBySourceType('services', 'servicios');
    return typed.length > 0 ? typed : imports.listApplied('services');
  }
  const sourceType = sourceId === 'fleet.equipment'
    || sourceId === 'fleet.contracts'
    || sourceId === 'fleet.contract-details'
    ? null
    : bundleConsumablesSourceType(sourceId);
  return sourceType ? imports.listAppliedBySourceType('consumibles', sourceType) : [];
}
