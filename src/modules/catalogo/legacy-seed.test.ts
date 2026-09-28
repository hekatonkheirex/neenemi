import fs from 'node:fs';
import path from 'node:path';
import { describe, expect, it } from 'vitest';
import { parseLegacyCatalogJson } from './parser';

describe('legacy Listado de precios seed', () => {
  it('ships all indexed families and recovers their coded parts', () => {
    const seedDirectory = path.resolve(process.cwd(), 'public', 'legacy-seed');
    const index = JSON.parse(fs.readFileSync(path.join(seedDirectory, 'index.json'), 'utf8')) as Array<{ file: string }>;
    const families = index.map(({ file }) => JSON.parse(fs.readFileSync(path.join(seedDirectory, file), 'utf8')) as unknown);
    const parsed = parseLegacyCatalogJson(JSON.stringify({ families }));

    expect(index).toHaveLength(13);
    expect(index.map(({ file }) => file)).toContain('listado-pantum.json');
    expect(parsed.parts.length).toBeGreaterThan(4000);
    expect(parsed.parts.some((part) => part.code === '0388B003AA')).toBe(true);
    expect(parsed.serviceItems.length).toBeGreaterThan(100);
    expect(parsed.serviceItems.some((item) => item.kind === 'fixed' && item.fixedPriceLocal === 320000)).toBe(true);
    expect(parsed.modelNotes.length).toBeGreaterThan(0);
    expect(parsed.modelFamilies.length).toBeGreaterThan(90);
    expect(parsed.modelFamilies).toEqual(expect.arrayContaining([
      expect.objectContaining({ familyName: 'iR', exchangeRate: 6080, factor: 1.8 }),
      expect.objectContaining({ familyName: 'Listado Pantum', exchangeRate: 6350, factor: 1.8 }),
    ]));
  });
});
