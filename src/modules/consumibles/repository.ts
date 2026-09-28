import { randomUUID } from 'node:crypto';
import type { SuiteDatabase } from '../../db/database';
import { buildOperationalFilter, type OperationalFilters } from '../../core/operational-filters';
import type { PageRequest, PaginatedResult } from '../../core/pagination';
import { parseSourceDetails, serializeSourceDetails } from '../../core/source-details';
import { backfillNormalizedSourceMetadata } from '../../core/source-metadata';
import { normalizeOutputRecordKey, normalizeRecordKey, normalizeSerial } from './analysis';
import { parseConsumablesWorkbook } from './xlsx';
import { parseOutputsWorkbook } from './outputs';
import { CONSUMABLES_SOURCE_TYPES } from './types';
import type {
  ConsumablesImportResult,
  ConsumablesAggregate,
  ConsumablesAnalytics,
  ConsumablesContractAggregate,
  ConsumablesDispatchEquipmentAggregate,
  ConsumablesEquipmentAggregate,
  ConsumablesOutputRecord,
  ConsumablesOutputSourceOperational,
  ConsumablesOutputsSummary,
  ConsumablesRecord,
  ConsumablesRecordKind,
  ConsumablesSourceOperational,
  ConsumablesSourceType,
  ConsumablesSummary,
  ParsedConsumablesOutputRow,
  ParsedConsumablesRow,
} from './types';

export type ConsumablesQuery = OperationalFilters & {
  query?: string;
  kind?: ConsumablesRecordKind;
  limit?: number;
  offset?: number;
};

export type ConsumablesOutputQuery = OperationalFilters & {
  query?: string;
  kind?: ConsumablesRecordKind;
  limit?: number;
  offset?: number;
};

type EquipmentRow = {
  equipment_id: string;
  customer_id: string;
  contract_id: string;
  customer_name: string;
  contract_reference: string | null;
  contract_order_reference: string | null;
  contract_commercial_area: string | null;
  contract_division: string | null;
  contract_type: string;
  serial_number: string | null;
};

type RecordRow = {
  id: string;
  record_kind: ConsumablesRecordKind;
  recorded_at: string;
  month: string;
  model_label: string;
  serial_number: string;
  part_code: string;
  description: string;
  quantity: number;
  cost_usd: number;
  classification: 'original' | 'compatible';
  category: string;
  family: 'T03' | 'T06' | 'GPR53';
  customer_id: string | null;
  contract_id: string | null;
  equipment_id: string;
  customer_name: string;
  customer_type: string | null;
  commercial_area: string | null;
  contract_reference: string;
  contract_order_reference: string;
  contract_commercial_area: string | null;
  contract_division: string;
  contract_type: string;
  source_customer_name: string;
  source_order_reference: string;
  source_unit_price_pyg: number | null;
  source_total_pyg: number | null;
  source_operational_json: string;
  source_details_json: string;
  source_type: string | null;
  source_file_name: string;
  source_sheet_name: string;
  source_row_number: number;
};

type OutputRecordRow = {
  id: string;
  record_kind: ConsumablesRecordKind;
  document_number: number;
  recorded_at: string;
  month: string;
  model_label: string;
  serial_number: string;
  part_code: string;
  description: string;
  quantity: number;
  yield_pages: number;
  technician: string;
  service_report_number: number;
  classification: 'original' | 'compatible';
  category: string;
  family: 'T03' | 'T06' | 'GPR53';
  customer_id: string | null;
  contract_id: string | null;
  equipment_id: string;
  customer_name: string;
  customer_type: string | null;
  commercial_area: string | null;
  source_customer_name: string;
  source_unit_price_pyg: number | null;
  source_total_pyg: number | null;
  source_operational_json: string;
  source_details_json: string;
  source_type: string | null;
  contract_reference: string;
  contract_order_reference: string;
  contract_commercial_area: string | null;
  contract_division: string;
  contract_type: string;
  source_file_name: string;
  source_sheet_name: string;
  source_row_number: number;
};

type AggregateRow = {
  key: string;
  label: string;
  records: number;
  quantity: number;
  cost_usd: number;
  original_records: number;
  compatible_records: number;
  equipment: number;
};

type EquipmentAggregateRow = AggregateRow & {
  equipment_id: string;
  customer_name: string;
  model_label: string;
  serial_number: string;
};

type ContractAggregateRow = {
  key: string;
  reference: string;
  order_reference: string;
  contract_commercial_area: string | null;
  division: string;
  customer_name: string;
  contract_type: string;
  records: number;
  quantity: number;
  cost_usd: number;
  consumable_cost_usd: number;
  part_cost_usd: number;
  consumable_records: number;
  part_records: number;
  original_records: number;
  compatible_records: number;
  equipment: number;
};

type DispatchEquipmentAggregateRow = {
  key: string;
  equipment_id: string;
  customer_name: string;
  model_label: string;
  serial_number: string;
  contract_reference: string;
  contract_order_reference: string;
  contract_commercial_area: string | null;
  contract_division: string;
  contract_type: string;
  records: number;
  consumable_records: number;
  part_records: number;
  consumable_quantity: number;
  part_quantity: number;
  original_records: number;
  compatible_records: number;
  last_recorded_at: string | null;
};

const VALID_CONTRACT_TYPES = new Set(['Alquiler', 'Leasing', 'Mantenimiento']);
type ReplacementBatchIds = string | readonly string[] | undefined;

export class ConsumablesRepository {
  constructor(private readonly database: SuiteDatabase) {}

  async importWorkbook(
    batchId: string,
    sourceFileName: string,
    sourceType: ConsumablesSourceType,
    contents: Uint8Array,
    replaceBatchIds?: ReplacementBatchIds,
  ): Promise<ConsumablesImportResult> {
    if (sourceType === 'salida-consumibles' || sourceType === 'salida-repuestos') {
      const parsedOutputs = await parseOutputsWorkbook(contents, sourceType);
      return this.importOutputRows(
        batchId,
        sourceFileName,
        sourceType,
        parsedOutputs.rows,
        parsedOutputs.skippedOutOfScope,
        replaceBatchIds,
      );
    }
    const parsed = await parseConsumablesWorkbook(contents, sourceType);
    return this.importRows(batchId, sourceFileName, sourceType, parsed.rows, parsed.skippedOutOfScope, replaceBatchIds);
  }

