/**
 * La selección de modelos se guarda sola al cambiar. Al abrir el módulo se lee del servidor y ese mismo valor no debe
 * volver a escribirse: el servidor cuenta todo PUT como cambio de datos y avisaría de "Cambios sin respaldar" sin que
 * la persona haya tocado nada.
 */
export function selectionNeedsSave(current: readonly string[], persisted: readonly string[] | null): boolean {
  if (persisted === null) return false;
  return current.length !== persisted.length || current.some((model, index) => model !== persisted[index]);
}
