import fs from 'node:fs';
import os from 'node:os';
import path from 'node:path';
import { afterEach, describe, expect, it } from 'vitest';
import { openDatabase } from '../../db/database';
import { SoftwareSelectorRepository } from './repository';
import type { SoftwareAnalysis } from './types';

const temporaryDirectories: string[] = [];

function createRepository() {
  const directory = fs.mkdtempSync(path.join(os.tmpdir(), 'datasystems-suite-software-selector-'));
  temporaryDirectories.push(directory);
  const database = openDatabase(path.join(directory, 'suite.sqlite'));
  return { database, repository: new SoftwareSelectorRepository(database) };
}

afterEach(() => {
  for (const directory of temporaryDirectories.splice(0)) {
    fs.rmSync(directory, { recursive: true, force: true });
  }
});

describe('SoftwareSelectorRepository', () => {
  it('persists the last local analysis through shared app settings', () => {
    const { database, repository } = createRepository();
    const analysis: SoftwareAnalysis = {
      fileName: 'pliego.txt',
      textExcerpt: 'se requiere sso',
      selectedFeatureIds: ['sso_idp_integration'],
      reasoning: { sso_idp_integration: 'Coincidencia local.' },
      source: 'heurística local',
      usedFallback: false,
      analyzedAt: '2026-09-10T12:00:00.000Z',
    };

    expect(repository.getLastAnalysis()).toBeNull();
    expect(repository.saveAnalysis(analysis)).toEqual(analysis);
    expect(repository.getLastAnalysis()).toEqual(analysis);

    repository.clearLastAnalysis();
    expect(repository.getLastAnalysis()).toBeNull();
    database.close();
  });
});