  backfillSourceMetadata(batchId: string, rows: readonly ParsedConsumablesRow[]): number {
    return backfillNormalizedSourceMetadata(
      this.database,
      'consumables_usage_records',
      batchId,
      rows.map((row) => ({
        recordKey: normalizeRecordKey(row.partCode, row.serialNumber.trim(), row.recordedAt),
        sourceDetails: row.sourceDetails,
        sourceOperationalJson: JSON.stringify(row.sourceOperational ?? {}),
        sourceSheetName: row.sourceSheetName,
        sourceRowNumber: row.sourceRowNumber,
      })),
    );
  }

  backfillOutputSourceMetadata(batchId: string, rows: readonly ParsedConsumablesOutputRow[]): number {
    return backfillNormalizedSourceMetadata(
      this.database,
      'consumables_output_records',
      batchId,
      rows.map((row) => ({
        recordKey: normalizeOutputRecordKey(
          row.documentNumber,
          row.partCode,
          row.serialNumber.trim(),
          row.recordedAt,
          row.quantity,
        ),
        sourceDetails: row.sourceDetails,
        sourceOperationalJson: JSON.stringify(row.sourceOperational ?? {}),
        sourceSheetName: row.sourceSheetName,
        sourceRowNumber: row.sourceRowNumber,
      })),
    );
  }

  importRows(
    batchId: string,
    sourceFileName: string,
    sourceType: ConsumablesSourceType,
    rows: readonly ParsedConsumablesRow[],
    skippedOutOfScope = 0,
    replaceBatchIds?: ReplacementBatchIds,
  ): ConsumablesImportResult {
    const batch = this.database
      .prepare('SELECT id, domain FROM import_batches WHERE id = ?')
      .get(batchId) as { id: string; domain: string } | undefined;
    if (!batch) throw new Error(`No existe la importación ${batchId}.`);
    if (batch.domain !== 'consumibles') throw new Error('La importación no pertenece a Consumibles.');
    assertConsumablesReplacement(this.database, batchId, replaceBatchIds, sourceType);

    return this.database.transaction(() => {
      deleteReplacedBatches(this.database, replaceBatchIds);
      const now = new Date().toISOString();
      const findEquipment = this.database.prepare(`
        SELECT
          equipment.id AS equipment_id,
          customer.id AS customer_id,
          contract.id AS contract_id,
          customer.name AS customer_name,
          contract.reference AS contract_reference,
          contract.order_reference AS contract_order_reference,
          contract.commercial_area AS contract_commercial_area,
          contract.division AS contract_division,
          contract.contract_type,
          equipment.serial_number
        FROM contract_equipment equipment
        JOIN contracts contract ON contract.id = equipment.contract_id
        JOIN customers customer ON customer.id = contract.customer_id
        WHERE UPPER(TRIM(COALESCE(equipment.serial_number, ''))) = ?
        ORDER BY equipment.updated_at DESC, equipment.id DESC
        LIMIT 1
      `);
      const findDuplicate = this.database.prepare(
        'SELECT id FROM consumables_usage_records WHERE record_key = ? LIMIT 1',
      );
      const insertRecord = this.database.prepare(`
        INSERT INTO consumables_usage_records (
          id, record_kind, recorded_at, month, model_label, serial_number,
          part_code, description, quantity, cost_usd, source_customer_name,
          source_order_reference, source_unit_price_pyg, source_total_pyg,
          source_operational_json, source_details_json,
          classification, category,
          family, customer_id, contract_id, equipment_id, customer_name,
          contract_reference, contract_order_reference, contract_division,
          contract_type, record_key, source_batch_id,
          source_file_name, source_sheet_name, source_row_number, created_at
        ) VALUES (
          ?, ?, ?, ?, ?, ?, ?, ?, ?, ?,
          ?, ?, ?, ?, ?, ?, ?, ?, ?,
          ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?
        )
      `);

      let accepted = 0;
      let consumables = 0;
      let parts = 0;
      let duplicates = 0;
      let skippedNoEquipment = 0;
      let skippedContract = 0;

      for (const row of rows) {
        const serialNumber = row.serialNumber.trim();
        const recordKey = normalizeRecordKey(row.partCode, serialNumber, row.recordedAt);
        if (findDuplicate.get(recordKey)) {
          duplicates += 1;
          continue;
        }

        const equipment = findEquipment.get(normalizeSerial(serialNumber)) as EquipmentRow | undefined;
        if (!equipment) {
          skippedNoEquipment += 1;
          continue;
        }
        if (!VALID_CONTRACT_TYPES.has(equipment.contract_type)) {
          skippedContract += 1;
          continue;
        }

        insertRecord.run(
          randomUUID(),
          row.recordKind,
          row.recordedAt,
          row.month,
          row.modelLabel,
          serialNumber,
          row.partCode,
          row.description,
          row.quantity,
          row.costUsd,
          row.sourceCustomerName ?? '',
          row.sourceOrderReference ?? '',
          row.sourceUnitPricePyg ?? null,
          row.sourceTotalPyg ?? null,
          serializeSourceOperational(row.sourceOperational),
          serializeSourceDetails(row.sourceDetails),
          row.classification,
          row.category,
          row.family,
          equipment.customer_id,
          equipment.contract_id,
          equipment.equipment_id,
          equipment.customer_name,
          equipment.contract_reference ?? '',
          equipment.contract_order_reference ?? '',
          equipment.contract_division ?? '',
          equipment.contract_type,
          recordKey,
          batchId,
          sourceFileName,
          row.sourceSheetName ?? '',
          row.sourceRowNumber ?? 0,
          now,
        );
        accepted += 1;
        if (row.recordKind === 'consumable') consumables += 1;
        else parts += 1;
      }

      this.database
        .prepare(`
          UPDATE import_batches
          SET status = 'applied', applied_at = ?
          WHERE id = ?
        `)
        .run(now, batchId);

      return {
        sourceType,
        accepted,
        consumables,
        parts,
        duplicates,
        skippedNoEquipment,
        skippedContract,
        skippedOutOfScope,
      };
    })();
  }

