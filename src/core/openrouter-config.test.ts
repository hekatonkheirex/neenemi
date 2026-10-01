import fs from 'node:fs';
import os from 'node:os';
import path from 'node:path';
import { afterEach, describe, expect, it } from 'vitest';
import { DEFAULT_OPENROUTER_MODEL, getOpenRouterConfig, loadEmbeddedAiConfig } from './openrouter';
import type { SettingsRepository } from '../db/repositories';

const directories: string[] = [];
const saved = { key: process.env.OPENROUTER_API_KEY, model: process.env.OPENROUTER_MODEL };
afterEach(() => {
  for (const directory of directories.splice(0)) fs.rmSync(directory, { recursive: true, force: true });
  for (const [name, value] of [['OPENROUTER_API_KEY', saved.key], ['OPENROUTER_MODEL', saved.model]] as const) {
    if (value === undefined) delete process.env[name]; else process.env[name] = value;
  }
});

function embeddedFile(content: string): string {
  const directory = fs.mkdtempSync(path.join(os.tmpdir(), 'dcss-embedded-'));
  directories.push(directory);
  const file = path.join(directory, 'embedded-ai.json');
  fs.writeFileSync(file, content);
  return file;
}
const settingsWith = (values: Record<string, string>) => ({ get: (_ns: string, key: string, fallback: unknown) => values[key] ?? fallback }) as unknown as SettingsRepository;

describe('embedded AI configuration', () => {
  it('reads the key and model and trims them', () => {
    expect(loadEmbeddedAiConfig(embeddedFile('{"openrouterApiKey":" sk-or-x ","openrouterModel":"a/b:free"}'))).toEqual({ apiKey: 'sk-or-x', model: 'a/b:free' });
  });

  it('treats a missing, invalid or malformed file as no configuration', () => {
    expect(loadEmbeddedAiConfig(path.join(os.tmpdir(), 'no-such-dir', 'embedded-ai.json'))).toEqual({});
    expect(loadEmbeddedAiConfig(embeddedFile('{no es json'))).toEqual({});
    expect(loadEmbeddedAiConfig(embeddedFile('null'))).toEqual({});
    expect(loadEmbeddedAiConfig(embeddedFile('{"openrouterApiKey":42,"openrouterModel":"  "}'))).toEqual({ apiKey: undefined, model: undefined });
  });

  it('prefers installation settings, then the environment, then the embedded file, then the default model', () => {
    delete process.env.OPENROUTER_API_KEY;
    delete process.env.OPENROUTER_MODEL;
    const embedded = { apiKey: 'embedded-key', model: 'embedded/model:free' };
    expect(getOpenRouterConfig(settingsWith({}), embedded)).toEqual({ apiKey: 'embedded-key', model: 'embedded/model:free' });
    expect(getOpenRouterConfig(settingsWith({}), {})).toEqual({ apiKey: '', model: DEFAULT_OPENROUTER_MODEL });
    process.env.OPENROUTER_API_KEY = 'env-key';
    process.env.OPENROUTER_MODEL = 'env/model:free';
    expect(getOpenRouterConfig(settingsWith({}), embedded)).toEqual({ apiKey: 'env-key', model: 'env/model:free' });
    expect(getOpenRouterConfig(settingsWith({ openrouter_api_key: 'db-key', openrouter_model: 'db/model:free' }), embedded)).toEqual({ apiKey: 'db-key', model: 'db/model:free' });
    expect(getOpenRouterConfig(settingsWith({ openrouter_api_key: '' }), embedded).apiKey).toBe('env-key');
  });
});
