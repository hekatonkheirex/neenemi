import fs from 'node:fs';
import os from 'node:os';
import path from 'node:path';
import { afterEach, describe, expect, it } from 'vitest';
import { archiveImportFiles, restoreArchivedImportFiles, storeImportFile } from './import-storage';

const temporaryDirectories: string[] = [];

afterEach(() => {
  for (const directory of temporaryDirectories.splice(0)) {
    fs.rmSync(directory, { recursive: true, force: true });
  }
});

describe('storeImportFile', () => {
  it('stores the original under the data directory and returns its hash metadata', () => {
    const dataDirectory = fs.mkdtempSync(path.join(os.tmpdir(), 'datasystems-suite-files-'));
    temporaryDirectories.push(dataDirectory);
    const contents = new TextEncoder().encode('catalogo de prueba');

    const stored = storeImportFile(dataDirectory, 'batch/one', '../catalogo.xlsx', contents);

    expect(stored.storedPath).toMatch(/^imports\/batch_one\/[a-f0-9]{16}-catalogo\.xlsx$/);
    expect(stored.sizeBytes).toBe(contents.byteLength);
    expect(stored.contentHash).toHaveLength(64);
    expect(fs.readFileSync(path.join(dataDirectory, stored.storedPath), 'utf8')).toBe('catalogo de prueba');
    expect(fs.existsSync(path.join(dataDirectory, 'catalogo.xlsx'))).toBe(false);
  });

  it('archives and restores an original import without exposing paths outside data', () => {
    const dataDirectory = fs.mkdtempSync(path.join(os.tmpdir(), 'datasystems-suite-archive-'));
    temporaryDirectories.push(dataDirectory);
    const stored = storeImportFile(dataDirectory, 'batch-archive', 'detalle.xlsx', new TextEncoder().encode('archivo original'));

    const archived = archiveImportFiles(dataDirectory, 'batch-archive', [stored]);
    expect(archived).toHaveLength(1);
    expect(fs.existsSync(path.join(dataDirectory, stored.storedPath))).toBe(false);
    expect(fs.existsSync(path.join(dataDirectory, archived[0].archivedPath))).toBe(true);

    restoreArchivedImportFiles(dataDirectory, archived);
    expect(fs.readFileSync(path.join(dataDirectory, stored.storedPath), 'utf8')).toBe('archivo original');
  });
});