  importOutputRows(
    batchId: string,
    sourceFileName: string,
    sourceType: ConsumablesSourceType,
    rows: readonly ParsedConsumablesOutputRow[],
    skippedOutOfScope = 0,
    replaceBatchIds?: ReplacementBatchIds,
  ): ConsumablesImportResult {
    if (sourceType !== 'salida-consumibles' && sourceType !== 'salida-repuestos') {
      throw new Error('La fuente no pertenece a las salidas de Consumibles.');
    }

    const batch = this.database
      .prepare('SELECT id, domain FROM import_batches WHERE id = ?')
      .get(batchId) as { id: string; domain: string } | undefined;
    if (!batch) throw new Error(`No existe la importación ${batchId}.`);
    if (batch.domain !== 'consumibles') throw new Error('La importación no pertenece a Consumibles.');
    assertConsumablesReplacement(this.database, batchId, replaceBatchIds, sourceType);

    return this.database.transaction(() => {
      deleteReplacedBatches(this.database, replaceBatchIds);
      const now = new Date().toISOString();
      const findEquipment = this.database.prepare(`
        SELECT
          equipment.id AS equipment_id,
          customer.id AS customer_id,
          contract.id AS contract_id,
          customer.name AS customer_name,
          contract.reference AS contract_reference,
          contract.order_reference AS contract_order_reference,
          contract.commercial_area AS contract_commercial_area,
          contract.division AS contract_division,
          contract.contract_type,
          equipment.serial_number
        FROM contract_equipment equipment
        JOIN contracts contract ON contract.id = equipment.contract_id
        JOIN customers customer ON customer.id = contract.customer_id
        WHERE UPPER(TRIM(COALESCE(equipment.serial_number, ''))) = ?
        ORDER BY equipment.updated_at DESC, equipment.id DESC
        LIMIT 1
      `);
      const findDuplicate = this.database.prepare(
        'SELECT id FROM consumables_output_records WHERE record_key = ? LIMIT 1',
      );
      const insertRecord = this.database.prepare(`
        INSERT INTO consumables_output_records (
          id, record_kind, document_number, recorded_at, month, model_label,
          serial_number, part_code, description, quantity, yield_pages,
          technician, service_report_number, classification, category, family,
          customer_id, contract_id, equipment_id, customer_name, source_customer_name,
          source_unit_price_pyg, source_total_pyg, source_operational_json, source_details_json,
          contract_reference, contract_order_reference, contract_division,
          contract_type, record_key, source_batch_id,
          source_file_name, source_sheet_name, source_row_number, created_at
        ) VALUES (
          ?, ?, ?, ?, ?, ?, ?, ?, ?, ?,
          ?, ?, ?, ?, ?, ?, ?, ?, ?, ?,
          ?, ?, ?, ?, ?, ?, ?, ?, ?, ?,
          ?, ?, ?, ?, ?
        )
      `);

      let accepted = 0;
      let consumables = 0;
      let parts = 0;
      let duplicates = 0;
      let skippedNoEquipment = 0;
      let skippedContract = 0;

      for (const row of rows) {
        const serialNumber = row.serialNumber.trim();
        const recordKey = normalizeOutputRecordKey(
          row.documentNumber,
          row.partCode,
          serialNumber,
          row.recordedAt,
          row.quantity,
        );
        if (findDuplicate.get(recordKey)) {
          duplicates += 1;
          continue;
        }

        const equipment = findEquipment.get(normalizeSerial(serialNumber)) as EquipmentRow | undefined;
        if (!equipment) {
          skippedNoEquipment += 1;
          continue;
        }
        if (!VALID_CONTRACT_TYPES.has(equipment.contract_type)) {
          skippedContract += 1;
          continue;
        }

        insertRecord.run(
          randomUUID(),
          row.recordKind,
          row.documentNumber,
          row.recordedAt,
          row.month,
          row.modelLabel,
          serialNumber,
          row.partCode,
          row.description,
          row.quantity,
          row.yieldPages,
          row.technician,
          row.serviceReportNumber,
          row.classification,
          row.category,
          row.family,
          equipment.customer_id,
          equipment.contract_id,
          equipment.equipment_id,
          equipment.customer_name,
          row.sourceCustomerName,
          row.sourceUnitPricePyg ?? null,
          row.sourceTotalPyg ?? null,
          serializeOutputSourceOperational(row.sourceOperational),
          serializeSourceDetails(row.sourceDetails),
          equipment.contract_reference ?? '',
          equipment.contract_order_reference ?? '',
          equipment.contract_division ?? '',
          equipment.contract_type,
          recordKey,
          batchId,
          sourceFileName,
          row.sourceSheetName ?? '',
          row.sourceRowNumber ?? 0,
          now,
        );
        accepted += 1;
        if (row.recordKind === 'consumable') consumables += 1;
        else parts += 1;
      }

      this.database
        .prepare(`
          UPDATE import_batches
          SET status = 'applied', applied_at = ?
          WHERE id = ?
        `)
        .run(now, batchId);

      return {
        sourceType,
        accepted,
        consumables,
        parts,
        duplicates,
        skippedNoEquipment,
        skippedContract,
        skippedOutOfScope,
      };
    })();
  }

