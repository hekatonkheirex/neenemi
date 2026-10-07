import type { SuiteDatabase } from './database';
import type { ImportBatchStatus } from './repositories';
import { normalizeSerial } from '../modules/consumibles/analysis';

export type SuiteOverviewCounts = {
  parts: number;
  models: number;
  customers: number;
  contracts: number;
  equipment: number;
  maintenanceRecords: number;
  consumablesRecords: number;
  serviceRecords: number;
  travelTrips: number;
  modelSupportItems: number;
  waldbottStockItems: number;
};

export type SuiteRecentImport = {
  id: string;
  domain: string;
  sourceName: string;
  status: ImportBatchStatus;
  createdAt: string;
  appliedAt: string | null;
  files: number;
};

export type SuiteOverview = {
  counts: SuiteOverviewCounts;
  appliedImports: number;
  recentImports: SuiteRecentImport[];
  dashboard: {
    portfolio: null | {
      equipment: number;
      equipmentWithoutSerial: number;
      // Series on active contracts of the four department types, and how many have counter readings in the current maintenance load.
      activeEquipment: number;
      activeEquipmentWithReadings: number;
      activeContracts: number;
      activeCustomers: number;
      unknownContracts: number;
      contractsByType: { type: string; count: number }[];
    };
    canon: null | { discontinued: number; scheduled: number; unknown: number };
  };
};

type SuiteOverviewCountRow = {
  parts: number;
  models: number;
  customers: number;
  contracts: number;
  equipment: number;
  maintenance_records: number;
  consumables_records: number;
  service_records: number;
  travel_trips: number;
  model_support_items: number;
  waldbott_stock_items: number;
  applied_imports: number;
};

type SuiteRecentImportRow = {
  id: string;
  domain: string;
  source_name: string;
  status: ImportBatchStatus;
  created_at: string;
  applied_at: string | null;
  files: number;
};

export class OverviewRepository {
  constructor(private readonly database: SuiteDatabase) {}

  get(today = new Date().toISOString().slice(0, 10)): SuiteOverview {
    const counts = this.database
      .prepare(`
        SELECT
          (SELECT COUNT(*) FROM parts) AS parts,
          (SELECT COUNT(*) FROM equipment_models) AS models,
          (SELECT COUNT(*) FROM customers) AS customers,
          (SELECT COUNT(*) FROM contracts) AS contracts,
          (SELECT COUNT(*) FROM contract_equipment) AS equipment,
          (SELECT COUNT(*) FROM maintenance_counter_records) AS maintenance_records,
          (SELECT COUNT(*) FROM consumables_usage_records) AS consumables_records,
          (SELECT COUNT(*) FROM service_records) AS service_records,
          (SELECT COUNT(*) FROM travel_trips) AS travel_trips,
          (SELECT COUNT(*) FROM canon_discontinuation_items) AS model_support_items,
          (SELECT COUNT(*)
           FROM waldbott_stock_items item
           WHERE item.source_batch_id = (
             SELECT batch.id
             FROM import_batches batch
             WHERE batch.domain = 'operations-waldbott' AND batch.status = 'applied'
             ORDER BY COALESCE(batch.applied_at, batch.created_at) DESC, batch.id DESC
             LIMIT 1
           )) AS waldbott_stock_items,
          (SELECT COUNT(*) FROM import_batches WHERE status = 'applied') AS applied_imports
      `)
      .get() as SuiteOverviewCountRow;

    const recentImports = this.database
      .prepare(`
        SELECT
          batch.id,
          batch.domain,
          batch.source_name,
          batch.status,
          batch.created_at,
          batch.applied_at,
          COUNT(file.id) AS files
        FROM import_batches batch
        LEFT JOIN import_files file ON file.batch_id = batch.id
        GROUP BY batch.id, batch.domain, batch.source_name, batch.status, batch.created_at, batch.applied_at
        ORDER BY COALESCE(batch.applied_at, batch.created_at) DESC, batch.id DESC
        LIMIT 6
      `)
      .all() as SuiteRecentImportRow[];

    return {
      counts: {
        parts: counts.parts,
        models: counts.models,
        customers: counts.customers,
        contracts: counts.contracts,
        equipment: counts.equipment,
        maintenanceRecords: counts.maintenance_records,
        consumablesRecords: counts.consumables_records,
        serviceRecords: counts.service_records,
        travelTrips: counts.travel_trips,
        modelSupportItems: counts.model_support_items,
        waldbottStockItems: counts.waldbott_stock_items,
      },
      appliedImports: counts.applied_imports,
      recentImports: recentImports.map((row) => ({
        id: row.id,
        domain: row.domain,
        sourceName: row.source_name,
        status: row.status,
        createdAt: row.created_at,
        appliedAt: row.applied_at,
        files: row.files,
      })),
      dashboard: {
        portfolio: this.getPortfolio(counts),
        canon: this.getCanon(today),
      },
    };
  }

