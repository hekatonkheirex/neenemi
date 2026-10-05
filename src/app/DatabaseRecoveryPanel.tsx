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

export type BackupHealth = {
  lastBackupAt: string | null;
  lastLoadAt: string | null;
  loadsSinceBackup: number;
  daysSinceBackup: number | null;
  level: 'never' | 'pending' | 'stale' | 'ok';
};

type DatabaseRecoveryPanelProps = {
  refreshKey: number;
  onHealthChange?: (level: BackupHealth['level']) => void;
};

const byteFormat = new Intl.NumberFormat('es-PY', { maximumFractionDigits: 1 });
const dateTimeFormat = new Intl.DateTimeFormat('es-PY', { day: '2-digit', month: '2-digit', year: 'numeric', hour: '2-digit', minute: '2-digit', hour12: false });

const formatStamp = (value: string | null) => (value ? dateTimeFormat.format(new Date(value)) : 'Nunca');
const plural = (n: number, one: string, many: string) => `${n.toLocaleString('es-PY')} ${n === 1 ? one : many}`;

function describeAge(days: number | null): string {
  if (days === null) return 'sin respaldo';
  if (days === 0) return 'hoy';
  return `hace ${plural(days, 'día', 'días')}`;
}

function describeReminder(health: BackupHealth): { title: string; text: string } {
  switch (health.level) {
    case 'never':
      return { title: 'Todavía no hay ningún respaldo', text: 'Descarga uno ahora: si falla el disco o la base se daña, la información cargada no se puede recuperar.' };
    case 'pending':
      return { title: `${plural(health.loadsSinceBackup, 'carga sin respaldar', 'cargas sin respaldar')}`, text: `El último respaldo es del ${formatStamp(health.lastBackupAt)}. Genera uno nuevo para no perder esos datos.` };
    case 'stale':
      return { title: `Último respaldo ${describeAge(health.daysSinceBackup)}`, text: 'Pasó una semana o más. Genera uno nuevo: viajes, proformas y ajustes manuales también cuentan.' };
    default:
      return { title: 'Información respaldada', text: `Último respaldo ${describeAge(health.daysSinceBackup)}. Te recordaremos al pasar una semana o tras nuevas cargas.` };
  }
}

export default function DatabaseRecoveryPanel({ refreshKey, onHealthChange }: DatabaseRecoveryPanelProps) {
  const [status, setStatus] = useState<ImportFileContentStatus | null>(null);
  const [loadingStatus, setLoadingStatus] = useState(true);
  const [health, setHealth] = useState<BackupHealth | null>(null);
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

    void refreshHealth().catch(() => undefined);

    return () => {
      cancelled = true;
    };
  }, [refreshKey]);

  async function refreshHealth() {
    const response = await fetch('/api/system/backup/status', { cache: 'no-store' });
    if (!response.ok) throw new Error('No se pudo consultar el estado del respaldo.');
    const value = await response.json() as BackupHealth;
    setHealth(value);
    onHealthChange?.(value.level);
  }

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

  const reminder = health ? describeReminder(health) : null;
  const downloadButton = backupReady ? (
    <a
      className="database-backup-cta"
      href="/api/system/backup"
      download
      onClick={() => { window.setTimeout(() => void refreshHealth().catch(() => undefined), 2500); }}
    >
      Descargar respaldo completo
    </a>
  ) : (
    <button className="database-backup-cta" type="button" disabled>
      Completa los originales para respaldar
    </button>
  );

  return (
    <section className={`database-recovery level-${health?.level ?? 'loading'}`} aria-label="Respaldo y recuperación de la base">
      <div className="backup-banner" role="status">
        <span className="backup-banner-icon" aria-hidden="true">{health?.level === 'ok' ? '✓' : '!'}</span>
        <div className="backup-banner-copy">
          <span className="detail-label">Respaldo y recuperación</span>
          <h3>{reminder?.title ?? 'Consultando el estado del respaldo…'}</h3>
          {reminder ? <p>{reminder.text}</p> : null}
        </div>
        {downloadButton}
      </div>

      {health ? (
        <dl className="backup-stats">
          <div>
            <dt>Último respaldo</dt>
            <dd>{formatStamp(health.lastBackupAt)}</dd>
            <small>{describeAge(health.daysSinceBackup)}</small>
          </div>
          <div>
            <dt>Última carga aplicada</dt>
            <dd>{health.lastLoadAt ? formatStamp(health.lastLoadAt) : 'Sin cargas'}</dd>
            <small>importación más reciente</small>
          </div>
          <div className={health.loadsSinceBackup > 0 ? 'attention' : undefined}>
            <dt>Cargas sin respaldar</dt>
            <dd>{health.loadsSinceBackup.toLocaleString('es-PY')}</dd>
            <small>aplicadas tras el último respaldo</small>
          </div>
          <div className={missingFiles > 0 ? 'attention' : undefined}>
            <dt>Originales en SQLite</dt>
            <dd>{status ? `${status.embeddedFiles.toLocaleString('es-PY')} / ${status.totalFiles.toLocaleString('es-PY')}` : '—'}</dd>
            <small>{status ? `${formatBytes(status.embeddedBytes)} de ${formatBytes(status.totalBytes)}` : 'consultando…'}</small>
          </div>
        </dl>
      ) : null}

      <div className="database-recovery-body">
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
            <button
              className="database-restore-picker"
              type="button"
              disabled={restoring || backfilling}
              onClick={() => restoreInput.current?.click()}
            >
              {restoring ? 'Validando y restaurando…' : 'Restaurar respaldo SQLite'}
            </button>
          </div>
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
