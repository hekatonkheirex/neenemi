import { describe, expect, it } from 'vitest';
import { calculateYield, normalizePageCoverage, summarizeDocumentCoverage } from './calculations';
import type { CanonModel } from './types';

const colorModel: CanonModel = {
  id: 'model-color',
  name: 'Canon color demo',
  colorType: 'color',
  nominalYield: { black: 10_000, cyan: 8_000, magenta: 8_000, yellow: 8_000 },
};

describe('coverage calculations', () => {
  it('normalizes page totals and calculates document averages', () => {
    const first = normalizePageCoverage({ page: 1, black: 10, cyan: 0, magenta: 0, yellow: 0 });
    const second = normalizePageCoverage({ page: 2, black: 30, cyan: 20, magenta: 10, yellow: 0 });

    expect(first.total).toBe(10);
    expect(summarizeDocumentCoverage([first, second])).toEqual({
      pages: [first, second],
      average: { black: 20, cyan: 10, magenta: 5, yellow: 0 },
    });
  });

  it('uses the ISO 5% reference and the first color to run out', () => {
    const coverage = summarizeDocumentCoverage([
      normalizePageCoverage({ page: 1, black: 10, cyan: 5, magenta: 5, yellow: 0 }),
    ]);
    const result = calculateYield(colorModel, coverage.average);

    expect(result.colors).toEqual(expect.arrayContaining([
      expect.objectContaining({ color: 'black', estimatedPages: 5000 }),
      expect.objectContaining({ color: 'cyan', estimatedPages: 8000 }),
      expect.objectContaining({ color: 'yellow', estimatedPages: null }),
    ]));
    expect(result.bottleneckPages).toBe(5000);
  });

  it('does not divide by zero for a monochrome blank document', () => {
    const mono: CanonModel = { id: 'model-mono', name: 'Canon mono demo', colorType: 'mono', nominalYield: { black: 10_000 } };
    const blank = summarizeDocumentCoverage([normalizePageCoverage({ page: 1, black: 0, cyan: 0, magenta: 0, yellow: 0 })]);

    expect(calculateYield(mono, blank.average).bottleneckPages).toBeNull();
  });
});
