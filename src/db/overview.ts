import type { SuiteDatabase } from './database';
import type { ImportBatchStatus } from './repositories';

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

  get(): SuiteOverview {
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
    };
  }
}