  getSummary(filters: OperationalFilters = {}): ConsumablesSummary {
    const filter = buildOperationalFilter(filters);
    const row = this.database
      .prepare(`
        SELECT
          COUNT(DISTINCT record.source_batch_id) AS source_files,
          COUNT(record.id) AS records,
          SUM(CASE WHEN record.record_kind = 'consumable' THEN 1 ELSE 0 END) AS consumables,
          SUM(CASE WHEN record.record_kind = 'part' THEN 1 ELSE 0 END) AS parts,
          SUM(CASE WHEN record.classification = 'original' THEN 1 ELSE 0 END) AS original_records,
          SUM(CASE WHEN record.classification = 'compatible' THEN 1 ELSE 0 END) AS compatible_records,
          COUNT(DISTINCT record.equipment_id) AS equipment,
          COALESCE(SUM(record.cost_usd), 0) AS total_cost_usd,
          MIN(NULLIF(record.month, '')) AS first_month,
          MAX(NULLIF(record.month, '')) AS last_month
        FROM consumables_usage_records record
        JOIN import_batches batch ON batch.id = record.source_batch_id
        LEFT JOIN customers customer ON customer.id = record.customer_id
        WHERE batch.domain = 'consumibles' AND batch.status = 'applied'
          ${filter.conditions.length > 0 ? `AND ${filter.conditions.join(' AND ')}` : ''}
      `)
      .get(...filter.parameters) as {
      source_files: number;
      records: number;
      consumables: number | null;
      parts: number | null;
      original_records: number | null;
      compatible_records: number | null;
      equipment: number;
      total_cost_usd: number;
      first_month: string | null;
      last_month: string | null;
    };

    return {
      sourceFiles: row.source_files,
      records: row.records,
      consumables: row.consumables ?? 0,
      parts: row.parts ?? 0,
      originalRecords: row.original_records ?? 0,
      compatibleRecords: row.compatible_records ?? 0,
      equipment: row.equipment,
      totalCostUsd: row.total_cost_usd,
      firstMonth: row.first_month,
      lastMonth: row.last_month,
    };
  }

  getQuantitySummary(filters: OperationalFilters = {}): { originalQuantity: number; compatibleQuantity: number } {
    const filter = buildOperationalFilter(filters);
    const row = this.database.prepare(`
      SELECT
        COALESCE(SUM(CASE WHEN record.classification = 'original' THEN record.quantity ELSE 0 END), 0) AS original_quantity,
        COALESCE(SUM(CASE WHEN record.classification = 'compatible' THEN record.quantity ELSE 0 END), 0) AS compatible_quantity
      FROM consumables_usage_records record
      JOIN import_batches batch ON batch.id = record.source_batch_id
      LEFT JOIN customers customer ON customer.id = record.customer_id
      WHERE batch.domain = 'consumibles' AND batch.status = 'applied'
        AND record.record_kind = 'consumable'
        ${filter.conditions.length > 0 ? `AND ${filter.conditions.join(' AND ')}` : ''}
    `).get(...filter.parameters) as { original_quantity: number; compatible_quantity: number };
    return { originalQuantity: row.original_quantity, compatibleQuantity: row.compatible_quantity };
  }

  getOutputsSummary(filters: OperationalFilters = {}): ConsumablesOutputsSummary {
    const filter = buildOperationalFilter(filters);
    const row = this.database
      .prepare(`
        SELECT
          COUNT(DISTINCT record.source_batch_id) AS source_files,
          COUNT(record.id) AS records,
          SUM(CASE WHEN record.record_kind = 'consumable' THEN 1 ELSE 0 END) AS consumables,
          SUM(CASE WHEN record.record_kind = 'part' THEN 1 ELSE 0 END) AS parts,
          COUNT(DISTINCT record.equipment_id) AS equipment,
          COALESCE(SUM(record.quantity), 0) AS total_quantity,
          MIN(NULLIF(record.month, '')) AS first_month,
          MAX(NULLIF(record.month, '')) AS last_month
        FROM consumables_output_records record
        JOIN import_batches batch ON batch.id = record.source_batch_id
        LEFT JOIN customers customer ON customer.id = record.customer_id
        WHERE batch.domain = 'consumibles' AND batch.status = 'applied'
          ${filter.conditions.length > 0 ? `AND ${filter.conditions.join(' AND ')}` : ''}
      `)
      .get(...filter.parameters) as {
      source_files: number;
      records: number;
      consumables: number | null;
      parts: number | null;
      equipment: number;
      total_quantity: number;
      first_month: string | null;
      last_month: string | null;
    };

    return {
      sourceFiles: row.source_files,
      records: row.records,
      consumables: row.consumables ?? 0,
      parts: row.parts ?? 0,
      equipment: row.equipment,
      totalQuantity: row.total_quantity,
      firstMonth: row.first_month,
      lastMonth: row.last_month,
    };
  }

