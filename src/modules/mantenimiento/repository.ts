import { randomUUID } from 'node:crypto';
import type { SuiteDatabase } from '../../db/database';
import {
  analyzeEquipmentCounters,
  findMatchingRule,
  type MaintenanceAnalysis,
  type MaintenanceCounterRecord,
  type MaintenanceModelRule,
} from './analysis';
import { parseSourceDetails } from '../../core/source-details';
import type { SourceDetail } from '../../core/source-details';
import { DEFAULT_MAINTENANCE_RULES } from './defaults';
import { maintenanceAnalysisMatchesSearch } from './search';

export type LegacyMaintenanceModelInput = {
  name: string;
  usefulLife: number;
  optimalBase: number;
  maxWaste: number;
};

export type LegacyMaintenanceRecordInput = {
  customerName: string;
  contractReference: string;
  modelLabel: string;
  serialNumber: string;
  period: string;
  paperType: string;
  copies: number;
  counter: number;
  sourceSheetName?: string;
  sourceRowNumber?: number;
  sourceDetails?: SourceDetail[];
};

export type LegacyMaintenanceDatabaseInput = {
  models: readonly LegacyMaintenanceModelInput[];
  records: readonly LegacyMaintenanceRecordInput[];
};

export type MaintenanceImportResult = {
  models: number;
  records: number;
  customers: number;
  contracts: number;
  equipment: number;
  matchedRecords: number;
  unmatchedRecords: number;
};

export type MaintenanceImportSummary = MaintenanceImportResult & {
  batchId: string | null;
  sourceFileId: string | null;
  sourceName: string | null;
  sourceHash: string | null;
  importedAt: string | null;
  analyzedEquipment: number;
};

export type SaveMaintenanceRuleInput = {
  id?: string;
  modelLabel: string;
  usefulLife: number;
  optimalBase: number;
  maxWaste: number;
};

type RuleRow = {
  id: string;
  model_label: string;
  useful_life: number;
  optimal_base: number;
  max_waste: number;
};

type CurrentBatchRow = {
  id: string;
  source_name: string;
  source_hash: string | null;
  created_at: string;
};

type CounterRow = {
  id: string;
  customer_name: string;
  contract_reference: string;
  model_label: string;
  serial_number: string;
  period: string;
  paper_type: string;
  copies: number;
  counter: number;
  maintenance_model_rule_id: string | null;
  source_sheet_name: string;
  source_row_number: number;
  source_details_json: string;
};

export class MaintenanceRepository {
  constructor(private readonly database: SuiteDatabase) {}

