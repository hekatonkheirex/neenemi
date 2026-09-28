import type { SuiteDatabase } from '../../db/database';
import { normalizePartCode } from './normalization';

function createCatalogId(): string {
  return globalThis.crypto.randomUUID();
}

export type CatalogPartInput = {
  brand: string;
  code: string;
  description: string;
  models: readonly string[];
  stock: number;
  priceUsd: number;
  priceLocal: number;
  markup: number;
  discontinuedAt: string | null;
  /** False when the source explicitly reports that the USD cost is unavailable. */
  costAvailable?: boolean;
  group?: string | null;
  reference?: string | null;
  usefulLife?: string | null;
};

export type CatalogServiceItemKind = 'labor' | 'fixed';

export type CatalogServiceItemInput = {
  brand: string;
  familyName: string;
  modelName: string;
  kind: CatalogServiceItemKind;
  description: string;
  fixedPriceLocal: number | null;
};

export type CatalogModelNoteInput = {
  brand: string;
  familyName: string;
  modelName: string;
  note: string;
};

export type CatalogModelFamilyInput = {
  brand: string;
  familyName: string;
  modelName: string;
  /** Tipo de cambio que acompañaba a la familia en el archivo legado. */
  exchangeRate?: number | null;
  /** Factor de venta que acompañaba a la familia en el archivo legado. */
  factor?: number | null;
};

export type CatalogPart = {
  id: string;
  brand: string;
  code: string;
  description: string;
  models: string[];
  stock: number;
  priceUsd: number;
  priceLocal: number;
  markup: number;
  discontinuedAt: string | null;
  costAvailable?: boolean;
  group?: string | null;
  reference?: string | null;
  usefulLife?: string | null;
};

export type CatalogServiceItem = CatalogServiceItemInput & {
  id: string;
  sourceBatchId: string;
  sourceName: string;
};

export type CatalogModelNote = CatalogModelNoteInput & {
  id: string;
  sourceBatchId: string;
  sourceName: string;
};

export type CatalogFamilySummary = {
  familyName: string;
  modelNames: string[];
  serviceItemCount: number;
  noteCount: number;
  exchangeRate: number | null;
  factor: number | null;
};

export type CatalogFamilyPricing = {
  exchangeRate: number | null;
  factor: number | null;
};

export type CatalogSourceFile = {
  batchId: string;
  fileId: string;
  fileName: string;
  updatedAt: string;
};

export type CatalogQuery = {
  query?: string;
  familyName?: string;
  modelName?: string;
  modelLinkedOnly?: boolean;
  stockOnly?: boolean;
  excludeDiscontinued?: boolean;
};

export type CatalogServiceQuery = {
  query?: string;
  modelName?: string;
};

export type CatalogReplaceOptions = {
  replaceAll?: boolean;
  modelNotes?: readonly CatalogModelNoteInput[];
  serviceItems?: readonly CatalogServiceItemInput[];
  modelFamilies?: readonly CatalogModelFamilyInput[];
};

type CatalogPartRow = {
  id: string;
  brand: string;
  code: string;
  description: string;
  models: string | null;
  stock: number | null;
  markup: number | null;
  discontinued_at: string | null;
  price_usd: number | null;
  price_local: number | null;
  cost_available: number | null;
  category: string | null;
  legacy_reference: string | null;
  useful_life: string | null;
};

type CatalogModelNoteRow = {
  id: string;
  brand: string;
  family_name: string;
  model_name: string;
  note: string;
  source_batch_id: string;
  source_name: string;
};

type CatalogServiceItemRow = {
  id: string;
  brand: string;
  family_name: string;
  model_name: string;
  item_kind: CatalogServiceItemKind;
  description: string;
  fixed_price_local: number | null;
  source_batch_id: string;
  source_name: string;
};

type CatalogFamilyRow = {
  family_name: string;
  model_name: string;
  normalized_model_name: string;
  exchange_rate: number | null;
  pricing_factor: number | null;
  source_kind: 'model' | 'note' | 'service';
};

type CatalogFamilyPricingRow = {
  exchange_rate: number | null;
  pricing_factor: number | null;
};

export class CatalogRepository {
  constructor(private readonly database: SuiteDatabase) {}

