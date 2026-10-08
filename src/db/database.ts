import Database from 'better-sqlite3';
import fs from 'node:fs';
import path from 'node:path';
import { randomUUID } from 'node:crypto';

export type SuiteDatabase = Database.Database;

export type Migration = {
  version: number;
  name: string;
  sql: string;
};

export const CORE_MIGRATIONS: readonly Migration[] = [
  {
    version: 1,
    name: 'core-foundation',
    sql: `
      CREATE TABLE IF NOT EXISTS app_settings (
        namespace TEXT NOT NULL,
        key TEXT NOT NULL,
        value_json TEXT NOT NULL,
        updated_at TEXT NOT NULL,
        PRIMARY KEY (namespace, key)
      );

      CREATE TABLE IF NOT EXISTS import_batches (
        id TEXT PRIMARY KEY,
        domain TEXT NOT NULL,
        source_name TEXT NOT NULL,
        source_hash TEXT,
        status TEXT NOT NULL CHECK (status IN ('staged', 'applied', 'failed')),
        created_at TEXT NOT NULL,
        applied_at TEXT
      );

      CREATE TABLE IF NOT EXISTS import_files (
        id TEXT PRIMARY KEY,
        batch_id TEXT NOT NULL REFERENCES import_batches(id) ON DELETE CASCADE,
        file_name TEXT NOT NULL,
        stored_path TEXT NOT NULL,
        content_hash TEXT NOT NULL,
        content_type TEXT,
        size_bytes INTEGER NOT NULL CHECK (size_bytes >= 0),
        created_at TEXT NOT NULL
      );

      CREATE TABLE IF NOT EXISTS equipment_models (
        id TEXT PRIMARY KEY,
        brand TEXT NOT NULL,
        model_name TEXT NOT NULL,
        normalized_name TEXT NOT NULL,
        is_active INTEGER NOT NULL DEFAULT 1 CHECK (is_active IN (0, 1)),
        created_at TEXT NOT NULL,
        updated_at TEXT NOT NULL,
        UNIQUE (brand, normalized_name)
      );

      CREATE TABLE IF NOT EXISTS equipment_model_aliases (
        model_id TEXT NOT NULL REFERENCES equipment_models(id) ON DELETE CASCADE,
        alias TEXT NOT NULL,
        normalized_alias TEXT NOT NULL,
        PRIMARY KEY (model_id, normalized_alias)
      );

      CREATE TABLE IF NOT EXISTS parts (
        id TEXT PRIMARY KEY,
        brand TEXT NOT NULL,
        code TEXT NOT NULL,
        normalized_code TEXT NOT NULL,
        description TEXT NOT NULL,
        category TEXT,
        created_at TEXT NOT NULL,
        updated_at TEXT NOT NULL,
        UNIQUE (brand, normalized_code)
      );

      CREATE TABLE IF NOT EXISTS part_model (
        part_id TEXT NOT NULL REFERENCES parts(id) ON DELETE CASCADE,
        model_id TEXT NOT NULL REFERENCES equipment_models(id) ON DELETE CASCADE,
        source_batch_id TEXT REFERENCES import_batches(id) ON DELETE SET NULL,
        PRIMARY KEY (part_id, model_id)
      );

      CREATE TABLE IF NOT EXISTS part_prices (
        id TEXT PRIMARY KEY,
        part_id TEXT NOT NULL REFERENCES parts(id) ON DELETE CASCADE,
        currency TEXT NOT NULL CHECK (currency IN ('USD', 'PYG')),
        amount REAL NOT NULL CHECK (amount >= 0),
        source_batch_id TEXT REFERENCES import_batches(id) ON DELETE SET NULL,
        valid_from TEXT,
        created_at TEXT NOT NULL
      );

      CREATE TABLE IF NOT EXISTS customers (
        id TEXT PRIMARY KEY,
        name TEXT NOT NULL,
        normalized_name TEXT NOT NULL UNIQUE,
        customer_type TEXT,
        commercial_area TEXT,
        created_at TEXT NOT NULL,
        updated_at TEXT NOT NULL
      );

      CREATE TABLE IF NOT EXISTS contracts (
        id TEXT PRIMARY KEY,
        customer_id TEXT NOT NULL REFERENCES customers(id) ON DELETE CASCADE,
        reference TEXT,
        contract_type TEXT NOT NULL,
        starts_at TEXT,
        ends_at TEXT,
        source_batch_id TEXT REFERENCES import_batches(id) ON DELETE SET NULL,
        created_at TEXT NOT NULL,
        updated_at TEXT NOT NULL
      );

      CREATE TABLE IF NOT EXISTS contract_equipment (
        id TEXT PRIMARY KEY,
        contract_id TEXT NOT NULL REFERENCES contracts(id) ON DELETE CASCADE,
        model_id TEXT REFERENCES equipment_models(id) ON DELETE SET NULL,
        model_label TEXT NOT NULL,
        serial_number TEXT,
        location TEXT,
        created_at TEXT NOT NULL,
        updated_at TEXT NOT NULL
      );
    `,
  },
  {
    version: 2,
    name: 'catalog-foundation',
    sql: `
      CREATE TABLE IF NOT EXISTS inventory_snapshots (
        id TEXT PRIMARY KEY,
        part_id TEXT NOT NULL REFERENCES parts(id) ON DELETE CASCADE,
        stock INTEGER NOT NULL DEFAULT 0 CHECK (stock >= 0),
        markup REAL NOT NULL DEFAULT 0 CHECK (markup >= 0),
        discontinued_at TEXT,
        source_batch_id TEXT REFERENCES import_batches(id) ON DELETE SET NULL,
        captured_at TEXT NOT NULL
      );

      CREATE INDEX IF NOT EXISTS idx_inventory_snapshots_part
        ON inventory_snapshots (part_id, captured_at DESC);

      CREATE INDEX IF NOT EXISTS idx_inventory_snapshots_batch
        ON inventory_snapshots (source_batch_id);

      CREATE INDEX IF NOT EXISTS idx_part_prices_lookup
        ON part_prices (part_id, currency, created_at DESC);
    `,
  },
  {
    version: 3,
    name: 'sales-foundation',
    sql: `
      CREATE TABLE IF NOT EXISTS proformas (
        id TEXT PRIMARY KEY,
        customer_id TEXT REFERENCES customers(id) ON DELETE SET NULL,
        customer_name TEXT NOT NULL DEFAULT '',
        customer_contact TEXT NOT NULL DEFAULT '',
        service_report TEXT NOT NULL DEFAULT '',
        reference TEXT NOT NULL DEFAULT '',
        issued_at TEXT NOT NULL,
        attended_by TEXT NOT NULL DEFAULT '',
        model_name TEXT NOT NULL DEFAULT '',
        serial_number TEXT NOT NULL DEFAULT '',
        mode TEXT NOT NULL CHECK (mode IN ('sin-contrato', 'contrato-abierto')),
        status TEXT NOT NULL CHECK (status IN ('draft', 'issued')),
        currency TEXT NOT NULL CHECK (currency IN ('PYG', 'USD')),
        exchange_rate REAL NOT NULL CHECK (exchange_rate > 0),
        pricing_factor REAL NOT NULL CHECK (pricing_factor > 0),
        labor_price REAL NOT NULL CHECK (labor_price >= 0),
        created_at TEXT NOT NULL,
        updated_at TEXT NOT NULL
      );

      CREATE TABLE IF NOT EXISTS proforma_lines (
        id TEXT PRIMARY KEY,
        proforma_id TEXT NOT NULL REFERENCES proformas(id) ON DELETE CASCADE,
        part_id TEXT REFERENCES parts(id) ON DELETE SET NULL,
        line_kind TEXT NOT NULL CHECK (line_kind IN ('part', 'labor')),
        code TEXT NOT NULL DEFAULT '',
        description TEXT NOT NULL,
        quantity INTEGER NOT NULL CHECK (quantity > 0),
        unit_price_usd REAL CHECK (unit_price_usd IS NULL OR unit_price_usd >= 0),
        unit_price_local REAL CHECK (unit_price_local IS NULL OR unit_price_local >= 0),
        sort_order INTEGER NOT NULL CHECK (sort_order >= 0),
        created_at TEXT NOT NULL
      );

      CREATE INDEX IF NOT EXISTS idx_proformas_updated
        ON proformas (updated_at DESC, id DESC);

      CREATE INDEX IF NOT EXISTS idx_proforma_lines_proforma
        ON proforma_lines (proforma_id, sort_order);
    `,
  },
  {
    version: 4,
    name: 'maintenance-foundation',
    sql: `
      CREATE TABLE IF NOT EXISTS maintenance_model_rules (
        id TEXT PRIMARY KEY,
        model_id TEXT REFERENCES equipment_models(id) ON DELETE SET NULL,
        brand TEXT NOT NULL,
        model_label TEXT NOT NULL,
        normalized_label TEXT NOT NULL,
        useful_life INTEGER NOT NULL CHECK (useful_life > 0),
        optimal_base INTEGER NOT NULL CHECK (optimal_base >= 0),
        max_waste REAL NOT NULL CHECK (max_waste >= 0 AND max_waste <= 1),
        source_batch_id TEXT REFERENCES import_batches(id) ON DELETE SET NULL,
        created_at TEXT NOT NULL,
        updated_at TEXT NOT NULL,
        UNIQUE (source_batch_id, normalized_label)
      );

      CREATE TABLE IF NOT EXISTS maintenance_counter_records (
        id TEXT PRIMARY KEY,
        customer_id TEXT REFERENCES customers(id) ON DELETE SET NULL,
        contract_id TEXT REFERENCES contracts(id) ON DELETE SET NULL,
        equipment_id TEXT REFERENCES contract_equipment(id) ON DELETE SET NULL,
        maintenance_model_rule_id TEXT REFERENCES maintenance_model_rules(id) ON DELETE SET NULL,
        customer_name TEXT NOT NULL,
        contract_reference TEXT NOT NULL DEFAULT '',
        model_label TEXT NOT NULL,
        serial_number TEXT NOT NULL,
        period TEXT NOT NULL,
        paper_type TEXT NOT NULL DEFAULT '',
        copies REAL NOT NULL CHECK (copies >= 0),
        counter REAL NOT NULL CHECK (counter >= 0),
        source_batch_id TEXT NOT NULL REFERENCES import_batches(id) ON DELETE CASCADE,
        created_at TEXT NOT NULL
      );

      CREATE INDEX IF NOT EXISTS idx_maintenance_records_batch
        ON maintenance_counter_records (source_batch_id, period, serial_number);

      CREATE INDEX IF NOT EXISTS idx_maintenance_records_customer
        ON maintenance_counter_records (customer_id, period);

      CREATE INDEX IF NOT EXISTS idx_maintenance_rules_batch
        ON maintenance_model_rules (source_batch_id, normalized_label);
    `,
  },
  {
    version: 5,
    name: 'mps-foundation',
    sql: `
      CREATE TABLE IF NOT EXISTS model_mps_profiles (
        id TEXT PRIMARY KEY,
        model_id TEXT REFERENCES equipment_models(id) ON DELETE SET NULL,
        brand TEXT NOT NULL,
        model_label TEXT NOT NULL,
        normalized_label TEXT NOT NULL,
        speed_ppm INTEGER CHECK (speed_ppm IS NULL OR speed_ppm >= 0),
        is_color INTEGER NOT NULL CHECK (is_color IN (0, 1)),
        rec_volume_min INTEGER NOT NULL CHECK (rec_volume_min >= 0),
        rec_volume_max INTEGER NOT NULL CHECK (rec_volume_max >= 0),
        is_custom INTEGER NOT NULL CHECK (is_custom IN (0, 1)),
        source_batch_id TEXT NOT NULL REFERENCES import_batches(id) ON DELETE CASCADE,
        created_at TEXT NOT NULL,
        updated_at TEXT NOT NULL,
        UNIQUE (source_batch_id, normalized_label)
      );

      CREATE TABLE IF NOT EXISTS mps_consumables (
        id TEXT PRIMARY KEY,
        profile_id TEXT NOT NULL REFERENCES model_mps_profiles(id) ON DELETE CASCADE,
        name TEXT NOT NULL,
        consumable_type TEXT NOT NULL,
        yield_pages INTEGER NOT NULL CHECK (yield_pages > 0),
        color TEXT NOT NULL,
        sku TEXT NOT NULL DEFAULT '',
        created_at TEXT NOT NULL
      );

      CREATE INDEX IF NOT EXISTS idx_mps_profiles_batch
        ON model_mps_profiles (source_batch_id, normalized_label);

      CREATE INDEX IF NOT EXISTS idx_mps_consumables_profile
        ON mps_consumables (profile_id, name);
    `,
  },
  {
    version: 6,
    name: 'consumables-foundation',
    sql: `
      CREATE TABLE IF NOT EXISTS consumables_usage_records (
        id TEXT PRIMARY KEY,
        record_kind TEXT NOT NULL CHECK (record_kind IN ('consumable', 'part')),
        recorded_at TEXT NOT NULL,
        month TEXT NOT NULL,
        model_label TEXT NOT NULL,
        serial_number TEXT NOT NULL,
        part_code TEXT NOT NULL,
        description TEXT NOT NULL,
        quantity REAL NOT NULL CHECK (quantity >= 0),
        cost_usd REAL NOT NULL CHECK (cost_usd >= 0),
        classification TEXT NOT NULL CHECK (classification IN ('original', 'compatible')),
        category TEXT NOT NULL,
        family TEXT NOT NULL CHECK (family IN ('T03', 'T06', 'GPR53')),
        customer_id TEXT REFERENCES customers(id) ON DELETE SET NULL,
        contract_id TEXT REFERENCES contracts(id) ON DELETE SET NULL,
        equipment_id TEXT NOT NULL REFERENCES contract_equipment(id) ON DELETE CASCADE,
        customer_name TEXT NOT NULL,
        contract_reference TEXT NOT NULL DEFAULT '',
        contract_type TEXT NOT NULL,
        record_key TEXT NOT NULL UNIQUE,
        source_batch_id TEXT NOT NULL REFERENCES import_batches(id) ON DELETE CASCADE,
        source_file_name TEXT NOT NULL,
        created_at TEXT NOT NULL
      );

      CREATE INDEX IF NOT EXISTS idx_consumables_records_month
        ON consumables_usage_records (month, record_kind, family);

      CREATE INDEX IF NOT EXISTS idx_consumables_records_equipment
        ON consumables_usage_records (equipment_id, month);

      CREATE INDEX IF NOT EXISTS idx_consumables_records_batch
        ON consumables_usage_records (source_batch_id, record_key);
    `,
  },
  {
    version: 7,
    name: 'consumables-outputs',
    sql: `
      CREATE TABLE IF NOT EXISTS consumables_output_records (
        id TEXT PRIMARY KEY,
        record_kind TEXT NOT NULL CHECK (record_kind IN ('consumable', 'part')),
        document_number INTEGER NOT NULL CHECK (document_number > 0),
        recorded_at TEXT NOT NULL,
        month TEXT NOT NULL,
        model_label TEXT NOT NULL,
        serial_number TEXT NOT NULL,
        part_code TEXT NOT NULL,
        description TEXT NOT NULL,
        quantity REAL NOT NULL CHECK (quantity >= 0),
        yield_pages REAL NOT NULL CHECK (yield_pages >= 0),
        technician TEXT NOT NULL DEFAULT '',
        service_report_number INTEGER NOT NULL DEFAULT 0 CHECK (service_report_number >= 0),
        classification TEXT NOT NULL CHECK (classification IN ('original', 'compatible')),
        category TEXT NOT NULL,
        family TEXT NOT NULL CHECK (family IN ('T03', 'T06', 'GPR53')),
        customer_id TEXT REFERENCES customers(id) ON DELETE SET NULL,
        contract_id TEXT REFERENCES contracts(id) ON DELETE SET NULL,
        equipment_id TEXT NOT NULL REFERENCES contract_equipment(id) ON DELETE CASCADE,
        customer_name TEXT NOT NULL,
        source_customer_name TEXT NOT NULL DEFAULT '',
        contract_reference TEXT NOT NULL DEFAULT '',
        contract_type TEXT NOT NULL,
        record_key TEXT NOT NULL UNIQUE,
        source_batch_id TEXT NOT NULL REFERENCES import_batches(id) ON DELETE CASCADE,
        source_file_name TEXT NOT NULL,
        created_at TEXT NOT NULL
      );

      CREATE INDEX IF NOT EXISTS idx_consumables_outputs_month
        ON consumables_output_records (month, record_kind, family);

      CREATE INDEX IF NOT EXISTS idx_consumables_outputs_equipment
        ON consumables_output_records (equipment_id, month);

      CREATE INDEX IF NOT EXISTS idx_consumables_outputs_batch
        ON consumables_output_records (source_batch_id, record_key);
    `,
  },
  {
    version: 8,
    name: 'service-records',
    sql: `
      CREATE TABLE IF NOT EXISTS service_records (
        id TEXT PRIMARY KEY,
        service_number INTEGER NOT NULL CHECK (service_number >= 0),
        order_reference TEXT NOT NULL DEFAULT '',
        recorded_at TEXT NOT NULL,
        month TEXT NOT NULL,
        service_type TEXT NOT NULL DEFAULT '',
        task_type TEXT NOT NULL DEFAULT '',
        source_contract_type TEXT NOT NULL DEFAULT '',
        technician TEXT NOT NULL DEFAULT '',
        task_completed TEXT NOT NULL DEFAULT '',
        parts_used TEXT NOT NULL DEFAULT '',
        model_label TEXT NOT NULL,
        serial_number TEXT NOT NULL,
        family TEXT NOT NULL CHECK (family IN ('T03', 'T06', 'GPR53')),
        customer_id TEXT REFERENCES customers(id) ON DELETE SET NULL,
        contract_id TEXT REFERENCES contracts(id) ON DELETE SET NULL,
        equipment_id TEXT NOT NULL REFERENCES contract_equipment(id) ON DELETE CASCADE,
        customer_name TEXT NOT NULL,
        source_customer_name TEXT NOT NULL DEFAULT '',
        contract_reference TEXT NOT NULL DEFAULT '',
        contract_type TEXT NOT NULL,
        record_key TEXT NOT NULL UNIQUE,
        source_batch_id TEXT NOT NULL REFERENCES import_batches(id) ON DELETE CASCADE,
        source_file_name TEXT NOT NULL,
        created_at TEXT NOT NULL
      );

      CREATE INDEX IF NOT EXISTS idx_service_records_month
        ON service_records (month, family, task_type);

      CREATE INDEX IF NOT EXISTS idx_service_records_equipment
        ON service_records (equipment_id, month);

      CREATE INDEX IF NOT EXISTS idx_service_records_batch
        ON service_records (source_batch_id, record_key);
    `,
  },
  {
    version: 9,
    name: 'travel-foundation',
    sql: `
      CREATE TABLE IF NOT EXISTS travel_trips (
        id TEXT PRIMARY KEY,
        recorded_at TEXT NOT NULL,
        service_number TEXT NOT NULL DEFAULT '',
        customer_name TEXT NOT NULL,
        destination TEXT NOT NULL,
        transport TEXT NOT NULL CHECK (transport IN ('MOVIL PROPIO', 'MOVIL DATA', 'MOVIL RENTADO', 'BUS')),
        technician TEXT NOT NULL DEFAULT '',
        driver TEXT NOT NULL DEFAULT '',
        advance REAL NOT NULL DEFAULT 0 CHECK (advance >= 0),
        allowance REAL NOT NULL DEFAULT 0 CHECK (allowance >= 0),
        lodging REAL NOT NULL DEFAULT 0 CHECK (lodging >= 0),
        tolls REAL NOT NULL DEFAULT 0 CHECK (tolls >= 0),
        other_cost REAL NOT NULL DEFAULT 0 CHECK (other_cost >= 0),
        vehicle_payment REAL NOT NULL DEFAULT 0 CHECK (vehicle_payment >= 0),
        technician_payment REAL NOT NULL DEFAULT 0 CHECK (technician_payment >= 0),
        distance_km REAL NOT NULL DEFAULT 0 CHECK (distance_km >= 0),
        fuel_cost REAL NOT NULL DEFAULT 0 CHECK (fuel_cost >= 0),
        total_cost REAL NOT NULL DEFAULT 0 CHECK (total_cost >= 0),
        status TEXT NOT NULL CHECK (status IN ('pending', 'review', 'approved')),
        source TEXT NOT NULL CHECK (source IN ('xlsx', 'manual')),
        notes TEXT NOT NULL DEFAULT '',
        record_key TEXT NOT NULL UNIQUE,
        source_batch_id TEXT REFERENCES import_batches(id) ON DELETE SET NULL,
        source_file_name TEXT NOT NULL DEFAULT '',
        created_at TEXT NOT NULL,
        updated_at TEXT NOT NULL
      );

      CREATE TABLE IF NOT EXISTS travel_cost_catalog (
        id TEXT PRIMARY KEY,
        source TEXT NOT NULL,
        daily_allowance REAL NOT NULL CHECK (daily_allowance >= 0),
        hotel_per_night REAL NOT NULL CHECK (hotel_per_night >= 0),
        catalog_json TEXT NOT NULL,
        source_batch_id TEXT REFERENCES import_batches(id) ON DELETE SET NULL,
        created_at TEXT NOT NULL
      );

      CREATE TABLE IF NOT EXISTS travel_historical_snapshots (
        id TEXT PRIMARY KEY,
        year INTEGER NOT NULL CHECK (year >= 2000 AND year <= 2200),
        partial INTEGER NOT NULL CHECK (partial IN (0, 1)),
        summary_json TEXT NOT NULL,
        source_batch_id TEXT REFERENCES import_batches(id) ON DELETE SET NULL,
        source_file_name TEXT NOT NULL DEFAULT '',
        created_at TEXT NOT NULL,
        UNIQUE (source_batch_id, year)
      );

      CREATE INDEX IF NOT EXISTS idx_travel_trips_date
        ON travel_trips (recorded_at DESC, id DESC);

      CREATE INDEX IF NOT EXISTS idx_travel_trips_status
        ON travel_trips (status, recorded_at DESC);

      CREATE INDEX IF NOT EXISTS idx_travel_trips_batch
        ON travel_trips (source_batch_id, record_key);

      CREATE INDEX IF NOT EXISTS idx_travel_historical_year
        ON travel_historical_snapshots (year, source_batch_id);
    `,
  },
  {
    version: 10,
    name: 'uniflow-foundation',
    sql: `
      CREATE TABLE IF NOT EXISTS uniflow_price_lists (
        id TEXT PRIMARY KEY,
        price_tab TEXT NOT NULL CHECK (price_tab IN ('t1', 't2', 't1_cip', 't2_cip')),
        catalog_version INTEGER NOT NULL CHECK (catalog_version > 0),
        skus_json TEXT NOT NULL,
        source TEXT NOT NULL,
        last_modified TEXT NOT NULL,
        created_at TEXT NOT NULL,
        UNIQUE (catalog_version, price_tab)
      );

      CREATE INDEX IF NOT EXISTS idx_uniflow_price_lists_current
        ON uniflow_price_lists (catalog_version DESC, price_tab);
    `,
  },
  {
    version: 11,
    name: 'canon-discontinuation-items',
    sql: `
      CREATE TABLE IF NOT EXISTS canon_discontinuation_items (
        id TEXT PRIMARY KEY,
        model_label TEXT NOT NULL,
        normalized_model TEXT NOT NULL,
        part_code TEXT NOT NULL DEFAULT '',
        ends_at TEXT NOT NULL DEFAULT '',
        source_batch_id TEXT NOT NULL REFERENCES import_batches(id) ON DELETE CASCADE,
        source_label TEXT,
        created_at TEXT NOT NULL,
        UNIQUE (source_batch_id, normalized_model, part_code, ends_at)
      );

      CREATE INDEX IF NOT EXISTS idx_canon_discontinuation_model
        ON canon_discontinuation_items (normalized_model, ends_at);

      CREATE INDEX IF NOT EXISTS idx_canon_discontinuation_batch
        ON canon_discontinuation_items (source_batch_id, created_at DESC);
    `,
  },
  {
    version: 12,
    name: 'waldbott-stock-items',
    sql: `
      CREATE TABLE IF NOT EXISTS waldbott_stock_items (
        id TEXT PRIMARY KEY,
        model_label TEXT NOT NULL,
        normalized_model TEXT NOT NULL,
        deposit TEXT NOT NULL,
        quantity REAL NOT NULL CHECK (quantity > 0),
        source_batch_id TEXT NOT NULL REFERENCES import_batches(id) ON DELETE CASCADE,
        source_label TEXT,
        created_at TEXT NOT NULL
      );

      CREATE INDEX IF NOT EXISTS idx_waldbott_stock_model
        ON waldbott_stock_items (source_batch_id, normalized_model, deposit);

      CREATE INDEX IF NOT EXISTS idx_waldbott_stock_batch
        ON waldbott_stock_items (source_batch_id, created_at DESC);
    `,
  },
  {
    version: 13,
    name: 'signed-travel-advances',
    sql: `
      CREATE TABLE travel_trips_v13 (
        id TEXT PRIMARY KEY,
        recorded_at TEXT NOT NULL,
        service_number TEXT NOT NULL DEFAULT '',
        customer_name TEXT NOT NULL,
        destination TEXT NOT NULL,
        transport TEXT NOT NULL CHECK (transport IN ('MOVIL PROPIO', 'MOVIL DATA', 'MOVIL RENTADO', 'BUS')),
        technician TEXT NOT NULL DEFAULT '',
        driver TEXT NOT NULL DEFAULT '',
        advance REAL NOT NULL DEFAULT 0,
        allowance REAL NOT NULL DEFAULT 0 CHECK (allowance >= 0),
        lodging REAL NOT NULL DEFAULT 0 CHECK (lodging >= 0),
        tolls REAL NOT NULL DEFAULT 0 CHECK (tolls >= 0),
        other_cost REAL NOT NULL DEFAULT 0 CHECK (other_cost >= 0),
        vehicle_payment REAL NOT NULL DEFAULT 0 CHECK (vehicle_payment >= 0),
        technician_payment REAL NOT NULL DEFAULT 0 CHECK (technician_payment >= 0),
        distance_km REAL NOT NULL DEFAULT 0 CHECK (distance_km >= 0),
        fuel_cost REAL NOT NULL DEFAULT 0 CHECK (fuel_cost >= 0),
        total_cost REAL NOT NULL DEFAULT 0 CHECK (total_cost >= 0),
        status TEXT NOT NULL CHECK (status IN ('pending', 'review', 'approved')),
        source TEXT NOT NULL CHECK (source IN ('xlsx', 'manual')),
        notes TEXT NOT NULL DEFAULT '',
        record_key TEXT NOT NULL UNIQUE,
        source_batch_id TEXT REFERENCES import_batches(id) ON DELETE SET NULL,
        source_file_name TEXT NOT NULL DEFAULT '',
        created_at TEXT NOT NULL,
        updated_at TEXT NOT NULL
      );

      INSERT INTO travel_trips_v13 (
        id, recorded_at, service_number, customer_name, destination, transport,
        technician, driver, advance, allowance, lodging, tolls, other_cost,
        vehicle_payment, technician_payment, distance_km, fuel_cost, total_cost,
        status, source, notes, record_key, source_batch_id, source_file_name,
        created_at, updated_at
      )
      SELECT
        id, recorded_at, service_number, customer_name, destination, transport,
        technician, driver, advance, allowance, lodging, tolls, other_cost,
        vehicle_payment, technician_payment, distance_km, fuel_cost, total_cost,
        status, source, notes, record_key, source_batch_id, source_file_name,
        created_at, updated_at
      FROM travel_trips;

      DROP TABLE travel_trips;
      ALTER TABLE travel_trips_v13 RENAME TO travel_trips;

      CREATE INDEX idx_travel_trips_date
        ON travel_trips (recorded_at DESC, id DESC);

      CREATE INDEX idx_travel_trips_status
        ON travel_trips (status, recorded_at DESC);

      CREATE INDEX idx_travel_trips_batch
        ON travel_trips (source_batch_id, record_key);
    `,
  },
  {
    version: 14,
    name: 'legacy-contract-metadata',
    sql: `
      ALTER TABLE contracts ADD COLUMN order_reference TEXT;
      ALTER TABLE contracts ADD COLUMN division TEXT;
      ALTER TABLE contracts ADD COLUMN is_active INTEGER CHECK (is_active IS NULL OR is_active IN (0, 1));
      ALTER TABLE contracts ADD COLUMN requires_closure INTEGER CHECK (requires_closure IS NULL OR requires_closure IN (0, 1));
    `,
  },
  {
    version: 15,
    name: 'legacy-equipment-metadata',
    sql: `
      ALTER TABLE contract_equipment ADD COLUMN brand TEXT;
      ALTER TABLE contract_equipment ADD COLUMN description TEXT;
      ALTER TABLE contract_equipment ADD COLUMN interior TEXT;
      ALTER TABLE contract_equipment ADD COLUMN city TEXT;
      ALTER TABLE contract_equipment ADD COLUMN branch TEXT;
      ALTER TABLE contract_equipment ADD COLUMN address TEXT;
      ALTER TABLE contract_equipment ADD COLUMN is_active INTEGER CHECK (is_active IS NULL OR is_active IN (0, 1));
    `,
  },
  {
    version: 16,
    name: 'lossless-source-rows',
    sql: `
      CREATE TABLE import_source_rows (
        id TEXT PRIMARY KEY,
        batch_id TEXT NOT NULL REFERENCES import_batches(id) ON DELETE CASCADE,
        import_file_id TEXT NOT NULL REFERENCES import_files(id) ON DELETE CASCADE,
        sheet_name TEXT NOT NULL,
        sheet_index INTEGER NOT NULL CHECK (sheet_index >= 0),
        row_number INTEGER NOT NULL CHECK (row_number >= 1),
        values_json TEXT NOT NULL,
        is_empty INTEGER NOT NULL CHECK (is_empty IN (0, 1)),
        created_at TEXT NOT NULL,
        UNIQUE (import_file_id, sheet_name, row_number)
      );

      CREATE INDEX idx_import_source_rows_batch
        ON import_source_rows (batch_id, sheet_index, row_number);

      CREATE INDEX idx_import_source_rows_file_sheet
        ON import_source_rows (import_file_id, sheet_name, row_number);
    `,
  },
  {
    version: 17,
    name: 'consumables-source-financial-fields',
    sql: `
      ALTER TABLE consumables_usage_records ADD COLUMN source_customer_name TEXT NOT NULL DEFAULT '';
      ALTER TABLE consumables_usage_records ADD COLUMN source_order_reference TEXT NOT NULL DEFAULT '';
      ALTER TABLE consumables_usage_records ADD COLUMN source_unit_price_pyg REAL CHECK (source_unit_price_pyg IS NULL OR source_unit_price_pyg >= 0);
      ALTER TABLE consumables_usage_records ADD COLUMN source_total_pyg REAL CHECK (source_total_pyg IS NULL OR source_total_pyg >= 0);
    `,
  },
  {
    version: 18,
    name: 'normalized-source-lineage',
    sql: `
      ALTER TABLE consumables_usage_records ADD COLUMN source_sheet_name TEXT NOT NULL DEFAULT '';
      ALTER TABLE consumables_usage_records ADD COLUMN source_row_number INTEGER NOT NULL DEFAULT 0 CHECK (source_row_number >= 0);
      ALTER TABLE consumables_output_records ADD COLUMN source_sheet_name TEXT NOT NULL DEFAULT '';
      ALTER TABLE consumables_output_records ADD COLUMN source_row_number INTEGER NOT NULL DEFAULT 0 CHECK (source_row_number >= 0);
      ALTER TABLE service_records ADD COLUMN source_sheet_name TEXT NOT NULL DEFAULT '';
      ALTER TABLE service_records ADD COLUMN source_row_number INTEGER NOT NULL DEFAULT 0 CHECK (source_row_number >= 0);
    `,
  },
  {
    version: 19,
    name: 'travel-source-lineage',
    sql: `
      ALTER TABLE travel_trips ADD COLUMN source_sheet_name TEXT NOT NULL DEFAULT '';
      ALTER TABLE travel_trips ADD COLUMN source_row_number INTEGER NOT NULL DEFAULT 0 CHECK (source_row_number >= 0);
    `,
  },
  {
    version: 20,
    name: 'legacy-source-operational-details',
    sql: `
      ALTER TABLE consumables_usage_records ADD COLUMN source_details_json TEXT NOT NULL DEFAULT '[]';
      ALTER TABLE consumables_output_records ADD COLUMN source_details_json TEXT NOT NULL DEFAULT '[]';
      ALTER TABLE service_records ADD COLUMN source_details_json TEXT NOT NULL DEFAULT '[]';
    `,
  },
  {
    version: 21,
    name: 'consumables-output-source-financial-fields',
    sql: `
      ALTER TABLE consumables_output_records ADD COLUMN source_unit_price_pyg REAL CHECK (source_unit_price_pyg IS NULL OR source_unit_price_pyg >= 0);
      ALTER TABLE consumables_output_records ADD COLUMN source_total_pyg REAL CHECK (source_total_pyg IS NULL OR source_total_pyg >= 0);
    `,
  },
  {
    version: 22,
    name: 'maintenance-source-lineage',
    sql: `
      ALTER TABLE maintenance_counter_records ADD COLUMN source_sheet_name TEXT NOT NULL DEFAULT '';
      ALTER TABLE maintenance_counter_records ADD COLUMN source_row_number INTEGER NOT NULL DEFAULT 0 CHECK (source_row_number >= 0);
      ALTER TABLE maintenance_counter_records ADD COLUMN source_details_json TEXT NOT NULL DEFAULT '[]';
    `,
  },
  {
    version: 23,
    name: 'import-source-type',
    sql: `
      ALTER TABLE import_batches ADD COLUMN source_type TEXT;

      CREATE INDEX idx_import_batches_source_type
        ON import_batches (domain, source_type, created_at DESC);
    `,
  },
  {
    version: 24,
    name: 'proforma-labor-cost',
    sql: `
      ALTER TABLE proforma_lines
        ADD COLUMN labor_cost_local REAL
        CHECK (labor_cost_local IS NULL OR labor_cost_local >= 0);
    `,
  },
  {
    version: 25,
    name: 'fleet-source-details',
    sql: `
      ALTER TABLE customers ADD COLUMN source_details_json TEXT NOT NULL DEFAULT '[]';
      ALTER TABLE customers ADD COLUMN source_sheet_name TEXT NOT NULL DEFAULT '';
      ALTER TABLE customers ADD COLUMN source_row_number INTEGER NOT NULL DEFAULT 0 CHECK (source_row_number >= 0);
      ALTER TABLE contracts ADD COLUMN source_details_json TEXT NOT NULL DEFAULT '[]';
      ALTER TABLE contracts ADD COLUMN source_sheet_name TEXT NOT NULL DEFAULT '';
      ALTER TABLE contracts ADD COLUMN source_row_number INTEGER NOT NULL DEFAULT 0 CHECK (source_row_number >= 0);
      ALTER TABLE contract_equipment ADD COLUMN source_details_json TEXT NOT NULL DEFAULT '[]';
      ALTER TABLE contract_equipment ADD COLUMN source_sheet_name TEXT NOT NULL DEFAULT '';
      ALTER TABLE contract_equipment ADD COLUMN source_row_number INTEGER NOT NULL DEFAULT 0 CHECK (source_row_number >= 0);
    `,
  },
  {
    version: 26,
    name: 'catalog-legacy-commercial-items',
    sql: `
      CREATE TABLE IF NOT EXISTS catalog_model_notes (
        id TEXT PRIMARY KEY,
        brand TEXT NOT NULL,
        family_name TEXT NOT NULL,
        model_name TEXT NOT NULL,
        normalized_model_name TEXT NOT NULL,
        note TEXT NOT NULL,
        source_batch_id TEXT NOT NULL REFERENCES import_batches(id) ON DELETE CASCADE,
        created_at TEXT NOT NULL,
        UNIQUE (source_batch_id, brand, normalized_model_name)
      );

      CREATE INDEX IF NOT EXISTS idx_catalog_model_notes_lookup
        ON catalog_model_notes (brand, normalized_model_name);

      CREATE TABLE IF NOT EXISTS catalog_service_items (
        id TEXT PRIMARY KEY,
        brand TEXT NOT NULL,
        family_name TEXT NOT NULL,
        model_name TEXT NOT NULL,
        normalized_model_name TEXT NOT NULL,
        item_kind TEXT NOT NULL CHECK (item_kind IN ('labor', 'fixed')),
        description TEXT NOT NULL,
        fixed_price_local REAL CHECK (fixed_price_local IS NULL OR fixed_price_local >= 0),
        source_batch_id TEXT NOT NULL REFERENCES import_batches(id) ON DELETE CASCADE,
        created_at TEXT NOT NULL
      );

      CREATE INDEX IF NOT EXISTS idx_catalog_service_items_lookup
        ON catalog_service_items (brand, normalized_model_name, item_kind);

      CREATE INDEX IF NOT EXISTS idx_catalog_service_items_batch
        ON catalog_service_items (source_batch_id);
    `,
  },
  {
    version: 27,
    name: 'proforma-service-report-number',
    sql: `
      ALTER TABLE proformas ADD COLUMN service_report_number TEXT NOT NULL DEFAULT '';
    `,
  },
  {
    version: 28,
    name: 'catalog-part-legacy-fields',
    sql: `
      ALTER TABLE parts ADD COLUMN legacy_reference TEXT NOT NULL DEFAULT '';
      ALTER TABLE parts ADD COLUMN useful_life TEXT NOT NULL DEFAULT '';
    `,
  },
  {
    version: 29,
    name: 'catalog-model-families',
    sql: `
      CREATE TABLE IF NOT EXISTS catalog_model_families (
        id TEXT PRIMARY KEY,
        brand TEXT NOT NULL,
        family_name TEXT NOT NULL,
        normalized_family_name TEXT NOT NULL,
        model_name TEXT NOT NULL,
        normalized_model_name TEXT NOT NULL,
        source_batch_id TEXT NOT NULL REFERENCES import_batches(id) ON DELETE CASCADE,
        created_at TEXT NOT NULL,
        UNIQUE (source_batch_id, brand, normalized_family_name, normalized_model_name)
      );

      CREATE INDEX IF NOT EXISTS idx_catalog_model_families_lookup
        ON catalog_model_families (brand, normalized_family_name, normalized_model_name);

      CREATE INDEX IF NOT EXISTS idx_catalog_model_families_batch
        ON catalog_model_families (source_batch_id);
    `,
  },
  {
    version: 30,
    name: 'consumables-contract-projections',
    sql: `
      ALTER TABLE consumables_usage_records ADD COLUMN contract_order_reference TEXT NOT NULL DEFAULT '';
      ALTER TABLE consumables_usage_records ADD COLUMN contract_division TEXT NOT NULL DEFAULT '';
      ALTER TABLE consumables_output_records ADD COLUMN contract_order_reference TEXT NOT NULL DEFAULT '';
      ALTER TABLE consumables_output_records ADD COLUMN contract_division TEXT NOT NULL DEFAULT '';

      UPDATE consumables_usage_records
      SET
        contract_order_reference = COALESCE((SELECT order_reference FROM contracts WHERE contracts.id = consumables_usage_records.contract_id), ''),
        contract_division = COALESCE((SELECT division FROM contracts WHERE contracts.id = consumables_usage_records.contract_id), '')
      WHERE contract_id IS NOT NULL;

      UPDATE consumables_output_records
      SET
        contract_order_reference = COALESCE((SELECT order_reference FROM contracts WHERE contracts.id = consumables_output_records.contract_id), ''),
        contract_division = COALESCE((SELECT division FROM contracts WHERE contracts.id = consumables_output_records.contract_id), '')
      WHERE contract_id IS NOT NULL;

      CREATE INDEX IF NOT EXISTS idx_consumables_records_contract
        ON consumables_usage_records (contract_order_reference, contract_division);

      CREATE INDEX IF NOT EXISTS idx_consumables_outputs_contract
        ON consumables_output_records (contract_order_reference, contract_division);
    `,
  },
  {
    version: 31,
    name: 'catalog-cost-availability',
    sql: `
      ALTER TABLE parts ADD COLUMN cost_available INTEGER NOT NULL DEFAULT 1
        CHECK (cost_available IN (0, 1));
    `,
  },
  {
    version: 32,
    name: 'catalog-family-pricing',
    sql: `
      ALTER TABLE catalog_model_families ADD COLUMN exchange_rate REAL
        CHECK (exchange_rate IS NULL OR exchange_rate > 0);
      ALTER TABLE catalog_model_families ADD COLUMN pricing_factor REAL
        CHECK (pricing_factor IS NULL OR pricing_factor > 0);
    `,
  },
  {
    version: 33,
    name: 'proforma-line-catalog-kind',
    sql: `
      ALTER TABLE proforma_lines ADD COLUMN catalog_kind TEXT
        CHECK (catalog_kind IS NULL OR catalog_kind IN ('consumibles', 'repuestos'));
    `,
  },
  {
    version: 34,
    name: 'consumables-source-operational-fields',
    sql: `
      ALTER TABLE consumables_usage_records ADD COLUMN source_operational_json TEXT NOT NULL DEFAULT '{}';
    `,
  },
  {
    version: 35,
    name: 'canon-discontinuation-source-fields',
    sql: `
      ALTER TABLE canon_discontinuation_items ADD COLUMN voltage TEXT;
      ALTER TABLE canon_discontinuation_items ADD COLUMN source_notes_json TEXT NOT NULL DEFAULT '[]';
    `,
  },
  {
    version: 36,
    name: 'service-source-operational-fields',
    sql: `
      ALTER TABLE service_records ADD COLUMN source_operational_json TEXT NOT NULL DEFAULT '{}';
    `,
  },
  {
    version: 37,
    name: 'travel-source-operational-fields',
    sql: `
      ALTER TABLE travel_trips ADD COLUMN source_operational_json TEXT NOT NULL DEFAULT '{}';
    `,
  },
  {
    version: 38,
    name: 'consumables-output-source-operational-fields',
    sql: `
      ALTER TABLE consumables_output_records ADD COLUMN source_operational_json TEXT NOT NULL DEFAULT '{}';
    `,
  },
  {
    version: 39,
    name: 'legacy-contract-commercial-area',
    sql: `
      ALTER TABLE contracts ADD COLUMN commercial_area TEXT;
    `,
  },
  {
    version: 40,
    name: 'proforma-line-catalog-metadata',
    sql: `
      ALTER TABLE proforma_lines ADD COLUMN source_stock REAL
        CHECK (source_stock IS NULL OR source_stock >= 0);
      ALTER TABLE proforma_lines ADD COLUMN source_discontinued_status TEXT
        CHECK (source_discontinued_status IS NULL OR source_discontinued_status IN ('active', 'discontinued', 'unknown'));
    `,
  },
  {
    version: 41,
    name: 'travel-cost-catalog-parser-revision',
    sql: `
      ALTER TABLE travel_cost_catalog ADD COLUMN parser_revision INTEGER NOT NULL DEFAULT 1
        CHECK (parser_revision >= 1);
    `,
  },
  {
    version: 42,
    name: 'self-contained-import-originals',
    sql: `
      ALTER TABLE import_files ADD COLUMN content_blob BLOB;
    `,
  },
  {
    version: 43,
    name: 'retain-removed-import-originals',
    sql: `
      CREATE TABLE archived_import_files (
        id TEXT PRIMARY KEY,
        source_batch_id TEXT NOT NULL,
        file_name TEXT NOT NULL,
        stored_path TEXT NOT NULL,
        content_hash TEXT NOT NULL,
        content_type TEXT,
        size_bytes INTEGER NOT NULL CHECK (size_bytes >= 0),
        created_at TEXT NOT NULL,
        archived_at TEXT NOT NULL,
        content_blob BLOB,
        UNIQUE (stored_path)
      );

      CREATE TRIGGER preserve_import_files_before_batch_delete
      BEFORE DELETE ON import_batches
      BEGIN
        INSERT OR IGNORE INTO archived_import_files (
          id, source_batch_id, file_name, stored_path, content_hash,
          content_type, size_bytes, created_at, archived_at, content_blob
        )
        SELECT
          id, batch_id, file_name, stored_path, content_hash,
          content_type, size_bytes, created_at, CURRENT_TIMESTAMP, content_blob
        FROM import_files
        WHERE batch_id = OLD.id;
      END;
    `,
  },
  {
    version: 44,
    name: 'contract-equipment-serial-lookup-index',
    sql: `
      -- Consumibles, Servicios y las salidas buscan el equipo por esta expresión exacta.
      -- Sin índice cada fila recorría todos los equipos y el paquete de nueve fuentes tardaba minutos.
      CREATE INDEX IF NOT EXISTS idx_contract_equipment_serial_lookup
        ON contract_equipment (UPPER(TRIM(COALESCE(serial_number, ''))));
    `,
  },
  {
    version: 45,
    name: 'contract-equipment-source-batch',
    sql: `
      -- Una carga nueva desactiva lo que la anterior trajo y la nueva ya no incluye; hace falta saber qué carga tocó cada equipo.
      ALTER TABLE contract_equipment ADD COLUMN source_batch_id TEXT REFERENCES import_batches(id) ON DELETE SET NULL;
      CREATE INDEX IF NOT EXISTS idx_contract_equipment_source_batch ON contract_equipment (source_batch_id);
      -- Equipos ya cargados no tienen origen: se atribuyen a la última carga aplicada de Equipos en contrato.
      UPDATE contract_equipment
      SET source_batch_id = (
        SELECT id FROM import_batches
        WHERE domain = 'operations' AND source_type = 'fleet.equipment' AND status = 'applied'
        ORDER BY created_at DESC LIMIT 1
      )
      WHERE source_sheet_name <> '' AND source_batch_id IS NULL;
    `,
  },
];