  importLegacyDatabase(batchId: string, input: LegacyMaintenanceDatabaseInput): MaintenanceImportResult {
    const batch = this.database
      .prepare('SELECT id FROM import_batches WHERE id = ?')
      .get(batchId) as { id: string } | undefined;
    if (!batch) throw new Error(`No existe la importación ${batchId}.`);

    const models = normalizeModels(input.models);
    const records = normalizeRecords(input.records);
    const importData = this.database.transaction(() => {
      const now = new Date().toISOString();
      this.database.prepare('DELETE FROM maintenance_counter_records WHERE source_batch_id = ?').run(batchId);
      this.database.prepare('DELETE FROM maintenance_model_rules WHERE source_batch_id = ?').run(batchId);

      const ruleByLabel = new Map<string, MaintenanceModelRule>();
      const findExistingModel = this.database.prepare(
        'SELECT id FROM equipment_models WHERE brand = ? AND normalized_name = ?',
      );
      const insertModel = this.database.prepare(`
        INSERT INTO equipment_models (
          id, brand, model_name, normalized_name, created_at, updated_at
        ) VALUES (?, ?, ?, ?, ?, ?)
      `);
      const insertRule = this.database.prepare(`
        INSERT INTO maintenance_model_rules (
          id, model_id, brand, model_label, normalized_label, useful_life,
          optimal_base, max_waste, source_batch_id, created_at, updated_at
        ) VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?)
      `);

      for (const model of models) {
        const normalizedLabel = normalizeRuleLabel(model.name);
        const modelId = ensureEquipmentModel(
          this.database,
          findExistingModel,
          insertModel,
          model.name,
          now,
        );
        const brand = detectBrand(model.name);
        const rule: MaintenanceModelRule = {
          id: randomUUID(),
          modelLabel: model.name,
          usefulLife: model.usefulLife,
          optimalBase: model.optimalBase,
          maxWaste: model.maxWaste,
        };
        insertRule.run(
          rule.id,
          modelId,
          brand,
          rule.modelLabel,
          normalizedLabel,
          rule.usefulLife,
          rule.optimalBase,
          rule.maxWaste,
          batchId,
          now,
          now,
        );
        ruleByLabel.set(normalizedLabel, rule);
      }

      const findCustomer = this.database.prepare(
        'SELECT id FROM customers WHERE normalized_name = ?',
      );
      const insertCustomer = this.database.prepare(`
        INSERT INTO customers (
          id, name, normalized_name, created_at, updated_at
        ) VALUES (?, ?, ?, ?, ?)
      `);
      const findContractByReference = this.database.prepare(`
        SELECT id FROM contracts
        WHERE customer_id = ? AND reference = ?
        ORDER BY updated_at DESC, id DESC
        LIMIT 1
      `);
      const findContractWithoutReference = this.database.prepare(`
        SELECT id FROM contracts
        WHERE customer_id = ? AND reference IS NULL
        ORDER BY updated_at DESC, id DESC
        LIMIT 1
      `);
      const insertContract = this.database.prepare(`
        INSERT INTO contracts (
          id, customer_id, reference, contract_type, source_batch_id, created_at, updated_at
        ) VALUES (?, ?, ?, 'Mantenimiento', ?, ?, ?)
      `);
      const findEquipment = this.database.prepare(`
        SELECT id FROM contract_equipment
        WHERE contract_id = ? AND serial_number = ? AND model_label = ?
        LIMIT 1
      `);
      const insertEquipment = this.database.prepare(`
        INSERT INTO contract_equipment (
          id, contract_id, model_id, model_label, serial_number, location, created_at, updated_at
        ) VALUES (?, ?, ?, ?, ?, NULL, ?, ?)
      `);
      const insertRecord = this.database.prepare(`
        INSERT INTO maintenance_counter_records (
          id, customer_id, contract_id, equipment_id, maintenance_model_rule_id,
          customer_name, contract_reference, model_label, serial_number,
          period, paper_type, copies, counter, source_batch_id,
          source_sheet_name, source_row_number, source_details_json, created_at
        ) VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?)
      `);

      const customerIds = new Map<string, string>();
      const contractIds = new Map<string, string>();
      const equipmentIds = new Map<string, string>();
      let matchedRecords = 0;

      for (const record of records) {
        const normalizedCustomer = normalizeCustomerName(record.customerName);
        let customerId = customerIds.get(normalizedCustomer);
        if (!customerId) {
          const existingCustomer = findCustomer.get(normalizedCustomer) as { id: string } | undefined;
          customerId = existingCustomer?.id ?? randomUUID();
          if (!existingCustomer) {
            insertCustomer.run(customerId, record.customerName, normalizedCustomer, now, now);
          }
          customerIds.set(normalizedCustomer, customerId);
        }

        const contractReference = record.contractReference || null;
        const contractKey = `${customerId}::${contractReference ?? '__SIN_REFERENCIA__'}`;
        let contractId = contractIds.get(contractKey);
        if (!contractId) {
          const existingContract = contractReference
            ? findContractByReference.get(customerId, contractReference) as { id: string } | undefined
            : findContractWithoutReference.get(customerId) as { id: string } | undefined;
          contractId = existingContract?.id ?? randomUUID();
          if (!existingContract) {
            insertContract.run(contractId, customerId, contractReference, batchId, now, now);
          }
          contractIds.set(contractKey, contractId);
        }

        const normalizedModel = normalizeModelName(record.modelLabel);
        const equipmentKey = `${contractId}::${record.serialNumber}::${normalizedModel}`;
        let equipmentId = equipmentIds.get(equipmentKey);
        if (!equipmentId) {
          const existingEquipment = findEquipment.get(contractId, record.serialNumber, record.modelLabel) as { id: string } | undefined;
          equipmentId = existingEquipment?.id ?? randomUUID();
          if (!existingEquipment) {
            const modelId = ensureEquipmentModel(
              this.database,
              findExistingModel,
              insertModel,
              record.modelLabel,
              now,
            );
            insertEquipment.run(
              equipmentId,
              contractId,
              modelId,
              record.modelLabel,
              record.serialNumber,
              now,
              now,
            );
          }
          equipmentIds.set(equipmentKey, equipmentId);
        }

        const matchedRule = findMatchingRule(record.modelLabel, [...ruleByLabel.values()]);
        if (matchedRule) matchedRecords += 1;
        insertRecord.run(
          randomUUID(),
          customerId,
          contractId,
          equipmentId,
          matchedRule?.id ?? null,
          record.customerName,
          record.contractReference,
          record.modelLabel,
          record.serialNumber,
          record.period,
          record.paperType,
          record.copies,
          record.counter,
          batchId,
          record.sourceSheetName ?? '',
          record.sourceRowNumber ?? 0,
          JSON.stringify(record.sourceDetails ?? []),
          now,
        );
      }

      this.database
        .prepare(`
          UPDATE import_batches
          SET status = 'applied', applied_at = ?
          WHERE id = ?
        `)
        .run(now, batchId);

      return {
        models: models.length,
        records: records.length,
        customers: customerIds.size,
        contracts: contractIds.size,
        equipment: equipmentIds.size,
        matchedRecords,
        unmatchedRecords: records.length - matchedRecords,
      };
    })();

    return importData;
  }