  listOutputs(query: ConsumablesOutputQuery = {}): ConsumablesOutputRecord[] {
    const { conditions, parameters } = buildOutputRecordFilter(query);
    const limit = Number.isInteger(query.limit) ? Math.max(1, Math.min(10000, query.limit!)) : 500;
    const offset = Number.isInteger(query.offset) ? Math.max(0, query.offset!) : 0;
    parameters.push(limit, offset);
    const rows = this.database
      .prepare(`
        SELECT
          record.id, record.record_kind, record.document_number,
          record.recorded_at, record.month, record.model_label,
          record.serial_number, record.part_code, record.description,
          record.quantity, record.yield_pages, record.technician,
          record.service_report_number, record.classification, record.category,
          record.family, record.customer_id, record.contract_id,
          record.equipment_id, record.customer_name,
          customer.customer_type, customer.commercial_area,
          record.source_customer_name,
          record.source_unit_price_pyg, record.source_total_pyg, record.source_operational_json, record.source_details_json,
          record.contract_reference, record.contract_order_reference, contract.commercial_area AS contract_commercial_area, record.contract_division,
          record.contract_type, batch.source_type AS source_type, record.source_file_name,
          record.source_sheet_name, record.source_row_number
        FROM consumables_output_records record
        JOIN import_batches batch ON batch.id = record.source_batch_id
        LEFT JOIN customers customer ON customer.id = record.customer_id
        LEFT JOIN contracts contract ON contract.id = record.contract_id
        WHERE ${conditions.join(' AND ')}
        ORDER BY CASE WHEN record.recorded_at = '' THEN 1 ELSE 0 END,
          record.recorded_at DESC, record.id DESC
        LIMIT ? OFFSET ?
      `)
      .all(...parameters) as OutputRecordRow[];

    return rows.map((row) => ({
      id: row.id,
      recordKind: row.record_kind,
      documentNumber: row.document_number,
      recordedAt: row.recorded_at,
      month: row.month,
      modelLabel: row.model_label,
      serialNumber: row.serial_number,
      partCode: row.part_code,
      description: row.description,
      quantity: row.quantity,
      yieldPages: row.yield_pages,
      technician: row.technician,
      serviceReportNumber: row.service_report_number,
      sourceCustomerName: row.source_customer_name,
      sourceUnitPricePyg: row.source_unit_price_pyg,
      sourceTotalPyg: row.source_total_pyg,
      ...withOutputSourceOperational(row.source_operational_json),
      sourceDetails: parseSourceDetails(row.source_details_json),
      classification: row.classification,
      category: row.category,
      family: row.family,
      customerName: row.customer_name,
      customerType: row.customer_type ?? '',
      commercialArea: row.commercial_area ?? '',
      contractReference: row.contract_reference,
      orderReference: row.contract_order_reference,
      contractCommercialArea: row.contract_commercial_area ?? '',
      division: row.contract_division,
      contractType: row.contract_type,
      equipmentId: row.equipment_id,
      sourceType: parseConsumablesSourceType(row.source_type),
      sourceFileName: row.source_file_name,
      sourceSheetName: row.source_sheet_name,
      sourceRowNumber: row.source_row_number,
    }));
  }

  listOutputsPage(query: ConsumablesOutputQuery & PageRequest): PaginatedResult<ConsumablesOutputRecord> {
    const total = this.countOutputs(query);
    const totalPages = Math.ceil(total / query.pageSize);
    const page = totalPages === 0 ? 1 : Math.min(query.page, totalPages);
    return {
      items: this.listOutputs({ ...query, limit: query.pageSize, offset: (page - 1) * query.pageSize }),
      total,
      page,
      pageSize: query.pageSize,
      totalPages,
    };
  }

  private countOutputs(query: ConsumablesOutputQuery): number {
    const { conditions, parameters } = buildOutputRecordFilter(query);
    const row = this.database.prepare(`
      SELECT COUNT(record.id) AS total
      FROM consumables_output_records record
      JOIN import_batches batch ON batch.id = record.source_batch_id
      LEFT JOIN customers customer ON customer.id = record.customer_id
      LEFT JOIN contracts contract ON contract.id = record.contract_id
      WHERE ${conditions.join(' AND ')}
    `).get(...parameters) as { total: number };
    return row.total;
  }

