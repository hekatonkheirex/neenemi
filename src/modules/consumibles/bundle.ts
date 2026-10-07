import { SOURCE_CATALOG, sourceMatchesDefinition } from '../../core/source-catalog';

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

export type LoadedBundleSource = { sourceName: string; createdAt: string };
export type LoadedBundleSources = Partial<Record<ConsumablesBundleSourceId, LoadedBundleSource>>;

type BatchLike = { sourceName: string; sourceType: string | null; domain: string; status: string; createdAt: string };

/** Última carga aplicada por fuente del paquete, según la matriz de fuentes. */
export function latestLoadedBySource(batches: readonly BatchLike[]): LoadedBundleSources {
  const loaded: LoadedBundleSources = {};
  for (const source of CONSUMABLES_BUNDLE_SOURCES) {
    const definition = SOURCE_CATALOG.find((item) => item.id === source.catalogId);
    if (!definition) continue;
    const latest = batches
      .filter((batch) => batch.status === 'applied' && sourceMatchesDefinition(definition, batch.sourceName, batch.sourceType, batch.domain))
      .reduce<BatchLike | null>((best, batch) => (!best || batch.createdAt > best.createdAt ? batch : best), null);
    if (latest) loaded[source.id] = { sourceName: latest.sourceName, createdAt: latest.createdAt };
  }
  return loaded;
}

export function isConsumablesBundleComplete(files: ConsumablesBundleFiles): files is Record<ConsumablesBundleSourceId, File> {
  return CONSUMABLES_BUNDLE_SOURCES.every((source) => Boolean(files[source.id]));
}