  getLatestSourceFile(): CatalogSourceFile | null {
    const row = this.database
      .prepare(`
        SELECT
          batches.id AS batch_id,
          files.id AS file_id,
          files.file_name,
          COALESCE(batches.applied_at, batches.created_at) AS updated_at
        FROM import_batches batches
        JOIN import_files files ON files.batch_id = batches.id
        WHERE batches.domain = 'catalog'
          AND batches.status = 'applied'
        ORDER BY updated_at DESC, files.created_at ASC, files.id ASC
        LIMIT 1
      `)
      .get() as {
      batch_id: string;
      file_id: string;
      file_name: string;
      updated_at: string;
    } | undefined;

    return row
      ? {
          batchId: row.batch_id,
          fileId: row.file_id,
          fileName: row.file_name,
          updatedAt: row.updated_at,
        }
      : null;
  }

  getById(id: string): CatalogPart | undefined {
    const row = this.database
      .prepare(`
        SELECT
          p.id,
          p.brand,
          p.code,
          p.description,
          p.category,
          p.legacy_reference,
          p.useful_life,
          p.cost_available,
          GROUP_CONCAT(model.model_name, '|') AS models,
          inventory.stock,
          inventory.markup,
          inventory.discontinued_at,
          price_usd.amount AS price_usd,
          price_local.amount AS price_local
        FROM parts p
        LEFT JOIN part_model model_link ON model_link.part_id = p.id
        LEFT JOIN equipment_models model ON model.id = model_link.model_id
        LEFT JOIN inventory_snapshots inventory ON inventory.id = (
          SELECT snapshot.id
          FROM inventory_snapshots snapshot
          WHERE snapshot.part_id = p.id
          ORDER BY snapshot.captured_at DESC, snapshot.id DESC
          LIMIT 1
        )
        LEFT JOIN part_prices price_usd ON price_usd.id = (
          SELECT price.id
          FROM part_prices price
          WHERE price.part_id = p.id AND price.currency = 'USD'
          ORDER BY price.created_at DESC, price.id DESC
          LIMIT 1
        )
        LEFT JOIN part_prices price_local ON price_local.id = (
          SELECT price.id
          FROM part_prices price
          WHERE price.part_id = p.id AND price.currency = 'PYG'
          ORDER BY price.created_at DESC, price.id DESC
          LIMIT 1
        )
        WHERE p.id = ? AND p.brand = 'Canon'
        GROUP BY p.id, p.brand, p.code, p.description,
          p.category, p.legacy_reference, p.useful_life, p.cost_available,
          inventory.stock, inventory.markup, inventory.discontinued_at,
          price_usd.amount, price_local.amount
      `)
      .get(id) as CatalogPartRow | undefined;

    return row ? this.toCatalogPart(row) : undefined;
  }

