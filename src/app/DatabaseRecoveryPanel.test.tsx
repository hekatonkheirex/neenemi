import { renderToStaticMarkup } from 'react-dom/server';
import { describe, expect, it } from 'vitest';
import DatabaseRecoveryPanel, { canBackup, describeReminder, type BackupHealth } from './DatabaseRecoveryPanel';

const health = (over: Partial<BackupHealth>): BackupHealth => ({
  lastBackupAt: '2026-10-06T12:00:00Z', lastLoadAt: null, lastChangeAt: null,
  loadsSinceBackup: 0, changedSinceBackup: false, daysSinceBackup: 0, level: 'ok', ...over,
});

describe('describeReminder', () => {
  it('sin respaldo pide descargar uno', () => {
    expect(describeReminder(health({ level: 'never', lastBackupAt: null, daysSinceBackup: null })).title).toBe('Todavía no hay ningún respaldo');
  });

  it('cuenta las cargas sin respaldar en singular y plural', () => {
    expect(describeReminder(health({ level: 'pending', loadsSinceBackup: 1 })).title).toBe('1 carga sin respaldar');
    expect(describeReminder(health({ level: 'pending', loadsSinceBackup: 3 })).title).toBe('3 cargas sin respaldar');
  });

  it('cambios sin cargas, respaldo antiguo y al día tienen textos distintos', () => {
    expect(describeReminder(health({ level: 'pending' })).title).toBe('Base modificada desde el último respaldo');
    expect(describeReminder(health({ level: 'stale', daysSinceBackup: 9 })).title).toBe('Último respaldo hace 9 días');
    expect(describeReminder(health({ level: 'ok' })).title).toBe('Información respaldada');
  });
});

describe('DatabaseRecoveryPanel (estado inicial)', () => {
  const markup = renderToStaticMarkup(<DatabaseRecoveryPanel refreshKey={0} onClearImports={() => {}} />);

  it('anuncia la consulta en curso y deshabilita el respaldo hasta conocer los originales', () => {
    expect(markup).toContain('aria-label="Respaldo y recuperación de la base"');
    expect(markup).toContain('data-level="loading"');
    expect(markup).toContain('role="status"');
    expect(markup).toContain('Consultando el estado del respaldo…');
    expect(markup).toMatch(/<button[^>]*disabled[^>]*>Completa los originales para respaldar<\/button>/);
  });

  it('ofrece restaurar y limpiar cargas, con el selector de archivo oculto', () => {
    expect(markup).toContain('Restaurar respaldo SQLite');
    expect(markup).toContain('Limpiar cargas');
    expect(markup).toMatch(/<input[^>]*class="hidden"[^>]*type="file"|<input[^>]*type="file"[^>]*class="hidden"/);
  });

  it('usa tokens de marca y sin clases heredadas del panel', () => {
    expect(markup).not.toMatch(/database-recovery|backup-banner|database-backup-cta|global-clear-button/);
    expect(markup).toContain('dark:bg-panel');
  });
});

describe('canBackup', () => {
  it('espera mientras consulta los originales', () => {
    expect(canBackup(null, true)).toBe(false);
  });

  it('bloquea si faltan originales y permite si están completos', () => {
    expect(canBackup({ missingFiles: 2 }, false)).toBe(false);
    expect(canBackup({ missingFiles: 0 }, false)).toBe(true);
  });

  it('permite respaldar si la consulta de originales falló', () => {
    expect(canBackup(null, false)).toBe(true);
  });
});