  getAnalytics(filters: OperationalFilters = {}): ConsumablesAnalytics {
    const filter = buildOperationalFilter(filters);
    const appliedRecords = `
      FROM consumables_usage_records record
      JOIN import_batches batch ON batch.id = record.source_batch_id
      LEFT JOIN customers customer ON customer.id = record.customer_id
      LEFT JOIN contracts contract ON contract.id = record.contract_id
      WHERE batch.domain = 'consumibles' AND batch.status = 'applied'
        ${filter.conditions.length > 0 ? `AND ${filter.conditions.join(' AND ')}` : ''}
    `;
    const aggregateSelect = `
      COUNT(record.id) AS records,
      COALESCE(SUM(record.quantity), 0) AS quantity,
      COALESCE(SUM(record.cost_usd), 0) AS cost_usd,
      SUM(CASE WHEN record.classification = 'original' THEN 1 ELSE 0 END) AS original_records,
      SUM(CASE WHEN record.classification = 'compatible' THEN 1 ELSE 0 END) AS compatible_records,
      COUNT(DISTINCT record.equipment_id) AS equipment
    `;
    const appliedOutputs = `
      FROM consumables_output_records record
      JOIN import_batches batch ON batch.id = record.source_batch_id
      LEFT JOIN customers customer ON customer.id = record.customer_id
      LEFT JOIN contracts contract ON contract.id = record.contract_id
      WHERE batch.domain = 'consumibles' AND batch.status = 'applied'
        ${filter.conditions.length > 0 ? `AND ${filter.conditions.join(' AND ')}` : ''}
    `;
    const monthlyRows = this.database
      .prepare(`
        SELECT
          record.month AS key,
          CASE WHEN record.month = '' THEN 'Sin fecha' ELSE record.month END AS label,
          ${aggregateSelect}
        ${appliedRecords}
        GROUP BY record.month
        ORDER BY CASE WHEN record.month = '' THEN 1 ELSE 0 END, record.month
      `)
      .all(...filter.parameters) as AggregateRow[];
    const familyRows = this.database
      .prepare(`
        SELECT
          record.family AS key,
          record.family AS label,
          ${aggregateSelect}
        ${appliedRecords}
        GROUP BY record.family
        ORDER BY cost_usd DESC, records DESC, key
      `)
      .all(...filter.parameters) as AggregateRow[];
    const categoryRows = this.database
      .prepare(`
        SELECT
          record.category AS key,
          record.category AS label,
          ${aggregateSelect}
        ${appliedRecords}
        GROUP BY record.category
        ORDER BY cost_usd DESC, records DESC, key
      `)
      .all(...filter.parameters) as AggregateRow[];
    const equipmentRows = this.database
      .prepare(`
        SELECT
          record.equipment_id AS key,
          record.equipment_id,
          record.customer_name,
          record.model_label,
          record.serial_number,
          record.customer_name || ' · ' || record.serial_number AS label,
          ${aggregateSelect}
        ${appliedRecords}
        GROUP BY record.equipment_id, record.customer_name, record.model_label, record.serial_number
        ORDER BY cost_usd DESC, quantity DESC, label
        LIMIT 10
      `)
      .all(...filter.parameters) as EquipmentAggregateRow[];
    const contractRows = this.database
      .prepare(`
        SELECT
          record.contract_id AS key,
          CASE WHEN record.contract_reference = '' THEN 'Sin referencia' ELSE record.contract_reference END AS reference,
          record.contract_order_reference AS order_reference,
          contract.commercial_area AS contract_commercial_area,
          record.contract_division AS division,
          record.customer_name,
          record.contract_type,
          COUNT(record.id) AS records,
          COALESCE(SUM(record.quantity), 0) AS quantity,
          COALESCE(SUM(record.cost_usd), 0) AS cost_usd,
          COALESCE(SUM(CASE WHEN record.record_kind = 'consumable' THEN record.cost_usd ELSE 0 END), 0) AS consumable_cost_usd,
          COALESCE(SUM(CASE WHEN record.record_kind = 'part' THEN record.cost_usd ELSE 0 END), 0) AS part_cost_usd,
          SUM(CASE WHEN record.record_kind = 'consumable' THEN 1 ELSE 0 END) AS consumable_records,
          SUM(CASE WHEN record.record_kind = 'part' THEN 1 ELSE 0 END) AS part_records,
          SUM(CASE WHEN record.classification = 'original' THEN 1 ELSE 0 END) AS original_records,
          SUM(CASE WHEN record.classification = 'compatible' THEN 1 ELSE 0 END) AS compatible_records,
          COUNT(DISTINCT record.equipment_id) AS equipment
        ${appliedRecords}
        GROUP BY record.contract_id, record.contract_reference, record.contract_order_reference,
          contract.commercial_area, record.contract_division, record.customer_name, record.contract_type
        ORDER BY cost_usd DESC, records DESC, customer_name, reference
      `)
      .all(...filter.parameters) as ContractAggregateRow[];
    const dispatchEquipmentRows = this.database
      .prepare(`
        SELECT
          record.equipment_id AS key,
          record.equipment_id,
          record.customer_name,
          record.model_label,
          record.serial_number,
          record.contract_reference,
          record.contract_order_reference,
          contract.commercial_area AS contract_commercial_area,
          record.contract_division,
          record.contract_type,
          COUNT(record.id) AS records,
          SUM(CASE WHEN record.record_kind = 'consumable' THEN 1 ELSE 0 END) AS consumable_records,
          SUM(CASE WHEN record.record_kind = 'part' THEN 1 ELSE 0 END) AS part_records,
          COALESCE(SUM(CASE WHEN record.record_kind = 'consumable' THEN record.quantity ELSE 0 END), 0) AS consumable_quantity,
          COALESCE(SUM(CASE WHEN record.record_kind = 'part' THEN record.quantity ELSE 0 END), 0) AS part_quantity,
          SUM(CASE WHEN record.classification = 'original' THEN 1 ELSE 0 END) AS original_records,
          SUM(CASE WHEN record.classification = 'compatible' THEN 1 ELSE 0 END) AS compatible_records,
          MAX(NULLIF(record.recorded_at, '')) AS last_recorded_at
        ${appliedOutputs}
        GROUP BY
          record.equipment_id,
          record.customer_name,
          record.model_label,
          record.serial_number,
          record.contract_reference,
          record.contract_order_reference,
          contract.commercial_area,
          record.contract_division,
          record.contract_type
        ORDER BY records DESC, last_recorded_at DESC, record.customer_name, record.serial_number
        LIMIT 100
      `)
      .all(...filter.parameters) as DispatchEquipmentAggregateRow[];

    return {
      monthly: monthlyRows.map(toAggregate),
      families: familyRows.map(toAggregate),
      categories: categoryRows.map(toAggregate),
      topEquipment: equipmentRows.map((row) => ({
        ...toAggregate(row),
        equipmentId: row.equipment_id,
        customerName: row.customer_name,
        modelLabel: row.model_label,
        serialNumber: row.serial_number,
      })),
      contracts: contractRows.map(toContractAggregate),
      dispatchEquipment: dispatchEquipmentRows.map(toDispatchEquipmentAggregate),
    };
  }

  listRecords(query: ConsumablesQuery = {}): ConsumablesRecord[] {
    const { conditions, parameters } = buildUsageRecordFilter(query);
    const limit = Number.isInteger(query.limit) ? Math.max(1, Math.min(10000, query.limit!)) : 500;
    const offset = Number.isInteger(query.offset) ? Math.max(0, query.offset!) : 0;
    parameters.push(limit, offset);
    const rows = this.database
      .prepare(`
        SELECT
          record.id, record.record_kind, record.recorded_at, record.month,
          record.model_label, record.serial_number, record.part_code,
          record.description, record.quantity, record.cost_usd,
          record.source_customer_name, record.source_order_reference,
          record.source_unit_price_pyg, record.source_total_pyg,
          record.source_operational_json, record.source_details_json,
          record.classification, record.category, record.family,
          record.customer_id, record.contract_id, record.equipment_id,
          record.customer_name, customer.customer_type, customer.commercial_area,
          record.contract_reference, record.contract_order_reference, contract.commercial_area AS contract_commercial_area, record.contract_division,
          record.contract_type,
          batch.source_type AS source_type, record.source_file_name, record.source_sheet_name, record.source_row_number
        FROM consumables_usage_records record
        JOIN import_batches batch ON batch.id = record.source_batch_id
        LEFT JOIN customers customer ON customer.id = record.customer_id
        LEFT JOIN contracts contract ON contract.id = record.contract_id
        WHERE ${conditions.join(' AND ')}
        ORDER BY record.recorded_at DESC, record.id DESC
        LIMIT ? OFFSET ?
      `)
      .all(...parameters) as RecordRow[];

    return rows.map((row) => ({
      id: row.id,
      recordKind: row.record_kind,
      recordedAt: row.recorded_at,
      month: row.month,
      modelLabel: row.model_label,
      serialNumber: row.serial_number,
      partCode: row.part_code,
      description: row.description,
      quantity: row.quantity,
      costUsd: row.cost_usd,
      classification: row.classification,
      category: row.category,
      family: row.family,
      customerName: row.customer_name,
      customerType: row.customer_type ?? '',
      commercialArea: row.commercial_area ?? '',
      contractReference: row.contract_reference,
      orderReference: row.contract_order_reference,
      contractCommercialArea: row.contract_commercial_area ?? '',
      division: row.contract_division,
      contractType: row.contract_type,
      equipmentId: row.equipment_id,
      sourceCustomerName: row.source_customer_name,
      sourceOrderReference: row.source_order_reference,
      sourceUnitPricePyg: row.source_unit_price_pyg,
      sourceTotalPyg: row.source_total_pyg,
      ...withSourceOperational(row.source_operational_json),
      sourceDetails: parseSourceDetails(row.source_details_json),
      sourceType: parseConsumablesSourceType(row.source_type),
      sourceFileName: row.source_file_name,
      sourceSheetName: row.source_sheet_name,
      sourceRowNumber: row.source_row_number,
    }));
  }

