import { useEffect, useRef, useState } from 'react';
import { Check, TriangleAlert } from 'lucide-react';
import { cn } from '../core/cn';
import { Button } from '../core/ui/button';
import { Card } from '../core/ui/card';
import { submitImportJob, type ImportJobSnapshot } from '../core/import-job-client';
import { confirmAction } from '../core/confirm';
import { BusySpinner } from '../core/ActionButtons';
import { downloadBackup } from '../core/backup-download';
import { MAX_RESTORE_LABEL } from '../core/restore-limit';
import { STALE_BACKUP_PHRASE } from './backupCopy';

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
  lastChangeAt: string | null;
  loadsSinceBackup: number;
  changedSinceBackup: boolean;
  daysSinceBackup: number | null;
  level: 'never' | 'pending' | 'stale' | 'ok';
};

type DatabaseRecoveryPanelProps = {
  refreshKey: number;
  onHealthChange?: (level: BackupHealth['level']) => void;
  onClearImports?: () => void;
  clearingImports?: boolean;
  clearMessage?: { tone: 'success' | 'error'; text: string } | null;
};

const byteFormat = new Intl.NumberFormat('es-PY', { maximumFractionDigits: 1 });
const dateTimeFormat = new Intl.DateTimeFormat('es-PY', { day: '2-digit', month: '2-digit', year: 'numeric', hour: '2-digit', minute: '2-digit', hour12: false });

const formatStamp = (value: string | null) => (value ? dateTimeFormat.format(new Date(value)) : 'Nunca');
/** Con el estado de originales caído se permite respaldar: el aviso de error ya se muestra y bloquear el respaldo agrava el problema. */
export function canBackup(status: Pick<ImportFileContentStatus, 'missingFiles'> | null, loadingStatus: boolean): boolean {
  return !loadingStatus && (status === null || status.missingFiles === 0);
}

const plural = (n: number, one: string, many: string) => `${n.toLocaleString('es-PY')} ${n === 1 ? one : many}`;

// Colores de estado (no de marca): rojo = sin respaldar, ámbar = antiguo, verde = al día. El texto del CTA se elige por contraste.
const levelTone = {
  never: { accent: '#d92d20', ink: 'text-white!' },
  pending: { accent: '#d92d20', ink: 'text-white!' },
  stale: { accent: '#e08a00', ink: 'text-navy!' },
  ok: { accent: '#2f8f5b', ink: 'text-white!' },
  loading: { accent: '#6b7a90', ink: 'text-white!' },
} as const;

const mutedText = 'text-ink-2 dark:text-[#9fb2d1]';

function describeAge(days: number | null): string {
  if (days === null) return 'sin respaldo';
  if (days === 0) return 'hoy';
  return `hace ${plural(days, 'día', 'días')}`;
}

export function describeReminder(health: BackupHealth): { title: string; text: string } {
  switch (health.level) {
    case 'never':
      return { title: 'Todavía no hay ningún respaldo', text: 'Descarga uno ahora: si falla el disco o la base se daña, la información cargada no se puede recuperar.' };
    case 'pending': {
      const when = `El último respaldo es del ${formatStamp(health.lastBackupAt)}.`;
      return health.loadsSinceBackup > 0
        ? { title: plural(health.loadsSinceBackup, 'carga sin respaldar', 'cargas sin respaldar'), text: `${when} Genera uno nuevo para no perder esos datos.` }
        : { title: 'Base modificada desde el último respaldo', text: `${when} Hay altas, ediciones o eliminaciones posteriores, incluidas las cargas retiradas. Un nuevo respaldo guarda el estado actual de la base.` };
    }
    case 'stale':
      return { title: `Último respaldo ${describeAge(health.daysSinceBackup)}`, text: `Pasó ${STALE_BACKUP_PHRASE}. Genera uno nuevo: viajes, proformas y ajustes manuales también cuentan.` };
    default:
      return { title: 'Información respaldada', text: `Último respaldo ${describeAge(health.daysSinceBackup)}. Te recordaremos al pasar una semana o tras nuevas cargas.` };
  }
}

