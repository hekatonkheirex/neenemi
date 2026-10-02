import { useEffect, useRef, useState } from 'react';
import { submitImportJob, type ImportJobSnapshot } from '../core/import-job-client';
import { confirmAction } from '../core/confirm';

type ImportFileContentStatus = {
  totalFiles: number;
  embeddedFiles: number;
  missingFiles: number;
  totalBytes: number;
  embeddedBytes: number;
};

type BackfillResult = {
  total: number;
  embedded: number;
  failed: number;
  errors: string[];
};

type DatabaseRecoveryPanelProps = {
  refreshKey: number;
};

const byteFormat = new Intl.NumberFormat('es-PY', { maximumFractionDigits: 1 });

export default function DatabaseRecoveryPanel({ refreshKey }: DatabaseRecoveryPanelProps) {
  const [status, setStatus] = useState<ImportFileContentStatus | null>(null);
  const [loadingStatus, setLoadingStatus] = useState(true);
  const [backfillJob, setBackfillJob] = useState<ImportJobSnapshot<BackfillResult> | null>(null);
  const [backfilling, setBackfilling] = useState(false);
  const [restoring, setRestoring] = useState(false);
  const [message, setMessage] = useState<{ tone: 'success' | 'error'; text: string } | null>(null);
  const restoreInput = useRef<HTMLInputElement>(null);

  useEffect(() => {
    let cancelled = false;
    setLoadingStatus(true);
    fetch('/api/system/import-originals/status', { cache: 'no-store' })
      .then(async (response) => {
        if (!response.ok) throw new Error('No se pudo consultar el estado de los originales.');
        return await response.json() as ImportFileContentStatus;
      })
      .then((value) => {
        if (!cancelled) setStatus(value);
      })
      .catch((error: unknown) => {
        if (!cancelled) setMessage({ tone: 'error', text: errorMessage(error) });
      })
      .finally(() => {
        if (!cancelled) setLoadingStatus(false);
      });

    return () => {
      cancelled = true;
    };
  }, [refreshKey]);

  async function backfillOriginals() {
    if (backfilling) return;
    setBackfilling(true);
    setBackfillJob(null);
    setMessage(null);
    try {
      const result = await submitImportJob<BackfillResult>(
        '/api/system/import-originals/backfill',
        {},
        setBackfillJob,
      );
      setMessage(result.failed > 0
        ? { tone: 'error', text: `${result.embedded} originales guardados; ${result.failed} no se pudieron verificar. ${result.errors.slice(0, 2).join(' ')} Puedes reintentar.` }
        : { tone: 'success', text: `${result.embedded} originales incorporados y verificados dentro de SQLite.` });
      await refreshStatus();
    } catch (error) {
      setMessage({ tone: 'error', text: errorMessage(error) });
    } finally {
      setBackfilling(false);
    }
  }

  async function restoreBackup(file: File | undefined) {
    if (!file || restoring) return;
    if (!/\.(sqlite|db)$/i.test(file.name)) {
      setMessage({ tone: 'error', text: 'Selecciona un archivo .sqlite o .db.' });
      return;
    }
    const confirmed = await confirmAction({
      title: 'Restaurar respaldo',
      message: `Vas a reemplazar toda la base activa con “${file.name}”. Antes de activarla, la Suite validará el respaldo y guardará una copia automática de la base actual. La aplicación se reiniciará.`,
      confirmLabel: 'Reemplazar base',
    });
    if (!confirmed) return;

    setRestoring(true);
    setMessage(null);
    try {
      const response = await fetch('/api/system/restore', {
        method: 'POST',
        headers: { 'content-type': 'application/vnd.sqlite3' },
        body: file,
      });
      const body = await response.json() as { error?: string; message?: string };
      if (!response.ok) throw new Error(body.error ?? 'No se pudo restaurar el respaldo.');
      setMessage({ tone: 'success', text: body.message ?? 'Restaurando la base. La Suite se reiniciará…' });
      await waitForRestoredService();
      window.location.reload();
    } catch (error) {
      setMessage({ tone: 'error', text: errorMessage(error) });
      setRestoring(false);
    }
  }

  async function refreshStatus() {
    const response = await fetch('/api/system/import-originals/status', { cache: 'no-store' });
    if (!response.ok) throw new Error('No se pudo actualizar el estado de los originales.');
    setStatus(await response.json() as ImportFileContentStatus);
  }

  const missingFiles = status?.missingFiles ?? 0;
  const backupReady = status !== null && missingFiles === 0;
  const statusText = loadingStatus
    ? 'Consultando archivos originales…'
    : !status
      ? 'No se pudo consultar el estado del archivo.'
      : missingFiles === 0
        ? `${status.embeddedFiles.toLocaleString('es-PY')} de ${status.totalFiles.toLocaleString('es-PY')} originales activos o archivados están dentro de SQLite.`
        : `${status.embeddedFiles.toLocaleString('es-PY')} de ${status.totalFiles.toLocaleString('es-PY')} originales activos o archivados están dentro de SQLite; faltan ${missingFiles.toLocaleString('es-PY')}.`;

  return (
    <section className="database-recovery" aria-label="Respaldo y recuperación de la base">
      <div className="database-recovery-copy">
        <span className="detail-label">Respaldo y recuperación</span>
        <h3>Una copia con datos y originales</h3>
        <p>{statusText}</p>
        {status ? (
          <small>
            {formatBytes(status.embeddedBytes)} guardados de {formatBytes(status.totalBytes)} de archivos originales activos o archivados.
          </small>
        ) : null}
      </div>

      <div className="database-recovery-controls">
        <div className="database-recovery-actions">
          {missingFiles > 0 ? (
            <button
              className="secondary-button"
              type="button"
              disabled={backfilling || loadingStatus}
              onClick={() => void backfillOriginals()}
            >
              {backfilling ? `${backfillJob?.progress ?? 0}% · ${backfillJob?.stage ?? 'Preparando…'}` : 'Incluir originales en SQLite'}
            </button>
          ) : null}
          {backupReady ? (
            <a className="secondary-button database-recovery-button" href="/api/system/backup" download>
              Descargar respaldo completo
            </a>
          ) : (
            <button className="secondary-button" type="button" disabled>
              Completa los originales para respaldar
            </button>
          )}
        </div>

        <button
          className="database-restore-picker"
          type="button"
          disabled={restoring || backfilling}
          onClick={() => restoreInput.current?.click()}
        >
          {restoring ? 'Validando y restaurando…' : 'Restaurar respaldo SQLite'}
        </button>
        <input
          ref={restoreInput}
          className="database-restore-file"
          type="file"
          accept=".sqlite,.db,application/vnd.sqlite3,application/octet-stream"
          disabled={restoring || backfilling}
          onChange={(event) => {
            const file = event.currentTarget.files?.[0];
            event.currentTarget.value = '';
            void restoreBackup(file);
          }}
        />
        <small>Máximo 2 GB. La restauración sustituye toda la base y reinicia la Suite.</small>
      </div>

      {backfilling && backfillJob ? (
        <progress className="database-recovery-progress" max={100} value={backfillJob.progress} aria-label="Progreso de archivo" />
      ) : null}
      {message ? <p className={`database-recovery-message ${message.tone}`} role={message.tone === 'error' ? 'alert' : 'status'}>{message.text}</p> : null}
    </section>
  );
}