  listRecordsPage(query: ConsumablesQuery & PageRequest): PaginatedResult<ConsumablesRecord> {
    const total = this.countRecords(query);
    const totalPages = Math.ceil(total / query.pageSize);
    const page = totalPages === 0 ? 1 : Math.min(query.page, totalPages);
    return {
      items: this.listRecords({ ...query, limit: query.pageSize, offset: (page - 1) * query.pageSize }),
      total,
      page,
      pageSize: query.pageSize,
      totalPages,
    };
  }

  private countRecords(query: ConsumablesQuery): number {
    const { conditions, parameters } = buildUsageRecordFilter(query);
    const row = this.database.prepare(`
      SELECT COUNT(record.id) AS total
      FROM consumables_usage_records record
      JOIN import_batches batch ON batch.id = record.source_batch_id
      LEFT JOIN customers customer ON customer.id = record.customer_id
      LEFT JOIN contracts contract ON contract.id = record.contract_id
      WHERE ${conditions.join(' AND ')}
    `).get(...parameters) as { total: number };
    return row.total;
  }
}

function buildOutputRecordFilter(query: ConsumablesOutputQuery): { conditions: string[]; parameters: Array<string | number> } {
  const conditions = ["batch.domain = 'consumibles'", "batch.status = 'applied'"];
  const parameters: Array<string | number> = [];
  if (query.kind) {
    conditions.push('record.record_kind = ?');
    parameters.push(query.kind);
  }
  if (query.query?.trim()) {
    const value = `%${query.query.trim().toLocaleLowerCase()}%`;
    conditions.push(`(
      lower(record.model_label) LIKE ? OR lower(record.serial_number) LIKE ?
      OR lower(record.part_code) LIKE ? OR lower(record.description) LIKE ?
      OR lower(record.customer_name) LIKE ? OR lower(record.source_customer_name) LIKE ?
      OR lower(COALESCE(customer.customer_type, '')) LIKE ?
      OR lower(COALESCE(customer.commercial_area, '')) LIKE ?
      OR lower(record.contract_reference) LIKE ? OR lower(record.contract_order_reference) LIKE ?
      OR lower(COALESCE(contract.commercial_area, '')) LIKE ?
      OR lower(record.contract_division) LIKE ?
      OR lower(record.technician) LIKE ? OR lower(record.source_operational_json) LIKE ? OR lower(record.source_details_json) LIKE ?
      OR lower(COALESCE(batch.source_type, '')) LIKE ?
    )`);
    parameters.push(...Array(16).fill(value));
  }
  const filter = buildOperationalFilter(query);
  conditions.push(...filter.conditions);
  parameters.push(...filter.parameters);
  return { conditions, parameters };
}

function buildUsageRecordFilter(query: ConsumablesQuery): { conditions: string[]; parameters: Array<string | number> } {
  const conditions = ["batch.domain = 'consumibles'", "batch.status = 'applied'"];
  const parameters: Array<string | number> = [];
  if (query.kind) {
    conditions.push('record.record_kind = ?');
    parameters.push(query.kind);
  }
  if (query.query?.trim()) {
    const value = `%${query.query.trim().toLocaleLowerCase()}%`;
    conditions.push(`(
      lower(record.model_label) LIKE ? OR lower(record.serial_number) LIKE ?
      OR lower(record.part_code) LIKE ? OR lower(record.description) LIKE ?
      OR lower(record.customer_name) LIKE ? OR lower(COALESCE(customer.customer_type, '')) LIKE ?
      OR lower(COALESCE(customer.commercial_area, '')) LIKE ?
      OR lower(record.contract_reference) LIKE ? OR lower(record.contract_order_reference) LIKE ?
      OR lower(record.contract_division) LIKE ? OR lower(COALESCE(contract.commercial_area, '')) LIKE ?
      OR lower(record.source_operational_json) LIKE ?
      OR lower(record.source_details_json) LIKE ?
      OR lower(COALESCE(batch.source_type, '')) LIKE ?
      OR lower(CASE batch.source_type
        WHEN 'consumibles' THEN 'fuente: detalle de consumibles'
        WHEN 'repuestos' THEN 'fuente: detalle de repuestos'
        WHEN 'uso-repuestos' THEN 'fuente: uso de repuestos'
        WHEN 'salida-consumibles' THEN 'fuente: salida de consumibles'
        WHEN 'salida-repuestos' THEN 'fuente: salida de repuestos'
        ELSE '' END) LIKE ?
    )`);
    parameters.push(...Array(15).fill(value));
  }
  const filter = buildOperationalFilter(query);
  conditions.push(...filter.conditions);
  parameters.push(...filter.parameters);
  return { conditions, parameters };
}

