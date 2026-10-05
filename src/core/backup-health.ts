import type { SuiteDatabase } from '../db/database';
import { SettingsRepository } from '../db/repositories';

export const BACKUP_SETTINGS_NAMESPACE = 'system';
export const LAST_BACKUP_KEY = 'last_backup_at';
/** Días sin respaldo a partir de los cuales se recuerda hacer uno aunque no haya cargas nuevas. */
export const BACKUP_MAX_AGE_DAYS = 7;

export type BackupLevel = 'never' | 'pending' | 'stale' | 'ok';

export type BackupHealth = {
  lastBackupAt: string | null;
  lastLoadAt: string | null;
  loadsSinceBackup: number;
  daysSinceBackup: number | null;
  level: BackupLevel;
};

type Input = { lastBackupAt: string | null; lastLoadAt: string | null; loadsSinceBackup: number; now: Date };

const DAY_MS = 86_400_000;

/** Pura: decide el aviso. Nunca respaldó > cargas sin respaldar > respaldo viejo > al día. */
export function assessBackup({ lastBackupAt, lastLoadAt, loadsSinceBackup, now }: Input): BackupHealth {
  const backupTime = lastBackupAt ? Date.parse(lastBackupAt) : NaN;
  const daysSinceBackup = Number.isNaN(backupTime) ? null : Math.max(0, Math.floor((now.getTime() - backupTime) / DAY_MS));
  const level: BackupLevel = daysSinceBackup === null
    ? 'never'
    : loadsSinceBackup > 0
      ? 'pending'
      : daysSinceBackup >= BACKUP_MAX_AGE_DAYS
        ? 'stale'
        : 'ok';
  return { lastBackupAt: daysSinceBackup === null ? null : lastBackupAt, lastLoadAt, loadsSinceBackup, daysSinceBackup, level };
}

export function readBackupHealth(database: SuiteDatabase, now = new Date()): BackupHealth {
  const lastBackupAt = new SettingsRepository(database).get<string | null>(BACKUP_SETTINGS_NAMESPACE, LAST_BACKUP_KEY, null);
  const row = database
    .prepare(`
      SELECT
        MAX(applied_at) AS last_load_at,
        SUM(CASE WHEN ? IS NULL OR applied_at > ? THEN 1 ELSE 0 END) AS since
      FROM import_batches
      WHERE status = 'applied' AND applied_at IS NOT NULL
    `)
    .get(lastBackupAt, lastBackupAt) as { last_load_at: string | null; since: number | null };
  return assessBackup({ lastBackupAt, lastLoadAt: row.last_load_at, loadsSinceBackup: row.since ?? 0, now });
}

export function recordBackup(database: SuiteDatabase, at = new Date()): void {
  new SettingsRepository(database).set(BACKUP_SETTINGS_NAMESPACE, LAST_BACKUP_KEY, at.toISOString());
}
