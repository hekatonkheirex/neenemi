import { describe, expect, it } from 'vitest';
import { THEME_STORAGE_KEY, persistTheme, readTheme } from './theme';

function createStorage(initialValue: string | null = null) {
  let value = initialValue;

  return {
    getItem: (key: string) => (key === THEME_STORAGE_KEY ? value : null),
    setItem: (key: string, nextValue: string) => {
      if (key === THEME_STORAGE_KEY) {
        value = nextValue;
      }
    },
    value: () => value,
  };
}

describe('theme preference', () => {
  it('uses light mode when there is no valid saved preference', () => {
    expect(readTheme(undefined)).toBe('light');
    expect(readTheme(createStorage())).toBe('light');
    expect(readTheme(createStorage('system'))).toBe('light');
  });

  it('restores a saved dark preference', () => {
    expect(readTheme(createStorage('dark'))).toBe('dark');
  });

  it('persists the selected preference', () => {
    const storage = createStorage();

    persistTheme('dark', storage);

    expect(storage.value()).toBe('dark');
  });

  it('does not throw when storage is unavailable', () => {
    const unavailableStorage = {
      getItem: () => {
        throw new Error('storage unavailable');
      },
      setItem: () => {
        throw new Error('storage unavailable');
      },
    };

    expect(readTheme(unavailableStorage)).toBe('light');
    expect(() => persistTheme('dark', unavailableStorage)).not.toThrow();
  });
});