  getCurrentSummary(): MaintenanceImportSummary {
    const batch = this.getCurrentBatch();
    if (!batch) {
      return {
        batchId: null,
        sourceFileId: null,
        sourceName: null,
        sourceHash: null,
        importedAt: null,
        models: 0,
        records: 0,
        customers: 0,
        contracts: 0,
        equipment: 0,
        matchedRecords: 0,
        unmatchedRecords: 0,
        analyzedEquipment: 0,
      };
    }

    const sourceFile = this.database
      .prepare(`
        SELECT id
        FROM import_files
        WHERE batch_id = ?
        ORDER BY created_at, id
        LIMIT 1
      `)
      .get(batch.id) as { id: string } | undefined;

    const counts = this.database
      .prepare(`
        SELECT
          (SELECT COUNT(*) FROM maintenance_model_rules WHERE source_batch_id = ?) AS models,
          COUNT(*) AS records,
          COUNT(DISTINCT customer_id) AS customers,
          COUNT(DISTINCT contract_id) AS contracts,
          COUNT(DISTINCT equipment_id) AS equipment,
          SUM(CASE WHEN maintenance_model_rule_id IS NULL THEN 0 ELSE 1 END) AS matched_records
        FROM maintenance_counter_records
        WHERE source_batch_id = ?
      `)
      .get(batch.id, batch.id) as {
      models: number;
      records: number;
      customers: number;
      contracts: number;
      equipment: number;
      matched_records: number;
    };

    return {
      batchId: batch.id,
      sourceFileId: sourceFile?.id ?? null,
      sourceName: batch.source_name,
      sourceHash: batch.source_hash,
      importedAt: batch.created_at,
      models: counts.models,
      records: counts.records,
      customers: counts.customers,
      contracts: counts.contracts,
      equipment: counts.equipment,
      matchedRecords: counts.matched_records,
      unmatchedRecords: counts.records - counts.matched_records,
      analyzedEquipment: counts.equipment,
    };
  }

  removeImportedBatches(batchIds: readonly string[]): number {
    const uniqueBatchIds = [...new Set(batchIds.filter((batchId) => batchId.trim()))];
    if (uniqueBatchIds.length === 0) return 0;

    return this.database.transaction(() => {
      const findBatch = this.database.prepare(
        "SELECT id, domain FROM import_batches WHERE id = ? AND status = 'applied'",
      );
      const deleteRecords = this.database.prepare(
        'DELETE FROM maintenance_counter_records WHERE source_batch_id = ?',
      );
      const deleteRules = this.database.prepare(
        'DELETE FROM maintenance_model_rules WHERE source_batch_id = ?',
      );
      const deleteBatch = this.database.prepare('DELETE FROM import_batches WHERE id = ?');
      let removed = 0;

      for (const batchId of uniqueBatchIds) {
        const batch = findBatch.get(batchId) as { id: string; domain: string } | undefined;
        if (!batch) throw new Error(`No existe una carga activa de mantenimiento: ${batchId}.`);
        if (batch.domain !== 'maintenance') throw new Error('Solo se pueden quitar cargas de mantenimiento.');
        deleteRecords.run(batchId);
        deleteRules.run(batchId);
        const result = deleteBatch.run(batchId);
        removed += result.changes;
      }

      return removed;
    })();
  }

  listCurrentRules(): MaintenanceModelRule[] {
    const batch = this.getCurrentBatch();
    if (!batch) return [];
    return this.listRules(batch.id);
  }