export default function DatabaseRecoveryPanel({ refreshKey, onHealthChange, onClearImports, clearingImports = false, clearMessage = null }: DatabaseRecoveryPanelProps) {
  const [status, setStatus] = useState<ImportFileContentStatus | null>(null);
  const [loadingStatus, setLoadingStatus] = useState(true);
  const [health, setHealth] = useState<BackupHealth | null>(null);
  const [backfillJob, setBackfillJob] = useState<ImportJobSnapshot<BackfillResult> | null>(null);
  const [backfilling, setBackfilling] = useState(false);
  const [restoring, setRestoring] = useState(false);
  const [downloading, setDownloading] = useState(false);
  const [restoreStage, setRestoreStage] = useState('');
  const [message, setMessage] = useState<{ tone: 'success' | 'error' | 'info'; text: string } | null>(() => {
    try {
      const text = sessionStorage.getItem('dcss-restored-message');
      return text ? { tone: 'success', text } : null;
    } catch {
      return null;
    }
  });
  const restoreInput = useRef<HTMLInputElement>(null);

  useEffect(() => {
    try { sessionStorage.removeItem('dcss-restored-message'); } catch { /* almacenamiento no disponible */ }
  }, []);
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

    const updateHealth = () => {
      if (!cancelled && document.visibilityState === 'visible') {
        void refreshHealth().catch(() => undefined);
      }
    };
    updateHealth();
    // La descarga puede tardar más que una consulta diferida única.
    const healthInterval = window.setInterval(updateHealth, 5000);
    window.addEventListener('focus', updateHealth);
    document.addEventListener('visibilitychange', updateHealth);

    return () => {
      cancelled = true;
      window.clearInterval(healthInterval);
      window.removeEventListener('focus', updateHealth);
      document.removeEventListener('visibilitychange', updateHealth);
    };
  }, [refreshKey]);

  async function refreshHealth() {
    const response = await fetch('/api/system/backup/status', { cache: 'no-store' });
    if (!response.ok) throw new Error('No se pudo consultar el estado del respaldo.');
    const value = await response.json() as BackupHealth;
    setHealth(value);
    onHealthChange?.(value.level);
  }

  async function saveBackup() {
    if (downloading || restoring || backfilling || clearingImports) return;
    setDownloading(true);
    setMessage(null);
    const startedAt = Date.now();
    try {
      const result = await downloadBackup();
      const duration = formatDuration(Date.now() - startedAt);
      setMessage({
        tone: result.status === 'cancelled' ? 'info' : 'success',
        text: result.status === 'cancelled'
          ? 'Guardado del respaldo cancelado. No se generó un nuevo archivo.'
          : result.status === 'saved'
            ? `Respaldo guardado${result.filePath ? ` en ${result.filePath}` : ''}. Duración: ${duration}.`
            : `Respaldo enviado al navegador en ${duration}. Comprueba que la descarga termine en su administrador de descargas.`,
      });
      if (result.status !== 'cancelled') await refreshHealth().catch(() => undefined);
    } catch (error) {
      setMessage({ tone: 'error', text: `No se pudo guardar el respaldo: ${errorMessage(error)}` });
    } finally {
      setDownloading(false);
    }
  }

  async function backfillOriginals() {
    if (backfilling || downloading || restoring || clearingImports) return;
    setBackfilling(true);
    setBackfillJob(null);
    setMessage(null);
    const startedAt = Date.now();
    try {
      const result = await submitImportJob<BackfillResult>(
        '/api/system/import-originals/backfill',
        {},
        setBackfillJob,
      );
      setMessage(result.failed > 0
        ? { tone: 'error', text: `${result.embedded} originales guardados; ${result.failed} no se pudieron verificar. ${result.errors.slice(0, 2).join(' ')} Puedes reintentar.` }
        : { tone: 'success', text: `${result.embedded} originales incorporados y verificados dentro de SQLite. Duración: ${formatDuration(Date.now() - startedAt)}.` });
      await refreshStatus();
    } catch (error) {
      setMessage({ tone: 'error', text: errorMessage(error) });
    } finally {
      setBackfilling(false);
    }
  }

  async function restoreBackup(file: File | undefined) {
    if (!file || restoring || downloading || backfilling || clearingImports) return;
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
    setRestoreStage('Enviando y validando el respaldo SQLite.');
    setMessage(null);
    const startedAt = Date.now();
    try {
      const response = await fetch('/api/system/restore', {
        method: 'POST',
        headers: { 'content-type': 'application/vnd.sqlite3' },
        body: file,
      });
      const body = await response.json() as { error?: string; message?: string };
      if (!response.ok) throw new Error(body.error ?? 'No se pudo restaurar el respaldo.');
      setRestoreStage('Respaldo validado. Reiniciando la Suite para activar la base.');
      await waitForRestoredService();
      const text = `Respaldo restaurado. La base está disponible. Duración: ${formatDuration(Date.now() - startedAt)}.`;
      setMessage({ tone: 'success', text });
      try { sessionStorage.setItem('dcss-restored-message', text); } catch { /* almacenamiento no disponible */ }
      window.location.reload();
    } catch (error) {
      setMessage({ tone: 'error', text: `La restauración falló tras ${formatDuration(Date.now() - startedAt)}: ${errorMessage(error)}` });
      setRestoring(false);
    }
  }

  async function refreshStatus() {
    const response = await fetch('/api/system/import-originals/status', { cache: 'no-store' });
    if (!response.ok) throw new Error('No se pudo actualizar el estado de los originales.');
    setStatus(await response.json() as ImportFileContentStatus);
  }

  const missingFiles = status?.missingFiles ?? 0;
  const backupReady = canBackup(status, loadingStatus);

  const clearedSinceBackup = clearMessage?.tone === 'success' && health?.level === 'pending' && health.loadsSinceBackup === 0;
  const reminder = clearedSinceBackup
    ? { title: 'Cargas retiradas desde el último respaldo', text: 'La limpieza quitó las cargas activas, pero conserva los originales archivados y el trabajo manual. El respaldo anterior guarda el estado previo. Descarga uno nuevo solo si quieres guardar también el estado limpio; no hace falta para restaurar el anterior.' }
    : health ? describeReminder(health) : null;
  const level = health?.level ?? 'loading';
  const tone = levelTone[level];
  const ctaClass = cn('h-auto min-h-11 max-w-full whitespace-normal px-5 py-2 font-extrabold bg-(--accent) hover:brightness-110 hover:bg-(--accent)', tone.ink);
  const busy = restoring || backfilling || downloading || clearingImports;
  const operationTitle = clearingImports ? 'Limpiando cargas' : downloading ? 'Guardando respaldo' : restoring ? 'Restaurando respaldo' : backfilling ? 'Incorporando originales' : null;
  const operationDetail = clearingImports
    ? 'Retirando las cargas y archivando sus originales. El trabajo manual se conserva.'
    : downloading
      ? 'Selecciona el destino si se solicita. Se prepara y transfiere la base completa.'
      : restoring ? restoreStage : backfillJob?.stage ?? 'Preparando archivos originales.';
  const downloadButton = backupReady ? (
    <Button className={ctaClass} disabled={busy} aria-busy={downloading} onClick={() => void saveBackup()}>
      {downloading ? <BusySpinner /> : null}
      {downloading ? 'Guardando respaldo…' : 'Descargar respaldo completo'}
    </Button>
  ) : (
    <Button className={ctaClass} disabled>
      Completa los originales para respaldar
    </Button>
  );
  const attention = health && (health.changedSinceBackup || health.loadsSinceBackup > 0);
  const initialLoading = loadingStatus || health === null;

  return (
    <Card
      aria-busy={busy || initialLoading}
      data-level={level}
      style={{ '--accent': tone.accent } as React.CSSProperties}
      className="min-w-0 grid-cols-1 border-l-[6px] border-l-(--accent) dark:border-l-(--accent)"
      aria-label="Respaldo y recuperación de la base"
    >
      <div role="status" className="flex flex-wrap items-center gap-x-5 gap-y-4 rounded-xl bg-[color-mix(in_oklab,var(--accent)_10%,transparent)] px-5 py-4">
        <div aria-hidden="true" className="grid size-11 shrink-0 place-items-center rounded-full bg-(--accent) text-white">
          {initialLoading ? <BusySpinner /> : level === 'ok' ? <Check className="size-6" strokeWidth={2.75} /> : <TriangleAlert className="size-6" strokeWidth={2.5} />}
        </div>
        <div className="min-w-0 flex-[1_1_18rem]">
          <div className="text-[0.7rem] font-extrabold uppercase tracking-[0.14em] text-ink-2 dark:text-[#8fa5c7]">Respaldo y recuperación</div>
          <h2 className="my-1 text-xl font-bold text-navy dark:text-white">{reminder?.title ?? 'Consultando el estado del respaldo…'}</h2>
          {reminder ? <div className="max-w-3xl text-sm leading-relaxed text-navy dark:text-[#d6e2f5]">{reminder.text}</div> : null}
        </div>
        {downloadButton}
      </div>

      {health ? (
        <dl className="m-0 grid grid-cols-[repeat(auto-fit,minmax(11rem,1fr))] gap-3">
          <Stat label="Último respaldo" value={formatStamp(health.lastBackupAt)} note={describeAge(health.daysSinceBackup)} />
          <Stat label="Última carga aplicada" value={health.lastLoadAt ? formatStamp(health.lastLoadAt) : 'Sin cargas'} note="importación más reciente" />
          <Stat
            attention={Boolean(attention)}
            label="Último cambio de datos"
            value={health.lastChangeAt ? formatStamp(health.lastChangeAt) : 'Sin cambios'}
            note={attention ? 'posterior al último respaldo' : 'ya incluido en el respaldo'}
          />
          <Stat
            attention={missingFiles > 0}
            label="Originales en SQLite"
            value={status ? `${status.embeddedFiles.toLocaleString('es-PY')} / ${status.totalFiles.toLocaleString('es-PY')}` : '—'}
            note={status ? `${formatBytes(status.embeddedBytes)} de ${formatBytes(status.totalBytes)}` : 'consultando…'}
          />
        </dl>
      ) : null}

      <div className="grid gap-2">
        <div className="flex flex-wrap items-center justify-end gap-2 max-[720px]:[&>*]:w-full max-[720px]:[&_button]:h-auto max-[720px]:[&_button]:min-h-10 max-[720px]:[&_button]:whitespace-normal">
          {missingFiles > 0 ? (
            <Button variant="outline" disabled={busy || loadingStatus} aria-busy={backfilling} onClick={() => void backfillOriginals()}>
              {backfilling ? <BusySpinner /> : null}
              {backfilling ? 'Incorporando originales…' : 'Incluir originales en SQLite'}
            </Button>
          ) : null}
          <Button variant="outline" disabled={busy} aria-busy={restoring} onClick={() => restoreInput.current?.click()}>
            {restoring ? <BusySpinner /> : null}
            {restoring ? 'Validando y restaurando…' : 'Restaurar respaldo SQLite'}
          </Button>
          {onClearImports ? (
            <Button
              variant="outline"
              className="border-brand/60 bg-[#fff0e6] text-[#8f3b00]! hover:bg-[#ffe4d2] dark:border-brand/50 dark:bg-brand/10 dark:text-brand! dark:hover:bg-brand/20"
              onClick={() => { setMessage(null); onClearImports(); }}
              disabled={clearingImports || busy}
              aria-busy={clearingImports}
              title="Quita todas las cargas importadas y sus datos derivados. Los originales quedan en el archivo recuperable."
            >
              {clearingImports ? <BusySpinner /> : null}
              {clearingImports ? 'Limpiando…' : 'Limpiar cargas'}
            </Button>
          ) : null}
        </div>
        <input
          ref={restoreInput}
          className="hidden"
          type="file"
          accept=".sqlite,.db,application/vnd.sqlite3,application/octet-stream"
          disabled={busy}
          onChange={(event) => {
            const file = event.currentTarget.files?.[0];
            event.currentTarget.value = '';
            void restoreBackup(file);
          }}
        />
        <div className={cn('text-right text-xs max-[720px]:text-left', mutedText)}>Máximo {MAX_RESTORE_LABEL}. La restauración sustituye toda la base y reinicia la Suite.</div>
      </div>

      {operationTitle ? <OperationStatus key={operationTitle} title={operationTitle} detail={operationDetail} progress={backfilling ? backfillJob?.progress : undefined} /> : null}
      {!busy && clearMessage && !message ? <Message tone={clearMessage.tone} text={clearMessage.text} /> : null}
      {!busy && message ? <Message tone={message.tone} text={message.text} /> : null}
    </Card>
  );
}

