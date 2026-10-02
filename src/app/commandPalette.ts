import type { SuiteModule } from './modules';

export type PaletteEntry = { id: string | null; label: string; hint: string };

const fold = (text: string) => text.normalize('NFD').replace(/\p{M}/gu, '').toLowerCase();

export function buildPaletteEntries(modules: readonly SuiteModule[], sectionLabels: Record<SuiteModule['section'], string>): PaletteEntry[] {
  return [
    { id: null, label: 'Resumen', hint: 'Inicio' },
    ...modules.map((module) => ({ id: module.id, label: module.label, hint: sectionLabels[module.section] })),
  ];
}

/** Sin acentos ni mayúsculas. Primero los que empiezan con la consulta, luego los que la contienen. */
export function filterPaletteEntries(entries: readonly PaletteEntry[], query: string): PaletteEntry[] {
  const q = fold(query).trim();
  if (!q) return [...entries];
  const starts: PaletteEntry[] = [];
  const contains: PaletteEntry[] = [];
  for (const entry of entries) {
    const label = fold(entry.label);
    if (label.startsWith(q)) starts.push(entry);
    else if (label.includes(q) || fold(entry.hint).includes(q)) contains.push(entry);
  }
  return [...starts, ...contains];
}
