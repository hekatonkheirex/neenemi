import { useEffect, useRef, useState } from 'react';
import { Check, TriangleAlert } from 'lucide-react';
import { cn } from '../core/cn';
import { Button } from '../core/ui/button';
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
const plural = (n: number, one: string, many: string) => `${n.toLocaleString('es-PY')} ${n === 1 ? one : many}`;

// Colores de estado (no de marca): rojo = sin respaldar, ámbar = antiguo, verde = al día. El texto del CTA se elige por contraste.
const levelTone = {
  never: { accent: '#d92d20', ink: 'text-white' },
  pending: { accent: '#d92d20', ink: 'text-white' },
  stale: { accent: '#e08a00', ink: 'text-navy' },
  ok: { accent: '#2f8f5b', ink: 'text-white' },
  loading: { accent: '#6b7a90', ink: 'text-white' },
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
        : { title: 'Cambios sin respaldar', text: `${when} Hay datos agregados o editados desde entonces (modelos, viajes, ajustes). Genera uno nuevo para no perderlos.` };
    }
    case 'stale':
      return { title: `Último respaldo ${describeAge(health.daysSinceBackup)}`, text: 'Pasó una semana o más. Genera uno nuevo: viajes, proformas y ajustes manuales también cuentan.' };
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
  const level = health?.level ?? 'loading';
  const tone = levelTone[level];
  const ctaClass = cn('h-11 px-5 font-extrabold bg-(--accent) hover:brightness-110 hover:bg-(--accent)', tone.ink);
  const downloadButton = backupReady ? (
    <Button
      asChild
      className={ctaClass}
    >
      <a
        href="/api/system/backup"
        download
        onClick={() => { window.setTimeout(() => void refreshHealth().catch(() => undefined), 2500); }}
      >
        Descargar respaldo completo
      </a>
    </Button>
  ) : (
    <Button className={ctaClass} disabled>
      Completa los originales para respaldar
    </Button>
  );
  const attention = health && (health.changedSinceBackup || health.loadsSinceBackup > 0);
  const busy = restoring || backfilling;

  return (
    <section
      data-level={level}
      style={{ '--accent': tone.accent } as React.CSSProperties}
      className="grid gap-4 rounded-2xl border border-l-[6px] border-navy/10 border-l-(--accent) bg-white p-5 shadow-md dark:border-sky/20 dark:border-l-(--accent) dark:bg-panel"
      aria-label="Respaldo y recuperación de la base"
    >
      <div role="status" className="flex flex-wrap items-center gap-x-5 gap-y-4 rounded-xl bg-[color-mix(in_oklab,var(--accent)_10%,transparent)] px-5 py-4">
        <div aria-hidden="true" className="grid size-11 shrink-0 place-items-center rounded-full bg-(--accent) text-white">
          {level === 'ok' ? <Check className="size-6" strokeWidth={2.75} /> : <TriangleAlert className="size-6" strokeWidth={2.5} />}
        </div>
        <div className="min-w-0 flex-[1_1_18rem]">
          <div className="text-[0.7rem] font-extrabold uppercase tracking-[0.14em] text-ink-2 dark:text-[#8fa5c7]">Respaldo y recuperación</div>
          <h3 className="my-1 text-xl font-bold text-navy dark:text-white">{reminder?.title ?? 'Consultando el estado del respaldo…'}</h3>
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
        <div className="flex flex-wrap items-center justify-end gap-2 max-[720px]:[&>*]:w-full">
          {missingFiles > 0 ? (
            <Button variant="outline" disabled={backfilling || loadingStatus} onClick={() => void backfillOriginals()}>
              {backfilling ? `${backfillJob?.progress ?? 0}% · ${backfillJob?.stage ?? 'Preparando…'}` : 'Incluir originales en SQLite'}
            </Button>
          ) : null}
          <Button variant="outline" disabled={busy} onClick={() => restoreInput.current?.click()}>
            {restoring ? 'Validando y restaurando…' : 'Restaurar respaldo SQLite'}
          </Button>
          {onClearImports ? (
            <Button
              variant="outline"
              className="border-brand/60 bg-[#fff0e6] text-[#8f3b00] hover:bg-[#ffe4d2] dark:border-brand/50 dark:bg-brand/10 dark:text-brand dark:hover:bg-brand/20"
              onClick={onClearImports}
              disabled={clearingImports || busy}
              aria-busy={clearingImports}
              title="Quita todas las cargas importadas y sus datos derivados. Los originales quedan en el archivo recuperable."
            >
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
        <div className={cn('text-right text-xs max-[720px]:text-left', mutedText)}>Máximo 2 GB. La restauración sustituye toda la base y reinicia la Suite.</div>
      </div>

      {backfilling && backfillJob ? (
        <progress className="h-2 w-full accent-sky" max={100} value={backfillJob.progress} aria-label="Progreso de archivo" />
      ) : null}
      {clearMessage ? <Message tone={clearMessage.tone} text={clearMessage.text} /> : null}
      {message ? <Message tone={message.tone} text={message.text} /> : null}
    </section>
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

function Message({ tone, text }: { tone: 'success' | 'error'; text: string }) {
  return (
    <div
      role={tone === 'error' ? 'alert' : 'status'}
      className={cn(
        'rounded-xl border px-4 py-3 text-sm',
        tone === 'error'
          ? 'border-[#d92d20]/40 bg-[#d92d20]/10 text-[#912018] dark:text-[#ffb4ab]'
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
