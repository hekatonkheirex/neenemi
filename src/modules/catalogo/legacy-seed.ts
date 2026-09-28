import { parseLegacyCatalogJson, type ParsedCatalog } from './parser';

type SeedIndexEntry = {
  file: string;
};

export type LegacySeedCatalog = {
  parsed: ParsedCatalog;
  sourceBytes: Uint8Array;
  familyCount: number;
};

/**
 * Loads the exact family JSON resources extracted by the old Listado de precios.
 * The combined JSON is kept as the import source so coded parts, technical
 * model notes, and labor/fixed rows can be projected into the shared catalog.
 */
export async function loadLegacyPriceListSeed(): Promise<LegacySeedCatalog> {
  const indexResponse = await fetch('/legacy-seed/index.json', { cache: 'no-store' });
  if (!indexResponse.ok) throw new Error('No se pudo cargar el índice de la semilla heredada.');

  const index = await indexResponse.json() as unknown;
  if (!Array.isArray(index) || !index.every(isSeedIndexEntry)) {
    throw new Error('El índice de la semilla heredada no tiene una estructura válida.');
  }

  const families = await Promise.all(index.map(async ({ file }) => {
    const response = await fetch(`/legacy-seed/${encodeURIComponent(file)}`, { cache: 'no-store' });
    if (!response.ok) throw new Error(`No se pudo cargar la familia ${file}.`);
    return await response.json() as unknown;
  }));
  const sourceText = JSON.stringify({ families }, null, 2);
  const sourceBytes = new TextEncoder().encode(sourceText);

  return {
    parsed: parseLegacyCatalogJson(sourceText),
    sourceBytes,
    familyCount: families.length,
  };
}

function isSeedIndexEntry(value: unknown): value is SeedIndexEntry {
  return typeof value === 'object'
    && value !== null
    && 'file' in value
    && typeof value.file === 'string'
    && /^[a-z0-9-]+\.json$/i.test(value.file);
}
