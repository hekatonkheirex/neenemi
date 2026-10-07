import { useEffect, useState } from 'react';
import type { SourceMetadataBackfillSummary } from '../../core/source-metadata-backfill';
import { latestLoadedBySource, type ConsumablesBundleFiles, type ConsumablesBundleSourceId, type LoadedBundleSources } from './bundle';
import ConsumablesBundlePanel from './ConsumiblesBundlePanel';
import { confirmAction } from '../../core/confirm';
import { readJson, toErrorMessage as describeError } from '../../core/http';
import { Badge } from '../../core/ui/badge';
import { Button } from '../../core/ui/button';
import { Card, CardHeader, Muted } from '../../core/ui/card';
export { findSourceHeaderRow } from '../../core/source-header-row';

type ImportBatchSummary = {
  domain: string;
  sourceName: string;
  sourceType: string | null;
  status: string;
  createdAt: string;
};

type ClearConsumablesResult = {
  ok: boolean;
  batches: number;
  archivedFiles: number;
};

type SourceDataPanelProps = {
  onImportBundle: (files: Record<ConsumablesBundleSourceId, File>) => void | Promise<void>;
  onBundleFilesChange: (files: ConsumablesBundleFiles) => void;
  onReindexSources: () => Promise<SourceMetadataBackfillSummary>;
  onClearConsumables: () => Promise<ClearConsumablesResult>;
  importing: boolean;
  bundleImporting: boolean;
  bundleFiles: ConsumablesBundleFiles;
  bundleProgress: string;
  refreshKey: number;
};

const numberFormat = new Intl.NumberFormat('es-PY');

export default function SourceDataPanel({ onImportBundle, onBundleFilesChange, onReindexSources, onClearConsumables, importing, bundleImporting, bundleFiles, bundleProgress, refreshKey }: SourceDataPanelProps) {
  const [consumablesBatchCount, setConsumablesBatchCount] = useState(0);
  const [loadedSources, setLoadedSources] = useState<LoadedBundleSources>({});
  const [reindexing, setReindexing] = useState(false);
  const [clearing, setClearing] = useState(false);
  const [reindexMessage, setReindexMessage] = useState<string | null>(null);
  const [error, setError] = useState<string | null>(null);

  useEffect(() => {
    let cancelled = false;
    setError(null);
    setConsumablesBatchCount(0);
    setLoadedSources({});
    fetch('/api/imports?limit=300')
      .then((response) => readJson<{ batches: ImportBatchSummary[] }>(response))
      .then((value) => {
        if (cancelled) return;
        setConsumablesBatchCount(value.batches.filter((batch) => batch.domain === 'consumibles').length);
        setLoadedSources(latestLoadedBySource(value.batches));
      })
      .catch((requestError: unknown) => {
        if (!cancelled) setError(toErrorMessage(requestError));
      });

    return () => {
      cancelled = true;
    };
  }, [refreshKey]);
  const busy = importing || reindexing || clearing;
  const hasConsumablesBatches = consumablesBatchCount > 0;

  async function reindexSources(): Promise<void> {
    setReindexing(true);
    setReindexMessage(null);
    setError(null);
    try {
      const summary = await onReindexSources();
      const normalizedRecords = summary.usageRecords + summary.outputRecords + summary.serviceRecords + summary.travelTrips;
      const details = [
        `${numberFormat.format(summary.files)} archivos revisados`,
        `${numberFormat.format(summary.rawRows)} filas originales disponibles`,
        `${numberFormat.format(normalizedRecords)} registros reindexados`,
      ];
      if (summary.travelCostCatalogs > 0) {
        details.push(`${numberFormat.format(summary.travelCostCatalogs)} catálogo(s) de Viáticos actualizados`);
      }
      if (summary.skippedFiles > 0) details.push(`${numberFormat.format(summary.skippedFiles)} archivos pendientes`);
      setReindexMessage(`Recalculo terminado: ${details.join(' · ')}.`);
      if (summary.errors.length > 0) {
        setError(`${summary.errors.length} fuente(s) requieren revisión: ${summary.errors.join(' · ')}`);
      }
    } catch (requestError: unknown) {
      setError(toErrorMessage(requestError));
    } finally {
      setReindexing(false);
    }
  }

  async function clearConsumables(): Promise<void> {
    if (!hasConsumablesBatches || busy) return;
    const confirmed = await confirmAction({
      title: 'Quitar cargas de Consumibles',
      message: 'Se quitarán todas las cargas directas de Consumibles. Los XLSX originales se conservarán archivados y no se tocarán cartera, Servicios ni Viáticos.',
      confirmLabel: 'Quitar cargas',
    });
    if (!confirmed) return;
    setClearing(true);
    setReindexMessage(null);
    setError(null);
    try {
      const result = await onClearConsumables();
      setConsumablesBatchCount(0);
      setLoadedSources({});
      setReindexMessage(`${numberFormat.format(result.batches)} cargas de Consumibles quitadas; ${numberFormat.format(result.archivedFiles)} originales archivados.`);
    } catch (requestError: unknown) {
      setError(toErrorMessage(requestError));
    } finally {
      setClearing(false);
    }
  }

  return (
    <Card className="min-w-0 grid-cols-1 [overflow-wrap:anywhere]" aria-label="Fuentes de datos de Consumibles">
      <CardHeader eyebrow="Consumibles / Datos" title="Fuentes y mantenimiento de datos" aside={<Badge>{numberFormat.format(consumablesBatchCount)} cargas de Consumibles</Badge>} />
      <Muted className="text-sm">Importa el paquete histórico o vuelve a calcular la información a partir de los archivos originales conservados.</Muted>
      <div className="grid gap-2">
        <div className="flex flex-wrap gap-2">
          <Button variant="outline" onClick={() => void reindexSources()} disabled={busy}>{reindexing ? 'Recalculando…' : 'Recalcular datos'}</Button>
          <Button variant="outline" onClick={() => void clearConsumables()} disabled={!hasConsumablesBatches || busy}>{clearing ? 'Limpiando…' : 'Limpiar cargas de Consumibles'}</Button>
        </div>
        <Muted>Relee los XLSX archivados de Consumibles, Servicios y Viáticos.</Muted>
      </div>

      {error ? <div className="rounded-xl border border-[#b42318]/30 bg-[#b42318]/5 p-4 text-sm text-[#b42318] dark:text-[#ffb0b7]" role="alert">{error}</div> : null}
      {reindexMessage ? <div className="rounded-xl border border-status-ok/40 bg-status-ok/10 p-4 text-sm text-status-ok-ink dark:text-status-ok-ink-dark" role="status">{reindexMessage}</div> : null}

      <div className="border-t border-navy/10 pt-4 dark:border-sky/20">
        <ConsumablesBundlePanel
          importing={bundleImporting}
          busy={busy}
          files={bundleFiles}
          loaded={loadedSources}
          onFilesChange={onBundleFilesChange}
          progressMessage={bundleProgress}
          onImportBundle={onImportBundle}
        />
      </div>
    </Card>
  );
}

function toErrorMessage(value: unknown): string {
  return describeError(value, 'No se pudieron leer los datos originales.');
}
