export const CONSUMABLES_BUNDLE_SOURCES = [
  { id: 'fleet.equipment', catalogId: 'fleet.equipment', label: 'Equipos en contrato' },
  { id: 'fleet.contracts', catalogId: 'fleet.contracts', label: 'Contratos afectados' },
  { id: 'fleet.contract-details', catalogId: 'fleet.contract-details', label: 'Detalles de contratos' },
  { id: 'consumibles.detail', catalogId: 'consumibles.detail', label: 'Detalle de consumibles' },
  { id: 'consumibles.parts-detail', catalogId: 'consumibles.parts-detail', label: 'Detalle de repuestos' },
  { id: 'consumibles.parts-usage', catalogId: 'consumibles.parts-usage', label: 'Uso de repuestos' },
  { id: 'consumibles.dispatch', catalogId: 'consumibles.dispatch', label: 'Salida de consumibles' },
  { id: 'consumibles.parts-dispatch', catalogId: 'consumibles.parts-dispatch', label: 'Salida de repuestos' },
  { id: 'services.lam', catalogId: 'services.lam', label: 'Servicios LAM' },
] as const;

export type ConsumablesBundleSourceId = (typeof CONSUMABLES_BUNDLE_SOURCES)[number]['id'];
export type ConsumablesBundleFiles = Partial<Record<ConsumablesBundleSourceId, File>>;

export function isConsumablesBundleComplete(files: ConsumablesBundleFiles): files is Record<ConsumablesBundleSourceId, File> {
  return CONSUMABLES_BUNDLE_SOURCES.every((source) => Boolean(files[source.id]));
}
