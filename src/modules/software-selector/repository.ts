import type { SuiteDatabase } from '../../db/database';
import { SettingsRepository } from '../../db/repositories';
import type { SoftwareAnalysis } from './types';

function isStringRecord(value: unknown): value is Record<string, string> {
  return typeof value === 'object'
    && value !== null
    && !Array.isArray(value)
    && Object.values(value).every((item) => typeof item === 'string');
}

function isSoftwareAnalysis(value: unknown): value is SoftwareAnalysis {
  if (typeof value !== 'object' || value === null || Array.isArray(value)) return false;
  const candidate = value as Record<string, unknown>;
  return typeof candidate.fileName === 'string'
    && typeof candidate.textExcerpt === 'string'
    && Array.isArray(candidate.selectedFeatureIds)
    && candidate.selectedFeatureIds.every((item) => typeof item === 'string')
    && isStringRecord(candidate.reasoning)
    && candidate.source === 'heurística local'
    && typeof candidate.usedFallback === 'boolean'
    && typeof candidate.analyzedAt === 'string';
}

export class SoftwareSelectorRepository {
  private readonly settings: SettingsRepository;

  constructor(database: SuiteDatabase) {
    this.settings = new SettingsRepository(database);
  }

  getLastAnalysis(): SoftwareAnalysis | null {
    const stored = this.settings.get<unknown>('software-selector', 'last-analysis', null);
    return isSoftwareAnalysis(stored) ? stored : null;
  }

  saveAnalysis(analysis: SoftwareAnalysis): SoftwareAnalysis {
    this.settings.set('software-selector', 'last-analysis', analysis);
    return analysis;
  }

  clearLastAnalysis(): void {
    this.settings.remove('software-selector', 'last-analysis');
  }
}
