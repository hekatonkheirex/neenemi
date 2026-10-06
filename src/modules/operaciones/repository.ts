import { randomUUID } from 'node:crypto';
import type { SuiteDatabase } from '../../db/database';
import { parseSourceDetails, serializeSourceDetails } from '../../core/source-details';
import type { SourceDetail } from '../../core/source-details';
import type {
  CanonDiscontinuationRow,
  LegacyFleetMetadataRow,
  LegacyFleetMetadataType,
  LegacyPortfolioRow,
  WaldbottStockRow,
} from './legacy';

export const CUSTOMER_TYPES = ['Publico', 'Privado'] as const;
export const COMMERCIAL_AREAS = ['Strategic', 'Commercial'] as const;
export const CONTRACT_TYPES = ['Alquiler', 'Abierto', 'Mantenimiento', 'Leasing'] as const;

export type CustomerType = (typeof CUSTOMER_TYPES)[number];
export type CommercialArea = (typeof COMMERCIAL_AREAS)[number];
export type ContractType = (typeof CONTRACT_TYPES)[number];

export type SaveCustomerInput = {
  id?: string;
  name: string;
  customerType?: CustomerType | null;
  commercialArea?: CommercialArea | null;
};

export type SaveEquipmentInput = {
  id?: string;
  modelLabel: string;
  serialNumber?: string | null;
  location?: string | null;
  brand?: string | null;
  description?: string | null;
  interior?: string | null;
  city?: string | null;
  branch?: string | null;
  address?: string | null;
  isActive?: boolean | null;
};

export type SaveContractInput = {
  id?: string;
  customerId: string;
  reference?: string | null;
  orderReference?: string | null;
  contractType: ContractType;
  startsAt?: string | null;
  endsAt?: string | null;
  commercialArea?: CommercialArea | null;
  division?: string | null;
  isActive?: boolean | null;
  requiresClosure?: boolean | null;
  equipment: readonly SaveEquipmentInput[];
};

export type ContractEquipment = {
  id: string;
  modelId: string | null;
  modelLabel: string;
  serialNumber: string | null;
  location: string | null;
  brand: string | null;
  description: string | null;
  interior: string | null;
  city: string | null;
  branch: string | null;
  address: string | null;
  isActive: boolean | null;
  sourceDetails: SourceDetail[];
  sourceSheetName: string;
  sourceRowNumber: number;
};

export type ContractRecord = {
  id: string;
  customerId: string;
  reference: string | null;
  orderReference: string | null;
  contractType: ContractType;
  startsAt: string | null;
  endsAt: string | null;
  commercialArea: CommercialArea | null;
  division: string | null;
  isActive: boolean | null;
  requiresClosure: boolean | null;
  sourceDetails: SourceDetail[];
  sourceSheetName: string;
  sourceRowNumber: number;
  equipment: ContractEquipment[];
};

export type CustomerRecord = {
  id: string;
  name: string;
  customerType: CustomerType | null;
  commercialArea: CommercialArea | null;
  sourceDetails: SourceDetail[];
  sourceSheetName: string;
  sourceRowNumber: number;
  contracts: ContractRecord[];
};

export type EquipmentRecord = ContractEquipment & {
  contractId: string;
  customerId: string;
  customerName: string;
  contractReference: string | null;
  orderReference: string | null;
  contractType: ContractType;
  contractStartsAt: string | null;
  contractEndsAt: string | null;
  contractCommercialArea: CommercialArea | null;
  contractDivision: string | null;
  contractIsActive: boolean | null;
  contractRequiresClosure: boolean | null;
};

export type ModelDiscontinuationRecord = {
  id: string;
  modelLabel: string;
  partCode: string;
  endsAt: string | null;
  voltage: string | null;
  sourceNotes: string[];
  sourceName: string;
  sourceLabel: string | null;
  installedCount: number;
  installedModels: string[];
  status: 'discontinued' | 'scheduled';
};

export type LegacyPortfolioImportResult = {
  customers: number;
  contracts: number;
  equipment: number;
};

export type LegacyFleetMetadataImportResult = {
  sourceType: LegacyFleetMetadataType;
  customers: number;
  contracts: number;
  updatedCustomers: number;
  updatedContracts: number;
};

export type CanonDiscontinuationImportResult = {
  items: number;
};

export type WaldbottStockImportResult = {
  items: number;
  models: number;
  quantity: number;
};

export type WaldbottStockRecord = {
  id: string;
  modelLabel: string;
  deposit: string;
  quantity: number;
  sourceNames: string[];
  canonStatus: 'discontinued' | 'scheduled' | 'supported' | 'unknown';
  canonModelLabel: string | null;
  canonEndsAt: string | null;
  installedCount: number;
  installedModels: string[];
};

export type OperationsPortfolioSnapshot = {
  customers: CustomerRecord[];
  equipment: EquipmentRecord[];
};

/** Sin `equipment` plano: la pantalla lee los equipos anidados en cada contrato y repetirlos sumaba ~13 MB a la respuesta. */
export type DiscontinuationOverviewSnapshot = Omit<OperationsPortfolioSnapshot, 'equipment'> & {
  modelItems: ModelDiscontinuationRecord[];
  stockItems: WaldbottStockRecord[];
};

type CustomerJoinRow = {
  customer_id: string;
  customer_name: string;
  customer_type: CustomerType | null;
  commercial_area: CommercialArea | null;
  contract_id: string | null;
  contract_reference: string | null;
  contract_order_reference: string | null;
  contract_type: ContractType | null;
  starts_at: string | null;
  ends_at: string | null;
  contract_commercial_area: CommercialArea | null;
  contract_division: string | null;
  contract_is_active: number | null;
  contract_requires_closure: number | null;
  equipment_id: string | null;
  model_id: string | null;
  model_label: string | null;
  serial_number: string | null;
  location: string | null;
  equipment_brand: string | null;
  equipment_description: string | null;
  equipment_interior: string | null;
  equipment_city: string | null;
  equipment_branch: string | null;
  equipment_address: string | null;
  equipment_is_active: number | null;
  customer_source_sheet_name: string;
  customer_source_row_number: number;
  contract_source_sheet_name: string;
  contract_source_row_number: number;
  equipment_source_details_json: string;
  equipment_source_sheet_name: string;
  equipment_source_row_number: number;
};

type ExistingCustomerRow = {
  id: string;
  customer_type: CustomerType | null;
  commercial_area: CommercialArea | null;
};

type EquipmentRow = {
  equipment_id: string;
  contract_id: string;
  customer_id: string;
  customer_name: string;
  contract_reference: string | null;
  order_reference: string | null;
  contract_type: ContractType;
  contract_starts_at: string | null;
  contract_ends_at: string | null;
  contract_commercial_area: CommercialArea | null;
  contract_division: string | null;
  contract_is_active: number | null;
  contract_requires_closure: number | null;
  model_id: string | null;
  model_label: string;
  serial_number: string | null;
  location: string | null;
  brand: string | null;
  description: string | null;
  interior: string | null;
  city: string | null;
  branch: string | null;
  address: string | null;
  is_active: number | null;
  source_details_json: string;
  source_sheet_name: string;
  source_row_number: number;
};

type ExistingContractEquipmentRow = {
  id: string;
  model_label: string;
  serial_number: string | null;
  location: string | null;
  brand: string | null;
  description: string | null;
  interior: string | null;
  city: string | null;
  branch: string | null;
  address: string | null;
  is_active: number | null;
};

