export type Theme = 'light' | 'dark';

export const THEME_STORAGE_KEY = 'datasystems-suite-theme';

export type ThemeStorage = {
  getItem: (key: string) => string | null;
  setItem: (key: string, value: string) => void;
};

export function readTheme(storage: ThemeStorage | undefined): Theme {
  try {
    return storage?.getItem(THEME_STORAGE_KEY) === 'dark' ? 'dark' : 'light';
  } catch {
    return 'light';
  }
}

export function persistTheme(theme: Theme, storage: ThemeStorage | undefined): void {
  try {
    storage?.setItem(THEME_STORAGE_KEY, theme);
  } catch {
    // Theme selection must remain usable when storage is unavailable.
  }
}
