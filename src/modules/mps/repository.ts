import Database from 'better-sqlite3';
import { randomUUID } from 'node:crypto';
import fs from 'node:fs';
import os from 'node:os';
import path from 'node:path';
import type { SuiteDatabase } from '../../db/database';

export type LegacyMpsConsumableInput = {
  id: string;
  name: string;
  type: string;
  yieldPages: number;
  color: string;
  sku: string;
};

export type LegacyMpsModelInput = {
  id: string;
  brand: string;
  model: string;
  speedPpm: number | null;
  isColor: boolean;
  recVolumeMin: number;
  recVolumeMax: number;
  isCustom: boolean;
  consumables: readonly LegacyMpsConsumableInput[];
};

export type LegacyMpsDatabaseInput = {
  models: readonly LegacyMpsModelInput[];
};

export type MpsConsumable = {
  id: string;
  name: string;
  type: string;
  yieldPages: number;
  color: string;
  sku: string;
};

export type MpsConsumableInput = {
  id?: string;
  name: string;
  type: string;
  yieldPages: number;
  color: string;
  sku: string;
};

export type SaveMpsModelInput = {
  id?: string;
  brand: string;
  model: string;
  speedPpm: number | null;
  isColor: boolean;
  recVolumeMin: number;
  recVolumeMax: number;
  consumables: readonly MpsConsumableInput[];
};

export type MpsModel = {
  id: string;
  modelId: string | null;
  brand: string;
  modelLabel: string;
  speedPpm: number | null;
  isColor: boolean;
  recVolumeMin: number;
  recVolumeMax: number;
  isCustom: boolean;
  isEditable: boolean;
  consumables: MpsConsumable[];
};

export type MpsImportResult = {
  models: number;
  consumables: number;
  linkedEquipmentModels: number;
};

export type MpsImportSummary = MpsImportResult & {
  batchId: string | null;
  sourceFileId: string | null;
  sourceName: string | null;
  sourceHash: string | null;
  importedAt: string | null;
};

export type MpsProjection = {
  consumable: MpsConsumable;
  years: Array<{
    year: number;
    replacements: number;
    units: number;
  }>;
};

export { calculateMpsProjection } from './calculations';

type ProfileRow = {
  id: string;
  model_id: string | null;
  brand: string;
  model_label: string;
  normalized_label: string;
  speed_ppm: number | null;
  is_color: number;
  rec_volume_min: number;
  rec_volume_max: number;
  is_custom: number;
  source_batch_id: string;
};

type ConsumableRow = {
  id: string;
  profile_id: string;
  name: string;
  consumable_type: string;
  yield_pages: number;
  color: string;
  sku: string;
};

type CurrentBatchRow = {
  id: string;
  source_name: string;
  source_hash: string | null;
  created_at: string;
};

type LegacyModelRow = {
  id: unknown;
  brand: unknown;
  model: unknown;
  speedPpm: unknown;
  isColor: unknown;
  recVolumeMin: unknown;
  recVolumeMax: unknown;
  isCustom: unknown;
};

type LegacyConsumableRow = {
  id: unknown;
  modelId: unknown;
  name: unknown;
  type: unknown;
  yieldPages: unknown;
  color: unknown;
  sku: unknown;
};