  private getPortfolio(counts: SuiteOverviewCountRow): SuiteOverview['dashboard']['portfolio'] {
    if (counts.customers === 0 && counts.contracts === 0 && counts.equipment === 0) {
      const source = this.database.prepare(`
        SELECT 1 FROM import_batches
        WHERE status = 'applied' AND domain IN (
          'operations', 'operations-fleet-contracts',
          'operations-fleet-contract-details', 'operations-fleet-classification'
        )
        LIMIT 1
      `).get();
      if (!source) return null;
    }

    const equipment = this.database.prepare('SELECT serial_number FROM contract_equipment').all() as {
      serial_number: string | null;
    }[];
    const serials = new Set<string>();
    let equipmentWithoutSerial = 0;
    for (const item of equipment) {
      const serial = normalizeSerial(item.serial_number ?? '');
      if (serial) serials.add(serial);
      // Without a serial, each stored equipment ID remains a separate item.
      else equipmentWithoutSerial += 1;
    }

    const activeSerials = new Set<string>();
    const activeRows = this.database.prepare(`
      SELECT ce.serial_number FROM contract_equipment ce JOIN contracts c ON c.id = ce.contract_id
      WHERE c.is_active = 1 AND c.contract_type IN ('Abierto', 'Alquiler', 'Leasing', 'Mantenimiento')
    `).all() as { serial_number: string | null }[];
    for (const row of activeRows) {
      const serial = normalizeSerial(row.serial_number ?? '');
      if (serial) activeSerials.add(serial);
    }
    // Same batch the maintenance analysis reads: the latest applied one.
    const readingRows = this.database.prepare(`
      SELECT DISTINCT serial_number FROM maintenance_counter_records
      WHERE source_batch_id = (
        SELECT id FROM import_batches WHERE domain = 'maintenance' AND status = 'applied'
        ORDER BY created_at DESC, id DESC LIMIT 1
      )
    `).all() as { serial_number: string | null }[];
    const readingSerials = new Set<string>();
    for (const row of readingRows) readingSerials.add(normalizeSerial(row.serial_number ?? ''));
    let activeEquipmentWithReadings = 0;
    for (const serial of activeSerials) if (readingSerials.has(serial)) activeEquipmentWithReadings += 1;

    // One contract = one reference per type; the table holds one row per line or revision.
    const contractTypes = this.database.prepare(`
      SELECT contract_type AS type,
        COUNT(DISTINCT CASE WHEN is_active = 1 THEN COALESCE(NULLIF(reference, ''), id) END) AS count,
        COUNT(DISTINCT CASE WHEN is_active IS NULL THEN COALESCE(NULLIF(reference, ''), id) END) AS unknown
      FROM contracts
      WHERE contract_type IN ('Abierto', 'Alquiler', 'Leasing', 'Mantenimiento')
      GROUP BY contract_type
      ORDER BY contract_type
    `).all() as { type: string; count: number; unknown: number }[];
    const { total: activeCustomers } = this.database.prepare(`
      SELECT COUNT(DISTINCT customer_id) AS total FROM contracts
      WHERE is_active = 1 AND contract_type IN ('Abierto', 'Alquiler', 'Leasing', 'Mantenimiento')
    `).get() as { total: number };
    let activeContracts = 0;
    let unknownContracts = 0;
    const contractsByType = contractTypes.map(({ type, count, unknown }) => {
      activeContracts += count;
      unknownContracts += unknown;
      return { type, count };
    });

    return {
      equipment: serials.size + equipmentWithoutSerial,
      equipmentWithoutSerial,
      activeEquipment: activeSerials.size,
      activeEquipmentWithReadings,
      activeContracts,
      activeCustomers,
      unknownContracts,
      contractsByType,
    };
  }

  private getCanon(today: string): SuiteOverview['dashboard']['canon'] {
    const result = this.database.prepare(`
      WITH models AS (
        SELECT item.normalized_model,
          MAX(CASE
            WHEN trim(item.ends_at) <> '' AND trim(item.ends_at) <= ? THEN 2
            WHEN trim(item.ends_at) <> '' THEN 1
            ELSE 0
          END) AS status
        FROM canon_discontinuation_items item
        JOIN import_batches batch ON batch.id = item.source_batch_id
        WHERE batch.status = 'applied'
        GROUP BY item.normalized_model
      )
      SELECT
        COUNT(*) AS models,
        COALESCE(SUM(CASE WHEN status = 2 THEN 1 ELSE 0 END), 0) AS discontinued,
        COALESCE(SUM(CASE WHEN status = 1 THEN 1 ELSE 0 END), 0) AS scheduled,
        COALESCE(SUM(CASE WHEN status = 0 THEN 1 ELSE 0 END), 0) AS unknown,
        EXISTS (
          SELECT 1 FROM import_batches
          WHERE domain = 'operations-canon' AND status = 'applied'
        ) AS available_source
      FROM models
    `).get(today) as {
      models: number;
      discontinued: number;
      scheduled: number;
      unknown: number;
      available_source: number;
    };
    if (result.models === 0 && !result.available_source) return null;
    return {
      discontinued: result.discontinued,
      scheduled: result.scheduled,
      unknown: result.unknown,
    };
  }
}
