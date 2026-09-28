import fs from 'node:fs';
import os from 'node:os';
import path from 'node:path';
import { afterEach, describe, expect, it } from 'vitest';
import { openDatabase } from '../../db/database';
import { analyzeSlaRequirements } from './analysis';
import { SlaRepository } from './repository';

const temporaryDirectories: string[] = [];

afterEach(() => {
  for (const directory of temporaryDirectories.splice(0)) {
    fs.rmSync(directory, { recursive: true, force: true });
  }
});

describe('SlaRepository', () => {
  it('persists and clears the last analysis using shared app settings', () => {
    const directory = fs.mkdtempSync(path.join(os.tmpdir(), 'datasystems-suite-sla-'));
    temporaryDirectories.push(directory);
    const database = openDatabase(path.join(directory, 'suite.sqlite'));
    const repository = new SlaRepository(database);
    const analysis = analyzeSlaRequirements('se requiere confidencialidad', 'pliego.txt');

    expect(repository.getLastAnalysis()).toBeNull();
    repository.saveAnalysis(analysis);
    expect(repository.getLastAnalysis()).toEqual(analysis);
    repository.clearLastAnalysis();
    expect(repository.getLastAnalysis()).toBeNull();
    database.close();
  });
});
