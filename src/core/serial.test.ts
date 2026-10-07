import { describe, expect, it } from 'vitest';
import { normalizeSerial } from './serial';

describe('normalizeSerial', () => {
  it('upper-cases, trims and collapses whitespace', () => {
    expect(normalizeSerial('  ser   001 ')).toBe('SER 001');
  });

  it('folds compatibility characters (NFKC)', () => {
    expect(normalizeSerial('ＡＢＣ１')).toBe('ABC1');
  });

  it('maps empty input to empty', () => {
    expect(normalizeSerial('   ')).toBe('');
  });
});
