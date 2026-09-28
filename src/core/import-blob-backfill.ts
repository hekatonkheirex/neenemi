import { createHash } from 'node:crypto';
import fs from 'node:fs';
import path from 'node:path';
import type { ImportFileBackfillCandidate, ImportRepository } from '../db/repositories';
import { readStoredImportFile } from './import-storage';

export type ImportBlobBackfillResult = {
  total: number;
  embedded: number;
  failed: number;
  errors: string[];
};

export type ImportOriginalsStatus = {
  totalFiles: number;
  embeddedFiles: number;
  missingFiles: number;
  totalBytes: number;
  embeddedBytes: number;
};

type RemovedImportFile = {
  sourceBatchId: string;
  fileName: string;
  storedPath: string;
  sizeBytes: number;
  contentHashPrefix: string | null;
};

export function getImportOriginalsStatus(
  dataDirectory: string,
  imports: ImportRepository,
): ImportOriginalsStatus {
  const status = imports.getFileContentStatus();
  const unregistered = listUnregisteredRemovedFiles(dataDirectory, imports);
  const unregisteredBytes = unregistered.reduce((total, file) => total + file.sizeBytes, 0);
  return {
    ...status,
    totalFiles: status.totalFiles + unregistered.length,
    missingFiles: status.missingFiles + unregistered.length,
    totalBytes: status.totalBytes + unregisteredBytes,
  };
}

export async function backfillImportFileBlobs(
  dataDirectory: string,
  imports: ImportRepository,
  onProgress: (completed: number, total: number, fileName: string) => void = () => undefined,
): Promise<ImportBlobBackfillResult> {
  const candidates = imports.listFilesMissingContent();
  const removedFiles = listPhysicalRemovedFiles(dataDirectory);
  const unregistered = findUnregisteredRemovedFiles(removedFiles, imports.listArchivedFileKeys());
  const total = candidates.length + unregistered.length;
  const result: ImportBlobBackfillResult = { total, embedded: 0, failed: 0, errors: [] };
  let completed = 0;

  for (const file of candidates) {
    const contents = readStoredImportFile(dataDirectory, file.storedPath)
      ?? readMatchingRemovedOriginal(file, removedFiles, dataDirectory);
    if (!contents) {
      recordFailure(result, file.fileName, 'No se encontró el original en la carpeta de importaciones.');
    } else if (contents.byteLength !== file.sizeBytes) {
      recordFailure(result, file.fileName, 'El tamaño del original no coincide con sus metadatos.');
    } else if (createHash('sha256').update(contents).digest('hex') !== file.contentHash) {
      recordFailure(result, file.fileName, 'El hash del original no coincide con sus metadatos.');
    } else {
      imports.storeFileContent(file.id, contents);
      result.embedded += 1;
    }

    completed += 1;
    onProgress(completed, total, file.fileName);
    await yieldToEventLoop();
  }

  for (const file of unregistered) {
    const contents = readStoredImportFile(dataDirectory, file.storedPath);
    if (!contents) {
      recordFailure(result, file.fileName, 'El original archivado ya no está disponible.');
    } else if (contents.byteLength !== file.sizeBytes) {
      recordFailure(result, file.fileName, 'El tamaño del original archivado cambió durante el proceso.');
    } else {
      const contentHash = createHash('sha256').update(contents).digest('hex');
      if (file.contentHashPrefix && !contentHash.startsWith(file.contentHashPrefix)) {
        recordFailure(result, file.fileName, 'El hash del original archivado no coincide con su nombre.');
      } else {
        const added = imports.addArchivedFile({
          id: `removed-${createHash('sha256').update(file.storedPath).digest('hex').slice(0, 32)}`,
          sourceBatchId: file.sourceBatchId,
          fileName: file.fileName,
          storedPath: file.storedPath,
          contentHash,
          contentType: contentTypeFor(file.fileName),
          sizeBytes: file.sizeBytes,
          createdAt: new Date().toISOString(),
          contentBlob: contents,
        });
        if (added) result.embedded += 1;
        else recordFailure(result, file.fileName, 'El original ya estaba registrado, pero no se pudo verificar su registro.');
      }
    }

    completed += 1;
    onProgress(completed, total, file.fileName);
    await yieldToEventLoop();
  }

  return result;
}

function listUnregisteredRemovedFiles(dataDirectory: string, imports: ImportRepository): RemovedImportFile[] {
  return findUnregisteredRemovedFiles(listPhysicalRemovedFiles(dataDirectory), imports.listArchivedFileKeys());
}

