import { readFileSync } from 'node:fs';
import { describe, expect, it } from 'vitest';
import { parseChangelog } from './changelog';

describe('parseChangelog', () => {
  it('reads versions, dates and text in order, ignoring the preamble', () => {
    const entries = parseChangelog('# Historial\n\nIntro.\n\n## 0.2.0 · 2026-11-01\n\nUno\ndos\n\n## 0.1.9 · 2026-10-31\r\n\nTres.\n');
    expect(entries).toEqual([{ version: '0.2.0', date: '2026-11-01', text: 'Uno\ndos' }, { version: '0.1.9', date: '2026-10-31', text: 'Tres.' }]);
  });
  it('returns nothing for text without version headings', () => {
    expect(parseChangelog('')).toEqual([]);
    expect(parseChangelog('# Solo título\n\nTexto')).toEqual([]);
  });
});

describe('CHANGELOG.md', () => {
  const entries = parseChangelog(readFileSync('CHANGELOG.md', 'utf8'));
  it('lists the version in package.json first, so every release leaves a changelog entry', () => {
    const { version } = JSON.parse(readFileSync('package.json', 'utf8')) as { version: string };
    expect(entries[0]?.version).toBe(version);
  });
  it('has unique, strictly descending versions with text', () => {
    const key = (v: string) => v.split('.').map(Number).reduce((n, part) => n * 1000 + part, 0);
    for (let i = 1; i < entries.length; i += 1) expect(key(entries[i - 1].version)).toBeGreaterThan(key(entries[i].version));
    expect(entries.every(entry => entry.text.length > 0)).toBe(true);
  });
});
