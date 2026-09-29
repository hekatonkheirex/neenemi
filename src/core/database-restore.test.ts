import fs from 'node:fs';
import os from 'node:os';
import path from 'node:path';
import { spawn } from 'node:child_process';
import { createHash } from 'node:crypto';
import { Readable } from 'node:stream';
import { afterEach, describe, expect, it } from 'vitest';
import { CORE_MIGRATIONS, openDatabase, resolveDatabasePath } from '../db/database';
import { ImportRepository, SettingsRepository } from '../db/repositories';
import { activateStagedDatabaseRestore, stageDatabaseRestore } from './database-restore';

const temporaryDirectories: string[] = [];
const openDatabases: Array<ReturnType<typeof openDatabase>> = [];

async function stopRestoreProcessAtRenameBoundary(
  dataDirectory: string,
  candidatePath: string,
  phase: 'before' | 'after',
): Promise<void> {
  const databaseModuleUrl = new URL('../db/database.ts', import.meta.url).href;
  const restoreModuleUrl = new URL('./database-restore.ts', import.meta.url).href;
  const script = `
    import fs from 'node:fs';
    import path from 'node:path';
    const dataDirectory = ${JSON.stringify(dataDirectory)};
    const candidatePath = ${JSON.stringify(candidatePath)};
    const phase = ${JSON.stringify(phase)};
    const { openDatabase, resolveDatabasePath } = await import(${JSON.stringify(databaseModuleUrl)});
    const { activateStagedDatabaseRestore } = await import(${JSON.stringify(restoreModuleUrl)});
    const database = openDatabase(resolveDatabasePath(dataDirectory));
    const rename = fs.renameSync.bind(fs);
    fs.renameSync = (source, destination) => {
      if (path.resolve(source) === path.resolve(candidatePath)
        && path.resolve(destination) === path.resolve(resolveDatabasePath(dataDirectory))) {
        if (phase === 'after') rename(source, destination);
        fs.writeSync(1, 'READY\\n');
        const lock = new Int32Array(new SharedArrayBuffer(4));
        while (true) Atomics.wait(lock, 0, 0, 1000);
      }
      return rename(source, destination);
    };
    await activateStagedDatabaseRestore(dataDirectory, database, candidatePath);
    process.exitCode = 1;
  `;
  const child = spawn(process.execPath, ['--import', 'tsx', '--input-type=module', '--eval', script], {
    cwd: process.cwd(),
    stdio: ['ignore', 'pipe', 'pipe'],
  });
  let output = '';
  let errorOutput = '';
  const ready = new Promise<void>((resolve, reject) => {
    const timeout = setTimeout(() => {
      child.kill('SIGKILL');
      reject(new Error(`El proceso no alcanzó el punto ${phase} al reemplazo. ${errorOutput}`));
    }, 30000);
    child.stdout?.on('data', (chunk: Buffer) => {
      output += chunk.toString();
      if (output.includes('READY')) {
        clearTimeout(timeout);
        resolve();
      }
    });
    child.stderr?.on('data', (chunk: Buffer) => {
      errorOutput += chunk.toString();
    });
    child.once('error', (error) => {
      clearTimeout(timeout);
      reject(error);
    });
    child.once('exit', (code, signal) => {
      clearTimeout(timeout);
      reject(new Error(`El proceso terminó antes del punto ${phase} (${signal ?? code}). ${errorOutput}`));
    });
  });

  await ready;
  child.kill('SIGKILL');
  await new Promise<void>((resolve) => {
    if (child.exitCode !== null) {
      resolve();
      return;
    }
    child.once('exit', () => resolve());
  });
}

afterEach(() => {
  for (const database of openDatabases.splice(0)) {
    if (database.open) database.close();
  }
  for (const directory of temporaryDirectories.splice(0)) {
    fs.rmSync(directory, { recursive: true, force: true });
  }
});

