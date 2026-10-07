import { randomUUID } from 'node:crypto';
import type { SuiteDatabase } from '../../db/database';
import { MAX_LIST_LIMIT } from '../../core/list-limit';
import { buildOperationalFilter, type OperationalFilters } from '../../core/operational-filters';
import type { PageRequest, PaginatedResult } from '../../core/pagination';
import { parseSourceDetails, serializeSourceDetails, type SourceDetail } from '../../core/source-details';
import { backfillNormalizedSourceMetadata } from '../../core/source-metadata';
import { normalizeSerial } from '../../core/serial';
import { parseServicesWorkbook } from './parser';
import type {
  ParsedServiceRow,
  ServiceImportResult,
  ServiceRecord,
  ServiceSourceOperational,
  ServiceSummary,
} from './types';

export type ServiceQuery = OperationalFilters & {
  query?: string;
  taskType?: string;
  limit?: number;
  offset?: number;
};

type EquipmentRow = {
  equipment_id: string;
  customer_id: string;
  contract_id: string;
  customer_name: string;
  contract_reference: string | null;
  contract_type: string;
};

type ServiceRecordRow = {
  id: string;
  service_number: number;
  order_reference: string;
  recorded_at: string;
  month: string;
  service_type: string;
  task_type: string;
  source_contract_type: string;
  technician: string;
  task_completed: string;
  parts_used: string;
  model_label: string;
  serial_number: string;
  family: 'T03' | 'T06' | 'GPR53';
  customer_id: string | null;
  contract_id: string | null;
  equipment_id: string;
  customer_name: string;
  customer_type: string | null;
  commercial_area: string | null;
  source_customer_name: string;
  contract_reference: string;
  contract_type: string;
  source_details_json: string;
  source_operational_json: string;
  source_file_name: string;
  source_sheet_name: string;
  source_row_number: number;
};

type TaskTypeRow = {
  key: string;
  records: number;
};

const VALID_CONTRACT_TYPES = new Set(['Alquiler', 'Leasing', 'Mantenimiento']);
type ReplacementBatchIds = string | readonly string[] | undefined;

export class ServiceRepository {
  constructor(private readonly database: SuiteDatabase) {}

  async importWorkbook(
    batchId: string,
    sourceFileName: string,
    contents: Uint8Array,
    replaceBatchIds?: ReplacementBatchIds,
  ): Promise<ServiceImportResult> {
    const parsed = await parseServicesWorkbook(contents);
    return this.importRows(batchId, sourceFileName, parsed.rows, parsed.skippedOutOfScope, replaceBatchIds);
  }

  backfillSourceMetadata(batchId: string, rows: readonly ParsedServiceRow[]): number {
    return backfillNormalizedSourceMetadata(
      this.database,
      'service_records',
      batchId,
      rows.map((row) => ({
        recordKey: normalizeServiceRecordKey(row),
        sourceDetails: row.sourceDetails,
        sourceOperationalJson: serializeServiceOperational(row.sourceOperational),
        sourceSheetName: row.sourceSheetName,
        sourceRowNumber: row.sourceRowNumber,
      })),
    );
  }

