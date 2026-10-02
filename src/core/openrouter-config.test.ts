import { afterEach, describe, expect, it } from 'vitest';
import { DEFAULT_OPENROUTER_MODEL, describeOpenRouterConfig, getOpenRouterConfig, isPlausibleOpenRouterKey } from './openrouter';
import type { SettingsRepository } from '../db/repositories';

const saved = { key: process.env.OPENROUTER_API_KEY, model: process.env.OPENROUTER_MODEL };
afterEach(() => {
  for (const [name, value] of [['OPENROUTER_API_KEY', saved.key], ['OPENROUTER_MODEL', saved.model]] as const) {
    if (value === undefined) delete process.env[name]; else process.env[name] = value;
  }
});

const settingsWith = (values: Record<string, string>) => ({ get: (_ns: string, key: string, fallback: unknown) => values[key] ?? fallback }) as unknown as SettingsRepository;

describe('OpenRouter configuration', () => {
  it('prefers installation settings, then the environment, then the default model', () => {
    delete process.env.OPENROUTER_API_KEY;
    delete process.env.OPENROUTER_MODEL;
    expect(getOpenRouterConfig(settingsWith({}))).toEqual({ apiKey: '', model: DEFAULT_OPENROUTER_MODEL });
    process.env.OPENROUTER_API_KEY = 'env-key';
    process.env.OPENROUTER_MODEL = 'env/model:free';
    expect(getOpenRouterConfig(settingsWith({}))).toEqual({ apiKey: 'env-key', model: 'env/model:free' });
    expect(getOpenRouterConfig(settingsWith({ openrouter_api_key: 'db-key', openrouter_model: 'db/model:free' }))).toEqual({ apiKey: 'db-key', model: 'db/model:free' });
    expect(getOpenRouterConfig(settingsWith({ openrouter_api_key: '' })).apiKey).toBe('env-key');
  });

  it('describes where the key comes from without revealing it', () => {
    delete process.env.OPENROUTER_API_KEY;
    expect(describeOpenRouterConfig(settingsWith({}))).toMatchObject({ configured: false, source: 'none' });
    process.env.OPENROUTER_API_KEY = 'env-key';
    expect(describeOpenRouterConfig(settingsWith({}))).toMatchObject({ configured: true, source: 'environment' });
    const described = describeOpenRouterConfig(settingsWith({ openrouter_api_key: 'db-key' }));
    expect(described).toMatchObject({ configured: true, source: 'installation' });
    expect(JSON.stringify(described)).not.toContain('db-key');
  });

  it('accepts only plausible sk-or- keys', () => {
    expect(isPlausibleOpenRouterKey('sk-or-v1-0123456789abcdef0123')).toBe(true);
    for (const bad of ['', 'sk-or-', 'sk-or-v1 con espacio 0123456789', 'sk-x-0123456789abcdef0123456', 42, null]) expect(isPlausibleOpenRouterKey(bad)).toBe(false);
  });
});