function formatDuration(milliseconds: number): string {
  const seconds = Math.floor(milliseconds / 1000);
  return seconds < 60 ? `${seconds} s` : `${Math.floor(seconds / 60)} min ${seconds % 60} s`;
}

function OperationStatus({ title, detail, progress }: { title: string; detail: string; progress?: number }) {
  const [startedAt] = useState(Date.now);
  const [elapsed, setElapsed] = useState(0);
  useEffect(() => {
    const timer = window.setInterval(() => setElapsed(Date.now() - startedAt), 1000);
    return () => window.clearInterval(timer);
  }, [startedAt]);
  return (
    <div className="grid gap-3 rounded-xl border border-sky/40 bg-sky/10 p-4 text-navy dark:text-white" role="status">
      <div className="flex items-center gap-2 font-semibold"><BusySpinner />{title}…</div>
      <div className="text-sm">{detail}</div>
      <progress className="h-2 w-full accent-sky" max={100} value={progress} aria-label={title} />
      <div className="text-xs" aria-live="off">Tiempo transcurrido: {formatDuration(elapsed)}{progress === undefined ? ' · El tiempo restante no está disponible.' : ` · ${Math.round(progress)}% completado.`}</div>
    </div>
  );
}

// ponytail: <div>/<dt>/<dd> y no <p>/<span>/<small>: el CSS heredado del tema claro (theme/01-mantenimiento.css) les pone color con más especificidad.
function Stat({ label, value, note, attention = false }: { label: string; value: string; note: string; attention?: boolean }) {
  return (
    <div className={cn('grid gap-1 rounded-xl border px-4 py-3', attention ? 'border-[#d92d20]' : 'border-navy/10 dark:border-sky/20')}>
      <dt className="m-0 text-[0.7rem] font-extrabold uppercase tracking-wider text-ink-2 dark:text-[#9fb2d1]">{label}</dt>
      <dd className="m-0 text-lg font-extrabold text-navy dark:text-white">{value}</dd>
      <div className={cn('text-[0.7rem]', mutedText)}>{note}</div>
    </div>
  );
}

function Message({ tone, text }: { tone: 'success' | 'error' | 'info'; text: string }) {
  return (
    <div
      role={tone === 'error' ? 'alert' : 'status'}
      className={cn(
        'rounded-xl border px-4 py-3 text-sm',
        tone === 'error'
          ? 'border-[#d92d20]/40 bg-[#d92d20]/10 text-[#912018] dark:text-[#ffb4ab]'
          : tone === 'info'
            ? 'border-navy/20 bg-sky/10 text-navy dark:text-white'
            : 'border-[#2f8f5b]/40 bg-[#2f8f5b]/10 text-[#14532d] dark:text-[#9be3b9]',
      )}
    >
      {text}
    </div>
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
