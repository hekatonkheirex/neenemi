import { randomUUID } from 'node:crypto';
import type { SuiteDatabase } from '../../db/database';
import { SettingsRepository } from '../../db/repositories';
import type { CanonModel, CanonModelDraft, CoverageAnalysis } from './types';

export class CanonModelValidationError extends Error {
  constructor(message: string) {
    super(message);
    this.name = 'CanonModelValidationError';
  }
}

export class CanonModelNotFoundError extends Error {
  constructor(id: string) {
    super(`No existe un modelo Canon con ID "${id}".`);
    this.name = 'CanonModelNotFoundError';
  }
}

function isPositiveNumber(value: number | undefined): value is number {
  return value !== undefined && Number.isFinite(value) && value > 0;
}

function normalizeModel(id: string, draft: CanonModelDraft): CanonModel {
  const name = draft.name.trim();
  if (!name) throw new CanonModelValidationError('El nombre del modelo es obligatorio.');
  if (draft.colorType !== 'mono' && draft.colorType !== 'color') {
    throw new CanonModelValidationError('El tipo de color del modelo no es válido.');
  }
  if (!isPositiveNumber(draft.nominalYield.black)) {
    throw new CanonModelValidationError('El rendimiento nominal de negro debe ser mayor que cero.');
  }
  if (draft.colorType === 'mono') return { id, name, colorType: 'mono', nominalYield: { black: draft.nominalYield.black } };
  if (!isPositiveNumber(draft.nominalYield.cyan) || !isPositiveNumber(draft.nominalYield.magenta) || !isPositiveNumber(draft.nominalYield.yellow)) {
    throw new CanonModelValidationError('Los rendimientos nominales de color deben ser mayores que cero.');
  }
  return {
    id,
    name,
    colorType: 'color',
    nominalYield: {
      black: draft.nominalYield.black,
      cyan: draft.nominalYield.cyan,
      magenta: draft.nominalYield.magenta,
      yellow: draft.nominalYield.yellow,
    },
  };
}

function isCanonModel(value: unknown): value is CanonModel {
  if (typeof value !== 'object' || value === null || Array.isArray(value)) return false;
  const candidate = value as Record<string, unknown>;
  if (typeof candidate.id !== 'string' || typeof candidate.name !== 'string') return false;
  if (candidate.colorType !== 'mono' && candidate.colorType !== 'color') return false;
  if (typeof candidate.nominalYield !== 'object' || candidate.nominalYield === null || Array.isArray(candidate.nominalYield)) return false;
  const yields = candidate.nominalYield as Record<string, unknown>;
  if (typeof yields.black !== 'number' || !Number.isFinite(yields.black) || yields.black <= 0) return false;
  if (candidate.colorType === 'mono') return true;
  return ['cyan', 'magenta', 'yellow'].every((color) => typeof yields[color] === 'number' && Number.isFinite(yields[color]) && (yields[color] as number) > 0);
}

function sortModels(models: readonly CanonModel[]): CanonModel[] {
  return [...models].sort((left, right) => left.name.localeCompare(right.name, 'es', { numeric: true, sensitivity: 'base' }));
}

function isCoverageAnalysis(value: unknown): value is CoverageAnalysis {
  if (typeof value !== 'object' || value === null || Array.isArray(value)) return false;
  const candidate = value as Record<string, unknown>;
  const failedPages = candidate.failedPages;
  return typeof candidate.sourceName === 'string'
    && typeof candidate.coverage === 'object'
    && candidate.coverage !== null
    && typeof candidate.analyzedAt === 'string'
    && (candidate.inputMode === 'manual' || candidate.inputMode === 'pdf')
    && (failedPages === undefined || (Array.isArray(failedPages) && failedPages.every((item) =>
      typeof item === 'object' && item !== null
      && Number.isInteger((item as Record<string, unknown>).page)
      && typeof (item as Record<string, unknown>).message === 'string')));
}

export class CoverageRepository {
  private readonly settings: SettingsRepository;

  constructor(database: SuiteDatabase) {
    this.settings = new SettingsRepository(database);
  }

  listModels(): CanonModel[] {
    const stored = this.settings.get<unknown>('coverage', 'models', []);
    if (!Array.isArray(stored) || !stored.every(isCanonModel)) return [];
    return sortModels(stored);
  }

  saveModel(draft: CanonModelDraft, id?: string): CanonModel {
    const models = this.listModels();
    const model = normalizeModel(id ?? randomUUID(), draft);
    const existingIndex = models.findIndex((item) => item.id === model.id);
    if (existingIndex >= 0) models[existingIndex] = model;
    else models.push(model);
    this.settings.set('coverage', 'models', sortModels(models));
    return model;
  }

  removeModel(id: string): void {
    const models = this.listModels();
    if (!models.some((model) => model.id === id)) throw new CanonModelNotFoundError(id);
    this.settings.set('coverage', 'models', models.filter((model) => model.id !== id));
  }

  getLastAnalysis(): CoverageAnalysis | null {
    const stored = this.settings.get<unknown>('coverage', 'last-analysis', null);
    return isCoverageAnalysis(stored) ? stored : null;
  }

  saveAnalysis(analysis: CoverageAnalysis): CoverageAnalysis {
    this.settings.set('coverage', 'last-analysis', analysis);
    return analysis;
  }

  clearLastAnalysis(): void {
    this.settings.remove('coverage', 'last-analysis');
  }
}