type CanonDiscontinuationDbRow = {
  id: string;
  model_label: string;
  normalized_model: string;
  part_code: string;
  ends_at: string;
  voltage: string | null;
  source_notes_json: string;
  source_name: string;
  source_label: string | null;
  created_at: string;
};

type WaldbottStockDbRow = {
  id: string;
  model_label: string;
  normalized_model: string;
  deposit: string;
  quantity: number;
  source_name: string;
  source_label: string | null;
  created_at: string;
};

export class OperationsRepository {
  constructor(private readonly database: SuiteDatabase) {}

  saveCustomer(input: SaveCustomerInput): CustomerRecord {
    const name = cleanRequired(input.name, 'El cliente debe tener un nombre.');
    const normalizedName = normalizeCustomerName(name);
    const customer = this.database.transaction(() => {
      const byId = input.id
        ? this.database.prepare('SELECT id, customer_type, commercial_area FROM customers WHERE id = ?').get(input.id) as ExistingCustomerRow | undefined
        : undefined;
      const byName = this.database
        .prepare('SELECT id, customer_type, commercial_area FROM customers WHERE normalized_name = ?')
        .get(normalizedName) as ExistingCustomerRow | undefined;
      const id = byId?.id ?? byName?.id ?? input.id ?? randomUUID();
      const now = new Date().toISOString();
      const existing = byId ?? byName;
      const customerType = input.customerType === undefined ? existing?.customer_type ?? null : input.customerType;
      const commercialArea = input.commercialArea === undefined ? existing?.commercial_area ?? null : input.commercialArea;

      if (byId || byName) {
        this.database
          .prepare(`
            UPDATE customers
            SET name = ?, normalized_name = ?, customer_type = ?, commercial_area = ?, updated_at = ?
            WHERE id = ?
          `)
          .run(name, normalizedName, customerType, commercialArea, now, id);
      } else {
        this.database
          .prepare(`
            INSERT INTO customers (
              id, name, normalized_name, customer_type, commercial_area, created_at, updated_at
            ) VALUES (?, ?, ?, ?, ?, ?, ?)
          `)
          .run(id, name, normalizedName, customerType, commercialArea, now, now);
      }

      return id;
    })();

    const saved = this.getCustomer(customer);
    if (!saved) throw new Error('No se pudo recuperar el cliente guardado.');
    return saved;
  }

  getCustomer(id: string): CustomerRecord | undefined {
    return this.listCustomers().find((customer) => customer.id === id);
  }

  listCustomers(query?: string): CustomerRecord[] {
    const parameters: string[] = [];
    const condition = query?.trim()
      ? (() => {
          const pattern = `%${query.trim().toLowerCase()}%`;
          parameters.push(...Array.from({ length: 20 }, () => pattern));
          return `WHERE
            lower(customer.name) LIKE ?
            OR lower(COALESCE(customer.customer_type, '')) LIKE ?
            OR lower(COALESCE(customer.commercial_area, '')) LIKE ?
            OR lower(COALESCE(customer.source_details_json, '')) LIKE ?
            OR lower(COALESCE(contract.reference, '')) LIKE ?
            OR lower(COALESCE(contract.order_reference, '')) LIKE ?
            OR lower(COALESCE(contract.contract_type, '')) LIKE ?
            OR lower(COALESCE(contract.commercial_area, '')) LIKE ?
            OR lower(COALESCE(contract.division, '')) LIKE ?
            OR lower(COALESCE(contract.source_details_json, '')) LIKE ?
            OR lower(COALESCE(equipment.model_label, '')) LIKE ?
            OR lower(COALESCE(equipment.serial_number, '')) LIKE ?
            OR lower(COALESCE(equipment.location, '')) LIKE ?
            OR lower(COALESCE(equipment.brand, '')) LIKE ?
            OR lower(COALESCE(equipment.description, '')) LIKE ?
            OR lower(COALESCE(equipment.interior, '')) LIKE ?
            OR lower(COALESCE(equipment.branch, '')) LIKE ?
            OR lower(COALESCE(equipment.city, '')) LIKE ?
            OR lower(COALESCE(equipment.address, '')) LIKE ?
            OR lower(COALESCE(equipment.source_details_json, '')) LIKE ?`;
        })()
      : '';
    const rows = this.database
      .prepare(`
        SELECT
          customer.id AS customer_id,
          customer.name AS customer_name,
          customer.customer_type,
          customer.commercial_area,
          customer.source_sheet_name AS customer_source_sheet_name,
          customer.source_row_number AS customer_source_row_number,
          contract.id AS contract_id,
          contract.reference AS contract_reference,
          contract.order_reference AS contract_order_reference,
          contract.contract_type,
          contract.starts_at,
          contract.ends_at,
          contract.commercial_area AS contract_commercial_area,
          contract.division AS contract_division,
          contract.is_active AS contract_is_active,
          contract.requires_closure AS contract_requires_closure,
          contract.source_sheet_name AS contract_source_sheet_name,
          contract.source_row_number AS contract_source_row_number,
          equipment.id AS equipment_id,
          equipment.model_id,
          equipment.model_label,
          equipment.serial_number,
          equipment.location,
          equipment.brand AS equipment_brand,
          equipment.description AS equipment_description,
          equipment.interior AS equipment_interior,
          equipment.city AS equipment_city,
          equipment.branch AS equipment_branch,
          equipment.address AS equipment_address,
          equipment.is_active AS equipment_is_active,
          equipment.source_details_json AS equipment_source_details_json,
          equipment.source_sheet_name AS equipment_source_sheet_name,
          equipment.source_row_number AS equipment_source_row_number
        FROM customers customer
        LEFT JOIN contracts contract ON contract.customer_id = customer.id
        LEFT JOIN contract_equipment equipment ON equipment.contract_id = contract.id
        ${condition}
        ORDER BY customer.name COLLATE NOCASE, contract.created_at, contract.id, equipment.created_at, equipment.id
      `)
      .all(...parameters) as CustomerJoinRow[];

    const customers = new Map<string, CustomerRecord>();
    const contracts = new Map<string, ContractRecord>();
    for (const row of rows) {
      let customer = customers.get(row.customer_id);
      if (!customer) {
        customer = {
          id: row.customer_id,
          name: row.customer_name,
          customerType: row.customer_type,
          commercialArea: row.commercial_area,
          sourceDetails: [],
          sourceSheetName: row.customer_source_sheet_name,
          sourceRowNumber: row.customer_source_row_number,
          contracts: [],
        };
        customers.set(customer.id, customer);
      }

      if (!row.contract_id || !row.contract_type) continue;
      let contract = contracts.get(row.contract_id);
      if (!contract) {
        contract = {
          id: row.contract_id,
          customerId: row.customer_id,
          reference: row.contract_reference,
          orderReference: row.contract_order_reference,
          contractType: row.contract_type,
          startsAt: row.starts_at,
          endsAt: row.ends_at,
          commercialArea: row.contract_commercial_area,
          division: row.contract_division,
          isActive: toBoolean(row.contract_is_active),
          requiresClosure: toBoolean(row.contract_requires_closure),
          sourceDetails: [],
          sourceSheetName: row.contract_source_sheet_name,
          sourceRowNumber: row.contract_source_row_number,
          equipment: [],
        };
        contracts.set(contract.id, contract);
        customer.contracts.push(contract);
      }

      if (row.equipment_id) {
        contract.equipment.push({
          id: row.equipment_id,
          modelId: row.model_id,
          modelLabel: row.model_label ?? 'Modelo sin nombre',
          serialNumber: row.serial_number,
          location: row.location,
          brand: row.equipment_brand,
          description: row.equipment_description,
          interior: row.equipment_interior,
          city: row.equipment_city,
          branch: row.equipment_branch,
          address: row.equipment_address,
          isActive: toBoolean(row.equipment_is_active),
          sourceDetails: parseSourceDetails(row.equipment_source_details_json),
          sourceSheetName: row.equipment_source_sheet_name,
          sourceRowNumber: row.equipment_source_row_number,
        });
      }
    }

    // El JOIN repetía el JSON de origen del cliente y del contrato en cada fila de equipo (~130 MB de texto para
    // 10.7 mil equipos). Se lee una sola vez por cliente y por contrato.
    this.attachSourceDetails('customers', customers);
    this.attachSourceDetails('contracts', contracts);

    return [...customers.values()];
  }