export function readLegacyMpsDatabase(contents: Uint8Array): LegacyMpsDatabaseInput {
  const temporaryDirectory = fs.mkdtempSync(path.join(os.tmpdir(), 'datasystems-suite-mps-'));
  const temporaryPath = path.join(temporaryDirectory, 'legacy.sqlite');
  let source: Database.Database | null = null;

  try {
    fs.writeFileSync(temporaryPath, Buffer.from(contents));
    source = new Database(temporaryPath, { readonly: true, fileMustExist: true });
    const tables = new Set(
      (source.prepare("SELECT name FROM sqlite_master WHERE type = 'table'").all() as Array<{ name: string }>)
        .map((row) => row.name),
    );
    if (!tables.has('multifuncionales') || !tables.has('consumibles')) {
      throw new Error('La base seleccionada no contiene las tablas de modelos e insumos MPS.');
    }

    const consumableColumns = new Set(
      (source.prepare('PRAGMA table_info(consumibles)').all() as Array<{ name: string }>).map((row) => row.name),
    );
    const skuColumn = consumableColumns.has('sku') ? 'sku' : "'' AS sku";
    const models = source
      .prepare('SELECT id, brand, model, speedPpm, isColor, recVolumeMin, recVolumeMax, isCustom FROM multifuncionales ORDER BY model')
      .all() as LegacyModelRow[];
    const consumables = source
      .prepare(`SELECT id, modelId, name, type, yieldPages, color, ${skuColumn} FROM consumibles ORDER BY modelId, name`)
      .all() as LegacyConsumableRow[];
    const consumablesByModel = new Map<string, LegacyConsumableRow[]>();

    for (const consumable of consumables) {
      if (typeof consumable.modelId !== 'string') continue;
      const current = consumablesByModel.get(consumable.modelId) ?? [];
      current.push(consumable);
      consumablesByModel.set(consumable.modelId, current);
    }

    const candidateModels = models.map((model) => ({
        id: model.id,
        brand: model.brand,
        model: model.model,
        speedPpm: model.speedPpm,
        isColor: model.isColor,
        recVolumeMin: model.recVolumeMin,
        recVolumeMax: model.recVolumeMax,
        isCustom: model.isCustom,
        consumables: consumablesByModel.get(typeof model.id === 'string' ? model.id : '') ?? [],
      }));
    return normalizeLegacyMpsDatabase({
      models: candidateModels as unknown as LegacyMpsModelInput[],
    });
  } catch (error) {
    throw new Error(error instanceof Error ? `No se pudo leer la base MPS: ${error.message}` : 'No se pudo leer la base MPS.');
  } finally {
    source?.close();
    fs.rmSync(temporaryDirectory, { recursive: true, force: true });
  }
}

export class MpsRepository {
  constructor(private readonly database: SuiteDatabase) {}

  importLegacyDatabase(batchId: string, input: LegacyMpsDatabaseInput): MpsImportResult {
    const batch = this.database
      .prepare('SELECT id FROM import_batches WHERE id = ?')
      .get(batchId) as { id: string } | undefined;
    if (!batch) throw new Error(`No existe la importación ${batchId}.`);

    const models = normalizeLegacyMpsDatabase(input).models;
    return this.database.transaction(() => {
      const now = new Date().toISOString();
      this.database.prepare('DELETE FROM model_mps_profiles WHERE source_batch_id = ?').run(batchId);

      const findEquipmentModel = this.database.prepare(
        'SELECT id FROM equipment_models WHERE brand = ? AND normalized_name = ?',
      );
      const insertEquipmentModel = this.database.prepare(`
        INSERT INTO equipment_models (
          id, brand, model_name, normalized_name, created_at, updated_at
        ) VALUES (?, ?, ?, ?, ?, ?)
      `);
      const insertProfile = this.database.prepare(`
        INSERT INTO model_mps_profiles (
          id, model_id, brand, model_label, normalized_label, speed_ppm,
          is_color, rec_volume_min, rec_volume_max, is_custom, source_batch_id,
          created_at, updated_at
        ) VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?)
      `);
      const insertConsumable = this.database.prepare(`
        INSERT INTO mps_consumables (
          id, profile_id, name, consumable_type, yield_pages, color, sku, created_at
        ) VALUES (?, ?, ?, ?, ?, ?, ?, ?)
      `);
      const equipmentModelIds = new Set<string>();
      let consumableCount = 0;

      for (const model of models) {
        const normalizedModel = normalizeModelName(model.model);
        const existingEquipmentModel = findEquipmentModel.get(model.brand, normalizedModel) as { id: string } | undefined;
        const modelId = existingEquipmentModel?.id ?? randomUUID();
        if (!existingEquipmentModel) {
          insertEquipmentModel.run(modelId, model.brand, model.model, normalizedModel, now, now);
        }
        equipmentModelIds.add(modelId);

        const profileId = randomUUID();
        insertProfile.run(
          profileId,
          modelId,
          model.brand,
          model.model,
          normalizeModelName(model.model),
          model.speedPpm,
          model.isColor ? 1 : 0,
          model.recVolumeMin,
          model.recVolumeMax,
          model.isCustom ? 1 : 0,
          batchId,
          now,
          now,
        );

        for (const consumable of model.consumables) {
          insertConsumable.run(
            randomUUID(),
            profileId,
            consumable.name,
            consumable.type,
            consumable.yieldPages,
            consumable.color,
            consumable.sku,
            now,
          );
          consumableCount += 1;
        }
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
        consumables: consumableCount,
        linkedEquipmentModels: equipmentModelIds.size,
      };
    })();
  }