  saveCurrentRule(input: SaveMaintenanceRuleInput): MaintenanceModelRule {
    const batch = this.getCurrentBatch();
    if (!batch) throw new Error('Importa primero una base de mantenimiento o un archivo de contadores.');

    const modelLabel = cleanRequired(input.modelLabel, 'La regla debe tener un nombre de modelo.');
    validateRuleValues(modelLabel, input.usefulLife, input.optimalBase, input.maxWaste);
    const normalizedLabel = normalizeRuleLabel(modelLabel);
    const existing = input.id
      ? this.database.prepare('SELECT id FROM maintenance_model_rules WHERE id = ? AND source_batch_id = ?').get(input.id, batch.id) as { id: string } | undefined
      : undefined;
    if (input.id && !existing) throw new Error('La regla de mantenimiento no existe en la carga activa.');

    const duplicate = this.database.prepare(`
      SELECT id FROM maintenance_model_rules
      WHERE source_batch_id = ? AND normalized_label = ? AND (? IS NULL OR id <> ?)
    `).get(batch.id, normalizedLabel, input.id ?? null, input.id ?? null) as { id: string } | undefined;
    if (duplicate) throw new Error(`Ya existe una regla para ${modelLabel}.`);

    const now = new Date().toISOString();
    const findExistingModel = this.database.prepare(
      'SELECT id FROM equipment_models WHERE brand = ? AND normalized_name = ?',
    );
    const insertModel = this.database.prepare(`
      INSERT INTO equipment_models (
        id, brand, model_name, normalized_name, created_at, updated_at
      ) VALUES (?, ?, ?, ?, ?, ?)
    `);
    const modelId = ensureEquipmentModel(this.database, findExistingModel, insertModel, modelLabel, now);
    const brand = detectBrand(modelLabel);

    if (input.id) {
      this.database.prepare(`
        UPDATE maintenance_model_rules
        SET model_id = ?, brand = ?, model_label = ?, normalized_label = ?,
          useful_life = ?, optimal_base = ?, max_waste = ?, updated_at = ?
        WHERE id = ? AND source_batch_id = ?
      `).run(
        modelId,
        brand,
        modelLabel,
        normalizedLabel,
        input.usefulLife,
        input.optimalBase,
        input.maxWaste,
        now,
        input.id,
        batch.id,
      );
    } else {
      this.database.prepare(`
        INSERT INTO maintenance_model_rules (
          id, model_id, brand, model_label, normalized_label, useful_life,
          optimal_base, max_waste, source_batch_id, created_at, updated_at
        ) VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?)
      `).run(
        randomUUID(),
        modelId,
        brand,
        modelLabel,
        normalizedLabel,
        input.usefulLife,
        input.optimalBase,
        input.maxWaste,
        batch.id,
        now,
        now,
      );
    }

    this.refreshRuleLinks(batch.id);
    const saved = this.listRules(batch.id).find((rule) => normalizeRuleLabel(rule.modelLabel) === normalizedLabel);
    if (!saved) throw new Error('No se pudo recuperar la regla guardada.');
    return saved;
  }

  deleteCurrentRule(id: string): boolean {
    const batch = this.getCurrentBatch();
    if (!batch) throw new Error('No hay una carga de mantenimiento activa.');
    const result = this.database.prepare(
      'DELETE FROM maintenance_model_rules WHERE id = ? AND source_batch_id = ?',
    ).run(id, batch.id);
    if (result.changes > 0) this.refreshRuleLinks(batch.id);
    return result.changes > 0;
  }

  resetCurrentRules(): MaintenanceModelRule[] {
    const batch = this.getCurrentBatch();
    if (!batch) throw new Error('Importa primero una base de mantenimiento o un archivo de contadores.');

    this.database.transaction(() => {
      this.database.prepare('DELETE FROM maintenance_model_rules WHERE source_batch_id = ?').run(batch.id);
      const now = new Date().toISOString();
      const findExistingModel = this.database.prepare(
        'SELECT id FROM equipment_models WHERE brand = ? AND normalized_name = ?',
      );
      const insertModel = this.database.prepare(`
        INSERT INTO equipment_models (
          id, brand, model_name, normalized_name, created_at, updated_at
        ) VALUES (?, ?, ?, ?, ?, ?)
      `);
      const insertRule = this.database.prepare(`
        INSERT INTO maintenance_model_rules (
          id, model_id, brand, model_label, normalized_label, useful_life,
          optimal_base, max_waste, source_batch_id, created_at, updated_at
        ) VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?)
      `);

      for (const seed of DEFAULT_MAINTENANCE_RULES) {
        const modelId = ensureEquipmentModel(this.database, findExistingModel, insertModel, seed.name, now);
        insertRule.run(
          randomUUID(),
          modelId,
          detectBrand(seed.name),
          seed.name,
          normalizeRuleLabel(seed.name),
          seed.usefulLife,
          seed.optimalBase,
          seed.maxWaste,
          batch.id,
          now,
          now,
        );
      }
      this.refreshRuleLinks(batch.id);
    })();

    return this.listRules(batch.id);
  }