  private attachSourceDetails(table: 'customers' | 'contracts', records: Map<string, { sourceDetails: SourceDetail[] }>): void {
    if (records.size === 0) return;
    const rows = this.database
      .prepare(`SELECT id, source_details_json FROM ${table} WHERE id IN (SELECT value FROM json_each(?))`)
      .all(JSON.stringify([...records.keys()])) as Array<{ id: string; source_details_json: string | null }>;
    for (const row of rows) {
      const record = records.get(row.id);
      if (record) record.sourceDetails = parseSourceDetails(row.source_details_json);
    }
  }

  getPortfolioSnapshot(query?: string): OperationsPortfolioSnapshot {
    const customers = this.listCustomers(query);
    const equipment = customers.flatMap((customer) => customer.contracts.flatMap((contract) =>
      contract.equipment.map((item): EquipmentRecord => ({
        ...item,
        contractId: contract.id,
        customerId: customer.id,
        customerName: customer.name,
        contractReference: contract.reference,
        orderReference: contract.orderReference,
        contractType: contract.contractType,
        contractStartsAt: contract.startsAt,
        contractEndsAt: contract.endsAt,
        contractCommercialArea: contract.commercialArea,
        contractDivision: contract.division,
        contractIsActive: contract.isActive,
        contractRequiresClosure: contract.requiresClosure,
      })),
    ));
    equipment.sort((left, right) =>
      compareNoCase(left.customerName, right.customerName)
      || compareNoCase(left.modelLabel, right.modelLabel)
      || left.id.localeCompare(right.id),
    );
    return { customers, equipment };
  }

  saveContract(input: SaveContractInput): ContractRecord {
    const customer = this.database
      .prepare('SELECT id FROM customers WHERE id = ?')
      .get(input.customerId) as { id: string } | undefined;
    if (!customer) throw new Error('El cliente del contrato no existe.');

    const reference = cleanOptional(input.reference);
    const contractType = cleanRequired(input.contractType, 'El contrato debe tener un tipo.');
    const contractId = this.database.transaction(() => {
      const id = input.id ?? randomUUID();
      const now = new Date().toISOString();
      const existing = this.database
        .prepare('SELECT id, order_reference, commercial_area, division, is_active, requires_closure FROM contracts WHERE id = ?')
        .get(id) as {
          id: string;
          order_reference: string | null;
          commercial_area: CommercialArea | null;
          division: string | null;
          is_active: number | null;
          requires_closure: number | null;
        } | undefined;

      if (existing) {
        this.database
          .prepare(`
            UPDATE contracts
            SET customer_id = ?, reference = ?, order_reference = ?, contract_type = ?, starts_at = ?, ends_at = ?,
                commercial_area = ?, division = ?, is_active = ?, requires_closure = ?, updated_at = ?
            WHERE id = ?
          `)
          .run(
            input.customerId,
            reference,
            input.orderReference === undefined ? existing.order_reference : cleanOptional(input.orderReference),
            contractType,
            cleanOptional(input.startsAt),
            cleanOptional(input.endsAt),
            input.commercialArea === undefined ? existing.commercial_area : input.commercialArea,
            input.division === undefined ? existing.division : cleanOptional(input.division),
            input.isActive === undefined ? existing.is_active : toDbBoolean(input.isActive),
            input.requiresClosure === undefined ? existing.requires_closure : toDbBoolean(input.requiresClosure),
            now,
            id,
          );
        this.database.prepare('DELETE FROM contract_equipment WHERE contract_id = ?').run(id);
      } else {
        this.database
          .prepare(`
            INSERT INTO contracts (
              id, customer_id, reference, order_reference, contract_type, starts_at, ends_at,
              commercial_area, division, is_active, requires_closure, created_at, updated_at
            ) VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?)
          `)
          .run(
            id,
            input.customerId,
            reference,
            cleanOptional(input.orderReference),
            contractType,
            cleanOptional(input.startsAt),
            cleanOptional(input.endsAt),
            input.commercialArea ?? null,
            cleanOptional(input.division),
            toDbBoolean(input.isActive),
            toDbBoolean(input.requiresClosure),
            now,
            now,
          );
      }

      const findModel = this.database.prepare(
        'SELECT id FROM equipment_models WHERE brand = ? AND normalized_name = ?',
      );
      const insertModel = this.database.prepare(`
        INSERT INTO equipment_models (
          id, brand, model_name, normalized_name, created_at, updated_at
        ) VALUES (?, ?, ?, ?, ?, ?)
      `);
      const insertEquipment = this.database.prepare(`
        INSERT INTO contract_equipment (
          id, contract_id, model_id, model_label, serial_number, location,
          brand, description, interior, city, branch, address, is_active, created_at, updated_at
        ) VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?)
      `);
      const modelIds = new Map<string, string>();

      for (const equipment of input.equipment) {
        const modelLabel = cleanRequired(equipment.modelLabel, 'Cada equipo debe tener un modelo.');
        const normalizedModel = normalizeModelName(modelLabel);
        let modelId = modelIds.get(normalizedModel);
        if (!modelId) {
          const existingModel = findModel.get('Canon', normalizedModel) as { id: string } | undefined;
          modelId = existingModel?.id ?? randomUUID();
          if (!existingModel) insertModel.run(modelId, 'Canon', modelLabel, normalizedModel, now, now);
          modelIds.set(normalizedModel, modelId);
        }

        insertEquipment.run(
          equipment.id ?? randomUUID(),
          id,
          modelId,
          modelLabel,
          cleanOptional(equipment.serialNumber),
          cleanOptional(equipment.location),
          cleanOptional(equipment.brand),
          cleanOptional(equipment.description),
          cleanOptional(equipment.interior),
          cleanOptional(equipment.city),
          cleanOptional(equipment.branch),
          cleanOptional(equipment.address),
          toDbBoolean(equipment.isActive),
          now,
          now,
        );
      }

      return id;
    })();

    const saved = this.listContracts().find((contract) => contract.id === contractId);
    if (!saved) throw new Error('No se pudo recuperar el contrato guardado.');
    return saved;
  }

