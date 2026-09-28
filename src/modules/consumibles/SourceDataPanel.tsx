import { useEffect, useState } from 'react';
import type { SourceMetadataBackfillSummary } from '../../core/source-metadata-backfill';
import type { ConsumablesBundleFiles, ConsumablesBundleSourceId } from './bundle';
import ConsumablesBundlePanel from './ConsumiblesBundlePanel';
export { findSourceHeaderRow } from '../../core/source-header-row';

type ImportBatchSummary = {
  domain: string;
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
  const [reindexing, setReindexing] = useState(false);
  const [clearing, setClearing] = useState(false);
  const [reindexMessage, setReindexMessage] = useState<string | null>(null);
  const [error, setError] = useState<string | null>(null);

  useEffect(() => {
    let cancelled = false;
    setError(null);
    setConsumablesBatchCount(0);
    fetch('/api/imports?limit=300')
      .then((response) => readJson<{ batches: ImportBatchSummary[] }>(response))
      .then((value) => {
        if (cancelled) return;
        setConsumablesBatchCount(value.batches.filter((batch) => batch.domain === 'consumibles').length);
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
    const confirmed = window.confirm('Se quitarán todas las cargas directas de Consumibles. Los XLSX originales se conservarán archivados y no se tocarán cartera, Servicios ni Viáticos. ¿Querés continuar?');
    if (!confirmed) return;
    setClearing(true);
    setReindexMessage(null);
    setError(null);
    try {
      const result = await onClearConsumables();
      setConsumablesBatchCount(0);
      setReindexMessage(`${numberFormat.format(result.batches)} cargas de Consumibles quitadas; ${numberFormat.format(result.archivedFiles)} originales archivados.`);
    } catch (requestError: unknown) {
      setError(toErrorMessage(requestError));
    } finally {
      setClearing(false);
    }
  }

  return (
    <section className="source-data-panel" aria-label="Fuentes de datos de Consumibles">
      <div className="source-data-heading">
        <div>
          <div className="eyebrow">CONSUMIBLES / DATOS</div>
          <h2>Fuentes y mantenimiento de datos</h2>
          <p>Importa el paquete histórico o vuelve a calcular la información a partir de los archivos originales conservados.</p>
        </div>
        <div className="source-data-heading-actions">
          <div className="source-data-reindex-actions">
            <div className="source-data-action-row">
              <button className="secondary-button" type="button" onClick={() => void reindexSources()} disabled={busy}>
                {reindexing ? 'Recalculando…' : 'Recalcular datos'}
              </button>
              <button className="secondary-button source-data-clear-button" type="button" onClick={() => void clearConsumables()} disabled={!hasConsumablesBatches || busy}>
                {clearing ? 'Limpiando…' : 'Limpiar cargas de Consumibles'}
              </button>
            </div>
            <small>Relee los XLSX archivados de Consumibles, Servicios y Viáticos.</small>
          </div>
          <div className="source-data-note">
            <strong>{numberFormat.format(consumablesBatchCount)}</strong>
            <span>cargas de Consumibles</span>
          </div>
        </div>
      </div>

      {error ? <div className="source-data-error" role="alert">{error}</div> : null}
      {reindexMessage ? <div className="source-data-success" role="status">{reindexMessage}</div> : null}

      <ConsumablesBundlePanel
        importing={bundleImporting}
        busy={busy}
        files={bundleFiles}
        onFilesChange={onBundleFilesChange}
        progressMessage={bundleProgress}
        onImportBundle={onImportBundle}
      />
    </section>
  );
}

async function readJson<T>(response: Response): Promise<T> {
  const body = (await response.json()) as T | { error?: string };
  if (!response.ok) {
    const error = typeof body === 'object' && body !== null && 'error' in body && typeof body.error === 'string'
      ? body.error
      : 'La API local devolvió un error.';
    throw new Error(error);
  }
  return body as T;
}

function toErrorMessage(value: unknown): string {
  return value instanceof Error ? value.message : 'No se pudieron leer los datos originales.';
}
