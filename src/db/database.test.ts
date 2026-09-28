import fs from 'node:fs';
import os from 'node:os';
import path from 'node:path';
import { afterEach, describe, expect, it } from 'vitest';
import { CORE_MIGRATIONS, openDatabase, type Migration } from './database';
import { ImportRepository } from './repositories';

const temporaryDirectories: string[] = [];

function makeTemporaryDatabasePath() {
  const directory = fs.mkdtempSync(path.join(os.tmpdir(), 'datasystems-suite-db-'));
  temporaryDirectories.push(directory);
  return path.join(directory, 'datasystems.sqlite');
}

afterEach(() => {
  for (const directory of temporaryDirectories.splice(0)) {
    fs.rmSync(directory, { recursive: true, force: true });
  }
});

describe('openDatabase', () => {
  it('creates the local database and applies the core schema', () => {
    const databasePath = makeTemporaryDatabasePath();
    const database = openDatabase(databasePath);

    expect(fs.existsSync(databasePath)).toBe(true);
    expect(database.prepare("SELECT name FROM sqlite_master WHERE type = 'table' AND name = 'schema_migrations'").get()).toBeTruthy();
    expect(database.prepare("SELECT name FROM sqlite_master WHERE type = 'table' AND name = 'app_settings'").get()).toBeTruthy();
    expect(database.prepare('SELECT COUNT(*) AS count FROM schema_migrations').get()).toEqual({ count: CORE_MIGRATIONS.length });
    expect(database.prepare("SELECT name FROM sqlite_master WHERE type = 'table' AND name = 'maintenance_counter_records'").get()).toBeTruthy();
    expect(database.prepare("SELECT name FROM sqlite_master WHERE type = 'table' AND name = 'model_mps_profiles'").get()).toBeTruthy();
    expect(database.prepare("SELECT name FROM sqlite_master WHERE type = 'table' AND name = 'consumables_usage_records'").get()).toBeTruthy();
    expect(database.prepare("SELECT name FROM sqlite_master WHERE type = 'table' AND name = 'consumables_output_records'").get()).toBeTruthy();
    expect(database.prepare("SELECT name FROM sqlite_master WHERE type = 'table' AND name = 'service_records'").get()).toBeTruthy();
    expect(database.prepare("SELECT name FROM sqlite_master WHERE type = 'table' AND name = 'travel_trips'").get()).toBeTruthy();
    expect(database.prepare("SELECT name FROM sqlite_master WHERE type = 'table' AND name = 'travel_cost_catalog'").get()).toBeTruthy();
    expect(database.prepare("SELECT name FROM sqlite_master WHERE type = 'table' AND name = 'travel_historical_snapshots'").get()).toBeTruthy();
    expect(database.prepare("SELECT name FROM sqlite_master WHERE type = 'table' AND name = 'uniflow_price_lists'").get()).toBeTruthy();
    expect(database.prepare("SELECT name FROM sqlite_master WHERE type = 'table' AND name = 'canon_discontinuation_items'").get()).toBeTruthy();
    expect(database.prepare("SELECT name FROM sqlite_master WHERE type = 'table' AND name = 'waldbott_stock_items'").get()).toBeTruthy();
    expect(database.prepare("SELECT name FROM sqlite_master WHERE type = 'table' AND name = 'import_source_rows'").get()).toBeTruthy();
    expect(database.prepare("SELECT name FROM sqlite_master WHERE type = 'table' AND name = 'catalog_model_notes'").get()).toBeTruthy();
    expect(database.prepare("SELECT name FROM sqlite_master WHERE type = 'table' AND name = 'catalog_service_items'").get()).toBeTruthy();
    expect(database.prepare("SELECT name FROM sqlite_master WHERE type = 'table' AND name = 'catalog_model_families'").get()).toBeTruthy();
    expect(database.prepare('PRAGMA table_info(parts)').all()).toEqual(expect.arrayContaining([
      expect.objectContaining({ name: 'legacy_reference' }),
      expect.objectContaining({ name: 'useful_life' }),
      expect.objectContaining({ name: 'cost_available' }),
    ]));
    expect(database.prepare('PRAGMA table_info(catalog_model_families)').all()).toEqual(expect.arrayContaining([
      expect.objectContaining({ name: 'exchange_rate' }),
      expect.objectContaining({ name: 'pricing_factor' }),
    ]));
    expect(database.prepare('PRAGMA table_info(proforma_lines)').all()).toEqual(expect.arrayContaining([
      expect.objectContaining({ name: 'catalog_kind' }),
    ]));
    expect(database.prepare('PRAGMA table_info(consumables_usage_records)').all()).toEqual(expect.arrayContaining([
      expect.objectContaining({ name: 'source_operational_json' }),
    ]));
    expect(database.prepare('PRAGMA table_info(canon_discontinuation_items)').all()).toEqual(expect.arrayContaining([
      expect.objectContaining({ name: 'voltage' }),
      expect.objectContaining({ name: 'source_notes_json' }),
    ]));
    expect(database.prepare('PRAGMA table_info(consumables_usage_records)').all()).toEqual(expect.arrayContaining([
      expect.objectContaining({ name: 'contract_order_reference' }),
      expect.objectContaining({ name: 'contract_division' }),
      expect.objectContaining({ name: 'source_customer_name' }),
      expect.objectContaining({ name: 'source_order_reference' }),
      expect.objectContaining({ name: 'source_unit_price_pyg' }),
      expect.objectContaining({ name: 'source_total_pyg' }),
      expect.objectContaining({ name: 'source_details_json' }),
      expect.objectContaining({ name: 'source_sheet_name' }),
      expect.objectContaining({ name: 'source_row_number' }),
    ]));
    expect(database.prepare('PRAGMA table_info(consumables_output_records)').all()).toEqual(expect.arrayContaining([
      expect.objectContaining({ name: 'contract_order_reference' }),
      expect.objectContaining({ name: 'contract_division' }),
      expect.objectContaining({ name: 'source_unit_price_pyg' }),
      expect.objectContaining({ name: 'source_total_pyg' }),
      expect.objectContaining({ name: 'source_operational_json' }),
      expect.objectContaining({ name: 'source_details_json' }),
      expect.objectContaining({ name: 'source_sheet_name' }),
      expect.objectContaining({ name: 'source_row_number' }),
    ]));
    expect(database.prepare('PRAGMA table_info(service_records)').all()).toEqual(expect.arrayContaining([
      expect.objectContaining({ name: 'source_details_json' }),
      expect.objectContaining({ name: 'source_operational_json' }),
      expect.objectContaining({ name: 'source_sheet_name' }),
      expect.objectContaining({ name: 'source_row_number' }),
    ]));
    expect(database.prepare('PRAGMA table_info(travel_trips)').all()).toEqual(expect.arrayContaining([
      expect.objectContaining({ name: 'source_sheet_name' }),
      expect.objectContaining({ name: 'source_row_number' }),
      expect.objectContaining({ name: 'source_operational_json' }),
    ]));
    expect(database.prepare('PRAGMA table_info(travel_cost_catalog)').all()).toEqual(expect.arrayContaining([
      expect.objectContaining({ name: 'parser_revision' }),
    ]));
    expect(database.prepare('PRAGMA table_info(maintenance_counter_records)').all()).toEqual(expect.arrayContaining([
      expect.objectContaining({ name: 'source_sheet_name' }),
      expect.objectContaining({ name: 'source_row_number' }),
      expect.objectContaining({ name: 'source_details_json' }),
    ]));
    expect(database.prepare('PRAGMA table_info(customers)').all()).toEqual(expect.arrayContaining([
      expect.objectContaining({ name: 'source_sheet_name' }),
      expect.objectContaining({ name: 'source_row_number' }),
      expect.objectContaining({ name: 'source_details_json' }),
    ]));
    expect(database.prepare('PRAGMA table_info(contracts)').all()).toEqual(expect.arrayContaining([
      expect.objectContaining({ name: 'source_sheet_name' }),
      expect.objectContaining({ name: 'source_row_number' }),
      expect.objectContaining({ name: 'source_details_json' }),
    ]));
    expect(database.prepare('PRAGMA table_info(contract_equipment)').all()).toEqual(expect.arrayContaining([
      expect.objectContaining({ name: 'source_sheet_name' }),
      expect.objectContaining({ name: 'source_row_number' }),
      expect.objectContaining({ name: 'source_details_json' }),
    ]));

    database.close();
  });

  it('is safe to open the same database more than once', () => {
    const databasePath = makeTemporaryDatabasePath();
    const first = openDatabase(databasePath);
    first.close();

    const second = openDatabase(databasePath);
    expect(second.prepare('SELECT COUNT(*) AS count FROM schema_migrations').get()).toEqual({ count: CORE_MIGRATIONS.length });
    second.close();
  });

  it('upgrades an existing v6 database with the dispatch table', () => {
    const databasePath = makeTemporaryDatabasePath();
    const legacy = openDatabase(databasePath, CORE_MIGRATIONS.slice(0, 6));
    legacy.close();

    const upgraded = openDatabase(databasePath);
    const directory = path.dirname(databasePath);
    const backups = fs.readdirSync(directory).filter((name) => name.startsWith('datasystems.sqlite.backup-'));

    expect(upgraded.prepare('SELECT COUNT(*) AS count FROM schema_migrations').get()).toEqual({ count: CORE_MIGRATIONS.length });
    expect(upgraded.prepare('PRAGMA table_info(proforma_lines)').all()).toEqual(expect.arrayContaining([
      expect.objectContaining({ name: 'labor_cost_local' }),
    ]));
    expect(upgraded.prepare("SELECT name FROM sqlite_master WHERE type = 'table' AND name = 'service_records'").get()).toBeTruthy();
    expect(upgraded.prepare("SELECT name FROM sqlite_master WHERE type = 'table' AND name = 'consumables_output_records'").get()).toBeTruthy();
    expect(upgraded.prepare('PRAGMA table_info(parts)').all()).toEqual(expect.arrayContaining([
      expect.objectContaining({ name: 'cost_available' }),
    ]));
    expect(upgraded.prepare('PRAGMA table_info(catalog_model_families)').all()).toEqual(expect.arrayContaining([
      expect.objectContaining({ name: 'exchange_rate' }),
      expect.objectContaining({ name: 'pricing_factor' }),
    ]));
    expect(upgraded.prepare('PRAGMA table_info(proforma_lines)').all()).toEqual(expect.arrayContaining([
      expect.objectContaining({ name: 'catalog_kind' }),
    ]));
    expect(upgraded.prepare('PRAGMA table_info(consumables_usage_records)').all()).toEqual(expect.arrayContaining([
      expect.objectContaining({ name: 'source_operational_json' }),
    ]));
    expect(upgraded.prepare('PRAGMA table_info(canon_discontinuation_items)').all()).toEqual(expect.arrayContaining([
      expect.objectContaining({ name: 'voltage' }),
      expect.objectContaining({ name: 'source_notes_json' }),
    ]));
    expect(upgraded.prepare('PRAGMA table_info(service_records)').all()).toEqual(expect.arrayContaining([
      expect.objectContaining({ name: 'source_operational_json' }),
    ]));
    expect(upgraded.prepare('PRAGMA table_info(travel_trips)').all()).toEqual(expect.arrayContaining([
      expect.objectContaining({ name: 'source_operational_json' }),
    ]));
    expect(upgraded.prepare('PRAGMA table_info(consumables_output_records)').all()).toEqual(expect.arrayContaining([
      expect.objectContaining({ name: 'source_operational_json' }),
    ]));
    expect(backups).toHaveLength(1);
    upgraded.close();
  });

  it('adds embedded source bytes to an existing import_files table without losing its path metadata', () => {
    const databasePath = makeTemporaryDatabasePath();
    const legacy = openDatabase(databasePath, CORE_MIGRATIONS.slice(0, -1));
    legacy.prepare(`
      INSERT INTO import_batches (id, domain, source_name, source_hash, status, created_at, applied_at)
      VALUES ('legacy-batch', 'catalog', 'catalogo.xlsx', NULL, 'applied', '2026-09-01', '2026-09-01')
    `).run();
    legacy.prepare(`
      INSERT INTO import_files (
        id, batch_id, file_name, stored_path, content_hash, content_type, size_bytes, created_at
      ) VALUES ('legacy-file', 'legacy-batch', 'catalogo.xlsx', 'imports/catalogo.xlsx', 'legacy-hash', NULL, 12, '2026-09-01')
    `).run();
    legacy.close();

    const upgraded = openDatabase(databasePath);
    expect(upgraded.prepare('PRAGMA table_info(import_files)').all()).toEqual(expect.arrayContaining([
      expect.objectContaining({ name: 'content_blob', type: 'BLOB' }),
    ]));
    expect(upgraded.prepare('SELECT stored_path, content_blob FROM import_files WHERE id = ?').get('legacy-file')).toEqual({
      stored_path: 'imports/catalogo.xlsx',
      content_blob: null,
    });
    expect(upgraded.prepare("SELECT name FROM sqlite_master WHERE type = 'trigger' AND name = 'preserve_import_files_before_batch_delete'").get()).toBeTruthy();
    expect(upgraded.prepare("SELECT name FROM sqlite_master WHERE type = 'table' AND name = 'archived_import_files'").get()).toBeTruthy();
    upgraded.close();
  });

  it('creates a backup before applying a new migration', () => {
    const databasePath = makeTemporaryDatabasePath();
    const first = openDatabase(databasePath);
    first.close();

    const secondMigration: Migration = {
      version: CORE_MIGRATIONS.length + 1,
      name: 'test-follow-up',
      sql: 'CREATE TABLE migration_probe (id INTEGER PRIMARY KEY)',
    };
    const second = openDatabase(databasePath, [...CORE_MIGRATIONS, secondMigration]);
    const directory = path.dirname(databasePath);
    const backups = fs.readdirSync(directory).filter((name) => name.startsWith('datasystems.sqlite.backup-'));

    expect(backups).toHaveLength(1);
    expect(second.prepare("SELECT name FROM sqlite_master WHERE type = 'table' AND name = 'migration_probe'").get()).toBeTruthy();
    second.close();
  });

  it('allows signed travel advances when upgrading the travel schema', () => {
    const databasePath = makeTemporaryDatabasePath();
    const legacy = openDatabase(databasePath, CORE_MIGRATIONS.slice(0, 9));
    legacy.prepare(`
      INSERT INTO travel_trips (
        id, recorded_at, customer_name, destination, transport,
        advance, status, source, record_key, created_at, updated_at
      ) VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?)
    `).run('travel-1', '2026-03-20', 'Cliente', 'CDE', 'BUS', 125000, 'approved', 'xlsx', 'travel-1', '2026-03-20', '2026-03-20');
    legacy.close();

    const upgraded = openDatabase(databasePath);
    expect(() => upgraded.prepare('UPDATE travel_trips SET advance = ? WHERE id = ?').run(-139900, 'travel-1')).not.toThrow();
    expect(upgraded.prepare('SELECT advance FROM travel_trips WHERE id = ?').get('travel-1')).toEqual({ advance: -139900 });
    upgraded.close();
  });

  it('allows signed travel advances in a fresh database', () => {
    const databasePath = makeTemporaryDatabasePath();
    const database = openDatabase(databasePath);
    database.prepare(`
      INSERT INTO travel_trips (
        id, recorded_at, customer_name, destination, transport,
        advance, status, source, record_key, created_at, updated_at
      ) VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?)
    `).run('fresh-travel-1', '2026-03-20', 'Cliente', 'CDE', 'BUS', 0, 'approved', 'manual', 'fresh-travel-1', '2026-03-20', '2026-03-20');

    expect(() => database.prepare('UPDATE travel_trips SET advance = ? WHERE id = ?').run(-139900, 'fresh-travel-1')).not.toThrow();
    expect(database.prepare('SELECT advance FROM travel_trips WHERE id = ?').get('fresh-travel-1')).toEqual({ advance: -139900 });
    database.close();
  });

  it('keeps every source row linked to its original import file', () => {
    const databasePath = makeTemporaryDatabasePath();
    const database = openDatabase(databasePath);
    const imports = new ImportRepository(database);
    const batchId = imports.createBatch({ domain: 'consumibles', sourceName: 'origen.xlsx' });
    const fileId = imports.addFile({
      batchId,
      fileName: 'origen.xlsx',
      storedPath: 'imports/origen.xlsx',
      contentHash: 'hash-origen',
      contentType: 'application/vnd.openxmlformats-officedocument.spreadsheetml.sheet',
      sizeBytes: 10,
    });

    expect(imports.addSourceRows(batchId, fileId, [
      { name: 'VIAJES', rows: [['Fecha', 'Cliente'], [new Date('2026-09-10T00:00:00.000Z'), 'Cliente A']] },
      { name: 'AUX', rows: [['Concepto', 'Importe'], ['Viático', 130000]] },
    ])).toEqual({ sheets: 2, rows: 4 });

    expect(imports.listSourceSheets(batchId)).toEqual([
      expect.objectContaining({ sheetName: 'VIAJES', rowCount: 2, columnCount: 2 }),
      expect.objectContaining({ sheetName: 'AUX', rowCount: 2, columnCount: 2 }),
    ]);
    expect(imports.listSourceRows(batchId, { sheetName: 'VIAJES' })).toEqual([
      expect.objectContaining({ rowNumber: 1, values: ['Fecha', 'Cliente'], isEmpty: false }),
      expect.objectContaining({ rowNumber: 2, values: ['2026-09-10T00:00:00.000Z', 'Cliente A'], isEmpty: false }),
    ]);
    expect(imports.listBatches()).toEqual([
      expect.objectContaining({ id: batchId, files: 1, rawRows: 4, rawSheets: 2 }),
    ]);

    database.close();
  });
});