function formatBytes(bytes: number): string {
  if (bytes < 1024) return `${bytes.toLocaleString('es-PY')} B`;
  const units = ['KB', 'MB', 'GB', 'TB'];
  let value = bytes;
  let unitIndex = -1;
  do {
    value /= 1024;
    unitIndex += 1;
  } while (value >= 1024 && unitIndex < units.length - 1);
  return `${byteFormat.format(value)} ${units[unitIndex]}`;
}

async function waitForRestoredService(): Promise<void> {
  const deadline = Date.now() + 90_000;
  let consecutiveHealthyChecks = 0;
  while (Date.now() < deadline) {
    try {
      const response = await fetch('/api/health', { cache: 'no-store' });
      if (response.ok) {
        const body = await response.json() as { ok?: boolean };
        consecutiveHealthyChecks = body.ok ? consecutiveHealthyChecks + 1 : 0;
        if (consecutiveHealthyChecks >= 2) return;
      } else {
        consecutiveHealthyChecks = 0;
      }
    } catch {
      // The desktop process or dev server is restarting.
      consecutiveHealthyChecks = 0;
    }
    await new Promise<void>((resolve) => setTimeout(resolve, 500));
  }
  throw new Error('La base se preparó, pero el servicio no volvió a responder. Reinicia la Suite para verificar el resultado.');
}

function errorMessage(error: unknown): string {
  return error instanceof Error ? error.message : 'Ocurrió un error al recuperar la base.';
}