  importLegacyPortfolio(batchId: string, rows: readonly LegacyPortfolioRow[]): LegacyPortfolioImportResult {
    const batch = this.database
      .prepare('SELECT id FROM import_batches WHERE id = ?')
      .get(batchId) as { id: string } | undefined;
    if (!batch) throw new Error(`No existe la importación ${batchId}.`);
    if (rows.length === 0) throw new Error('La cartera no contiene filas válidas para importar.');

    return this.database.transaction(() => {
      const now = new Date().toISOString();
      const findCustomer = this.database.prepare(`
        SELECT id, customer_type, commercial_area
        FROM customers
        WHERE normalized_name = ?
      `);
      const insertCustomer = this.database.prepare(`
        INSERT INTO customers (
          id, name, normalized_name, customer_type, commercial_area, created_at, updated_at
        ) VALUES (?, ?, ?, ?, ?, ?, ?)
      `);
      const updateCustomer = this.database.prepare(`
        UPDATE customers
        SET customer_type = COALESCE(?, customer_type),
            commercial_area = COALESCE(?, commercial_area),
            updated_at = ?
        WHERE id = ?
      `);
      const findContract = this.database.prepare(`
        SELECT id, starts_at, ends_at, order_reference, commercial_area, division, is_active
        FROM contracts
        WHERE customer_id = ? AND lower(COALESCE(reference, '')) = lower(?)
        ORDER BY updated_at DESC, id DESC
        LIMIT 1
      `);
      const insertContract = this.database.prepare(`
        INSERT INTO contracts (
          id, customer_id, reference, order_reference, contract_type, starts_at, ends_at,
          commercial_area, division, is_active, source_batch_id, source_details_json, source_sheet_name,
          source_row_number, created_at, updated_at
        ) VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?)
      `);
      const updateContract = this.database.prepare(`
        UPDATE contracts
        SET order_reference = COALESCE(?, order_reference),
            starts_at = COALESCE(?, starts_at),
            ends_at = COALESCE(?, ends_at),
            commercial_area = COALESCE(?, commercial_area),
            division = COALESCE(?, division),
            is_active = COALESCE(?, is_active),
            source_details_json = ?,
            source_sheet_name = ?,
            source_row_number = ?,
            updated_at = ?
        WHERE id = ?
      `);
      const listEquipment = this.database.prepare(`
        SELECT id, model_label, serial_number, location, brand, description,
               interior, city, branch, address, is_active
        FROM contract_equipment
        WHERE contract_id = ?
      `);
      const findModel = this.database.prepare(
        'SELECT id FROM equipment_models WHERE brand = ? AND normalized_name = ?',
      );
      const insertModel = this.database.prepare(`
        INSERT INTO equipment_models (
          id, brand, model_name, normalized_name, created_at, updated_at
        ) VALUES (?, ?, ?, ?, ?, ?)
      `);
      const insertEquipment = this.database.prepare(`
        INSERT INTO contract_equipment (
          id, contract_id, model_id, model_label, serial_number, location,
          brand, description, interior, city, branch, address, is_active,
          source_details_json, source_sheet_name, source_row_number, created_at, updated_at
        ) VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?)
      `);
      const updateEquipmentMetadata = this.database.prepare(`
        UPDATE contract_equipment
        SET location = COALESCE(?, location),
            brand = COALESCE(?, brand),
            description = COALESCE(?, description),
            interior = COALESCE(?, interior),
            city = COALESCE(?, city),
            branch = COALESCE(?, branch),
            address = COALESCE(?, address),
            is_active = COALESCE(?, is_active),
            source_details_json = ?,
            source_sheet_name = ?,
            source_row_number = ?,
            updated_at = ?
        WHERE id = ?
      `);

      const customerIds = new Map<string, string>();
      const contractIds = new Map<string, string>();
      const contractEquipmentById = new Map<string, ExistingContractEquipmentRow[]>();
      const equipmentKeys = new Set<string>();
      const modelIds = new Map<string, string>();

      for (const row of rows) {
        const customerKey = normalizeCustomerName(row.customerName);
        let customerId = customerIds.get(customerKey);
        if (!customerId) {
          const existingCustomer = findCustomer.get(customerKey) as ExistingCustomerRow | undefined;
          customerId = existingCustomer?.id ?? randomUUID();
          if (existingCustomer) {
            updateCustomer.run(row.customerType, row.commercialArea, now, customerId);
          } else {
            insertCustomer.run(
              customerId,
              row.customerName,
              customerKey,
              row.customerType,
              row.commercialArea,
              now,
              now,
            );
          }
          customerIds.set(customerKey, customerId);
        }

        const contractKey = `${customerId}::${normalizeKey(row.contractReference)}`;
        let contractId = contractIds.get(contractKey);
        if (!contractId) {
          const existingContract = findContract.get(customerId, row.contractReference) as {
            id: string;
            starts_at: string | null;
            ends_at: string | null;
            order_reference: string | null;
            commercial_area: CommercialArea | null;
            division: string | null;
            is_active: number | null;
          } | undefined;
          contractId = existingContract?.id ?? randomUUID();
          if (existingContract) {
            updateContract.run(
              row.orderReference,
              row.startsAt,
              row.endsAt,
              row.commercialArea,
              row.division,
              toDbBoolean(row.active),
              serializeSourceDetails(row.sourceDetails),
              row.sourceSheetName ?? '',
              row.sourceRowNumber ?? 0,
              now,
              contractId,
            );
          } else {
            insertContract.run(
              contractId,
              customerId,
              row.contractReference,
              row.orderReference,
              row.contractType,
              row.startsAt,
              row.endsAt,
              row.commercialArea,
              row.division,
              toDbBoolean(row.active),
              batchId,
              serializeSourceDetails(row.sourceDetails),
              row.sourceSheetName ?? '',
              row.sourceRowNumber ?? 0,
              now,
              now,
            );
          }
          contractIds.set(contractKey, contractId);
        }

        const equipmentKey = `${contractId}::${normalizeModelName(row.modelLabel)}::${normalizeKey(row.serialNumber ?? '')}`;
        if (equipmentKeys.has(equipmentKey)) continue;
        equipmentKeys.add(equipmentKey);

        let contractEquipment = contractEquipmentById.get(contractId);
        if (!contractEquipment) {
          contractEquipment = listEquipment.all(contractId) as ExistingContractEquipmentRow[];
          contractEquipmentById.set(contractId, contractEquipment);
        }
        const existingEquipment = contractEquipment.find((item) =>
          normalizeModelName(item.model_label) === normalizeModelName(row.modelLabel)
          && normalizeKey(item.serial_number ?? '') === normalizeKey(row.serialNumber ?? ''),
        );
        if (existingEquipment) {
          updateEquipmentMetadata.run(
            row.location,
            row.brand,
            row.description,
            row.interior,
            row.city,
            row.branch,
            row.address,
            toDbBoolean(row.active),
            serializeSourceDetails(row.sourceDetails),
            row.sourceSheetName ?? '',
            row.sourceRowNumber ?? 0,
            now,
            existingEquipment.id,
          );
          continue;
        }

        const normalizedModel = normalizeModelName(row.modelLabel);
        let modelId = modelIds.get(normalizedModel);
        if (!modelId) {
          const existingModel = findModel.get('Canon', normalizedModel) as { id: string } | undefined;
          modelId = existingModel?.id ?? randomUUID();
          if (!existingModel) insertModel.run(modelId, 'Canon', row.modelLabel, normalizedModel, now, now);
          modelIds.set(normalizedModel, modelId);
        }
        const equipmentId = randomUUID();
        insertEquipment.run(
          equipmentId,
          contractId,
          modelId,
          row.modelLabel,
          row.serialNumber,
          row.location,
          row.brand,
          row.description,
          row.interior,
          row.city,
          row.branch,
          row.address,
          toDbBoolean(row.active),
          serializeSourceDetails(row.sourceDetails),
          row.sourceSheetName ?? '',
          row.sourceRowNumber ?? 0,
          now,
          now,
        );
        contractEquipment.push({
          id: equipmentId,
          model_label: row.modelLabel,
          serial_number: row.serialNumber,
          location: row.location,
          brand: row.brand,
          description: row.description,
          interior: row.interior,
          city: row.city,
          branch: row.branch,
          address: row.address,
          is_active: toDbBoolean(row.active),
        });
      }

      this.database
        .prepare(`
          UPDATE import_batches
          SET status = 'applied', applied_at = ?
          WHERE id = ?
        `)
        .run(now, batchId);

      return {
        customers: customerIds.size,
        contracts: contractIds.size,
        equipment: equipmentKeys.size,
      };
    })();
  }

