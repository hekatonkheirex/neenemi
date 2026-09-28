import { describe, expect, it } from 'vitest';
import { analyzePageCoverage } from './pixel-coverage';

function solidPixel(red: number, green: number, blue: number, alpha = 255) {
  return { width: 1, height: 1, data: Uint8ClampedArray.from([red, green, blue, alpha]) };
}

describe('analyzePageCoverage', () => {
  it('reports a white page as zero coverage', () => {
    expect(analyzePageCoverage(solidPixel(255, 255, 255), 1)).toEqual({
      page: 1, black: 0, cyan: 0, magenta: 0, yellow: 0, total: 0,
    });
  });

  it('reports a black page as K-only coverage', () => {
    expect(analyzePageCoverage(solidPixel(0, 0, 0), 1)).toEqual({
      page: 1, black: 100, cyan: 0, magenta: 0, yellow: 0, total: 100,
    });
  });

  it('extracts normalized CMY from composite color and composites transparency over white', () => {
    const composite = analyzePageCoverage(solidPixel(128, 160, 64), 1);
    expect(composite.black).toBeCloseTo(37.25, 2);
    expect(composite.cyan).toBeCloseTo(20, 2);
    expect(composite.yellow).toBeCloseTo(60, 2);
    expect(analyzePageCoverage(solidPixel(0, 0, 0, 0), 1).total).toBe(0);
  });
});