function ensureMigrationsTable(database: SuiteDatabase) {
  database.exec(`
    CREATE TABLE IF NOT EXISTS schema_migrations (
      version INTEGER PRIMARY KEY,
      name TEXT NOT NULL,
      applied_at TEXT NOT NULL
    )
  `);
}

function validateMigrations(migrations: readonly Migration[]) {
  const versions = migrations.map((migration) => migration.version);
  if (new Set(versions).size !== versions.length) {
    throw new Error('Las migraciones de la suite deben tener versiones únicas.');
  }
  if (versions.some((version) => !Number.isInteger(version) || version < 1)) {
    throw new Error('Las versiones de migración deben ser enteros positivos.');
  }
}

function backupDatabase(databasePath: string): string {
  const basePath = `${databasePath}.backup-${Date.now()}`;
  let backupPath = basePath;
  let suffix = 1;
  while (fs.existsSync(backupPath)) {
    backupPath = `${basePath}-${suffix}`;
    suffix += 1;
  }
  fs.copyFileSync(databasePath, backupPath);
  return backupPath;
}

function applyMigrations(
  database: SuiteDatabase,
  databasePath: string,
  migrations: readonly Migration[],
  databaseExistedBeforeOpen: boolean,
) {
  validateMigrations(migrations);
  ensureMigrationsTable(database);

  const appliedRows = database
    .prepare('SELECT version FROM schema_migrations ORDER BY version')
    .all() as Array<{ version: number }>;
  const appliedVersions = new Set(appliedRows.map((row) => row.version));
  const pending = [...migrations]
    .filter((migration) => !appliedVersions.has(migration.version))
    .sort((left, right) => left.version - right.version);

  if (pending.length > 0 && databaseExistedBeforeOpen && fs.statSync(databasePath).size > 0) {
    database.pragma('wal_checkpoint(TRUNCATE)');
    backupDatabase(databasePath);
  }

  const applyPending = database.transaction(() => {
    const insertMigration = database.prepare(
      'INSERT INTO schema_migrations (version, name, applied_at) VALUES (?, ?, ?)',
    );
    for (const migration of pending) {
      database.exec(migration.sql);
      insertMigration.run(migration.version, migration.name, new Date().toISOString());
    }
  });

  applyPending();
}