  replaceFromBatch(
    batchId: string,
    inputParts: readonly CatalogPartInput[],
    options: CatalogReplaceOptions = {},
  ): { parts: number; models: number } {
    const batch = this.database
      .prepare('SELECT id FROM import_batches WHERE id = ?')
      .get(batchId) as { id: string } | undefined;
    if (!batch) {
      throw new Error(`No existe la importación ${batchId}.`);
    }

    const modelNotes = normalizeModelNotes(options.modelNotes ?? []);
    const serviceItems = normalizeServiceItems(options.serviceItems ?? []);
    const modelFamilies = normalizeModelFamilies(options.modelFamilies ?? []);

    const uniqueParts = new Map<string, CatalogPartInput>();
    for (const input of inputParts) {
      const normalizedCode = normalizePartCode(input.code);
      if (!normalizedCode) {
        throw new Error('Cada repuesto debe tener un código no vacío.');
      }
      if (input.stock < 0 || input.priceUsd < 0 || input.priceLocal < 0 || input.markup < 0) {
        throw new Error(`Los valores numéricos del repuesto ${input.code} no son válidos.`);
      }
      uniqueParts.set(`${input.brand}:${normalizedCode}`, { ...input, code: input.code.trim() });
    }

    const replace = this.database.transaction(() => {
      if (options.replaceAll) {
        this.database.prepare('DELETE FROM parts WHERE brand = ?').run('Canon');
        this.database.prepare('DELETE FROM catalog_model_notes WHERE brand = ?').run('Canon');
        this.database.prepare('DELETE FROM catalog_service_items WHERE brand = ?').run('Canon');
        this.database.prepare('DELETE FROM catalog_model_families WHERE brand = ?').run('Canon');
      }

      this.database.prepare('DELETE FROM part_prices WHERE source_batch_id = ?').run(batchId);
      this.database.prepare('DELETE FROM inventory_snapshots WHERE source_batch_id = ?').run(batchId);
      this.database.prepare('DELETE FROM catalog_model_notes WHERE source_batch_id = ?').run(batchId);
      this.database.prepare('DELETE FROM catalog_service_items WHERE source_batch_id = ?').run(batchId);
      this.database.prepare('DELETE FROM catalog_model_families WHERE source_batch_id = ?').run(batchId);

      const modelIds = new Set<string>();
      const partIds = new Set<string>();
      const now = new Date().toISOString();

      for (const input of uniqueParts.values()) {
        const normalizedCode = normalizePartCode(input.code);
        const existingPart = this.database
          .prepare('SELECT id, category, legacy_reference, useful_life, cost_available FROM parts WHERE brand = ? AND normalized_code = ?')
          .get(input.brand, normalizedCode) as {
            id: string;
            category: string | null;
            legacy_reference: string | null;
            useful_life: string | null;
            cost_available: number | null;
          } | undefined;
        const partId = existingPart?.id ?? createCatalogId();

        if (existingPart) {
            this.database
            .prepare(`
              UPDATE parts
              SET code = ?, description = ?, category = ?, legacy_reference = ?, useful_life = ?, cost_available = ?, updated_at = ?
              WHERE id = ?
            `)
            .run(
              input.code.trim(),
              input.description.trim(),
              input.group === undefined ? existingPart.category : normalizeOptionalText(input.group),
              input.reference === undefined ? existingPart.legacy_reference : normalizeOptionalText(input.reference),
              input.usefulLife === undefined ? existingPart.useful_life : normalizeOptionalText(input.usefulLife),
              input.costAvailable === undefined
                ? (existingPart.cost_available !== 0 ? 1 : 0)
                : input.costAvailable ? 1 : 0,
              now,
              partId,
            );
        } else {
          this.database
            .prepare(`
              INSERT INTO parts (
                id, brand, code, normalized_code, description, category, legacy_reference, useful_life,
                cost_available, created_at, updated_at
              ) VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?)
            `)
            .run(
              partId,
              input.brand,
              input.code.trim(),
              normalizedCode,
              input.description.trim(),
              normalizeOptionalText(input.group),
              normalizeOptionalText(input.reference),
              normalizeOptionalText(input.usefulLife),
              input.costAvailable === undefined ? (input.priceUsd > 0 ? 1 : 0) : input.costAvailable ? 1 : 0,
              now,
              now,
            );
        }

        partIds.add(partId);
        this.database.prepare('DELETE FROM part_model WHERE part_id = ?').run(partId);

        for (const modelName of uniqueNonEmpty(input.models)) {
          const normalizedModelName = normalizeModelName(modelName);
          const model = this.database
            .prepare('SELECT id FROM equipment_models WHERE brand = ? AND normalized_name = ?')
            .get(input.brand, normalizedModelName) as { id: string } | undefined;
          const modelId = model?.id ?? createCatalogId();

          if (!model) {
            this.database
              .prepare(`
                INSERT INTO equipment_models (
                  id, brand, model_name, normalized_name, created_at, updated_at
                ) VALUES (?, ?, ?, ?, ?, ?)
              `)
              .run(modelId, input.brand, modelName.trim(), normalizedModelName, now, now);
          }

          this.database
            .prepare('INSERT INTO part_model (part_id, model_id, source_batch_id) VALUES (?, ?, ?)')
            .run(partId, modelId, batchId);
          modelIds.add(modelId);
        }

        this.database
          .prepare(`
            INSERT INTO part_prices (
              id, part_id, currency, amount, source_batch_id, created_at
            ) VALUES (?, ?, 'USD', ?, ?, ?), (?, ?, 'PYG', ?, ?, ?)
          `)
          .run(
            createCatalogId(),
            partId,
            input.priceUsd,
            batchId,
            now,
            createCatalogId(),
            partId,
            input.priceLocal,
            batchId,
            now,
          );

        this.database
          .prepare(`
            INSERT INTO inventory_snapshots (
              id, part_id, stock, markup, discontinued_at, source_batch_id, captured_at
            ) VALUES (?, ?, ?, ?, ?, ?, ?)
          `)
          .run(
            createCatalogId(),
            partId,
            input.stock,
            input.markup,
            input.discontinuedAt,
            batchId,
            now,
        );
      }

      const auxiliaryModelLabels = new Map<string, { brand: string; modelName: string }>();
      for (const value of modelFamilies) {
        auxiliaryModelLabels.set(`${value.brand}:${normalizeModelName(value.modelName)}`, {
          brand: value.brand,
          modelName: value.modelName,
        });
      }
      for (const value of modelNotes) {
        auxiliaryModelLabels.set(`${value.brand}:${normalizeModelName(value.modelName)}`, {
          brand: value.brand,
          modelName: value.modelName,
        });
      }
      for (const value of serviceItems) {
        auxiliaryModelLabels.set(`${value.brand}:${normalizeModelName(value.modelName)}`, {
          brand: value.brand,
          modelName: value.modelName,
        });
      }
      for (const { brand, modelName } of auxiliaryModelLabels.values()) {
        const normalizedModelName = normalizeModelName(modelName);
        const model = this.database
          .prepare('SELECT id FROM equipment_models WHERE brand = ? AND normalized_name = ?')
          .get(brand, normalizedModelName) as { id: string } | undefined;
        const modelId = model?.id ?? createCatalogId();
        if (!model) {
          this.database
            .prepare(`
              INSERT INTO equipment_models (
                id, brand, model_name, normalized_name, created_at, updated_at
              ) VALUES (?, ?, ?, ?, ?, ?)
            `)
            .run(modelId, brand, modelName, normalizedModelName, now, now);
        }
        modelIds.add(modelId);
      }

      const modelFamilyInsert = this.database.prepare(`
        INSERT INTO catalog_model_families (
          id, brand, family_name, normalized_family_name, model_name,
          normalized_model_name, exchange_rate, pricing_factor, source_batch_id, created_at
        ) VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?)
      `);
      for (const family of modelFamilies) {
        modelFamilyInsert.run(
          createCatalogId(),
          family.brand,
          family.familyName,
          normalizeModelName(family.familyName),
          family.modelName,
          normalizeModelName(family.modelName),
          family.exchangeRate ?? null,
          family.factor ?? null,
          batchId,
          now,
        );
      }

      const modelNoteInsert = this.database.prepare(`
        INSERT INTO catalog_model_notes (
          id, brand, family_name, model_name, normalized_model_name,
          note, source_batch_id, created_at
        ) VALUES (?, ?, ?, ?, ?, ?, ?, ?)
      `);
      for (const note of modelNotes) {
        modelNoteInsert.run(
          createCatalogId(),
          note.brand,
          note.familyName,
          note.modelName,
          normalizeModelName(note.modelName),
          note.note,
          batchId,
          now,
        );
      }

      const serviceItemInsert = this.database.prepare(`
        INSERT INTO catalog_service_items (
          id, brand, family_name, model_name, normalized_model_name,
          item_kind, description, fixed_price_local, source_batch_id, created_at
        ) VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?)
      `);
      for (const item of serviceItems) {
        serviceItemInsert.run(
          createCatalogId(),
          item.brand,
          item.familyName,
          item.modelName,
          normalizeModelName(item.modelName),
          item.kind,
          item.description,
          item.fixedPriceLocal,
          batchId,
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

      return { parts: partIds.size, models: modelIds.size };
    });

    return replace();
  }

  list(query: CatalogQuery): CatalogPart[] {
    const conditions = ['p.brand = ?'];
    const parameters: Array<string | number> = ['Canon'];

    if (query.modelLinkedOnly) {
      conditions.push(`EXISTS (
        SELECT 1
        FROM part_model linked_model
        WHERE linked_model.part_id = p.id
      )`);
    }

    if (query.query?.trim()) {
      const normalizedQuery = normalizePartCode(query.query);
      const descriptionQuery = `%${query.query.trim().toLowerCase()}%`;
      conditions.push('(p.normalized_code LIKE ? OR lower(p.description) LIKE ?)');
      parameters.push(`%${normalizedQuery}%`, descriptionQuery);
    }

    if (query.familyName?.trim()) {
      conditions.push(`EXISTS (
        SELECT 1
        FROM part_model family_part_link
        JOIN equipment_models family_model ON family_model.id = family_part_link.model_id
        JOIN catalog_model_families family ON family.brand = family_model.brand
          AND family.normalized_model_name = family_model.normalized_name
        WHERE family_part_link.part_id = p.id
          AND family.brand = ?
          AND family.normalized_family_name = ?
      )`);
      parameters.push('Canon', normalizeModelName(query.familyName));
    }

    if (query.modelName?.trim()) {
      conditions.push(`EXISTS (
        SELECT 1
        FROM part_model model_link
        JOIN equipment_models model ON model.id = model_link.model_id
        WHERE model_link.part_id = p.id
          AND model.normalized_name LIKE ? ESCAPE '\\'
      )`);
      parameters.push(modelNameSearchPattern(query.modelName));
    }

    if (query.stockOnly) {
      conditions.push('COALESCE(inventory.stock, 0) > 0');
    }

    if (query.excludeDiscontinued) {
      conditions.push("COALESCE(inventory.discontinued_at, '') = ''");
    }

    const rows = this.database
      .prepare(`
        SELECT
          p.id,
          p.brand,
          p.code,
          p.description,
          p.category,
          p.legacy_reference,
          p.useful_life,
          p.cost_available,
          GROUP_CONCAT(model.model_name, '|') AS models,
          inventory.stock,
          inventory.markup,
          inventory.discontinued_at,
          price_usd.amount AS price_usd,
          price_local.amount AS price_local
        FROM parts p
        LEFT JOIN part_model model_link ON model_link.part_id = p.id
        LEFT JOIN equipment_models model ON model.id = model_link.model_id
        LEFT JOIN inventory_snapshots inventory ON inventory.id = (
          SELECT snapshot.id
          FROM inventory_snapshots snapshot
          WHERE snapshot.part_id = p.id
          ORDER BY snapshot.captured_at DESC, snapshot.id DESC
          LIMIT 1
        )
        LEFT JOIN part_prices price_usd ON price_usd.id = (
          SELECT price.id
          FROM part_prices price
          WHERE price.part_id = p.id AND price.currency = 'USD'
          ORDER BY price.created_at DESC, price.id DESC
          LIMIT 1
        )
        LEFT JOIN part_prices price_local ON price_local.id = (
          SELECT price.id
          FROM part_prices price
          WHERE price.part_id = p.id AND price.currency = 'PYG'
          ORDER BY price.created_at DESC, price.id DESC
          LIMIT 1
        )
        WHERE ${conditions.join(' AND ')}
        GROUP BY p.id, p.brand, p.code, p.description,
          p.category, p.legacy_reference, p.useful_life, p.cost_available,
          inventory.stock, inventory.markup, inventory.discontinued_at,
          price_usd.amount, price_local.amount
        ORDER BY p.code COLLATE NOCASE
      `)
      .all(...parameters) as CatalogPartRow[];

    return rows.map((row) => this.toCatalogPart(row));
  }

  listModelNotes(): CatalogModelNote[] {
    const rows = this.database
      .prepare(`
        SELECT
          notes.id,
          notes.brand,
          notes.family_name,
          notes.model_name,
          notes.note,
          notes.source_batch_id,
          batches.source_name
        FROM catalog_model_notes notes
        JOIN import_batches batches ON batches.id = notes.source_batch_id
        WHERE notes.brand = ?
        ORDER BY notes.family_name COLLATE NOCASE, notes.model_name COLLATE NOCASE
      `)
      .all('Canon') as CatalogModelNoteRow[];

    return rows.map((row) => ({
      id: row.id,
      brand: row.brand,
      familyName: row.family_name,
      modelName: row.model_name,
      note: row.note,
      sourceBatchId: row.source_batch_id,
      sourceName: row.source_name,
    }));
  }

  getFamilyPricing(familyName: string): CatalogFamilyPricing | null {
    const normalizedFamilyName = normalizeModelName(familyName);
    if (!normalizedFamilyName) return null;

    const row = this.database
      .prepare(`
        SELECT families.exchange_rate, families.pricing_factor
        FROM catalog_model_families families
        WHERE families.brand = ?
          AND families.normalized_family_name = ?
          AND (families.exchange_rate IS NOT NULL OR families.pricing_factor IS NOT NULL)
        ORDER BY families.created_at DESC, families.id DESC
        LIMIT 1
      `)
      .get('Canon', normalizedFamilyName) as CatalogFamilyPricingRow | undefined;

    return row
      ? { exchangeRate: row.exchange_rate, factor: row.pricing_factor }
      : null;
  }

  listFamilySummaries(): CatalogFamilySummary[] {
    const rows = this.database
      .prepare(`
        SELECT family_name, model_name, normalized_model_name,
          exchange_rate, pricing_factor, source_kind
        FROM (
          SELECT
            families.family_name,
            families.model_name,
            families.normalized_model_name,
            families.exchange_rate,
            families.pricing_factor,
            'model' AS source_kind
          FROM catalog_model_families families
          WHERE families.brand = ?
          UNION ALL
          SELECT
            notes.family_name,
            notes.model_name,
            notes.normalized_model_name,
            NULL AS exchange_rate,
            NULL AS pricing_factor,
            'note' AS source_kind
          FROM catalog_model_notes notes
          WHERE notes.brand = ?
          UNION ALL
          SELECT
            items.family_name,
            items.model_name,
            items.normalized_model_name,
            NULL AS exchange_rate,
            NULL AS pricing_factor,
            'service' AS source_kind
          FROM catalog_service_items items
          WHERE items.brand = ?
        )
        ORDER BY family_name COLLATE NOCASE, model_name COLLATE NOCASE
      `)
      .all('Canon', 'Canon', 'Canon') as CatalogFamilyRow[];

    const families = new Map<string, CatalogFamilySummary & { modelKeys: Set<string> }>();
    for (const row of rows) {
      const familyName = row.family_name.trim();
      if (!familyName) continue;
      const familyKey = normalizeModelName(familyName);
      const family = families.get(familyKey) ?? {
        familyName,
        modelNames: [],
        serviceItemCount: 0,
        noteCount: 0,
        exchangeRate: null,
        factor: null,
        modelKeys: new Set<string>(),
      };
      const modelName = row.model_name.trim();
      if (modelName && !family.modelKeys.has(row.normalized_model_name)) {
        family.modelKeys.add(row.normalized_model_name);
        family.modelNames.push(modelName);
      }
      if (row.source_kind === 'service') family.serviceItemCount += 1;
      if (row.source_kind === 'note') family.noteCount += 1;
      if (row.exchange_rate !== null && family.exchangeRate === null) family.exchangeRate = row.exchange_rate;
      if (row.pricing_factor !== null && family.factor === null) family.factor = row.pricing_factor;
      families.set(familyKey, family);
    }

    return [...families.values()]
      .map(({ modelKeys: _modelKeys, ...family }) => ({
        ...family,
        modelNames: family.modelNames.sort((left, right) => left.localeCompare(right)),
      }))
      .sort((left, right) => left.familyName.localeCompare(right.familyName));
  }

  listServiceItems(query: CatalogServiceQuery = {}): CatalogServiceItem[] {
    const conditions = ['items.brand = ?'];
    const parameters: Array<string> = ['Canon'];

    if (query.query?.trim()) {
      const text = `%${query.query.trim().toLowerCase()}%`;
      conditions.push(`(
        lower(items.family_name) LIKE ? OR
        lower(items.model_name) LIKE ? OR
        lower(items.description) LIKE ?
      )`);
      parameters.push(text, text, text);
    }

    if (query.modelName?.trim()) {
      conditions.push("items.normalized_model_name LIKE ? ESCAPE '\\'");
      parameters.push(modelNameSearchPattern(query.modelName));
    }

    const rows = this.database
      .prepare(`
        SELECT
          items.id,
          items.brand,
          items.family_name,
          items.model_name,
          items.item_kind,
          items.description,
          items.fixed_price_local,
          items.source_batch_id,
          batches.source_name
        FROM catalog_service_items items
        JOIN import_batches batches ON batches.id = items.source_batch_id
        WHERE ${conditions.join(' AND ')}
        ORDER BY
          items.family_name COLLATE NOCASE,
          items.model_name COLLATE NOCASE,
          CASE items.item_kind WHEN 'labor' THEN 0 ELSE 1 END,
          items.id
      `)
      .all(...parameters) as CatalogServiceItemRow[];

    return rows.map((row) => ({
      id: row.id,
      brand: row.brand,
      familyName: row.family_name,
      modelName: row.model_name,
      kind: row.item_kind,
      description: row.description,
      fixedPriceLocal: row.fixed_price_local,
      sourceBatchId: row.source_batch_id,
      sourceName: row.source_name,
    }));
  }

  private toCatalogPart(row: CatalogPartRow): CatalogPart {
    return {
      id: row.id,
      brand: row.brand,
      code: row.code,
      description: row.description,
      group: row.category,
      reference: row.legacy_reference,
      usefulLife: row.useful_life,
      models: row.models ? row.models.split('|') : [],
      stock: row.stock ?? 0,
      priceUsd: row.price_usd ?? 0,
      priceLocal: row.price_local ?? 0,
      costAvailable: row.cost_available !== 0,
      markup: row.markup ?? 0,
      discontinuedAt: row.discontinued_at,
    };
  }
}

function normalizeModelNotes(values: readonly CatalogModelNoteInput[]): CatalogModelNoteInput[] {
  const unique = new Map<string, CatalogModelNoteInput>();
  for (const value of values) {
    const brand = value.brand.trim();
    const familyName = value.familyName.trim();
    const modelName = value.modelName.trim();
    const note = value.note.trim();
    if (!brand || !familyName || !modelName || !note) {
      throw new Error('Las notas del catálogo deben tener familia, modelo y texto.');
    }
    unique.set(`${brand}:${normalizeModelName(modelName)}`, {
      brand,
      familyName,
      modelName,
      note,
    });
  }
  return [...unique.values()];
}

function normalizeModelFamilies(values: readonly CatalogModelFamilyInput[]): CatalogModelFamilyInput[] {
  const unique = new Map<string, CatalogModelFamilyInput>();
  for (const value of values) {
    const brand = value.brand.trim();
    const familyName = value.familyName.trim();
    const modelName = value.modelName.trim();
    if (!brand || !familyName || !modelName) {
      throw new Error('Las familias del catálogo deben tener familia y modelo.');
    }
    unique.set(`${brand}:${normalizeModelName(familyName)}:${normalizeModelName(modelName)}`, {
      brand,
      familyName,
      modelName,
      exchangeRate: normalizeOptionalPositiveNumber(value.exchangeRate),
      factor: normalizeOptionalPositiveNumber(value.factor),
    });
  }
  return [...unique.values()];
}

function normalizeServiceItems(values: readonly CatalogServiceItemInput[]): CatalogServiceItemInput[] {
  return values.map((value) => {
    const brand = value.brand.trim();
    const familyName = value.familyName.trim();
    const modelName = value.modelName.trim();
    const description = value.description.trim();
    if (!brand || !familyName || !modelName || !description) {
      throw new Error('Los servicios del catálogo deben tener familia, modelo y descripción.');
    }
    if (value.kind !== 'labor' && value.kind !== 'fixed') {
      throw new Error('El tipo de servicio del catálogo no es válido.');
    }
    if (value.fixedPriceLocal !== null && (!Number.isFinite(value.fixedPriceLocal) || value.fixedPriceLocal < 0)) {
      throw new Error(`El precio local de ${description} no es válido.`);
    }
    if (value.kind === 'fixed' && value.fixedPriceLocal === null) {
      throw new Error(`El cargo fijo ${description} necesita un precio local.`);
    }
    return {
      brand,
      familyName,
      modelName,
      kind: value.kind,
      description,
      fixedPriceLocal: value.kind === 'labor' ? null : value.fixedPriceLocal,
    };
  });
}

function normalizeOptionalText(value: string | null | undefined): string {
  const text = value?.trim().replace(/\s+/g, ' ') ?? '';
  return text;
}

function normalizeOptionalPositiveNumber(value: number | null | undefined): number | null {
  if (value === null || value === undefined) return null;
  if (!Number.isFinite(value) || value <= 0) {
    throw new Error('Los valores comerciales de la familia deben ser números positivos.');
  }
  return value;
}

export function normalizeModelName(value: string): string {
  return value.normalize('NFKC').trim().replace(/\s+/g, ' ').toUpperCase();
}

function modelNameSearchPattern(value: string): string {
  const normalized = normalizeModelName(value).replace(/[\\%_]/g, '\\$&');
  return `%${normalized}%`;
}

function uniqueNonEmpty(values: readonly string[]): string[] {
  const unique = new Map<string, string>();
  for (const value of values) {
    const trimmed = value.trim();
    if (trimmed) unique.set(normalizeModelName(trimmed), trimmed);
  }
  return [...unique.values()];
}