  importRows(
    batchId: string,
    sourceFileName: string,
    rows: readonly ParsedServiceRow[],
    skippedOutOfScope = 0,
    replaceBatchIds?: ReplacementBatchIds,
  ): ServiceImportResult {
    const batch = this.database
      .prepare('SELECT id, domain FROM import_batches WHERE id = ?')
      .get(batchId) as { id: string; domain: string } | undefined;
    if (!batch) throw new Error(`No existe la importación ${batchId}.`);
    if (batch.domain !== 'services') throw new Error('La importación no pertenece a Servicios.');
    assertServiceReplacement(this.database, batchId, replaceBatchIds);

    return this.database.transaction(() => {
      const deleteBatch = this.database.prepare('DELETE FROM import_batches WHERE id = ?');
      for (const replaceBatchId of normalizeReplacementBatchIds(replaceBatchIds)) {
        deleteBatch.run(replaceBatchId);
      }
      const now = new Date().toISOString();
      const findEquipment = this.database.prepare(`
        SELECT
          equipment.id AS equipment_id,
          customer.id AS customer_id,
          contract.id AS contract_id,
          customer.name AS customer_name,
          contract.reference AS contract_reference,
          contract.contract_type
        FROM contract_equipment equipment
        JOIN contracts contract ON contract.id = equipment.contract_id
        JOIN customers customer ON customer.id = contract.customer_id
        WHERE UPPER(TRIM(COALESCE(equipment.serial_number, ''))) = ?
        ORDER BY equipment.updated_at DESC, equipment.id DESC
        LIMIT 1
      `);
      const findDuplicate = this.database.prepare(
        'SELECT id FROM service_records WHERE record_key = ? LIMIT 1',
      );
      const insertRecord = this.database.prepare(`
        INSERT INTO service_records (
          id, service_number, order_reference, recorded_at, month,
          service_type, task_type, source_contract_type, technician,
          task_completed, parts_used, model_label, serial_number, family,
          customer_id, contract_id, equipment_id, customer_name,
          source_customer_name, contract_reference, contract_type, record_key,
          source_batch_id, source_file_name, source_sheet_name, source_row_number,
          source_details_json, source_operational_json, created_at
        ) VALUES (
          ?, ?, ?, ?, ?, ?, ?, ?, ?, ?,
          ?, ?, ?, ?, ?, ?, ?, ?, ?, ?,
          ?, ?, ?, ?, ?, ?, ?, ?, ?
        )
      `);

      let accepted = 0;
      let duplicates = 0;
      let skippedNoEquipment = 0;
      let skippedContract = 0;

      for (const row of rows) {
        const recordKey = normalizeServiceRecordKey(row);
        if (findDuplicate.get(recordKey)) {
          duplicates += 1;
          continue;
        }

        const equipment = findEquipment.get(normalizeSerial(row.serialNumber)) as EquipmentRow | undefined;
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
          row.serviceNumber,
          row.orderReference,
          row.recordedAt,
          row.month,
          row.serviceType,
          row.taskType,
          row.sourceContractType,
          row.technician,
          row.taskCompleted,
          row.partsUsed,
          row.modelLabel,
          row.serialNumber,
          row.family,
          equipment.customer_id,
          equipment.contract_id,
          equipment.equipment_id,
          equipment.customer_name,
          row.sourceCustomerName,
          equipment.contract_reference ?? '',
          equipment.contract_type,
          recordKey,
          batchId,
          sourceFileName,
          row.sourceSheetName ?? '',
          row.sourceRowNumber ?? 0,
          serializeSourceDetails(row.sourceDetails),
          serializeServiceOperational(row.sourceOperational),
          now,
        );
        accepted += 1;
      }

      this.database
        .prepare(`
          UPDATE import_batches
          SET status = 'applied', applied_at = ?
          WHERE id = ?
        `)
        .run(now, batchId);

      return {
        sourceType: 'servicios' as const,
        accepted,
        duplicates,
        skippedNoEquipment,
        skippedContract,
        skippedOutOfScope,
      };
    })();
  }

  getSummary(filters: OperationalFilters = {}): ServiceSummary {
    const filter = buildOperationalFilter(filters);
    const summary = this.database
      .prepare(`
        SELECT
          COUNT(DISTINCT record.source_batch_id) AS source_files,
          COUNT(record.id) AS records,
          COUNT(DISTINCT record.equipment_id) AS equipment,
          MIN(NULLIF(record.month, '')) AS first_month,
          MAX(NULLIF(record.month, '')) AS last_month
        FROM service_records record
        JOIN import_batches batch ON batch.id = record.source_batch_id
        LEFT JOIN customers customer ON customer.id = record.customer_id
        WHERE batch.domain = 'services' AND batch.status = 'applied'
          ${filter.conditions.length > 0 ? `AND ${filter.conditions.join(' AND ')}` : ''}
      `)
      .get(...filter.parameters) as {
      source_files: number;
      records: number;
      equipment: number;
      first_month: string | null;
      last_month: string | null;
    };
    const taskTypes = this.database
      .prepare(`
        SELECT
          CASE WHEN record.task_type = '' THEN 'Sin especificar' ELSE record.task_type END AS key,
          COUNT(record.id) AS records
        FROM service_records record
        JOIN import_batches batch ON batch.id = record.source_batch_id
        LEFT JOIN customers customer ON customer.id = record.customer_id
        WHERE batch.domain = 'services' AND batch.status = 'applied'
          ${filter.conditions.length > 0 ? `AND ${filter.conditions.join(' AND ')}` : ''}
        GROUP BY record.task_type
        ORDER BY records DESC, key
      `)
      .all(...filter.parameters) as TaskTypeRow[];

    return {
      sourceFiles: summary.source_files,
      records: summary.records,
      equipment: summary.equipment,
      firstMonth: summary.first_month,
      lastMonth: summary.last_month,
      taskTypes,
    };
  }

  list(query: ServiceQuery = {}): ServiceRecord[] {
    const { conditions, parameters } = buildServiceRecordFilter(query);
    const limit = Number.isInteger(query.limit) ? Math.max(1, Math.min(MAX_LIST_LIMIT, query.limit!)) : 500;
    const offset = Number.isInteger(query.offset) ? Math.max(0, query.offset!) : 0;
    parameters.push(limit, offset);
    const rows = this.database
      .prepare(`
        SELECT
          record.id, record.service_number, record.order_reference,
          record.recorded_at, record.month, record.service_type,
          record.task_type, record.source_contract_type, record.technician,
          record.task_completed, record.parts_used, record.model_label,
          record.serial_number, record.family, record.customer_id,
          record.contract_id, record.equipment_id, record.customer_name,
          customer.customer_type, customer.commercial_area,
          record.source_customer_name, record.contract_reference,
          record.contract_type, record.source_file_name,
          record.source_sheet_name, record.source_row_number,
          record.source_details_json, record.source_operational_json
        FROM service_records record
        JOIN import_batches batch ON batch.id = record.source_batch_id
        LEFT JOIN customers customer ON customer.id = record.customer_id
        WHERE ${conditions.join(' AND ')}
        ORDER BY CASE WHEN record.recorded_at = '' THEN 1 ELSE 0 END,
          record.recorded_at DESC, record.id DESC
        LIMIT ? OFFSET ?
      `)
      .all(...parameters) as ServiceRecordRow[];

    return rows.map((row) => ({
      id: row.id,
      serviceNumber: row.service_number,
      orderReference: row.order_reference,
      recordedAt: row.recorded_at,
      month: row.month,
      serviceType: row.service_type,
      taskType: row.task_type,
      sourceContractType: row.source_contract_type,
      technician: row.technician,
      taskCompleted: row.task_completed,
      partsUsed: row.parts_used,
      modelLabel: row.model_label,
      serialNumber: row.serial_number,
      sourceCustomerName: row.source_customer_name,
      family: row.family,
      customerName: row.customer_name,
      customerType: row.customer_type ?? '',
      commercialArea: row.commercial_area ?? '',
      contractReference: row.contract_reference,
      contractType: row.contract_type,
      equipmentId: row.equipment_id,
      sourceFileName: row.source_file_name,
      ...withServiceOperational(row.source_operational_json, parseSourceDetails(row.source_details_json)),
      sourceDetails: parseSourceDetails(row.source_details_json),
      sourceSheetName: row.source_sheet_name,
      sourceRowNumber: row.source_row_number,
    }));
  }

  listPage(query: ServiceQuery & PageRequest): PaginatedResult<ServiceRecord> {
    const total = this.count(query);
    const totalPages = Math.ceil(total / query.pageSize);
    const page = totalPages === 0 ? 1 : Math.min(query.page, totalPages);
    return {
      items: this.list({ ...query, limit: query.pageSize, offset: (page - 1) * query.pageSize }),
      total,
      page,
      pageSize: query.pageSize,
      totalPages,
    };
  }

  private count(query: ServiceQuery): number {
    const { conditions, parameters } = buildServiceRecordFilter(query);
    const row = this.database.prepare(`
      SELECT COUNT(record.id) AS total
      FROM service_records record
      JOIN import_batches batch ON batch.id = record.source_batch_id
      LEFT JOIN customers customer ON customer.id = record.customer_id
      WHERE ${conditions.join(' AND ')}
    `).get(...parameters) as { total: number };
    return row.total;
  }
}

