import { createHash } from 'node:crypto';
import type { ImportRepository } from '../db/repositories';
import { readWorkbookSheets } from '../modules/consumibles/xlsx-helpers';
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
