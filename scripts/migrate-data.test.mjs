import fs from 'node:fs';
import os from 'node:os';
import path from 'node:path';
import { createRequire } from 'node:module';
import { afterEach, describe, expect, it } from 'vitest';

const require = createRequire(import.meta.url);
const Database = require('better-sqlite3');
const { migrateLegacyDataDirectory } = require('../electron/migrate-data.cjs');
const { listLegacyDataSources } = require('../electron/migrate-data.cjs');
const directories = [];

afterEach(() => {
  for (const directory of directories.splice(0)) fs.rmSync(directory, { recursive: true, force: true });
});

function makePaths() {
  const appData = fs.mkdtempSync(path.join(os.tmpdir(), 'dcss-migration-'));
  directories.push(appData);
  return {
    appData,
    oldData: path.join(appData, 'datasystems-suite', 'data'),
    newUserData: path.join(appData, 'dcss-suite'),
  };
}

describe('migration of an existing Windows installation', () => {
  it('copies the old database, archives and imported files to the new app directory without removing the original', async () => {
    const { appData, oldData, newUserData } = makePaths();
    fs.mkdirSync(path.join(oldData, 'imports'), { recursive: true });
    fs.writeFileSync(path.join(oldData, 'imports', 'source.xlsx'), 'original');
    fs.mkdirSync(path.join(oldData, 'backups'));
    fs.writeFileSync(path.join(oldData, 'backups', 'previous.sqlite'), 'backup');
    const oldDatabase = new Database(path.join(oldData, 'datasystems.sqlite'));
    oldDatabase.exec("CREATE TABLE saved_records (name TEXT); INSERT INTO saved_records VALUES ('persisted')");
    oldDatabase.close();

    await migrateLegacyDataDirectory(appData, newUserData);

    const newData = path.join(newUserData, 'data');
    const migrated = new Database(path.join(newData, 'dcss.sqlite'), { readonly: true, fileMustExist: true });
    try {
      expect(migrated.prepare('SELECT name FROM saved_records').get()).toEqual({ name: 'persisted' });
    } finally {
      migrated.close();
    }
    expect(fs.readFileSync(path.join(newData, 'imports', 'source.xlsx'), 'utf8')).toBe('original');
    expect(fs.readFileSync(path.join(newData, 'backups', 'previous.sqlite'), 'utf8')).toBe('backup');
    expect(fs.existsSync(path.join(oldData, 'datasystems.sqlite'))).toBe(true);

    const oldAgain = new Database(path.join(oldData, 'datasystems.sqlite'));
    oldAgain.exec("INSERT INTO saved_records VALUES ('later')");
    oldAgain.close();
    await migrateLegacyDataDirectory(appData, newUserData);
    expect(fs.existsSync(path.join(newData, 'dcss.sqlite'))).toBe(true);
    const reopened = new Database(path.join(newData, 'dcss.sqlite'), { readonly: true, fileMustExist: true });
    expect(reopened.prepare('SELECT name FROM saved_records').all()).toEqual([{ name: 'persisted' }]);
    reopened.close();
  });

  it('never overwrites data already present in the new installation', async () => {
    const { appData, oldData, newUserData } = makePaths();
    fs.mkdirSync(oldData, { recursive: true });
    new Database(path.join(oldData, 'datasystems.sqlite')).close();
    fs.mkdirSync(path.join(newUserData, 'data'), { recursive: true });
    fs.writeFileSync(path.join(newUserData, 'data', 'my-file'), 'keep');

    await expect(migrateLegacyDataDirectory(appData, newUserData)).rejects.toThrow('DCSS Suite');
    expect(fs.readFileSync(path.join(newUserData, 'data', 'my-file'), 'utf8')).toBe('keep');
    expect(fs.existsSync(path.join(oldData, 'datasystems.sqlite'))).toBe(true);
  });

  it('also recognizes the former display-name directory when it is the only old profile', async () => {
    const { appData, newUserData } = makePaths();
    const oldData = path.join(appData, 'Data Systems Suite', 'data');
    fs.mkdirSync(oldData, { recursive: true });
    const old = new Database(path.join(oldData, 'datasystems.sqlite'));
    old.exec("CREATE TABLE saved_records (name TEXT); INSERT INTO saved_records VALUES ('display-name profile')");
    old.close();

    await migrateLegacyDataDirectory(appData, newUserData);
    const migrated = new Database(path.join(newUserData, 'data', 'dcss.sqlite'), { readonly: true, fileMustExist: true });
    expect(migrated.prepare('SELECT name FROM saved_records').get()).toEqual({ name: 'display-name profile' });
    migrated.close();
  });

  it('refuses to choose between two different old profiles', async () => {
    const { appData, oldData, newUserData } = makePaths();
    const displayNameData = path.join(appData, 'Data Systems Suite', 'data');
    fs.mkdirSync(oldData, { recursive: true });
    fs.mkdirSync(displayNameData, { recursive: true });
    new Database(path.join(oldData, 'datasystems.sqlite')).close();
    new Database(path.join(displayNameData, 'datasystems.sqlite')).close();

    await expect(migrateLegacyDataDirectory(appData, newUserData)).rejects.toThrow();
    expect(fs.existsSync(path.join(newUserData, 'data'))).toBe(false);
  });

  it('migrates only the source explicitly selected when both legacy profiles exist', async () => {
    const { appData, oldData, newUserData } = makePaths();
    const displayNameData = path.join(appData, 'Data Systems Suite', 'data');
    for (const [directory, name] of [[oldData, 'technical'], [displayNameData, 'display']]) {
      fs.mkdirSync(directory, { recursive: true });
      const db = new Database(path.join(directory, 'datasystems.sqlite'));
      db.exec(`CREATE TABLE saved_records (name TEXT); INSERT INTO saved_records VALUES ('${name}')`);
      db.close();
    }
    const sources = await listLegacyDataSources(appData, newUserData);
    expect(sources).toEqual([oldData, displayNameData]);
    await expect(migrateLegacyDataDirectory(appData, newUserData, path.join(appData, 'unknown'))).rejects.toThrow();
    await migrateLegacyDataDirectory(appData, newUserData, displayNameData);
    const migrated = new Database(path.join(newUserData, 'data', 'dcss.sqlite'), { readonly: true, fileMustExist: true });
    expect(migrated.prepare('SELECT name FROM saved_records').get()).toEqual({ name: 'display' });
    migrated.close();
    expect(fs.existsSync(path.join(oldData, 'datasystems.sqlite'))).toBe(true);
    expect(fs.existsSync(path.join(displayNameData, 'datasystems.sqlite'))).toBe(true);
  });

  it('refuses a damaged old database instead of starting with partial migrated data', async () => {
    const { appData, oldData, newUserData } = makePaths();
    fs.mkdirSync(oldData, { recursive: true });
    fs.writeFileSync(path.join(oldData, 'datasystems.sqlite'), 'not a database');

    await expect(migrateLegacyDataDirectory(appData, newUserData)).rejects.toThrow();
    expect(fs.existsSync(path.join(newUserData, 'data'))).toBe(false);
    expect(fs.readFileSync(path.join(oldData, 'datasystems.sqlite'), 'utf8')).toBe('not a database');
  });

  it('leaves a fresh installation untouched', async () => {
    const { appData, newUserData } = makePaths();
    await migrateLegacyDataDirectory(appData, newUserData);
    expect(fs.existsSync(path.join(newUserData, 'data'))).toBe(false);
  });
});
