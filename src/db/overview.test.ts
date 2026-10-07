import fs from 'node:fs';
import os from 'node:os';
import path from 'node:path';
import { afterEach, describe, expect, it } from 'vitest';
import { openDatabase, type SuiteDatabase } from './database';
import { OverviewRepository } from './overview';
import { ImportRepository } from './repositories';

const temporaryDirectories: string[] = [];
const temporaryDatabases: SuiteDatabase[] = [];

function makeDatabase() {
  const directory = fs.mkdtempSync(path.join(os.tmpdir(), 'datasystems-suite-overview-'));
  temporaryDirectories.push(directory);
  const database = openDatabase(path.join(directory, 'suite.sqlite'));
  temporaryDatabases.push(database);
  return database;
}

afterEach(() => {
  for (const database of temporaryDatabases.splice(0)) {
    database.close();
  }
  for (const directory of temporaryDirectories.splice(0)) {
    fs.rmSync(directory, { recursive: true, force: true });
  }
});

function insertCanonItems(
  database: SuiteDatabase,
  batchId: string,
  items: Array<{ id: string; model: string; endsAt: string; code?: string; voltage?: string }>,
) {
  const insert = database.prepare(`
    INSERT INTO canon_discontinuation_items (
      id, model_label, normalized_model, part_code, ends_at, voltage, source_batch_id, created_at
    ) VALUES (?, ?, ?, ?, ?, ?, ?, '2026-01-01T00:00:00Z')
  `);
  for (const item of items) {
    insert.run(item.id, item.model, item.model, item.code ?? '', item.endsAt, item.voltage ?? null, batchId);
  }
}

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

  });

  it('reports the latest applied load even when newer loads are not applied', () => {
    const database = makeDatabase();
    const imports = new ImportRepository(database);
    const overview = new OverviewRepository(database);
    expect(overview.get().lastAppliedAt).toBeNull();

    const applied = imports.createBatch({ domain: 'catalog', sourceName: 'applied.xlsx' });
    imports.markApplied(applied);
    for (let i = 0; i < 7; i += 1) imports.createBatch({ domain: 'catalog', sourceName: `staged-${i}.xlsx` });
    database.prepare("UPDATE import_batches SET created_at = '2999-01-01T00:00:00.000Z' WHERE id <> ?").run(applied);

    const result = overview.get();
    expect(result.recentImports.some((item) => item.appliedAt)).toBe(false);
    const row = database.prepare('SELECT applied_at FROM import_batches WHERE id = ?').get(applied) as { applied_at: string };
    expect(result.lastAppliedAt).toBe(row.applied_at);
  });

  it('keeps unavailable business sources null even when generic parts and unrelated imports exist', () => {
    const database = makeDatabase();
    const imports = new ImportRepository(database);
    const batchId = imports.createBatch({ domain: 'sales-catalog', sourceName: 'catalog.xlsx' });
    imports.markApplied(batchId);
    database.prepare(`
      INSERT INTO parts (id, brand, code, normalized_code, description, category, created_at, updated_at)
      VALUES ('part-1', 'Canon', 'ABC', 'ABC', 'Generic part', NULL, '2026-01-01', '2026-01-01')
    `).run();

    const result = new OverviewRepository(database).get('2026-10-07');

    expect(result.dashboard).toEqual({
      portfolio: null,
      canon: null,
    });
    expect(result.counts.parts).toBe(1);
    expect(result.appliedImports).toBe(1);
  });

  it.each([
    'operations',
    'operations-fleet-contracts',
    'operations-fleet-contract-details',
    'operations-fleet-classification',
  ])('distinguishes an applied empty portfolio source from a staged source: %s', (domain) => {
    const database = makeDatabase();
    const imports = new ImportRepository(database);
    const overview = new OverviewRepository(database);
    const batchId = imports.createBatch({ domain, sourceName: 'empty-portfolio.xlsx' });

    expect(overview.get('2026-10-07').dashboard.portfolio).toBeNull();
    imports.markApplied(batchId);
    expect(overview.get('2026-10-07').dashboard.portfolio).toEqual({
      activeEquipment: 0,
      activeEquipmentWithReadings: 0,
      activeContracts: 0,
      activeCustomers: 0,
      unknownContracts: 0,
      contractsByType: [],
    });
  });

  it('uses manual portfolio records even without a source import', () => {
    const database = makeDatabase();
    database.prepare(`
      INSERT INTO customers (id, name, normalized_name, created_at, updated_at)
      VALUES ('customer-1', 'Cliente Uno', 'CLIENTE UNO', '2026-01-01', '2026-01-01')
    `).run();

    expect(new OverviewRepository(database).get('2026-10-07').dashboard.portfolio).toEqual({
      activeEquipment: 0,
      activeEquipmentWithReadings: 0,
      activeContracts: 0,
      activeCustomers: 0,
      unknownContracts: 0,
      contractsByType: [],
    });
  });

  it('counts an active contract once per type and reference, however many rows it has', () => {
    const database = makeDatabase();
    database.prepare(`
      INSERT INTO customers (id, name, normalized_name, created_at, updated_at)
      VALUES ('customer-1', 'Cliente Uno', 'CLIENTE UNO', '2026-01-01', '2026-01-01')
    `).run();
    const insert = database.prepare(`
      INSERT INTO contracts (id, customer_id, contract_type, reference, is_active, created_at, updated_at)
      VALUES (?, 'customer-1', ?, ?, ?, '2026-01-01', '2026-01-01')
    `);
    insert.run('a1', 'Alquiler', 'SR079/22-R2', 1);
    insert.run('a2', 'Alquiler', 'SR079/22-R2', 1);
    insert.run('a3', 'Alquiler', 'SR080/22-R0', 0);
    insert.run('m1', 'Mantenimiento', '103179', 1);
    insert.run('o1', 'Abierto', '103179', 1);
    insert.run('u1', 'Leasing', 'LC1', null);

    const portfolio = new OverviewRepository(database).get('2026-10-07').dashboard.portfolio;
    expect(portfolio?.activeContracts).toBe(3);
    expect(portfolio?.activeCustomers).toBe(1);
    expect(portfolio?.unknownContracts).toBe(1);
  });

  it('deduplicates equipment across contracts and counts only explicitly active contracts of the four department types', () => {
    const database = makeDatabase();
    const imports = new ImportRepository(database);
    for (const sourceName of ['portfolio-old.xlsx', 'portfolio-new.xlsx']) {
      imports.markApplied(imports.createBatch({ domain: 'operations', sourceName }));
    }
    database.prepare(`
      INSERT INTO customers (id, name, normalized_name, created_at, updated_at)
      VALUES ('customer-1', 'Cliente Uno', 'CLIENTE UNO', '2026-01-01', '2026-01-01')
    `).run();
    const insertContract = database.prepare(`
      INSERT INTO contracts (id, customer_id, contract_type, is_active, starts_at, ends_at, created_at, updated_at)
      VALUES (?, 'customer-1', ?, ?, '2025-01-01', '2030-01-01', '2026-01-01', '2026-01-01')
    `);
    insertContract.run('active-1', 'Alquiler', 1);
    insertContract.run('active-2', 'Abierto', 1);
    insertContract.run('other-type', 'Servicio especial', 1);
    insertContract.run('inactive', 'Leasing', 0);
    insertContract.run('unknown-1', 'Alquiler', null);
    insertContract.run('unknown-2', 'Mantenimiento', null);
    const insertEquipment = database.prepare(`
      INSERT INTO contract_equipment (id, contract_id, model_label, serial_number, brand, created_at, updated_at)
      VALUES (?, ?, ?, ?, ?, '2026-01-01', '2026-01-01')
    `);
    insertEquipment.run('equipment-1', 'active-1', 'Model One', ' ser  001 ', 'Canon');
    insertEquipment.run('equipment-2', 'unknown-1', 'Model Two', 'ＳＥＲ　００１', 'Other brand');
    insertEquipment.run('equipment-3', 'active-2', 'Model Three', 'serial-002', 'Canon');
    insertEquipment.run('equipment-4', 'inactive', 'Model Three', ' SERIAL-002 ', 'Canon');
    insertEquipment.run('equipment-5', 'active-1', 'Same model', null, 'Canon');
    insertEquipment.run('equipment-6', 'active-1', 'Same model', '', 'Canon');
    insertEquipment.run('equipment-7', 'unknown-2', 'Same model', ' \t ', 'Canon');
    const readingsBatch = imports.createBatch({ domain: 'maintenance', sourceName: 'counters.xlsx' });
    imports.markApplied(readingsBatch);
    const insertReading = database.prepare(`
      INSERT INTO maintenance_counter_records (id, customer_name, model_label, serial_number, period, copies, counter, source_batch_id, created_at)
      VALUES (?, 'Cliente Uno', 'Model One', ?, '2026-09', 10, 100, ?, '2026-10-01')
    `);
    insertReading.run('reading-1', 'SER 001', readingsBatch);
    insertReading.run('reading-2', 'ser  001', readingsBatch);
    insertReading.run('reading-3', 'unrelated-serial', readingsBatch);

    const result = new OverviewRepository(database).get('2026-10-07');

    expect(result.dashboard.portfolio).toEqual({
      activeEquipment: 2,
      activeEquipmentWithReadings: 1,
      activeContracts: 2,
      activeCustomers: 1,
      unknownContracts: 2,
      contractsByType: [
        { type: 'Abierto', count: 1 },
        { type: 'Alquiler', count: 1 },
        { type: 'Leasing', count: 0 },
        { type: 'Mantenimiento', count: 0 },
      ],
    });
    expect(result.counts.contracts).toBe(6);
    expect(result.counts.equipment).toBe(7);
    expect(result.appliedImports).toBe(3);
  });

  it('distinguishes an applied empty Canon source from an unavailable source', () => {
    const database = makeDatabase();
    const imports = new ImportRepository(database);
    const overview = new OverviewRepository(database);
    const batchId = imports.createBatch({ domain: 'operations-canon', sourceName: 'empty-canon.xlsx' });

    expect(overview.get('2026-10-07').dashboard.canon).toBeNull();
    imports.markApplied(batchId);
    expect(overview.get('2026-10-07').dashboard.canon).toEqual({
      discontinued: 0,
      scheduled: 0,
      unknown: 0,
    });
  });

  it('ignores Canon rows belonging to staged or failed imports', () => {
    const database = makeDatabase();
    const imports = new ImportRepository(database);
    const staged = imports.createBatch({ domain: 'operations-canon', sourceName: 'staged.xlsx' });
    const failed = imports.createBatch({ domain: 'operations-canon', sourceName: 'failed.xlsx' });
    insertCanonItems(database, staged, [{ id: 'staged', model: 'STAGED', endsAt: '2020-01-01' }]);
    insertCanonItems(database, failed, [{ id: 'failed', model: 'FAILED', endsAt: '2020-01-01' }]);
    imports.markFailed(failed);

    expect(new OverviewRepository(database).get('2026-10-07').dashboard.canon).toBeNull();
  });

  it('counts distinct Canon models with inclusive date boundaries and discontinued then scheduled precedence', () => {
    const database = makeDatabase();
    const imports = new ImportRepository(database);
    const older = imports.createBatch({ domain: 'operations-canon', sourceName: 'older-canon.xlsx' });
    const newer = imports.createBatch({ domain: 'operations-canon', sourceName: 'newer-canon.xlsx' });
    const staged = imports.createBatch({ domain: 'operations-canon', sourceName: 'staged-canon.xlsx' });
    insertCanonItems(database, older, [
      { id: 'boundary', model: 'BOUNDARY', endsAt: '2026-10-07', code: 'A', voltage: '120' },
      { id: 'past', model: 'PAST', endsAt: '2026-10-06' },
      { id: 'scheduled', model: 'SCHEDULED', endsAt: '2026-10-08' },
      { id: 'undated', model: 'UNDATED', endsAt: '' },
      { id: 'whitespace', model: 'WHITESPACE', endsAt: '   ' },
    ]);
    insertCanonItems(database, newer, [
      { id: 'boundary-duplicate', model: 'BOUNDARY', endsAt: '2026-10-07', code: 'A', voltage: '220' },
      { id: 'boundary-other-code', model: 'BOUNDARY', endsAt: '2026-10-07', code: 'B', voltage: '220' },
      { id: 'boundary-future', model: 'BOUNDARY', endsAt: '2027-01-01' },
      { id: 'boundary-undated', model: 'BOUNDARY', endsAt: '' },
      { id: 'scheduled-duplicate', model: 'SCHEDULED', endsAt: '2026-10-08', code: 'C' },
      { id: 'scheduled-undated', model: 'SCHEDULED', endsAt: '' },
      { id: 'undated-duplicate', model: 'UNDATED', endsAt: '', code: 'D' },
    ]);
    insertCanonItems(database, staged, [
      { id: 'ignored-past', model: 'SCHEDULED', endsAt: '2020-01-01' },
      { id: 'ignored-extra', model: 'NOT APPLIED', endsAt: '2020-01-01' },
    ]);
    imports.markApplied(older);
    imports.markApplied(newer);
    const overview = new OverviewRepository(database);

    expect(overview.get('2026-10-07').dashboard.canon).toEqual({
      discontinued: 2,
      scheduled: 1,
      unknown: 2,
    });
    expect(overview.get('2026-10-08').dashboard.canon).toEqual({
      discontinued: 3,
      scheduled: 0,
      unknown: 2,
    });
    expect(overview.get('2026-10-07').counts.modelSupportItems).toBe(14);
  });

  it('recognizes eligible Canon records from an applied batch independently of its historical domain', () => {
    const database = makeDatabase();
    const imports = new ImportRepository(database);
    const batchId = imports.createBatch({ domain: 'historical-support', sourceName: 'support.xlsx' });
    insertCanonItems(database, batchId, [{ id: 'historical', model: 'HISTORICAL', endsAt: '2026-10-07' }]);
    imports.markApplied(batchId);

    expect(new OverviewRepository(database).get('2026-10-07').dashboard.canon).toEqual({
      discontinued: 1,
      scheduled: 0,
      unknown: 0,
    });
  });
});
