import { createHash } from 'node:crypto';
import fs from 'node:fs';
import path from 'node:path';

export type StoredImportFile = {
  storedPath: string;
  contentHash: string;
  sizeBytes: number;
};

export type ArchivedImportFile = {
  storedPath: string;
  archivedPath: string;
};

export function storeImportFile(
  dataDirectory: string,
  batchId: string,
  fileName: string,
  contents: Uint8Array,
): StoredImportFile {
  const safeBatchId = sanitizeSegment(batchId) || 'batch';
  const safeFileName = sanitizeFileName(fileName);
  const buffer = Buffer.from(contents);
  const contentHash = createHash('sha256').update(buffer).digest('hex');
  const storedFileName = `${contentHash.slice(0, 16)}-${safeFileName}`;
  const relativeDirectory = path.posix.join('imports', safeBatchId);
  const storedPath = path.posix.join(relativeDirectory, storedFileName);
  const absoluteDirectory = path.join(path.resolve(dataDirectory), 'imports', safeBatchId);

  fs.mkdirSync(absoluteDirectory, { recursive: true });
  fs.writeFileSync(path.join(absoluteDirectory, storedFileName), buffer);

  return { storedPath, contentHash, sizeBytes: buffer.byteLength };
}

export function archiveImportFiles(
  dataDirectory: string,
  batchId: string,
  files: readonly { storedPath: string }[],
): ArchivedImportFile[] {
  const dataRoot = path.resolve(dataDirectory);
  const archiveDirectory = path.join(dataRoot, 'imports', '.removed', sanitizeSegment(batchId) || 'batch');
  const moved: ArchivedImportFile[] = [];

  try {
    for (const [index, file] of files.entries()) {
      const sourcePath = resolveDataPath(dataRoot, file.storedPath);
      if (!fs.existsSync(sourcePath)) continue;

      fs.mkdirSync(archiveDirectory, { recursive: true });
      const archivedFileName = `${String(index + 1).padStart(3, '0')}-${path.basename(sourcePath)}`;
      const archivedPath = path.join(archiveDirectory, archivedFileName);
      fs.renameSync(sourcePath, archivedPath);
      moved.push({
        storedPath: file.storedPath,
        archivedPath: path.relative(dataRoot, archivedPath).split(path.sep).join(path.posix.sep),
      });
    }
  } catch (error) {
    restoreArchivedImportFiles(dataDirectory, moved);
    throw error;
  }

  return moved;
}

export function restoreArchivedImportFiles(
  dataDirectory: string,
  files: readonly ArchivedImportFile[],
): void {
  const dataRoot = path.resolve(dataDirectory);
  for (const file of [...files].reverse()) {
    const archivedPath = resolveDataPath(dataRoot, file.archivedPath);
    const storedPath = resolveDataPath(dataRoot, file.storedPath);
    if (!fs.existsSync(archivedPath)) continue;
    fs.mkdirSync(path.dirname(storedPath), { recursive: true });
    fs.renameSync(archivedPath, storedPath);
  }
}

export function readStoredImportFile(dataDirectory: string, storedPath: string): Uint8Array | null {
  try {
    const absolutePath = resolveDataPath(path.resolve(dataDirectory), storedPath);
    if (!fs.existsSync(absolutePath) || !fs.statSync(absolutePath).isFile()) return null;
    return new Uint8Array(fs.readFileSync(absolutePath));
  } catch {
    return null;
  }
}

export function storedImportFileExists(dataDirectory: string, storedPath: string): boolean {
  try {
    const absolutePath = resolveDataPath(path.resolve(dataDirectory), storedPath);
    return fs.existsSync(absolutePath) && fs.statSync(absolutePath).isFile();
  } catch {
    return false;
  }
}

export function writeStoredImportFile(dataDirectory: string, storedPath: string, contents: Uint8Array): void {
  const dataRoot = path.resolve(dataDirectory);
  const absolutePath = resolveDataPath(dataRoot, storedPath);
  if (storedImportFileExists(dataRoot, storedPath)) return;
  fs.mkdirSync(path.dirname(absolutePath), { recursive: true });
  try {
    fs.writeFileSync(absolutePath, Buffer.from(contents), { flag: 'wx' });
  } catch (error) {
    if (isFileAlreadyExistsError(error)) return;
    throw error;
  }
}

function resolveDataPath(dataRoot: string, relativePath: string): string {
  const absolutePath = path.resolve(dataRoot, relativePath);
  const relative = path.relative(dataRoot, absolutePath);
  if (!relative || relative.startsWith('..') || path.isAbsolute(relative)) {
    throw new Error('La ruta física de la importación no es válida.');
  }
  return absolutePath;
}

function sanitizeSegment(value: string): string {
  return value.replace(/[^a-zA-Z0-9_-]+/g, '_').replace(/^\.+|\.+$/g, '');
}

function sanitizeFileName(value: string): string {
  const baseName = path.basename(value.replaceAll('\\', '/'));
  const sanitized = baseName.replace(/[^a-zA-Z0-9._-]+/g, '_');
  if (!sanitized || sanitized === '.' || sanitized === '..') {
    throw new Error('El nombre del archivo de importación no es válido.');
  }
  return sanitized;
}

function isFileAlreadyExistsError(error: unknown): boolean {
  return typeof error === 'object' && error !== null && 'code' in error && error.code === 'EEXIST';
}