  importLegacyFleetMetadata(
    batchId: string,
    sourceType: LegacyFleetMetadataType,
    rows: readonly LegacyFleetMetadataRow[],
  ): LegacyFleetMetadataImportResult {
    const batch = this.database
      .prepare('SELECT id FROM import_batches WHERE id = ?')
      .get(batchId) as { id: string } | undefined;
    if (!batch) throw new Error(`No existe la importación ${batchId}.`);
    if (rows.length === 0) throw new Error('La fuente de cartera no contiene filas válidas para importar.');

    return this.database.transaction(() => {
      const now = new Date().toISOString();
      const findCustomer = this.database.prepare(
        'SELECT id, customer_type, commercial_area FROM customers WHERE normalized_name = ?',
      );
      const insertCustomer = this.database.prepare(`
        INSERT INTO customers (
          id, name, normalized_name, customer_type, commercial_area,
          source_details_json, source_sheet_name, source_row_number, created_at, updated_at
        ) VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?)
      `);
      const updateCustomer = this.database.prepare(`
        UPDATE customers
        SET customer_type = COALESCE(?, customer_type),
            commercial_area = COALESCE(?, commercial_area),
            updated_at = ?
        WHERE id = ?
      `);
      const updateClassificationCustomer = this.database.prepare(`
        UPDATE customers
        SET customer_type = COALESCE(?, customer_type),
            commercial_area = COALESCE(?, commercial_area),
            source_details_json = ?,
            source_sheet_name = ?,
            source_row_number = ?,
            updated_at = ?
        WHERE id = ?
      `);
      const findContract = this.database.prepare(`
        SELECT id, contract_type, starts_at, ends_at, order_reference, commercial_area, division, is_active, requires_closure
        FROM contracts
        WHERE customer_id = ? AND lower(COALESCE(reference, '')) = lower(?)
        ORDER BY updated_at DESC, id DESC
        LIMIT 1
      `);
      const insertContract = this.database.prepare(`
        INSERT INTO contracts (
          id, customer_id, reference, order_reference, contract_type, starts_at, ends_at,
          commercial_area, division, is_active, requires_closure, source_batch_id, source_details_json,
          source_sheet_name, source_row_number, created_at, updated_at
        ) VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?)
      `);
      const updateContract = this.database.prepare(`
        UPDATE contracts
        SET order_reference = COALESCE(?, order_reference),
            contract_type = COALESCE(?, contract_type),
            starts_at = COALESCE(?, starts_at),
            ends_at = COALESCE(?, ends_at),
            commercial_area = COALESCE(?, commercial_area),
            division = COALESCE(?, division),
            is_active = COALESCE(?, is_active),
            requires_closure = COALESCE(?, requires_closure),
            source_batch_id = ?,
            source_details_json = ?,
            source_sheet_name = ?,
            source_row_number = ?,
            updated_at = ?
        WHERE id = ?
      `);

      const customerIds = new Map<string, string>();
      const contractIds = new Map<string, string>();
      let updatedCustomers = 0;
      let updatedContracts = 0;

      for (const row of rows) {
        const customerKey = normalizeCustomerName(row.customerName);
        let customerId = customerIds.get(customerKey);
        if (!customerId) {
          const existingCustomer = findCustomer.get(customerKey) as ExistingCustomerRow | undefined;
          customerId = existingCustomer?.id ?? randomUUID();
          if (existingCustomer) {
            if (sourceType === 'classification') {
              updateClassificationCustomer.run(
                row.customerType,
                row.commercialArea,
                serializeSourceDetails(row.sourceDetails),
                row.sourceSheetName ?? '',
                row.sourceRowNumber ?? 0,
                now,
                customerId,
              );
            } else {
              updateCustomer.run(row.customerType, row.commercialArea, now, customerId);
            }
            updatedCustomers += 1;
          } else {
            insertCustomer.run(
              customerId,
              row.customerName,
              customerKey,
              row.customerType,
              row.commercialArea,
              sourceType === 'classification' ? serializeSourceDetails(row.sourceDetails) : '[]',
              sourceType === 'classification' ? row.sourceSheetName ?? '' : '',
              sourceType === 'classification' ? row.sourceRowNumber ?? 0 : 0,
              now,
              now,
            );
          }
          customerIds.set(customerKey, customerId);
        }

        if (sourceType === 'classification') continue;
        const reference = cleanOptional(row.contractReference);
        if (!reference) continue;
        const contractKey = `${customerId}::${normalizeKey(reference)}`;
        if (contractIds.has(contractKey)) continue;

        const existingContract = findContract.get(customerId, reference) as {
          id: string;
          contract_type: ContractType;
          starts_at: string | null;
          ends_at: string | null;
          order_reference: string | null;
          commercial_area: CommercialArea | null;
          division: string | null;
          is_active: number | null;
          requires_closure: number | null;
        } | undefined;
        const contractId = existingContract?.id ?? randomUUID();
        if (existingContract) {
          updateContract.run(
            cleanOptional(row.orderReference),
            row.contractType,
            row.startsAt,
            row.endsAt,
            row.contractCommercialArea ?? null,
            cleanOptional(row.division),
            toDbBoolean(row.active),
            toDbBoolean(row.requiresClosure),
            batchId,
            serializeSourceDetails(row.sourceDetails),
            row.sourceSheetName ?? '',
            row.sourceRowNumber ?? 0,
            now,
            contractId,
          );
          updatedContracts += 1;
        } else {
          insertContract.run(
            contractId,
            customerId,
            reference,
            cleanOptional(row.orderReference),
            row.contractType ?? 'Mantenimiento',
            row.startsAt,
            row.endsAt,
            row.contractCommercialArea ?? null,
            cleanOptional(row.division),
            toDbBoolean(row.active),
            toDbBoolean(row.requiresClosure),
            batchId,
            serializeSourceDetails(row.sourceDetails),
            row.sourceSheetName ?? '',
            row.sourceRowNumber ?? 0,
            now,
            now,
          );
        }
        contractIds.set(contractKey, contractId);
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
        customers: customerIds.size,
        contracts: contractIds.size,
        updatedCustomers,
        updatedContracts,
      };
    })();
  }

  listContracts(query?: string): ContractRecord[] {
    return this.listCustomers(query).flatMap((customer) => customer.contracts);
  }