function buildServiceRecordFilter(query: ServiceQuery): { conditions: string[]; parameters: Array<string | number> } {
  const conditions = ["batch.domain = 'services'", "batch.status = 'applied'"];
  const parameters: Array<string | number> = [];
  if (query.taskType?.trim()) {
    conditions.push('record.task_type = ?');
    parameters.push(query.taskType.trim());
  }
  if (query.query?.trim()) {
    const value = `%${query.query.trim().toLocaleLowerCase()}%`;
    conditions.push(`(
      lower(record.order_reference) LIKE ? OR lower(record.model_label) LIKE ?
      OR lower(record.serial_number) LIKE ? OR lower(record.service_type) LIKE ?
      OR lower(record.task_type) LIKE ? OR lower(record.technician) LIKE ?
      OR lower(record.task_completed) LIKE ? OR lower(record.parts_used) LIKE ?
      OR lower(record.customer_name) LIKE ? OR lower(record.source_customer_name) LIKE ?
      OR lower(COALESCE(customer.customer_type, '')) LIKE ?
      OR lower(COALESCE(customer.commercial_area, '')) LIKE ?
      OR lower(record.source_operational_json) LIKE ? OR lower(record.source_details_json) LIKE ?
    )`);
    parameters.push(...Array(14).fill(value));
  }
  const filter = buildOperationalFilter(query);
  conditions.push(...filter.conditions);
  parameters.push(...filter.parameters);
  return { conditions, parameters };
}

const SERVICE_OPERATIONAL_KEYS = [
  'division',
  'receptionType',
  'responseTime',
  'branch',
  'workTime',
  'responseCompliance',
  'serviceTime',
  'serviceCompliance',
  'closed',
  'requestedService',
  'finishedAt',
  'status',
  'interior',
  'mobileClosed',
  'rework',
  'previousServiceNumber',
  'previousTechnician',
  'branchCity',
  'customerCity',
  'papers',
  'counters',
] as const satisfies readonly (keyof ServiceSourceOperational)[];