describe('SQLite restore', () => {
  it('validates a self-contained backup, snapshots the active database, and atomically replaces it', async () => {
    const dataDirectory = fs.mkdtempSync(path.join(os.tmpdir(), 'datasystems-suite-restore-'));
    temporaryDirectories.push(dataDirectory);
    const activePath = resolveDatabasePath(dataDirectory);
    const active = openDatabase(activePath);
    openDatabases.push(active);
    new SettingsRepository(active).set('restore-test', 'state', 'active');

    const sourcePath = path.join(dataDirectory, 'source.sqlite');
    const source = openDatabase(sourcePath);
    openDatabases.push(source);
    new SettingsRepository(source).set('restore-test', 'state', 'restored');
    const imports = new ImportRepository(source);
    const batchId = imports.createBatch({ domain: 'catalog', sourceName: 'catalogo.xlsx' });
    const original = new TextEncoder().encode('original incluido');
    imports.addFile({
      batchId,
      fileName: 'catalogo.xlsx',
      storedPath: 'imports/catalogo.xlsx',
      contentHash: createHash('sha256').update(original).digest('hex'),
      sizeBytes: original.byteLength,
      contentBlob: original,
    });
    const archivedBatchId = imports.createBatch({ domain: 'catalog', sourceName: 'anterior.xlsx' });
    const archivedOriginal = new TextEncoder().encode('original archivado');
    const archivedFileId = imports.addFile({
      batchId: archivedBatchId,
      fileName: 'anterior.xlsx',
      storedPath: 'imports/anterior.xlsx',
      contentHash: createHash('sha256').update(archivedOriginal).digest('hex'),
      sizeBytes: archivedOriginal.byteLength,
      contentBlob: archivedOriginal,
    });
    imports.removeBatch(archivedBatchId);
    const candidateSnapshotPath = path.join(dataDirectory, 'candidate-snapshot.sqlite');
    await source.backup(candidateSnapshotPath);
    source.close();
    openDatabases.splice(openDatabases.indexOf(source), 1);

    const candidate = await stageDatabaseRestore(
      dataDirectory,
      Readable.from(fs.readFileSync(candidateSnapshotPath)),
    );
    const safetyPath = await activateStagedDatabaseRestore(dataDirectory, active, candidate);
    openDatabases.splice(openDatabases.indexOf(active), 1);

    expect(fs.existsSync(activePath)).toBe(true);
    expect(fs.existsSync(safetyPath)).toBe(true);
    expect(path.dirname(safetyPath)).toBe(path.join(dataDirectory, 'backups'));
    expect(fs.existsSync(candidate)).toBe(false);

    const restored = openDatabase(activePath);
    openDatabases.push(restored);
    const restoredSettings = new SettingsRepository(restored);
    expect(restoredSettings.get('restore-test', 'state', '')).toBe('restored');
    const restoredImports = new ImportRepository(restored);
    const restoredBatch = restoredImports.listBatches().find((batch) => batch.sourceName === 'catalogo.xlsx');
    expect(restoredBatch).toBeDefined();
    expect(restoredImports.getFileContent(restoredImports.listFiles(restoredBatch!.id)[0].id)).toEqual(original);
    expect(restoredImports.getFileContent(archivedFileId)).toEqual(archivedOriginal);
    expect(restored.prepare('PRAGMA quick_check').get()).toEqual({ quick_check: 'ok' });
    expect(restored.prepare('SELECT COUNT(*) AS count FROM schema_migrations').get()).toEqual({ count: CORE_MIGRATIONS.length });
  });

  it('reopens either valid database when the process stops immediately before or after replacement', async () => {
    for (const phase of ['before', 'after'] as const) {
      const dataDirectory = fs.mkdtempSync(path.join(os.tmpdir(), `datasystems-suite-restore-crash-${phase}-`));
      temporaryDirectories.push(dataDirectory);
      const activePath = resolveDatabasePath(dataDirectory);
      const active = openDatabase(activePath);
      openDatabases.push(active);
      new SettingsRepository(active).set('restore-test', 'state', 'active');

      const source = openDatabase(path.join(dataDirectory, 'source.sqlite'));
      openDatabases.push(source);
      new SettingsRepository(source).set('restore-test', 'state', 'restored');
      const snapshotPath = path.join(dataDirectory, 'source-snapshot.sqlite');
      await source.backup(snapshotPath);
      source.close();
      openDatabases.splice(openDatabases.indexOf(source), 1);

      const candidate = await stageDatabaseRestore(dataDirectory, Readable.from(fs.readFileSync(snapshotPath)));
      active.close();
      openDatabases.splice(openDatabases.indexOf(active), 1);
      await stopRestoreProcessAtRenameBoundary(dataDirectory, candidate, phase);

      const reopened = openDatabase(activePath);
      openDatabases.push(reopened);
      expect(new SettingsRepository(reopened).get('restore-test', 'state', '')).toBe(phase === 'before' ? 'active' : 'restored');
      const backupNames = fs.readdirSync(path.join(dataDirectory, 'backups'));
      expect(backupNames).toHaveLength(1);
      const safetyCopy = openDatabase(path.join(dataDirectory, 'backups', backupNames[0]!));
      openDatabases.push(safetyCopy);
      expect(new SettingsRepository(safetyCopy).get('restore-test', 'state', '')).toBe('active');
      safetyCopy.close();
      openDatabases.splice(openDatabases.indexOf(safetyCopy), 1);
      expect(fs.existsSync(candidate)).toBe(phase === 'before');
      reopened.close();
      openDatabases.splice(openDatabases.indexOf(reopened), 1);
    }
  });

  it('rejects a non-SQLite upload before changing the active database', async () => {
    const dataDirectory = fs.mkdtempSync(path.join(os.tmpdir(), 'datasystems-suite-restore-invalid-'));
    temporaryDirectories.push(dataDirectory);
    const active = openDatabase(resolveDatabasePath(dataDirectory));
    openDatabases.push(active);
    new SettingsRepository(active).set('restore-test', 'state', 'keep');

    await expect(stageDatabaseRestore(dataDirectory, Readable.from(Buffer.from('not sqlite'))))
      .rejects.toThrow('vacío o incompleto');

    expect(new SettingsRepository(active).get('restore-test', 'state', '')).toBe('keep');
    expect(fs.readdirSync(dataDirectory).filter((name) => name.startsWith('.dcss-restore-'))).toEqual([]);
  });

  it('rejects an older schema-only database that cannot contain the originals', async () => {
    const dataDirectory = fs.mkdtempSync(path.join(os.tmpdir(), 'datasystems-suite-restore-old-'));
    temporaryDirectories.push(dataDirectory);
    const oldPath = path.join(dataDirectory, 'old.sqlite');
    const oldDatabase = openDatabase(oldPath, CORE_MIGRATIONS.slice(0, -1));
    openDatabases.push(oldDatabase);
    const oldSnapshotPath = path.join(dataDirectory, 'old-snapshot.sqlite');
    await oldDatabase.backup(oldSnapshotPath);
    oldDatabase.close();
    openDatabases.splice(openDatabases.indexOf(oldDatabase), 1);

    await expect(stageDatabaseRestore(dataDirectory, Readable.from(fs.readFileSync(oldSnapshotPath))))
      .rejects.toThrow('versión del respaldo no es compatible');
  });

  it('rejects a backup with a missing archived original', async () => {
    const dataDirectory = fs.mkdtempSync(path.join(os.tmpdir(), 'datasystems-suite-restore-missing-archive-'));
    temporaryDirectories.push(dataDirectory);
    const database = openDatabase(path.join(dataDirectory, 'source.sqlite'));
    openDatabases.push(database);
    const imports = new ImportRepository(database);
    const batchId = imports.createBatch({ domain: 'catalog', sourceName: 'catalogo.xlsx' });
    const original = new TextEncoder().encode('original archivado');
    imports.addFile({
      batchId,
      fileName: 'catalogo.xlsx',
      storedPath: 'imports/catalogo.xlsx',
      contentHash: createHash('sha256').update(original).digest('hex'),
      sizeBytes: original.byteLength,
      contentBlob: original,
    });
    imports.removeBatch(batchId);
    database.prepare('UPDATE archived_import_files SET content_blob = NULL').run();
    const snapshotPath = path.join(dataDirectory, 'missing-archive.sqlite');
    await database.backup(snapshotPath);
    database.close();
    openDatabases.splice(openDatabases.indexOf(database), 1);

    await expect(stageDatabaseRestore(dataDirectory, Readable.from(fs.readFileSync(snapshotPath))))
      .rejects.toThrow('Falta un archivo original');
  });
});