  importCanonDiscontinuation(batchId: string, rows: readonly CanonDiscontinuationRow[]): CanonDiscontinuationImportResult {
    const batch = this.database
      .prepare('SELECT id FROM import_batches WHERE id = ?')
      .get(batchId) as { id: string } | undefined;
    if (!batch) throw new Error(`No existe la importación ${batchId}.`);
    if (rows.length === 0) throw new Error('La lista Canon no contiene registros válidos para importar.');

    return this.database.transaction(() => {
      const now = new Date().toISOString();
      const insertItem = this.database.prepare(`
        INSERT INTO canon_discontinuation_items (
          id, model_label, normalized_model, part_code, ends_at, voltage,
          source_batch_id, source_label, source_notes_json, created_at
        ) VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?)
        ON CONFLICT (source_batch_id, normalized_model, part_code, ends_at) DO UPDATE SET
          model_label = excluded.model_label,
          source_label = excluded.source_label,
          voltage = excluded.voltage,
          source_notes_json = excluded.source_notes_json
      `);
      const keys = new Set<string>();

      for (const row of rows) {
        const modelLabel = cleanRequired(row.modelLabel, 'Cada registro Canon debe tener un modelo.');
        const normalizedModel = normalizeDiscontinuationModel(modelLabel);
        const partCode = cleanOptional(row.partCode) ?? '';
        const endsAt = cleanOptional(row.endsAt) ?? '';
        const key = `${normalizedModel}::${normalizeKey(partCode)}::${endsAt}`;
        if (keys.has(key)) continue;
        keys.add(key);
        insertItem.run(
          randomUUID(),
          modelLabel,
          normalizedModel,
          partCode,
          endsAt,
          cleanOptional(row.voltage),
          batchId,
          cleanOptional(row.source),
          serializeCanonSourceNotes(row.sourceNotes),
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

      return { items: keys.size };
    })();
  }

  importWaldbottStock(batchId: string, rows: readonly WaldbottStockRow[]): WaldbottStockImportResult {
    const batch = this.database
      .prepare('SELECT id FROM import_batches WHERE id = ?')
      .get(batchId) as { id: string } | undefined;
    if (!batch) throw new Error(`No existe la importación ${batchId}.`);
    if (rows.length === 0) throw new Error('El stock Waldbott no contiene filas válidas para importar.');

    return this.database.transaction(() => {
      const now = new Date().toISOString();
      const insertItem = this.database.prepare(`
        INSERT INTO waldbott_stock_items (
          id, model_label, normalized_model, deposit, quantity,
          source_batch_id, source_label, created_at
        ) VALUES (?, ?, ?, ?, ?, ?, ?, ?)
      `);
      const models = new Set<string>();
      let quantity = 0;

      for (const row of rows) {
        const modelLabel = cleanRequired(row.modelLabel, 'Cada registro de stock debe tener un modelo.');
        const normalizedModel = normalizeWaldbottStockModel(modelLabel);
        if (!normalizedModel) throw new Error(`No se pudo normalizar el modelo de stock ${modelLabel}.`);
        const deposit = normalizeWaldbottDeposit(row.deposit);
        if (!deposit) throw new Error(`El depósito del modelo ${modelLabel} no es el Depósito 04.`);
        if (!Number.isFinite(row.quantity) || row.quantity <= 0) {
          throw new Error(`La cantidad del modelo ${modelLabel} debe ser mayor que cero.`);
        }

        insertItem.run(
          randomUUID(),
          modelLabel,
          normalizedModel,
          deposit,
          row.quantity,
          batchId,
          cleanOptional(row.source),
          now,
        );
        models.add(normalizedModel);
        quantity += row.quantity;
      }

      this.database
        .prepare(`
          UPDATE import_batches
          SET status = 'applied', applied_at = ?
          WHERE id = ?
        `)
        .run(now, batchId);

      return { items: rows.length, models: models.size, quantity };
    })();
  }

  listEquipment(query?: string): EquipmentRecord[] {
    const parameters: string[] = [];
    const condition = query?.trim()
      ? (() => {
          const value = `%${query.trim().toLowerCase()}%`;
          parameters.push(...Array.from({ length: 20 }, () => value));
          return `
            WHERE lower(customer.name) LIKE ?
               OR lower(COALESCE(contract.reference, '')) LIKE ?
               OR lower(COALESCE(contract.order_reference, '')) LIKE ?
               OR lower(COALESCE(contract.contract_type, '')) LIKE ?
               OR lower(COALESCE(contract.starts_at, '')) LIKE ?
               OR lower(COALESCE(contract.ends_at, '')) LIKE ?
               OR lower(COALESCE(contract.commercial_area, '')) LIKE ?
               OR lower(COALESCE(contract.division, '')) LIKE ?
               OR lower(CASE WHEN contract.is_active = 1 THEN 'vigente' WHEN contract.is_active = 0 THEN 'no vigente' ELSE '' END) LIKE ?
               OR lower(CASE WHEN contract.requires_closure = 1 THEN 'requiere cierre' ELSE '' END) LIKE ?
               OR lower(equipment.model_label) LIKE ?
               OR lower(COALESCE(equipment.serial_number, '')) LIKE ?
               OR lower(COALESCE(equipment.location, '')) LIKE ?
               OR lower(COALESCE(equipment.brand, '')) LIKE ?
               OR lower(COALESCE(equipment.description, '')) LIKE ?
               OR lower(COALESCE(equipment.interior, '')) LIKE ?
               OR lower(COALESCE(equipment.branch, '')) LIKE ?
               OR lower(COALESCE(equipment.city, '')) LIKE ?
               OR lower(COALESCE(equipment.address, '')) LIKE ?
               OR lower(COALESCE(equipment.source_details_json, '')) LIKE ?
          `;
        })()
      : '';
    const rows = this.database
      .prepare(`
        SELECT
          equipment.id AS equipment_id,
          contract.id AS contract_id,
          customer.id AS customer_id,
          customer.name AS customer_name,
          contract.reference AS contract_reference,
          contract.order_reference AS order_reference,
          contract.contract_type,
          contract.starts_at AS contract_starts_at,
          contract.ends_at AS contract_ends_at,
          contract.commercial_area AS contract_commercial_area,
          contract.division AS contract_division,
          contract.is_active AS contract_is_active,
          contract.requires_closure AS contract_requires_closure,
          equipment.model_id,
          equipment.model_label,
          equipment.serial_number,
          equipment.location,
          equipment.brand,
          equipment.description,
          equipment.interior,
          equipment.city,
          equipment.branch,
          equipment.address,
          equipment.is_active,
          equipment.source_details_json,
          equipment.source_sheet_name,
          equipment.source_row_number
        FROM contract_equipment equipment
        JOIN contracts contract ON contract.id = equipment.contract_id
        JOIN customers customer ON customer.id = contract.customer_id
        ${condition}
        ORDER BY customer.name COLLATE NOCASE, equipment.model_label COLLATE NOCASE, equipment.id
      `)
      .all(...parameters) as EquipmentRow[];

    return rows.map((row) => ({
      id: row.equipment_id,
      contractId: row.contract_id,
      customerId: row.customer_id,
      customerName: row.customer_name,
      contractReference: row.contract_reference,
      orderReference: row.order_reference,
      contractType: row.contract_type,
      contractStartsAt: row.contract_starts_at,
      contractEndsAt: row.contract_ends_at,
      contractCommercialArea: row.contract_commercial_area,
      contractDivision: row.contract_division,
      contractIsActive: toBoolean(row.contract_is_active),
      contractRequiresClosure: toBoolean(row.contract_requires_closure),
      modelId: row.model_id,
      modelLabel: row.model_label,
      serialNumber: row.serial_number,
      location: row.location,
      brand: row.brand,
      description: row.description,
      interior: row.interior,
      city: row.city,
      branch: row.branch,
      address: row.address,
      isActive: toBoolean(row.is_active),
      sourceDetails: parseSourceDetails(row.source_details_json),
      sourceSheetName: row.source_sheet_name,
      sourceRowNumber: row.source_row_number,
    }));
  }

  listModelDiscontinuation(): ModelDiscontinuationRecord[] {
    return this.listModelDiscontinuationForEquipment(this.listEquipment());
  }

  getDiscontinuationOverview(): DiscontinuationOverviewSnapshot {
    const portfolio = this.getPortfolioSnapshot();
    const modelItems = this.listModelDiscontinuationForEquipment(portfolio.equipment);
    const stockItems = this.listWaldbottStockForPortfolio(portfolio.equipment, modelItems);
    return { customers: portfolio.customers, modelItems, stockItems };
  }

  private listModelDiscontinuationForEquipment(equipment: readonly EquipmentRecord[]): ModelDiscontinuationRecord[] {
    const equipmentByModel = new Map<string, EquipmentRecord[]>();
    for (const item of equipment) {
      const key = normalizeDiscontinuationModel(item.modelLabel);
      const matching = equipmentByModel.get(key) ?? [];
      matching.push(item);
      equipmentByModel.set(key, matching);
    }
    const today = new Date().toISOString().slice(0, 10);
    const rows = this.database
      .prepare(`
        SELECT
          item.id,
          item.model_label,
          item.normalized_model,
          item.part_code,
          item.ends_at,
          item.voltage,
          item.source_notes_json,
          batch.source_name,
          item.source_label,
          item.created_at
        FROM canon_discontinuation_items item
        JOIN import_batches batch ON batch.id = item.source_batch_id
        WHERE batch.status = 'applied'
        ORDER BY item.created_at DESC, item.id DESC
      `)
      .all() as CanonDiscontinuationDbRow[];

    const latestByKey = new Map<string, CanonDiscontinuationDbRow>();
    for (const row of rows) {
      const key = `${row.normalized_model}::${normalizeKey(row.part_code)}::${row.ends_at}`;
      if (!latestByKey.has(key)) latestByKey.set(key, row);
    }

    return [...latestByKey.values()]
      .map((row) => {
        const endsAt = row.ends_at || null;
        const installed = equipmentByModel.get(row.normalized_model) ?? [];
        const status: ModelDiscontinuationRecord['status'] = endsAt && endsAt <= today ? 'discontinued' : 'scheduled';
        return {
          id: row.id,
          modelLabel: row.model_label,
          partCode: row.part_code,
          endsAt,
          voltage: row.voltage,
          sourceNotes: parseCanonSourceNotes(row.source_notes_json),
          sourceName: row.source_name,
          sourceLabel: row.source_label,
          installedCount: installed.length,
          installedModels: [...new Set(installed.map((item) => item.modelLabel))],
          status,
        };
      })
      .sort((left, right) => (left.endsAt ?? '9999-12-31').localeCompare(right.endsAt ?? '9999-12-31') || left.modelLabel.localeCompare(right.modelLabel));
  }

  listWaldbottStock(): WaldbottStockRecord[] {
    const latestBatch = this.database
      .prepare(`
        SELECT batch.id
        FROM import_batches batch
        WHERE batch.domain = 'operations-waldbott' AND batch.status = 'applied'
        ORDER BY COALESCE(batch.applied_at, batch.created_at) DESC, batch.id DESC
        LIMIT 1
      `)
      .get() as { id: string } | undefined;
    if (!latestBatch) return [];

    const equipment = this.listEquipment();
    const supportItems = this.listModelDiscontinuationForEquipment(equipment);
    return this.listWaldbottStockForPortfolio(equipment, supportItems, latestBatch.id);
  }

  private listWaldbottStockForPortfolio(
    equipment: readonly EquipmentRecord[],
    supportItems: readonly ModelDiscontinuationRecord[],
    batchId?: string,
  ): WaldbottStockRecord[] {
    const latestBatchId = batchId ?? (this.database
      .prepare(`
        SELECT batch.id
        FROM import_batches batch
        WHERE batch.domain = 'operations-waldbott' AND batch.status = 'applied'
        ORDER BY COALESCE(batch.applied_at, batch.created_at) DESC, batch.id DESC
        LIMIT 1
      `)
      .get() as { id: string } | undefined)?.id;
    if (!latestBatchId) return [];

    const rows = this.database
      .prepare(`
        SELECT
          item.id,
          item.model_label,
          item.normalized_model,
          item.deposit,
          item.quantity,
          batch.source_name,
          item.source_label,
          item.created_at
        FROM waldbott_stock_items item
        JOIN import_batches batch ON batch.id = item.source_batch_id
        WHERE item.source_batch_id = ? AND batch.status = 'applied'
        ORDER BY item.created_at, item.rowid, item.id
      `)
      .all(latestBatchId) as WaldbottStockDbRow[];

    const groups = new Map<string, {
      id: string;
      modelLabel: string;
      normalizedModel: string;
      deposit: string;
      quantity: number;
      sourceNames: Set<string>;
    }>();
    for (const row of rows) {
      const current = groups.get(row.normalized_model);
      const sourceName = row.source_label || row.source_name;
      if (current) {
        current.quantity += row.quantity;
        current.sourceNames.add(sourceName);
        continue;
      }
      groups.set(row.normalized_model, {
        id: row.id,
        modelLabel: row.model_label,
        normalizedModel: row.normalized_model,
        deposit: row.deposit,
        quantity: row.quantity,
        sourceNames: new Set([sourceName]),
      });
    }

    const preparedSupportItems = supportItems.map((item) => ({ item, match: prepareModelMatch(item.modelLabel) }));
    const preparedEquipment = equipment.map((item) => ({ item, match: prepareModelMatch(item.modelLabel) }));
    return [...groups.values()]
      .map((group) => {
        const groupMatch = prepareModelMatch(group.modelLabel);
        const support = bestModelSupport(groupMatch, preparedSupportItems);
        const installed = preparedEquipment
          .filter((candidate) => preparedModelMatchScore(groupMatch, candidate.match) >= 60)
          .map((candidate) => candidate.item);
        return {
          id: group.id,
          modelLabel: group.modelLabel,
          deposit: group.deposit,
          quantity: group.quantity,
          sourceNames: [...group.sourceNames],
          canonStatus: support ? modelSupportStatus(support.endsAt) : 'unknown',
          canonModelLabel: support?.modelLabel ?? null,
          canonEndsAt: support?.endsAt ?? null,
          installedCount: installed.length,
          installedModels: [...new Set(installed.map((item) => item.modelLabel))],
        } satisfies WaldbottStockRecord;
      })
      .sort((left, right) =>
        right.installedCount - left.installedCount
        || compareSupportDates(left.canonEndsAt, right.canonEndsAt)
        || right.quantity - left.quantity
        || left.modelLabel.localeCompare(right.modelLabel, 'es'),
      );
  }
}

const imageRunnerAdvancePattern = /IMAGE\s*RUNNER\s*ADVANCE/g;
const imageRunnerPattern = /IMAGE\s*RUNNER/g;
const imageRunnerShortPattern = /I\s*-?\s*R\s*-?\s*ADV/g;
const imageRunnerCanonPattern = /\bIRC(?=\s*\d)/g;
const equipmentNamePattern = /\b(SISTEMA|LASER|DIGITAL|SCANNER|ESCANER|IMPRESORA|PRINTER|FOTOCOPIADORA|MULTIFUNCIONAL|COPIADORA|CANON|SER)\b/g;
const modelVoltageAnnotationPattern = /\s*\(\s*\d{2,6}(?:-\d{2,6})?\s*V\s*\)\s*$/i;
const modelCodePattern = /(?:IRADVC|IRADV|IR|IMAGEPRESS|VARIOPRINT|PLOTWAVE|COLORWAVE|LBP|MF|PIXMA|MAXIFY)?[A-Z]*\d{3,5}[A-Z0-9]*/;

function normalizeWaldbottDeposit(value: string): string | null {
  const key = normalizeKey(value.replace(/\s/g, ''));
  return key === '04' || key === '4' ? '04' : null;
}

function normalizeWaldbottStockModel(value: string): string {
  return normalizeKey(
    value
      .normalize('NFD')
      .replace(/[\u0300-\u036f]/g, '')
      .toUpperCase()
      .replace(/IMAGE\s*RUNNER\s*ADVANCED?/g, 'IR ADV ')
      .replace(/IR\s*ADVANCED?/g, 'IR ADV ')
      .replace(/IRADVANCED?/g, 'IR ADV ')
      .replace(/IR\s*-?\s*ADV/g, 'IR ADV ')
      .replace(/IR\s*-?\s*DX(?=[A-Z0-9])/g, 'IR DX ')
      .replace(/\bIF[\s-]*1643\s*F[\s-]*AE\b/g, 'IR 1643I ')
      .replace(/\bPIXMA\s*[- ]?\s*GX\s*(\d{4})\b/g, 'GX$1 ')
      .replace(/\s*(?:\+|[WC]\s*\/).*$/g, ' ')
      .replace(/\s+DADF[-\s]*[A-Z0-9-]+.*$/g, ' ')
      .replace(/\b\d{2,6}(?:-\d{2,6})?\s*V/g, ' ')
      .replace(/\b\d{2,6}HZ\b/g, ' ')
      .replace(/\b(?:USED|USADO|USADA|USADOS|USADAS|SR|LTN)\b/g, ' ')
      .replace(/\b(?:SISTEMA|LASER|DIGITAL|SCANNER|ESCANER|IMPRESORA|PRINTER|FOTOCOPIADORA|MULTIFUNCIONAL|COPIADORA|CANON|SER)\b/g, ' '),
  );
}

function modelMatchKey(value: string): string {
  const simplified = value
    .normalize('NFD')
    .replace(/[\u0300-\u036f]/g, '')
    .replace(modelVoltageAnnotationPattern, ' ')
    .toUpperCase()
    .replace(imageRunnerAdvancePattern, 'IR ADV')
    .replace(imageRunnerPattern, 'IR')
    .replace(imageRunnerShortPattern, 'IR ADV')
    .replace(imageRunnerCanonPattern, 'IR ADV C')
    .replace(equipmentNamePattern, ' ');
  return normalizeKey(simplified);
}

function modelMatchAliases(value: string): string[] {
  const key = modelMatchKey(value);
  return [...new Set([key, key.replace(/^IRADVC(?=\d)/, 'IRADV'), key.replace(/^IRADV(?=\d)/, 'IRADVC')])];
}

type PreparedModelMatch = {
  aliases: string[];
  codes: string[];
};

type PreparedModelCandidate<T> = {
  item: T;
  match: PreparedModelMatch;
};

function prepareModelMatch(value: string): PreparedModelMatch {
  const aliases = modelMatchAliases(value);
  return {
    aliases,
    codes: aliases.flatMap((key) => {
      const code = key.match(modelCodePattern)?.[0];
      return code ? [code] : [];
    }),
  };
}

function preparedModelMatchScore(left: PreparedModelMatch, right: PreparedModelMatch): number {
  let bestScore = 0;
  for (const leftKey of left.aliases) {
    for (const rightKey of right.aliases) {
      if (!leftKey || !rightKey) continue;
      if (leftKey === rightKey) bestScore = Math.max(bestScore, 100);
      else if (leftKey.includes(rightKey) || rightKey.includes(leftKey)) bestScore = Math.max(bestScore, 80);
    }
  }
  if (bestScore < 60 && left.codes.some((leftCode) => right.codes.includes(leftCode))) bestScore = 60;
  return bestScore;
}

function bestModelSupport(
  model: PreparedModelMatch,
  items: readonly PreparedModelCandidate<ModelDiscontinuationRecord>[],
): ModelDiscontinuationRecord | undefined {
  let best: ModelDiscontinuationRecord | undefined;
  let bestScore = 0;
  for (const candidate of items) {
    const score = preparedModelMatchScore(model, candidate.match);
    if (
      score > bestScore
      || (score === bestScore && best && normalizeKey(candidate.item.modelLabel).length > normalizeKey(best.modelLabel).length)
    ) {
      best = candidate.item;
      bestScore = score;
    }
  }
  return best;
}

function modelSupportStatus(endsAt: string | null): WaldbottStockRecord['canonStatus'] {
  if (!endsAt) return 'supported';
  const today = new Date();
  const todayText = today.toISOString().slice(0, 10);
  if (endsAt <= todayText) return 'discontinued';
  const reviewDate = new Date(today);
  reviewDate.setFullYear(reviewDate.getFullYear() + 1);
  return endsAt <= reviewDate.toISOString().slice(0, 10) ? 'scheduled' : 'supported';
}

function compareSupportDates(left: string | null, right: string | null): number {
  if (left && right) return left.localeCompare(right);
  if (left) return -1;
  if (right) return 1;
  return 0;
}

function serializeCanonSourceNotes(values: readonly string[] | undefined): string {
  return JSON.stringify([...new Set((values ?? []).map((value) => value.trim()).filter(Boolean))]);
}

function parseCanonSourceNotes(value: string | null | undefined): string[] {
  if (!value) return [];
  try {
    const parsed = JSON.parse(value) as unknown;
    if (!Array.isArray(parsed)) return [];
    return [...new Set(parsed.filter((item): item is string => typeof item === 'string').map((item) => item.trim()).filter(Boolean))];
  } catch {
    return [];
  }
}

export function normalizeCustomerName(value: string): string {
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

function normalizeDiscontinuationModel(value: string): string {
  return value
    .normalize('NFD')
    .replace(/[\u0300-\u036f]/g, '')
    .toUpperCase()
    .replace(/[^A-Z0-9]+/g, '');
}

function normalizeKey(value: string): string {
  return value
    .normalize('NFD')
    .replace(/[\u0300-\u036f]/g, '')
    .trim()
    .replace(/\s+/g, ' ')
    .toUpperCase()
    .replace(/[^A-Z0-9]+/g, '');
}

function compareNoCase(left: string, right: string): number {
  return left.toLowerCase().localeCompare(right.toLowerCase()) || left.localeCompare(right);
}

function cleanRequired(value: string, message: string): string {
  const cleaned = value.trim().replace(/\s+/g, ' ');
  if (!cleaned) throw new Error(message);
  return cleaned;
}

function cleanOptional(value: string | null | undefined): string | null {
  if (value === null || value === undefined) return null;
  const cleaned = value.trim().replace(/\s+/g, ' ');
  return cleaned || null;
}

function toBoolean(value: number | null): boolean | null {
  if (value === null || value === undefined) return null;
  return value === 1;
}

function toDbBoolean(value: boolean | null | undefined): number | null {
  if (value === null || value === undefined) return null;
  return value ? 1 : 0;
}