const SERVICE_OPERATIONAL_LABELS: Readonly<Record<keyof ServiceSourceOperational, readonly string[]>> = {
  division: ['division'],
  receptionType: ['tipo de recepcion', 'tipo recepcion'],
  responseTime: ['t resp', 'tiempo respuesta'],
  branch: ['sucursal'],
  workTime: ['h trab', 'horas trabajo'],
  responseCompliance: ['resp'],
  serviceTime: ['t serv', 'tiempo servicio'],
  serviceCompliance: ['serv'],
  closed: ['cierre'],
  requestedService: ['servicio solicitado'],
  finishedAt: ['fch hora fin', 'fecha hora fin'],
  status: ['estado', 'status'],
  interior: ['es interior', 'interior'],
  mobileClosed: ['cerr mob', 'cerrado movil'],
  rework: ['es retrab', 'retrabajo'],
  previousServiceNumber: ['n is viene', 'numero is viene'],
  previousTechnician: ['tecnico viene'],
  branchCity: ['ciudad sucursal'],
  customerCity: ['ciudad cliente'],
  papers: ['papeles'],
  counters: ['contadores'],
};

function serializeServiceOperational(value: ServiceSourceOperational | undefined): string {
  return JSON.stringify(value ?? {});
}

function withServiceOperational(
  value: string | null | undefined,
  sourceDetails: readonly SourceDetail[],
): { sourceOperational?: ServiceSourceOperational } {
  const parsed = parseServiceOperational(value);
  const entries = SERVICE_OPERATIONAL_KEYS.flatMap((key) => {
    const storedValue = parsed[key];
    if (storedValue) return [[key, storedValue] as const];

    const aliases = SERVICE_OPERATIONAL_LABELS[key].map(normalizeSourceLabel);
    const sourceValue = sourceDetails.find((detail) => {
      const label = normalizeSourceLabel(detail.label);
      return aliases.some((alias) => label === alias || label.startsWith(`${alias} `));
    })?.value.trim();
    return sourceValue ? [[key, sourceValue] as const] : [];
  });

  return entries.length > 0
    ? { sourceOperational: Object.fromEntries(entries) as ServiceSourceOperational }
    : {};
}

function parseServiceOperational(value: string | null | undefined): ServiceSourceOperational {
  if (!value) return {};

  try {
    const parsed = JSON.parse(value) as unknown;
    if (typeof parsed !== 'object' || parsed === null || Array.isArray(parsed)) return {};
    const entries = SERVICE_OPERATIONAL_KEYS.flatMap((key) => {
      const field = (parsed as Record<string, unknown>)[key];
      return typeof field === 'string' && field.trim() ? [[key, field.trim()] as const] : [];
    });
    return Object.fromEntries(entries) as ServiceSourceOperational;
  } catch {
    return {};
  }
}

function normalizeSourceLabel(value: string): string {
  return value
    .normalize('NFD')
    .replace(/[\u0300-\u036f]/g, '')
    .toLocaleLowerCase()
    .replace(/[^a-z0-9]+/g, ' ')
    .trim();
}

export function normalizeServiceRecordKey(row: ParsedServiceRow): string {
  if (row.serviceNumber > 0) return `is:${row.serviceNumber}`;
  return [
    row.serialNumber,
    row.recordedAt,
    row.modelLabel,
    row.orderReference,
    row.serviceType,
    row.taskType,
    row.technician,
  ]
    .map((value) => value.normalize('NFKC').trim().replace(/\s+/g, ' ').toUpperCase())
    .join('|');
}

function assertServiceReplacement(
  database: SuiteDatabase,
  batchId: string,
  replaceBatchIds: ReplacementBatchIds,
): void {
  for (const replaceBatchId of normalizeReplacementBatchIds(replaceBatchIds)) {
    if (replaceBatchId === batchId) throw new Error('La carga nueva no puede reemplazarse a sí misma.');

    const replacement = database
      .prepare('SELECT id, domain, status FROM import_batches WHERE id = ?')
      .get(replaceBatchId) as { id: string; domain: string; status: string } | undefined;
    if (!replacement || replacement.domain !== 'services' || replacement.status !== 'applied') {
      throw new Error('La carga anterior de Servicios no existe o no está aplicada.');
    }
  }
}

function normalizeReplacementBatchIds(replaceBatchIds: ReplacementBatchIds): readonly string[] {
  if (!replaceBatchIds) return [];
  return typeof replaceBatchIds === 'string' ? [replaceBatchIds] : replaceBatchIds;
}
