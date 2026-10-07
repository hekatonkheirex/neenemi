import { describe, expect, it } from 'vitest';
import { formatLoadedAt } from './loaded-at';

describe('formatLoadedAt', () => {
  it('formats a valid ISO date with day, month, year and time', () => {
    expect(formatLoadedAt('2026-10-07T14:32:00')).toMatch(/^Cargado el 07\/10\/2026.*14:32$/);
  });
  it.each([null, undefined, '', 'no-es-fecha'])('returns null for %s', (value) => {
    expect(formatLoadedAt(value)).toBeNull();
  });
});
