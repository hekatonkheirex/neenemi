import fs from 'node:fs';
import os from 'node:os';
import path from 'node:path';
import { afterEach, describe, expect, it } from 'vitest';
import { openDatabase } from '../../db/database';
import { DEFAULT_UNIFLOW_PRICE_CATALOG } from './catalog';
import { UniflowRepository } from './repository';

const temporaryDirectories: string[] = [];
const databases: Array<ReturnType<typeof openDatabase>> = [];

afterEach(() => {
  for (const database of databases.splice(0)) database.close();
  for (const directory of temporaryDirectories.splice(0)) fs.rmSync(directory, { recursive: true, force: true });
});

describe('UniflowRepository', () => {
  it('returns defaults and persists all four editable price lists in SQLite', () => {
    const directory = fs.mkdtempSync(path.join(os.tmpdir(), 'datasystems-suite-uniflow-'));
    temporaryDirectories.push(directory);
    const database = openDatabase(path.join(directory, 'dcss.sqlite'));
    databases.push(database);
    const repository = new UniflowRepository(database);

    expect(repository.getCatalog().lists.t1[0]).toEqual(DEFAULT_UNIFLOW_PRICE_CATALOG.lists.t1[0]);
    const custom = structuredClone(DEFAULT_UNIFLOW_PRICE_CATALOG);
    custom.source = 'Catálogo editado localmente';
    custom.lastModified = '10/09/26';
    custom.lists.t1[0] = { ...custom.lists.t1[0], price: 40 };
    const saved = repository.saveCatalog(custom);

    expect(saved.source).toBe('Catálogo editado localmente');
    expect(saved.lastModified).toBe('10/09/26');
    expect(saved.lists.t1[0].price).toBe(40);
    expect(database.prepare('SELECT COUNT(*) AS count FROM uniflow_price_lists').get()).toEqual({ count: 4 });
  });
});