function migrateLegacyDatabaseFile(databasePath: string): void {
  if (path.basename(databasePath) !== 'dcss.sqlite' || fs.existsSync(databasePath)) return;
  const oldPath = path.join(path.dirname(databasePath), 'datasystems.sqlite');
  if (!fs.existsSync(oldPath)) return;

  const candidate = path.join(path.dirname(databasePath), `.dcss-migration-${randomUUID()}.sqlite`);
  const legacy = new Database(oldPath, { readonly: true, fileMustExist: true });
  try {
    legacy.prepare('VACUUM INTO ?').run(candidate);
    fs.renameSync(candidate, databasePath);
  } finally {
    legacy.close();
    fs.rmSync(candidate, { force: true });
  }
}

export function openDatabase(
  databasePath: string,
  migrations: readonly Migration[] = CORE_MIGRATIONS,
): SuiteDatabase {
  const absolutePath = path.resolve(databasePath);
  fs.mkdirSync(path.dirname(absolutePath), { recursive: true });
  migrateLegacyDatabaseFile(absolutePath);
  const databaseExistedBeforeOpen = fs.existsSync(absolutePath) && fs.statSync(absolutePath).size > 0;

  const database = new Database(absolutePath);
  database.pragma('foreign_keys = ON');
  database.pragma('busy_timeout = 5000');
  database.pragma('journal_mode = WAL');

  try {
    applyMigrations(database, absolutePath, migrations, databaseExistedBeforeOpen);
    return database;
  } catch (error) {
    database.close();
    throw error;
  }
}

export function resolveDatabasePath(dataDirectory: string): string {
  return path.join(path.resolve(dataDirectory), 'dcss.sqlite');
}
