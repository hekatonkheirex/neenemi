/**
 * Cuenta cuántos ítems tiene cada modelo en una sola pasada. La cuadrícula de modelos del Listado de precios recorría los
 * ~10 mil ítems una vez por cada uno de sus ~600 modelos, en cada render (~3 s de ventana bloqueada al abrir).
 * Un ítem cuenta una vez por modelo, aunque lo nombre varias veces.
 */
export function countItemsByModel<T>(
  items: readonly T[],
  modelsOf: (item: T) => readonly string[],
  normalize: (model: string) => string,
): Map<string, number> {
  const counts = new Map<string, number>();
  for (const item of items) {
    for (const key of new Set(modelsOf(item).map(normalize))) counts.set(key, (counts.get(key) ?? 0) + 1);
  }
  return counts;
}
