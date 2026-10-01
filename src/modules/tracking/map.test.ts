import { describe, expect, it } from 'vitest';
import { project, unproject } from './RouteMap';
describe('geographic reference selection', () => {
  it('selects Greenwich at the world center and wraps longitude at the dateline', () => {
    expect(unproject(0.5, 0.5)).toEqual({ latitude: 0, longitude: 0 });
    expect(unproject(0, 0.5).longitude).toBe(-180);
    expect(unproject(1.25, 0.5).longitude).toBe(-90);
  });
  it('keeps a Paraguay map click in Paraguay instead of the opposite hemisphere', () => {
    const position = project({ latitude: -25.3, longitude: -57.6 });
    expect(position.x).toBeCloseTo(0.34, 8);
    expect(unproject(0.34, position.y).longitude).toBeCloseTo(-57.6, 6);
    expect(unproject(0.34, position.y).latitude).toBeCloseTo(-25.3, 6);
  });
});
