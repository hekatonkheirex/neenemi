import fs from 'node:fs';
import os from 'node:os';
import path from 'node:path';
import { afterEach, describe, expect, it } from 'vitest';
import { openDatabase } from './database';
import { OverviewRepository } from './overview';
import { ImportRepository } from './repositories';

const temporaryDirectories: string[] = [];

function makeDatabase() {
  const directory = fs.mkdtempSync(path.join(os.tmpdir(), 'datasystems-suite-overview-'));
  temporaryDirectories.push(directory);
  return openDatabase(path.join(directory, 'suite.sqlite'));
}

afterEach(() => {
  for (const directory of temporaryDirectories.splice(0)) {
    fs.rmSync(directory, { recursive: true, force: true });
  }
});

describe('OverviewRepository', () => {
  it('summarizes shared records and the latest import sources', () => {
    const database = makeDatabase();
    const imports = new ImportRepository(database);
    const overview = new OverviewRepository(database);
    const batchId = imports.createBatch({ domain: 'operations-canon', sourceName: 'canon.xlsx' });
    imports.addFile({
      batchId,
      fileName: 'canon.xlsx',
      storedPath: 'imports/operations-canon/canon.xlsx',
      contentHash: 'hash',
      sizeBytes: 100,
    });
    imports.markApplied(batchId);
    database.prepare(`
      INSERT INTO customers (id, name, normalized_name, created_at, updated_at)
      VALUES ('customer-1', 'Cliente Uno', 'CLIENTE UNO', '2026-01-01', '2026-01-01')
    `).run();

    expect(overview.get()).toEqual(expect.objectContaining({
      counts: expect.objectContaining({ customers: 1, parts: 0, equipment: 0, modelSupportItems: 0, waldbottStockItems: 0 }),
      appliedImports: 1,
      recentImports: [expect.objectContaining({
        id: batchId,
        domain: 'operations-canon',
        sourceName: 'canon.xlsx',
        status: 'applied',
        files: 1,
      })],
    }));

    database.close();
  });
});
