import { describe, expect, it } from 'vitest';
import { backupBannerText, STALE_BACKUP_PHRASE } from './backupCopy';
import { describeReminder, type BackupHealth } from './DatabaseRecoveryPanel';

describe('backupBannerText', () => {
  it('has one sentence per warning level', () => {
    expect(backupBannerText('pending')).toBe('La base cambió desde el último respaldo.');
    expect(backupBannerText('never')).toBe('Hay información cargada y todavía no se generó un respaldo.');
  });

  it('says the same thing as the Configuración panel about a stale backup', () => {
    const health: BackupHealth = { lastBackupAt: '2026-09-20T12:00:00Z', lastLoadAt: null, lastChangeAt: null, loadsSinceBackup: 0, changedSinceBackup: false, daysSinceBackup: 17, level: 'stale' };
    expect(backupBannerText('stale')).toContain(STALE_BACKUP_PHRASE);
    expect(describeReminder(health).text).toContain(STALE_BACKUP_PHRASE);
  });
});