  listCurrentAnalyses(query?: string, limitMonths = 3): MaintenanceAnalysis[] {
    const batch = this.getCurrentBatch();
    if (!batch) return [];

    const rules = this.database
      .prepare(`
        SELECT id, model_label, useful_life, optimal_base, max_waste
        FROM maintenance_model_rules
        WHERE source_batch_id = ?
        ORDER BY id
      `)
      .all(batch.id) as RuleRow[];
    const records = this.database
      .prepare(`
        SELECT id, customer_name, contract_reference, model_label, serial_number,
          period, paper_type, copies, counter, maintenance_model_rule_id,
          source_sheet_name, source_row_number, source_details_json
        FROM maintenance_counter_records
        WHERE source_batch_id = ?
        ORDER BY period, id
      `)
      .all(batch.id) as CounterRow[];
    const analyses = analyzeEquipmentCounters(
      records.map((record): MaintenanceCounterRecord => ({
        id: record.id,
        customerName: record.customer_name,
        contractReference: record.contract_reference,
        modelLabel: record.model_label,
        serialNumber: record.serial_number,
        period: record.period,
        paperType: record.paper_type,
        copies: record.copies,
        counter: record.counter,
        maintenanceModelRuleId: record.maintenance_model_rule_id,
        sourceSheetName: record.source_sheet_name,
        sourceRowNumber: record.source_row_number,
        sourceDetails: parseSourceDetails(record.source_details_json),
      })),
      rules.map((rule): MaintenanceModelRule => ({
        id: rule.id,
        modelLabel: rule.model_label,
        usefulLife: rule.useful_life,
        optimalBase: rule.optimal_base,
        maxWaste: rule.max_waste,
      })),
      Math.max(1, Math.min(12, Math.floor(limitMonths))),
    );

    const normalizedQuery = query?.trim() ?? '';
    if (!normalizedQuery) return analyses;
    return analyses.filter((analysis) => maintenanceAnalysisMatchesSearch(analysis, normalizedQuery));
  }

  private listRules(batchId: string): MaintenanceModelRule[] {
    const rows = this.database
      .prepare(`
        SELECT id, model_label, normalized_label, useful_life, optimal_base, max_waste
        FROM maintenance_model_rules
        WHERE source_batch_id = ?
        ORDER BY model_label COLLATE NOCASE, id
      `)
      .all(batchId) as Array<RuleRow & { normalized_label: string }>;
    return rows.map((rule) => ({
      id: rule.id,
      modelLabel: rule.model_label,
      usefulLife: rule.useful_life,
      optimalBase: rule.optimal_base,
      maxWaste: rule.max_waste,
    }));
  }

  private refreshRuleLinks(batchId: string): void {
    const rules = this.listRules(batchId);
    const records = this.database
      .prepare('SELECT id, model_label FROM maintenance_counter_records WHERE source_batch_id = ?')
      .all(batchId) as Array<{ id: string; model_label: string }>;
    const update = this.database.prepare(`
      UPDATE maintenance_counter_records
      SET maintenance_model_rule_id = ?
      WHERE id = ? AND source_batch_id = ?
    `);
    for (const record of records) {
      update.run(findMatchingRule(record.model_label, rules)?.id ?? null, record.id, batchId);
    }
  }

  private getCurrentBatch(): CurrentBatchRow | undefined {
    return this.database
      .prepare(`
        SELECT id, source_name, source_hash, created_at
        FROM import_batches
        WHERE domain = 'maintenance' AND status = 'applied'
        ORDER BY created_at DESC, id DESC
        LIMIT 1
      `)
      .get() as CurrentBatchRow | undefined;
  }
}