  getCurrentSummary(): MpsImportSummary {
    const batch = this.getCurrentBatch();
    const sourceFile = batch
      ? this.database
        .prepare(`
          SELECT id
          FROM import_files
          WHERE batch_id = ?
          ORDER BY created_at, id
          LIMIT 1
        `)
        .get(batch.id) as { id: string } | undefined
      : undefined;
    const models = this.listVisibleModels();
    const linkedEquipmentModels = new Set(
      models.map((model) => model.modelId).filter((modelId): modelId is string => Boolean(modelId)),
    );

    return {
      batchId: batch?.id ?? null,
      sourceFileId: sourceFile?.id ?? null,
      sourceName: batch?.source_name ?? null,
      sourceHash: batch?.source_hash ?? null,
      importedAt: batch?.created_at ?? null,
      models: models.length,
      consumables: models.reduce((total, model) => total + model.consumables.length, 0),
      linkedEquipmentModels: linkedEquipmentModels.size,
    };
  }

  listModels(query?: string): MpsModel[] {
    const models = this.listVisibleModels();
    const normalizedQuery = query?.trim().toLocaleLowerCase();
    if (!normalizedQuery) return models;
    return models.filter((model) => [model.brand, model.modelLabel, ...model.consumables.map((item) => `${item.name} ${item.sku}`)]
      .join(' ')
      .toLocaleLowerCase()
      .includes(normalizedQuery));
  }

  saveCustomModel(input: SaveMpsModelInput): MpsModel {
    const model = normalizeCustomMpsModel(input);
    const profileId = input.id === undefined
      ? randomUUID()
      : cleanRequired(input.id, 'El perfil MPS indicado no es válido.');

    this.database.transaction(() => {
      const manualBatch = this.ensureManualBatch();
      const existing = this.database
        .prepare('SELECT id, source_batch_id, is_custom FROM model_mps_profiles WHERE id = ?')
        .get(profileId) as { id: string; source_batch_id: string; is_custom: number } | undefined;

      if (existing && (existing.source_batch_id !== manualBatch.id || existing.is_custom !== 1)) {
        throw new Error('El perfil importado permanece intacto; solo se pueden editar perfiles manuales.');
      }
      if (!existing && input.id !== undefined) {
        throw new Error('No existe el perfil MPS manual que se desea actualizar.');
      }

      const duplicate = this.listModels().find((candidate) =>
        candidate.id !== profileId && normalizeModelName(candidate.modelLabel) === model.normalizedLabel,
      );
      if (duplicate) {
        throw new Error(`Ya existe un perfil MPS para el modelo ${duplicate.modelLabel}.`);
      }

      const now = new Date().toISOString();
      const existingEquipmentModel = this.database
        .prepare('SELECT id FROM equipment_models WHERE brand = ? AND normalized_name = ?')
        .get(model.brand, model.normalizedLabel) as { id: string } | undefined;
      const equipmentModelId = existingEquipmentModel?.id ?? randomUUID();
      if (!existingEquipmentModel) {
        this.database.prepare(`
          INSERT INTO equipment_models (
            id, brand, model_name, normalized_name, created_at, updated_at
          ) VALUES (?, ?, ?, ?, ?, ?)
        `).run(equipmentModelId, model.brand, model.modelLabel, model.normalizedLabel, now, now);
      }

      if (existing) {
        this.database.prepare(`
          UPDATE model_mps_profiles
          SET model_id = ?, brand = ?, model_label = ?, normalized_label = ?, speed_ppm = ?,
            is_color = ?, rec_volume_min = ?, rec_volume_max = ?, is_custom = 1,
            source_batch_id = ?, updated_at = ?
          WHERE id = ?
        `).run(
          equipmentModelId,
          model.brand,
          model.modelLabel,
          model.normalizedLabel,
          model.speedPpm,
          model.isColor ? 1 : 0,
          model.recVolumeMin,
          model.recVolumeMax,
          manualBatch.id,
          now,
          profileId,
        );
      } else {
        this.database.prepare(`
          INSERT INTO model_mps_profiles (
            id, model_id, brand, model_label, normalized_label, speed_ppm,
            is_color, rec_volume_min, rec_volume_max, is_custom, source_batch_id,
            created_at, updated_at
          ) VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, 1, ?, ?, ?)
        `).run(
          profileId,
          equipmentModelId,
          model.brand,
          model.modelLabel,
          model.normalizedLabel,
          model.speedPpm,
          model.isColor ? 1 : 0,
          model.recVolumeMin,
          model.recVolumeMax,
          manualBatch.id,
          now,
          now,
        );
      }

      this.database.prepare('DELETE FROM mps_consumables WHERE profile_id = ?').run(profileId);
      const insertConsumable = this.database.prepare(`
        INSERT INTO mps_consumables (
          id, profile_id, name, consumable_type, yield_pages, color, sku, created_at
        ) VALUES (?, ?, ?, ?, ?, ?, ?, ?)
      `);
      for (const consumable of model.consumables) {
        insertConsumable.run(
          randomUUID(),
          profileId,
          consumable.name,
          consumable.type,
          consumable.yieldPages,
          consumable.color,
          consumable.sku,
          now,
        );
      }
    })();

    const saved = this.listModels().find((candidate) => candidate.id === profileId);
    if (!saved) throw new Error('No se pudo recuperar el perfil MPS guardado.');
    return saved;
  }