function listPhysicalRemovedFiles(dataDirectory: string): RemovedImportFile[] {
  const dataRoot = path.resolve(dataDirectory);
  const removedRoot = path.join(dataRoot, 'imports', '.removed');
  if (!fs.existsSync(removedRoot) || !fs.statSync(removedRoot).isDirectory()) return [];

  const files: RemovedImportFile[] = [];
  const visit = (directory: string) => {
    for (const entry of fs.readdirSync(directory, { withFileTypes: true })) {
      const absolutePath = path.join(directory, entry.name);
      if (entry.isDirectory()) {
        visit(absolutePath);
      } else if (entry.isFile()) {
        const relativePath = path.relative(dataRoot, absolutePath).split(path.sep).join(path.posix.sep);
        const segments = path.relative(removedRoot, absolutePath).split(path.sep);
        const { fileName, contentHashPrefix } = parseArchivedFileName(entry.name);
        files.push({
          sourceBatchId: segments[0] || 'removed',
          fileName,
          storedPath: relativePath,
          sizeBytes: fs.statSync(absolutePath).size,
          contentHashPrefix,
        });
      }
    }
  };
  visit(removedRoot);
  return files.sort((left, right) => left.storedPath.localeCompare(right.storedPath));
}

function findUnregisteredRemovedFiles(
  files: readonly RemovedImportFile[],
  registeredKeys: readonly { sourceBatchId: string; fileName: string; contentHashPrefix: string; sizeBytes: number }[],
): RemovedImportFile[] {
  const available = new Set(registeredKeys.map((_, index) => index));
  const hashIndexes = new Map<string, number[]>();
  const nameIndexes = new Map<string, number[]>();
  registeredKeys.forEach((key, index) => {
    addIndex(hashIndexes, archiveHashKey(key.sourceBatchId, key.contentHashPrefix, key.sizeBytes), index);
    addIndex(nameIndexes, archiveNameKey(key.sourceBatchId, key.fileName, key.sizeBytes), index);
  });

  const takeMatch = (indexes: Map<string, number[]>, key: string): boolean => {
    const matching = indexes.get(key);
    if (!matching) return false;
    const availableIndex = matching.find((index) => available.has(index));
    if (availableIndex === undefined) return false;
    available.delete(availableIndex);
    return true;
  };

  const unregistered: RemovedImportFile[] = [];
  for (const file of files) {
    const matched = file.contentHashPrefix
      ? takeMatch(hashIndexes, archiveHashKey(file.sourceBatchId, file.contentHashPrefix, file.sizeBytes))
      : takeMatch(nameIndexes, archiveNameKey(file.sourceBatchId, file.fileName, file.sizeBytes));
    if (!matched) unregistered.push(file);
  }
  return unregistered;
}

function readMatchingRemovedOriginal(
  candidate: ImportFileBackfillCandidate,
  removedFiles: readonly RemovedImportFile[],
  dataDirectory: string,
): Uint8Array | null {
  if (!candidate.archiveBatchId) return null;
  const prefix = candidate.contentHash.slice(0, 16);
  const file = removedFiles.find((entry) => entry.sourceBatchId === candidate.archiveBatchId
    && entry.contentHashPrefix === prefix
    && entry.sizeBytes === candidate.sizeBytes);
  return file ? readStoredImportFile(dataDirectory, file.storedPath) : null;
}

function parseArchivedFileName(fileName: string): { fileName: string; contentHashPrefix: string | null } {
  const match = /^(?:\d+-)?([a-f\d]{16})-(.+)$/i.exec(fileName);
  if (match) return { fileName: match[2], contentHashPrefix: match[1].toLowerCase() };
  return { fileName: fileName.replace(/^\d+-/, ''), contentHashPrefix: null };
}

function archiveHashKey(sourceBatchId: string, hashPrefix: string, sizeBytes: number): string {
  return `${sourceBatchId}\u0000${hashPrefix.toLowerCase()}\u0000${sizeBytes}`;
}

function archiveNameKey(sourceBatchId: string, fileName: string, sizeBytes: number): string {
  return `${sourceBatchId}\u0000name:${fileName.normalize('NFC').toLowerCase()}\u0000${sizeBytes}`;
}

function addIndex(indexes: Map<string, number[]>, key: string, index: number): void {
  const values = indexes.get(key) ?? [];
  values.push(index);
  indexes.set(key, values);
}

function contentTypeFor(fileName: string): string | undefined {
  switch (path.extname(fileName).toLowerCase()) {
    case '.csv': return 'text/csv';
    case '.db': return 'application/vnd.sqlite3';
    case '.json': return 'application/json';
    case '.pdf': return 'application/pdf';
    case '.xls': return 'application/vnd.ms-excel';
    case '.xlsx': return 'application/vnd.openxmlformats-officedocument.spreadsheetml.sheet';
    default: return undefined;
  }
}

function recordFailure(result: ImportBlobBackfillResult, fileName: string, error: string): void {
  result.failed += 1;
  result.errors.push(`${fileName}: ${error}`);
}

function yieldToEventLoop(): Promise<void> {
  return new Promise((resolve) => setImmediate(resolve));
}