function normalizeModels(input: readonly LegacyMaintenanceModelInput[]): LegacyMaintenanceModelInput[] {
  const unique = new Map<string, LegacyMaintenanceModelInput>();
  for (const model of input) {
    const name = cleanRequired(model.name, 'Cada regla de mantenimiento debe tener un nombre.');
    if (!Number.isInteger(model.usefulLife) || model.usefulLife <= 0 || !Number.isInteger(model.optimalBase) || model.optimalBase < 0 || !Number.isFinite(model.maxWaste) || model.maxWaste < 0 || model.maxWaste > 1) {
      throw new Error(`La regla de mantenimiento ${name} tiene valores inválidos.`);
    }
    unique.set(normalizeRuleLabel(name), {
      name,
      usefulLife: model.usefulLife,
      optimalBase: model.optimalBase,
      maxWaste: model.maxWaste,
    });
  }
  if (unique.size === 0) throw new Error('La base de mantenimiento no contiene reglas de modelos.');
  return [...unique.values()];
}

function validateRuleValues(modelLabel: string, usefulLife: number, optimalBase: number, maxWaste: number): void {
  if (!Number.isInteger(usefulLife) || usefulLife <= 0 || !Number.isInteger(optimalBase) || optimalBase < 0 || !Number.isFinite(maxWaste) || maxWaste < 0 || maxWaste > 1) {
    throw new Error(`La regla de mantenimiento ${modelLabel} tiene valores inválidos.`);
  }
}

function normalizeRecords(input: readonly LegacyMaintenanceRecordInput[]): LegacyMaintenanceRecordInput[] {
  return input.map((record) => {
    const customerName = cleanRequired(record.customerName, 'Cada lectura debe tener un cliente.');
    const modelLabel = cleanRequired(record.modelLabel, 'Cada lectura debe tener un equipo.');
    const serialNumber = cleanRequired(record.serialNumber, 'Cada lectura debe tener un número de serie.');
    const period = cleanRequired(record.period, 'Cada lectura debe tener un período.');
    if (!/^\d{4}-\d{2}$/.test(period)) throw new Error(`El período ${period} no tiene formato AAAA-MM.`);
    if (!Number.isFinite(record.copies) || record.copies < 0 || !Number.isFinite(record.counter) || record.counter < 0) {
      throw new Error(`La lectura de ${serialNumber} tiene valores numéricos inválidos.`);
    }
    return {
      customerName,
      contractReference: cleanOptional(record.contractReference),
      modelLabel,
      serialNumber,
      period,
      paperType: cleanOptional(record.paperType),
      copies: record.copies,
      counter: record.counter,
      sourceSheetName: cleanOptional(record.sourceSheetName),
      sourceRowNumber: normalizeSourceRowNumber(record.sourceRowNumber),
      sourceDetails: record.sourceDetails ?? [],
    };
  });
}

function normalizeSourceRowNumber(value: number | undefined): number {
  return typeof value === 'number' && Number.isInteger(value) && value >= 1 ? value : 0;
}

function ensureEquipmentModel(
  database: SuiteDatabase,
  findExistingModel: { get: (...parameters: string[]) => unknown },
  insertModel: { run: (...parameters: Array<string | number>) => unknown },
  modelLabel: string,
  now: string,
): string {
  const normalizedModel = normalizeModelName(modelLabel);
  const brand = detectBrand(modelLabel);
  const existing = findExistingModel.get(brand, normalizedModel) as { id: string } | undefined;
  if (existing) return existing.id;
  const id = randomUUID();
  insertModel.run(id, brand, modelLabel, normalizedModel, now, now);
  return id;
}

function detectBrand(value: string): 'Canon' | 'Pantum' {
  return value.toLocaleLowerCase().includes('pantum') ? 'Pantum' : 'Canon';
}

function normalizeCustomerName(value: string): string {
  return value
    .normalize('NFD')
    .replace(/[\u0300-\u036f]/g, '')
    .trim()
    .replace(/\s+/g, ' ')
    .toUpperCase();
}

function normalizeRuleLabel(value: string): string {
  return value
    .normalize('NFD')
    .replace(/[\u0300-\u036f]/g, '')
    .trim()
    .replace(/\s+/g, ' ')
    .toUpperCase();
}

function normalizeModelName(value: string): string {
  return value.normalize('NFKC').trim().replace(/\s+/g, ' ').toUpperCase();
}

function cleanRequired(value: string, message: string): string {
  const cleaned = value.trim().replace(/\s+/g, ' ');
  if (!cleaned) throw new Error(message);
  return cleaned;
}

function cleanOptional(value: string | null | undefined): string {
  if (value === null || value === undefined) return '';
  return value.trim().replace(/\s+/g, ' ');
}