  deleteCustomModel(profileId: string): boolean {
    const normalizedId = cleanRequired(profileId, 'El perfil MPS indicado no es válido.');
    return this.database.transaction(() => {
      const manualBatch = this.getManualBatch();
      const profile = this.database
        .prepare('SELECT source_batch_id, is_custom FROM model_mps_profiles WHERE id = ?')
        .get(normalizedId) as { source_batch_id: string; is_custom: number } | undefined;
      if (!profile) throw new Error('No existe el perfil MPS indicado.');
      if (!manualBatch || profile.source_batch_id !== manualBatch.id || profile.is_custom !== 1) {
        throw new Error('El perfil importado permanece intacto; solo se pueden eliminar perfiles manuales.');
      }
      return this.database.prepare('DELETE FROM model_mps_profiles WHERE id = ?').run(normalizedId).changes > 0;
    })();
  }

  private listVisibleModels(): MpsModel[] {
    const importedBatch = this.getCurrentBatch();
    const manualBatch = this.getManualBatch();
    const batchIds = [importedBatch?.id, manualBatch?.id].filter((id): id is string => Boolean(id));
    if (batchIds.length === 0) return [];

    const placeholders = batchIds.map(() => '?').join(', ');
    const profiles = this.database
      .prepare(`
        SELECT id, model_id, brand, model_label, normalized_label, speed_ppm, is_color,
          rec_volume_min, rec_volume_max, is_custom, source_batch_id
        FROM model_mps_profiles
        WHERE source_batch_id IN (${placeholders})
        ORDER BY normalized_label, model_label, id
      `)
      .all(...batchIds) as ProfileRow[];
    const consumables = this.database
      .prepare(`
        SELECT id, profile_id, name, consumable_type, yield_pages, color, sku
        FROM mps_consumables
        WHERE profile_id IN (
          SELECT id FROM model_mps_profiles WHERE source_batch_id IN (${placeholders})
        )
        ORDER BY name, id
      `)
      .all(...batchIds) as ConsumableRow[];
    const consumablesByProfile = new Map<string, MpsConsumable[]>();

    for (const row of consumables) {
      const current = consumablesByProfile.get(row.profile_id) ?? [];
      current.push({
        id: row.id,
        name: row.name,
        type: row.consumable_type,
        yieldPages: row.yield_pages,
        color: row.color,
        sku: row.sku,
      });
      consumablesByProfile.set(row.profile_id, current);
    }

    profiles.sort((left, right) => {
      const leftManual = left.source_batch_id === manualBatch?.id ? 0 : 1;
      const rightManual = right.source_batch_id === manualBatch?.id ? 0 : 1;
      return left.normalized_label.localeCompare(right.normalized_label)
        || leftManual - rightManual
        || left.model_label.localeCompare(right.model_label, 'es')
        || left.id.localeCompare(right.id);
    });

    const modelsByLabel = new Map<string, MpsModel>();
    for (const profile of profiles) {
      if (modelsByLabel.has(profile.normalized_label)) continue;
      modelsByLabel.set(profile.normalized_label, {
        id: profile.id,
        modelId: profile.model_id,
        brand: profile.brand,
        modelLabel: profile.model_label,
        speedPpm: profile.speed_ppm,
        isColor: profile.is_color === 1,
        recVolumeMin: profile.rec_volume_min,
        recVolumeMax: profile.rec_volume_max,
        isCustom: profile.is_custom === 1,
        isEditable: profile.source_batch_id === manualBatch?.id,
        consumables: consumablesByProfile.get(profile.id) ?? [],
      });
    }

    return [...modelsByLabel.values()];
  }

