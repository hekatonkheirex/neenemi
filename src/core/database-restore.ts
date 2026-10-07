import { createHash, randomUUID } from 'node:crypto';
import Database from 'better-sqlite3';
import fs from 'node:fs';
import path from 'node:path';
import { Transform, type Readable } from 'node:stream';
import { pipeline } from 'node:stream/promises';
import { MAX_RESTORE_BYTES, MAX_RESTORE_LABEL } from './restore-limit';
import { CORE_MIGRATIONS, resolveDatabasePath, type SuiteDatabase } from '../db/database';

const sqliteHeader = Buffer.from('SQLite format 3\0', 'utf8');

export async function stageDatabaseRestore(
  dataDirectory: string,
  source: Readable,
): Promise<string> {
  const dataRoot = path.resolve(dataDirectory);
  fs.mkdirSync(dataRoot, { recursive: true });
  const candidatePath = path.join(dataRoot, `.dcss-restore-${randomUUID()}.sqlite`);
  let receivedBytes = 0;

  const sizeLimit = new Transform({
    transform(chunk: Buffer, _encoding, callback) {
      receivedBytes += chunk.byteLength;
      if (receivedBytes > MAX_RESTORE_BYTES) {
        callback(new Error(`El respaldo supera el máximo permitido de ${MAX_RESTORE_LABEL}.`));
        return;
      }
      callback(null, chunk);
    },
  });

  try {
    await pipeline(source, sizeLimit, fs.createWriteStream(candidatePath, { flags: 'wx', mode: 0o600 }));
    if (receivedBytes < sqliteHeader.byteLength) throw new Error('El archivo seleccionado está vacío o incompleto.');

    const header = Buffer.alloc(sqliteHeader.byteLength);
    const descriptor = fs.openSync(candidatePath, 'r');
    try {
      fs.readSync(descriptor, header, 0, header.byteLength, 0);
    } finally {
      fs.closeSync(descriptor);
    }
    if (!header.equals(sqliteHeader)) throw new Error('El archivo no tiene el formato de una base SQLite.');

    await validateSelfContainedBackup(candidatePath);
    return candidatePath;
  } catch (error) {
    fs.rmSync(candidatePath, { force: true });
    throw error;
  }
}

export async function activateStagedDatabaseRestore(
  dataDirectory: string,
  database: SuiteDatabase,
  candidatePath: string,
): Promise<string> {
  const dataRoot = path.resolve(dataDirectory);
  const normalizedCandidate = path.resolve(candidatePath);
  if (path.dirname(normalizedCandidate) !== dataRoot
    || !/^\.dcss-restore-[a-f\d-]+\.sqlite$/i.test(path.basename(normalizedCandidate))) {
    throw new Error('La ruta del respaldo preparado no es válida.');
  }
  if (!fs.existsSync(normalizedCandidate)) throw new Error('El respaldo preparado ya no está disponible.');

  const currentPath = resolveDatabasePath(dataRoot);
  const backupsDirectory = path.join(dataRoot, 'backups');
  fs.mkdirSync(backupsDirectory, { recursive: true });
  const token = randomUUID();
  const safetyPath = path.join(backupsDirectory, `dcss-suite-before-restore-${new Date().toISOString().replaceAll(':', '-')}-${token.slice(0, 8)}.sqlite`);

  await database.backup(safetyPath);
  database.pragma('wal_checkpoint(TRUNCATE)');
  database.close();
  removeSqliteSidecars(currentPath);
  fs.renameSync(normalizedCandidate, currentPath);
  return safetyPath;
}

function validateSelfContainedBackup(databasePath: string): Promise<void> {
  return validateBackup(databasePath);
}

async function validateBackup(databasePath: string): Promise<void> {
  const backup = new Database(databasePath, { readonly: true, fileMustExist: true });
  try {
    backup.pragma('query_only = ON');
    backup.pragma('trusted_schema = OFF');

    const quickCheck = backup.pragma('quick_check') as Array<{ quick_check: string }>;
    if (quickCheck.length === 0 || quickCheck.some((row) => row.quick_check !== 'ok')) {
      throw new Error('SQLite detectó daños en el respaldo. La base activa no se modificó.');
    }

    const foreignKeyIssues = backup.pragma('foreign_key_check') as unknown[];
    if (foreignKeyIssues.length > 0) {
      throw new Error('El respaldo tiene relaciones internas incompletas. La base activa no se modificó.');
    }

    const tables = new Set((backup.prepare("SELECT name FROM sqlite_master WHERE type = 'table'").all() as Array<{ name: string }>).map((row) => row.name));
    if (!tables.has('schema_migrations') || !tables.has('import_files')) {
      throw new Error('El archivo no es un respaldo de DCSS Suite.');
    }

    const migrations = backup.prepare('SELECT version, name FROM schema_migrations ORDER BY version').all() as Array<{ version: number; name: string }>;
    if (migrations.length !== CORE_MIGRATIONS.length
      || migrations.some((row, index) => row.version !== CORE_MIGRATIONS[index]?.version || row.name !== CORE_MIGRATIONS[index]?.name)) {
      throw new Error('La versión del respaldo no es compatible con esta Suite.');
    }

    if (!tables.has('archived_import_files')) {
      throw new Error('El respaldo no contiene los archivos originales. Genera uno nuevo desde la versión actual.');
    }

    const hasBlob = (tableName: 'import_files' | 'archived_import_files') => {
      const columns = new Set((backup.prepare(`PRAGMA table_info(${tableName})`).all() as Array<{ name: string }>).map((row) => row.name));
      return columns.has('content_blob');
    };
    if (!hasBlob('import_files') || !hasBlob('archived_import_files')) {
      throw new Error('El respaldo no contiene los archivos originales. Genera uno nuevo desde la versión actual.');
    }

    let fileCount = 0;
    for (const tableName of ['import_files', 'archived_import_files'] as const) {
      const files = backup
        .prepare(`SELECT id, content_hash, size_bytes, content_blob FROM ${tableName} ORDER BY id`)
        .iterate() as Iterable<{ id: string; content_hash: string; size_bytes: number; content_blob: Buffer | null }>;
      for (const file of files) {
        fileCount += 1;
        if (!file.content_blob
          || file.content_blob.byteLength !== file.size_bytes
          || createHash('sha256').update(file.content_blob).digest('hex') !== file.content_hash) {
          throw new Error('Falta un archivo original o no coincide con su hash. La base activa no se modificó.');
        }
        if (fileCount % 8 === 0) await new Promise<void>((resolve) => setImmediate(resolve));
      }
    }
  } finally {
    backup.close();
  }
}

function removeSqliteSidecars(databasePath: string): void {
  for (const suffix of ['-wal', '-shm', '-journal']) {
    fs.rmSync(`${databasePath}${suffix}`, { force: true });
  }
}
