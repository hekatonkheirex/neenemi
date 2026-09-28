import fs from 'node:fs';
import os from 'node:os';
import path from 'node:path';
import { afterEach, describe, expect, it } from 'vitest';
import { openDatabase } from '../../db/database';
import { CoverageRepository } from './repository';
import { normalizePageCoverage, summarizeDocumentCoverage } from './calculations';

const temporaryDirectories: string[] = [];

afterEach(() => {
  for (const directory of temporaryDirectories.splice(0)) {
    fs.rmSync(directory, { recursive: true, force: true });
  }
});

describe('CoverageRepository', () => {
  it('persists model catalog and PDF coverage analysis in shared app settings', () => {
    const directory = fs.mkdtempSync(path.join(os.tmpdir(), 'datasystems-suite-coverage-'));
    temporaryDirectories.push(directory);
    const database = openDatabase(path.join(directory, 'suite.sqlite'));
    const repository = new CoverageRepository(database);
    const model = repository.saveModel({
      name: 'Canon color persistido',
      colorType: 'color',
      nominalYield: { black: 10_000, cyan: 8_000, magenta: 8_000, yellow: 8_000 },
    });
    const analysis = {
      sourceName: 'informe-cobertura.pdf',
      coverage: summarizeDocumentCoverage([normalizePageCoverage({ page: 1, black: 5, cyan: 0, magenta: 0, yellow: 0 })]),
      analyzedAt: '2026-09-10T12:00:00.000Z',
      inputMode: 'pdf' as const,
      failedPages: [{ page: 2, message: 'Página no disponible.' }],
    };

    expect(repository.listModels()).toEqual([model]);
    expect(repository.saveAnalysis(analysis)).toEqual(analysis);
    expect(repository.getLastAnalysis()).toEqual(analysis);
    repository.removeModel(model.id);
    expect(repository.listModels()).toEqual([]);
    repository.clearLastAnalysis();
    expect(repository.getLastAnalysis()).toBeNull();
    database.close();
  });
});