const SOURCE_OPERATIONAL_KEYS = [
  'cabId',
  'division',
  'dispatchNumber',
  'technician',
  'branch',
  'dataReference',
  'sourceSector',
  'sourceCommercialArea',
  'sourceContractReference',
  'active',
  'contractType',
  'contractStartsAt',
  'contractEndsAt',
  'serviceReportNumber',
  'taskCompleted',
  'partsUsed',
] as const satisfies readonly (keyof ConsumablesSourceOperational)[];

const OUTPUT_SOURCE_OPERATIONAL_KEYS = [
  'yieldPerUnit',
  'observations',
  'contact',
  'sourceSector',
  'sourceCommercialArea',
  'sourceContract',
] as const satisfies readonly (keyof ConsumablesOutputSourceOperational)[];

function serializeSourceOperational(value: ConsumablesSourceOperational | undefined): string {
  return JSON.stringify(value ?? {});
}

function serializeOutputSourceOperational(value: ConsumablesOutputSourceOperational | undefined): string {
  return JSON.stringify(value ?? {});
}

function parseConsumablesSourceType(value: string | null | undefined): ConsumablesSourceType | null {
  return value && CONSUMABLES_SOURCE_TYPES.includes(value as ConsumablesSourceType)
    ? value as ConsumablesSourceType
    : null;
}

function withSourceOperational(value: string | null | undefined): { sourceOperational?: ConsumablesSourceOperational } {
  if (!value) return {};

  try {
    const parsed = JSON.parse(value) as unknown;
    if (typeof parsed !== 'object' || parsed === null || Array.isArray(parsed)) return {};
    const entries = SOURCE_OPERATIONAL_KEYS.flatMap((key) => {
      const field = (parsed as Record<string, unknown>)[key];
      return typeof field === 'string' && field.trim() ? [[key, field.trim()] as const] : [];
    });
    return entries.length > 0 ? { sourceOperational: Object.fromEntries(entries) as ConsumablesSourceOperational } : {};
  } catch {
    return {};
  }
}

function withOutputSourceOperational(value: string | null | undefined): { sourceOperational?: ConsumablesOutputSourceOperational } {
  if (!value) return {};

  try {
    const parsed = JSON.parse(value) as unknown;
    if (typeof parsed !== 'object' || parsed === null || Array.isArray(parsed)) return {};
    const entries = OUTPUT_SOURCE_OPERATIONAL_KEYS.flatMap((key) => {
      const field = (parsed as Record<string, unknown>)[key];
      return typeof field === 'string' && field.trim() ? [[key, field.trim()] as const] : [];
    });
    return entries.length > 0 ? { sourceOperational: Object.fromEntries(entries) as ConsumablesOutputSourceOperational } : {};
  } catch {
    return {};
  }
}

function toAggregate(row: AggregateRow): ConsumablesAggregate {
  return {
    key: row.key,
    label: row.label,
    records: row.records,
    quantity: row.quantity,
    costUsd: row.cost_usd,
    originalRecords: row.original_records,
    compatibleRecords: row.compatible_records,
    equipment: row.equipment,
  };
}

function toContractAggregate(row: ContractAggregateRow): ConsumablesContractAggregate {
  return {
    key: row.key,
    reference: row.reference,
    orderReference: row.order_reference,
    contractCommercialArea: row.contract_commercial_area ?? '',
    division: row.division,
    customerName: row.customer_name,
    contractType: row.contract_type,
    records: row.records,
    quantity: row.quantity,
    costUsd: row.cost_usd,
    consumableCostUsd: row.consumable_cost_usd,
    partCostUsd: row.part_cost_usd,
    consumableRecords: row.consumable_records,
    partRecords: row.part_records,
    originalRecords: row.original_records,
    compatibleRecords: row.compatible_records,
    equipment: row.equipment,
  };
}

function toDispatchEquipmentAggregate(row: DispatchEquipmentAggregateRow): ConsumablesDispatchEquipmentAggregate {
  return {
    key: row.key,
    equipmentId: row.equipment_id,
    customerName: row.customer_name,
    modelLabel: row.model_label,
    serialNumber: row.serial_number,
    contractReference: row.contract_reference,
    orderReference: row.contract_order_reference,
    contractCommercialArea: row.contract_commercial_area ?? '',
    division: row.contract_division,
    contractType: row.contract_type,
    records: row.records,
    consumableRecords: row.consumable_records,
    partRecords: row.part_records,
    consumableQuantity: row.consumable_quantity,
    partQuantity: row.part_quantity,
    originalRecords: row.original_records,
    compatibleRecords: row.compatible_records,
    lastRecordedAt: row.last_recorded_at ?? '',
  };
}

function assertConsumablesReplacement(
  database: SuiteDatabase,
  batchId: string,
  replaceBatchIds: ReplacementBatchIds,
  sourceType: ConsumablesSourceType,
): void {
  for (const replaceBatchId of normalizeReplacementBatchIds(replaceBatchIds)) {
    if (replaceBatchId === batchId) throw new Error('La carga nueva no puede reemplazarse a sí misma.');

    const replacement = database
      .prepare('SELECT id, domain, source_type, status FROM import_batches WHERE id = ?')
      .get(replaceBatchId) as { id: string; domain: string; source_type: string | null; status: string } | undefined;
    if (!replacement) throw new Error('La carga anterior de Consumibles no existe.');
    if (replacement.domain !== 'consumibles' || replacement.source_type !== sourceType || replacement.status !== 'applied') {
      throw new Error('La carga anterior no pertenece a la misma fuente aplicada.');
    }
  }
}

function deleteReplacedBatches(database: SuiteDatabase, replaceBatchIds: ReplacementBatchIds): void {
  const deleteBatch = database.prepare('DELETE FROM import_batches WHERE id = ?');
  for (const replaceBatchId of normalizeReplacementBatchIds(replaceBatchIds)) {
    deleteBatch.run(replaceBatchId);
  }
}

function normalizeReplacementBatchIds(replaceBatchIds: ReplacementBatchIds): readonly string[] {
  if (!replaceBatchIds) return [];
  return typeof replaceBatchIds === 'string' ? [replaceBatchIds] : replaceBatchIds;
}
