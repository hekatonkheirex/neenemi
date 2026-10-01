import { describe, expect, it } from 'vitest';
import { isNonEmptyString, isPositiveInteger, isRecord, parseTextAnalysisInput } from './validation';

describe('validation helpers', () => {
  it('classifies records, strings and positive integers', () => {
    expect([isRecord({}), isRecord([]), isRecord(null)]).toEqual([true, false, false]);
    expect([isNonEmptyString(' a '), isNonEmptyString('  '), isNonEmptyString(1)]).toEqual([true, false, false]);
    expect([isPositiveInteger(3), isPositiveInteger(0), isPositiveInteger(1.5), isPositiveInteger('3')]).toEqual([true, false, false, false]);
  });

  it('parses text analysis bodies with a default file name and a size cap', () => {
    expect(parseTextAnalysisInput({ text: 'x' }, 'd.txt')).toEqual({ text: 'x', fileName: 'd.txt' });
    expect(parseTextAnalysisInput({ text: 'x', fileName: 'a.pdf' }, 'd.txt')).toEqual({ text: 'x', fileName: 'a.pdf' });
    expect(parseTextAnalysisInput({ text: 'x', fileName: ' ' }, 'd.txt')).toBeNull();
    expect(parseTextAnalysisInput({ text: ' ' }, 'd.txt')).toBeNull();
    expect(parseTextAnalysisInput({ text: 'x'.repeat(250_001) }, 'd.txt')).toBeNull();
    expect(parseTextAnalysisInput(null, 'd.txt')).toBeNull();
  });
});