  private getCurrentBatch(): CurrentBatchRow | undefined {
    return this.database
      .prepare(`
        SELECT id, source_name, source_hash, created_at
        FROM import_batches
        WHERE domain = 'mps' AND status = 'applied'
        ORDER BY created_at DESC, id DESC
        LIMIT 1
      `)
      .get() as CurrentBatchRow | undefined;
  }

  private getManualBatch(): CurrentBatchRow | undefined {
    return this.database
      .prepare(`
        SELECT id, source_name, source_hash, created_at
        FROM import_batches
        WHERE domain = 'mps-manual' AND status = 'applied'
        ORDER BY created_at DESC, id DESC
        LIMIT 1
      `)
      .get() as CurrentBatchRow | undefined;
  }

  private ensureManualBatch(): CurrentBatchRow {
    const existing = this.getManualBatch();
    if (existing) return existing;

    const id = randomUUID();
    const now = new Date().toISOString();
    this.database.prepare(`
      INSERT INTO import_batches (
        id, domain, source_name, source_type, source_hash, status, created_at, applied_at
      ) VALUES (?, 'mps-manual', 'Modelos MPS manuales', 'manual', NULL, 'applied', ?, ?)
    `).run(id, now, now);
    return {
      id,
      source_name: 'Modelos MPS manuales',
      source_hash: null,
      created_at: now,
    };
  }
}

function normalizeLegacyMpsDatabase(input: LegacyMpsDatabaseInput): LegacyMpsDatabaseInput {
  const uniqueModels = new Map<string, LegacyMpsModelInput>();
  for (const model of input.models) {
    const id = cleanRequired(model.id, 'Cada modelo MPS debe tener un identificador.');
    const brand = cleanRequired(model.brand || 'Canon', `El modelo ${id} debe tener una marca.`);
    const modelLabel = cleanRequired(model.model, `El modelo ${id} debe tener un nombre.`);
    if (
      (model.speedPpm !== null && (!Number.isFinite(model.speedPpm) || model.speedPpm < 0)) ||
      !Number.isFinite(model.recVolumeMin) || model.recVolumeMin < 0 ||
      !Number.isFinite(model.recVolumeMax) || model.recVolumeMax < 0
    ) {
      throw new Error(`El modelo MPS ${modelLabel} tiene parámetros inválidos.`);
    }
    const consumables = model.consumables.map((consumable) => {
      const name = cleanRequired(consumable.name, `El modelo ${modelLabel} tiene un insumo sin nombre.`);
      if (!Number.isInteger(consumable.yieldPages) || consumable.yieldPages <= 0) {
        throw new Error(`El insumo ${name} del modelo ${modelLabel} tiene un rendimiento inválido.`);
      }
      return {
        id: cleanRequired(consumable.id, `El insumo ${name} debe tener un identificador.`),
        name,
        type: cleanRequired(consumable.type || 'other', `El insumo ${name} debe tener un tipo.`),
        yieldPages: consumable.yieldPages,
        color: cleanRequired(consumable.color || 'other', `El insumo ${name} debe tener un color.`),
        sku: cleanOptional(consumable.sku),
      };
    });
    uniqueModels.set(normalizeModelName(modelLabel), {
      id,
      brand,
      model: modelLabel,
      speedPpm: model.speedPpm,
      isColor: Boolean(model.isColor),
      recVolumeMin: Math.round(model.recVolumeMin),
      recVolumeMax: Math.round(model.recVolumeMax),
      isCustom: Boolean(model.isCustom),
      consumables,
    });
  }

  if (uniqueModels.size === 0) throw new Error('La base MPS no contiene modelos.');
  return { models: [...uniqueModels.values()] };
}

