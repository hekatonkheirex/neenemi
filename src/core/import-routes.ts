import type { Response } from 'express';
import { createHash } from 'node:crypto';
import type { ImportRepository } from '../db/repositories';
import { readWorkbookSheets } from '../modules/consumibles/xlsx-helpers';
import type { ImportJobRegistry } from './import-jobs';
import { archiveImportFiles, readStoredImportFile, storeImportFile, storedImportFileExists, writeStoredImportFile, type ArchivedImportFile } from './import-storage';

export function archiveBatchImportFiles(
  dataDirectory: string,
  batchId: string,
  imports: ImportRepository,
): ArchivedImportFile[] {
  const files = imports.listFiles(batchId);
  for (const file of files) {
    const storedContents = imports.getFileContent(file.id);
    const contents = storedContents ?? readStoredImportFile(dataDirectory, file.storedPath);
    if (!contents) {
      throw new Error(`No se puede archivar “${file.fileName}”: no está la copia física ni el original en SQLite.`);
    }
    if (contents.byteLength !== file.sizeBytes
      || createHash('sha256').update(contents).digest('hex') !== file.contentHash) {
      throw new Error(`No se puede archivar “${file.fileName}”: el original no coincide con su hash o tamaño.`);
    }
    if (!storedContents) imports.storeFileContent(file.id, contents);

    if (storedImportFileExists(dataDirectory, file.storedPath)) {
      const physicalContents = readStoredImportFile(dataDirectory, file.storedPath);
      if (!physicalContents
        || physicalContents.byteLength !== file.sizeBytes
        || createHash('sha256').update(physicalContents).digest('hex') !== file.contentHash) {
        throw new Error(`No se puede archivar “${file.fileName}”: la copia física no coincide con su original.`);
      }
    } else {
      writeStoredImportFile(dataDirectory, file.storedPath, contents);
    }
  }
  return archiveImportFiles(dataDirectory, batchId, files);
}


export async function storeSpreadsheetImport(
  dataDirectory: string,
  imports: ImportRepository,
  batchId: string,
  fileName: string,
  contents: Uint8Array,
  contentType = 'application/vnd.openxmlformats-officedocument.spreadsheetml.sheet',
) {
  const sheets = await readWorkbookSheets(contents);
  const stored = storeImportFile(dataDirectory, batchId, fileName, contents);
  const id = imports.addFile({
    batchId,
    fileName,
    storedPath: stored.storedPath,
    contentHash: stored.contentHash,
    contentType,
    sizeBytes: stored.sizeBytes,
    contentBlob: contents,
  });
  const raw = imports.addSourceRows(batchId, id, sheets);
  return { id, ...stored, rawRows: raw.rows, rawSheets: raw.sheets };
}

export function storeAndRegisterImportFile(
  dataDirectory: string,
  imports: ImportRepository,
  batchId: string,
  fileName: string,
  contents: Uint8Array,
  contentType?: string,
) {
  const stored = storeImportFile(dataDirectory, batchId, fileName, contents);
  const id = imports.addFile({
    batchId,
    fileName,
    storedPath: stored.storedPath,
    contentHash: stored.contentHash,
    contentType,
    sizeBytes: stored.sizeBytes,
    contentBlob: contents,
  });
  return { id, ...stored };
}

export type ImportJobUpdate = (progress: number, stage: string) => void;

export function enqueueImportJob(
  registry: ImportJobRegistry,
  response: Response,
  input: { kind: string; sourceName: string },
  task: (update: ImportJobUpdate) => Promise<unknown>,
): void {
  const job = registry.create(input);
  void (async () => {
    await new Promise<void>((resolve) => setImmediate(resolve));
    registry.update(job.id, { status: 'running', progress: 5, stage: 'Preparando importación…' });
    try {
      const result = await task((progress, stage) => {
        registry.update(job.id, { status: 'running', progress, stage });
      });
      registry.complete(job.id, result);
    } catch (error) {
      registry.fail(job.id, error instanceof Error ? error.message : 'No se pudo completar la importación.');
    }
  })();
  response.status(202).json({ jobId: job.id, kind: input.kind, sourceName: input.sourceName });
}

export async function hydrateStoredSpreadsheetRows(
  dataDirectory: string,
  imports: ImportRepository,
  batchId: string,
): Promise<void> {
  const hydratedFileIds = new Set(imports.listSourceSheets(batchId).map((source) => source.importFileId));

  for (const file of imports.listFiles(batchId)) {
    if (!isSpreadsheetFile(file.fileName, file.contentType)) continue;
    if (hydratedFileIds.has(file.id)) continue;
    const contents = imports.getFileContent(file.id)
      ?? readStoredImportFile(dataDirectory, file.storedPath);
    if (!contents) continue;

    const sheets = await readWorkbookSheets(contents);
    imports.addSourceRows(batchId, file.id, sheets);
    hydratedFileIds.add(file.id);
  }
}

export function isSpreadsheetFile(fileName: string, contentType?: string | null): boolean {
  return contentType === 'application/vnd.openxmlformats-officedocument.spreadsheetml.sheet'
    || fileName.toLocaleLowerCase().endsWith('.xlsx');
}
