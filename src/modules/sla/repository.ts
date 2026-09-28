import type { SuiteDatabase } from '../../db/database';
import { SettingsRepository } from '../../db/repositories';
import type { SlaAnalysis } from './types';

function isSlaAnalysis(value: unknown): value is SlaAnalysis {
  if (typeof value !== 'object' || value === null || Array.isArray(value)) return false;
  const candidate = value as Record<string, unknown>;
  return typeof candidate.fileName === 'string'
    && typeof candidate.textExcerpt === 'string'
    && candidate.source === 'reglas locales'
    && typeof candidate.usedFallback === 'boolean'
    && typeof candidate.analyzedAt === 'string'
    && typeof candidate.overallRisk === 'string'
    && typeof candidate.complianceScore === 'number'
    && typeof candidate.summary === 'string'
    && Array.isArray(candidate.items)
    && Array.isArray(candidate.criticalGaps)
    && Array.isArray(candidate.recommendations)
    && Array.isArray(candidate.negotiationPoints);
}

export class SlaRepository {
  private readonly settings: SettingsRepository;

  constructor(database: SuiteDatabase) {
    this.settings = new SettingsRepository(database);
  }

  getLastAnalysis(): SlaAnalysis | null {
    const stored = this.settings.get<unknown>('sla', 'last-analysis', null);
    return isSlaAnalysis(stored) ? stored : null;
  }

  saveAnalysis(analysis: SlaAnalysis): SlaAnalysis {
    this.settings.set('sla', 'last-analysis', analysis);
    return analysis;
  }

  clearLastAnalysis(): void {
    this.settings.remove('sla', 'last-analysis');
  }
}