function normalizeCustomMpsModel(input: SaveMpsModelInput): {
  brand: string;
  modelLabel: string;
  normalizedLabel: string;
  speedPpm: number | null;
  isColor: boolean;
  recVolumeMin: number;
  recVolumeMax: number;
  consumables: MpsConsumableInput[];
} {
  const brand = cleanRequired(input.brand, 'La marca del equipo es obligatoria.');
  const modelLabel = cleanRequired(input.model, 'El modelo del equipo es obligatorio.');
  const speedPpm = input.speedPpm === null
    ? null
    : cleanNonNegativeInteger(input.speedPpm, 'La velocidad PPM debe ser un entero no negativo.');
  const recVolumeMin = cleanNonNegativeInteger(input.recVolumeMin, 'El volumen mínimo debe ser un entero no negativo.');
  const recVolumeMax = cleanNonNegativeInteger(input.recVolumeMax, 'El volumen máximo debe ser un entero no negativo.');
  if (recVolumeMax < recVolumeMin) {
    throw new Error('El volumen máximo no puede ser menor que el volumen mínimo.');
  }
  if (!Array.isArray(input.consumables) || input.consumables.length === 0) {
    throw new Error('El perfil debe tener al menos un consumible.');
  }

  const consumables = input.consumables.map((consumable) => {
    const name = cleanRequired(consumable.name, `El modelo ${modelLabel} tiene un insumo sin nombre.`);
    const type = cleanRequired(consumable.type, `El insumo ${name} debe tener un tipo.`);
    const color = cleanRequired(consumable.color, `El insumo ${name} debe tener un color.`);
    const yieldPages = cleanPositiveInteger(consumable.yieldPages, `El insumo ${name} debe tener un rendimiento válido.`);
    return {
      id: consumable.id,
      name,
      type,
      yieldPages,
      color,
      sku: cleanOptional(consumable.sku),
    };
  });

  return {
    brand,
    modelLabel,
    normalizedLabel: normalizeModelName(modelLabel),
    speedPpm,
    isColor: Boolean(input.isColor),
    recVolumeMin,
    recVolumeMax,
    consumables,
  };
}

function normalizeModelName(value: string): string {
  return value.normalize('NFKC').trim().replace(/\s+/g, ' ').toUpperCase();
}

function cleanRequired(value: unknown, message: string): string {
  if (typeof value !== 'string') throw new Error(message);
  const cleaned = value.trim().replace(/\s+/g, ' ');
  if (!cleaned) throw new Error(message);
  return cleaned;
}

function cleanOptional(value: unknown): string {
  return typeof value === 'string' ? value.trim().replace(/\s+/g, ' ') : '';
}

function cleanNonNegativeInteger(value: unknown, message: string): number {
  if (!Number.isInteger(value) || typeof value !== 'number' || value < 0) throw new Error(message);
  return value;
}

function cleanPositiveInteger(value: unknown, message: string): number {
  if (!Number.isInteger(value) || typeof value !== 'number' || value <= 0) throw new Error(message);
  return value;
}
