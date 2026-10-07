import type { SuiteDatabase } from '../db/database';
import { SettingsRepository } from '../db/repositories';

export const BACKUP_SETTINGS_NAMESPACE = 'system';
export const LAST_BACKUP_KEY = 'last_backup_at';
export const LAST_CHANGE_KEY = 'last_change_at';
/** Días sin respaldo a partir de los cuales se recuerda hacer uno aunque no haya cargas nuevas. */
export const BACKUP_MAX_AGE_DAYS = 7;

export type BackupLevel = 'never' | 'pending' | 'stale' | 'ok';

export type BackupHealth = {
  lastBackupAt: string | null;
  lastLoadAt: string | null;
  /** Última modificación de datos por la API (altas, ediciones o bajas manuales, cargas incluidas). */
  lastChangeAt: string | null;
  loadsSinceBackup: number;
  changedSinceBackup: boolean;
  daysSinceBackup: number | null;
  level: BackupLevel;
};

type Input = { lastBackupAt: string | null; lastLoadAt: string | null; lastChangeAt?: string | null; loadsSinceBackup: number; now: Date };

const DAY_MS = 86_400_000;

/** Pura: decide el aviso. Nunca respaldó > cargas sin respaldar > respaldo viejo > al día. */
export function assessBackup({ lastBackupAt, lastLoadAt, lastChangeAt = null, loadsSinceBackup, now }: Input): BackupHealth {
  const backupTime = lastBackupAt ? Date.parse(lastBackupAt) : NaN;
  const daysSinceBackup = Number.isNaN(backupTime) ? null : Math.max(0, Math.floor((now.getTime() - backupTime) / DAY_MS));
  const changeTime = lastChangeAt ? Date.parse(lastChangeAt) : NaN;
  const changedSinceBackup = !Number.isNaN(changeTime) && (Number.isNaN(backupTime) || changeTime > backupTime);
  const level: BackupLevel = daysSinceBackup === null
    ? 'never'
    : loadsSinceBackup > 0 || changedSinceBackup
      ? 'pending'
      : daysSinceBackup >= BACKUP_MAX_AGE_DAYS
        ? 'stale'
        : 'ok';
  return { lastBackupAt: daysSinceBackup === null ? null : lastBackupAt, lastLoadAt, lastChangeAt, loadsSinceBackup, changedSinceBackup, daysSinceBackup, level };
}

export function readBackupHealth(database: SuiteDatabase, now = new Date()): BackupHealth {
  const settings = new SettingsRepository(database);
  const lastBackupAt = settings.get<string | null>(BACKUP_SETTINGS_NAMESPACE, LAST_BACKUP_KEY, null);
  const lastChangeAt = settings.get<string | null>(BACKUP_SETTINGS_NAMESPACE, LAST_CHANGE_KEY, null);
  const row = database
    .prepare(`
      SELECT
        MAX(applied_at) AS last_load_at,
        SUM(CASE WHEN ? IS NULL OR applied_at > ? THEN 1 ELSE 0 END) AS since
      FROM import_batches
      WHERE status = 'applied' AND applied_at IS NOT NULL
    `)
    .get(lastBackupAt, lastBackupAt) as { last_load_at: string | null; since: number | null };
  return assessBackup({ lastBackupAt, lastLoadAt: row.last_load_at, lastChangeAt, loadsSinceBackup: row.since ?? 0, now });
}

export function recordBackup(database: SuiteDatabase, at = new Date()): void {
  new SettingsRepository(database).set(BACKUP_SETTINGS_NAMESPACE, LAST_BACKUP_KEY, at.toISOString());
}

/** Marca el momento de la última modificación de datos. */
export function recordChange(database: SuiteDatabase, at = new Date()): void {
  new SettingsRepository(database).set(BACKUP_SETTINGS_NAMESPACE, LAST_CHANGE_KEY, at.toISOString());
}

/** Solicitudes que modifican datos respaldables; no consultas POST, IA ni operaciones de respaldo. */
export function isDataChange(method: string, urlPath: string): boolean {
  if (!['POST', 'PUT', 'PATCH', 'DELETE'].includes(method.toUpperCase())) return false;
  if (!urlPath.startsWith('/api/')) return false;
  // Tracking consulta servicios externos mediante POST sin modificar la base.
  if (method.toUpperCase() === 'POST' && /^\/api\/tracking\/(?:route|geocode)\/?$/i.test(urlPath)) return false;
  return !/^\/api\/(ai\/|system\/(restore|backup|import-originals))/.test(urlPath);
}
