/**
 * La selección de modelos se guarda sola al cambiar. Al abrir el módulo se lee del servidor y ese mismo valor no debe
 * volver a escribirse: el servidor cuenta todo PUT como cambio de datos y avisaría de "Cambios sin respaldar" sin que
 * la persona haya tocado nada.
 */
export function selectionNeedsSave(current: readonly string[], persisted: readonly string[] | null): boolean {
  if (persisted === null) return false;
  return current.length !== persisted.length || current.some((model, index) => model !== persisted[index]);
}

/** Tope que acepta el servidor (PUT /api/sales/price-list-selection). Cliente y servidor comparten este valor. */
export const MAX_PRICE_LIST_SELECTION = 500;

/**
 * Suma `additions` a la selección sin pasar del tope. Devuelve la selección ordenada y cuántos modelos nuevos quedaron
 * fuera. Sin tope, "Seleccionar visibles" con miles de modelos hacía que el servidor respondiera 400 y nada se guardaba.
 */
export function addToSelection(
  current: readonly string[],
  additions: readonly string[],
  keyOf: (model: string) => string,
  limit: number = MAX_PRICE_LIST_SELECTION,
): { selection: string[]; skipped: number } {
  const next = new Map(current.map((value) => [keyOf(value), value]));
  let skipped = 0;
  for (const model of additions) {
    const key = keyOf(model);
    if (next.has(key)) continue;
    if (next.size >= limit) skipped += 1;
    else next.set(key, model);
  }
  return { selection: [...next.values()].sort((left, right) => left.localeCompare(right)), skipped };
}
