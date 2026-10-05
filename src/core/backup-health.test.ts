import fs from 'node:fs';
import os from 'node:os';
import path from 'node:path';
import { describe, expect, it } from 'vitest';
import { openDatabase } from '../db/database';
import { ImportRepository } from '../db/repositories';
import { assessBackup, readBackupHealth, recordBackup } from './backup-health';

const now = new Date('2026-10-10T12:00:00Z');
const base = { lastLoadAt: null, loadsSinceBackup: 0, now };

describe('assessBackup', () => {
  it('avisa si nunca se hizo un respaldo', () => {
    expect(assessBackup({ ...base, lastBackupAt: null }).level).toBe('never');
    expect(assessBackup({ ...base, lastBackupAt: 'basura' }).level).toBe('never');
  });
  it('prioriza cargas sin respaldar sobre la antigüedad', () => {
    expect(assessBackup({ ...base, lastBackupAt: '2026-10-09T12:00:00Z', loadsSinceBackup: 2 }).level).toBe('pending');
    expect(assessBackup({ ...base, lastBackupAt: '2026-09-01T12:00:00Z', loadsSinceBackup: 2 }).level).toBe('pending');
  });
  it('marca respaldo viejo a los 7 días y al día antes', () => {
    expect(assessBackup({ ...base, lastBackupAt: '2026-10-03T12:00:00Z' })).toMatchObject({ level: 'stale', daysSinceBackup: 7 });
    expect(assessBackup({ ...base, lastBackupAt: '2026-10-03T12:00:01Z' })).toMatchObject({ level: 'ok', daysSinceBackup: 6 });
  });
});

describe('readBackupHealth', () => {
  it('cuenta solo las cargas aplicadas después del último respaldo', () => {
    const directory = fs.mkdtempSync(path.join(os.tmpdir(), 'dcss-backup-health-'));
    const database = openDatabase(path.join(directory, 'suite.sqlite'));
    const imports = new ImportRepository(database);
    const a = imports.createBatch({ domain: 'catalog', sourceName: 'a.xlsx' });
    imports.markApplied(a);
    expect(readBackupHealth(database)).toMatchObject({ level: 'never', loadsSinceBackup: 1 });

    recordBackup(database, new Date(Date.now() + 1000));
    expect(readBackupHealth(database)).toMatchObject({ level: 'ok', loadsSinceBackup: 0 });
    expect(readBackupHealth(database).lastLoadAt).not.toBeNull();

    recordBackup(database, new Date(Date.now() - 60_000));
    imports.markApplied(imports.createBatch({ domain: 'catalog', sourceName: 'b.xlsx' }));
    expect(readBackupHealth(database)).toMatchObject({ level: 'pending', loadsSinceBackup: 2 });
    database.close();
    fs.rmSync(directory, { recursive: true, force: true });
  });
});
